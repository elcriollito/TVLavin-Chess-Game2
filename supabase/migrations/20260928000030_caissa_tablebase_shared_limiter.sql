-- CAISSA tablebase: global provider reservation and backoff.
-- A single row serializes claims across Vercel instances; each RPC is a short transaction.
create table public.caissa_tablebase_provider_gate (
  singleton boolean primary key default true check (singleton),
  lease_id uuid,
  lease_expires_at timestamptz not null default '-infinity',
  next_request_at timestamptz not null default '-infinity',
  blocked_until timestamptz not null default '-infinity',
  minute_started_at timestamptz not null default '-infinity',
  minute_count integer not null default 0 check (minute_count between 0 and 20),
  updated_at timestamptz not null default clock_timestamp()
);
insert into public.caissa_tablebase_provider_gate (singleton) values (true);
alter table public.caissa_tablebase_provider_gate enable row level security;
revoke all on public.caissa_tablebase_provider_gate from public, anon, authenticated, service_role;

create function public.claim_caissa_tablebase_provider()
returns table (allowed boolean, code text, lease_id uuid, retry_after_seconds integer)
language plpgsql security definer set search_path = ''
as $$
declare
  v_gate public.caissa_tablebase_provider_gate%rowtype;
  v_now timestamptz;
  v_window timestamptz;
  v_lease uuid;
  v_wait timestamptz;
begin
  select * into strict v_gate from public.caissa_tablebase_provider_gate where singleton = true for update;
  v_now := clock_timestamp();
  v_window := date_trunc('minute', v_now);
  if v_gate.blocked_until > v_now then
    return query select false, 'PROVIDER_BACKOFF'::text, null::uuid,
      greatest(1, ceil(extract(epoch from v_gate.blocked_until - v_now))::integer); return;
  end if;
  if v_gate.lease_id is not null and v_gate.lease_expires_at > v_now then
    return query select false, 'PROVIDER_BUSY'::text, null::uuid,
      greatest(1, ceil(extract(epoch from v_gate.lease_expires_at - v_now))::integer); return;
  end if;
  if v_gate.next_request_at > v_now then
    return query select false, 'PROVIDER_PACING'::text, null::uuid,
      greatest(1, ceil(extract(epoch from v_gate.next_request_at - v_now))::integer); return;
  end if;
  if v_gate.minute_started_at = v_window and v_gate.minute_count >= 20 then
    v_wait := v_window + interval '1 minute';
    return query select false, 'PROVIDER_BUDGET'::text, null::uuid,
      greatest(1, ceil(extract(epoch from v_wait - v_now))::integer); return;
  end if;
  v_lease := gen_random_uuid();
  update public.caissa_tablebase_provider_gate
     set lease_id = v_lease,
         -- If the caller disappears during a provider 429, reserve at least a minute.
         lease_expires_at = v_now + interval '90 seconds',
         minute_started_at = v_window,
         minute_count = case when v_gate.minute_started_at = v_window then v_gate.minute_count + 1 else 1 end,
         updated_at = v_now
   where singleton = true;
  return query select true, 'ALLOWED'::text, v_lease, 0;
end;
$$;

create function public.release_caissa_tablebase_provider(p_lease_id uuid, p_retry_after_seconds integer default 0)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare v_now timestamptz := clock_timestamp();
begin
  if p_lease_id is null or p_retry_after_seconds not between 0 and 86400 then return false; end if;
  update public.caissa_tablebase_provider_gate
     set lease_id = null,
         lease_expires_at = '-infinity',
         next_request_at = greatest(next_request_at, v_now + interval '1 second'),
         blocked_until = case when p_retry_after_seconds > 0
           then greatest(blocked_until, v_now + make_interval(secs => greatest(60, p_retry_after_seconds)))
           else blocked_until end,
         updated_at = v_now
   where singleton = true and lease_id = p_lease_id;
  return found;
end;
$$;

revoke all on function public.claim_caissa_tablebase_provider() from public, anon, authenticated;
revoke all on function public.release_caissa_tablebase_provider(uuid,integer) from public, anon, authenticated;
grant execute on function public.claim_caissa_tablebase_provider() to service_role;
grant execute on function public.release_caissa_tablebase_provider(uuid,integer) to service_role;
