-- EAE-015A STAGING ONLY (CAISSA-READER-STAGING: aqizagaskicotorfpwfn).
-- This migration is production-shaped evidence. Never apply it to production.

create table public.eae015a_control (
  control_id text primary key check (control_id = 'arena'),
  mode text not null check (mode in ('ENABLED', 'DRAINING', 'DISABLED')),
  reason text not null default '',
  updated_at timestamptz not null default clock_timestamp()
);

insert into public.eae015a_control(control_id, mode, reason)
values ('arena', 'DISABLED', 'Default-off until an authorized preview exercise')
on conflict (control_id) do nothing;

create table public.eae015a_rate_windows (
  session_id text not null,
  bucket text not null check (bucket ~ '^[A-Z_]{1,32}$'),
  window_started_at bigint not null,
  accepted integer not null default 0 check (accepted >= 0),
  rejected integer not null default 0 check (rejected >= 0),
  primary key (session_id, bucket),
  foreign key (session_id) references public.eae011_sessions(session_id) on delete cascade
);

alter table public.eae015a_control enable row level security;
alter table public.eae015a_rate_windows enable row level security;
revoke all on public.eae015a_control from public, anon, authenticated;
revoke all on public.eae015a_rate_windows from public, anon, authenticated;
grant select, update on public.eae015a_control to service_role;
grant select, insert, update, delete on public.eae015a_rate_windows to service_role;

create index if not exists eae015a_sessions_lifecycle_terminal_idx
  on public.eae011_sessions ((state->>'lifecycle'), ((state->>'terminalAt')::bigint));
create index if not exists eae015a_sessions_idle_idx
  on public.eae011_sessions (((state->>'idleUntil')::bigint));

-- The database clock is authoritative. p_now remains in the signature only so
-- preview clients can use one RPC contract in memory and in staging.
create function public.eae015a_allow_rate(
  p_session_id text, p_bucket text, p_now bigint, p_window_ms integer, p_maximum integer
) returns boolean
language plpgsql security invoker set search_path = ''
as $$
declare
  current_ms bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint;
  window_record public.eae015a_rate_windows%rowtype;
begin
  if p_session_id !~ '^[A-Za-z0-9_-]{20,64}$' or
     p_bucket !~ '^[A-Z_]{1,32}$' or
     p_window_ms < 100 or p_window_ms > 60000 or
     p_maximum < 1 or p_maximum > 1000 then
    raise exception 'EAE015A_RATE_ARGUMENT_INVALID';
  end if;
  if not exists (select 1 from public.eae011_sessions where session_id = p_session_id) then
    return false;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_session_id || ':' || p_bucket, 15015));
  select * into window_record from public.eae015a_rate_windows
    where session_id = p_session_id and bucket = p_bucket for update;
  if not found then
    insert into public.eae015a_rate_windows(session_id, bucket, window_started_at, accepted)
      values (p_session_id, p_bucket, current_ms, 1);
    return true;
  end if;
  if current_ms - window_record.window_started_at >= p_window_ms then
    update public.eae015a_rate_windows
      set window_started_at = current_ms, accepted = 1, rejected = 0
      where session_id = p_session_id and bucket = p_bucket;
    return true;
  end if;
  if window_record.accepted >= p_maximum then
    update public.eae015a_rate_windows set rejected = rejected + 1
      where session_id = p_session_id and bucket = p_bucket;
    return false;
  end if;
  update public.eae015a_rate_windows set accepted = accepted + 1
    where session_id = p_session_id and bucket = p_bucket;
  return true;
end;
$$;

-- Replace the old 125-second preview creation ceiling with the documented
-- two-hour absolute cap. Caller timestamps are not trusted or persisted.
create or replace function public.eae011_create_session(
  p_session_id text, p_owner_id text, p_competition_id text,
  p_participant_role text, p_created_at bigint, p_expires_at bigint, p_state jsonb
) returns text
language plpgsql security invoker set search_path = ''
as $$
declare
  current_ms bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint;
  hard_expires_ms bigint := current_ms + 7200000;
  active_count integer;
  window_record public.eae011_creation_windows%rowtype;
  authoritative_state jsonb;
begin
  if p_owner_id !~ '^user_[A-Za-z0-9]{8,80}$' or
     p_session_id !~ '^[A-Za-z0-9_-]{20,64}$' or
     p_competition_id !~ '^competition_[A-Za-z0-9_-]{20,64}$' or
     p_participant_role not in ('white', 'black') or
     p_state is null then
    return 'INVALID';
  end if;
  authoritative_state := p_state || pg_catalog.jsonb_build_object(
    'lifecycle', 'CREATED', 'lifecycleChangedAt', current_ms,
    'terminalAt', null, 'claimUntil', current_ms + 60000,
    'idleUntil', current_ms + 600000, 'expiresAt', hard_expires_ms,
    'engineStreamUntil', null, 'mainStreamUntil', null
  );
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_owner_id, 11011));
  select count(*) into active_count from public.eae011_sessions
    where owner_id = p_owner_id and expires_at > current_ms;
  if active_count >= 10 then return 'CONCURRENT_LIMIT'; end if;
  select * into window_record from public.eae011_creation_windows
    where owner_id = p_owner_id for update;
  if not found then
    insert into public.eae011_creation_windows(owner_id, window_started_at, attempts)
      values (p_owner_id, current_ms, 1);
  elsif current_ms - window_record.window_started_at >= 60000 then
    update public.eae011_creation_windows set window_started_at = current_ms, attempts = 1
      where owner_id = p_owner_id;
  elsif window_record.attempts >= 20 then
    return 'RATE_LIMIT';
  else
    update public.eae011_creation_windows set attempts = attempts + 1
      where owner_id = p_owner_id;
  end if;
  insert into public.eae011_sessions(session_id, owner_id, competition_id,
    participant_role, created_at, expires_at, version, state)
    values (p_session_id, p_owner_id, p_competition_id,
      p_participant_role, current_ms, hard_expires_ms, 0, authoritative_state);
  return 'OK';
end;
$$;

create or replace function public.eae013a_delete_session(
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
      'TERMINAL_RETENTION_EXPIRED', 'ADMIN_TEST_CLEANUP', 'BROKER_GC', 'FAILED_RUNTIME')
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

create function public.eae015a_cleanup(
  p_now bigint, p_batch_size integer default 100,
  p_terminal_retention_ms bigint default 604800000
) returns table(removed integer, reasons jsonb, tombstones_pruned integer, rate_windows_pruned integer)
language plpgsql security invoker set search_path = ''
as $$
declare
  current_ms bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint;
  candidate record;
  reason text;
  did_remove boolean;
begin
  removed := 0;
  reasons := '{}'::jsonb;
  tombstones_pruned := 0;
  rate_windows_pruned := 0;
  if p_batch_size < 1 or p_batch_size > 500 or
     p_terminal_retention_ms <> 604800000 then
    raise exception 'EAE015A_CLEANUP_ARGUMENT_INVALID';
  end if;
  for candidate in
    select session_id, version, expires_at, state from public.eae011_sessions
    where expires_at <= current_ms
      or nullif(state->>'idleUntil', '')::bigint <= current_ms
      or (state->>'phase' = 'UNCLAIMED' and
          nullif(state->>'claimUntil', '')::bigint <= current_ms)
      or (state->>'engineStreamUntil' is not null and
          (state->>'engineStreamUntil')::bigint + 20000 < current_ms)
      or (state->>'mainStreamUntil' is not null and
          (state->>'mainStreamUntil')::bigint + 20000 < current_ms)
      or (state->>'lifecycle' in ('CLEANED', 'FAILED', 'EXPIRED') and
          nullif(state->>'terminalAt', '')::bigint + 604800000 <= current_ms)
    order by expires_at, session_id
    limit p_batch_size
    for update skip locked
  loop
    reason := case
      when candidate.state->>'lifecycle' in ('CLEANED', 'FAILED', 'EXPIRED') and
           nullif(candidate.state->>'terminalAt', '')::bigint + 604800000 <= current_ms
        then 'TERMINAL_RETENTION_EXPIRED'
      when candidate.expires_at <= current_ms then 'SESSION_HARD_EXPIRY'
      when candidate.state->>'phase' = 'UNCLAIMED' and
           nullif(candidate.state->>'claimUntil', '')::bigint <= current_ms then 'CLAIM_EXPIRED'
      when nullif(candidate.state->>'idleUntil', '')::bigint <= current_ms then 'IDLE_EXPIRED'
      when candidate.state->>'engineStreamUntil' is not null and
           (candidate.state->>'engineStreamUntil')::bigint + 20000 < current_ms
        then 'ENGINE_HEARTBEAT_EXPIRED'
      when candidate.state->>'mainStreamUntil' is not null and
           (candidate.state->>'mainStreamUntil')::bigint + 20000 < current_ms
        then 'MAIN_HEARTBEAT_EXPIRED'
    end;
    if reason is null then raise exception 'EAE015A_CLEANUP_REASON_MISSING'; end if;
    did_remove := public.eae013a_delete_session(candidate.session_id, candidate.version,
      reason, 'SCHEDULED_CLEANUP', 'eae015a_cleanup');
    if did_remove then
      removed := removed + 1;
      reasons := pg_catalog.jsonb_set(reasons, array[reason],
        pg_catalog.to_jsonb(coalesce((reasons->>reason)::integer, 0) + 1), true);
    end if;
  end loop;
  delete from public.eae011_creation_windows where window_started_at < current_ms - 60000;
  delete from public.eae015a_rate_windows where window_started_at < current_ms - 60000;
  get diagnostics rate_windows_pruned = row_count;
  delete from public.eae013a_session_audit
    where recorded_at < clock_timestamp() - interval '7 days';
  get diagnostics tombstones_pruned = row_count;
  return next;
end;
$$;

revoke all on function public.eae015a_allow_rate(text,text,bigint,integer,integer)
  from public, anon, authenticated;
revoke all on function public.eae015a_cleanup(bigint,integer,bigint)
  from public, anon, authenticated;
revoke all on function public.eae013a_delete_session(text,bigint,text,text,text,text,text)
  from public, anon, authenticated;
grant execute on function public.eae015a_allow_rate(text,text,bigint,integer,integer)
  to service_role;
grant execute on function public.eae015a_cleanup(bigint,integer,bigint)
  to service_role;
grant execute on function public.eae013a_delete_session(text,bigint,text,text,text,text,text)
  to service_role;
