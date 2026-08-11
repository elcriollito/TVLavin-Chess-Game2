const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { Client } = require('pg');

const connectionString = process.env.CAISSA_IDENTITY_MIGRATION_REHEARSAL_DATABASE_URL;
if (!connectionString) throw new Error('CAISSA_IDENTITY_MIGRATION_REHEARSAL_DATABASE_URL is required');

const ids = {
  a: '00000000-0000-4000-8000-00000000000a',
  b: '00000000-0000-4000-8000-00000000000b',
  c: '00000000-0000-4000-8000-00000000000c',
  d: '00000000-0000-4000-8000-00000000000d'
};
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const checks = [];
const check = (name, fn) => checks.push([name, fn]);
const client = () => new Client({ connectionString, application_name: 'caissa-sec005-rehearsal-test' });

async function asService(db, sql, params = []) {
  await db.query('BEGIN');
  try {
    await db.query('SET LOCAL ROLE service_role');
    const result = await db.query(sql, params);
    await db.query('COMMIT');
    return result;
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  }
}

async function challenge(db, userId, legacy, target, token, proof = 'DUAL_AUTH') {
  return asService(db,
    `select * from public.create_clerk_migration_challenge($1,$2,$3,$4,now()+interval '10 minutes',$5)`,
    [userId, legacy, target, hash(token), proof]);
}

function supabaseAdapter(db, failRpc = false) {
  return {
    async rpc(name, params) {
      if (failRpc) return { data: null, error: new Error('synthetic resolver failure') };
      const signatures = {
        resolve_clerk_identity_for_sync: [`select * from public.resolve_clerk_identity_for_sync($1)`, [params.p_external_subject]],
        provision_approved_clerk_identity: [`select * from public.provision_approved_clerk_identity($1,$2)`, [params.p_external_subject, params.p_email]]
      };
      try {
        const [sql, values] = signatures[name];
        const result = await asService(db, sql, values);
        return { data: result.rows, error: null };
      } catch (error) { return { data: null, error }; }
    },
    from(table) {
      assert.equal(table, 'users');
      return {
        update(values) {
          const filters = [];
          const chain = {
            eq(column, value) { filters.push([column, value]); return chain; },
            select() { return chain; },
            async single() {
              const id = filters.find(([column]) => column === 'id')?.[1];
              const subject = filters.find(([column]) => column === 'clerk_id')?.[1];
              const result = await db.query(`update public.users set email=$1,updated_at=$2 where id=$3 and clerk_id=$4 returning clerk_id,email,role,is_premium,credits`, [values.email, values.updated_at, id, subject]);
              return result.rowCount === 1 ? { data: result.rows[0], error: null } : { data: null, error: new Error('not found') };
            }
          };
          return chain;
        }
      };
    }
  };
}

check('synthetic fixtures and legacy backfill', async db => {
  await db.query(`truncate public.identity_migration_audit, public.identity_migration_challenges,
    public.identity_enrollment_decisions, public.identity_bindings, public.library_sync_log,
    public.library_positions, public.library_collections, public.credit_events, public.users cascade`);
  await db.query(`insert into public.users(id,clerk_id,email,role,is_premium,credits,stripe_customer_id) values
    ($1,'LEGACY_A',null,'member',true,50,'SYNTHETIC_CUSTOMER_A'),
    ($2,'LEGACY_B','free-user@invalid.example','member',false,3,null),
    ($3,'LEGACY_C','collision@invalid.example','member',false,5,null),
    ($4,'LEGACY_D',null,'member',false,1,null)`, [ids.a, ids.b, ids.c, ids.d]);
  await db.query(`insert into public.credit_events(user_id,action,delta,balance_after) values($1,'SYNTHETIC_FIXTURE',50,50)` ,[ids.a]);
  await db.query(`insert into public.library_collections(user_id,local_id,name) values($1,'COLL_A','Synthetic')`, [ids.a]);
  await db.query(`insert into public.library_positions(user_id,local_id,fen,title) values($1,'POS_A','8/8/8/8/8/8/8/K6k w - - 0 1','Synthetic')`, [ids.a]);
  await db.query(`insert into public.library_sync_log(user_id,action,item_type,item_count) values($1,'SYNTHETIC_FIXTURE','position',1)`, [ids.a]);
  await db.query(`insert into public.identity_bindings(user_id,environment,external_subject,status,proof_method,activated_at)
    select id,'legacy_development',clerk_id,'ACTIVE','LEGACY_BACKFILL',now() from public.users`);
  await db.query(`insert into public.identity_bindings(user_id,environment,external_subject,status,proof_method,activated_at)
    values($1,'production','PROD_COLLISION','ACTIVE','NEW_ACCOUNT',now())`, [ids.c]);
  const result = await db.query(`select (select count(*)::int from public.users) users,
    (select count(*)::int from public.identity_bindings where environment='legacy_development') legacy,
    (select count(*)::int from public.credit_events where user_id=$1) credits,
    (select count(*)::int from public.library_collections where user_id=$1) collections,
    (select count(*)::int from public.library_positions where user_id=$1) positions`, [ids.a]);
  assert.deepEqual(result.rows[0], { users: 4, legacy: 4, credits: 1, collections: 1, positions: 1 });
});

check('binding uniqueness and state constraints', async db => {
  await assert.rejects(db.query(`insert into public.identity_bindings(user_id,environment,external_subject,status,proof_method) values($1,'legacy_development','LEGACY_A','ACTIVE','LEGACY_BACKFILL')`, [ids.b]), /duplicate key/i);
  await assert.rejects(db.query(`insert into public.identity_bindings(user_id,environment,external_subject,status,proof_method) values($1,'invalid','X','ACTIVE','LEGACY_BACKFILL')`, [ids.b]), /check constraint/i);
  await assert.rejects(db.query(`insert into public.identity_bindings(user_id,environment,external_subject,status,proof_method) values($1,'production','PROD_C_2','ACTIVE','NEW_ACCOUNT')`, [ids.c]), /duplicate key/i);
});

check('challenge stores hash, expiry, and purpose but not plaintext', async db => {
  const token = 'synthetic-token-a';
  const made = await challenge(db, ids.a, 'LEGACY_A', 'PROD_A', token);
  assert.equal(made.rows[0].success, true);
  const stored = await db.query(`select token_hash, expected_new_subject_hash, status, expires_at>created_at expiry, proof_method from public.identity_migration_challenges where id=$1`, [made.rows[0].challenge_id]);
  assert.equal(stored.rows[0].token_hash, hash(token));
  assert.notEqual(stored.rows[0].token_hash, token);
  assert.equal(stored.rows[0].expected_new_subject_hash, hash('PROD_A'));
  assert.deepEqual({ status: stored.rows[0].status, expiry: stored.rows[0].expiry, proof: stored.rows[0].proof_method }, { status: 'PENDING', expiry: true, proof: 'DUAL_AUTH' });
});

check('wrong user cannot create a challenge', async db => {
  const result = await challenge(db, ids.b, 'LEGACY_A', 'PROD_FORGED', 'wrong-user-token');
  assert.deepEqual(result.rows[0], { success: false, code: 'LEGACY_BINDING_NOT_ACTIVE', challenge_id: null });
});

check('modified token and wrong production identity are denied without mutation', async db => {
  const modified = await asService(db, `select * from public.activate_clerk_identity_binding($1,$2)`, [hash('modified'), 'PROD_A']);
  assert.equal(modified.rows[0].success, false);
  const pending = await db.query(`select count(*)::int n from public.identity_migration_challenges where user_id=$1 and status='PENDING'`, [ids.a]);
  assert.equal(pending.rows[0].n, 1);
  const wrong = await asService(db, `select * from public.activate_clerk_identity_binding($1,$2)`, [hash('synthetic-token-a'), 'PROD_WRONG']);
  assert.equal(wrong.rows[0].code, 'NEW_SUBJECT_MISMATCH');
  const user = await db.query(`select clerk_id from public.users where id=$1`, [ids.a]);
  assert.equal(user.rows[0].clerk_id, 'LEGACY_A');
});

check('expired challenge is denied without account mutation', async db => {
  await db.query(`insert into public.identity_migration_challenges(user_id,legacy_binding_id,token_hash,expected_new_subject_hash,proof_method,created_at,expires_at)
    select $1,id,$2,$3,'DUAL_AUTH',now()-interval '2 minutes',now()-interval '1 minute' from public.identity_bindings where user_id=$1 and environment='legacy_development'`, [ids.d, hash('expired-token'), hash('PROD_D')]);
  const result = await asService(db, `select * from public.activate_clerk_identity_binding($1,$2)`, [hash('expired-token'), 'PROD_D']);
  assert.equal(result.rows[0].code, 'CHALLENGE_EXPIRED');
  const state = await db.query(`select clerk_id from public.users where id=$1`, [ids.d]);
  assert.equal(state.rows[0].clerk_id, 'LEGACY_D');
});

check('happy-path remap preserves UUID, economics, Stripe, and children', async db => {
  const before = await db.query(`select id,credits,is_premium,role,stripe_customer_id from public.users where id=$1`, [ids.a]);
  const result = await asService(db, `select * from public.activate_clerk_identity_binding($1,$2)`, [hash('synthetic-token-a'), 'PROD_A']);
  assert.equal(result.rows[0].success, true);
  assert.equal(result.rows[0].user_id, ids.a);
  const after = await db.query(`select id,clerk_id,credits,is_premium,role,stripe_customer_id from public.users where id=$1`, [ids.a]);
  assert.deepEqual({ id: after.rows[0].id, credits: after.rows[0].credits, is_premium: after.rows[0].is_premium, role: after.rows[0].role, stripe_customer_id: after.rows[0].stripe_customer_id }, before.rows[0]);
  assert.equal(after.rows[0].clerk_id, 'PROD_A');
  const children = await db.query(`select
    (select count(*)::int from public.credit_events where user_id=$1) credit_events,
    (select count(*)::int from public.library_collections where user_id=$1) collections,
    (select count(*)::int from public.library_positions where user_id=$1) positions,
    (select count(*)::int from public.library_sync_log where user_id=$1) sync_log,
    (select count(*)::int from public.users where id=$1) users`, [ids.a]);
  assert.deepEqual(children.rows[0], { credit_events: 1, collections: 1, positions: 1, sync_log: 1, users: 1 });
});

check('challenge replay is denied', async db => {
  const result = await asService(db, `select * from public.activate_clerk_identity_binding($1,$2)`, [hash('synthetic-token-a'), 'PROD_A']);
  assert.equal(result.rows[0].code, 'CHALLENGE_INVALID_OR_USED');
});

check('duplicate production target fails atomically', async db => {
  const made = await challenge(db, ids.b, 'LEGACY_B', 'PROD_COLLISION', 'collision-token');
  assert.equal(made.rows[0].success, true);
  const result = await asService(db, `select * from public.activate_clerk_identity_binding($1,$2)`, [hash('collision-token'), 'PROD_COLLISION']);
  assert.equal(result.rows[0].code, 'TARGET_SUBJECT_ALREADY_BOUND');
  const state = await db.query(`select
    (select clerk_id from public.users where id=$1) b_subject,
    (select clerk_id from public.users where id=$2) c_subject,
    (select count(*)::int from public.identity_bindings where user_id=$1 and environment='production') b_prod`, [ids.b, ids.c]);
  assert.deepEqual(state.rows[0], { b_subject: 'LEGACY_B', c_subject: 'LEGACY_C', b_prod: 0 });
});

check('two concurrent activations produce exactly one success', async db => {
  await db.query(`update public.identity_migration_challenges set status='REVOKED' where user_id=$1 and status='CONFLICT'`, [ids.b]);
  const made = await challenge(db, ids.b, 'LEGACY_B', 'PROD_B', 'concurrent-token');
  assert.equal(made.rows[0].success, true);
  const c1 = client(); const c2 = client(); await Promise.all([c1.connect(), c2.connect()]);
  try {
    const results = await Promise.all([c1, c2].map(c => asService(c, `select * from public.activate_clerk_identity_binding($1,$2)`, [hash('concurrent-token'), 'PROD_B'])));
    assert.equal(results.filter(r => r.rows[0].success).length, 1);
    assert.equal(results.filter(r => !r.rows[0].success).length, 1);
  } finally { await Promise.all([c1.end(), c2.end()]); }
  const state = await db.query(`select
    (select count(*)::int from public.users where id=$1) users,
    (select count(*)::int from public.identity_bindings where user_id=$1 and environment='production' and status='ACTIVE') active_prod,
    (select count(*)::int from public.identity_migration_challenges where id=$2 and status='USED') used`, [ids.b, made.rows[0].challenge_id]);
  assert.deepEqual(state.rows[0], { users: 1, active_prod: 1, used: 1 });
});

check('service rollback restores legacy identity and preserves state', async db => {
  const before = await db.query(`select id,credits,is_premium,role,stripe_customer_id from public.users where id=$1`, [ids.a]);
  const result = await asService(db, `select * from public.rollback_clerk_identity_binding($1,$2)`, [ids.a, 'Synthetic rehearsal rollback']);
  assert.equal(result.rows[0].success, true);
  const after = await db.query(`select id,clerk_id,credits,is_premium,role,stripe_customer_id from public.users where id=$1`, [ids.a]);
  assert.equal(after.rows[0].clerk_id, 'LEGACY_A');
  assert.deepEqual({ id: after.rows[0].id, credits: after.rows[0].credits, is_premium: after.rows[0].is_premium, role: after.rows[0].role, stripe_customer_id: after.rows[0].stripe_customer_id }, before.rows[0]);
});

check('anon and authenticated cannot read tables or execute privileged RPCs', async db => {
  for (const role of ['anon', 'authenticated']) {
    await db.query('BEGIN');
    try {
      await db.query(`SET LOCAL ROLE ${role}`);
      await assert.rejects(db.query(`select * from public.identity_migration_challenges`), /permission denied/i);
      await db.query('ROLLBACK');
    } catch (error) { await db.query('ROLLBACK'); throw error; }
    await db.query('BEGIN');
    try {
      await db.query(`SET LOCAL ROLE ${role}`);
      await assert.rejects(db.query(`select * from public.rollback_clerk_identity_binding($1,$2)`, [ids.b, 'Unauthorized rollback attempt']), /permission denied/i);
      await db.query('ROLLBACK');
    } catch (error) { await db.query('ROLLBACK'); throw error; }
  }
});

check('audit insertion failure rolls activation back atomically', async db => {
  await asService(db, `select * from public.rollback_clerk_identity_binding($1,$2)`, [ids.b, 'Prepare audit failure rehearsal']);
  const made = await challenge(db, ids.b, 'LEGACY_B', 'PROD_B_FAILURE', 'audit-failure-token');
  assert.equal(made.rows[0].success, true);
  await db.query('BEGIN');
  try {
    await db.query(`create function pg_temp.reject_identity_audit() returns trigger language plpgsql as $$begin raise exception 'synthetic audit failure'; end$$`);
    await db.query(`create trigger synthetic_audit_failure before insert on public.identity_migration_audit for each row execute function pg_temp.reject_identity_audit()`);
    await db.query('SET LOCAL ROLE service_role');
    await assert.rejects(db.query(`select * from public.activate_clerk_identity_binding($1,$2)`, [hash('audit-failure-token'), 'PROD_B_FAILURE']), /synthetic audit failure/i);
    await db.query('ROLLBACK');
  } catch (error) { await db.query('ROLLBACK'); throw error; }
  const state = await db.query(`select
    (select clerk_id from public.users where id=$1) subject,
    (select count(*)::int from public.identity_bindings where user_id=$1 and environment='production' and status='ACTIVE') active_prod,
    (select status from public.identity_migration_challenges where id=$2) challenge`, [ids.b, made.rows[0].challenge_id]);
  assert.deepEqual(state.rows[0], { subject: 'LEGACY_B', active_prod: 0, challenge: 'PENDING' });
});

check('migration-aware sync uses real resolver and never claims by email', async db => {
  const { syncResolvedIdentity } = await import('../api/_lib/identity-resolution.js');
  const legacy = await syncResolvedIdentity({ supabase: supabaseAdapter(db), externalSubject: 'LEGACY_A', email: 'updated@invalid.example' });
  assert.equal(legacy.ok, true);

  const made = await challenge(db, ids.d, 'LEGACY_D', 'PROD_D_SYNC', 'sync-token');
  assert.equal(made.rows[0].success, true);
  const activated = await asService(db, `select * from public.activate_clerk_identity_binding($1,$2)`, [hash('sync-token'), 'PROD_D_SYNC']);
  assert.equal(activated.rows[0].success, true);
  const production = await syncResolvedIdentity({ supabase: supabaseAdapter(db), externalSubject: 'PROD_D_SYNC', email: null });
  assert.equal(production.ok, true);
  assert.equal(production.user.clerk_id, 'PROD_D_SYNC');

  const pending = await syncResolvedIdentity({ supabase: supabaseAdapter(db), externalSubject: 'PROD_B_FAILURE', email: null });
  assert.deepEqual(pending, { ok: false, code: 'IDENTITY_MIGRATION_REQUIRED' });
  const unknown = await syncResolvedIdentity({ supabase: supabaseAdapter(db), externalSubject: 'UNKNOWN_PRODUCTION', email: 'updated@invalid.example' });
  assert.deepEqual(unknown, { ok: false, code: 'IDENTITY_RESOLUTION_REQUIRED' });
  const failure = await syncResolvedIdentity({ supabase: supabaseAdapter(db, true), externalSubject: 'LEGACY_A', email: null });
  assert.deepEqual(failure, { ok: false, code: 'IDENTITY_SERVICE_UNAVAILABLE' });
  const count = await db.query(`select count(*)::int n from public.users`);
  assert.equal(count.rows[0].n, 4);
});

check('audit trail records challenge, activation, and rollback without plaintext', async db => {
  const result = await db.query(`select action, count(*)::int count from public.identity_migration_audit group by action order by action`);
  const actions = Object.fromEntries(result.rows.map(r => [r.action, r.count]));
  assert.ok(actions.CHALLENGE_CREATED >= 3);
  assert.ok(actions.BINDING_ACTIVATED >= 2);
  assert.ok(actions.BINDING_ROLLED_BACK >= 2);
  const leaked = await db.query(`select count(*)::int n from public.identity_migration_audit where detail::text like '%synthetic-token%' or coalesce(reason,'') like '%synthetic-token%'`);
  assert.equal(leaked.rows[0].n, 0);
});

(async () => {
  const db = client(); await db.connect();
  let passed = 0;
  try {
    for (const [name, fn] of checks) {
      await fn(db); passed += 1; console.log(`PASS ${name}`);
    }
  } finally { await db.end(); }
  console.log(`PostgreSQL rehearsal: ${passed}/${checks.length} passed`);
})().catch(error => {
  console.error(`FAIL SQLSTATE=${error.code || 'assertion'} MESSAGE=${error.message}`);
  process.exit(1);
});
