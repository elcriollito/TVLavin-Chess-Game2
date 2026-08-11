-- SEC-005 cutover tooling: persistent throttling and manual recovery.
-- Apply after 20260811_clerk_identity_remapping_foundation.sql.

create table if not exists public.identity_migration_throttles (
  scope_hash text primary key,
  window_started_at timestamptz not null,
  attempts integer not null check (attempts > 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.identity_manual_recovery_previews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  current_binding_id uuid not null references public.identity_bindings(id) on delete restrict,
  expected_current_subject_hash text not null,
  target_subject_hash text not null,
  confirmation_hash text not null,
  reason text not null check (length(trim(reason)) >= 20),
  status text not null default 'PENDING' check (status in ('PENDING', 'EXECUTED', 'EXPIRED', 'REVOKED')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  executed_at timestamptz,
  check (expires_at > created_at)
);

create index if not exists identity_manual_recovery_previews_user
  on public.identity_manual_recovery_previews(user_id, created_at desc);
create unique index if not exists identity_manual_recovery_one_pending
  on public.identity_manual_recovery_previews(user_id)
  where status = 'PENDING';

alter table public.identity_migration_throttles enable row level security;
alter table public.identity_manual_recovery_previews enable row level security;

create or replace function public._deny_identity_audit_mutation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'identity migration audit is append-only' using errcode = '55000';
end;
$$;

drop trigger if exists identity_migration_audit_append_only on public.identity_migration_audit;
create trigger identity_migration_audit_append_only
before update or delete on public.identity_migration_audit
for each row execute function public._deny_identity_audit_mutation();

create or replace function public.consume_identity_migration_throttle(
  p_scope_hash text,
  p_limit integer,
  p_window_seconds integer
)
returns table(allowed boolean, remaining integer, retry_after_seconds integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.identity_migration_throttles%rowtype;
  v_now timestamptz := clock_timestamp();
  v_inserted boolean;
begin
  if p_scope_hash !~ '^[0-9a-f]{64}$' or p_limit < 1 or p_limit > 100
     or p_window_seconds < 10 or p_window_seconds > 86400 then
    return query select false, 0, 60;
    return;
  end if;

  insert into public.identity_migration_throttles(scope_hash, window_started_at, attempts, updated_at)
  values (p_scope_hash, v_now, 1, v_now)
  on conflict (scope_hash) do nothing
  returning true into v_inserted;

  if coalesce(v_inserted, false) then
    return query select true, p_limit - 1, 0;
    return;
  end if;

  select t.* into v_row
  from public.identity_migration_throttles t
  where t.scope_hash = p_scope_hash
  for update;

  if v_row.window_started_at + make_interval(secs => p_window_seconds) <= v_now then
    update public.identity_migration_throttles t
    set window_started_at = v_now, attempts = 1, updated_at = v_now
    where t.scope_hash = p_scope_hash;
    return query select true, p_limit - 1, 0;
    return;
  end if;

  if v_row.attempts >= p_limit then
    return query select false, 0,
      greatest(1, ceil(extract(epoch from (v_row.window_started_at + make_interval(secs => p_window_seconds) - v_now)))::integer);
    return;
  end if;

  update public.identity_migration_throttles t
  set attempts = t.attempts + 1, updated_at = v_now
  where t.scope_hash = p_scope_hash;
  return query select true, p_limit - v_row.attempts - 1, 0;
end;
$$;

create or replace function public.preview_manual_clerk_identity_recovery(
  p_user_id uuid,
  p_target_subject text,
  p_reason text,
  p_confirmation_hash text,
  p_expires_at timestamptz
)
returns table(success boolean, code text, preview_id uuid, current_environment text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current public.identity_bindings%rowtype;
  v_target public.identity_bindings%rowtype;
  v_preview_id uuid;
begin
  if coalesce(length(trim(p_reason)), 0) < 20 then
    return query select false, 'DETAILED_REASON_REQUIRED'::text, null::uuid, null::text;
    return;
  end if;
  if coalesce(length(trim(p_target_subject)), 0) < 3
     or p_confirmation_hash !~ '^[0-9a-f]{64}$'
     or p_expires_at <= now() or p_expires_at > now() + interval '15 minutes' then
    return query select false, 'INVALID_RECOVERY_REQUEST'::text, null::uuid, null::text;
    return;
  end if;

  perform 1 from public.users u where u.id = p_user_id for update;
  if not found then
    return query select false, 'USER_NOT_FOUND'::text, null::uuid, null::text;
    return;
  end if;

  select b.* into v_current from public.identity_bindings b
  where b.user_id = p_user_id and b.provider = 'clerk' and b.status = 'ACTIVE'
  order by case when b.environment = 'legacy_development' then 0 else 1 end
  limit 1 for update;

  if v_current.id is null or v_current.environment <> 'legacy_development' then
    return query select false, 'ACTIVE_LEGACY_BINDING_REQUIRED'::text, null::uuid, null::text;
    return;
  end if;

  select b.* into v_target from public.identity_bindings b
  where b.provider = 'clerk' and b.environment = 'production'
    and b.external_subject = p_target_subject
  for update;
  if v_target.id is not null then
    return query select false, 'TARGET_SUBJECT_ALREADY_BOUND'::text, null::uuid, null::text;
    return;
  end if;

  update public.identity_manual_recovery_previews p
  set status = case when p.expires_at <= now() then 'EXPIRED' else 'REVOKED' end
  where p.user_id = p_user_id and p.status = 'PENDING';

  insert into public.identity_manual_recovery_previews(
    user_id, current_binding_id, expected_current_subject_hash, target_subject_hash,
    confirmation_hash, reason, expires_at
  ) values (
    p_user_id, v_current.id,
    pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(v_current.external_subject, 'UTF8')), 'hex'),
    pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p_target_subject, 'UTF8')), 'hex'),
    p_confirmation_hash, trim(p_reason), p_expires_at
  ) returning id into v_preview_id;

  insert into public.identity_migration_audit(user_id, action, binding_id, reason, detail)
  values (p_user_id, 'MANUAL_RECOVERY_PREVIEW_CREATED', v_current.id, trim(p_reason),
    jsonb_build_object('preview_id', v_preview_id));

  return query select true, 'RECOVERY_PREVIEW_READY'::text, v_preview_id, v_current.environment;
exception
  when unique_violation then
    return query select false, 'RECOVERY_PREVIEW_CONFLICT'::text, null::uuid, null::text;
end;
$$;

create or replace function public.execute_manual_clerk_identity_recovery(
  p_preview_id uuid,
  p_user_id uuid,
  p_target_subject text,
  p_reason text,
  p_confirmation_hash text
)
returns table(success boolean, code text, user_id uuid, binding_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_preview public.identity_manual_recovery_previews%rowtype;
  v_current public.identity_bindings%rowtype;
  v_target public.identity_bindings%rowtype;
  v_new_binding_id uuid;
begin
  select p.* into v_preview from public.identity_manual_recovery_previews p
  where p.id = p_preview_id for update;

  if v_preview.id is null or v_preview.status <> 'PENDING' then
    return query select false, 'RECOVERY_PREVIEW_INVALID_OR_USED'::text, null::uuid, null::uuid;
    return;
  end if;
  if v_preview.expires_at <= now() then
    update public.identity_manual_recovery_previews p set status = 'EXPIRED' where p.id = v_preview.id;
    return query select false, 'RECOVERY_PREVIEW_EXPIRED'::text, null::uuid, null::uuid;
    return;
  end if;
  if v_preview.user_id <> p_user_id
     or v_preview.reason <> trim(p_reason)
     or v_preview.confirmation_hash <> p_confirmation_hash
     or v_preview.target_subject_hash <> pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p_target_subject, 'UTF8')), 'hex') then
    return query select false, 'RECOVERY_CONFIRMATION_MISMATCH'::text, null::uuid, null::uuid;
    return;
  end if;

  perform 1 from public.users u where u.id = p_user_id for update;
  if not found then
    return query select false, 'RECOVERY_STATE_CHANGED'::text, null::uuid, null::uuid;
    return;
  end if;

  select b.* into v_current from public.identity_bindings b
  where b.id = v_preview.current_binding_id and b.user_id = p_user_id
    and b.environment = 'legacy_development' and b.status = 'ACTIVE'
  for update;
  if v_current.id is null
     or v_preview.expected_current_subject_hash <> pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(v_current.external_subject, 'UTF8')), 'hex') then
    return query select false, 'RECOVERY_STATE_CHANGED'::text, null::uuid, null::uuid;
    return;
  end if;

  select b.* into v_target from public.identity_bindings b
  where b.provider = 'clerk' and b.environment = 'production'
    and b.external_subject = p_target_subject
  for update;
  if v_target.id is not null then
    return query select false, 'TARGET_SUBJECT_ALREADY_BOUND'::text, null::uuid, null::uuid;
    return;
  end if;

  insert into public.identity_bindings(
    user_id, provider, environment, external_subject, status, proof_method, activated_at, metadata
  ) values (
    p_user_id, 'clerk', 'production', p_target_subject, 'ACTIVE', 'MANUAL_RECOVERY', now(),
    jsonb_build_object('preview_id', v_preview.id)
  ) returning id into v_new_binding_id;

  update public.identity_bindings b set status = 'RETIRED', retired_at = now()
  where b.id = v_current.id;
  update public.users u set clerk_id = p_target_subject, updated_at = now() where u.id = p_user_id;
  update public.identity_manual_recovery_previews p set status = 'EXECUTED', executed_at = now()
  where p.id = v_preview.id;
  insert into public.identity_migration_audit(user_id, action, binding_id, reason, detail)
  values (p_user_id, 'MANUAL_RECOVERY_EXECUTED', v_new_binding_id, trim(p_reason),
    jsonb_build_object('preview_id', v_preview.id, 'previous_binding_id', v_current.id));

  return query select true, 'MANUAL_RECOVERY_EXECUTED'::text, p_user_id, v_new_binding_id;
exception
  when unique_violation then
    return query select false, 'TARGET_SUBJECT_ALREADY_BOUND'::text, null::uuid, null::uuid;
end;
$$;

create or replace function public.rollback_clerk_identity_binding_confirmed(
  p_user_id uuid,
  p_reason text,
  p_confirmation text
)
returns table(success boolean, code text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result record;
begin
  if coalesce(length(trim(p_reason)), 0) < 20 then
    return query select false, 'DETAILED_REASON_REQUIRED'::text;
    return;
  end if;
  if p_confirmation <> 'ROLLBACK ' || p_user_id::text then
    return query select false, 'ROLLBACK_CONFIRMATION_REQUIRED'::text;
    return;
  end if;

  select * into v_result from public.rollback_clerk_identity_binding(p_user_id, trim(p_reason));
  if v_result.success then
    insert into public.identity_migration_audit(user_id, action, reason)
    values (p_user_id, 'MANUAL_RECOVERY_ROLLBACK_CONFIRMED', trim(p_reason));
  end if;
  return query select v_result.success, v_result.code;
end;
$$;

revoke all on public.identity_migration_throttles from anon, authenticated, service_role;
revoke all on public.identity_manual_recovery_previews from anon, authenticated, service_role;
revoke all on function public._deny_identity_audit_mutation() from public, anon, authenticated, service_role;
revoke execute on function public.consume_identity_migration_throttle(text, integer, integer) from public, anon, authenticated;
revoke execute on function public.preview_manual_clerk_identity_recovery(uuid, text, text, text, timestamptz) from public, anon, authenticated;
revoke execute on function public.execute_manual_clerk_identity_recovery(uuid, uuid, text, text, text) from public, anon, authenticated;
revoke execute on function public.rollback_clerk_identity_binding(uuid, text) from service_role;
revoke execute on function public.rollback_clerk_identity_binding_confirmed(uuid, text, text) from public, anon, authenticated;
grant execute on function public.consume_identity_migration_throttle(text, integer, integer) to service_role;
grant execute on function public.preview_manual_clerk_identity_recovery(uuid, text, text, text, timestamptz) to service_role;
grant execute on function public.execute_manual_clerk_identity_recovery(uuid, uuid, text, text, text) to service_role;
grant execute on function public.rollback_clerk_identity_binding_confirmed(uuid, text, text) to service_role;
