\set ON_ERROR_STOP on

do $$ begin if not exists(select 1 from pg_catalog.pg_roles where rolname='anon') then create role anon nologin; end if; end $$;
do $$ begin if not exists(select 1 from pg_catalog.pg_roles where rolname='authenticated') then create role authenticated nologin; end if; end $$;
do $$ begin if not exists(select 1 from pg_catalog.pg_roles where rolname='service_role') then create role service_role nologin; end if; end $$;
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists dblink;

create table public.users (
  id uuid primary key default gen_random_uuid(),
  clerk_id text not null unique,
  email text,
  role text not null default 'member',
  is_premium boolean not null default false,
  credits integer not null default 5,
  stripe_customer_id text,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);

\ir ../supabase/migrations/20260811_clerk_identity_remapping_foundation.sql
\ir ../supabase/migrations/20261018171912_caissa_identity_ownership_v1.sql
\ir ../supabase/staging-only/20261023211619_caissa_staging_synthetic_identity_provisioning.sql

create table public.synthetic_fixture_data (
  user_id uuid primary key references public.users(id) on delete cascade,
  marker text not null
);
create table public.synthetic_protected_fixture_data (
  user_id uuid primary key references public.users(id) on delete restrict,
  marker text not null
);

create or replace function pg_temp.assert_true(p_condition boolean, p_message text)
returns void language plpgsql as $$
begin
  if p_condition is not true then
    raise exception 'STAGING_SYNTHETIC_IDENTITY_ASSERTION_FAILED: %', p_message;
  end if;
end;
$$;

select pg_temp.assert_true(
  not pg_catalog.has_schema_privilege('anon', 'caissa_staging_private', 'USAGE')
  and not pg_catalog.has_schema_privilege('authenticated', 'caissa_staging_private', 'USAGE')
  and not pg_catalog.has_schema_privilege('service_role', 'caissa_staging_private', 'USAGE')
  and not pg_catalog.has_table_privilege(
    'service_role', 'caissa_staging_private.synthetic_identity_authorizations', 'SELECT'
  )
  and not pg_catalog.has_function_privilege(
    'service_role',
    'caissa_staging_private.provision_synthetic_identity(uuid,text,uuid,text,text)',
    'EXECUTE'
  ),
  'a browser or deployed service role can reach the owner-only fixture mechanism'
);

select pg_temp.assert_true(
  (select relrowsecurity and relforcerowsecurity
   from pg_catalog.pg_class
   where oid = 'caissa_staging_private.synthetic_identity_authorizations'::regclass),
  'the transient authorization ledger does not force RLS'
);

select pg_temp.assert_true(
  (select ownership_state = 'UNRESOLVED'
   from public.resolve_caissa_identity_ownership(
     'user_3TestSyntheticAlpha000000001', 'legacy_development'
   )),
  'an unprovisioned Development subject did not fail closed'
);

select pg_temp.assert_true(
  (select success and code = 'FIXTURE_AUTHORIZED'
   from caissa_staging_private.authorize_synthetic_identity(
     '904ca814-04c6-8a0f-ae01-008de74af1cd',
     'A',
     'user_3TestSyntheticAlpha000000001',
     'a2000000-0000-4000-8000-000000000001',
     repeat('a', 64),
     'Approved local synthetic fixture Alpha for isolated ownership certification.',
     pg_catalog.clock_timestamp() + interval '30 minutes',
     'user_3TestSyntheticAlpha000000001',
     'a2000000-0000-4000-8000-000000000001',
     repeat('a', 64),
     'user_3TestSyntheticBravo000000001',
     'b2000000-0000-4000-8000-000000000001',
     repeat('b', 64)
   )),
  'exact fixture authorization failed'
);

select pg_temp.assert_true(
  (select f.success and f.code = 'FIXTURE_AUTHORIZATION_EXISTS'
   from caissa_staging_private.synthetic_identity_authorizations a
   cross join lateral caissa_staging_private.authorize_synthetic_identity(
     a.run_id, a.fixture_slot, a.external_subject, a.user_id, a.authorization_reference_hash,
     a.reason, a.expires_at,
     'user_3TestSyntheticAlpha000000001',
     'a2000000-0000-4000-8000-000000000001',
     repeat('a', 64),
     'user_3TestSyntheticBravo000000001',
     'b2000000-0000-4000-8000-000000000001',
     repeat('b', 64)
   ) f
   where a.external_subject = 'user_3TestSyntheticAlpha000000001'),
  'exact authorization replay was not idempotent'
);

select pg_temp.assert_true(
  (select not success and code = 'INVALID_FIXTURE_PROVISION_REQUEST'
   from caissa_staging_private.provision_synthetic_identity(
     '904ca814-04c6-8a0f-ae01-008de74af1cd',
     'user_3TestSyntheticAlpha000000001',
     'a2000000-0000-4000-8000-000000000001',
     null,
     'alpha@example.test'
   ))
  and (select count(*) = 0 from public.users
       where id = 'a2000000-0000-4000-8000-000000000001'),
  'a null authorization hash bypassed provisioning authorization'
);

select pg_temp.assert_true(
  (select success and code = 'FIXTURE_PROVISIONED'
   from caissa_staging_private.provision_synthetic_identity(
     '904ca814-04c6-8a0f-ae01-008de74af1cd',
     'user_3TestSyntheticAlpha000000001',
     'a2000000-0000-4000-8000-000000000001',
     repeat('a', 64),
     'alpha@example.test'
   )),
  'authorized fixture provisioning failed'
);

select pg_temp.assert_true(
  (select success and code = 'FIXTURE_ALREADY_PROVISIONED'
   from caissa_staging_private.provision_synthetic_identity(
     '904ca814-04c6-8a0f-ae01-008de74af1cd',
     'user_3TestSyntheticAlpha000000001',
     'a2000000-0000-4000-8000-000000000001',
     repeat('a', 64),
     'alpha@example.test'
   )),
  'exact provisioning replay was not idempotent'
);

select pg_temp.assert_true(
  (select ownership_state = 'VERIFIED' and user_id = 'a2000000-0000-4000-8000-000000000001'
   from public.resolve_caissa_identity_ownership(
     'user_3TestSyntheticAlpha000000001', 'legacy_development'
   )),
  'provisioned fixture ownership was not verified'
);
select pg_temp.assert_true(
  (select ownership_state = 'UNRESOLVED'
   from public.resolve_caissa_identity_ownership(
     'user_3TestSyntheticAlpha000000001', 'production'
   )),
  'a Development fixture crossed the Production authority boundary'
);

update public.identity_bindings
set status = 'REVOKED', retired_at = pg_catalog.clock_timestamp()
where external_subject = 'user_3TestSyntheticAlpha000000001';
select pg_temp.assert_true(
  (select ownership_state = 'UNRESOLVED'
   from public.resolve_caissa_identity_ownership(
     'user_3TestSyntheticAlpha000000001', 'legacy_development'
   )),
  'a revoked fixture binding remained usable'
);
update public.identity_bindings
set status = 'ACTIVE', retired_at = null
where external_subject = 'user_3TestSyntheticAlpha000000001';

insert into public.identity_bindings(
  user_id, environment, external_subject, status, proof_method, activated_at
) values (
  'a2000000-0000-4000-8000-000000000001', 'production',
  'user_3TestSyntheticCrossAuthority001', 'ACTIVE', 'NEW_ACCOUNT',
  pg_catalog.clock_timestamp()
);
select pg_temp.assert_true(
  (select ownership_state = 'QUARANTINED'
   from public.resolve_caissa_identity_ownership(
     'user_3TestSyntheticAlpha000000001', 'legacy_development'
   )),
  'an ambiguous cross-authority binding was not quarantined'
);
delete from public.identity_bindings
where external_subject = 'user_3TestSyntheticCrossAuthority001';

insert into public.users(
  id, clerk_id, email
) values (
  'a2000000-0000-4000-8000-000000000099',
  'user_3HistoricalAccountNotFixture001',
  'historical@example.test'
);
select pg_temp.assert_true(
  (select not success and code = 'HISTORICAL_OR_BOUND_IDENTITY'
   from caissa_staging_private.authorize_synthetic_identity(
     '2fce385b-a99f-83a0-aba4-c20008fccde8',
     'A',
     'user_3HistoricalAccountNotFixture001',
     'a2000000-0000-4000-8000-000000000099',
     repeat('9', 64),
     'Attempt to classify a historical account as a synthetic fixture.',
     pg_catalog.clock_timestamp() + interval '30 minutes',
     'user_3HistoricalAccountNotFixture001',
     'a2000000-0000-4000-8000-000000000099',
     repeat('9', 64),
     'user_3HistoricalManifestPeer0000001',
     'a2000000-0000-4000-8000-000000000098',
     repeat('8', 64)
   )),
  'a historical user could be reclassified as a fixture'
);
delete from public.users where id = 'a2000000-0000-4000-8000-000000000099';

select pg_temp.assert_true(
  (select success
   from caissa_staging_private.authorize_synthetic_identity(
     '904ca814-04c6-8a0f-ae01-008de74af1cd',
     'B',
     'user_3TestSyntheticBravo000000001',
     'b2000000-0000-4000-8000-000000000001',
     repeat('b', 64),
     'Approved local synthetic fixture Bravo for concurrency certification.',
     pg_catalog.clock_timestamp() + interval '30 minutes',
     'user_3TestSyntheticAlpha000000001',
     'a2000000-0000-4000-8000-000000000001',
     repeat('a', 64),
     'user_3TestSyntheticBravo000000001',
     'b2000000-0000-4000-8000-000000000001',
     repeat('b', 64)
   )),
  'second exact fixture authorization failed'
);

select pg_temp.assert_true(
  (select not success and code = 'RUN_MANIFEST_MISMATCH'
   from caissa_staging_private.authorize_synthetic_identity(
     '904ca814-04c6-8a0f-ae01-008de74af1cd',
     'B',
     'user_3TestSyntheticCharlie00000001',
     'c2000000-0000-4000-8000-000000000001',
     repeat('c', 64),
     'Attempt to exceed the exact two-slot A/B fixture authorization contract.',
     pg_catalog.clock_timestamp() + interval '30 minutes',
     'user_3TestSyntheticAlpha000000001',
     'a2000000-0000-4000-8000-000000000001',
     repeat('a', 64),
     'user_3TestSyntheticBravo000000001',
     'b2000000-0000-4000-8000-000000000001',
     repeat('b', 64)
   )),
  'a second subject could claim an occupied run slot'
);
select pg_temp.assert_true(
  (select count(*) = 2
   from caissa_staging_private.synthetic_identity_authorizations
   where run_id = '904ca814-04c6-8a0f-ae01-008de74af1cd'),
  'one run was not bounded to its exact A/B identities'
);

select dblink_connect('fixture_writer', pg_catalog.format(
  'host=127.0.0.1 port=%s dbname=%I user=%I',
  pg_catalog.inet_server_port(), pg_catalog.current_database(), current_user
));
select dblink_send_query('fixture_writer', $remote$
  select * from caissa_staging_private.provision_synthetic_identity(
    '904ca814-04c6-8a0f-ae01-008de74af1cd',
    'user_3TestSyntheticBravo000000001',
    'b2000000-0000-4000-8000-000000000001',
    repeat('b', 64),
    'bravo@example.test'
  )
$remote$);
select pg_catalog.pg_sleep(0.05);
create temporary table local_concurrent_result as
select * from caissa_staging_private.provision_synthetic_identity(
  '904ca814-04c6-8a0f-ae01-008de74af1cd',
  'user_3TestSyntheticBravo000000001',
  'b2000000-0000-4000-8000-000000000001',
  repeat('b', 64),
  'bravo@example.test'
);
create temporary table remote_concurrent_result as
select * from dblink_get_result('fixture_writer')
  as t(success boolean, code text, user_id uuid, binding_id uuid);
select dblink_disconnect('fixture_writer');

select pg_temp.assert_true(
  (select success from local_concurrent_result)
  and (select success from remote_concurrent_result)
  and (select count(*) = 1 from public.users
       where clerk_id = 'user_3TestSyntheticBravo000000001')
  and (select count(*) = 1 from public.identity_bindings
       where external_subject = 'user_3TestSyntheticBravo000000001'),
  'concurrent provisioning did not converge on one exact fixture identity'
);

insert into public.synthetic_fixture_data(user_id, marker) values
  ('a2000000-0000-4000-8000-000000000001', 'alpha export differentiator'),
  ('b2000000-0000-4000-8000-000000000001', 'bravo export differentiator');
insert into public.synthetic_protected_fixture_data(user_id, marker) values
  ('b2000000-0000-4000-8000-000000000001', 'simulated protected dependency');

select pg_temp.assert_true(
  (select not success and code = 'FIXTURE_CLEANUP_CONFIRMATION_REQUIRED'
   from caissa_staging_private.cleanup_synthetic_identity(
     '904ca814-04c6-8a0f-ae01-008de74af1cd',
     'user_3TestSyntheticAlpha000000001',
     'a2000000-0000-4000-8000-000000000001',
     repeat('a', 64),
     null
   ))
  and (select count(*) = 1 from public.users
       where id = 'a2000000-0000-4000-8000-000000000001'),
  'a null cleanup confirmation bypassed the destructive guard'
);
select pg_temp.assert_true(
  (select not success and code = 'FIXTURE_NOT_AUTHORIZED'
   from caissa_staging_private.cleanup_synthetic_identity(
     '904ca814-04c6-8a0f-ae01-008de74af1cd',
     'user_3TestSyntheticAlpha000000001',
     'a2000000-0000-4000-8000-000000000001',
     null,
     'CLEAN STAGING SYNTHETIC FIXTURE'
   ))
  and (select count(*) = 1 from public.users
       where id = 'a2000000-0000-4000-8000-000000000001'),
  'a null authorization hash bypassed exact cleanup authorization'
);

select pg_temp.assert_true(
  (select success and code = 'FIXTURE_CLEANED'
   from caissa_staging_private.cleanup_synthetic_identity(
     '904ca814-04c6-8a0f-ae01-008de74af1cd',
     'user_3TestSyntheticAlpha000000001',
     'a2000000-0000-4000-8000-000000000001',
     repeat('a', 64),
     'CLEAN STAGING SYNTHETIC FIXTURE'
   )),
  'exact fixture cleanup failed'
);
select pg_temp.assert_true(
  (select success and code = 'FIXTURE_ALREADY_CLEAN'
   from caissa_staging_private.cleanup_synthetic_identity(
     '904ca814-04c6-8a0f-ae01-008de74af1cd',
     'user_3TestSyntheticAlpha000000001',
     'a2000000-0000-4000-8000-000000000001',
     repeat('a', 64),
     'CLEAN STAGING SYNTHETIC FIXTURE'
   )),
  'cleanup replay was not idempotent before finalization'
);

select pg_temp.assert_true(
  (select not success and code = 'FIXTURE_PROTECTED_DEPENDENCY_PRESENT'
   from caissa_staging_private.cleanup_synthetic_identity(
     '904ca814-04c6-8a0f-ae01-008de74af1cd',
     'user_3TestSyntheticBravo000000001',
     'b2000000-0000-4000-8000-000000000001',
     repeat('b', 64),
     'CLEAN STAGING SYNTHETIC FIXTURE'
   )),
  'cleanup crossed a protected dependency'
);
delete from public.synthetic_protected_fixture_data
where user_id = 'b2000000-0000-4000-8000-000000000001';
select pg_temp.assert_true(
  (select success and code = 'FIXTURE_CLEANED'
   from caissa_staging_private.cleanup_synthetic_identity(
     '904ca814-04c6-8a0f-ae01-008de74af1cd',
     'user_3TestSyntheticBravo000000001',
     'b2000000-0000-4000-8000-000000000001',
     repeat('b', 64),
     'CLEAN STAGING SYNTHETIC FIXTURE'
   )),
  'cleanup did not recover after the protected dependency was removed'
);

select pg_temp.assert_true(
  (select not success and code = 'FIXTURE_RECEIPT_REQUIRED'
   from caissa_staging_private.finalize_synthetic_identity_cleanup(
     '904ca814-04c6-8a0f-ae01-008de74af1cd',
     'user_3TestSyntheticAlpha000000001',
     'a2000000-0000-4000-8000-000000000001',
     repeat('a', 64), null
   ))
  and (select count(*) = 1
       from caissa_staging_private.synthetic_identity_authorizations
       where external_subject = 'user_3TestSyntheticAlpha000000001'),
  'a null external receipt bypassed finalization'
);
select pg_temp.assert_true(
  (select not success and code = 'FIXTURE_CLEANUP_NOT_FINALIZABLE'
   from caissa_staging_private.finalize_synthetic_identity_cleanup(
     '904ca814-04c6-8a0f-ae01-008de74af1cd',
     'user_3TestSyntheticAlpha000000001',
     'a2000000-0000-4000-8000-000000000001',
     null, repeat('1', 64)
   ))
  and (select count(*) = 1
       from caissa_staging_private.synthetic_identity_authorizations
       where external_subject = 'user_3TestSyntheticAlpha000000001'),
  'a null authorization hash bypassed exact finalization authorization'
);

select pg_temp.assert_true(
  (select success from caissa_staging_private.finalize_synthetic_identity_cleanup(
    '904ca814-04c6-8a0f-ae01-008de74af1cd',
    'user_3TestSyntheticAlpha000000001',
    'a2000000-0000-4000-8000-000000000001',
    repeat('a', 64), repeat('1', 64)
  ))
  and (select success from caissa_staging_private.finalize_synthetic_identity_cleanup(
    '904ca814-04c6-8a0f-ae01-008de74af1cd',
    'user_3TestSyntheticBravo000000001',
    'b2000000-0000-4000-8000-000000000001',
    repeat('b', 64), repeat('2', 64)
  )),
  'external-receipt finalization failed'
);

select pg_temp.assert_true(
  (select not success and code = 'RUN_MANIFEST_MISMATCH'
   from caissa_staging_private.authorize_synthetic_identity(
     '904ca814-04c6-8a0f-ae01-008de74af1cd',
     'B',
     'user_3TestSyntheticCharlie00000001',
     'c2000000-0000-4000-8000-000000000001',
     repeat('c', 64),
     'Attempt to rebind a finalized run slot to a third synthetic identity.',
     pg_catalog.clock_timestamp() + interval '30 minutes',
     'user_3TestSyntheticAlpha000000001',
     'a2000000-0000-4000-8000-000000000001',
     repeat('a', 64),
     'user_3TestSyntheticBravo000000001',
     'b2000000-0000-4000-8000-000000000001',
     repeat('b', 64)
   )),
  'a finalized run could be rebound to a third subject or UUID'
);

do $$
declare
  v_run_id uuid;
  v_success boolean;
  v_code text;
begin
  v_run_id := caissa_staging_private.expected_synthetic_run_id(
    'user_3TxnSyntheticAlpha000000001',
    'c3000000-0000-4000-8000-000000000001',
    repeat('c', 64),
    'user_3TxnSyntheticBravo000000001',
    'd3000000-0000-4000-8000-000000000001',
    repeat('d', 64)
  );

  select f.success, f.code into v_success, v_code
  from caissa_staging_private.authorize_synthetic_identity(
    v_run_id,
    'A',
    'user_3TxnSyntheticAlpha000000001',
    'c3000000-0000-4000-8000-000000000001',
    repeat('c', 64),
    'Approved same-transaction fixture for timestamp compatibility certification.',
    pg_catalog.clock_timestamp() + interval '30 minutes',
    'user_3TxnSyntheticAlpha000000001',
    'c3000000-0000-4000-8000-000000000001',
    repeat('c', 64),
    'user_3TxnSyntheticBravo000000001',
    'd3000000-0000-4000-8000-000000000001',
    repeat('d', 64)
  ) f;
  if v_success is not true or v_code is distinct from 'FIXTURE_AUTHORIZED' then
    raise exception 'SAME_TRANSACTION_AUTHORIZATION_FAILED: %', v_code;
  end if;

  select f.success, f.code into v_success, v_code
  from caissa_staging_private.provision_synthetic_identity(
    v_run_id,
    'user_3TxnSyntheticAlpha000000001',
    'c3000000-0000-4000-8000-000000000001',
    repeat('c', 64),
    'transaction@example.test'
  ) f;
  if v_success is not true or v_code is distinct from 'FIXTURE_PROVISIONED' then
    raise exception 'SAME_TRANSACTION_PROVISIONING_FAILED: %', v_code;
  end if;

  select f.success, f.code into v_success, v_code
  from caissa_staging_private.cleanup_synthetic_identity(
    v_run_id,
    'user_3TxnSyntheticAlpha000000001',
    'c3000000-0000-4000-8000-000000000001',
    repeat('c', 64),
    'CLEAN STAGING SYNTHETIC FIXTURE'
  ) f;
  if v_success is not true or v_code is distinct from 'FIXTURE_CLEANED' then
    raise exception 'SAME_TRANSACTION_CLEANUP_FAILED: %', v_code;
  end if;

  select f.success, f.code into v_success, v_code
  from caissa_staging_private.finalize_synthetic_identity_cleanup(
    v_run_id,
    'user_3TxnSyntheticAlpha000000001',
    'c3000000-0000-4000-8000-000000000001',
    repeat('c', 64),
    repeat('3', 64)
  ) f;
  if v_success is not true or v_code is distinct from 'FIXTURE_CLEANUP_FINALIZED' then
    raise exception 'SAME_TRANSACTION_FINALIZATION_FAILED: %', v_code;
  end if;
end;
$$;

select pg_temp.assert_true(
  (select count(*) = 0 from public.users)
  and (select count(*) = 0 from public.identity_bindings)
  and (select count(*) = 0 from public.caissa_identity_ownership_reviews)
  and (select count(*) = 0 from public.synthetic_fixture_data)
  and (select count(*) = 0 from public.synthetic_protected_fixture_data)
  and (select count(*) = 0
       from caissa_staging_private.synthetic_identity_authorizations),
  'fixture cleanup did not restore the exact empty data baseline'
);

\ir ../supabase/staging-only/20261023211620_caissa_staging_synthetic_identity_teardown.sql

select pg_temp.assert_true(
  pg_catalog.to_regnamespace('caissa_staging_private') is null,
  'the private fixture mechanism was not removed from the schema baseline'
);

\echo CAISSA_STAGING_SYNTHETIC_IDENTITY_POSTGRES_PASS
