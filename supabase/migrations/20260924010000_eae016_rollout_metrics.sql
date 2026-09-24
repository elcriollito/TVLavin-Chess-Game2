-- EAE-016 privacy-preserving product telemetry and internal rollout dashboard.
create table if not exists public.eae016_rollout_actor_events (
  bucket_date date not null default current_date,
  actor_hash text not null check (actor_hash ~ '^[0-9a-f]{64}$'),
  event text not null,
  event_count bigint not null default 1 check (event_count > 0),
  first_seen timestamptz not null default clock_timestamp(),
  last_seen timestamptz not null default clock_timestamp(),
  primary key (bucket_date, actor_hash, event)
);

alter table public.eae016_rollout_actor_events enable row level security;
revoke all on public.eae016_rollout_actor_events from public, anon, authenticated;
grant select, insert, update, delete on public.eae016_rollout_actor_events to service_role;

create table if not exists public.eae016_rollout_latency_samples (
  recorded_at timestamptz not null default clock_timestamp(),
  metric text not null,
  latency_ms integer not null check (latency_ms between 0 and 300000)
);

create index if not exists eae016_rollout_latency_samples_recorded_at_idx
  on public.eae016_rollout_latency_samples(recorded_at);
alter table public.eae016_rollout_latency_samples enable row level security;
revoke all on public.eae016_rollout_latency_samples from public, anon, authenticated;
grant select, insert, delete on public.eae016_rollout_latency_samples to service_role;

create or replace function public.eae016_record_rollout_event(
  p_actor_hash text, p_event text, p_latency_ms integer default null)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  allowed constant text[] := array[
    'eligible_user', 'opt_in_viewed', 'opt_in_enabled', 'opt_in_disabled',
    'lc0_selector_visible', 'lc0_session_requested', 'lc0_session_created', 'lc0_ready',
    'lc0_initialization_failed', 'lc0_popup_blocked', 'lc0_unsupported_browser',
    'lc0_match_started', 'lc0_match_completed', 'lc0_user_abort',
    'lc0_stop_completed', 'lc0_cleanup_completed', 'lc0_cleanup_failed',
    'lc0_transport_failed'
  ];
begin
  if p_actor_hash is null or p_actor_hash !~ '^[0-9a-f]{64}$' or
     not (p_event = any(allowed)) or
     (p_latency_ms is not null and (p_latency_ms < 0 or p_latency_ms > 300000)) then
    raise exception 'EAE016_EVENT_INVALID';
  end if;

  insert into public.eae016_rollout_actor_events(actor_hash, event)
  values (p_actor_hash, p_event)
  on conflict (bucket_date, actor_hash, event) do update set
    event_count = public.eae016_rollout_actor_events.event_count + 1,
    last_seen = clock_timestamp();

  if p_latency_ms is not null then
    insert into public.eae016_rollout_latency_samples(metric, latency_ms)
    values ('eae016_' || p_event, p_latency_ms);
  end if;

  delete from public.eae016_rollout_actor_events
    where bucket_date < current_date - 30;
  delete from public.eae016_rollout_latency_samples
    where recorded_at < clock_timestamp() - interval '30 days';
end
$$;

revoke all on function public.eae016_record_rollout_event(text, text, integer)
  from public, anon, authenticated;
grant execute on function public.eae016_record_rollout_event(text, text, integer)
  to service_role;

create or replace function public.eae016_rollout_dashboard(p_minutes integer default 60)
returns jsonb
language sql
security invoker
set search_path = public
as $$
  with limits as (
    select clock_timestamp() - make_interval(mins => greatest(1, least(p_minutes, 10080))) since
  ), events as (
    select event, sum(event_count)::bigint total,
      count(distinct actor_hash)::bigint actors
    from public.eae016_rollout_actor_events, limits
    where last_seen >= limits.since
    group by event
  ), latencies as (
    select metric,
      round(percentile_cont(0.5) within group (order by latency_ms))::bigint median_ms,
      round(percentile_cont(0.95) within group (order by latency_ms))::bigint p95_ms
    from public.eae016_rollout_latency_samples, limits
    where recorded_at >= limits.since
    group by metric
  ), operational as (
    select metric, sum(counter_value)::bigint total
    from public.eae015a_metric_minutes, limits
    where bucket >= limits.since
    group by metric
  )
  select jsonb_build_object(
    'windowMinutes', greatest(1, least(p_minutes, 10080)),
    'eligibleUsers', coalesce((select actors from events where event = 'eligible_user'), 0),
    'optIns', coalesce((select total from events where event = 'opt_in_enabled'), 0),
    'sessions', coalesce((select total from events where event = 'lc0_session_created'), 0),
    'successfulReady', coalesce((select total from events where event = 'lc0_ready'), 0),
    'successfulGames', coalesce((select total from events where event = 'lc0_match_completed'), 0),
    'initializationFailures', coalesce((select total from events where event = 'lc0_initialization_failed'), 0),
    'cleanupFailures', coalesce((select total from events where event = 'lc0_cleanup_failed'), 0) +
      coalesce((select total from operational where metric = 'cleanup_failure'), 0),
    'transportFailures', coalesce((select total from events where event = 'lc0_transport_failed'), 0) +
      coalesce((select total from operational where metric = 'stream_reconnect_failure'), 0),
    'forcedKills', coalesce((select total from operational where metric = 'forced_termination'), 0),
    'latency', jsonb_build_object(
      'ready', coalesce((select jsonb_build_object('medianMs', median_ms, 'p95Ms', p95_ms)
        from latencies where metric = 'eae016_lc0_ready'), '{"medianMs":null,"p95Ms":null}'::jsonb),
      'stop', coalesce((select jsonb_build_object('medianMs', median_ms, 'p95Ms', p95_ms)
        from latencies where metric = 'eae016_lc0_stop_completed'), '{"medianMs":null,"p95Ms":null}'::jsonb),
      'cleanup', coalesce((select jsonb_build_object('medianMs', median_ms, 'p95Ms', p95_ms)
        from latencies where metric = 'eae016_lc0_cleanup_completed'), '{"medianMs":null,"p95Ms":null}'::jsonb)
    )
  )
$$;

revoke all on function public.eae016_rollout_dashboard(integer)
  from public, anon, authenticated;
grant execute on function public.eae016_rollout_dashboard(integer) to service_role;
