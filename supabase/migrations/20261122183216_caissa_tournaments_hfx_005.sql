-- CAISSA HFX-005: explicit Arena rest state, service-only official series
-- operations, and server-authoritative tournament information projection.
begin;

set local lock_timeout = '5s';
set local statement_timeout = '90s';

alter table public.caissa_online_tournament_participants
  drop constraint if exists caissa_online_arena_participant_state_check;
alter table public.caissa_online_tournament_participants
  add constraint caissa_online_arena_participant_state_check
  check (state in ('registered','waiting','playing','resting','withdrawn','disconnected'));

-- A completed Arena game always returns both active participants to a durable
-- break. This closes the previous score -> waiting -> immediate-pair race.
create or replace function caissa_online_private.arena_score_game(p_game_id uuid)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_game public.caissa_online_games%rowtype;
  v_link public.caissa_online_tournament_games%rowtype;
  v_tournament public.caissa_online_tournaments%rowtype;
  v_white_points smallint;
  v_black_points smallint;
begin
  select * into v_game from public.caissa_online_games where id=p_game_id for update;
  if v_game.id is null or v_game.status<>'completed' or v_game.result is null then return false; end if;
  select * into v_link from public.caissa_online_tournament_games where game_id=p_game_id for update;
  if v_link.game_id is null or v_link.scored_at is not null then return false; end if;
  select * into v_tournament from public.caissa_online_tournaments where id=v_link.tournament_id for update;
  if v_tournament.scoring_contract<>'arena-s001-2-1-0' then
    raise exception 'CAISSA_ONLINE_ARENA_SCORING_CONTRACT';
  end if;

  v_white_points:=case v_game.result when '1-0' then 2 when '1/2-1/2' then 1 else 0 end;
  v_black_points:=case v_game.result when '0-1' then 2 when '1/2-1/2' then 1 else 0 end;

  update public.caissa_online_tournament_participants participant
  set score=score+case when participant.user_id=v_game.white_user_id then v_white_points else v_black_points end,
      games_played=games_played+1,
      wins=wins+case
        when participant.user_id=v_game.white_user_id and v_white_points=2 then 1
        when participant.user_id=v_game.black_user_id and v_black_points=2 then 1 else 0 end,
      draws=draws+case when v_game.result='1/2-1/2' then 1 else 0 end,
      losses=losses+case
        when participant.user_id=v_game.white_user_id and v_white_points=0 then 1
        when participant.user_id=v_game.black_user_id and v_black_points=0 then 1 else 0 end,
      state=case when participant.state='withdrawn' then 'withdrawn'
        when v_tournament.status='active' and v_tournament.ends_at>pg_catalog.clock_timestamp()
          then 'resting'
        else 'registered' end,
      waiting_since=null,
      disconnected_at=null,
      updated_at=pg_catalog.clock_timestamp()
  where participant.tournament_id=v_link.tournament_id
    and participant.user_id in(v_game.white_user_id,v_game.black_user_id);

  update public.caissa_online_tournament_games
  set scored_at=pg_catalog.clock_timestamp(),white_points=v_white_points,black_points=v_black_points
  where tournament_id=v_link.tournament_id and game_id=p_game_id and scored_at is null;
  update public.caissa_online_arena_pairings
  set state='finished',finished_at=pg_catalog.clock_timestamp(),updated_at=pg_catalog.clock_timestamp()
  where id=v_link.pairing_id and state<>'finished';
  update public.caissa_online_tournaments
  set version=version+1,updated_at=pg_catalog.clock_timestamp()
  where id=v_link.tournament_id;
  insert into public.caissa_online_arena_events(tournament_id,event_id,event_type,payload)
  values(v_link.tournament_id,'arena-result:'||p_game_id::text,'game.scored',
    pg_catalog.jsonb_build_object('gameId',p_game_id,'result',v_game.result,
      'whitePoints',v_white_points,'blackPoints',v_black_points,'nextState','resting'))
  on conflict(tournament_id,event_id) do nothing;
  return true;
end;
$$;

create or replace function public.caissa_online_arena_next(
  p_clerk_id text,p_tournament_id uuid,p_event_id text)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_tournament public.caissa_online_tournaments%rowtype;
  v_participant public.caissa_online_tournament_participants%rowtype;
begin
  select id into v_user_id from public.users where clerk_id=p_clerk_id and role<>'online_guest';
  if v_user_id is null then raise exception 'CAISSA_ONLINE_IDENTITY_NOT_FOUND'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_tournament_id::text,701101));
  select * into v_tournament from public.caissa_online_tournaments
    where id=p_tournament_id and configuration->>'betaSeason'='S001' for update;
  if v_tournament.id is null then raise exception 'CAISSA_ONLINE_ARENA_NOT_FOUND'; end if;
  if exists(select 1 from public.caissa_online_arena_events
    where tournament_id=p_tournament_id and event_id=p_event_id) then
    return public.caissa_online_arena_sync(p_clerk_id,p_tournament_id);
  end if;
  select * into v_participant from public.caissa_online_tournament_participants
    where tournament_id=p_tournament_id and user_id=v_user_id for update;
  if v_participant.user_id is null then raise exception 'CAISSA_ONLINE_ARENA_NOT_JOINED'; end if;
  if v_tournament.status<>'active' or v_tournament.ends_at<=pg_catalog.clock_timestamp() then
    raise exception 'CAISSA_ONLINE_ARENA_MANAGE_INVALID_STATE';
  end if;
  if v_participant.state='resting' then
    update public.caissa_online_tournament_participants
    set state='waiting',waiting_since=pg_catalog.clock_timestamp(),disconnected_at=null,
      updated_at=pg_catalog.clock_timestamp()
    where tournament_id=p_tournament_id and user_id=v_user_id;
  elsif v_participant.state not in('waiting','playing') then
    raise exception 'CAISSA_ONLINE_ARENA_NEXT_INVALID_STATE';
  end if;
  insert into public.caissa_online_arena_events(
    tournament_id,event_id,event_type,actor_user_id,payload)
  values(p_tournament_id,p_event_id,'participant.rest-ended',v_user_id,
    pg_catalog.jsonb_build_object('priorState',v_participant.state))
  on conflict(tournament_id,event_id) do nothing;
  perform caissa_online_private.arena_reconcile(p_tournament_id);
  return caissa_online_private.arena_payload(p_clerk_id,p_tournament_id);
end;
$$;

-- Resting is meaningful only while an Arena can still make pairings.
create or replace function caissa_online_private.normalize_arena_rest_on_terminal_status()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.status in('finishing','completed','cancelled') and new.status is distinct from old.status then
    update public.caissa_online_tournament_participants
      set state='registered',waiting_since=null,updated_at=pg_catalog.clock_timestamp()
      where tournament_id=new.id and state='resting';
  end if;
  return new;
end;
$$;

drop trigger if exists caissa_online_arena_rest_terminal on public.caissa_online_tournaments;
create trigger caissa_online_arena_rest_terminal
after update of status on public.caissa_online_tournaments
for each row execute function caissa_online_private.normalize_arena_rest_on_terminal_status();

-- The service consumes organizer subjects only to resolve a public nickname.
-- The API projection removes organizerClerkId before returning data.
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
    'seriesSlug',series.slug,
    'organizerClerkId',case when tournament.source='community'
      then tournament.created_by_clerk_id else null end,
    'timeZone',coalesce(tournament.configuration->>'timeZone',series.timezone)
  ) order by tournament.starts_at,tournament.id),'[]'::jsonb)
  from public.caissa_online_tournaments tournament
  left join public.caissa_online_tournament_series series on series.id=tournament.series_id
  where tournament.id=any(p_ids)
    and tournament.visibility='private'
    and (tournament.configuration->>'betaSeason'='S001' or tournament.play_category='daily'));
end;
$$;

create table if not exists public.caissa_online_series_operator_audit(
  id bigint generated always as identity primary key,
  event_id text not null unique check(event_id ~ '^[A-Za-z0-9:_-]{12,120}$'),
  actor text not null check(char_length(actor) between 6 and 160),
  action text not null check(action in('create','pause','resume','skip','unskip','update','cancel','inspect')),
  series_id uuid references public.caissa_online_tournament_series(id) on delete set null,
  payload jsonb not null default '{}'::jsonb check(jsonb_typeof(payload)='object'),
  created_at timestamptz not null default pg_catalog.clock_timestamp()
);
alter table public.caissa_online_series_operator_audit enable row level security;
revoke all on public.caissa_online_series_operator_audit from public,anon,authenticated;
grant select,insert on public.caissa_online_series_operator_audit to service_role;
grant usage,select on sequence public.caissa_online_series_operator_audit_id_seq to service_role;

-- Service-role-only workflow for non-public official series administration.
-- Browser requests never call this RPC.
create or replace function public.caissa_online_official_series_operator(
  p_event_id text,p_action text,p_payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security invoker set search_path=''
as $$
declare
  v_series public.caissa_online_tournament_series%rowtype;
  v_id uuid;
  v_actor text:=nullif(pg_catalog.btrim(p_payload->>'actor'),'');
  v_slug text:=nullif(pg_catalog.btrim(p_payload->>'slug'),'');
  v_slots jsonb:=p_payload->'slots';
  v_local_date date;
  v_slot_id text;
  v_tournament_id uuid;
  v_now timestamptz:=pg_catalog.clock_timestamp();
begin
  if p_event_id is null or p_event_id!~'^[A-Za-z0-9:_-]{12,120}$'
    or v_actor is null or char_length(v_actor) not between 6 and 160
    or p_action not in('create','pause','resume','skip','unskip','update','cancel','inspect') then
    raise exception 'CAISSA_ONLINE_OFFICIAL_OPERATOR_INVALID';
  end if;
  if exists(select 1 from pg_catalog.jsonb_object_keys(p_payload) key
    where key not in('actor','slug','seriesId',
      'title','description','timeZone','frequencyUnit','interval','firstDate','leadDays',
      'pool','baseMs','incrementMs','durationMinutes','capacity','minimumPlayers','slots',
      'weekdays','endMode','endDate','occurrenceCount','rated','lateJoin','enabled',
      'localDate','slotId','reason','tournamentId','applyFuture'))
  then raise exception 'CAISSA_ONLINE_OFFICIAL_OPERATOR_INVALID'; end if;
  if (p_action='create' and exists(select 1 from pg_catalog.jsonb_object_keys(p_payload) key
      where key not in('actor','slug','title','description','timeZone','frequencyUnit','interval',
        'firstDate','leadDays','pool','baseMs','incrementMs','durationMinutes','capacity',
        'minimumPlayers','slots','weekdays','endMode','endDate','occurrenceCount','rated',
        'lateJoin','enabled')))
    or (p_action in('pause','resume','inspect') and exists(
      select 1 from pg_catalog.jsonb_object_keys(p_payload) key
      where key not in('actor','slug','seriesId')))
    or (p_action='skip' and exists(select 1 from pg_catalog.jsonb_object_keys(p_payload) key
      where key not in('actor','slug','seriesId','localDate','slotId','reason')))
    or (p_action='unskip' and exists(select 1 from pg_catalog.jsonb_object_keys(p_payload) key
      where key not in('actor','slug','seriesId','localDate','slotId')))
    or (p_action='cancel' and exists(select 1 from pg_catalog.jsonb_object_keys(p_payload) key
      where key not in('actor','slug','seriesId','tournamentId')))
    or (p_action='update' and exists(select 1 from pg_catalog.jsonb_object_keys(p_payload) key
      where key not in('actor','slug','seriesId','capacity','minimumPlayers','durationMinutes',
        'lateJoin','applyFuture')))
  then raise exception 'CAISSA_ONLINE_OFFICIAL_OPERATOR_INVALID'; end if;
  if exists(select 1 from public.caissa_online_series_operator_audit where event_id=p_event_id) then
    select * into v_series from public.caissa_online_tournament_series
      where id=(select series_id from public.caissa_online_series_operator_audit where event_id=p_event_id);
    return pg_catalog.jsonb_build_object('series',to_jsonb(v_series),'idempotent',true);
  end if;

  if p_action='create' then
    if v_slug is null or v_slug!~'^[a-z0-9]+(?:-[a-z0-9]+)*$'
      or v_slug='saturdays-of-chess-s001'
      or char_length(pg_catalog.btrim(p_payload->>'title')) not between 3 and 120
      or not exists(select 1 from pg_catalog.pg_timezone_names where name=p_payload->>'timeZone')
      or p_payload->>'frequencyUnit' not in('daily','weekly')
      or not pg_catalog.pg_input_is_valid(p_payload->>'firstDate','date')
      or not pg_catalog.pg_input_is_valid(p_payload->>'interval','integer')
      or not pg_catalog.pg_input_is_valid(p_payload->>'leadDays','integer')
      or not pg_catalog.pg_input_is_valid(p_payload->>'baseMs','integer')
      or not pg_catalog.pg_input_is_valid(p_payload->>'incrementMs','integer')
      or not pg_catalog.pg_input_is_valid(p_payload->>'durationMinutes','integer')
      or not pg_catalog.pg_input_is_valid(p_payload->>'capacity','integer')
      or not pg_catalog.pg_input_is_valid(p_payload->>'minimumPlayers','integer')
      or (p_payload->>'pool') not in('bullet','blitz','rapid')
      or (p_payload ? 'rated' and pg_catalog.jsonb_typeof(p_payload->'rated')<>'boolean')
      or (p_payload ? 'lateJoin' and pg_catalog.jsonb_typeof(p_payload->'lateJoin')<>'boolean')
      or (p_payload ? 'enabled' and pg_catalog.jsonb_typeof(p_payload->'enabled')<>'boolean')
      or coalesce(p_payload->>'endMode','never') not in('never','on_date','after_count')
      or pg_catalog.jsonb_typeof(v_slots)<>'array'
    then raise exception 'CAISSA_ONLINE_OFFICIAL_OPERATOR_INVALID'; end if;
    if (p_payload->>'interval')::integer not between 1 and
        (case when p_payload->>'frequencyUnit'='daily' then 30 else 52 end)
      or (p_payload->>'leadDays')::integer not between 1 and 30
      or (p_payload->>'baseMs')::integer not between 10000 and 86400000
      or (p_payload->>'incrementMs')::integer not between 0 and 600000
      or (p_payload->>'durationMinutes')::integer not between 5 and 180
      or (p_payload->>'capacity')::integer not between 4 and 100
      or (p_payload->>'minimumPlayers')::integer not between 2 and (p_payload->>'capacity')::integer
      or coalesce((p_payload->>'rated')::boolean,false)
      or (p_payload->>'firstDate')::date < (v_now at time zone (p_payload->>'timeZone'))::date
      or pg_catalog.jsonb_array_length(v_slots) not between 1 and 8
      or exists(select 1 from pg_catalog.jsonb_array_elements(v_slots) slot
        where pg_catalog.jsonb_typeof(slot)<>'object'
          or not pg_catalog.pg_input_is_valid(slot->>'hour','integer')
          or not pg_catalog.pg_input_is_valid(slot->>'minute','integer')
          or slot->>'id'!~'^[a-z0-9]+(?:-[a-z0-9]+)*$'
          or char_length(slot->>'label') not between 3 and 80)
    then raise exception 'CAISSA_ONLINE_OFFICIAL_OPERATOR_INVALID'; end if;
    if exists(select 1 from pg_catalog.jsonb_array_elements(v_slots) slot
        where slot->>'id'!~'^[a-z0-9]+(?:-[a-z0-9]+)*$'
          or char_length(slot->>'label') not between 3 and 80
          or (slot->>'hour')::integer not between 0 and 23
          or (slot->>'minute')::integer not between 0 and 59)
      or exists(select 1 from pg_catalog.jsonb_array_elements(v_slots) slot
        group by slot->>'id' having count(*)>1)
    then raise exception 'CAISSA_ONLINE_OFFICIAL_OPERATOR_INVALID'; end if;
    if p_payload->>'frequencyUnit'='daily' then
      if p_payload ? 'weekdays' then
        if pg_catalog.jsonb_typeof(p_payload->'weekdays')<>'array'
        then raise exception 'CAISSA_ONLINE_OFFICIAL_OPERATOR_INVALID'; end if;
        if pg_catalog.jsonb_array_length(p_payload->'weekdays')<>0
        then raise exception 'CAISSA_ONLINE_OFFICIAL_OPERATOR_INVALID'; end if;
      end if;
    else
      if pg_catalog.jsonb_typeof(p_payload->'weekdays')<>'array'
      then raise exception 'CAISSA_ONLINE_OFFICIAL_OPERATOR_INVALID'; end if;
      if pg_catalog.jsonb_array_length(p_payload->'weekdays') not between 1 and 7
      then raise exception 'CAISSA_ONLINE_OFFICIAL_OPERATOR_INVALID'; end if;
      if exists(select 1 from pg_catalog.jsonb_array_elements(p_payload->'weekdays') value
          where pg_catalog.jsonb_typeof(value)<>'number'
            or not pg_catalog.pg_input_is_valid(value#>>'{}','smallint'))
      then raise exception 'CAISSA_ONLINE_OFFICIAL_OPERATOR_INVALID'; end if;
      if exists(select 1 from pg_catalog.jsonb_array_elements_text(p_payload->'weekdays') value
          where value::smallint not between 0 and 6)
        or exists(select 1 from pg_catalog.jsonb_array_elements_text(p_payload->'weekdays') value
          group by value having count(*)>1)
      then raise exception 'CAISSA_ONLINE_OFFICIAL_OPERATOR_INVALID'; end if;
    end if;
    if coalesce(p_payload->>'endMode','never')='never' then
      if p_payload ? 'endDate' or p_payload ? 'occurrenceCount'
      then raise exception 'CAISSA_ONLINE_OFFICIAL_OPERATOR_INVALID'; end if;
    elsif p_payload->>'endMode'='on_date' then
      if not pg_catalog.pg_input_is_valid(p_payload->>'endDate','date')
        or p_payload ? 'occurrenceCount'
      then raise exception 'CAISSA_ONLINE_OFFICIAL_OPERATOR_INVALID'; end if;
      if (p_payload->>'endDate')::date < (p_payload->>'firstDate')::date
      then raise exception 'CAISSA_ONLINE_OFFICIAL_OPERATOR_INVALID'; end if;
    elsif p_payload->>'endMode'='after_count' then
      if not pg_catalog.pg_input_is_valid(p_payload->>'occurrenceCount','smallint')
        or p_payload ? 'endDate'
      then raise exception 'CAISSA_ONLINE_OFFICIAL_OPERATOR_INVALID'; end if;
      if (p_payload->>'occurrenceCount')::smallint not between 1 and 100
      then raise exception 'CAISSA_ONLINE_OFFICIAL_OPERATOR_INVALID'; end if;
    end if;
    insert into public.caissa_online_tournament_series(
      slug,title,description,timezone,weekday,launch_not_before,registration_lead_days,slots,
      pool,base_ms,increment_ms,duration_minutes,capacity,min_players,rated,late_join,enabled,
      owner_clerk_id,series_kind,frequency_unit,interval_count,weekdays,anchor_date,
      local_start_time,generation_lead_days,end_mode,end_date,end_after_occurrences,
      tournament_template,creation_event_id,next_generation_at)
    values(v_slug,pg_catalog.btrim(p_payload->>'title'),left(coalesce(p_payload->>'description',''),1000),
      p_payload->>'timeZone',extract(dow from (p_payload->>'firstDate')::date)::smallint,
      (p_payload->>'firstDate')::date,(p_payload->>'leadDays')::smallint,v_slots,
      p_payload->>'pool',(p_payload->>'baseMs')::integer,(p_payload->>'incrementMs')::integer,
      (p_payload->>'durationMinutes')::integer,(p_payload->>'capacity')::integer,
      (p_payload->>'minimumPlayers')::smallint,false,coalesce((p_payload->>'lateJoin')::boolean,true),
      coalesce((p_payload->>'enabled')::boolean,false),null,'official',p_payload->>'frequencyUnit',
      (p_payload->>'interval')::smallint,
      case when p_payload->>'frequencyUnit'='weekly'
        then array(select value::smallint from jsonb_array_elements_text(p_payload->'weekdays'))
        else '{}'::smallint[] end,
      (p_payload->>'firstDate')::date,
      make_time((v_slots->0->>'hour')::integer,(v_slots->0->>'minute')::integer,0),
      (p_payload->>'leadDays')::smallint,coalesce(p_payload->>'endMode','never'),
      case when p_payload->>'endMode'='on_date' then (p_payload->>'endDate')::date end,
      case when p_payload->>'endMode'='after_count' then (p_payload->>'occurrenceCount')::smallint end,
      pg_catalog.jsonb_build_object('format','arena','name',pg_catalog.btrim(p_payload->>'title'),
        'pool',p_payload->>'pool','baseMs',(p_payload->>'baseMs')::integer,
        'incrementMs',(p_payload->>'incrementMs')::integer,
        'durationMinutes',(p_payload->>'durationMinutes')::integer,
        'capacity',(p_payload->>'capacity')::integer,
        'minimumPlayers',(p_payload->>'minimumPlayers')::integer,'rated',false,
        'lateJoin',coalesce((p_payload->>'lateJoin')::boolean,true),'official',true),
      p_event_id,case when coalesce((p_payload->>'enabled')::boolean,false) then v_now end)
    returning id into v_id;
  else
    if (p_payload->>'seriesId' is null and v_slug is null)
      or (p_payload->>'seriesId' is not null
        and not pg_catalog.pg_input_is_valid(p_payload->>'seriesId','uuid'))
    then raise exception 'CAISSA_ONLINE_OFFICIAL_OPERATOR_INVALID'; end if;
    select * into v_series from public.caissa_online_tournament_series
      where series_kind='official' and slug<>'saturdays-of-chess-s001'
        and (id=case when p_payload->>'seriesId' is null then null else (p_payload->>'seriesId')::uuid end
          or slug=v_slug) for update;
    if v_series.id is null then raise exception 'CAISSA_ONLINE_OFFICIAL_SERIES_NOT_FOUND'; end if;
    v_id:=v_series.id;
    if p_action='pause' then
      update public.caissa_online_tournament_series set enabled=false,next_generation_at=null,updated_at=v_now where id=v_id;
    elsif p_action='resume' then
      update public.caissa_online_tournament_series set enabled=true,next_generation_at=v_now,updated_at=v_now where id=v_id;
    elsif p_action='skip' then
      if not pg_catalog.pg_input_is_valid(p_payload->>'localDate','date')
        or p_payload->>'slotId' is null
      then raise exception 'CAISSA_ONLINE_OFFICIAL_OPERATOR_INVALID'; end if;
      v_local_date:=(p_payload->>'localDate')::date; v_slot_id:=p_payload->>'slotId';
      if v_local_date<(v_now at time zone v_series.timezone)::date
        or not exists(select 1 from jsonb_array_elements(v_series.slots) slot where slot->>'id'=v_slot_id)
      then raise exception 'CAISSA_ONLINE_OFFICIAL_OPERATOR_INVALID'; end if;
      insert into public.caissa_online_tournament_series_skips(series_id,local_date,slot_id,reason,created_by_clerk_id)
      values(v_id,v_local_date,v_slot_id,left(coalesce(nullif(pg_catalog.btrim(p_payload->>'reason'),''),'Operator skip'),240),v_actor)
      on conflict(series_id,local_date,slot_id) do update
        set reason=excluded.reason,created_by_clerk_id=excluded.created_by_clerk_id,created_at=v_now;
    elsif p_action='unskip' then
      if not pg_catalog.pg_input_is_valid(p_payload->>'localDate','date')
        or p_payload->>'slotId' is null
      then raise exception 'CAISSA_ONLINE_OFFICIAL_OPERATOR_INVALID'; end if;
      delete from public.caissa_online_tournament_series_skips
        where series_id=v_id and local_date=(p_payload->>'localDate')::date and slot_id=p_payload->>'slotId';
    elsif p_action='cancel' then
      if not pg_catalog.pg_input_is_valid(p_payload->>'tournamentId','uuid')
      then raise exception 'CAISSA_ONLINE_OFFICIAL_OPERATOR_INVALID'; end if;
      v_tournament_id:=(p_payload->>'tournamentId')::uuid;
      update public.caissa_online_tournaments
        set status='cancelled',cancelled_at=v_now,version=version+1,updated_at=v_now
        where id=v_tournament_id and series_id=v_id and starts_at>v_now
          and status in('scheduled','registration_open');
      if not found then raise exception 'CAISSA_ONLINE_SERIES_OCCURRENCE_NOT_CANCELLABLE'; end if;
    elsif p_action='update' then
      if not pg_catalog.pg_input_is_valid(p_payload->>'capacity','integer')
        or not pg_catalog.pg_input_is_valid(p_payload->>'minimumPlayers','integer')
        or not pg_catalog.pg_input_is_valid(p_payload->>'durationMinutes','integer')
        or (p_payload ? 'lateJoin' and pg_catalog.jsonb_typeof(p_payload->'lateJoin')<>'boolean')
        or (p_payload ? 'applyFuture' and pg_catalog.jsonb_typeof(p_payload->'applyFuture')<>'boolean')
      then raise exception 'CAISSA_ONLINE_OFFICIAL_OPERATOR_INVALID'; end if;
      if (p_payload->>'capacity')::integer not between 4 and 100
        or (p_payload->>'minimumPlayers')::integer not between 2 and (p_payload->>'capacity')::integer
        or (p_payload->>'durationMinutes')::integer not between 5 and 180
      then raise exception 'CAISSA_ONLINE_OFFICIAL_OPERATOR_INVALID'; end if;
      update public.caissa_online_tournament_series set
        capacity=(p_payload->>'capacity')::integer,
        min_players=(p_payload->>'minimumPlayers')::smallint,
        duration_minutes=(p_payload->>'durationMinutes')::integer,
        late_join=coalesce((p_payload->>'lateJoin')::boolean,late_join),
        tournament_template=tournament_template||pg_catalog.jsonb_build_object(
          'capacity',(p_payload->>'capacity')::integer,
          'minimumPlayers',(p_payload->>'minimumPlayers')::integer,
          'durationMinutes',(p_payload->>'durationMinutes')::integer,
          'lateJoin',coalesce((p_payload->>'lateJoin')::boolean,late_join)),updated_at=v_now
        where id=v_id;
      if coalesce((p_payload->>'applyFuture')::boolean,false) then
        update public.caissa_online_tournaments
        set capacity=(p_payload->>'capacity')::integer,
          min_players=(p_payload->>'minimumPlayers')::smallint,
          duration_minutes=(p_payload->>'durationMinutes')::integer,
          ends_at=starts_at+(p_payload->>'durationMinutes')::integer*interval '1 minute',
          late_join=coalesce((p_payload->>'lateJoin')::boolean,late_join),
          version=version+1,updated_at=v_now
        where series_id=v_id and starts_at>v_now and status in('scheduled','registration_open');
      end if;
    elsif p_action<>'inspect' then
      raise exception 'CAISSA_ONLINE_OFFICIAL_OPERATOR_INVALID';
    end if;
  end if;
  insert into public.caissa_online_series_operator_audit(event_id,actor,action,series_id,payload)
    values(p_event_id,v_actor,p_action,v_id,p_payload-'actor');
  select * into v_series from public.caissa_online_tournament_series where id=v_id;
  return pg_catalog.jsonb_build_object('series',to_jsonb(v_series),'idempotent',false);
end;
$$;

-- Keep the certified Saturdays of Chess generator isolated from new operator
-- series. Its occurrence-key algorithm remains byte-for-byte compatible.
create or replace function caissa_online_private.weekly_generate(
  p_now timestamptz,p_weeks integer default 4)
returns integer language plpgsql security invoker set search_path=''
as $$
declare v_series public.caissa_online_tournament_series%rowtype; v_first date; v_date date; v_slot jsonb;
  v_start timestamptz; v_end timestamptz; v_open timestamptz; v_key text; v_count integer:=0; v_week integer;
begin
  for v_series in select * from public.caissa_online_tournament_series
    where enabled and series_kind='official' and slug='saturdays-of-chess-s001'
    order by slug for update loop
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

create or replace function caissa_online_private.official_candidate_dates(
  p_series_id uuid,p_from date,p_to date)
returns table(local_date date,slot_id text,label text,starts_at timestamptz,
  occurrence_key text,ordinal integer)
language sql stable security invoker set search_path=''
as $$
  with series as (
    select s.*,(s.anchor_date-extract(dow from s.anchor_date)::integer)::date anchor_week_start
    from public.caissa_online_tournament_series s
    where s.id=p_series_id and s.series_kind='official' and s.slug<>'saturdays-of-chess-s001'
  ), eligible_dates as (
    select s.*,day::date local_date
    from series s
    cross join lateral generate_series(s.anchor_date::timestamp,
      least(p_to,coalesce(s.end_date,p_to))::timestamp,interval '1 day') day
    where (s.frequency_unit='daily' and ((day::date-s.anchor_date)%s.interval_count)=0)
      or (s.frequency_unit='weekly'
        and extract(dow from day)::smallint=any(s.weekdays)
        and ((day::date-s.anchor_week_start)/7)%s.interval_count=0)
  ), expanded as (
    select d.local_date,slot->>'id' slot_id,slot->>'label' label,
      (d.local_date+make_interval(hours=>(slot->>'hour')::integer,
        mins=>(slot->>'minute')::integer)) at time zone d.timezone starts_at,
      d.slug||':'||d.local_date::text||':'||(slot->>'id') occurrence_key,
      d.end_mode,d.end_after_occurrences,d.anchor_date
    from eligible_dates d cross join lateral jsonb_array_elements(d.slots) slot
  ), numbered as (
    select e.*,row_number() over(order by e.local_date,e.slot_id)::integer occurrence_ordinal
    from expanded e
  )
  select n.local_date,n.slot_id,n.label,n.starts_at,n.occurrence_key,n.occurrence_ordinal
  from numbered n
  where n.local_date>=greatest(p_from,n.anchor_date)
    and (n.end_mode<>'after_count' or n.occurrence_ordinal<=n.end_after_occurrences)
  order by n.starts_at,n.slot_id;
$$;

create or replace function caissa_online_private.official_flexible_generate(
  p_now timestamptz,p_limit integer default 100)
returns integer language plpgsql security invoker set search_path=''
as $$
declare v_series public.caissa_online_tournament_series%rowtype; v_candidate record;
  v_count integer:=0; v_next timestamptz; v_end timestamptz; v_open timestamptz;
begin
  for v_series in select * from public.caissa_online_tournament_series
    where series_kind='official' and slug<>'saturdays-of-chess-s001'
      and enabled and next_generation_at<=p_now
    order by id for update skip locked loop
    for v_candidate in select * from caissa_online_private.official_candidate_dates(
      v_series.id,(p_now at time zone v_series.timezone)::date,
      (p_now at time zone v_series.timezone)::date+v_series.generation_lead_days+1)
      order by starts_at loop
      exit when v_count>=least(greatest(p_limit,1),500);
      if v_candidate.starts_at<=p_now
        or v_candidate.starts_at-v_series.generation_lead_days*interval '1 day'>p_now
        or exists(select 1 from public.caissa_online_tournament_series_skips skip
          where skip.series_id=v_series.id and skip.local_date=v_candidate.local_date
            and skip.slot_id=v_candidate.slot_id)
      then continue; end if;
      v_end:=v_candidate.starts_at+v_series.duration_minutes*interval '1 minute';
      v_open:=v_candidate.starts_at-v_series.generation_lead_days*interval '1 day';
      insert into public.caissa_online_tournaments(
        name,source,format,status,pool,base_ms,increment_ms,rated,visibility,
        starts_at,ends_at,registration_opens_at,registration_closes_at,duration_minutes,
        late_join,capacity,min_players,configuration,created_by_clerk_id,play_category,
        series_id,series_occurrence_key)
      values(v_candidate.label||' · '||v_candidate.local_date::text,'official','arena',
        case when v_open<=p_now then 'registration_open' else 'scheduled' end,
        v_series.pool,v_series.base_ms,v_series.increment_ms,false,'private',
        v_candidate.starts_at,v_end,v_open,
        case when v_series.late_join then v_end else v_candidate.starts_at end,
        v_series.duration_minutes,v_series.late_join,v_series.capacity,v_series.min_players,
        jsonb_build_object('betaSeason','S001','publicDirectory',false,
          'officialSeries',v_series.slug,'timeZone',v_series.timezone,
          'slotId',v_candidate.slot_id,'featured',true,'chat',false,
          'finishingPolicy','finish_active_games'),
        'system:'||v_series.slug,'live',v_series.id,v_candidate.occurrence_key)
      on conflict(series_occurrence_key) where series_occurrence_key is not null do nothing;
      if found then
        v_count:=v_count+1;
        update public.caissa_online_tournament_series set generated_count=generated_count+1,
          last_occurrence_at=v_candidate.starts_at,last_generated_at=p_now,updated_at=p_now
          where id=v_series.id;
      end if;
    end loop;
    select min(candidate.starts_at-v_series.generation_lead_days*interval '1 day') into v_next
      from caissa_online_private.official_candidate_dates(v_series.id,
        (p_now at time zone v_series.timezone)::date,
        (p_now at time zone v_series.timezone)::date+370) candidate
      where candidate.starts_at>p_now
        and not exists(select 1 from public.caissa_online_tournament_series_skips skip
          where skip.series_id=v_series.id and skip.local_date=candidate.local_date
            and skip.slot_id=candidate.slot_id)
        and not exists(select 1 from public.caissa_online_tournaments tournament
          where tournament.series_occurrence_key=candidate.occurrence_key);
    update public.caissa_online_tournament_series set last_generated_at=p_now,
      next_generation_at=case when v_next is null then null else greatest(p_now,v_next) end,
      updated_at=p_now where id=v_series.id;
  end loop;
  return v_count;
end;
$$;

create or replace function public.caissa_online_tournament_scheduler_tick(
  p_now timestamptz default clock_timestamp())
returns jsonb language plpgsql security invoker set search_path=''
as $$
declare v_run uuid:=gen_random_uuid(); v_official integer:=0; v_operator integer:=0;
  v_recurring integer:=0; v_transitioned integer:=0; v_t record;
begin
  perform pg_advisory_xact_lock(hashtextextended('caissa-tournament-scheduler-s001',701401));
  insert into public.caissa_online_scheduler_ledger(run_id,scheduler,status,started_at)
    values(v_run,'combined','running',p_now);
  v_official:=caissa_online_private.weekly_generate(p_now,4);
  v_operator:=caissa_online_private.official_flexible_generate(p_now,100);
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
    elsif v_t.status='finishing' then perform caissa_online_private.arena_reconcile(v_t.id); end if;
  end loop;
  v_transitioned:=v_transitioned+caissa_online_private.daily_process(p_now,100);
  update public.caissa_online_scheduler_ledger set status='completed',completed_at=clock_timestamp(),
    generated_count=v_official+v_operator+v_recurring,transitioned_count=v_transitioned,
    metadata=jsonb_build_object('asOf',p_now,'officialGenerated',v_official,
      'operatorOfficialGenerated',v_operator,'recurringGenerated',v_recurring) where run_id=v_run;
  return jsonb_build_object('runId',v_run,'generated',v_official+v_operator+v_recurring,
    'officialGenerated',v_official,'operatorOfficialGenerated',v_operator,
    'recurringGenerated',v_recurring,'transitioned',v_transitioned);
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

revoke all on function public.caissa_online_arena_next(text,uuid,text) from public,anon,authenticated;
revoke all on function caissa_online_private.normalize_arena_rest_on_terminal_status() from public,anon,authenticated;
revoke all on function caissa_online_private.official_candidate_dates(uuid,date,date) from public,anon,authenticated;
revoke all on function caissa_online_private.official_flexible_generate(timestamptz,integer) from public,anon,authenticated;
revoke all on function public.caissa_online_tournament_identity_projection(uuid[]) from public,anon,authenticated;
revoke all on function public.caissa_online_official_series_operator(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.caissa_online_arena_next(text,uuid,text) to service_role;
grant execute on function caissa_online_private.normalize_arena_rest_on_terminal_status() to service_role;
grant execute on function caissa_online_private.official_candidate_dates(uuid,date,date) to service_role;
grant execute on function caissa_online_private.official_flexible_generate(timestamptz,integer) to service_role;
grant execute on function public.caissa_online_tournament_identity_projection(uuid[]) to service_role;
grant execute on function public.caissa_online_official_series_operator(text,text,jsonb) to service_role;

alter function public.caissa_online_arena_next(text,uuid,text) set lock_timeout='2s';
alter function public.caissa_online_official_series_operator(text,text,jsonb) set lock_timeout='2s';

comment on function public.caissa_online_arena_next(text,uuid,text) is
  'Idempotently releases one authenticated Arena participant from durable rest into server matchmaking.';
comment on function public.caissa_online_official_series_operator(text,text,jsonb) is
  'Service-role-only operator workflow. It is intentionally absent from the browser/API protocol.';

commit;
