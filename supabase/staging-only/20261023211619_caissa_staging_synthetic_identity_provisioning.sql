-- CAISSA Staging-only synthetic identity provisioning contract.
--
-- This artifact is intentionally outside supabase/migrations. It must never be
-- included in the ordinary Production migration chain. Apply it only to the
-- exact authorized Staging project after an action-time project-ref check.
--
-- The hosted Staging project reference aqizagaskicotorfpwfn was independently
-- resolved to PostgreSQL system identifier 7678069749886157684 on 2026-10-23.
-- The intrinsic cluster identifier is enforced here because hosted PostgreSQL
-- does not expose the Supabase project ref as a database setting.

begin;

do $$
declare
  v_system_identifier text;
begin
  select s.system_identifier::text into v_system_identifier
  from pg_catalog.pg_control_system() s;

  if pg_catalog.current_database() <> 'postgres'
     or v_system_identifier <> '7678069749886157684' then
    raise exception using
      errcode = '42501',
      message = 'CAISSA_STAGING_PROJECT_MISMATCH',
      detail = pg_catalog.format(
        'Expected project aqizagaskicotorfpwfn / cluster 7678069749886157684; received database %s / cluster %s.',
        pg_catalog.current_database(), coalesce(v_system_identifier, '<unavailable>')
      );
  end if;
end;
$$;

create schema if not exists caissa_staging_private;
revoke all on schema caissa_staging_private from public, anon, authenticated, service_role;

create table caissa_staging_private.installation_guard (
  singleton boolean primary key default true check (singleton),
  project_ref text not null unique check (project_ref = 'aqizagaskicotorfpwfn'),
  system_identifier text not null unique check (system_identifier = '7678069749886157684'),
  installed_at timestamptz not null default pg_catalog.clock_timestamp()
);
insert into caissa_staging_private.installation_guard(project_ref, system_identifier)
values ('aqizagaskicotorfpwfn', '7678069749886157684')
on conflict (singleton) do update
set project_ref = excluded.project_ref,
    system_identifier = excluded.system_identifier;

alter table caissa_staging_private.installation_guard enable row level security;
alter table caissa_staging_private.installation_guard force row level security;
revoke all on table caissa_staging_private.installation_guard
  from public, anon, authenticated, service_role;

create or replace function caissa_staging_private.assert_staging_project()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_system_identifier text;
begin
  select s.system_identifier::text into v_system_identifier
  from pg_catalog.pg_control_system() s;

  if pg_catalog.current_database() <> 'postgres'
     or v_system_identifier <> '7678069749886157684'
     or not exists (
       select 1
       from caissa_staging_private.installation_guard g
       where g.singleton
         and g.project_ref = 'aqizagaskicotorfpwfn'
         and g.system_identifier = v_system_identifier
     ) then
    raise exception using
      errcode = '42501',
      message = 'CAISSA_STAGING_PROJECT_MISMATCH';
  end if;
end;
$$;

create or replace function caissa_staging_private.expected_synthetic_run_id(
  p_subject_a text,
  p_user_id_a uuid,
  p_authorization_reference_hash_a text,
  p_subject_b text,
  p_user_id_b uuid,
  p_authorization_reference_hash_b text
)
returns uuid
language sql
immutable
strict
parallel safe
set search_path = ''
as $$
  select (
    pg_catalog.substr(digest_hex, 1, 8) || '-' ||
    pg_catalog.substr(digest_hex, 9, 4) || '-8' ||
    pg_catalog.substr(digest_hex, 14, 3) || '-a' ||
    pg_catalog.substr(digest_hex, 18, 3) || '-' ||
    pg_catalog.substr(digest_hex, 21, 12)
  )::uuid
  from (
    select pg_catalog.encode(
      extensions.digest(
        pg_catalog.concat_ws(
          '|',
          'CAISSA_STAGING_SYNTHETIC_RUN_V1',
          p_subject_a,
          p_user_id_a::text,
          p_authorization_reference_hash_a,
          p_subject_b,
          p_user_id_b::text,
          p_authorization_reference_hash_b
        ),
        'sha256'
      ),
      'hex'
    ) as digest_hex
  ) manifest;
$$;

create table caissa_staging_private.synthetic_identity_authorizations (
  run_id uuid not null,
  fixture_slot text not null check (fixture_slot in ('A', 'B')),
  external_subject text not null,
  user_id uuid not null,
  authorization_reference_hash text not null,
  reason text not null,
  status text not null default 'AUTHORIZED'
    check (status in ('AUTHORIZED', 'PROVISIONED', 'CLEANED', 'REVOKED')),
  binding_id uuid,
  authorized_at timestamptz not null default pg_catalog.clock_timestamp(),
  expires_at timestamptz not null,
  provisioned_at timestamptz,
  cleaned_at timestamptz,
  primary key (run_id, external_subject),
  unique (run_id, fixture_slot),
  unique (external_subject),
  unique (user_id),
  check (external_subject ~ '^user_[A-Za-z0-9]{20,250}$'),
  check (authorization_reference_hash ~ '^[0-9a-f]{64}$'),
  check (pg_catalog.length(pg_catalog.btrim(reason)) between 20 and 500),
  check (expires_at > authorized_at and expires_at <= authorized_at + interval '24 hours'),
  check (
    (status = 'AUTHORIZED' and binding_id is null and provisioned_at is null and cleaned_at is null)
    or (status = 'PROVISIONED' and binding_id is not null and provisioned_at is not null and cleaned_at is null)
    or (status = 'CLEANED' and binding_id is not null and provisioned_at is not null and cleaned_at is not null)
    or (status = 'REVOKED' and cleaned_at is null)
  )
);

alter table caissa_staging_private.synthetic_identity_authorizations enable row level security;
alter table caissa_staging_private.synthetic_identity_authorizations force row level security;
revoke all on table caissa_staging_private.synthetic_identity_authorizations
  from public, anon, authenticated, service_role;

create or replace function caissa_staging_private.authorize_synthetic_identity(
  p_run_id uuid,
  p_fixture_slot text,
  p_external_subject text,
  p_user_id uuid,
  p_authorization_reference_hash text,
  p_reason text,
  p_expires_at timestamptz,
  p_manifest_subject_a text,
  p_manifest_user_id_a uuid,
  p_manifest_authorization_reference_hash_a text,
  p_manifest_subject_b text,
  p_manifest_user_id_b uuid,
  p_manifest_authorization_reference_hash_b text
)
returns table(success boolean, code text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing caissa_staging_private.synthetic_identity_authorizations%rowtype;
  v_reason text := pg_catalog.btrim(p_reason);
  v_expected_run_id uuid;
begin
  perform caissa_staging_private.assert_staging_project();

  if p_run_id is null
     or p_fixture_slot is null
     or p_fixture_slot not in ('A', 'B')
     or p_user_id is null
     or p_external_subject is null
     or p_external_subject !~ '^user_[A-Za-z0-9]{20,250}$'
     or p_authorization_reference_hash !~ '^[0-9a-f]{64}$'
     or pg_catalog.length(v_reason) not between 20 and 500
     or p_expires_at <= pg_catalog.clock_timestamp()
     or p_expires_at > pg_catalog.clock_timestamp() + interval '24 hours' then
    return query select false, 'INVALID_FIXTURE_AUTHORIZATION'::text;
    return;
  end if;

  if p_manifest_subject_a is null
     or p_manifest_subject_a !~ '^user_[A-Za-z0-9]{20,250}$'
     or p_manifest_user_id_a is null
     or p_manifest_authorization_reference_hash_a !~ '^[0-9a-f]{64}$'
     or p_manifest_subject_b is null
     or p_manifest_subject_b !~ '^user_[A-Za-z0-9]{20,250}$'
     or p_manifest_user_id_b is null
     or p_manifest_authorization_reference_hash_b !~ '^[0-9a-f]{64}$'
     or p_manifest_subject_a = p_manifest_subject_b
     or p_manifest_user_id_a = p_manifest_user_id_b then
    return query select false, 'INVALID_RUN_MANIFEST'::text;
    return;
  end if;

  v_expected_run_id := caissa_staging_private.expected_synthetic_run_id(
    p_manifest_subject_a,
    p_manifest_user_id_a,
    p_manifest_authorization_reference_hash_a,
    p_manifest_subject_b,
    p_manifest_user_id_b,
    p_manifest_authorization_reference_hash_b
  );

  if p_run_id <> v_expected_run_id
     or (
       p_fixture_slot = 'A'
       and (
         p_external_subject <> p_manifest_subject_a
         or p_user_id <> p_manifest_user_id_a
         or p_authorization_reference_hash <> p_manifest_authorization_reference_hash_a
       )
     )
     or (
       p_fixture_slot = 'B'
       and (
         p_external_subject <> p_manifest_subject_b
         or p_user_id <> p_manifest_user_id_b
         or p_authorization_reference_hash <> p_manifest_authorization_reference_hash_b
       )
     ) then
    return query select false, 'RUN_MANIFEST_MISMATCH'::text;
    return;
  end if;

  select a.* into v_existing
  from caissa_staging_private.synthetic_identity_authorizations a
  where (a.run_id = p_run_id and a.fixture_slot = p_fixture_slot)
     or a.external_subject = p_external_subject
     or a.user_id = p_user_id
  order by case
    when a.run_id = p_run_id
      and a.fixture_slot = p_fixture_slot
      and a.external_subject = p_external_subject then 0
    else 1
  end
  limit 1
  for update;

  if v_existing.run_id is not null then
    if v_existing.run_id = p_run_id
       and v_existing.fixture_slot = p_fixture_slot
       and v_existing.external_subject = p_external_subject
       and v_existing.user_id = p_user_id
       and v_existing.authorization_reference_hash = p_authorization_reference_hash
       and v_existing.reason = v_reason
       and v_existing.expires_at = p_expires_at
       and v_existing.status in ('AUTHORIZED', 'PROVISIONED') then
      return query select true, 'FIXTURE_AUTHORIZATION_EXISTS'::text;
    else
      return query select false, 'FIXTURE_AUTHORIZATION_CONFLICT'::text;
    end if;
    return;
  end if;

  if exists (
       select 1 from public.users u
       where u.id = p_user_id or u.clerk_id = p_external_subject
     )
     or exists (
       select 1 from public.identity_bindings b
       where b.user_id = p_user_id or b.external_subject = p_external_subject
     ) then
    return query select false, 'HISTORICAL_OR_BOUND_IDENTITY'::text;
    return;
  end if;

  insert into caissa_staging_private.synthetic_identity_authorizations (
    run_id, fixture_slot, external_subject, user_id, authorization_reference_hash,
    reason, expires_at
  ) values (
    p_run_id, p_fixture_slot, p_external_subject, p_user_id, p_authorization_reference_hash,
    v_reason, p_expires_at
  );

  return query select true, 'FIXTURE_AUTHORIZED'::text;
exception
  when unique_violation then
    return query select false, 'FIXTURE_AUTHORIZATION_CONFLICT'::text;
end;
$$;

create or replace function caissa_staging_private.provision_synthetic_identity(
  p_run_id uuid,
  p_external_subject text,
  p_user_id uuid,
  p_authorization_reference_hash text,
  p_email text default null
)
returns table(success boolean, code text, user_id uuid, binding_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_authorization caissa_staging_private.synthetic_identity_authorizations%rowtype;
  v_binding_id uuid;
  v_email text := nullif(pg_catalog.btrim(p_email), '');
  v_exact boolean;
begin
  perform caissa_staging_private.assert_staging_project();

  if p_run_id is null
     or p_user_id is null
     or p_external_subject is null
     or p_external_subject !~ '^user_[A-Za-z0-9]{20,250}$'
     or p_authorization_reference_hash !~ '^[0-9a-f]{64}$'
     or (v_email is not null and pg_catalog.length(v_email) not between 3 and 320) then
    return query select false, 'INVALID_FIXTURE_PROVISION_REQUEST'::text, null::uuid, null::uuid;
    return;
  end if;

  select a.* into v_authorization
  from caissa_staging_private.synthetic_identity_authorizations a
  where a.run_id = p_run_id and a.external_subject = p_external_subject
  for update;

  if v_authorization.run_id is null
     or v_authorization.user_id <> p_user_id
     or v_authorization.authorization_reference_hash <> p_authorization_reference_hash then
    return query select false, 'FIXTURE_NOT_AUTHORIZED'::text, null::uuid, null::uuid;
    return;
  end if;

  if v_authorization.status = 'PROVISIONED' then
    select exists (
      select 1
      from public.users u
      join public.identity_bindings b on b.user_id = u.id
      join public.caissa_identity_ownership_reviews r
        on r.binding_id = b.id and r.user_id = u.id
      where u.id = p_user_id
        and u.clerk_id = p_external_subject
        and b.id = v_authorization.binding_id
        and b.provider = 'clerk'
        and b.environment = 'legacy_development'
        and b.external_subject = p_external_subject
        and b.status = 'ACTIVE'
        and b.proof_method = 'NEW_ACCOUNT'
        and b.metadata @> pg_catalog.jsonb_build_object(
          'staging_synthetic', true, 'run_id', p_run_id,
          'fixture_slot', v_authorization.fixture_slot
        )
        and r.status = 'VERIFIED'
        and r.reason_code = 'NEW_ACCOUNT'
        and r.case_reference_hash = p_authorization_reference_hash
    ) into v_exact;
    if v_exact then
      return query select true, 'FIXTURE_ALREADY_PROVISIONED'::text,
        p_user_id, v_authorization.binding_id;
    else
      return query select false, 'FIXTURE_PARTIAL_STATE_REVIEW_REQUIRED'::text,
        null::uuid, null::uuid;
    end if;
    return;
  end if;

  if v_authorization.status <> 'AUTHORIZED'
     or v_authorization.expires_at <= pg_catalog.clock_timestamp() then
    return query select false, 'FIXTURE_AUTHORIZATION_INACTIVE'::text, null::uuid, null::uuid;
    return;
  end if;

  if exists (
       select 1 from public.users u
       where u.id = p_user_id or u.clerk_id = p_external_subject
     )
     or exists (
       select 1 from public.identity_bindings b
       where b.user_id = p_user_id or b.external_subject = p_external_subject
     ) then
    return query select false, 'HISTORICAL_OR_BOUND_IDENTITY'::text, null::uuid, null::uuid;
    return;
  end if;

  insert into public.users(id, clerk_id, email)
  values (p_user_id, p_external_subject, v_email);

  insert into public.identity_bindings(
    user_id, provider, environment, external_subject, status,
    proof_method, metadata, activated_at
  ) values (
    p_user_id, 'clerk', 'legacy_development', p_external_subject, 'ACTIVE',
    'NEW_ACCOUNT',
    pg_catalog.jsonb_build_object(
      'staging_synthetic', true,
      'run_id', p_run_id,
      'fixture_slot', v_authorization.fixture_slot,
      'authorization_reference_hash', p_authorization_reference_hash
    ),
    pg_catalog.clock_timestamp()
  ) returning id into v_binding_id;

  insert into public.caissa_identity_ownership_reviews(
    binding_id, user_id, status, reason_code, case_reference_hash
  ) values (
    v_binding_id, p_user_id, 'VERIFIED', 'NEW_ACCOUNT',
    p_authorization_reference_hash
  );

  update caissa_staging_private.synthetic_identity_authorizations a
  set status = 'PROVISIONED', binding_id = v_binding_id,
      provisioned_at = pg_catalog.clock_timestamp()
  where a.run_id = p_run_id and a.external_subject = p_external_subject;

  return query select true, 'FIXTURE_PROVISIONED'::text, p_user_id, v_binding_id;
exception
  when unique_violation then
    return query select false, 'FIXTURE_CONFLICT_REVIEW_REQUIRED'::text, null::uuid, null::uuid;
end;
$$;

create or replace function caissa_staging_private.cleanup_synthetic_identity(
  p_run_id uuid,
  p_external_subject text,
  p_user_id uuid,
  p_authorization_reference_hash text,
  p_confirmation text
)
returns table(success boolean, code text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_authorization caissa_staging_private.synthetic_identity_authorizations%rowtype;
  v_user public.users%rowtype;
  v_binding public.identity_bindings%rowtype;
  v_review public.caissa_identity_ownership_reviews%rowtype;
begin
  perform caissa_staging_private.assert_staging_project();

  if p_confirmation <> 'CLEAN STAGING SYNTHETIC FIXTURE' then
    return query select false, 'FIXTURE_CLEANUP_CONFIRMATION_REQUIRED'::text;
    return;
  end if;

  select a.* into v_authorization
  from caissa_staging_private.synthetic_identity_authorizations a
  where a.run_id = p_run_id and a.external_subject = p_external_subject
  for update;

  if v_authorization.run_id is null
     or v_authorization.user_id <> p_user_id
     or v_authorization.authorization_reference_hash <> p_authorization_reference_hash then
    return query select false, 'FIXTURE_NOT_AUTHORIZED'::text;
    return;
  end if;

  if v_authorization.status = 'CLEANED' then
    if not exists (
         select 1 from public.users u
         where u.id = p_user_id or u.clerk_id = p_external_subject
       )
       and not exists (
         select 1 from public.identity_bindings b
         where b.user_id = p_user_id or b.external_subject = p_external_subject
       ) then
      return query select true, 'FIXTURE_ALREADY_CLEAN'::text;
    else
      return query select false, 'FIXTURE_PARTIAL_STATE_REVIEW_REQUIRED'::text;
    end if;
    return;
  end if;

  if v_authorization.status <> 'PROVISIONED' then
    return query select false, 'FIXTURE_NOT_PROVISIONED'::text;
    return;
  end if;

  select u.* into v_user from public.users u where u.id = p_user_id for update;
  select b.* into v_binding
  from public.identity_bindings b where b.id = v_authorization.binding_id for update;
  select r.* into v_review
  from public.caissa_identity_ownership_reviews r
  where r.binding_id = v_authorization.binding_id and r.user_id = p_user_id
  for update;

  if v_user.id is null
     or v_user.clerk_id <> p_external_subject
     or v_user.created_at < v_authorization.authorized_at
     or v_user.is_premium is true
     or v_user.stripe_customer_id is not null
     or v_user.role not in ('member', 'user')
     or v_binding.id is null
     or v_binding.user_id <> p_user_id
     or v_binding.provider <> 'clerk'
     or v_binding.environment <> 'legacy_development'
     or v_binding.external_subject <> p_external_subject
     or v_binding.status <> 'ACTIVE'
     or v_binding.proof_method <> 'NEW_ACCOUNT'
     or not (v_binding.metadata @> pg_catalog.jsonb_build_object(
       'staging_synthetic', true, 'run_id', p_run_id,
       'fixture_slot', v_authorization.fixture_slot
     ))
     or v_review.id is null
     or v_review.status <> 'VERIFIED'
     or v_review.reason_code <> 'NEW_ACCOUNT'
     or v_review.case_reference_hash <> p_authorization_reference_hash
     or exists (
       select 1 from public.identity_bindings other
       where other.id <> v_binding.id
         and (other.user_id = p_user_id or other.external_subject = p_external_subject)
     ) then
    return query select false, 'FIXTURE_CLEANUP_SCOPE_MISMATCH'::text;
    return;
  end if;

  delete from public.users u where u.id = p_user_id and u.clerk_id = p_external_subject;
  if not found then
    return query select false, 'FIXTURE_CLEANUP_SCOPE_MISMATCH'::text;
    return;
  end if;

  update caissa_staging_private.synthetic_identity_authorizations a
  set status = 'CLEANED', cleaned_at = pg_catalog.clock_timestamp()
  where a.run_id = p_run_id and a.external_subject = p_external_subject;

  return query select true, 'FIXTURE_CLEANED'::text;
exception
  when foreign_key_violation then
    return query select false, 'FIXTURE_PROTECTED_DEPENDENCY_PRESENT'::text;
end;
$$;

create or replace function caissa_staging_private.finalize_synthetic_identity_cleanup(
  p_run_id uuid,
  p_external_subject text,
  p_user_id uuid,
  p_authorization_reference_hash text,
  p_external_receipt_hash text
)
returns table(success boolean, code text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_authorization caissa_staging_private.synthetic_identity_authorizations%rowtype;
begin
  perform caissa_staging_private.assert_staging_project();

  if p_external_receipt_hash !~ '^[0-9a-f]{64}$' then
    return query select false, 'FIXTURE_RECEIPT_REQUIRED'::text;
    return;
  end if;

  select a.* into v_authorization
  from caissa_staging_private.synthetic_identity_authorizations a
  where a.run_id = p_run_id and a.external_subject = p_external_subject
  for update;

  if v_authorization.run_id is null
     or v_authorization.user_id <> p_user_id
     or v_authorization.authorization_reference_hash <> p_authorization_reference_hash
     or v_authorization.status <> 'CLEANED' then
    return query select false, 'FIXTURE_CLEANUP_NOT_FINALIZABLE'::text;
    return;
  end if;

  if exists (
       select 1 from public.users u
       where u.id = p_user_id or u.clerk_id = p_external_subject
     )
     or exists (
       select 1 from public.identity_bindings b
       where b.user_id = p_user_id or b.external_subject = p_external_subject
     ) then
    return query select false, 'FIXTURE_RESIDUE_PRESENT'::text;
    return;
  end if;

  -- The receipt is deliberately retained in the external private run ledger,
  -- not in Staging, so finalization can restore the exact database baseline.
  delete from caissa_staging_private.synthetic_identity_authorizations a
  where a.run_id = p_run_id and a.external_subject = p_external_subject;

  return query select true, 'FIXTURE_CLEANUP_FINALIZED'::text;
end;
$$;

revoke all on function caissa_staging_private.authorize_synthetic_identity(
  uuid, text, text, uuid, text, text, timestamptz,
  text, uuid, text, text, uuid, text
) from public, anon, authenticated, service_role;
revoke all on function caissa_staging_private.assert_staging_project()
  from public, anon, authenticated, service_role;
revoke all on function caissa_staging_private.expected_synthetic_run_id(
  text, uuid, text, text, uuid, text
) from public, anon, authenticated, service_role;
revoke all on function caissa_staging_private.provision_synthetic_identity(
  uuid, text, uuid, text, text
) from public, anon, authenticated, service_role;
revoke all on function caissa_staging_private.cleanup_synthetic_identity(
  uuid, text, uuid, text, text
) from public, anon, authenticated, service_role;
revoke all on function caissa_staging_private.finalize_synthetic_identity_cleanup(
  uuid, text, uuid, text, text
) from public, anon, authenticated, service_role;

comment on table caissa_staging_private.synthetic_identity_authorizations is
  'Staging-only, two-slot A/B per-run synthetic fixture authorization and lifecycle ledger. Never deploy through the ordinary Production migration chain.';
comment on table caissa_staging_private.installation_guard is
  'Fail-closed binding of this private mechanism to Supabase Staging project aqizagaskicotorfpwfn and its intrinsic PostgreSQL cluster identifier.';
comment on function caissa_staging_private.authorize_synthetic_identity(
  uuid, text, text, uuid, text, text, timestamptz,
  text, uuid, text, text, uuid, text
) is 'Owner-only direct-SQL authorization for one exact member of an immutable two-identity Staging run manifest.';
comment on function caissa_staging_private.expected_synthetic_run_id(
  text, uuid, text, text, uuid, text
) is 'Deterministically binds a run UUID to the complete ordered A/B subject, UUID, and authorization-hash manifest so a finalized run cannot be rebound.';
comment on function caissa_staging_private.provision_synthetic_identity(
  uuid, text, uuid, text, text
) is 'Owner-only exact provisioning for a previously authorized Staging synthetic identity; not exposed through PostgREST.';
comment on function caissa_staging_private.cleanup_synthetic_identity(
  uuid, text, uuid, text, text
) is 'Owner-only exact cleanup for rows created by the matching Staging synthetic authorization.';
comment on function caissa_staging_private.finalize_synthetic_identity_cleanup(
  uuid, text, uuid, text, text
) is 'Owner-only removal of the transient authorization after an external private-ledger receipt is recorded and database residue is zero.';

commit;
