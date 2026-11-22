-- Audited recovery path for an organizer's explicitly skipped community date.
-- The original skip is copied into an immutable server-only ledger before it
-- is removed from the active skip set. No official series can use this RPC.
begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

create table if not exists public.caissa_online_tournament_series_skip_recoveries (
  id uuid primary key default gen_random_uuid(),
  series_id uuid not null references public.caissa_online_tournament_series(id) on delete restrict,
  local_date date not null,
  slot_id text not null,
  original_reason text not null,
  original_created_by_clerk_id text,
  original_created_at timestamptz not null,
  recovered_by_clerk_id text not null,
  recovery_event_id text not null unique,
  recovery_reason text not null,
  recovered_at timestamptz not null default clock_timestamp(),
  constraint caissa_online_skip_recovery_slot_check check (slot_id ~ '^[a-z0-9_-]{1,40}$'),
  constraint caissa_online_skip_recovery_event_check check (recovery_event_id ~ '^[A-Za-z0-9:_-]{12,120}$'),
  constraint caissa_online_skip_recovery_reason_check check (char_length(recovery_reason) between 3 and 240)
);

alter table public.caissa_online_tournament_series_skip_recoveries enable row level security;
revoke all on table public.caissa_online_tournament_series_skip_recoveries from public,anon,authenticated;
grant select,insert on table public.caissa_online_tournament_series_skip_recoveries to service_role;

create index if not exists caissa_online_skip_recoveries_series_date_idx
  on public.caissa_online_tournament_series_skip_recoveries(series_id,local_date,recovered_at desc);

create or replace function public.caissa_online_recurring_series_unskip(
  p_clerk_id text,p_event_id text,p_series_id uuid,p_local_date date,
  p_reason text default 'Organizer restored occurrence')
returns jsonb language plpgsql security invoker set search_path=''
as $$
declare
  v_series public.caissa_online_tournament_series%rowtype;
  v_skip public.caissa_online_tournament_series_skips%rowtype;
  v_next timestamptz;
  v_now timestamptz:=clock_timestamp();
begin
  if p_clerk_id is null or char_length(p_clerk_id) not between 6 and 255
    or p_event_id is null or p_event_id !~ '^[A-Za-z0-9:_-]{12,120}$'
    or p_reason is null or char_length(btrim(p_reason)) not between 3 and 240
    then raise exception 'CAISSA_ONLINE_RECURRING_INVALID_IDENTITY'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_clerk_id,701403));
  if exists(select 1 from public.caissa_online_tournament_series_skip_recoveries
      where recovery_event_id=p_event_id) then
    return caissa_online_private.recurring_state(p_clerk_id,v_now);
  end if;
  select * into v_series from public.caissa_online_tournament_series
    where id=p_series_id and series_kind='user' and owner_clerk_id=p_clerk_id
    for update;
  if v_series.id is null then raise exception 'CAISSA_ONLINE_RECURRING_NOT_OWNER'; end if;
  if p_local_date<(v_now at time zone v_series.timezone)::date
    or exists(select 1 from public.caissa_online_tournaments tournament
      where tournament.series_occurrence_key=v_series.slug||':'||p_local_date::text||':primary')
    then raise exception 'CAISSA_ONLINE_RECURRING_INVALID_UNSKIP'; end if;
  select * into v_skip from public.caissa_online_tournament_series_skips
    where series_id=v_series.id and local_date=p_local_date and slot_id='primary'
    for update;
  if v_skip.series_id is null then raise exception 'CAISSA_ONLINE_RECURRING_INVALID_UNSKIP'; end if;
  insert into public.caissa_online_tournament_series_skip_recoveries(
    series_id,local_date,slot_id,original_reason,original_created_by_clerk_id,
    original_created_at,recovered_by_clerk_id,recovery_event_id,recovery_reason,recovered_at)
  values(v_skip.series_id,v_skip.local_date,v_skip.slot_id,v_skip.reason,
    v_skip.created_by_clerk_id,v_skip.created_at,p_clerk_id,p_event_id,btrim(p_reason),v_now);
  delete from public.caissa_online_tournament_series_skips
    where series_id=v_skip.series_id and local_date=v_skip.local_date and slot_id=v_skip.slot_id;
  select min(candidate.starts_at-v_series.generation_lead_days*interval '1 day') into v_next
  from caissa_online_private.recurring_candidate_dates(v_series.id,
    (v_now at time zone v_series.timezone)::date,
    (v_now at time zone v_series.timezone)::date+370) candidate
  where candidate.starts_at>v_now
    and not exists(select 1 from public.caissa_online_tournament_series_skips skip
      where skip.series_id=v_series.id and skip.local_date=candidate.local_date and skip.slot_id='primary')
    and not exists(select 1 from public.caissa_online_tournaments tournament
      where tournament.series_occurrence_key=candidate.occurrence_key);
  update public.caissa_online_tournament_series set
    next_generation_at=case when enabled and v_next is not null then greatest(v_now,v_next) else null end,
    updated_at=v_now where id=v_series.id;
  return caissa_online_private.recurring_state(p_clerk_id,v_now);
end;
$$;

revoke all on function public.caissa_online_recurring_series_unskip(text,text,uuid,date,text)
  from public,anon,authenticated;
grant execute on function public.caissa_online_recurring_series_unskip(text,text,uuid,date,text)
  to service_role;
alter function public.caissa_online_recurring_series_unskip(text,text,uuid,date,text)
  set lock_timeout='2s';

comment on table public.caissa_online_tournament_series_skip_recoveries is
  'Immutable service-only audit ledger for explicit organizer unskip operations.';
comment on function public.caissa_online_recurring_series_unskip(text,text,uuid,date,text) is
  'Owner-scoped, idempotent unskip. Archives the original skip before rearming the future occurrence.';

commit;
