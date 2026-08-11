-- SEC-005 identity remapping foundation.
-- Additive only. Apply after a read-only data-quality review and rehearsal.

create extension if not exists pgcrypto;

create table if not exists public.identity_bindings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  provider text not null default 'clerk' check (provider = 'clerk'),
  environment text not null check (environment in ('legacy_development', 'production')),
  external_subject text not null,
  status text not null check (status in ('PENDING', 'VERIFIED', 'ACTIVE', 'RETIRED', 'CONFLICT', 'REVOKED')),
  proof_method text not null check (proof_method in ('LEGACY_BACKFILL', 'DUAL_AUTH', 'SESSION_HANDOFF', 'STRIPE_ASSISTED', 'MANUAL_RECOVERY', 'NEW_ACCOUNT')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  activated_at timestamptz,
  retired_at timestamptz,
  unique (provider, environment, external_subject)
);

create unique index if not exists identity_bindings_one_active_environment
  on public.identity_bindings (user_id, provider, environment)
  where status = 'ACTIVE';
create index if not exists identity_bindings_user_id on public.identity_bindings(user_id);

create table if not exists public.identity_migration_challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  legacy_binding_id uuid not null references public.identity_bindings(id) on delete restrict,
  token_hash text not null unique,
  expected_new_subject_hash text not null,
  proof_method text not null check (proof_method in ('DUAL_AUTH', 'SESSION_HANDOFF', 'STRIPE_ASSISTED', 'MANUAL_RECOVERY')),
  status text not null default 'PENDING' check (status in ('PENDING', 'USED', 'EXPIRED', 'CONFLICT', 'REVOKED')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  check (expires_at > created_at)
);

create index if not exists identity_migration_challenges_user_id
  on public.identity_migration_challenges(user_id);
create index if not exists identity_migration_challenges_expected_subject
  on public.identity_migration_challenges(expected_new_subject_hash)
  where status = 'PENDING';

create table if not exists public.identity_enrollment_decisions (
  id uuid primary key default gen_random_uuid(),
  environment text not null check (environment = 'production'),
  external_subject text not null,
  decision text not null check (decision in ('APPROVED_NEW', 'DENIED', 'REVIEW')),
  reason text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  unique (environment, external_subject),
  check (expires_at > created_at)
);

create table if not exists public.identity_migration_audit (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete set null,
  action text not null,
  binding_id uuid references public.identity_bindings(id) on delete set null,
  challenge_id uuid references public.identity_migration_challenges(id) on delete set null,
  reason text,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.identity_bindings enable row level security;
alter table public.identity_migration_challenges enable row level security;
alter table public.identity_enrollment_decisions enable row level security;
alter table public.identity_migration_audit enable row level security;

insert into public.identity_bindings (
  user_id, provider, environment, external_subject, status, proof_method, activated_at
)
select id, 'clerk', 'legacy_development', clerk_id, 'ACTIVE', 'LEGACY_BACKFILL', now()
from public.users
where clerk_id is not null and clerk_id <> ''
on conflict (provider, environment, external_subject) do nothing;

create or replace function public.create_clerk_migration_challenge(
  p_user_id uuid,
  p_legacy_subject text,
  p_expected_new_subject text,
  p_token_hash text,
  p_expires_at timestamptz,
  p_proof_method text
)
returns table(success boolean, code text, challenge_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_binding public.identity_bindings%rowtype;
  v_challenge_id uuid;
begin
  if p_expires_at <= now() or p_expires_at > now() + interval '15 minutes' then
    return query select false, 'INVALID_EXPIRY'::text, null::uuid;
    return;
  end if;

  select * into v_binding
  from public.identity_bindings
  where user_id = p_user_id
    and provider = 'clerk'
    and environment = 'legacy_development'
    and external_subject = p_legacy_subject
    and status = 'ACTIVE'
  for update;

  if v_binding.id is null then
    return query select false, 'LEGACY_BINDING_NOT_ACTIVE'::text, null::uuid;
    return;
  end if;

  insert into public.identity_migration_challenges (
    user_id, legacy_binding_id, token_hash, expected_new_subject_hash,
    proof_method, expires_at
  ) values (
    p_user_id, v_binding.id, p_token_hash,
    pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p_expected_new_subject, 'UTF8')), 'hex'),
    p_proof_method, p_expires_at
  ) returning id into v_challenge_id;

  insert into public.identity_migration_audit(user_id, action, binding_id, challenge_id)
  values (p_user_id, 'CHALLENGE_CREATED', v_binding.id, v_challenge_id);

  return query select true, 'CHALLENGE_CREATED'::text, v_challenge_id;
exception
  when unique_violation then
    return query select false, 'CHALLENGE_CONFLICT'::text, null::uuid;
end;
$$;

create or replace function public.activate_clerk_identity_binding(
  p_token_hash text,
  p_new_external_subject text
)
returns table(success boolean, code text, user_id uuid, binding_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_challenge public.identity_migration_challenges%rowtype;
  v_legacy public.identity_bindings%rowtype;
  v_existing public.identity_bindings%rowtype;
  v_new_binding_id uuid;
begin
  select * into v_challenge
  from public.identity_migration_challenges
  where token_hash = p_token_hash
  for update;

  if v_challenge.id is null or v_challenge.status <> 'PENDING' then
    return query select false, 'CHALLENGE_INVALID_OR_USED'::text, null::uuid, null::uuid;
    return;
  end if;

  if v_challenge.expires_at <= now() then
    update public.identity_migration_challenges set status = 'EXPIRED' where id = v_challenge.id;
    return query select false, 'CHALLENGE_EXPIRED'::text, null::uuid, null::uuid;
    return;
  end if;

  if pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p_new_external_subject, 'UTF8')), 'hex') <> v_challenge.expected_new_subject_hash then
    return query select false, 'NEW_SUBJECT_MISMATCH'::text, null::uuid, null::uuid;
    return;
  end if;

  perform 1 from public.users where id = v_challenge.user_id for update;

  select * into v_legacy
  from public.identity_bindings b
  where b.id = v_challenge.legacy_binding_id
    and b.user_id = v_challenge.user_id
    and b.status = 'ACTIVE'
  for update;

  if v_legacy.id is null then
    update public.identity_migration_challenges set status = 'CONFLICT' where id = v_challenge.id;
    return query select false, 'LEGACY_BINDING_CONFLICT'::text, null::uuid, null::uuid;
    return;
  end if;

  select * into v_existing
  from public.identity_bindings
  where provider = 'clerk'
    and environment = 'production'
    and external_subject = p_new_external_subject
  for update;

  if v_existing.id is not null then
    update public.identity_migration_challenges set status = 'CONFLICT' where id = v_challenge.id;
    return query select false, 'TARGET_SUBJECT_ALREADY_BOUND'::text, null::uuid, null::uuid;
    return;
  end if;

  insert into public.identity_bindings (
    user_id, provider, environment, external_subject, status,
    proof_method, activated_at, metadata
  ) values (
    v_challenge.user_id, 'clerk', 'production', p_new_external_subject,
    'ACTIVE', v_challenge.proof_method, now(),
    jsonb_build_object('challenge_id', v_challenge.id)
  ) returning id into v_new_binding_id;

  update public.identity_bindings
  set status = 'RETIRED', retired_at = now()
  where id = v_legacy.id;

  update public.users
  set clerk_id = p_new_external_subject, updated_at = now()
  where id = v_challenge.user_id;

  update public.identity_migration_challenges
  set status = 'USED', used_at = now()
  where id = v_challenge.id;

  insert into public.identity_migration_audit(user_id, action, binding_id, challenge_id)
  values (v_challenge.user_id, 'BINDING_ACTIVATED', v_new_binding_id, v_challenge.id);

  return query select true, 'BINDING_ACTIVATED'::text, v_challenge.user_id, v_new_binding_id;
exception
  when unique_violation then
    return query select false, 'TARGET_SUBJECT_ALREADY_BOUND'::text, null::uuid, null::uuid;
end;
$$;

create or replace function public.rollback_clerk_identity_binding(
  p_user_id uuid,
  p_reason text
)
returns table(success boolean, code text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_legacy public.identity_bindings%rowtype;
  v_production public.identity_bindings%rowtype;
begin
  if coalesce(length(trim(p_reason)), 0) < 8 then
    return query select false, 'ROLLBACK_REASON_REQUIRED'::text;
    return;
  end if;

  perform 1 from public.users where id = p_user_id for update;

  select * into v_production from public.identity_bindings
  where user_id = p_user_id and environment = 'production' and status = 'ACTIVE'
  for update;
  select * into v_legacy from public.identity_bindings
  where user_id = p_user_id and environment = 'legacy_development' and status = 'RETIRED'
  order by retired_at desc limit 1 for update;

  if v_production.id is null or v_legacy.id is null then
    return query select false, 'ROLLBACK_BINDING_NOT_FOUND'::text;
    return;
  end if;

  update public.identity_bindings set status = 'REVOKED', retired_at = now() where id = v_production.id;
  update public.identity_bindings set status = 'ACTIVE', activated_at = now(), retired_at = null where id = v_legacy.id;
  update public.users set clerk_id = v_legacy.external_subject, updated_at = now() where id = p_user_id;
  insert into public.identity_migration_audit(user_id, action, binding_id, reason)
  values (p_user_id, 'BINDING_ROLLED_BACK', v_legacy.id, p_reason);

  return query select true, 'BINDING_ROLLED_BACK'::text;
end;
$$;

create or replace function public.resolve_clerk_identity_for_sync(p_external_subject text)
returns table(resolution text, user_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_subject_hash text := pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p_external_subject, 'UTF8')), 'hex');
begin
  return query
  select 'BOUND'::text, b.user_id
  from public.identity_bindings b
  where b.provider = 'clerk' and b.external_subject = p_external_subject and b.status = 'ACTIVE'
  limit 1;
  if found then return; end if;

  if exists (
    select 1 from public.identity_migration_challenges c
    where c.expected_new_subject_hash = v_subject_hash
      and c.status = 'PENDING' and c.expires_at > now()
  ) then
    return query select 'MIGRATION_REQUIRED'::text, null::uuid;
    return;
  end if;

  if exists (
    select 1 from public.identity_enrollment_decisions e
    where e.environment = 'production' and e.external_subject = p_external_subject
      and e.decision = 'APPROVED_NEW' and e.consumed_at is null and e.expires_at > now()
  ) then
    return query select 'APPROVED_NEW'::text, null::uuid;
    return;
  end if;

  return query select 'UNRESOLVED'::text, null::uuid;
end;
$$;

create or replace function public.provision_approved_clerk_identity(
  p_external_subject text,
  p_email text
)
returns table(success boolean, code text, user_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_decision public.identity_enrollment_decisions%rowtype;
  v_user_id uuid;
begin
  select * into v_decision from public.identity_enrollment_decisions
  where environment = 'production' and external_subject = p_external_subject
  for update;

  if v_decision.id is null or v_decision.decision <> 'APPROVED_NEW'
     or v_decision.consumed_at is not null or v_decision.expires_at <= now() then
    return query select false, 'NEW_ACCOUNT_NOT_APPROVED'::text, null::uuid;
    return;
  end if;

  if exists (select 1 from public.identity_bindings where provider = 'clerk' and external_subject = p_external_subject) then
    return query select false, 'SUBJECT_ALREADY_BOUND'::text, null::uuid;
    return;
  end if;

  insert into public.users(clerk_id, email) values (p_external_subject, p_email) returning id into v_user_id;
  insert into public.identity_bindings(user_id, provider, environment, external_subject, status, proof_method, activated_at)
  values (v_user_id, 'clerk', 'production', p_external_subject, 'ACTIVE', 'NEW_ACCOUNT', now());
  update public.identity_enrollment_decisions set consumed_at = now() where id = v_decision.id;
  insert into public.identity_migration_audit(user_id, action, reason)
  values (v_user_id, 'NEW_ACCOUNT_PROVISIONED', v_decision.reason);

  return query select true, 'NEW_ACCOUNT_PROVISIONED'::text, v_user_id;
exception
  when unique_violation then
    return query select false, 'SUBJECT_ALREADY_BOUND'::text, null::uuid;
end;
$$;

revoke all on public.identity_bindings from anon, authenticated;
revoke all on public.identity_migration_challenges from anon, authenticated;
revoke all on public.identity_enrollment_decisions from anon, authenticated;
revoke all on public.identity_migration_audit from anon, authenticated;
revoke execute on function public.create_clerk_migration_challenge(uuid, text, text, text, timestamptz, text) from public, anon, authenticated;
revoke execute on function public.activate_clerk_identity_binding(text, text) from public, anon, authenticated;
revoke execute on function public.rollback_clerk_identity_binding(uuid, text) from public, anon, authenticated;
revoke execute on function public.resolve_clerk_identity_for_sync(text) from public, anon, authenticated;
revoke execute on function public.provision_approved_clerk_identity(text, text) from public, anon, authenticated;
grant execute on function public.create_clerk_migration_challenge(uuid, text, text, text, timestamptz, text) to service_role;
grant execute on function public.activate_clerk_identity_binding(text, text) to service_role;
grant execute on function public.rollback_clerk_identity_binding(uuid, text) to service_role;
grant execute on function public.resolve_clerk_identity_for_sync(text) to service_role;
grant execute on function public.provision_approved_clerk_identity(text, text) to service_role;
