-- EAE-015B production relay foundation. Access is service-role only and the
-- independent control row defaults to DISABLED in the later policy migration.
create table public.eae011_sessions (
  session_id text primary key,
  owner_id text not null,
  competition_id text not null,
  participant_role text not null check (participant_role in ('white', 'black')),
  created_at bigint not null,
  expires_at bigint not null,
  version bigint not null default 0,
  state jsonb not null
);

create index eae011_sessions_owner_expiry_idx
  on public.eae011_sessions (owner_id, expires_at);
create index eae011_sessions_expiry_idx
  on public.eae011_sessions (expires_at);

create table public.eae011_creation_windows (
  owner_id text primary key,
  window_started_at bigint not null,
  attempts integer not null check (attempts between 0 and 20)
);

alter table public.eae011_sessions enable row level security;
alter table public.eae011_creation_windows enable row level security;
revoke all on public.eae011_sessions from public, anon, authenticated;
revoke all on public.eae011_creation_windows from public, anon, authenticated;
grant select, insert, update, delete on public.eae011_sessions to service_role;
grant select, insert, update, delete on public.eae011_creation_windows to service_role;

create function public.eae011_create_session(
  p_session_id text, p_owner_id text, p_competition_id text,
  p_participant_role text, p_created_at bigint, p_expires_at bigint, p_state jsonb
) returns text
language plpgsql security invoker set search_path = ''
as $$
declare
  current_ms bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint;
  active_count integer;
  window_record public.eae011_creation_windows%rowtype;
begin
  if p_owner_id !~ '^user_[A-Za-z0-9]{8,80}$' or
     p_session_id !~ '^[A-Za-z0-9_-]{20,64}$' or
     p_expires_at < current_ms or p_expires_at > current_ms + 125000 or
     p_created_at > current_ms + 5000 or p_created_at < current_ms - 5000 then
    return 'INVALID';
  end if;
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
      p_participant_role, p_created_at, p_expires_at, 0, p_state);
  return 'OK';
end;
$$;

create function public.eae011_cleanup(p_now bigint) returns integer
language plpgsql security invoker set search_path = ''
as $$
declare removed integer;
begin
  delete from public.eae011_sessions where expires_at <= p_now
    or (state->>'idleUntil')::bigint <= p_now
    or (state->>'phase' = 'UNCLAIMED' and (state->>'claimUntil')::bigint <= p_now)
    or (state->>'engineStreamUntil' is not null and
        (state->>'engineStreamUntil')::bigint + 5000 < p_now)
    or (state->>'mainStreamUntil' is not null and
        (state->>'mainStreamUntil')::bigint + 5000 < p_now);
  get diagnostics removed = row_count;
  delete from public.eae011_creation_windows where window_started_at < p_now - 60000;
  return removed;
end;
$$;

revoke all on function public.eae011_create_session(text,text,text,text,bigint,bigint,jsonb)
  from public, anon, authenticated;
revoke all on function public.eae011_cleanup(bigint) from public, anon, authenticated;
grant execute on function public.eae011_create_session(text,text,text,text,bigint,bigint,jsonb)
  to service_role;
grant execute on function public.eae011_cleanup(bigint) to service_role;
