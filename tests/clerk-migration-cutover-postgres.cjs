const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { Client } = require('pg');

const connectionString = process.env.CAISSA_IDENTITY_MIGRATION_REHEARSAL_DATABASE_URL;
if (!connectionString) throw new Error('rehearsal database URL required');
const userId = '00000000-0000-4000-8000-00000000000e';
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const client = () => new Client({ connectionString, application_name: 'caissa-cutover-tooling-postgres-test' });
const checks = [];
const check = (name, fn) => checks.push([name, fn]);

async function service(db, sql, params = []) {
  await db.query('BEGIN');
  try {
    await db.query('SET LOCAL ROLE service_role');
    const result = await db.query(sql, params);
    await db.query('COMMIT');
    return result;
  } catch (error) { await db.query('ROLLBACK'); throw error; }
}

async function preview(db, target, confirmation, reason = 'Approved synthetic manual recovery evidence') {
  return service(db, `select * from public.preview_manual_clerk_identity_recovery($1,$2,$3,$4,now()+interval '10 minutes')`, [userId, target, reason, hash(confirmation)]);
}

check('fixture uses one synthetic UUID with owned economic and library data', async db => {
  await db.query(`delete from public.users where id=$1`, [userId]);
  await db.query(`insert into public.users(id,clerk_id,role,is_premium,credits,stripe_customer_id) values($1,'LEGACY_RECOVERY','member',true,77,'SYNTHETIC_RECOVERY_CUSTOMER')`, [userId]);
  await db.query(`insert into public.identity_bindings(user_id,environment,external_subject,status,proof_method,activated_at) values($1,'legacy_development','LEGACY_RECOVERY','ACTIVE','LEGACY_BACKFILL',now())`, [userId]);
  await db.query(`insert into public.credit_events(user_id,action,delta,balance_after) values($1,'RECOVERY_FIXTURE',77,77)`, [userId]);
  await db.query(`insert into public.library_collections(user_id,local_id,name) values($1,'RECOVERY_COLLECTION','Recovery fixture')`, [userId]);
  assert.equal((await db.query(`select count(*)::int n from public.users where id=$1`, [userId])).rows[0].n, 1);
});

check('default-off public routes make zero PostgreSQL mutations', async db => {
  const { createChallengeHandler } = await import('../api/user/identity-migration/challenge.js');
  const { createActivationHandler } = await import('../api/user/identity-migration/activate.js');
  const snapshot = async () => (await db.query(`select
    (select count(*)::int from public.users) users,
    (select count(*)::int from public.identity_bindings) bindings,
    (select count(*)::int from public.identity_migration_challenges) challenges,
    (select count(*)::int from public.identity_migration_throttles) throttle,
    (select count(*)::int from public.identity_migration_audit) audit`)).rows[0];
  const before = await snapshot();
  let databaseCalls = 0;
  const dependencies = {
    env: { CAISSA_IDENTITY_MIGRATION_MODE: 'true' },
    getSupabase: () => { databaseCalls += 1; throw new Error('database access must remain unreachable'); }
  };
  const request = body => ({ method: 'POST', headers: { 'content-type': 'application/json' }, body });
  const response = () => ({
    statusCode: 0, body: null,
    setHeader() {},
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  });
  for (const [factory, body] of [[createChallengeHandler, {}], [createActivationHandler, { challengeToken: 'synthetic' }]]) {
    const res = response();
    await factory(dependencies)(request(body), res);
    assert.equal(res.statusCode, 404);
    assert.deepEqual(res.body, { error: 'Not found' });
  }
  assert.equal(databaseCalls, 0);
  assert.deepEqual(await snapshot(), before);
});

check('persistent database throttle permits five attempts and denies sixth', async db => {
  const scope = hash(`throttle-${Date.now()}`);
  const results = [];
  for (let index = 0; index < 6; index += 1) {
    results.push((await service(db, `select * from public.consume_identity_migration_throttle($1,5,600)`, [scope])).rows[0]);
  }
  assert.equal(results.filter(row => row.allowed).length, 5);
  assert.equal(results[5].allowed, false);
  assert.ok(results[5].retry_after_seconds > 0);
});

check('ordinary roles cannot inspect or invoke recovery operations', async db => {
  for (const role of ['anon', 'authenticated']) {
    await db.query('BEGIN'); await db.query(`SET LOCAL ROLE ${role}`);
    await assert.rejects(db.query(`select * from public.identity_manual_recovery_previews`), /permission denied/i);
    await db.query('ROLLBACK');
    await db.query('BEGIN'); await db.query(`SET LOCAL ROLE ${role}`);
    await assert.rejects(db.query(`select * from public.preview_manual_clerk_identity_recovery($1,$2,$3,$4,now()+interval '10 minutes')`, [userId, 'PROD_X', 'Unauthorized recovery attempt evidence', hash('x')]), /permission denied/i);
    await db.query('ROLLBACK');
  }
});

check('preview detects target collisions without account mutation', async db => {
  const result = await preview(db, 'PROD_COLLISION', `RECOVER ${userId}`);
  assert.equal(result.rows[0].code, 'TARGET_SUBJECT_ALREADY_BOUND');
  assert.equal((await db.query(`select clerk_id from public.users where id=$1`, [userId])).rows[0].clerk_id, 'LEGACY_RECOVERY');
});

check('preview records locked state and redacted hashes', async db => {
  const result = await preview(db, 'PROD_RECOVERY_STALE', `RECOVER ${userId}`);
  assert.equal(result.rows[0].success, true);
  const row = (await db.query(`select * from public.identity_manual_recovery_previews where id=$1`, [result.rows[0].preview_id])).rows[0];
  assert.equal(row.target_subject_hash, hash('PROD_RECOVERY_STALE'));
  assert.equal(row.confirmation_hash, hash(`RECOVER ${userId}`));
  assert.equal(JSON.stringify(row).includes('PROD_RECOVERY_STALE'), false);
});

check('stale preview is rejected after binding state changes', async db => {
  const previewRow = (await db.query(`select id from public.identity_manual_recovery_previews where user_id=$1 and status='PENDING'`, [userId])).rows[0];
  await db.query(`update public.identity_bindings set external_subject='LEGACY_RECOVERY_CHANGED' where user_id=$1 and environment='legacy_development' and status='ACTIVE'`, [userId]);
  const result = await service(db, `select * from public.execute_manual_clerk_identity_recovery($1,$2,$3,$4,$5)`, [previewRow.id, userId, 'PROD_RECOVERY_STALE', 'Approved synthetic manual recovery evidence', hash(`RECOVER ${userId}`)]);
  assert.equal(result.rows[0].code, 'RECOVERY_STATE_CHANGED');
  await db.query(`update public.identity_bindings set external_subject='LEGACY_RECOVERY' where user_id=$1 and environment='legacy_development' and status='ACTIVE'`, [userId]);
});

check('manual recovery executes atomically and preserves owned data', async db => {
  const reason = 'Approved synthetic recovery execution evidence';
  const confirmation = `RECOVER ${userId}`;
  const made = await preview(db, 'PROD_RECOVERY', confirmation, reason);
  assert.equal(made.rows[0].success, true);
  const result = await service(db, `select * from public.execute_manual_clerk_identity_recovery($1,$2,$3,$4,$5)`, [made.rows[0].preview_id, userId, 'PROD_RECOVERY', reason, hash(confirmation)]);
  assert.equal(result.rows[0].success, true);
  const state = (await db.query(`select id,clerk_id,credits,is_premium,role,stripe_customer_id,
    (select count(*)::int from public.credit_events where user_id=$1) credit_events,
    (select count(*)::int from public.library_collections where user_id=$1) collections
    from public.users where id=$1`, [userId])).rows[0];
  assert.deepEqual(state, { id: userId, clerk_id: 'PROD_RECOVERY', credits: 77, is_premium: true, role: 'member', stripe_customer_id: 'SYNTHETIC_RECOVERY_CUSTOMER', credit_events: 1, collections: 1 });
});

check('recovery preview cannot be replayed', async db => {
  const used = (await db.query(`select id from public.identity_manual_recovery_previews where user_id=$1 and status='EXECUTED' order by executed_at desc limit 1`, [userId])).rows[0];
  const result = await service(db, `select * from public.execute_manual_clerk_identity_recovery($1,$2,$3,$4,$5)`, [used.id, userId, 'PROD_RECOVERY', 'Approved synthetic recovery execution evidence', hash(`RECOVER ${userId}`)]);
  assert.equal(result.rows[0].code, 'RECOVERY_PREVIEW_INVALID_OR_USED');
});

check('unconfirmed rollback is unavailable and wrong confirmation fails', async db => {
  await assert.rejects(service(db, `select * from public.rollback_clerk_identity_binding($1,$2)`, [userId, 'Attempt old unconfirmed rollback evidence']), /permission denied/i);
  const wrong = await service(db, `select * from public.rollback_clerk_identity_binding_confirmed($1,$2,$3)`, [userId, 'Attempt wrong confirmed rollback evidence', 'ROLLBACK wrong']);
  assert.equal(wrong.rows[0].code, 'ROLLBACK_CONFIRMATION_REQUIRED');
});

check('confirmed rollback restores the same UUID and economic state', async db => {
  const result = await service(db, `select * from public.rollback_clerk_identity_binding_confirmed($1,$2,$3)`, [userId, 'Approved synthetic confirmed rollback evidence', `ROLLBACK ${userId}`]);
  assert.equal(result.rows[0].success, true);
  const state = (await db.query(`select id,clerk_id,credits,is_premium,role,stripe_customer_id from public.users where id=$1`, [userId])).rows[0];
  assert.deepEqual(state, { id: userId, clerk_id: 'LEGACY_RECOVERY', credits: 77, is_premium: true, role: 'member', stripe_customer_id: 'SYNTHETIC_RECOVERY_CUSTOMER' });
});

check('audit is append-only and contains preview, execute, and rollback evidence', async db => {
  const actions = (await db.query(`select action from public.identity_migration_audit where user_id=$1`, [userId])).rows.map(row => row.action);
  assert.ok(actions.includes('MANUAL_RECOVERY_PREVIEW_CREATED'));
  assert.ok(actions.includes('MANUAL_RECOVERY_EXECUTED'));
  assert.ok(actions.includes('MANUAL_RECOVERY_ROLLBACK_CONFIRMED'));
  await assert.rejects(db.query(`update public.identity_migration_audit set reason='tampered' where user_id=$1`, [userId]), /append-only/i);
  await assert.rejects(db.query(`delete from public.identity_migration_audit where user_id=$1`, [userId]), /append-only/i);
});

check('two concurrent executions produce exactly one success', async db => {
  const reason = 'Approved concurrent recovery execution evidence';
  const confirmation = `RECOVER ${userId}`;
  const made = await preview(db, 'PROD_RECOVERY_CONCURRENT', confirmation, reason);
  const c1 = client(); const c2 = client(); await Promise.all([c1.connect(), c2.connect()]);
  try {
    const results = await Promise.all([c1, c2].map(db2 => service(db2, `select * from public.execute_manual_clerk_identity_recovery($1,$2,$3,$4,$5)`, [made.rows[0].preview_id, userId, 'PROD_RECOVERY_CONCURRENT', reason, hash(confirmation)])));
    assert.equal(results.filter(result => result.rows[0].success).length, 1);
  } finally { await Promise.all([c1.end(), c2.end()]); }
  await service(db, `select * from public.rollback_clerk_identity_binding_confirmed($1,$2,$3)`, [userId, 'Approved concurrent recovery rollback evidence', `ROLLBACK ${userId}`]);
});

(async()=>{const db=client();await db.connect();let passed=0;try{for(const[name,fn]of checks){await fn(db);passed++;console.log(`PASS ${name}`)}}finally{await db.end()}console.log(`Cutover PostgreSQL rehearsal: ${passed}/${checks.length} passed`)})().catch(error=>{console.error(`FAIL SQLSTATE=${error.code||'assertion'} MESSAGE=${error.message}`);process.exit(1)});
