\set ON_ERROR_STOP on

create role anon nologin;
create role authenticated nologin;
create role service_role nologin;

create extension if not exists pgcrypto;

create table public.users (
  id uuid primary key default gen_random_uuid(),
  clerk_id text not null unique,
  email text,
  updated_at timestamptz not null default pg_catalog.clock_timestamp()
);

\ir ../supabase/migrations/20260811_clerk_identity_remapping_foundation.sql
\ir ../supabase/migrations/20261018171912_caissa_identity_ownership_v1.sql

create or replace function pg_temp.assert_true(p_condition boolean, p_message text)
returns void language plpgsql as $$
begin
  if p_condition is not true then
    raise exception 'IDENTITY_ORGANIZATION_ASSERTION_FAILED: %', p_message;
  end if;
end;
$$;

insert into public.users(id, clerk_id) values
  ('10000000-0000-4000-8000-000000000001', 'legacy_subject_verified'),
  ('10000000-0000-4000-8000-000000000002', 'production_subject_new'),
  ('10000000-0000-4000-8000-000000000003', 'production_subject_historical'),
  ('10000000-0000-4000-8000-000000000004', 'production_subject_conflict');

insert into public.identity_bindings(
  id, user_id, environment, external_subject, status, proof_method, activated_at
) values
  (
    '20000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    'legacy_development', 'legacy_subject_verified', 'ACTIVE',
    'LEGACY_BACKFILL', pg_catalog.clock_timestamp()
  ),
  (
    '20000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000002',
    'production', 'production_subject_new', 'ACTIVE',
    'NEW_ACCOUNT', pg_catalog.clock_timestamp()
  ),
  (
    '20000000-0000-4000-8000-000000000003',
    '10000000-0000-4000-8000-000000000003',
    'production', 'production_subject_historical', 'ACTIVE',
    'DUAL_AUTH', pg_catalog.clock_timestamp()
  ),
  (
    '20000000-0000-4000-8000-000000000004',
    '10000000-0000-4000-8000-000000000004',
    'production', 'production_subject_bound_elsewhere', 'ACTIVE',
    'DUAL_AUTH', pg_catalog.clock_timestamp()
  );

select pg_temp.assert_true(
  (select ownership_state = 'VERIFIED'
   from public.resolve_caissa_identity_ownership(
     'legacy_subject_verified', 'legacy_development'
   )),
  'direct Development authority was not verified'
);

select pg_temp.assert_true(
  (select ownership_state = 'VERIFIED'
   from public.resolve_caissa_identity_ownership(
     'production_subject_new', 'production'
   )),
  'new Production account without legacy history was not verified'
);

select pg_temp.assert_true(
  (select ownership_state = 'REVIEW_REQUIRED'
   from public.resolve_caissa_identity_ownership(
     'production_subject_historical', 'production'
   )),
  'historical Production cutover did not fail closed for review'
);

select pg_temp.assert_true(
  (select ownership_state = 'QUARANTINED'
   from public.resolve_caissa_identity_ownership(
     'production_subject_bound_elsewhere', 'production'
   )),
  'binding/user canonical-subject mismatch was not quarantined'
);

select pg_temp.assert_true(
  (select ownership_state = 'UNRESOLVED'
   from public.resolve_caissa_identity_ownership(
     'production_subject_new', 'legacy_development'
   )),
  'cross-authority lookup resolved an identity'
);

insert into public.caissa_identity_ownership_reviews(
  binding_id, user_id, status, reason_code, case_reference_hash
) values (
  '20000000-0000-4000-8000-000000000003',
  '10000000-0000-4000-8000-000000000003',
  'VERIFIED', 'DUAL_AUTH_REVIEWED', repeat('a', 64)
);

select pg_temp.assert_true(
  (select ownership_state = 'VERIFIED'
   from public.resolve_caissa_identity_ownership(
     'production_subject_historical', 'production'
   )),
  'an explicit restricted review could not verify ownership'
);

select pg_temp.assert_true(
  not pg_catalog.has_table_privilege(
    'authenticated', 'public.caissa_identity_ownership_reviews', 'SELECT'
  )
  and not pg_catalog.has_table_privilege(
    'anon', 'public.caissa_identity_ownership_reviews', 'SELECT'
  )
  and not pg_catalog.has_function_privilege(
    'authenticated',
    'public.resolve_caissa_identity_ownership(text,text)',
    'EXECUTE'
  )
  and pg_catalog.has_function_privilege(
    'service_role',
    'public.resolve_caissa_identity_ownership(text,text)',
    'EXECUTE'
  ),
  'ownership review controls are exposed to browser roles'
);

\echo CAISSA_IDENTITY_ORGANIZATION_POSTGRES_PASS
