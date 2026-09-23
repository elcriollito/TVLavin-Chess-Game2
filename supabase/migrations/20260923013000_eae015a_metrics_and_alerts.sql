-- EAE-015A preview-only operational metrics. Apply to staging only.
create table if not exists public.eae015a_metric_minutes (
  bucket timestamptz not null,
  metric text not null,
  counter_value bigint not null default 0,
  gauge_value bigint,
  sample_count bigint not null default 0,
  latency_count bigint not null default 0,
  latency_sum_ms bigint not null default 0,
  latency_max_ms bigint not null default 0,
  primary key (bucket, metric)
);

alter table public.eae015a_metric_minutes enable row level security;
revoke all on public.eae015a_metric_minutes from public, anon, authenticated;
grant select, insert, update, delete on public.eae015a_metric_minutes to service_role;

create table if not exists public.eae015a_alert_rules (
  alert_id text primary key,
  metric text not null,
  window_minutes integer not null check (window_minutes between 1 and 60),
  threshold bigint not null check (threshold >= 0),
  severity text not null check (severity in ('HIGH', 'CRITICAL')),
  description text not null,
  enabled boolean not null default true
);

alter table public.eae015a_alert_rules enable row level security;
revoke all on public.eae015a_alert_rules from public, anon, authenticated;
grant select on public.eae015a_alert_rules to service_role;

insert into public.eae015a_alert_rules(alert_id, metric, window_minutes, threshold, severity, description)
values
  ('unexpected_session_gone', 'session_gone', 5, 1, 'HIGH', 'Any unexpected SESSION_GONE in a five-minute window'),
  ('stop_timeout_spike', 'stop_timeout', 5, 3, 'HIGH', 'Three STOP timeouts in five minutes'),
  ('forced_termination_spike', 'forced_termination', 5, 3, 'HIGH', 'Three forced runtime terminations in five minutes'),
  ('relay_error_spike', 'relay_error', 5, 10, 'HIGH', 'Ten relay errors in five minutes'),
  ('scheduled_cleanup_failure', 'scheduled_cleanup_failure', 5, 1, 'HIGH', 'Any scheduled cleanup failure in five minutes'),
  ('active_growth_without_cleanup', 'active_session_growth_without_cleanup', 5, 10, 'HIGH', 'Active sessions grow by ten without a cleanup success')
on conflict (alert_id) do update set
  metric = excluded.metric, window_minutes = excluded.window_minutes,
  threshold = excluded.threshold, severity = excluded.severity,
  description = excluded.description, enabled = true;

create or replace function public.eae015a_record_metrics(p_metrics jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  item jsonb;
  metric_name text;
  metric_kind text;
  metric_value bigint;
  latency_ms bigint;
  metric_bucket timestamptz := date_trunc('minute', clock_timestamp());
  allowed constant text[] := array[
    'active_sessions', 'create_attempt', 'create_success', 'claim_success', 'claim_failure',
    'ready_success', 'ready_failure', 'stop_timeout', 'session_gone', 'forced_termination',
    'worker_crash', 'network_hash_failure', 'auth_rejection', 'origin_rejection',
    'rate_limit_reject', 'lease_expiry', 'scheduled_cleanup', 'scheduled_cleanup_failure',
    'cleanup_success', 'cleanup_failure', 'relay_error', 'relay_request', 'db_read',
    'db_write', 'stream_reconnect', 'stream_reconnect_failure'
  ];
begin
  if jsonb_typeof(p_metrics) <> 'array' or jsonb_array_length(p_metrics) > 32 then
    raise exception 'METRICS_INVALID';
  end if;
  for item in select value from jsonb_array_elements(p_metrics)
  loop
    if jsonb_typeof(item) <> 'object' or
       exists (select 1 from jsonb_object_keys(item) key where key not in ('metric','kind','value','latencyMs')) then
      raise exception 'METRIC_ITEM_INVALID';
    end if;
    metric_name := item->>'metric';
    metric_kind := coalesce(item->>'kind', 'counter');
    metric_value := coalesce((item->>'value')::bigint, 1);
    latency_ms := case when item ? 'latencyMs' then (item->>'latencyMs')::bigint else null end;
    if not (metric_name = any(allowed)) or metric_kind not in ('counter','gauge') or
       metric_value < 0 or metric_value > 1000000 or
       (latency_ms is not null and (latency_ms < 0 or latency_ms > 3600000)) then
      raise exception 'METRIC_VALUE_INVALID';
    end if;
    insert into public.eae015a_metric_minutes(
      bucket, metric, counter_value, gauge_value, sample_count,
      latency_count, latency_sum_ms, latency_max_ms)
    values (
      metric_bucket, metric_name,
      case when metric_kind = 'counter' then metric_value else 0 end,
      case when metric_kind = 'gauge' then metric_value else null end,
      1, case when latency_ms is null then 0 else 1 end,
      coalesce(latency_ms, 0), coalesce(latency_ms, 0))
    on conflict (bucket, metric) do update set
      counter_value = public.eae015a_metric_minutes.counter_value + excluded.counter_value,
      gauge_value = coalesce(excluded.gauge_value, public.eae015a_metric_minutes.gauge_value),
      sample_count = public.eae015a_metric_minutes.sample_count + 1,
      latency_count = public.eae015a_metric_minutes.latency_count + excluded.latency_count,
      latency_sum_ms = public.eae015a_metric_minutes.latency_sum_ms + excluded.latency_sum_ms,
      latency_max_ms = greatest(public.eae015a_metric_minutes.latency_max_ms, excluded.latency_max_ms);
  end loop;
end
$$;

revoke all on function public.eae015a_record_metrics(jsonb) from public, anon, authenticated;
grant execute on function public.eae015a_record_metrics(jsonb) to service_role;

create or replace function public.eae015a_alert_snapshot()
returns table(alert_id text, severity text, observed bigint, threshold bigint, triggered boolean, description text)
language sql
security definer
set search_path = public
as $$
  with rules as (select * from public.eae015a_alert_rules where enabled),
  ordinary as (
    select r.alert_id, r.severity, coalesce(sum(m.counter_value), 0)::bigint observed,
      r.threshold, r.description
    from rules r
    left join public.eae015a_metric_minutes m on m.metric = r.metric
      and m.bucket >= date_trunc('minute', clock_timestamp()) - make_interval(mins => r.window_minutes)
    where r.metric <> 'active_session_growth_without_cleanup'
    group by r.alert_id, r.severity, r.threshold, r.description
  ), growth as (
    select r.alert_id, r.severity,
      case when coalesce((select sum(counter_value) from public.eae015a_metric_minutes
        where metric = 'cleanup_success' and bucket >= date_trunc('minute', clock_timestamp()) -
          make_interval(mins => r.window_minutes)), 0) = 0
      then greatest(0,
        coalesce((select max(gauge_value) from public.eae015a_metric_minutes
          where metric = 'active_sessions' and bucket >= date_trunc('minute', clock_timestamp()) -
            make_interval(mins => r.window_minutes)), 0) -
        coalesce((select max(gauge_value) from public.eae015a_metric_minutes
          where metric = 'active_sessions' and bucket < date_trunc('minute', clock_timestamp()) -
            make_interval(mins => r.window_minutes) and bucket >= date_trunc('minute', clock_timestamp()) -
            make_interval(mins => r.window_minutes * 2)), 0)) else 0 end::bigint observed,
      r.threshold, r.description
    from rules r where r.metric = 'active_session_growth_without_cleanup'
  ), combined as (select * from ordinary union all select * from growth)
  select alert_id, severity, observed, threshold, observed >= threshold, description
  from combined order by severity desc, alert_id
$$;

revoke all on function public.eae015a_alert_snapshot() from public, anon, authenticated;
grant execute on function public.eae015a_alert_snapshot() to service_role;

create or replace function public.eae015a_metrics_snapshot(p_minutes integer default 15)
returns table(metric text, counter_value bigint, gauge_value bigint, sample_count bigint,
  latency_count bigint, latency_average_ms numeric, latency_max_ms bigint)
language sql
security definer
set search_path = public
as $$
  select m.metric, sum(m.counter_value)::bigint,
    (array_agg(m.gauge_value order by m.bucket desc) filter (where m.gauge_value is not null))[1],
    sum(m.sample_count)::bigint, sum(m.latency_count)::bigint,
    case when sum(m.latency_count) = 0 then null
      else round(sum(m.latency_sum_ms)::numeric / sum(m.latency_count), 2) end,
    max(m.latency_max_ms)::bigint
  from public.eae015a_metric_minutes m
  where m.bucket >= date_trunc('minute', clock_timestamp()) -
    make_interval(mins => greatest(1, least(p_minutes, 60)))
  group by m.metric order by m.metric
$$;

revoke all on function public.eae015a_metrics_snapshot(integer) from public, anon, authenticated;
grant execute on function public.eae015a_metrics_snapshot(integer) to service_role;
