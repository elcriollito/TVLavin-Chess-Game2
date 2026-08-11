const assert = require('node:assert/strict');
const { Client } = require('pg');

const connectionString = process.env.CAISSA_IDENTITY_MIGRATION_REHEARSAL_DATABASE_URL;
if (!connectionString) throw new Error('rehearsal database URL required');
const userId = '00000000-0000-4000-8000-000000000010';
const customerId = 'cus_test_atomic';
const client = () => new Client({ connectionString, application_name: 'caissa-sec010-postgres-test' });
const checks = [];
const check = (name, fn) => checks.push([name, fn]);

async function fulfill(db, { event, business, operation = 'CREDIT_PURCHASE', amount = 25, user = userId, subject = 'STRIPE_LEGACY', customer = customerId, type = 'checkout.session.completed', reason = 'purchase_starter' }) {
  await db.query('BEGIN');
  try {
    await db.query('SET LOCAL ROLE service_role');
    const result = await db.query(`select * from public.fulfill_stripe_webhook_event($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [event, type, business, operation, user, subject, customer, amount, reason]);
    await db.query('COMMIT');
    return result.rows[0];
  } catch (error) { await db.query('ROLLBACK'); throw error; }
}

async function balance(db) {
  return (await db.query(`select credits from public.users where id=$1`, [userId])).rows[0].credits;
}

check('synthetic fixture and empty ledger', async db => {
  await db.query(`truncate public.stripe_events`);
  await db.query(`delete from public.users where id=$1`, [userId]);
  await db.query(`insert into public.users(id,clerk_id,credits,is_premium,stripe_customer_id) values($1,'STRIPE_LEGACY',10,false,$2)`, [userId, customerId]);
  assert.equal(await balance(db), 10);
});

check('valid unique purchase grants once and completes ledger', async db => {
  const result = await fulfill(db, { event: 'evt_test_unique', business: 'checkout_session:cs_test_unique' });
  assert.equal(result.success, true);
  assert.equal(await balance(db), 35);
  const ledger = (await db.query(`select status,user_id from public.stripe_events where event_id='evt_test_unique'`)).rows[0];
  assert.deepEqual(ledger, { status: 'COMPLETED', user_id: userId });
});

check('same event sequential replay grants zero additional value', async db => {
  const result = await fulfill(db, { event: 'evt_test_unique', business: 'checkout_session:cs_test_unique' });
  assert.equal(result.code, 'ALREADY_COMPLETED');
  assert.equal(await balance(db), 35);
});

check('two concurrent duplicates produce one grant', async db => {
  const before = await balance(db); const c1 = client(); const c2 = client(); await Promise.all([c1.connect(), c2.connect()]);
  try {
    const results = await Promise.all([c1, c2].map(c => fulfill(c, { event: 'evt_test_concurrent_2', business: 'checkout_session:cs_test_concurrent_2', amount: 75, reason: 'purchase_standard' })));
    assert.equal(results.filter(row => row.success).length, 1);
  } finally { await Promise.all([c1.end(), c2.end()]); }
  assert.equal(await balance(db), before + 75);
});

check('ten concurrent duplicates produce one grant', async db => {
  const before = await balance(db); const clients = Array.from({ length: 10 }, client); await Promise.all(clients.map(c => c.connect()));
  try {
    const results = await Promise.all(clients.map(c => fulfill(c, { event: 'evt_test_concurrent_10', business: 'checkout_session:cs_test_concurrent_10', amount: 200, reason: 'purchase_pro' })));
    assert.equal(results.filter(row => row.success).length, 1);
    assert.equal(results.filter(row => !row.success).length, 9);
  } finally { await Promise.all(clients.map(c => c.end())); }
  assert.equal(await balance(db), before + 200);
});

check('two independent purchases both fulfill', async db => {
  const before = await balance(db);
  await fulfill(db, { event: 'evt_test_independent_1', business: 'checkout_session:cs_test_independent_1' });
  await fulfill(db, { event: 'evt_test_independent_2', business: 'checkout_session:cs_test_independent_2' });
  assert.equal(await balance(db), before + 50);
});

check('different event IDs for one business operation grant once', async db => {
  const before = await balance(db);
  assert.equal((await fulfill(db, { event: 'evt_test_business_1', business: 'checkout_session:cs_test_same_business' })).success, true);
  assert.equal((await fulfill(db, { event: 'evt_test_business_2', business: 'checkout_session:cs_test_same_business' })).code, 'BUSINESS_OPERATION_ALREADY_COMPLETED');
  assert.equal(await balance(db), before + 25);
});

check('missing or cross-user mapping rolls back claim and value', async db => {
  const before = await balance(db);
  await assert.rejects(fulfill(db, { event: 'evt_test_missing_user', business: 'checkout_session:cs_test_missing_user', user: null, subject: 'UNKNOWN', customer: 'cus_test_unknown' }), /authoritative CAISSA account/i);
  await assert.rejects(fulfill(db, { event: 'evt_test_wrong_customer', business: 'checkout_session:cs_test_wrong_customer', customer: 'cus_test_other' }), /authoritative CAISSA account/i);
  assert.equal(await balance(db), before);
  assert.equal((await db.query(`select count(*)::int n from public.stripe_events where event_id in ('evt_test_missing_user','evt_test_wrong_customer')`)).rows[0].n, 0);
});

check('forged economic amount is rejected before mutation', async db => {
  const before = await balance(db);
  await assert.rejects(fulfill(db, { event: 'evt_test_forged_amount', business: 'checkout_session:cs_test_forged_amount', amount: 999999 }), /invalid credit entitlement/i);
  assert.equal(await balance(db), before);
});

check('failure during economic mutation rolls back claim and grant', async db => {
  const before = await balance(db);
  await db.query('BEGIN');
  try {
    await db.query(`create function pg_temp.reject_stripe_credit() returns trigger language plpgsql as $$begin raise exception 'synthetic credit failure'; end$$`);
    await db.query(`create trigger synthetic_stripe_credit_failure before insert on public.credit_events for each row execute function pg_temp.reject_stripe_credit()`);
    await db.query('SET LOCAL ROLE service_role');
    await assert.rejects(db.query(`select * from public.fulfill_stripe_webhook_event($1,$2,$3,$4,$5,$6,$7,$8,$9)`, ['evt_test_mid_failure','checkout.session.completed','checkout_session:cs_test_mid_failure','CREDIT_PURCHASE',userId,'STRIPE_LEGACY',customerId,25,'purchase_starter']), /synthetic credit failure/i);
    await db.query('ROLLBACK');
  } catch (error) { await db.query('ROLLBACK'); throw error; }
  assert.equal(await balance(db), before);
  assert.equal((await db.query(`select count(*)::int n from public.stripe_events where event_id='evt_test_mid_failure'`)).rows[0].n, 0);
});

check('post-commit retry cannot repeat fulfillment', async db => {
  const before = await balance(db);
  await fulfill(db, { event: 'evt_test_lost_http', business: 'checkout_session:cs_test_lost_http' });
  const retry = await fulfill(db, { event: 'evt_test_lost_http', business: 'checkout_session:cs_test_lost_http' });
  assert.equal(retry.code, 'ALREADY_COMPLETED');
  assert.equal(await balance(db), before + 25);
});

check('subscription renewal uses invoice business key exactly once', async db => {
  const before = await balance(db);
  const args = { event: 'evt_test_invoice_1', business: 'invoice:in_test_period_1', operation: 'SUBSCRIPTION_RENEWAL', amount: 50, user: null, subject: null, type: 'invoice.paid', reason: 'subscription_renewal' };
  assert.equal((await fulfill(db, args)).success, true);
  assert.equal((await fulfill(db, { ...args, event: 'evt_test_invoice_2' })).code, 'BUSINESS_OPERATION_ALREADY_COMPLETED');
  assert.equal(await balance(db), before + 50);
});

check('subscription activation uses Checkout Session key exactly once', async db => {
  await db.query(`update public.users set is_premium=false where id=$1`, [userId]);
  const args = { event: 'evt_test_activate_1', business: 'checkout_session:cs_test_subscription_1', operation: 'SUBSCRIPTION_ACTIVATE', amount: 0, type: 'checkout.session.completed', reason: 'subscription_activation' };
  assert.equal((await fulfill(db, args)).success, true);
  assert.equal((await fulfill(db, { ...args, event: 'evt_test_activate_2' })).code, 'BUSINESS_OPERATION_ALREADY_COMPLETED');
  assert.equal((await db.query(`select is_premium from public.users where id=$1`, [userId])).rows[0].is_premium, true);
});

check('subscription deletion uses subscription transition key exactly once', async db => {
  await db.query(`update public.users set is_premium=true where id=$1`, [userId]);
  const args = { event: 'evt_test_delete_1', business: 'subscription_delete:sub_test_1', operation: 'SUBSCRIPTION_DELETE', amount: 0, user: null, subject: null, type: 'customer.subscription.deleted', reason: 'subscription_deleted' };
  assert.equal((await fulfill(db, args)).success, true);
  assert.equal((await fulfill(db, { ...args, event: 'evt_test_delete_2' })).code, 'BUSINESS_OPERATION_ALREADY_COMPLETED');
  assert.equal((await db.query(`select is_premium from public.users where id=$1`, [userId])).rows[0].is_premium, false);
});

check('RLS and function privileges deny ordinary roles', async db => {
  for (const role of ['anon', 'authenticated']) {
    await db.query('BEGIN'); await db.query(`SET LOCAL ROLE ${role}`);
    await assert.rejects(db.query(`select * from public.stripe_events`), /permission denied/i);
    await db.query('ROLLBACK');
    await db.query('BEGIN'); await db.query(`SET LOCAL ROLE ${role}`);
    await assert.rejects(db.query(`select * from public.fulfill_stripe_webhook_event('evt_test_x','checkout.session.completed','checkout_session:cs_test_x','CREDIT_PURCHASE',$1,'STRIPE_LEGACY',$2,25,'purchase_starter')`, [userId, customerId]), /permission denied/i);
    await db.query('ROLLBACK');
  }
});

(async()=>{const db=client();await db.connect();let passed=0;try{for(const[name,fn]of checks){await fn(db);passed++;console.log(`PASS ${name}`)}}finally{await db.end()}console.log(`Stripe PostgreSQL rehearsal: ${passed}/${checks.length} passed`)})().catch(error=>{console.error(`FAIL SQLSTATE=${error.code||'assertion'} MESSAGE=${error.message}`);process.exit(1)});
