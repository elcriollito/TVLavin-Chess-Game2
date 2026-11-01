\set ON_ERROR_STOP on

do $$ begin
  if not exists (select 1 from pg_catalog.pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_catalog.pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_catalog.pg_roles where rolname='service_role') then create role service_role nologin; end if;
end $$;

create extension if not exists pgcrypto;

create table public.users (
  id uuid primary key default gen_random_uuid(),
  clerk_id text not null unique,
  email text,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  updated_at timestamptz not null default pg_catalog.clock_timestamp()
);

\ir ../supabase/migrations/20260811_clerk_identity_remapping_foundation.sql
\ir ../supabase/migrations/20261018171912_caissa_identity_ownership_v1.sql

create table public.caissa_account_states (
  user_id uuid primary key references public.users(id) on delete cascade,
  state text not null check (state in ('ACTIVE','DELETION_PENDING','DELETED','REVIEW_REQUIRED'))
);

\ir ../supabase/migrations/20261101192942_caissa_public_registration_v1.sql

create or replace function pg_temp.assert_true(p_condition boolean, p_message text)
returns void language plpgsql as $$
begin
  if p_condition is not true then
    raise exception 'PUBLIC_REGISTRATION_ASSERTION_FAILED: %', p_message;
  end if;
end;
$$;

set role service_role;
create temp table first_result as
select * from public.register_caissa_clerk_identity(
  'user_3PublicRegistrationPostgres001',
  'New.Player@example.test',
  'new.player@example.test',
  'legacy_development'
);
create temp table retry_result as
select * from public.register_caissa_clerk_identity(
  'user_3PublicRegistrationPostgres001',
  'New.Player@example.test',
  'new.player@example.test',
  'legacy_development'
);
create temp table collision_result as
select * from public.register_caissa_clerk_identity(
  'user_3PublicRegistrationPostgres002',
  'new.player@example.test',
  'new.player@example.test',
  'legacy_development'
);
reset role;
insert into public.identity_enrollment_decisions(
  environment,external_subject,decision,reason,expires_at,retired_subject_hash
) values (
  'production','deleted_registration_fixture','DENIED','ACCOUNT_ERASURE_RETAINED',
  pg_catalog.clock_timestamp()+interval '1 day',
  pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to('user_3RetiredRegistrationPostgres001','UTF8')),'hex')
);
set role service_role;
create temp table retired_result as
select * from public.register_caissa_clerk_identity(
  'user_3RetiredRegistrationPostgres001',
  'retired.player@example.test',
  'retired.player@example.test',
  'production'
);
reset role;

select pg_temp.assert_true(
  (select success and code='REGISTRATION_COMPLETED' from first_result),
  'first enrollment did not complete'
);
select pg_temp.assert_true(
  (select success and code='REGISTRATION_ALREADY_COMPLETED' from retry_result),
  'retry was not idempotent'
);
select pg_temp.assert_true(
  (select first_result.user_id=retry_result.user_id and first_result.binding_id=retry_result.binding_id
   from first_result cross join retry_result),
  'retry returned a different identity'
);
select pg_temp.assert_true(
  (select not success and code='REGISTRATION_REVIEW_REQUIRED' from collision_result),
  'verified-email collision did not fail closed'
);
select pg_temp.assert_true(
  (select not success and code='REGISTRATION_REVIEW_REQUIRED' from retired_result),
  'retired subject tombstone did not fail closed'
);
select pg_temp.assert_true(
  (select pg_catalog.count(*)=1 from public.users where clerk_id like 'user_3PublicRegistrationPostgres%'),
  'registration created an unexpected number of users'
);
select pg_temp.assert_true(
  (select pg_catalog.count(*)=1
   from public.identity_bindings b
   join public.caissa_identity_ownership_reviews r on r.binding_id=b.id and r.user_id=b.user_id
   where b.external_subject='user_3PublicRegistrationPostgres001'
     and b.environment='legacy_development' and b.status='ACTIVE' and b.proof_method='NEW_ACCOUNT'
     and r.status='VERIFIED' and r.reason_code='NEW_ACCOUNT'),
  'binding and verified ownership review were not created atomically'
);
select pg_temp.assert_true(
  (select ownership_state='VERIFIED'
   from public.resolve_caissa_identity_ownership(
     'user_3PublicRegistrationPostgres001','legacy_development'
   )),
  'new identity does not resolve as VERIFIED'
);
select pg_temp.assert_true(
  not pg_catalog.has_function_privilege('anon','public.register_caissa_clerk_identity(text,text,text,text)','EXECUTE')
  and not pg_catalog.has_function_privilege('authenticated','public.register_caissa_clerk_identity(text,text,text,text)','EXECUTE')
  and pg_catalog.has_function_privilege('service_role','public.register_caissa_clerk_identity(text,text,text,text)','EXECUTE'),
  'registration function privileges are not service-role only'
);
select pg_temp.assert_true(
  not exists (
    select 1 from public.identity_migration_audit
    where action='PUBLIC_NEW_ACCOUNT_PROVISIONED'
      and detail::text ilike '%new.player@example.test%'
  ),
  'registration audit leaked the verified email'
);

\echo CAISSA_PUBLIC_REGISTRATION_POSTGRES_PASS
