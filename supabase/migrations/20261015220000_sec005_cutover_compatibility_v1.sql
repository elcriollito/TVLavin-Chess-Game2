-- SEC-005 cutover compatibility for Public Identity v1 and CAISSA Online.
-- Apply after:
--   20260811_clerk_identity_remapping_foundation.sql
--   20260811_clerk_migration_cutover_tooling.sql
--   20261005204209_caissa_online_native_v1.sql
--   20261011150814_caissa_online_hardening_only_v3.sql
--   20261014035549_caissa_public_identity_v1.sql

begin;

-- Production sync must never resolve an identically-shaped subject from the
-- legacy Clerk namespace. The migration challenge uses the explicit resolver
-- below for its legacy authority instead.
create or replace function public.resolve_clerk_identity_binding(
  p_external_subject text,
  p_environment text
)
returns table(resolution text, user_id uuid)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_environment not in ('legacy_development', 'production')
     or p_external_subject is null
     or pg_catalog.char_length(p_external_subject) not between 1 and 255 then
    return query select 'UNRESOLVED'::text, null::uuid;
    return;
  end if;

  return query
  select 'BOUND'::text, b.user_id
  from public.identity_bindings b
  where b.provider = 'clerk'
    and b.environment = p_environment
    and b.external_subject = p_external_subject
    and b.status = 'ACTIVE';
  if found then return; end if;

  return query select 'UNRESOLVED'::text, null::uuid;
end;
$$;

create or replace function public.resolve_clerk_identity_for_sync(p_external_subject text)
returns table(resolution text, user_id uuid)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_subject_hash text;
begin
  if p_external_subject is null
     or pg_catalog.char_length(p_external_subject) not between 1 and 255 then
    return query select 'UNRESOLVED'::text, null::uuid;
    return;
  end if;

  v_subject_hash := pg_catalog.encode(
    pg_catalog.sha256(pg_catalog.convert_to(p_external_subject, 'UTF8')), 'hex'
  );

  return query
  select 'BOUND'::text, b.user_id
  from public.identity_bindings b
  where b.provider = 'clerk'
    and b.environment = 'production'
    and b.external_subject = p_external_subject
    and b.status = 'ACTIVE';
  if found then return; end if;

  if exists (
    select 1 from public.identity_migration_challenges c
    where c.expected_new_subject_hash = v_subject_hash
      and c.status = 'PENDING'
      and c.expires_at > pg_catalog.clock_timestamp()
  ) then
    return query select 'MIGRATION_REQUIRED'::text, null::uuid;
    return;
  end if;

  if exists (
    select 1 from public.identity_enrollment_decisions e
    where e.environment = 'production'
      and e.external_subject = p_external_subject
      and e.decision = 'APPROVED_NEW'
      and e.consumed_at is null
      and e.expires_at > pg_catalog.clock_timestamp()
  ) then
    return query select 'APPROVED_NEW'::text, null::uuid;
    return;
  end if;

  return query select 'UNRESOLVED'::text, null::uuid;
end;
$$;

-- Subject snapshots used for authorization must follow the immutable user UUID
-- in the same transaction as users.clerk_id. Frozen public display names and
-- UUID-owned ratings/events are intentionally untouched.
create or replace function public._cascade_clerk_subject_remap()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.clerk_id is not distinct from new.clerk_id then
    return new;
  end if;
  if old.clerk_id is null or new.clerk_id is null
     or pg_catalog.char_length(new.clerk_id) not between 1 and 255 then
    raise exception 'CAISSA_IDENTITY_INVALID_SUBJECT_REMAP' using errcode = '22023';
  end if;

  update public.caissa_online_profiles p
  set clerk_id = new.clerk_id,
      updated_at = pg_catalog.clock_timestamp()
  where p.user_id = new.id and p.clerk_id = old.clerk_id;

  update public.caissa_online_presence p
  set clerk_id = new.clerk_id
  where p.user_id = new.id and p.clerk_id = old.clerk_id;

  update public.caissa_online_matchmaking_tickets t
  set clerk_id = new.clerk_id,
      updated_at = pg_catalog.clock_timestamp()
  where t.user_id = new.id and t.clerk_id = old.clerk_id;

  update public.caissa_online_games g
  set white_clerk_id = case
        when g.white_user_id = new.id and g.white_clerk_id = old.clerk_id then new.clerk_id
        else g.white_clerk_id end,
      black_clerk_id = case
        when g.black_user_id = new.id and g.black_clerk_id = old.clerk_id then new.clerk_id
        else g.black_clerk_id end,
      draw_offer_by = case
        when g.draw_offer_by = old.clerk_id
          and new.id in (g.white_user_id, g.black_user_id) then new.clerk_id
        else g.draw_offer_by end,
      version = g.version + case when g.status = 'active' then 1 else 0 end,
      updated_at = case when g.status = 'active'
        then pg_catalog.clock_timestamp() else g.updated_at end
  where (g.white_user_id = new.id and g.white_clerk_id = old.clerk_id)
     or (g.black_user_id = new.id and g.black_clerk_id = old.clerk_id)
     or (g.draw_offer_by = old.clerk_id
         and new.id in (g.white_user_id, g.black_user_id));

  insert into public.caissa_online_rate_limits as target (
    clerk_id, bucket, window_started_at, request_count, updated_at
  )
  select new.clerk_id, source.bucket, source.window_started_at,
         source.request_count, source.updated_at
  from public.caissa_online_rate_limits source
  where source.clerk_id = old.clerk_id
  on conflict (clerk_id, bucket) do update
  set window_started_at = least(
        target.window_started_at, excluded.window_started_at
      ),
      request_count = least(
        10000, target.request_count + excluded.request_count
      ),
      updated_at = greatest(target.updated_at, excluded.updated_at);

  delete from public.caissa_online_rate_limits r
  where r.clerk_id = old.clerk_id;

  -- Every successful subject transition (dual-auth activation, offline manual
  -- recovery, or exact rollback) invalidates older proofs for the same UUID.
  -- The transition function may subsequently mark its currently locked proof
  -- USED/EXECUTED in the same transaction.
  update public.identity_migration_challenges c
  set status = 'REVOKED'
  where c.user_id = new.id
    and c.status = 'PENDING';
  update public.identity_manual_recovery_previews p
  set status = 'REVOKED'
  where p.user_id = new.id
    and p.status = 'PENDING';

  return new;
end;
$$;

drop trigger if exists users_cascade_clerk_subject_remap on public.users;
create trigger users_cascade_clerk_subject_remap
after update of clerk_id on public.users
for each row
when (old.clerk_id is distinct from new.clerk_id)
execute function public._cascade_clerk_subject_remap();

-- Rebind activation to the exact legacy user, reject subject reuse across
-- authority namespaces, and retain exact rollback provenance in metadata.
create or replace function public.activate_clerk_identity_binding(
  p_token_hash text,
  p_new_external_subject text
)
returns table(success boolean, code text, user_id uuid, binding_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_challenge public.identity_migration_challenges%rowtype;
  v_legacy public.identity_bindings%rowtype;
  v_existing public.identity_bindings%rowtype;
  v_new_binding_id uuid;
begin
  select c.* into v_challenge
  from public.identity_migration_challenges c
  where c.token_hash = p_token_hash
  for update;

  if v_challenge.id is null or v_challenge.status <> 'PENDING' then
    return query select false, 'CHALLENGE_INVALID_OR_USED'::text, null::uuid, null::uuid;
    return;
  end if;
  if v_challenge.expires_at <= pg_catalog.clock_timestamp() then
    update public.identity_migration_challenges c
    set status = 'EXPIRED' where c.id = v_challenge.id;
    return query select false, 'CHALLENGE_EXPIRED'::text, null::uuid, null::uuid;
    return;
  end if;
  if pg_catalog.encode(
       pg_catalog.sha256(pg_catalog.convert_to(p_new_external_subject, 'UTF8')), 'hex'
     ) <> v_challenge.expected_new_subject_hash then
    return query select false, 'NEW_SUBJECT_MISMATCH'::text, null::uuid, null::uuid;
    return;
  end if;

  perform 1 from public.users u where u.id = v_challenge.user_id for update;
  if not found then
    return query select false, 'USER_NOT_FOUND'::text, null::uuid, null::uuid;
    return;
  end if;

  select b.* into v_legacy
  from public.identity_bindings b
  where b.id = v_challenge.legacy_binding_id
    and b.user_id = v_challenge.user_id
    and b.provider = 'clerk'
    and b.environment = 'legacy_development'
    and b.status = 'ACTIVE'
  for update;
  if v_legacy.id is null then
    update public.identity_migration_challenges c
    set status = 'CONFLICT' where c.id = v_challenge.id;
    return query select false, 'LEGACY_BINDING_CONFLICT'::text, null::uuid, null::uuid;
    return;
  end if;

  select b.* into v_existing
  from public.identity_bindings b
  where b.provider = 'clerk'
    and b.external_subject = p_new_external_subject
  order by b.created_at
  limit 1
  for update;
  if v_existing.id is not null then
    update public.identity_migration_challenges c
    set status = 'CONFLICT' where c.id = v_challenge.id;
    return query select false, 'TARGET_SUBJECT_ALREADY_BOUND'::text, null::uuid, null::uuid;
    return;
  end if;

  insert into public.identity_bindings (
    user_id, provider, environment, external_subject, status,
    proof_method, activated_at, metadata
  ) values (
    v_challenge.user_id, 'clerk', 'production', p_new_external_subject,
    'ACTIVE', v_challenge.proof_method, pg_catalog.clock_timestamp(),
    pg_catalog.jsonb_build_object(
      'challenge_id', v_challenge.id,
      'previous_binding_id', v_legacy.id
    )
  ) returning id into v_new_binding_id;

  update public.identity_bindings b
  set status = 'RETIRED', retired_at = pg_catalog.clock_timestamp()
  where b.id = v_legacy.id;

  update public.users u
  set clerk_id = p_new_external_subject,
      updated_at = pg_catalog.clock_timestamp()
  where u.id = v_challenge.user_id;

  update public.identity_migration_challenges c
  set status = 'USED', used_at = pg_catalog.clock_timestamp()
  where c.id = v_challenge.id;

  -- A single completed cutover invalidates every sibling proof for the same
  -- immutable user. Otherwise an older, still-live challenge could be replayed
  -- after an emergency rollback restores the legacy binding.
  update public.identity_migration_challenges c
  set status = 'REVOKED'
  where c.user_id = v_challenge.user_id
    and c.id <> v_challenge.id
    and c.status = 'PENDING';

  insert into public.identity_migration_audit(user_id, action, binding_id, challenge_id)
  values (v_challenge.user_id, 'BINDING_ACTIVATED', v_new_binding_id, v_challenge.id);

  return query select true, 'BINDING_ACTIVATED'::text,
    v_challenge.user_id, v_new_binding_id;
exception
  when unique_violation then
    return query select false, 'TARGET_SUBJECT_ALREADY_BOUND'::text, null::uuid, null::uuid;
end;
$$;

-- Rollback derives and validates the exact predecessor from the transition
-- metadata instead of selecting an arbitrary recently-retired binding.
create or replace function public.rollback_clerk_identity_binding(
  p_user_id uuid,
  p_reason text
)
returns table(success boolean, code text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_legacy public.identity_bindings%rowtype;
  v_production public.identity_bindings%rowtype;
  v_previous_binding_id uuid;
begin
  if coalesce(pg_catalog.length(pg_catalog.btrim(p_reason)), 0) < 8 then
    return query select false, 'ROLLBACK_REASON_REQUIRED'::text;
    return;
  end if;

  perform 1 from public.users u where u.id = p_user_id for update;
  if not found then
    return query select false, 'ROLLBACK_BINDING_NOT_FOUND'::text;
    return;
  end if;

  select b.* into v_production
  from public.identity_bindings b
  where b.user_id = p_user_id
    and b.provider = 'clerk'
    and b.environment = 'production'
    and b.status = 'ACTIVE'
  for update;
  if v_production.id is null then
    return query select false, 'ROLLBACK_BINDING_NOT_FOUND'::text;
    return;
  end if;

  begin
    if v_production.metadata ? 'previous_binding_id' then
      v_previous_binding_id := (v_production.metadata ->> 'previous_binding_id')::uuid;
    elsif v_production.metadata ? 'challenge_id' then
      select c.legacy_binding_id into v_previous_binding_id
      from public.identity_migration_challenges c
      where c.id = (v_production.metadata ->> 'challenge_id')::uuid
        and c.user_id = p_user_id
        and c.status = 'USED';
    elsif v_production.metadata ? 'preview_id' then
      select p.current_binding_id into v_previous_binding_id
      from public.identity_manual_recovery_previews p
      where p.id = (v_production.metadata ->> 'preview_id')::uuid
        and p.user_id = p_user_id
        and p.status = 'EXECUTED';
    end if;
  exception when invalid_text_representation then
    return query select false, 'ROLLBACK_PROVENANCE_REQUIRED'::text;
    return;
  end;
  if v_previous_binding_id is null then
    return query select false, 'ROLLBACK_PROVENANCE_REQUIRED'::text;
    return;
  end if;

  select b.* into v_legacy
  from public.identity_bindings b
  where b.id = v_previous_binding_id
    and b.user_id = p_user_id
    and b.provider = 'clerk'
    and b.environment = 'legacy_development'
    and b.status = 'RETIRED'
  for update;
  if v_legacy.id is null then
    return query select false, 'ROLLBACK_PROVENANCE_MISMATCH'::text;
    return;
  end if;

  if not (
    (v_production.metadata ? 'challenge_id' and exists (
      select 1 from public.identity_migration_challenges c
      where c.id = (v_production.metadata ->> 'challenge_id')::uuid
        and c.user_id = p_user_id
        and c.legacy_binding_id = v_legacy.id
        and c.status = 'USED'
    ))
    or
    (v_production.metadata ? 'preview_id' and exists (
      select 1 from public.identity_manual_recovery_previews p
      where p.id = (v_production.metadata ->> 'preview_id')::uuid
        and p.user_id = p_user_id
        and p.current_binding_id = v_legacy.id
        and p.status = 'EXECUTED'
    ))
  ) then
    return query select false, 'ROLLBACK_PROVENANCE_MISMATCH'::text;
    return;
  end if;

  update public.identity_bindings b
  set status = 'REVOKED', retired_at = pg_catalog.clock_timestamp()
  where b.id = v_production.id;
  update public.identity_bindings b
  set status = 'ACTIVE', activated_at = pg_catalog.clock_timestamp(), retired_at = null
  where b.id = v_legacy.id;
  update public.users u
  set clerk_id = v_legacy.external_subject,
      updated_at = pg_catalog.clock_timestamp()
  where u.id = p_user_id;

  -- Rollback closes every unused proof and recovery preview for this user.
  -- Rebinding again requires a newly reviewed proof after the incident.
  update public.identity_migration_challenges c
  set status = 'REVOKED'
  where c.user_id = p_user_id
    and c.status = 'PENDING';
  update public.identity_manual_recovery_previews p
  set status = 'REVOKED'
  where p.user_id = p_user_id
    and p.status = 'PENDING';

  insert into public.identity_migration_audit(user_id, action, binding_id, reason, detail)
  values (
    p_user_id, 'BINDING_ROLLED_BACK', v_legacy.id, pg_catalog.btrim(p_reason),
    pg_catalog.jsonb_build_object(
      'revoked_binding_id', v_production.id,
      'restored_binding_id', v_legacy.id
    )
  );

  return query select true, 'BINDING_ROLLED_BACK'::text;
end;
$$;

-- A new production identity is never auto-approved. This operator-only RPC is
-- the controlled writer for the existing subject-specific decision ledger.
create or replace function public.approve_clerk_identity_enrollment(
  p_external_subject text,
  p_reason text,
  p_expires_at timestamptz
)
returns table(success boolean, code text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_decision_id uuid;
begin
  if p_external_subject is null
     or pg_catalog.char_length(p_external_subject) not between 3 and 255
     or coalesce(pg_catalog.length(pg_catalog.btrim(p_reason)), 0) < 20
     or p_expires_at <= pg_catalog.clock_timestamp()
     or p_expires_at > pg_catalog.clock_timestamp() + interval '24 hours' then
    return query select false, 'INVALID_ENROLLMENT_APPROVAL'::text;
    return;
  end if;

  if exists (
    select 1 from public.identity_bindings b
    where b.provider = 'clerk' and b.external_subject = p_external_subject
  ) then
    return query select false, 'SUBJECT_ALREADY_BOUND'::text;
    return;
  end if;

  insert into public.identity_enrollment_decisions as decision (
    environment, external_subject, decision, reason, created_at, expires_at
  ) values (
    'production', p_external_subject, 'APPROVED_NEW',
    pg_catalog.btrim(p_reason), pg_catalog.clock_timestamp(), p_expires_at
  )
  on conflict (environment, external_subject) do update
  set decision = 'APPROVED_NEW',
      reason = excluded.reason,
      created_at = excluded.created_at,
      expires_at = excluded.expires_at
  where decision.consumed_at is null
  returning id into v_decision_id;

  if v_decision_id is null then
    return query select false, 'ENROLLMENT_DECISION_ALREADY_CONSUMED'::text;
    return;
  end if;

  insert into public.identity_migration_audit(action, reason, detail)
  values (
    'NEW_ACCOUNT_APPROVED', pg_catalog.btrim(p_reason),
    pg_catalog.jsonb_build_object(
      'decision_id', v_decision_id,
      'subject_hash', pg_catalog.encode(
        pg_catalog.sha256(pg_catalog.convert_to(p_external_subject, 'UTF8')), 'hex'
      ),
      'expires_at', p_expires_at
    )
  );
  return query select true, 'NEW_ACCOUNT_APPROVED'::text;
end;
$$;

revoke all on function public.resolve_clerk_identity_binding(text, text)
  from public, anon, authenticated;
revoke all on function public._cascade_clerk_subject_remap()
  from public, anon, authenticated, service_role;
revoke all on function public.approve_clerk_identity_enrollment(text, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.resolve_clerk_identity_binding(text, text)
  to service_role;
grant execute on function public.approve_clerk_identity_enrollment(text, text, timestamptz)
  to service_role;

commit;
