-- CAISSA Recurring Tournaments S002.
-- Non-destructive extension of the existing S001 series, occurrence, ledger,
-- advisory-lock and pg_cron scheduler. The official Saturday series remains
-- on its legacy generation path and retains all existing occurrence records.
begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

alter table public.caissa_online_tournament_series
  add column if not exists owner_clerk_id text,
  add column if not exists series_kind text not null default 'official',
  add column if not exists frequency_unit text not null default 'weekly',
  add column if not exists interval_count smallint not null default 1,
  add column if not exists weekdays smallint[] not null default '{}'::smallint[],
  add column if not exists anchor_date date,
  add column if not exists local_start_time time without time zone,
  add column if not exists generation_lead_days smallint,
  add column if not exists end_mode text not null default 'never',
  add column if not exists end_date date,
  add column if not exists end_after_occurrences smallint,
  add column if not exists generated_count integer not null default 0,
  add column if not exists tournament_template jsonb not null default '{}'::jsonb,
  add column if not exists creation_event_id text,
  add column if not exists last_occurrence_at timestamptz;

-- Backfill only the new metadata. No official setting or occurrence changes.
update public.caissa_online_tournament_series
set series_kind = 'official',
    frequency_unit = 'weekly',
    interval_count = 1,
    weekdays = array[weekday]::smallint[],
    anchor_date = launch_not_before,
    generation_lead_days = registration_lead_days,
    tournament_template = jsonb_build_object(
      'format','arena','name',title,'pool',pool,'baseMs',base_ms,
      'incrementMs',increment_ms,'durationMinutes',duration_minutes,
      'capacity',capacity,'minimumPlayers',min_players,'rated',rated,
      'lateJoin',late_join,'official',true)
where slug = 'saturdays-of-chess-s001'
  and owner_clerk_id is null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'caissa_online_tournament_series_s002_kind_check'
      and conrelid = 'public.caissa_online_tournament_series'::regclass
  ) then
    alter table public.caissa_online_tournament_series
      add constraint caissa_online_tournament_series_s002_kind_check
      check (series_kind in ('official','user'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'caissa_online_tournament_series_s002_rule_check'
      and conrelid = 'public.caissa_online_tournament_series'::regclass
  ) then
    alter table public.caissa_online_tournament_series
      add constraint caissa_online_tournament_series_s002_rule_check check (
        frequency_unit in ('daily','weekly')
        and interval_count between 1 and 52
        and weekdays <@ array[0,1,2,3,4,5,6]::smallint[]
        and cardinality(weekdays) <= 7
        and end_mode in ('never','on_date','after_count')
        and generated_count >= 0
        and (
          series_kind = 'official'
          or (
            owner_clerk_id is not null and char_length(owner_clerk_id) between 6 and 255
            and anchor_date is not null and local_start_time is not null
            and generation_lead_days in (1,2)
            and ((frequency_unit = 'daily' and interval_count <= 30 and cardinality(weekdays) = 0)
              or (frequency_unit = 'weekly' and cardinality(weekdays) between 1 and 7))
            and ((end_mode = 'never' and end_date is null and end_after_occurrences is null)
              or (end_mode = 'on_date' and end_date >= anchor_date and end_after_occurrences is null)
              or (end_mode = 'after_count' and end_date is null and end_after_occurrences between 1 and 100))
            and jsonb_typeof(tournament_template) = 'object'
            and tournament_template->>'format' = 'arena'
            and coalesce((tournament_template->>'rated')::boolean,false) = false
          )
        )
      );
  end if;
end
$$;

create unique index if not exists caissa_online_tournament_series_creation_event_uq
  on public.caissa_online_tournament_series(owner_clerk_id,creation_event_id)
  where series_kind = 'user' and creation_event_id is not null;
create index if not exists caissa_online_tournament_series_owner_active_idx
  on public.caissa_online_tournament_series(owner_clerk_id,enabled,updated_at desc)
  where series_kind = 'user';
create index if not exists caissa_online_tournament_series_due_idx
  on public.caissa_online_tournament_series(next_generation_at,id)
  where series_kind = 'user' and enabled;

create or replace function caissa_online_private.recurring_candidate_dates(
  p_series_id uuid,p_from date,p_to date)
returns table(local_date date,starts_at timestamptz,occurrence_key text,ordinal integer)
language sql stable security invoker set search_path=''
as $$
  with series as (
    select s.*,
      (s.anchor_date - extract(dow from s.anchor_date)::integer)::date as anchor_week_start
    from public.caissa_online_tournament_series s
    where s.id=p_series_id and s.series_kind='user'
  ), eligible as (
    select d.local_date,
      (d.local_date+s.local_start_time) at time zone s.timezone as starts_at,
      s.slug||':'||d.local_date::text||':primary' as occurrence_key
    from series s
    cross join lateral (
      select day::date as local_date
      from generate_series(
        s.anchor_date::timestamp,
        least(p_to,coalesce(s.end_date,p_to))::timestamp,
        interval '1 day') day
      where (s.frequency_unit='daily'
          and ((day::date-s.anchor_date)%s.interval_count)=0)
        or (s.frequency_unit='weekly'
          and (extract(dow from day)::smallint=any(s.weekdays))
          and ((day::date-s.anchor_week_start)/7)%s.interval_count=0)
    ) d
  ), numbered as (
    select e.*,row_number() over(order by e.local_date)::integer as ordinal
    from eligible e
  )
  select e.local_date,e.starts_at,e.occurrence_key,e.ordinal
  from numbered e
  cross join series s
  where e.local_date>=greatest(p_from,s.anchor_date)
    and (s.end_mode<>'after_count' or e.ordinal<=s.end_after_occurrences)
  order by e.local_date;
$$;

-- Preserve the official S001 generator exactly, but explicitly scope it to
-- official series so user rules can never take the four-week legacy path.
create or replace function caissa_online_private.weekly_generate(
  p_now timestamptz,p_weeks integer default 4)
returns integer language plpgsql security invoker set search_path=''
as $$
declare v_series public.caissa_online_tournament_series%rowtype; v_first date; v_date date; v_slot jsonb;
  v_start timestamptz; v_end timestamptz; v_open timestamptz; v_key text; v_count integer:=0; v_week integer;
begin
  for v_series in select * from public.caissa_online_tournament_series
    where enabled and series_kind='official' order by slug for update loop
    v_first:=greatest((p_now at time zone v_series.timezone)::date,v_series.launch_not_before);
    v_first:=v_first+((v_series.weekday-extract(dow from v_first)::integer+7)%7);
    for v_week in 0..least(greatest(p_weeks,1),12)-1 loop
      v_date:=v_first+(v_week*7);
      for v_slot in select value from jsonb_array_elements(v_series.slots) loop
        if exists(select 1 from public.caissa_online_tournament_series_skips s
          where s.series_id=v_series.id and s.local_date=v_date and s.slot_id=v_slot->>'id')
          then continue; end if;
        v_start:=(v_date+make_interval(hours=>(v_slot->>'hour')::integer,
          mins=>(v_slot->>'minute')::integer)) at time zone v_series.timezone;
        v_end:=v_start+v_series.duration_minutes*interval '1 minute';
        v_open:=v_start-v_series.registration_lead_days*interval '1 day';
        v_key:=v_series.slug||':'||v_date::text||':'||(v_slot->>'id');
        insert into public.caissa_online_tournaments(
          name,source,format,status,pool,base_ms,increment_ms,rated,visibility,
          starts_at,ends_at,registration_opens_at,registration_closes_at,duration_minutes,
          late_join,capacity,min_players,configuration,created_by_clerk_id,play_category,
          series_id,series_occurrence_key)
        values(v_slot->>'label'||' · '||v_date::text,'official','arena',
          case when v_open<=p_now then 'registration_open' else 'scheduled' end,
          v_series.pool,v_series.base_ms,v_series.increment_ms,v_series.rated,'private',
          v_start,v_end,v_open,case when v_series.late_join then v_end else v_start end,
          v_series.duration_minutes,v_series.late_join,v_series.capacity,v_series.min_players,
          jsonb_build_object('betaSeason','S001','publicDirectory',false,
            'officialSeries',v_series.slug,'timeZone',v_series.timezone,
            'slotId',v_slot->>'id','featured',true,'chat',false,
            'finishingPolicy','finish_active_games'),
          'system:'||v_series.slug,'live',v_series.id,v_key)
        on conflict(series_occurrence_key) where series_occurrence_key is not null do nothing;
        if found then v_count:=v_count+1; end if;
      end loop;
    end loop;
    update public.caissa_online_tournament_series
      set last_generated_at=p_now,next_generation_at=p_now+interval '1 day',updated_at=p_now
      where id=v_series.id;
  end loop;
  return v_count;
end;
$$;

create or replace function caissa_online_private.recurring_state(
  p_clerk_id text,p_now timestamptz default clock_timestamp())
returns jsonb language sql stable security invoker set search_path=''
as $$
  select jsonb_build_object(
    'series',coalesce(jsonb_agg(jsonb_build_object(
      'id',s.id,'title',s.title,'description',s.description,'enabled',s.enabled,
      'frequencyUnit',s.frequency_unit,'interval',s.interval_count,
      'weekdays',to_jsonb(s.weekdays),'firstDate',s.anchor_date,
      'localTime',to_char(s.local_start_time,'HH24:MI'),'timeZone',s.timezone,
      'leadDays',s.generation_lead_days,'endMode',s.end_mode,'endDate',s.end_date,
      'occurrenceCount',s.end_after_occurrences,'generatedCount',s.generated_count,
      'lastGeneratedAt',s.last_generated_at,'nextGenerationAt',s.next_generation_at,
      'template',s.tournament_template,
      'upcoming',coalesce((
        select jsonb_agg(jsonb_build_object(
          'localDate',candidate.local_date,'startsAt',candidate.starts_at,
          'occurrenceKey',candidate.occurrence_key,'ordinal',candidate.ordinal,
          'state',case when tournament.id is not null then tournament.status
            when skip.series_id is not null then 'skipped' else 'planned' end,
          'tournamentId',tournament.id,'name',coalesce(tournament.name,s.title),
          'participantCount',coalesce((select count(*) from public.caissa_online_tournament_participants participant
            where participant.tournament_id=tournament.id and participant.state<>'withdrawn'),0)
        ) order by candidate.starts_at)
        from (select * from caissa_online_private.recurring_candidate_dates(
          s.id,(p_now at time zone s.timezone)::date,
          (p_now at time zone s.timezone)::date+370) limit 12) candidate
        left join public.caissa_online_tournaments tournament
          on tournament.series_occurrence_key=candidate.occurrence_key
        left join public.caissa_online_tournament_series_skips skip
          on skip.series_id=s.id and skip.local_date=candidate.local_date and skip.slot_id='primary'
        where candidate.starts_at>p_now
      ),'[]'::jsonb),
      'past',coalesce((
        select jsonb_agg(jsonb_build_object(
          'id',past.id,'name',past.name,'status',past.status,'startsAt',past.starts_at,
          'participantCount',(select count(*) from public.caissa_online_tournament_participants participant
            where participant.tournament_id=past.id and participant.state<>'withdrawn')) order by past.starts_at desc)
        from (select t.id,t.name,t.status,t.starts_at
          from public.caissa_online_tournaments t
          where t.series_id=s.id and t.starts_at<p_now
          order by t.starts_at desc limit 20) past
      ),'[]'::jsonb)
    ) order by s.created_at desc),'[]'::jsonb),
    'directory',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',listed.id,'title',listed.title,'template',listed.tournament_template,
        'upcoming',coalesce((
          select jsonb_agg(jsonb_build_object(
            'localDate',candidate.local_date,'startsAt',candidate.starts_at,
            'occurrenceKey',candidate.occurrence_key,'ordinal',candidate.ordinal,
            'state',case when tournament.id is not null then tournament.status
              when skip.series_id is not null then 'skipped' else 'planned' end,
            'tournamentId',tournament.id,'name',coalesce(tournament.name,listed.title),
            'participantCount',coalesce((select count(*)
              from public.caissa_online_tournament_participants participant
              where participant.tournament_id=tournament.id and participant.state<>'withdrawn'),0)
          ) order by candidate.starts_at)
          from (select * from caissa_online_private.recurring_candidate_dates(
            listed.id,(p_now at time zone listed.timezone)::date,
            (p_now at time zone listed.timezone)::date+370) limit 12) candidate
          left join public.caissa_online_tournaments tournament
            on tournament.series_occurrence_key=candidate.occurrence_key
          left join public.caissa_online_tournament_series_skips skip
            on skip.series_id=listed.id and skip.local_date=candidate.local_date and skip.slot_id='primary'
          where candidate.starts_at>p_now
        ),'[]'::jsonb)
      ) order by listed.created_at desc)
      from (select candidate_series.*
        from public.caissa_online_tournament_series candidate_series
        where candidate_series.series_kind='user' and candidate_series.enabled
        order by candidate_series.created_at desc
        limit 100) listed
    ),'[]'::jsonb)
  )
  from public.caissa_online_tournament_series s
  where s.series_kind='user' and s.owner_clerk_id=p_clerk_id;
$$;

create or replace function public.caissa_online_recurring_series_create(
  p_clerk_id text,p_event_id text,p_name text,p_time_zone text,
  p_frequency_unit text,p_interval smallint,p_weekdays smallint[],
  p_first_date date,p_local_time time without time zone,p_generation_lead_days smallint,
  p_end_mode text,p_end_date date,p_end_after_occurrences smallint,p_enabled boolean,
  p_pool text,p_base_ms integer,p_increment_ms integer,p_duration_minutes integer,
  p_capacity integer,p_late_join boolean,p_rated boolean default false)
returns jsonb language plpgsql security invoker set search_path=''
as $$
declare v_id uuid; v_slug text; v_first timestamptz; v_due timestamptz;
begin
  if p_clerk_id is null or char_length(p_clerk_id) not between 6 and 255
    or p_event_id is null or p_event_id !~ '^[A-Za-z0-9:_-]{12,120}$'
    then raise exception 'CAISSA_ONLINE_RECURRING_INVALID_IDENTITY'; end if;
  -- Serialize each owner's create/idempotency/limit checks. This makes a
  -- retried event return its existing series and prevents concurrent distinct
  -- events from bypassing the five-series limit or one-minute cooldown.
  perform pg_advisory_xact_lock(hashtextextended(p_clerk_id,701402));
  select id into v_id from public.caissa_online_tournament_series
    where owner_clerk_id=p_clerk_id and creation_event_id=p_event_id;
  if v_id is not null then return caissa_online_private.recurring_state(p_clerk_id,clock_timestamp()); end if;
  if not exists(select 1 from pg_timezone_names where name=p_time_zone)
    or p_name is null or char_length(btrim(p_name)) not between 3 and 80
    or p_name ~ '[<>[:cntrl:]]'
    or p_frequency_unit not in('daily','weekly')
    or p_interval not between 1 and (case when p_frequency_unit='daily' then 30 else 52 end)
    or (p_frequency_unit='daily' and cardinality(p_weekdays)<>0)
    or (p_frequency_unit='weekly' and (cardinality(p_weekdays) not between 1 and 7
      or not p_weekdays<@array[0,1,2,3,4,5,6]::smallint[]))
    or p_generation_lead_days not in(1,2)
    or p_end_mode not in('never','on_date','after_count')
    or (p_end_mode='never' and (p_end_date is not null or p_end_after_occurrences is not null))
    or (p_end_mode='on_date' and (p_end_date<p_first_date or p_end_after_occurrences is not null))
    or (p_end_mode='after_count' and (p_end_date is not null or p_end_after_occurrences not between 1 and 100))
    or p_pool not in('bullet','blitz','rapid') or p_base_ms not between 10000 and 86400000
    or p_increment_ms not between 0 and 600000 or p_duration_minutes not between 5 and 180
    or p_capacity not between 4 and 100 or p_rated
    then raise exception 'CAISSA_ONLINE_RECURRING_INVALID_CONFIGURATION'; end if;
  if (select count(*) from public.caissa_online_tournament_series
      where owner_clerk_id=p_clerk_id and series_kind='user')>=5
    then raise exception 'CAISSA_ONLINE_RECURRING_SERIES_LIMIT'; end if;
  if exists(select 1 from public.caissa_online_tournament_series
      where owner_clerk_id=p_clerk_id and series_kind='user'
        and created_at>clock_timestamp()-interval '1 minute')
    then raise exception 'CAISSA_ONLINE_RECURRING_CREATION_COOLDOWN'; end if;
  v_slug:='user-'||substr(md5(p_clerk_id||':'||p_event_id),1,24);
  insert into public.caissa_online_tournament_series(
    slug,title,description,timezone,weekday,launch_not_before,registration_lead_days,slots,
    pool,base_ms,increment_ms,duration_minutes,capacity,min_players,rated,late_join,enabled,
    owner_clerk_id,series_kind,frequency_unit,interval_count,weekdays,anchor_date,local_start_time,
    generation_lead_days,end_mode,end_date,end_after_occurrences,tournament_template,creation_event_id)
  values(v_slug,btrim(p_name),'User-created recurring Live Arena',p_time_zone,
    case when p_frequency_unit='weekly' then p_weekdays[1] else extract(dow from p_first_date)::smallint end,
    p_first_date,p_generation_lead_days,
    jsonb_build_array(jsonb_build_object('id','primary','label',btrim(p_name),
      'hour',extract(hour from p_local_time)::integer,'minute',extract(minute from p_local_time)::integer)),
    p_pool,p_base_ms,p_increment_ms,p_duration_minutes,p_capacity,4,false,p_late_join,p_enabled,
    p_clerk_id,'user',p_frequency_unit,p_interval,p_weekdays,p_first_date,p_local_time,
    p_generation_lead_days,p_end_mode,p_end_date,p_end_after_occurrences,
    jsonb_build_object('format','arena','name',btrim(p_name),'pool',p_pool,'baseMs',p_base_ms,
      'incrementMs',p_increment_ms,'durationMinutes',p_duration_minutes,'capacity',p_capacity,
      'minimumPlayers',4,'rated',false,'lateJoin',p_late_join,'playCategory','live'),p_event_id)
  returning id into v_id;
  select candidate.starts_at,candidate.starts_at-p_generation_lead_days*interval '1 day'
    into v_first,v_due
    from caissa_online_private.recurring_candidate_dates(v_id,p_first_date,p_first_date+370) candidate
    order by candidate.starts_at limit 1;
  if v_first is null or v_first<=clock_timestamp()+interval '1 minute'
    or v_first>clock_timestamp()+interval '366 days'
    then raise exception 'CAISSA_ONLINE_RECURRING_INVALID_FIRST_DATE'; end if;
  update public.caissa_online_tournament_series
    set next_generation_at=v_due,updated_at=clock_timestamp() where id=v_id;
  return caissa_online_private.recurring_state(p_clerk_id,clock_timestamp());
end;
$$;

create or replace function public.caissa_online_recurring_series_sync(p_clerk_id text)
returns jsonb language sql stable security invoker set search_path=''
as $$
  select caissa_online_private.recurring_state(p_clerk_id,clock_timestamp());
$$;

create or replace function public.caissa_online_recurring_series_manage(
  p_clerk_id text,p_event_id text,p_action text,p_payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security invoker set search_path=''
as $$
declare v_series public.caissa_online_tournament_series%rowtype; v_local_date date; v_tournament uuid;
  v_rule jsonb; v_next timestamptz;
begin
  select * into v_series from public.caissa_online_tournament_series
    where id=(p_payload->>'seriesId')::uuid and series_kind='user' and owner_clerk_id=p_clerk_id
    for update;
  if v_series.id is null then raise exception 'CAISSA_ONLINE_RECURRING_NOT_OWNER'; end if;
  if p_action='pause' then
    update public.caissa_online_tournament_series set enabled=false,next_generation_at=null,
      updated_at=clock_timestamp() where id=v_series.id;
  elsif p_action='resume' then
    update public.caissa_online_tournament_series set enabled=true,next_generation_at=clock_timestamp(),
      updated_at=clock_timestamp() where id=v_series.id;
  elsif p_action='skip' then
    v_local_date:=(p_payload->>'localDate')::date;
    if v_local_date<(clock_timestamp() at time zone v_series.timezone)::date
      or not exists(select 1 from caissa_online_private.recurring_candidate_dates(v_series.id,v_local_date,v_local_date))
      or exists(select 1 from public.caissa_online_tournaments
        where series_occurrence_key=v_series.slug||':'||v_local_date::text||':primary')
      then raise exception 'CAISSA_ONLINE_RECURRING_INVALID_SKIP'; end if;
    insert into public.caissa_online_tournament_series_skips(
      series_id,local_date,slot_id,reason,created_by_clerk_id)
    values(v_series.id,v_local_date,'primary',left(coalesce(nullif(btrim(p_payload->>'reason'),''),'Organizer skip'),240),p_clerk_id)
    on conflict(series_id,local_date,slot_id) do update
      set reason=excluded.reason,created_by_clerk_id=excluded.created_by_clerk_id,
        created_at=clock_timestamp();
  elsif p_action='cancel' then
    v_tournament:=(p_payload->>'tournamentId')::uuid;
    update public.caissa_online_tournaments
      set status='cancelled',cancelled_at=clock_timestamp(),version=version+1,updated_at=clock_timestamp()
      where id=v_tournament and series_id=v_series.id and starts_at>clock_timestamp()
        and status in('scheduled','registration_open');
    if not found then raise exception 'CAISSA_ONLINE_RECURRING_OCCURRENCE_NOT_CANCELLABLE'; end if;
  elsif p_action='update' then
    v_rule:=p_payload->'recurrence';
    if v_rule is null or not exists(select 1 from pg_timezone_names where name=v_rule->>'timeZone')
      or v_rule->>'frequencyUnit' not in('daily','weekly')
      or (v_rule->>'interval')::integer not between 1 and (case when v_rule->>'frequencyUnit'='daily' then 30 else 52 end)
      or (v_rule->>'leadDays')::integer not in(1,2)
      or v_rule->>'endMode' not in('never','on_date','after_count')
      then raise exception 'CAISSA_ONLINE_RECURRING_INVALID_CONFIGURATION'; end if;
    update public.caissa_online_tournament_series set
      timezone=v_rule->>'timeZone',frequency_unit=v_rule->>'frequencyUnit',
      interval_count=(v_rule->>'interval')::smallint,
      weekdays=case when v_rule->>'frequencyUnit'='weekly'
        then array(select jsonb_array_elements_text(v_rule->'weekdays')::smallint order by 1)
        else '{}'::smallint[] end,
      anchor_date=(v_rule->>'firstDate')::date,launch_not_before=(v_rule->>'firstDate')::date,
      local_start_time=(v_rule->>'localTime')::time,
      generation_lead_days=(v_rule->>'leadDays')::smallint,
      registration_lead_days=(v_rule->>'leadDays')::smallint,
      end_mode=v_rule->>'endMode',
      end_date=case when v_rule->>'endMode'='on_date' then (v_rule->>'endDate')::date else null end,
      end_after_occurrences=case when v_rule->>'endMode'='after_count'
        then (v_rule->>'occurrenceCount')::smallint else null end,
      enabled=coalesce((v_rule->>'enabled')::boolean,enabled),next_generation_at=clock_timestamp(),
      updated_at=clock_timestamp()
      where id=v_series.id;
  elsif p_action='inspect' then null;
  else raise exception 'CAISSA_ONLINE_RECURRING_INVALID_ACTION'; end if;
  select * into v_series from public.caissa_online_tournament_series
    where id=v_series.id for update;
  select min(candidate.starts_at-v_series.generation_lead_days*interval '1 day') into v_next
  from caissa_online_private.recurring_candidate_dates(v_series.id,
    (clock_timestamp() at time zone v_series.timezone)::date,
    (clock_timestamp() at time zone v_series.timezone)::date+370) candidate
  where candidate.starts_at>clock_timestamp()
    and not exists(select 1 from public.caissa_online_tournament_series_skips skip
      where skip.series_id=v_series.id and skip.local_date=candidate.local_date and skip.slot_id='primary')
    and not exists(select 1 from public.caissa_online_tournaments tournament
      where tournament.series_occurrence_key=candidate.occurrence_key);
  update public.caissa_online_tournament_series set
    next_generation_at=case when enabled then v_next else null end,updated_at=clock_timestamp()
    where id=v_series.id;
  return caissa_online_private.recurring_state(p_clerk_id,clock_timestamp());
end;
$$;

create or replace function caissa_online_private.recurring_generate(
  p_now timestamptz,p_limit integer default 100)
returns integer language plpgsql security invoker set search_path=''
as $$
declare v_series public.caissa_online_tournament_series%rowtype; v_candidate record;
  v_count integer:=0; v_next timestamptz; v_end timestamptz;
begin
  for v_series in select * from public.caissa_online_tournament_series
    where series_kind='user' and enabled
      and (next_generation_at is null or next_generation_at<=p_now)
    order by id for update skip locked loop
    for v_candidate in select * from caissa_online_private.recurring_candidate_dates(
      v_series.id,(p_now at time zone v_series.timezone)::date,
      (p_now at time zone v_series.timezone)::date+v_series.generation_lead_days+1)
      order by starts_at loop
      exit when v_count>=least(greatest(p_limit,1),500);
      if v_candidate.starts_at<=p_now
        or v_candidate.starts_at-v_series.generation_lead_days*interval '1 day'>p_now
        or exists(select 1 from public.caissa_online_tournament_series_skips skip
          where skip.series_id=v_series.id and skip.local_date=v_candidate.local_date and skip.slot_id='primary')
        then continue; end if;
      v_end:=v_candidate.starts_at+v_series.duration_minutes*interval '1 minute';
      insert into public.caissa_online_tournaments(
        name,source,format,status,pool,base_ms,increment_ms,rated,visibility,
        starts_at,ends_at,registration_opens_at,registration_closes_at,duration_minutes,
        late_join,capacity,min_players,configuration,created_by_clerk_id,play_category,
        series_id,series_occurrence_key)
      values(v_series.title,'community','arena','registration_open',v_series.pool,
        v_series.base_ms,v_series.increment_ms,false,'private',v_candidate.starts_at,v_end,
        v_candidate.starts_at-v_series.generation_lead_days*interval '1 day',
        case when v_series.late_join then v_end else v_candidate.starts_at end,
        v_series.duration_minutes,v_series.late_join,v_series.capacity,v_series.min_players,
        jsonb_build_object('betaSeason','S002','publicDirectory',true,
          'recurringSeries',v_series.slug,'timeZone',v_series.timezone,
          'localDate',v_candidate.local_date,'chat',false,'finishingPolicy','finish_active_games'),
        v_series.owner_clerk_id,'live',v_series.id,v_candidate.occurrence_key)
      on conflict(series_occurrence_key) where series_occurrence_key is not null do nothing;
      if found then
        v_count:=v_count+1;
        update public.caissa_online_tournament_series
          set generated_count=generated_count+1,last_occurrence_at=v_candidate.starts_at,
            last_generated_at=p_now,updated_at=p_now where id=v_series.id;
      end if;
    end loop;
    select min(candidate.starts_at-v_series.generation_lead_days*interval '1 day') into v_next
    from caissa_online_private.recurring_candidate_dates(v_series.id,
      (p_now at time zone v_series.timezone)::date,
      (p_now at time zone v_series.timezone)::date+370) candidate
    where candidate.starts_at>p_now
      and not exists(select 1 from public.caissa_online_tournament_series_skips skip
        where skip.series_id=v_series.id and skip.local_date=candidate.local_date and skip.slot_id='primary')
      and not exists(select 1 from public.caissa_online_tournaments tournament
        where tournament.series_occurrence_key=candidate.occurrence_key);
    update public.caissa_online_tournament_series set last_generated_at=p_now,
      next_generation_at=v_next,updated_at=p_now where id=v_series.id;
  end loop;
  return v_count;
end;
$$;

-- Extend the existing combined tick. It retains the same advisory lock, Cron
-- job and legacy official generator, then adds the bounded user-series pass.
create or replace function public.caissa_online_tournament_scheduler_tick(
  p_now timestamptz default clock_timestamp())
returns jsonb language plpgsql security invoker set search_path=''
as $$
declare v_run uuid:=gen_random_uuid(); v_official integer:=0; v_recurring integer:=0;
  v_transitioned integer:=0; v_t record;
begin
  perform pg_advisory_xact_lock(hashtextextended('caissa-tournament-scheduler-s001',701401));
  insert into public.caissa_online_scheduler_ledger(run_id,scheduler,status,started_at)
    values(v_run,'combined','running',p_now);
  v_official:=caissa_online_private.weekly_generate(p_now,4);
  v_recurring:=caissa_online_private.recurring_generate(p_now,100);
  update public.caissa_online_tournaments set status='registration_open',version=version+1,updated_at=p_now
    where series_id is not null and status='scheduled' and registration_opens_at<=p_now;
  for v_t in select t.id,t.status,t.min_players,t.starts_at,t.ends_at,
      (select count(*) from public.caissa_online_tournament_participants p
        where p.tournament_id=t.id and p.state<>'withdrawn') participants
    from public.caissa_online_tournaments t
    where t.series_id is not null and t.status in('registration_open','active','finishing')
      and (t.starts_at<=p_now or t.ends_at<=p_now)
    order by t.starts_at for update skip locked loop
    if v_t.status='registration_open' and v_t.starts_at<=p_now then
      if v_t.participants<v_t.min_players then
        update public.caissa_online_tournaments set status='cancelled',cancelled_at=p_now,
          version=version+1,updated_at=p_now where id=v_t.id;
      else
        update public.caissa_online_tournament_participants set state='waiting',waiting_since=p_now,
          updated_at=p_now where tournament_id=v_t.id and state='registered';
        update public.caissa_online_tournaments set status='active',version=version+1,
          updated_at=p_now where id=v_t.id;
        perform caissa_online_private.arena_reconcile(v_t.id);
      end if;
      v_transitioned:=v_transitioned+1;
    elsif v_t.status='active' and v_t.ends_at<=p_now then
      update public.caissa_online_tournaments set status='finishing',version=version+1,
        updated_at=p_now where id=v_t.id;
      perform caissa_online_private.arena_reconcile(v_t.id);
      v_transitioned:=v_transitioned+1;
    elsif v_t.status='finishing' then
      perform caissa_online_private.arena_reconcile(v_t.id);
    end if;
  end loop;
  v_transitioned:=v_transitioned+caissa_online_private.daily_process(p_now,100);
  update public.caissa_online_scheduler_ledger set status='completed',completed_at=clock_timestamp(),
    generated_count=v_official+v_recurring,transitioned_count=v_transitioned,
    metadata=jsonb_build_object('asOf',p_now,'officialGenerated',v_official,
      'recurringGenerated',v_recurring) where run_id=v_run;
  return jsonb_build_object('runId',v_run,'generated',v_official+v_recurring,
    'officialGenerated',v_official,'recurringGenerated',v_recurring,'transitioned',v_transitioned);
exception when others then
  insert into public.caissa_online_scheduler_ledger(
    run_id,scheduler,status,started_at,completed_at,error_code,metadata)
  values(v_run,'combined','failed',p_now,clock_timestamp(),sqlstate,
    jsonb_build_object('asOf',p_now,'message',left(sqlerrm,240)))
  on conflict(run_id) do update set status='failed',completed_at=excluded.completed_at,
    error_code=excluded.error_code,metadata=excluded.metadata;
  return jsonb_build_object('runId',v_run,'failed',true,'code',sqlstate);
end;
$$;

revoke all on function caissa_online_private.recurring_candidate_dates(uuid,date,date)
  from public,anon,authenticated;
revoke all on function caissa_online_private.recurring_state(text,timestamptz)
  from public,anon,authenticated;
revoke all on function caissa_online_private.recurring_generate(timestamptz,integer)
  from public,anon,authenticated;
revoke all on function public.caissa_online_recurring_series_create(
  text,text,text,text,text,smallint,smallint[],date,time without time zone,smallint,
  text,date,smallint,boolean,text,integer,integer,integer,integer,boolean,boolean)
  from public,anon,authenticated;
revoke all on function public.caissa_online_recurring_series_sync(text)
  from public,anon,authenticated;
revoke all on function public.caissa_online_recurring_series_manage(text,text,text,jsonb)
  from public,anon,authenticated;
revoke all on function public.caissa_online_tournament_scheduler_tick(timestamptz)
  from public,anon,authenticated;

grant execute on function caissa_online_private.recurring_candidate_dates(uuid,date,date)
  to service_role;
grant execute on function caissa_online_private.recurring_state(text,timestamptz)
  to service_role;
grant execute on function caissa_online_private.recurring_generate(timestamptz,integer)
  to service_role;
grant execute on function public.caissa_online_recurring_series_create(
  text,text,text,text,text,smallint,smallint[],date,time without time zone,smallint,
  text,date,smallint,boolean,text,integer,integer,integer,integer,boolean,boolean)
  to service_role;
grant execute on function public.caissa_online_recurring_series_sync(text)
  to service_role;
grant execute on function public.caissa_online_recurring_series_manage(text,text,text,jsonb)
  to service_role;
grant execute on function public.caissa_online_tournament_scheduler_tick(timestamptz)
  to service_role;

alter function public.caissa_online_recurring_series_create(
  text,text,text,text,text,smallint,smallint[],date,time without time zone,smallint,
  text,date,smallint,boolean,text,integer,integer,integer,integer,boolean,boolean)
  set lock_timeout='2s';
alter function public.caissa_online_recurring_series_manage(text,text,text,jsonb)
  set lock_timeout='2s';
alter function caissa_online_private.recurring_generate(timestamptz,integer)
  set lock_timeout='2s';
alter function public.caissa_online_tournament_scheduler_tick(timestamptz)
  set lock_timeout='2s';

comment on column public.caissa_online_tournament_series.generation_lead_days is
  'Record-generation lead for user series. Official S001 behavior remains on weekly_generate.';
comment on function caissa_online_private.recurring_generate(timestamptz,integer) is
  'Bounded S002 generator. Recovers a missed run only while an occurrence remains in the future; never creates past backlogs.';

commit;
