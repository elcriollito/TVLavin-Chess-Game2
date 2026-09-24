-- EAE-013A STAGING ONLY (aqizagaskicotorfpwfn). Never apply to production.
-- The trigger is the final backstop: even an uninstrumented direct DELETE leaves
-- an UNKNOWN tombstone, which must fail certification rather than disappear.
create table public.eae013a_session_audit (
  audit_id bigint generated always as identity primary key,
  session_id text not null,
  competition_id text not null,
  recorded_at timestamptz not null default clock_timestamp(),
  event_kind text not null check (event_kind in ('PHASE', 'DELETE')),
  delete_reason text,
  delete_actor text,
  expiry_check_source text,
  state_before text,
  state_after text,
  search_id text,
  main_lease_expires_at bigint,
  engine_lease_expires_at bigint,
  main_last_heartbeat_at bigint,
  engine_last_heartbeat_at bigint,
  idle_expires_at bigint,
  hard_expires_at bigint,
  main_cursor bigint,
  engine_cursor bigint,
  last_command_seq bigint,
  last_engine_seq bigint,
  last_ack_type text,
  last_terminal_event text,
  pending_command text,
  pending_deadline bigint,
  cleanup_observed boolean not null,
  explicit_terminate_requested boolean not null,
  deployment_id text,
  request_correlation_id text
);
create index eae013a_session_audit_session_idx
  on public.eae013a_session_audit (session_id, audit_id);
create index eae013a_session_audit_recorded_idx
  on public.eae013a_session_audit (recorded_at);
alter table public.eae013a_session_audit enable row level security;
revoke all on public.eae013a_session_audit from public, anon, authenticated;
grant select, insert, delete on public.eae013a_session_audit to service_role;
grant usage, select on sequence public.eae013a_session_audit_audit_id_seq to service_role;

create function public.eae013a_audit_session() returns trigger
language plpgsql security invoker set search_path = ''
as $$
declare
  old_state jsonb := old.state;
  reason text := nullif(pg_catalog.current_setting('eae013a.delete_reason', true), '');
  actor text := nullif(pg_catalog.current_setting('eae013a.delete_actor', true), '');
  source text := nullif(pg_catalog.current_setting('eae013a.expiry_source', true), '');
begin
  if tg_op = 'UPDATE' and old.state->>'phase' is not distinct from new.state->>'phase' then
    return new;
  end if;
  insert into public.eae013a_session_audit (
    session_id, competition_id, event_kind, delete_reason, delete_actor,
    expiry_check_source, state_before, state_after, search_id,
    main_lease_expires_at, engine_lease_expires_at,
    main_last_heartbeat_at, engine_last_heartbeat_at, idle_expires_at,
    hard_expires_at, main_cursor, engine_cursor, last_command_seq,
    last_engine_seq, last_ack_type, last_terminal_event,
    pending_command, pending_deadline, cleanup_observed,
    explicit_terminate_requested, deployment_id, request_correlation_id
  ) values (
    old.session_id, old.competition_id, case when tg_op = 'DELETE' then 'DELETE' else 'PHASE' end,
    case when tg_op = 'DELETE' then coalesce(reason, 'UNKNOWN') else null end,
    case when tg_op = 'DELETE' then coalesce(actor, 'UNKNOWN') else 'BROKER_MUTATION' end,
    source, old_state->>'phase', case when tg_op = 'DELETE' then 'DELETED' else new.state->>'phase' end,
    coalesce(old_state->>'activeSearchId', old_state->>'completedSearchId'),
    nullif(old_state->>'mainStreamUntil', '')::bigint,
    nullif(old_state->>'engineStreamUntil', '')::bigint,
    nullif(old_state->>'mainHeartbeatAt', '')::bigint,
    nullif(old_state->>'engineHeartbeatAt', '')::bigint,
    nullif(old_state->>'idleUntil', '')::bigint, old.expires_at,
    nullif(old_state->>'mainAckCursor', '')::bigint,
    nullif(old_state->>'engineAckCursor', '')::bigint,
    nullif(old_state->>'lastCommandSeq', '')::bigint,
    nullif(old_state->>'lastEngineSeq', '')::bigint,
    old_state->'lastAck'->>'command',
    old_state->'events'->-1->'value'->>'type',
    old_state->'pending'->>'type',
    nullif(old_state->'pending'->>'deadline', '')::bigint,
    coalesce((old_state->>'cleanup')::boolean, false),
    coalesce(reason = 'EXPLICIT_TERMINATE', false),
    left(coalesce(nullif(pg_catalog.current_setting('eae013a.deployment_id', true), ''),
      old_state->>'deploymentId'), 128),
    left(nullif(pg_catalog.current_setting('eae013a.request_id', true), ''), 128)
  );
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger eae013a_session_audit_trigger
after update or delete on public.eae011_sessions
for each row execute function public.eae013a_audit_session();

create function public.eae013a_delete_session(
  p_session_id text, p_version bigint, p_reason text,
  p_actor text, p_source text, p_deployment_id text default null,
  p_request_id text default null
) returns boolean language plpgsql security invoker set search_path = ''
as $$
declare removed_id text;
begin
  if p_reason not in ('EXPLICIT_TERMINATE', 'COOPERATIVE_CLEANUP',
      'CLAIM_EXPIRED', 'SESSION_HARD_EXPIRY', 'IDLE_EXPIRED',
      'MAIN_HEARTBEAT_EXPIRED', 'ENGINE_HEARTBEAT_EXPIRED',
      'STOP_TIMEOUT', 'QUIT_TIMEOUT', 'STOP_RESULT_TIMEOUT',
      'ADMIN_TEST_CLEANUP', 'BROKER_GC', 'FAILED_RUNTIME')
    or p_actor is null or length(p_actor) > 64 or length(p_source) > 64 then
    raise exception 'EAE013A_DELETE_REASON_INVALID';
  end if;
  perform pg_catalog.set_config('eae013a.delete_reason', p_reason, true);
  perform pg_catalog.set_config('eae013a.delete_actor', p_actor, true);
  perform pg_catalog.set_config('eae013a.expiry_source', coalesce(p_source, ''), true);
  perform pg_catalog.set_config('eae013a.deployment_id', coalesce(p_deployment_id, ''), true);
  perform pg_catalog.set_config('eae013a.request_id', coalesce(p_request_id, ''), true);
  delete from public.eae011_sessions where session_id = p_session_id and version = p_version
    returning session_id into removed_id;
  return removed_id is not null;
end;
$$;
revoke all on function public.eae013a_delete_session(text,bigint,text,text,text,text,text)
  from public, anon, authenticated;
grant execute on function public.eae013a_delete_session(text,bigint,text,text,text,text,text)
  to service_role;

create or replace function public.eae011_cleanup(p_now bigint) returns integer
language plpgsql security invoker set search_path = ''
as $$
declare candidate record; removed integer := 0; reason text;
begin
  for candidate in
    select session_id, version, expires_at, state from public.eae011_sessions
    where expires_at <= p_now or (state->>'idleUntil')::bigint <= p_now
      or (state->>'phase' = 'UNCLAIMED' and (state->>'claimUntil')::bigint <= p_now)
      or (state->>'engineStreamUntil' is not null and
          (state->>'engineStreamUntil')::bigint + 5000 < p_now)
      or (state->>'mainStreamUntil' is not null and
          (state->>'mainStreamUntil')::bigint + 5000 < p_now)
    for update skip locked
  loop
    reason := case
      when candidate.expires_at <= p_now then 'SESSION_HARD_EXPIRY'
      when candidate.state->>'phase' = 'UNCLAIMED' and
           (candidate.state->>'claimUntil')::bigint <= p_now then 'CLAIM_EXPIRED'
      when (candidate.state->>'idleUntil')::bigint <= p_now then 'IDLE_EXPIRED'
      when candidate.state->>'engineStreamUntil' is not null and
           (candidate.state->>'engineStreamUntil')::bigint + 5000 < p_now
        then 'ENGINE_HEARTBEAT_EXPIRED'
      when candidate.state->>'mainStreamUntil' is not null and
           (candidate.state->>'mainStreamUntil')::bigint + 5000 < p_now
        then 'MAIN_HEARTBEAT_EXPIRED'
      else 'BROKER_GC' end;
    if public.eae013a_delete_session(candidate.session_id, candidate.version,
        reason, 'BROKER_GC', 'eae011_cleanup') then removed := removed + 1; end if;
  end loop;
  delete from public.eae011_creation_windows where window_started_at < p_now - 60000;
  delete from public.eae013a_session_audit where recorded_at < clock_timestamp() - interval '24 hours';
  return removed;
end;
$$;
