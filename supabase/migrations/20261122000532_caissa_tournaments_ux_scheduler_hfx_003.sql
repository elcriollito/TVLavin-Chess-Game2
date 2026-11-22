-- CAISSA Tournaments UX & Scheduler HFX-003.
--
-- The occurrence key remains the idempotency boundary. This migration repairs
-- an enabled series saved after its lead-time boundary by making the earliest
-- future, unmaterialized occurrence immediately due. It also exposes the
-- authoritative source/series classification needed by the directory; no
-- title, organizer name, or recurrence cadence is used as an identity signal.
begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

create or replace function caissa_online_private.recurring_candidate_dates(
  p_series_id uuid,p_from date,p_to date)
returns table(local_date date,starts_at timestamptz,occurrence_key text,ordinal integer)
language sql stable security invoker set search_path=''
as $$
  with series as (
    select s.*,
      (s.anchor_date-extract(dow from s.anchor_date)::integer)::date as anchor_week_start
    from public.caissa_online_tournament_series s
    where s.id=p_series_id
  ), eligible_dates as (
    select s.*,day::date as local_date
    from series s
    cross join lateral generate_series(
      s.anchor_date::timestamp,
      least(p_to,coalesce(s.end_date,p_to))::timestamp,
      interval '1 day') day
    where (
      s.series_kind='user' and (
        (s.frequency_unit='daily' and ((day::date-s.anchor_date)%s.interval_count)=0)
        or (s.frequency_unit='weekly'
          and extract(dow from day)::smallint=any(s.weekdays)
          and ((day::date-s.anchor_week_start)/7)%s.interval_count=0)
      )
    ) or (
      s.series_kind='official'
      and extract(dow from day)::smallint=s.weekday
      and ((day::date-s.anchor_week_start)/7)%greatest(s.interval_count,1)=0
    )
  ), expanded as (
    select d.local_date,
      (d.local_date+make_interval(
        hours=>(slot.value->>'hour')::integer,
        mins=>(slot.value->>'minute')::integer)) at time zone d.timezone as starts_at,
      d.slug||':'||d.local_date::text||':'||(slot.value->>'id') as occurrence_key,
      d.end_mode,d.end_after_occurrences,
      row_number() over(order by d.local_date,slot.ordinality)::integer as ordinal
    from eligible_dates d
    cross join lateral jsonb_array_elements(
      case when d.series_kind='official' then d.slots
        else jsonb_build_array(jsonb_build_object(
          'id','primary','hour',extract(hour from d.local_start_time)::integer,
          'minute',extract(minute from d.local_start_time)::integer)) end
    ) with ordinality as slot(value,ordinality)
  )
  select e.local_date,e.starts_at,e.occurrence_key,e.ordinal
  from expanded e
  cross join series s
  where e.local_date>=greatest(p_from,s.anchor_date)
    and (e.end_mode<>'after_count' or e.ordinal<=e.end_after_occurrences)
  order by e.starts_at,e.occurrence_key;
$$;

create or replace function caissa_online_private.recurring_state(
  p_clerk_id text,p_now timestamptz default clock_timestamp())
returns jsonb language sql stable security invoker set search_path=''
as $$
  select jsonb_build_object(
    'series',coalesce(jsonb_agg(jsonb_build_object(
      'id',s.id,'title',s.title,'description',s.description,'enabled',s.enabled,
      'seriesKind',s.series_kind,'source','community',
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
          'source',coalesce(tournament.source,'community'),
          'participantCount',coalesce((select count(*)
            from public.caissa_online_tournament_participants participant
            where participant.tournament_id=tournament.id and participant.state<>'withdrawn'),0)
        ) order by candidate.starts_at,candidate.occurrence_key)
        from (select * from caissa_online_private.recurring_candidate_dates(
          s.id,(p_now at time zone s.timezone)::date,
          (p_now at time zone s.timezone)::date+370) limit 12) candidate
        left join public.caissa_online_tournaments tournament
          on tournament.series_occurrence_key=candidate.occurrence_key
        left join public.caissa_online_tournament_series_skips skip
          on skip.series_id=s.id and skip.local_date=candidate.local_date
          and skip.slot_id=split_part(candidate.occurrence_key,':',3)
        where candidate.starts_at>p_now
      ),'[]'::jsonb),
      'past',coalesce((
        select jsonb_agg(jsonb_build_object(
          'id',past.id,'name',past.name,'status',past.status,'startsAt',past.starts_at,
          'source',past.source,
          'participantCount',(select count(*)
            from public.caissa_online_tournament_participants participant
            where participant.tournament_id=past.id and participant.state<>'withdrawn'))
          order by past.starts_at desc)
        from (select t.id,t.name,t.status,t.starts_at,t.source
          from public.caissa_online_tournaments t
          where t.series_id=s.id and t.starts_at<p_now
          order by t.starts_at desc limit 20) past
      ),'[]'::jsonb)
    ) order by s.created_at desc),'[]'::jsonb),
    'directory',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',listed.id,'title',listed.title,'seriesKind',listed.series_kind,
        'source',case when listed.series_kind='official' then 'official' else 'community' end,
        'template',listed.tournament_template,
        'upcoming',coalesce((
          select jsonb_agg(jsonb_build_object(
            'localDate',candidate.local_date,'startsAt',candidate.starts_at,
            'occurrenceKey',candidate.occurrence_key,'ordinal',candidate.ordinal,
            'state',case when tournament.id is not null then tournament.status
              when skip.series_id is not null then 'skipped' else 'planned' end,
            'tournamentId',tournament.id,'name',coalesce(tournament.name,listed.title),
            'source',coalesce(tournament.source,
              case when listed.series_kind='official' then 'official' else 'community' end),
            'participantCount',coalesce((select count(*)
              from public.caissa_online_tournament_participants participant
              where participant.tournament_id=tournament.id and participant.state<>'withdrawn'),0)
          ) order by candidate.starts_at,candidate.occurrence_key)
          from (select * from caissa_online_private.recurring_candidate_dates(
            listed.id,(p_now at time zone listed.timezone)::date,
            (p_now at time zone listed.timezone)::date+370) limit 12) candidate
          left join public.caissa_online_tournaments tournament
            on tournament.series_occurrence_key=candidate.occurrence_key
          left join public.caissa_online_tournament_series_skips skip
            on skip.series_id=listed.id and skip.local_date=candidate.local_date
            and skip.slot_id=split_part(candidate.occurrence_key,':',3)
          where candidate.starts_at>p_now
        ),'[]'::jsonb)
      ) order by listed.created_at desc)
      from (select candidate_series.*
        from public.caissa_online_tournament_series candidate_series
        where candidate_series.enabled
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
declare v_id uuid; v_slug text; v_first timestamptz; v_due timestamptz; v_now timestamptz:=clock_timestamp();
begin
  if p_clerk_id is null or char_length(p_clerk_id) not between 6 and 255
    or p_event_id is null or p_event_id !~ '^[A-Za-z0-9:_-]{12,120}$'
    then raise exception 'CAISSA_ONLINE_RECURRING_INVALID_IDENTITY'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_clerk_id,701402));
  select id into v_id from public.caissa_online_tournament_series
    where owner_clerk_id=p_clerk_id and creation_event_id=p_event_id;
  if v_id is not null then return caissa_online_private.recurring_state(p_clerk_id,v_now); end if;
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
        and created_at>v_now-interval '1 minute')
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
  if v_first is null or v_first<=v_now+interval '1 minute'
    or v_first>v_now+interval '366 days'
    then raise exception 'CAISSA_ONLINE_RECURRING_INVALID_FIRST_DATE'; end if;
  update public.caissa_online_tournament_series
    set next_generation_at=case when p_enabled then greatest(v_now,v_due) else null end,
      updated_at=v_now where id=v_id;
  return caissa_online_private.recurring_state(p_clerk_id,v_now);
end;
$$;

create or replace function public.caissa_online_recurring_series_manage(
  p_clerk_id text,p_event_id text,p_action text,p_payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security invoker set search_path=''
as $$
declare v_series public.caissa_online_tournament_series%rowtype; v_local_date date; v_tournament uuid;
  v_rule jsonb; v_next timestamptz; v_now timestamptz:=clock_timestamp();
begin
  select * into v_series from public.caissa_online_tournament_series
    where id=(p_payload->>'seriesId')::uuid and series_kind='user' and owner_clerk_id=p_clerk_id
    for update;
  if v_series.id is null then raise exception 'CAISSA_ONLINE_RECURRING_NOT_OWNER'; end if;
  if p_action='pause' then
    update public.caissa_online_tournament_series set enabled=false,next_generation_at=null,
      updated_at=v_now where id=v_series.id;
  elsif p_action='resume' then
    update public.caissa_online_tournament_series set enabled=true,next_generation_at=v_now,
      updated_at=v_now where id=v_series.id;
  elsif p_action='skip' then
    v_local_date:=(p_payload->>'localDate')::date;
    if v_local_date<(v_now at time zone v_series.timezone)::date
      or not exists(select 1 from caissa_online_private.recurring_candidate_dates(v_series.id,v_local_date,v_local_date))
      or exists(select 1 from public.caissa_online_tournaments
        where series_occurrence_key=v_series.slug||':'||v_local_date::text||':primary')
      then raise exception 'CAISSA_ONLINE_RECURRING_INVALID_SKIP'; end if;
    insert into public.caissa_online_tournament_series_skips(
      series_id,local_date,slot_id,reason,created_by_clerk_id)
    values(v_series.id,v_local_date,'primary',left(coalesce(nullif(btrim(p_payload->>'reason'),''),'Organizer skip'),240),p_clerk_id)
    on conflict(series_id,local_date,slot_id) do update
      set reason=excluded.reason,created_by_clerk_id=excluded.created_by_clerk_id,
        created_at=v_now;
  elsif p_action='cancel' then
    v_tournament:=(p_payload->>'tournamentId')::uuid;
    update public.caissa_online_tournaments
      set status='cancelled',cancelled_at=v_now,version=version+1,updated_at=v_now
      where id=v_tournament and series_id=v_series.id and starts_at>v_now
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
      enabled=coalesce((v_rule->>'enabled')::boolean,enabled),next_generation_at=v_now,
      updated_at=v_now
      where id=v_series.id;
  elsif p_action='inspect' then null;
  else raise exception 'CAISSA_ONLINE_RECURRING_INVALID_ACTION'; end if;
  select * into v_series from public.caissa_online_tournament_series
    where id=v_series.id for update;
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

create or replace function caissa_online_private.recurring_generate(
  p_now timestamptz,p_limit integer default 100)
returns integer language plpgsql security invoker set search_path=''
as $$
declare v_series public.caissa_online_tournament_series%rowtype; v_candidate record;
  v_count integer:=0; v_next timestamptz; v_end timestamptz;
begin
  for v_series in select * from public.caissa_online_tournament_series
    where series_kind='user' and enabled and next_generation_at<=p_now
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
        jsonb_build_object('betaSeason','S001','recurrenceSeason','S002','publicDirectory',true,
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
      next_generation_at=case when v_next is null then null else greatest(p_now,v_next) end,
      updated_at=p_now where id=v_series.id;
  end loop;
  return v_count;
end;
$$;

-- Repair every enabled community series from authoritative rules. In
-- particular, 739947f6-0552-45a5-ba24-ba5c1e3aeaa8 becomes due now without
-- changing its 2026-11-22 anchor, its end condition, or any occurrence ID.
update public.caissa_online_tournament_series series
set next_generation_at=(
  select greatest(clock_timestamp(),min(
    candidate.starts_at-series.generation_lead_days*interval '1 day')) as next_due
  from caissa_online_private.recurring_candidate_dates(series.id,
    (clock_timestamp() at time zone series.timezone)::date,
    (clock_timestamp() at time zone series.timezone)::date+370) candidate
  where candidate.starts_at>clock_timestamp()
    and not exists(select 1 from public.caissa_online_tournament_series_skips skip
      where skip.series_id=series.id and skip.local_date=candidate.local_date and skip.slot_id='primary')
    and not exists(select 1 from public.caissa_online_tournaments tournament
      where tournament.series_occurrence_key=candidate.occurrence_key)
),updated_at=clock_timestamp()
where series.series_kind='user' and series.enabled;

create or replace function public.caissa_online_tournament_identity_projection(p_ids uuid[])
returns jsonb language plpgsql stable security invoker set search_path=''
as $$
begin
  if p_ids is null or cardinality(p_ids)>500 then
    raise exception 'CAISSA_ONLINE_TOURNAMENT_IDENTITY_INVALID';
  end if;
  return (select coalesce(jsonb_agg(jsonb_build_object(
    'id',tournament.id,
    'source',tournament.source,
    'seriesId',tournament.series_id,
    'seriesKind',series.series_kind,
    'seriesSlug',series.slug
  ) order by tournament.starts_at,tournament.id),'[]'::jsonb)
  from public.caissa_online_tournaments tournament
  left join public.caissa_online_tournament_series series on series.id=tournament.series_id
  where tournament.id=any(p_ids)
    and tournament.visibility='private'
    and (tournament.configuration->>'betaSeason'='S001' or tournament.play_category='daily'));
end;
$$;

revoke all on function caissa_online_private.recurring_candidate_dates(uuid,date,date)
  from public,anon,authenticated;
revoke all on function caissa_online_private.recurring_state(text,timestamptz)
  from public,anon,authenticated;
revoke all on function caissa_online_private.recurring_generate(timestamptz,integer)
  from public,anon,authenticated;
revoke all on function public.caissa_online_tournament_identity_projection(uuid[])
  from public,anon,authenticated;
revoke all on function public.caissa_online_recurring_series_create(
  text,text,text,text,text,smallint,smallint[],date,time without time zone,smallint,
  text,date,smallint,boolean,text,integer,integer,integer,integer,boolean,boolean)
  from public,anon,authenticated;
revoke all on function public.caissa_online_recurring_series_manage(text,text,text,jsonb)
  from public,anon,authenticated;

grant execute on function caissa_online_private.recurring_candidate_dates(uuid,date,date) to service_role;
grant execute on function caissa_online_private.recurring_state(text,timestamptz) to service_role;
grant execute on function caissa_online_private.recurring_generate(timestamptz,integer) to service_role;
grant execute on function public.caissa_online_tournament_identity_projection(uuid[]) to service_role;
grant execute on function public.caissa_online_recurring_series_create(
  text,text,text,text,text,smallint,smallint[],date,time without time zone,smallint,
  text,date,smallint,boolean,text,integer,integer,integer,integer,boolean,boolean) to service_role;
grant execute on function public.caissa_online_recurring_series_manage(text,text,text,jsonb) to service_role;

alter function public.caissa_online_recurring_series_create(
  text,text,text,text,text,smallint,smallint[],date,time without time zone,smallint,
  text,date,smallint,boolean,text,integer,integer,integer,integer,boolean,boolean)
  set lock_timeout='2s';
alter function public.caissa_online_recurring_series_manage(text,text,text,jsonb)
  set lock_timeout='2s';
alter function caissa_online_private.recurring_generate(timestamptz,integer)
  set lock_timeout='2s';

comment on function caissa_online_private.recurring_candidate_dates(uuid,date,date) is
  'Authoritative planned-date projection for official and community series. Identity comes only from series_kind.';
comment on function caissa_online_private.recurring_generate(timestamptz,integer) is
  'Idempotent S002 generator. Eligible future occurrences whose lead boundary passed are due immediately; past events are never backfilled.';
comment on function public.caissa_online_tournament_identity_projection(uuid[]) is
  'Service-only bounded authoritative tournament source and recurrence-series identity projection.';

commit;
