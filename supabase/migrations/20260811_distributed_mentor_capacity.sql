-- SEC-007/008/009: durable Mentor rate windows and expiring concurrency leases.
create table if not exists public.mentor_rate_windows (
  scope_hash text not null check (scope_hash ~ '^[0-9a-f]{64}$'),
  window_kind text not null check (window_kind in ('MINUTE','HOUR','DAY','GLOBAL_HOUR')),
  window_started_at timestamptz not null,
  request_count integer not null check (request_count > 0),
  updated_at timestamptz not null default now(),
  primary key (scope_hash, window_kind, window_started_at)
);

create table if not exists public.mentor_concurrency_leases (
  lease_id uuid primary key default gen_random_uuid(),
  scope_hash text not null check (scope_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  check (expires_at > created_at)
);
create index if not exists mentor_concurrency_leases_scope_expiry on public.mentor_concurrency_leases(scope_hash, expires_at);
alter table public.mentor_rate_windows enable row level security;
alter table public.mentor_concurrency_leases enable row level security;

create or replace function public.claim_mentor_capacity(
  p_scope_hash text, p_global_scope_hash text,
  p_minute_limit integer, p_hour_limit integer, p_daily_limit integer,
  p_global_hour_limit integer, p_concurrency_limit integer, p_lease_seconds integer
)
returns table(allowed boolean, code text, lease_id uuid, remaining integer, retry_after_seconds integer)
language plpgsql security definer set search_path = public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_minute timestamptz := date_trunc('minute', v_now);
  v_hour timestamptz := date_trunc('hour', v_now);
  v_day timestamptz := date_trunc('day', v_now at time zone 'UTC') at time zone 'UTC';
  v_count integer; v_lease uuid; v_remaining integer;
begin
  if p_scope_hash !~ '^[0-9a-f]{64}$' or p_global_scope_hash !~ '^[0-9a-f]{64}$'
     or p_minute_limit not between 1 and 100 or p_hour_limit not between 1 and 1000
     or p_daily_limit not between 1 and 10000 or p_global_hour_limit not between 1 and 100000
     or p_concurrency_limit not between 1 and 20 or p_lease_seconds not between 5 and 300 then
    return query select false, 'INVALID_POLICY'::text, null::uuid, 0, 60; return;
  end if;

  -- Fixed lock order prevents cross-instance races and deadlocks.
  perform pg_advisory_xact_lock(hashtextextended(p_global_scope_hash, 701));
  perform pg_advisory_xact_lock(hashtextextended(p_scope_hash, 702));
  delete from public.mentor_concurrency_leases where expires_at <= v_now;

  select count(*)::integer into v_count from public.mentor_concurrency_leases where scope_hash=p_scope_hash and expires_at>v_now;
  if v_count >= p_concurrency_limit then
    return query select false, 'CONCURRENCY_LIMITED'::text, null::uuid, 0,
      greatest(1, ceil(extract(epoch from (select min(expires_at)-v_now from public.mentor_concurrency_leases where scope_hash=p_scope_hash and expires_at>v_now)))::integer); return;
  end if;

  select coalesce(max(request_count),0) into v_count from public.mentor_rate_windows where scope_hash=p_scope_hash and window_kind='MINUTE' and window_started_at=v_minute;
  if v_count >= p_minute_limit then return query select false,'RATE_LIMITED'::text,null::uuid,0,greatest(1,ceil(extract(epoch from (v_minute+interval '1 minute'-v_now)))::integer); return; end if;
  select coalesce(max(request_count),0) into v_count from public.mentor_rate_windows where scope_hash=p_scope_hash and window_kind='HOUR' and window_started_at=v_hour;
  if v_count >= p_hour_limit then return query select false,'RATE_LIMITED'::text,null::uuid,0,greatest(1,ceil(extract(epoch from (v_hour+interval '1 hour'-v_now)))::integer); return; end if;
  select coalesce(max(request_count),0) into v_count from public.mentor_rate_windows where scope_hash=p_scope_hash and window_kind='DAY' and window_started_at=v_day;
  if v_count >= p_daily_limit then return query select false,'RATE_LIMITED'::text,null::uuid,0,greatest(1,ceil(extract(epoch from (v_day+interval '1 day'-v_now)))::integer); return; end if;
  select coalesce(max(request_count),0) into v_count from public.mentor_rate_windows where scope_hash=p_global_scope_hash and window_kind='GLOBAL_HOUR' and window_started_at=v_hour;
  if v_count >= p_global_hour_limit then return query select false,'GLOBAL_LIMITED'::text,null::uuid,0,greatest(1,ceil(extract(epoch from (v_hour+interval '1 hour'-v_now)))::integer); return; end if;

  insert into public.mentor_rate_windows(scope_hash,window_kind,window_started_at,request_count) values
    (p_scope_hash,'MINUTE',v_minute,1),(p_scope_hash,'HOUR',v_hour,1),(p_scope_hash,'DAY',v_day,1),(p_global_scope_hash,'GLOBAL_HOUR',v_hour,1)
  on conflict(scope_hash,window_kind,window_started_at) do update set request_count=mentor_rate_windows.request_count+1,updated_at=v_now;
  insert into public.mentor_concurrency_leases(scope_hash,expires_at) values(p_scope_hash,v_now+make_interval(secs=>p_lease_seconds)) returning mentor_concurrency_leases.lease_id into v_lease;
  select p_minute_limit-request_count into v_remaining from public.mentor_rate_windows where scope_hash=p_scope_hash and window_kind='MINUTE' and window_started_at=v_minute;
  return query select true,'ALLOWED'::text,v_lease,greatest(0,v_remaining),0;
end;
$$;

create or replace function public.release_mentor_capacity(p_lease_id uuid, p_scope_hash text)
returns boolean language plpgsql security definer set search_path = public
as $$
begin
  delete from public.mentor_concurrency_leases where lease_id=p_lease_id and scope_hash=p_scope_hash;
  return found;
end;
$$;

revoke all on public.mentor_rate_windows, public.mentor_concurrency_leases from public, anon, authenticated, service_role;
revoke all on function public.claim_mentor_capacity(text,text,integer,integer,integer,integer,integer,integer) from public, anon, authenticated;
revoke all on function public.release_mentor_capacity(uuid,text) from public, anon, authenticated;
grant execute on function public.claim_mentor_capacity(text,text,integer,integer,integer,integer,integer,integer) to service_role;
grant execute on function public.release_mentor_capacity(uuid,text) to service_role;

-- Rows older than two days are disposable limiter state; operators may schedule this bounded cleanup.
create or replace function public.cleanup_mentor_capacity()
returns integer language plpgsql security definer set search_path = public
as $$ declare v_rows integer; begin
  delete from public.mentor_concurrency_leases where expires_at <= clock_timestamp();
  delete from public.mentor_rate_windows where window_started_at < clock_timestamp()-interval '2 days';
  get diagnostics v_rows = row_count; return v_rows;
end; $$;
revoke all on function public.cleanup_mentor_capacity() from public, anon, authenticated;
grant execute on function public.cleanup_mentor_capacity() to service_role;
