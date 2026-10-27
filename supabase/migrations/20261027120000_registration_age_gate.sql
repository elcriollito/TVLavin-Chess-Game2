-- Prepared for the AUTH-004 human release gate. Do not apply automatically.
-- Stores only a one-way nonce digest and policy metadata; never birth data.

create table if not exists public.registration_age_gate_consumptions (
  nonce_hash text primary key check (nonce_hash ~ '^[0-9a-f]{64}$'),
  policy_version text not null check (char_length(policy_version) between 1 and 80),
  consumed_at timestamptz not null default now(),
  expires_at timestamptz not null,
  constraint registration_age_gate_expiry_after_consumption check (expires_at > consumed_at)
);

alter table public.registration_age_gate_consumptions enable row level security;
revoke all on table public.registration_age_gate_consumptions from anon, authenticated;

create or replace function public.consume_registration_age_gate(
  p_nonce_hash text,
  p_policy_version text,
  p_expires_at timestamptz
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_nonce_hash !~ '^[0-9a-f]{64}$'
     or char_length(p_policy_version) not between 1 and 80
     or p_expires_at <= now()
     or p_expires_at > now() + interval '15 minutes' then
    return false;
  end if;

  insert into public.registration_age_gate_consumptions (nonce_hash, policy_version, expires_at)
  values (p_nonce_hash, p_policy_version, p_expires_at)
  on conflict (nonce_hash) do nothing;
  return found;
end;
$$;

revoke all on function public.consume_registration_age_gate(text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.consume_registration_age_gate(text, text, timestamptz) to service_role;

comment on table public.registration_age_gate_consumptions is
  'Single-use registration gate nonces. Contains no birth month, birth year, email, Clerk ID, or user ID.';

create table if not exists public.registration_age_gate_rate_windows (
  scope_hash text not null check (scope_hash ~ '^[0-9a-f]{64}$'),
  bucket text not null check (bucket in ('eligibility-source', 'invitation-source', 'invitation-recipient')),
  window_start timestamptz not null,
  attempt_count integer not null check (attempt_count > 0),
  expires_at timestamptz not null,
  primary key (scope_hash, bucket, window_start),
  constraint registration_age_gate_rate_expiry check (expires_at > window_start)
);

create index if not exists registration_age_gate_rate_windows_expiry_idx
  on public.registration_age_gate_rate_windows (expires_at);

alter table public.registration_age_gate_rate_windows enable row level security;
revoke all on table public.registration_age_gate_rate_windows from anon, authenticated;

create or replace function public.claim_registration_age_gate_capacity(
  p_scope_hash text,
  p_bucket text,
  p_window_seconds integer,
  p_max_attempts integer
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_window_start timestamptz;
  v_attempt_count integer;
begin
  if p_scope_hash !~ '^[0-9a-f]{64}$'
     or p_bucket not in ('eligibility-source', 'invitation-source', 'invitation-recipient')
     or p_window_seconds not between 60 and 86400
     or p_max_attempts not between 1 and 100 then
    return false;
  end if;

  v_window_start := to_timestamp(
    floor(extract(epoch from clock_timestamp()) / p_window_seconds) * p_window_seconds
  );

  delete from public.registration_age_gate_rate_windows
    where expires_at < clock_timestamp() - interval '1 day';

  insert into public.registration_age_gate_rate_windows (
    scope_hash, bucket, window_start, attempt_count, expires_at
  ) values (
    p_scope_hash, p_bucket, v_window_start, 1, v_window_start + make_interval(secs => p_window_seconds)
  )
  on conflict (scope_hash, bucket, window_start) do update
    set attempt_count = public.registration_age_gate_rate_windows.attempt_count + 1
    where public.registration_age_gate_rate_windows.attempt_count < p_max_attempts
  returning attempt_count into v_attempt_count;

  return v_attempt_count is not null;
end;
$$;

revoke all on function public.claim_registration_age_gate_capacity(text, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.claim_registration_age_gate_capacity(text, text, integer, integer)
  to service_role;

comment on table public.registration_age_gate_rate_windows is
  'Short-lived registration abuse windows keyed only by HMAC digests; contains no raw IP address, email, or birth data.';
