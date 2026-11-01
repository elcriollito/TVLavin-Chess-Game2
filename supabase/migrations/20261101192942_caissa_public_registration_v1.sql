-- CAISSA public registration v1.
-- Server-only, fail-closed enrollment for a verified Clerk identity.

begin;

do $$
begin
  if pg_catalog.to_regclass('public.users') is null
     or pg_catalog.to_regclass('public.identity_bindings') is null
     or pg_catalog.to_regclass('public.identity_migration_challenges') is null
     or pg_catalog.to_regclass('public.identity_enrollment_decisions') is null
     or pg_catalog.to_regclass('public.identity_migration_audit') is null
     or pg_catalog.to_regclass('public.caissa_identity_ownership_reviews') is null
     or pg_catalog.to_regclass('public.caissa_account_states') is null then
    raise exception using
      errcode = 'P0001',
      message = 'CAISSA_PUBLIC_REGISTRATION_PREREQUISITE_MISSING';
  end if;
end;
$$;

-- Staging may trail the Production Account Control hardening that introduced
-- sanitized subject tombstones. Add only the compatible column/index needed
-- by this enrollment gate; both statements are no-ops on the certified
-- Production baseline.
alter table public.identity_enrollment_decisions
  add column if not exists retired_subject_hash text;
create unique index if not exists identity_enrollment_decisions_retired_subject_hash_idx
  on public.identity_enrollment_decisions(environment, retired_subject_hash)
  where retired_subject_hash is not null;

create or replace function public.register_caissa_clerk_identity(
  p_external_subject text,
  p_email text,
  p_email_key text,
  p_environment text
)
returns table(success boolean, code text, user_id uuid, binding_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_subject text := pg_catalog.btrim(p_external_subject);
  v_email text := pg_catalog.btrim(p_email);
  v_email_key text := pg_catalog.lower(pg_catalog.btrim(p_email_key));
  v_subject_hash text;
  v_user_id uuid;
  v_binding_id uuid;
  v_existing_binding public.identity_bindings%rowtype;
  v_existing_user public.users%rowtype;
  v_existing_review public.caissa_identity_ownership_reviews%rowtype;
  v_account_state text;
begin
  if p_environment not in ('legacy_development', 'production')
     or v_subject is null
     or pg_catalog.char_length(v_subject) not between 8 and 255
     or v_subject !~ '^user_[A-Za-z0-9]+$'
     or v_email is null
     or pg_catalog.char_length(v_email) not between 3 and 254
     or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
     or v_email_key is distinct from pg_catalog.lower(v_email) then
    return query select false, 'REGISTRATION_INPUT_INVALID'::text, null::uuid, null::uuid;
    return;
  end if;

  v_subject_hash := pg_catalog.encode(
    pg_catalog.sha256(pg_catalog.convert_to(v_subject, 'UTF8')),
    'hex'
  );

  -- Serialize both the provider identity and the verified primary email. This
  -- makes retries idempotent and prevents two concurrent Clerk subjects from
  -- creating separate CAISSA UUIDs for the same email.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('caissa-public-registration:subject:' || p_environment || ':' || v_subject, 0)
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('caissa-public-registration:email:' || v_email_key, 0)
  );

  select b.* into v_existing_binding
  from public.identity_bindings b
  where b.provider = 'clerk'
    and b.environment = p_environment
    and b.external_subject = v_subject
  for update;

  if v_existing_binding.id is not null then
    select u.* into v_existing_user
    from public.users u
    where u.id = v_existing_binding.user_id
    for update;

    select r.* into v_existing_review
    from public.caissa_identity_ownership_reviews r
    where r.binding_id = v_existing_binding.id
      and r.user_id = v_existing_binding.user_id
    for update;

    select s.state into v_account_state
    from public.caissa_account_states s
    where s.user_id = v_existing_binding.user_id
    for update;

    if v_existing_binding.status = 'ACTIVE'
       and v_existing_binding.proof_method = 'NEW_ACCOUNT'
       and v_existing_user.id is not null
       and v_existing_user.clerk_id = v_subject
       and pg_catalog.lower(pg_catalog.btrim(v_existing_user.email)) = v_email_key
       and v_existing_review.status = 'VERIFIED'
       and v_existing_review.reason_code = 'NEW_ACCOUNT'
       and coalesce(v_account_state, 'ACTIVE') = 'ACTIVE'
       and not exists (
         select 1 from public.identity_bindings other
         where other.user_id = v_existing_binding.user_id
           and other.id <> v_existing_binding.id
           and other.status = 'ACTIVE'
       ) then
      return query select true, 'REGISTRATION_ALREADY_COMPLETED'::text,
        v_existing_binding.user_id, v_existing_binding.id;
      return;
    end if;

    return query select false, 'REGISTRATION_REVIEW_REQUIRED'::text, null::uuid, null::uuid;
    return;
  end if;

  -- Any prior CAISSA identity evidence is a manual-review case. Public
  -- registration never transfers, merges, or revives historical identities.
  if exists (
       select 1 from public.identity_bindings b
       where b.provider = 'clerk' and b.external_subject = v_subject
     )
     or exists (select 1 from public.users u where u.clerk_id = v_subject)
     or exists (
       select 1 from public.identity_migration_challenges c
       where c.expected_new_subject_hash = v_subject_hash
     )
     or exists (
       select 1 from public.identity_enrollment_decisions e
       where e.external_subject = v_subject
          or e.retired_subject_hash = v_subject_hash
     )
     or exists (
       select 1 from public.identity_migration_audit a
       where a.detail->>'subject_hash' = v_subject_hash
     )
     or exists (
       select 1 from public.users u
       where u.email is not null
         and pg_catalog.lower(pg_catalog.btrim(u.email)) = v_email_key
     ) then
    return query select false, 'REGISTRATION_REVIEW_REQUIRED'::text, null::uuid, null::uuid;
    return;
  end if;

  insert into public.users(clerk_id, email, created_at, updated_at)
  values (v_subject, v_email, pg_catalog.clock_timestamp(), pg_catalog.clock_timestamp())
  returning id into v_user_id;

  insert into public.identity_bindings(
    user_id, provider, environment, external_subject, status,
    proof_method, activated_at, metadata
  ) values (
    v_user_id, 'clerk', p_environment, v_subject, 'ACTIVE',
    'NEW_ACCOUNT', pg_catalog.clock_timestamp(),
    pg_catalog.jsonb_build_object('enrollment', 'PUBLIC_REGISTRATION_V1')
  ) returning id into v_binding_id;

  insert into public.caissa_identity_ownership_reviews(
    binding_id, user_id, status, reason_code, case_reference_hash
  ) values (
    v_binding_id,
    v_user_id,
    'VERIFIED',
    'NEW_ACCOUNT',
    pg_catalog.encode(
      pg_catalog.sha256(pg_catalog.convert_to('PUBLIC_REGISTRATION_V1:' || v_binding_id::text, 'UTF8')),
      'hex'
    )
  );

  insert into public.identity_migration_audit(user_id, action, binding_id, reason, detail)
  values (
    v_user_id,
    'PUBLIC_NEW_ACCOUNT_PROVISIONED',
    v_binding_id,
    'PUBLIC_REGISTRATION_V1',
    pg_catalog.jsonb_build_object('environment', p_environment, 'subject_hash', v_subject_hash)
  );

  return query select true, 'REGISTRATION_COMPLETED'::text, v_user_id, v_binding_id;
exception
  when unique_violation then
    return query select false, 'REGISTRATION_REVIEW_REQUIRED'::text, null::uuid, null::uuid;
end;
$$;

revoke all on function public.register_caissa_clerk_identity(text, text, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.register_caissa_clerk_identity(text, text, text, text)
  to service_role;

comment on function public.register_caissa_clerk_identity(text, text, text, text) is
  'Atomically provisions one brand-new CAISSA UUID from a server-verified Clerk user and primary verified email; historical or ambiguous identities fail closed.';

commit;
