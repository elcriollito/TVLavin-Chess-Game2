const assert = require('node:assert/strict');
const fs = require('node:fs');
const { performance } = require('node:perf_hooks');
const { Client } = require('pg');

const connectionString = process.env.CAISSA_IDENTITY_MIGRATION_REHEARSAL_DATABASE_URL;
if (!connectionString) throw new Error('authorized isolated rehearsal database URL required');
const bootstrap = fs.readFileSync('supabase/bootstrap/caissa-production-bootstrap.sql', 'utf8');
const sec009 = fs.readFileSync('supabase/migrations/20260811_distributed_mentor_capacity.sql', 'utf8');
const sec010 = fs.readFileSync('supabase/migrations/20260811_atomic_stripe_webhook_fulfillment.sql', 'utf8');
const client = () => new Client({ connectionString, application_name: 'caissa-secure-bootstrap-rehearsal' });
const applicationTables = ['caissa_schema_meta', 'users', 'credit_events', 'stripe_events', 'library_positions', 'library_collections', 'library_sync_log'];
const identityTables = ['identity_bindings', 'identity_migration_challenges', 'identity_enrollment_decisions', 'identity_migration_audit', 'identity_migration_throttles', 'identity_manual_recovery_previews'];
const userId = '00000000-0000-4000-8000-000000000080';

async function reset(db) {
  await db.query('drop schema if exists public cascade');
  await db.query('create schema public authorization postgres');
  await db.query('grant usage on schema public to public, anon, authenticated, service_role');
}

async function asRole(db, role, sql, params = []) {
  await db.query('begin');
  try {
    await db.query(`set local role ${role}`);
    const result = await db.query(sql, params);
    await db.query('commit');
    return result;
  } catch (error) {
    await db.query('rollback');
    throw error;
  }
}

async function expectDenied(db, role, sql) {
  await assert.rejects(asRole(db, role, sql), /permission denied/i);
}

(async () => {
  const db = client();
  await db.connect();
  let passed = 0;
  const check = async (name, fn) => {
    await fn();
    passed += 1;
    console.log(`PASS ${name}`);
  };

  try {
    await check('database is the authorized disposable PostgreSQL rehearsal class', async () => {
      assert.match((await db.query('show server_version')).rows[0].server_version, /^17\./);
      assert.equal((await db.query('select current_database() name')).rows[0].name, 'postgres');
    });

    await check('partial schema aborts without additional objects', async () => {
      await reset(db);
      await db.query('create table public.users(id uuid primary key)');
      await assert.rejects(db.query(bootstrap), /CAISSA_BOOTSTRAP_PARTIAL_OR_UNKNOWN:users/);
      await db.query('rollback');
      const names = (await db.query(`select tablename from pg_catalog.pg_tables where schemaname='public' order by 1`)).rows.map(row => row.tablename);
      assert.deepEqual(names, ['users']);
    });

    let durationMs = 0;
    await check('bootstrap applies atomically from an empty public schema', async () => {
      await reset(db);
      const start = performance.now();
      await db.query(bootstrap);
      durationMs = performance.now() - start;
      assert.ok(durationMs < 10000);
      const marker = (await db.query(`select schema_family,bootstrap_version,release_compatibility from public.caissa_schema_meta`)).rows[0];
      assert.deepEqual(marker, { schema_family: 'caissa-application', bootstrap_version: '2026-08-11.1', release_compatibility: 'security-season-12' });
    });

    await check('catalog has exact tables, RLS, no policies, and fixed-path definer RPCs', async () => {
      const tables = await db.query(`select tablename,rowsecurity from pg_catalog.pg_tables where schemaname='public' order by tablename`);
      assert.deepEqual(tables.rows.map(row => row.tablename), [...applicationTables].sort());
      assert.equal(tables.rows.every(row => row.rowsecurity), true);
      assert.equal((await db.query(`select count(*)::int n from pg_catalog.pg_policies where schemaname='public'`)).rows[0].n, 0);
      const functions = await db.query(`select p.proname,p.prosecdef,p.proconfig,pg_catalog.pg_get_userbyid(p.proowner) owner from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace where n.nspname='public' order by p.proname`);
      assert.deepEqual(functions.rows.map(row => row.proname), ['add_credits', 'consume_credits']);
      assert.equal(functions.rows.every(row => row.prosecdef && row.owner === 'postgres' && row.proconfig?.includes('search_path=pg_catalog')), true);
    });

    await check('browser roles have no direct table or RPC access', async () => {
      const updateColumn = {
        caissa_schema_meta: 'schema_family', users: 'credits', credit_events: 'balance_after',
        stripe_events: 'event_type', library_positions: 'version',
        library_collections: 'version', library_sync_log: 'item_count'
      };
      for (const role of ['anon', 'authenticated']) {
        for (const table of applicationTables) {
          await expectDenied(db, role, `select * from public.${table}`);
          await expectDenied(db, role, `insert into public.${table} default values`);
          await expectDenied(db, role, `update public.${table} set ${updateColumn[table]}=${updateColumn[table]} where false`);
          await expectDenied(db, role, `delete from public.${table} where false`);
        }
        await expectDenied(db, role, `select * from public.consume_credits('synthetic',1,'mentor_chat')`);
        await expectDenied(db, role, `select * from public.add_credits('synthetic',1,'synthetic')`);
      }
    });

    await check('service role supports user, wallet, library, and audit operations', async () => {
      await asRole(db, 'service_role', `insert into public.users(id,clerk_id,email) values($1,'synthetic_bootstrap_user','synthetic@example.invalid')`, [userId]);
      assert.equal((await asRole(db, 'service_role', `select credits from public.users where id=$1`, [userId])).rows[0].credits, 5);
      await asRole(db, 'service_role', `update public.users set email='updated@example.invalid' where id=$1`, [userId]);
      await asRole(db, 'service_role', `insert into public.library_positions(user_id,local_id,fen) values($1,'p1','8/8/8/8/8/8/8/8 w - - 0 1')`, [userId]);
      await asRole(db, 'service_role', `insert into public.library_collections(user_id,local_id,name) values($1,'c1','Synthetic')`, [userId]);
      await asRole(db, 'service_role', `insert into public.library_sync_log(user_id,action,item_type,item_count) values($1,'push','position',1)`, [userId]);
      await asRole(db, 'service_role', `delete from public.library_positions where user_id=$1`, [userId]);
    });

    await check('invalid economic inputs fail without changing value', async () => {
      for (const cost of [-1, 0, 3, null]) await assert.rejects(asRole(db, 'service_role', `select * from public.consume_credits('synthetic_bootstrap_user',$1,'mentor_chat')`, [cost]), /invalid credit cost/);
      for (const amount of [-1, 0, 201, null]) await assert.rejects(asRole(db, 'service_role', `select * from public.add_credits('synthetic_bootstrap_user',$1,'synthetic')`, [amount]), /invalid credit amount/);
      await db.query(`update public.users set credits=2147483647 where id=$1`, [userId]);
      await assert.rejects(asRole(db, 'service_role', `select * from public.add_credits('synthetic_bootstrap_user',1,'synthetic')`), /credit balance overflow/);
      assert.equal((await db.query(`select credits from public.users where id=$1`, [userId])).rows[0].credits, 2147483647);
      await db.query(`update public.users set credits=1 where id=$1`, [userId]);
    });

    await check('two concurrent one-credit consumes authorize exactly once', async () => {
      const connections = [client(), client()];
      await Promise.all(connections.map(connection => connection.connect()));
      try {
        const results = await Promise.all(connections.map(connection => asRole(connection, 'service_role', `select * from public.consume_credits('synthetic_bootstrap_user',1,'mentor_chat')`)));
        assert.equal(results.filter(result => result.rows[0].success).length, 1);
        assert.equal(results.filter(result => !result.rows[0].success).length, 1);
      } finally {
        await Promise.all(connections.map(connection => connection.end()));
      }
      assert.equal((await db.query(`select credits from public.users where id=$1`, [userId])).rows[0].credits, 0);
      assert.equal((await db.query(`select count(*)::int n from public.credit_events where user_id=$1`, [userId])).rows[0].n, 1);
    });

    await check('second bootstrap fails cleanly without drift', async () => {
      const before = await db.query(`select count(*)::int tables from pg_catalog.pg_tables where schemaname='public'`);
      await assert.rejects(db.query(bootstrap), /CAISSA_BOOTSTRAP_ALREADY_APPLIED:2026-08-11.1/);
      await db.query('rollback');
      const after = await db.query(`select count(*)::int tables from pg_catalog.pg_tables where schemaname='public'`);
      assert.deepEqual(after.rows, before.rows);
    });

    await check('bootstrap has zero application/economic seed state on a fresh run', async () => {
      await reset(db);
      await db.query(bootstrap);
      for (const table of ['users', 'credit_events', 'stripe_events', 'library_positions', 'library_collections', 'library_sync_log']) {
        assert.equal((await db.query(`select count(*)::int n from public.${table}`)).rows[0].n, 0);
      }
    });

    await check('SEC-009 applies and ten concurrent claims enforce three allowed', async () => {
      await db.query(sec009);
      const connections = Array.from({ length: 10 }, client);
      await Promise.all(connections.map(connection => connection.connect()));
      try {
        const results = await Promise.all(connections.map(connection => asRole(connection, 'service_role', `select * from public.claim_mentor_capacity($1,$2,100,100,100,100,3,30)`, ['a'.repeat(64), 'f'.repeat(64)])));
        assert.equal(results.filter(result => result.rows[0].allowed).length, 3);
        assert.equal(results.filter(result => !result.rows[0].allowed).length, 7);
      } finally {
        await Promise.all(connections.map(connection => connection.end()));
      }
    });

    await check('pre-SEC-010 Stripe state is fail-closed with zero value', async () => {
      await db.query(`insert into public.users(id,clerk_id,credits,stripe_customer_id) values($1,'STRIPE_LEGACY',10,'cus_test_bootstrap')`, [userId]);
      await assert.rejects(db.query(`select * from public.fulfill_stripe_webhook_event('evt_test_bootstrap','checkout.session.completed','checkout_session:cs_test_bootstrap','CREDIT_PURCHASE',$1,'STRIPE_LEGACY','cus_test_bootstrap',25,'purchase_starter')`, [userId]), /does not exist/i);
      assert.equal((await db.query(`select credits from public.users where id=$1`, [userId])).rows[0].credits, 10);
      assert.equal((await db.query(`select count(*)::int n from public.stripe_events`)).rows[0].n, 0);
    });

    await check('SEC-010 applies cleanly and SEC-005 remains absent', async () => {
      await db.query(sec010);
      assert.notEqual((await db.query(`select to_regprocedure('public.fulfill_stripe_webhook_event(text,text,text,text,uuid,text,text,integer,text)') oid`)).rows[0].oid, null);
      for (const table of identityTables) assert.equal((await db.query(`select to_regclass($1) oid`, [`public.${table}`])).rows[0].oid, null);
      await db.query(`delete from public.users where id=$1`, [userId]);
    });

    console.log(`Secure production bootstrap PostgreSQL rehearsal: ${passed}/13 passed; bootstrap_ms=${durationMs.toFixed(2)}`);
  } catch (error) {
    console.error(`FAIL SQLSTATE=${error.code || 'none'} MESSAGE=${error.message}`);
    process.exitCode = 1;
  } finally {
    await db.end();
  }
})();
