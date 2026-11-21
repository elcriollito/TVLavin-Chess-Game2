-- CAISSA Tournaments Expansion S001.
-- Forward-only preparation for 100-player Arena, gated Rated Arena, Daily
-- correspondence, and the disabled-by-default Saturdays of Chess series.
-- Applying this migration does not enable any browser or series feature flag.
begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

alter table public.caissa_online_tournaments
  drop constraint if exists caissa_online_arena_s001_capacity_check;
alter table public.caissa_online_tournaments
  add constraint caissa_online_arena_s001_capacity_check
  check ((configuration->>'betaSeason') is distinct from 'S001' or capacity between 4 and 100)
  not valid;
alter table public.caissa_online_tournaments
  validate constraint caissa_online_arena_s001_capacity_check;

alter table public.caissa_online_tournaments
  drop constraint if exists caissa_online_tournaments_scoring_contract_check;
alter table public.caissa_online_tournaments
  add constraint caissa_online_tournaments_scoring_contract_check
  check (scoring_contract in ('arena-s001-2-1-0', 'daily-rr-1-0.5-0-v1'));

alter table public.caissa_online_tournaments
  add column if not exists play_category text not null default 'live',
  add column if not exists days_per_move smallint,
  add column if not exists group_size smallint,
  add column if not exists qualifiers_per_group smallint,
  add column if not exists series_occurrence_key text;

alter table public.caissa_online_tournaments
  add constraint caissa_online_tournaments_play_category_check
    check (play_category in ('live', 'daily')),
  add constraint caissa_online_tournaments_daily_configuration_check
    check (
      (play_category = 'live' and days_per_move is null and group_size is null and qualifiers_per_group is null)
      or (play_category = 'daily' and pool = 'daily' and format = 'round-robin'
        and days_per_move in (1,3,5,7) and group_size between 3 and 6
        and qualifiers_per_group between 1 and group_size - 1 and late_join = false)
    );

alter table public.caissa_online_games
  add column if not exists play_category text not null default 'live',
  add column if not exists days_per_move smallint,
  add column if not exists move_deadline_at timestamptz,
  add column if not exists deadline_processed_at timestamptz;

alter table public.caissa_online_games
  add constraint caissa_online_games_play_category_check
    check (play_category in ('live', 'daily')),
  add constraint caissa_online_games_daily_clock_check
    check (
      (play_category = 'live' and days_per_move is null and move_deadline_at is null)
      or (play_category = 'daily' and pool = 'daily' and days_per_move in (1,3,5,7)
        and (status <> 'active' or move_deadline_at is not null))
    );

create index if not exists caissa_online_daily_deadline_idx
  on public.caissa_online_games(move_deadline_at, id)
  where play_category = 'daily' and status = 'active';

create table public.caissa_online_daily_groups (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.caissa_online_tournaments(id) on delete cascade,
  round_number smallint not null check (round_number between 1 and 64),
  group_number smallint not null check (group_number between 1 and 256),
  qualifier_count smallint not null check (qualifier_count between 1 and 5),
  state text not null default 'active' check (state in ('active','completed')),
  started_at timestamptz not null default clock_timestamp(),
  completed_at timestamptz,
  unique(tournament_id, round_number, group_number)
);

create table public.caissa_online_daily_group_members (
  group_id uuid not null references public.caissa_online_daily_groups(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  seed integer not null check (seed > 0),
  score numeric(8,2) not null default 0,
  tie_break numeric(14,4) not null default 0,
  games_played integer not null default 0 check (games_played >= 0),
  wins integer not null default 0 check (wins >= 0),
  draws integer not null default 0 check (draws >= 0),
  losses integer not null default 0 check (losses >= 0),
  rank integer,
  qualified boolean not null default false,
  primary key(group_id, user_id),
  check (games_played = wins + draws + losses)
);

create table public.caissa_online_daily_events (
  id bigint generated always as identity primary key,
  tournament_id uuid not null references public.caissa_online_tournaments(id) on delete cascade,
  event_id text not null check (char_length(event_id) between 12 and 120),
  event_type text not null check (char_length(event_type) between 3 and 80),
  actor_user_id uuid references public.users(id) on delete set null,
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  created_at timestamptz not null default clock_timestamp(),
  unique(tournament_id, event_id)
);

alter table public.caissa_online_tournament_games
  add column if not exists daily_group_id uuid references public.caissa_online_daily_groups(id) on delete set null,
  add column if not exists leg smallint;
alter table public.caissa_online_tournament_games
  add constraint caissa_online_tournament_games_daily_leg_check
    check (leg is null or leg in (1,2));

create index if not exists caissa_online_daily_groups_state_idx
  on public.caissa_online_daily_groups(tournament_id, round_number, state);
create index if not exists caissa_online_daily_members_rank_idx
  on public.caissa_online_daily_group_members(group_id, rank, user_id);
create index if not exists caissa_online_daily_events_tournament_idx
  on public.caissa_online_daily_events(tournament_id, created_at desc);

alter table public.caissa_online_daily_groups enable row level security;
alter table public.caissa_online_daily_group_members enable row level security;
alter table public.caissa_online_daily_events enable row level security;
revoke all on public.caissa_online_daily_groups from public, anon, authenticated;
revoke all on public.caissa_online_daily_group_members from public, anon, authenticated;
revoke all on public.caissa_online_daily_events from public, anon, authenticated;
grant select, insert, update, delete on public.caissa_online_daily_groups to service_role;
grant select, insert, update, delete on public.caissa_online_daily_group_members to service_role;
grant select, insert, update, delete on public.caissa_online_daily_events to service_role;
grant usage, select on sequence public.caissa_online_daily_events_id_seq to service_role;

create table public.caissa_online_tournament_series (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  title text not null check (char_length(title) between 3 and 120),
  description text not null default '' check (char_length(description) <= 1000),
  timezone text not null,
  weekday smallint not null check (weekday between 0 and 6),
  launch_not_before date not null,
  registration_lead_days smallint not null default 7 check (registration_lead_days between 1 and 30),
  slots jsonb not null check (jsonb_typeof(slots) = 'array' and jsonb_array_length(slots) between 1 and 8),
  pool text not null check (pool in ('bullet','blitz','rapid')),
  base_ms integer not null check (base_ms between 10000 and 86400000),
  increment_ms integer not null check (increment_ms between 0 and 600000),
  duration_minutes integer not null check (duration_minutes between 5 and 180),
  capacity integer not null check (capacity between 4 and 100),
  min_players smallint not null check (min_players between 2 and 100),
  rated boolean not null default false,
  late_join boolean not null default true,
  enabled boolean not null default false,
  next_generation_at timestamptz,
  last_generated_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);

create table public.caissa_online_tournament_series_skips (
  series_id uuid not null references public.caissa_online_tournament_series(id) on delete cascade,
  local_date date not null,
  slot_id text not null,
  reason text not null check (char_length(reason) between 3 and 240),
  created_by_clerk_id text not null,
  created_at timestamptz not null default clock_timestamp(),
  primary key(series_id, local_date, slot_id)
);

create table public.caissa_online_scheduler_ledger (
  id bigint generated always as identity primary key,
  run_id uuid not null unique,
  scheduler text not null check (scheduler in ('weekly-arena','daily-deadlines','combined')),
  status text not null check (status in ('running','completed','failed')),
  started_at timestamptz not null,
  completed_at timestamptz,
  generated_count integer not null default 0,
  transitioned_count integer not null default 0,
  error_code text,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object')
);

alter table public.caissa_online_tournaments
  add column if not exists series_id uuid references public.caissa_online_tournament_series(id) on delete set null;
create unique index if not exists caissa_online_tournaments_occurrence_uq
  on public.caissa_online_tournaments(series_occurrence_key)
  where series_occurrence_key is not null;

alter table public.caissa_online_tournament_series enable row level security;
alter table public.caissa_online_tournament_series_skips enable row level security;
alter table public.caissa_online_scheduler_ledger enable row level security;
revoke all on public.caissa_online_tournament_series from public, anon, authenticated;
revoke all on public.caissa_online_tournament_series_skips from public, anon, authenticated;
revoke all on public.caissa_online_scheduler_ledger from public, anon, authenticated;
grant select, insert, update, delete on public.caissa_online_tournament_series to service_role;
grant select, insert, update, delete on public.caissa_online_tournament_series_skips to service_role;
grant select, insert, update on public.caissa_online_scheduler_ledger to service_role;
grant usage, select on sequence public.caissa_online_scheduler_ledger_id_seq to service_role;

insert into public.caissa_online_tournament_series(
  slug,title,description,timezone,weekday,launch_not_before,registration_lead_days,slots,
  pool,base_ms,increment_ms,duration_minutes,capacity,min_players,rated,late_join,enabled
) values (
  'saturdays-of-chess-s001','SATURDAYS OF CHESS — CAISSA WEEKLY ARENAS',
  'Two official one-hour CAISSA Arena competitions every Saturday.',
  'America/New_York',6,'2026-11-28',7,
  '[{"id":"morning","label":"Morning Arena","hour":11,"minute":0},{"id":"evening","label":"Evening Arena","hour":19,"minute":0}]'::jsonb,
  'blitz',300000,0,60,100,4,false,true,false
) on conflict (slug) do nothing;

create or replace function caissa_online_private.enforce_tournament_game_contract()
returns trigger
language plpgsql security invoker
set search_path = ''
as $$
declare v_tournament public.caissa_online_tournaments%rowtype;
begin
  if new.tournament_id is null then return new; end if;
  select * into v_tournament from public.caissa_online_tournaments where id = new.tournament_id;
  if v_tournament.id is null then raise exception 'CAISSA_ONLINE_TOURNAMENT_NOT_FOUND'; end if;
  new.rated := v_tournament.rated;
  new.pool := v_tournament.pool;
  new.play_category := v_tournament.play_category;
  if v_tournament.play_category = 'daily' then
    new.days_per_move := v_tournament.days_per_move;
    new.clock_started_at := null;
    new.white_time_ms := 0;
    new.black_time_ms := 0;
  end if;
  return new;
end;
$$;

drop trigger if exists caissa_online_tournament_game_contract on public.caissa_online_games;
create trigger caissa_online_tournament_game_contract
before insert or update of tournament_id on public.caissa_online_games
for each row execute function caissa_online_private.enforce_tournament_game_contract();

revoke all on function caissa_online_private.enforce_tournament_game_contract()
  from public, anon, authenticated;
grant execute on function caissa_online_private.enforce_tournament_game_contract() to service_role;

-- Preserve the existing Arena reconciliation contract while enriching its
-- private payload with type and official-series presentation metadata.
create or replace function public.caissa_online_arena_sync(p_clerk_id text,p_tournament_id uuid)
returns jsonb language plpgsql security invoker set search_path=''
as $$
declare v_user_id uuid; v_id uuid; v_payload jsonb; v_directory jsonb; v_current jsonb;
begin
  select id into v_user_id from public.users where clerk_id=p_clerk_id;
  if v_user_id is null then raise exception 'CAISSA_ONLINE_IDENTITY_NOT_FOUND'; end if;
  if p_tournament_id is not null and not exists(select 1 from public.caissa_online_tournaments
      where id=p_tournament_id and configuration->>'betaSeason'='S001')
    then raise exception 'CAISSA_ONLINE_ARENA_NOT_FOUND'; end if;
  update public.caissa_online_tournament_participants p set state='waiting',waiting_since=clock_timestamp(),
    disconnected_at=null,updated_at=clock_timestamp()
    from public.caissa_online_tournaments t where p.tournament_id=t.id and p.user_id=v_user_id
      and p.state='disconnected' and t.status='active' and t.ends_at>clock_timestamp();
  for v_id in select id from public.caissa_online_tournaments where configuration->>'betaSeason'='S001'
    and play_category='live' and status in('scheduled','registration_open','active','finishing') order by starts_at,id
  loop perform caissa_online_private.arena_reconcile(v_id); end loop;
  v_payload:=caissa_online_private.arena_payload(p_clerk_id,p_tournament_id);
  select coalesce(jsonb_agg(e.value||jsonb_build_object(
      'playCategory',t.play_category,'seriesSlug',s.slug,'featured',coalesce(t.configuration->>'featured'='true',false))
      order by e.ordinality),'[]'::jsonb) into v_directory
    from jsonb_array_elements(coalesce(v_payload->'tournaments','[]'::jsonb)) with ordinality e(value,ordinality)
    join public.caissa_online_tournaments t on t.id=(e.value->>'id')::uuid
    left join public.caissa_online_tournament_series s on s.id=t.series_id;
  v_current:=v_payload->'current';
  if v_current is not null and jsonb_typeof(v_current)='object' then
    select v_current||jsonb_build_object(
      'playCategory',t.play_category,'seriesSlug',s.slug,'featured',coalesce(t.configuration->>'featured'='true',false))
      into v_current from public.caissa_online_tournaments t
      left join public.caissa_online_tournament_series s on s.id=t.series_id
      where t.id=(v_current->>'id')::uuid;
  end if;
  return jsonb_build_object('tournaments',v_directory,'current',v_current);
end;
$$;

revoke all on function public.caissa_online_arena_sync(text,uuid) from public,anon,authenticated;
grant execute on function public.caissa_online_arena_sync(text,uuid) to service_role;

-- Deterministic rating-row locking prevents reversed-color games from
-- deadlocking when correspondence results settle concurrently.
create or replace function caissa_online_private.apply_rating(p_game_id uuid)
returns void
language plpgsql security invoker
set search_path = ''
as $$
declare
  v_game public.caissa_online_games%rowtype;
  v_white public.caissa_online_ratings%rowtype;
  v_black public.caissa_online_ratings%rowtype;
  v_white_score numeric;
  v_black_score numeric;
  v_white_delta integer;
  v_black_delta integer;
begin
  select * into v_game from public.caissa_online_games where id = p_game_id for update;
  if v_game.rating_processed_at is not null or v_game.result is null
    or v_game.status <> 'completed' or v_game.termination = 'aborted' then return; end if;
  if not v_game.rated then
    update public.caissa_online_games set rating_processed_at = clock_timestamp()
      where id = p_game_id and rating_processed_at is null;
    return;
  end if;
  insert into public.caissa_online_ratings(user_id,pool)
    values(v_game.white_user_id,v_game.pool),(v_game.black_user_id,v_game.pool)
    on conflict(user_id,pool) do nothing;
  perform 1 from public.caissa_online_ratings
    where pool = v_game.pool and user_id in (v_game.white_user_id,v_game.black_user_id)
    order by user_id for update;
  select * into v_white from public.caissa_online_ratings
    where user_id=v_game.white_user_id and pool=v_game.pool;
  select * into v_black from public.caissa_online_ratings
    where user_id=v_game.black_user_id and pool=v_game.pool;
  v_white_score := case v_game.result when '1-0' then 1 when '0-1' then 0 else 0.5 end;
  v_black_score := 1-v_white_score;
  v_white_delta := caissa_online_private.rating_delta(v_white.rating,v_black.rating,v_white.games,v_white_score);
  v_black_delta := caissa_online_private.rating_delta(v_black.rating,v_white.rating,v_black.games,v_black_score);
  update public.caissa_online_ratings set
    rating=greatest(100,least(4000,rating+v_white_delta)),games=games+1,
    wins=wins+(v_white_score=1)::integer,draws=draws+(v_white_score=0.5)::integer,
    losses=losses+(v_white_score=0)::integer,updated_at=clock_timestamp()
    where user_id=v_game.white_user_id and pool=v_game.pool;
  update public.caissa_online_ratings set
    rating=greatest(100,least(4000,rating+v_black_delta)),games=games+1,
    wins=wins+(v_black_score=1)::integer,draws=draws+(v_black_score=0.5)::integer,
    losses=losses+(v_black_score=0)::integer,updated_at=clock_timestamp()
    where user_id=v_game.black_user_id and pool=v_game.pool;
  update public.caissa_online_games set
    white_rating_before=v_white.rating,
    white_rating_after=greatest(100,least(4000,v_white.rating+v_white_delta)),
    white_rating_delta=greatest(100,least(4000,v_white.rating+v_white_delta))-v_white.rating,
    black_rating_before=v_black.rating,
    black_rating_after=greatest(100,least(4000,v_black.rating+v_black_delta)),
    black_rating_delta=greatest(100,least(4000,v_black.rating+v_black_delta))-v_black.rating,
    rating_processed_at=clock_timestamp()
    where id=p_game_id and rating_processed_at is null;
end;
$$;

create or replace function public.caissa_online_arena_create(
  p_clerk_id text,p_event_id text,p_name text,p_starts_at timestamptz,
  p_duration_minutes integer,p_pool text,p_base_ms integer,p_increment_ms integer,
  p_capacity integer,p_late_join boolean,p_rated boolean
) returns jsonb
language plpgsql security invoker
set search_path = ''
as $$
declare
  v_user_id uuid; v_tournament_id uuid; v_existing uuid;
  v_now timestamptz:=clock_timestamp(); v_registration_opens_at timestamptz;
begin
  select id into v_user_id from public.users where clerk_id=p_clerk_id and role<>'online_guest';
  if v_user_id is null then raise exception 'CAISSA_ONLINE_IDENTITY_NOT_FOUND'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_event_id,701201));
  select id into v_existing from public.caissa_online_tournaments where creation_event_id=p_event_id;
  if v_existing is not null then return public.caissa_online_arena_sync(p_clerk_id,v_existing); end if;
  if p_name is null or char_length(p_name) not between 3 and 80
    or p_duration_minutes not between 5 and 180 or p_capacity not between 4 and 100
    or p_late_join is null or p_rated is null or p_pool not in ('bullet','blitz','rapid')
    or (p_base_ms,p_increment_ms) not in ((60000,0),(60000,1000),(180000,0),(180000,2000),(300000,0),(300000,5000),(600000,0),(600000,5000))
    or p_starts_at<v_now-interval '30 seconds' or p_starts_at>v_now+interval '31 days'
  then raise exception 'CAISSA_ONLINE_ARENA_INVALID'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text,701202));
  if (select count(*) from public.caissa_online_tournaments t where t.owner_user_id=v_user_id
      and t.configuration->>'betaSeason'='S001' and t.status in ('scheduled','registration_open','active','finishing'))>=3
  then raise exception 'CAISSA_ONLINE_ARENA_CREATION_LIMIT'; end if;
  if exists(select 1 from public.caissa_online_tournaments t where t.owner_user_id=v_user_id
      and t.configuration->>'betaSeason'='S001' and t.created_at>v_now-interval '60 seconds')
  then raise exception 'CAISSA_ONLINE_ARENA_CREATION_COOLDOWN'; end if;
  if exists(select 1 from public.caissa_online_tournaments t where t.owner_user_id=v_user_id
      and t.configuration->>'betaSeason'='S001' and t.status in ('scheduled','registration_open','active','finishing')
      and tstzrange(t.starts_at,t.ends_at,'[)')&&tstzrange(p_starts_at,p_starts_at+p_duration_minutes*interval '1 minute','[)'))
  then raise exception 'CAISSA_ONLINE_ARENA_CREATION_CONFLICT'; end if;
  v_registration_opens_at:=case when p_starts_at>v_now+interval '24 hours' then p_starts_at-interval '24 hours' else v_now end;
  insert into public.caissa_online_tournaments(
    owner_user_id,name,source,format,status,pool,base_ms,increment_ms,rated,visibility,
    starts_at,ends_at,registration_opens_at,registration_closes_at,duration_minutes,
    late_join,capacity,min_players,configuration,creation_event_id,created_by_clerk_id,play_category
  ) values(
    v_user_id,p_name,'community','arena',case when v_registration_opens_at<=v_now then 'registration_open' else 'scheduled' end,
    p_pool,p_base_ms,p_increment_ms,p_rated,'private',p_starts_at,p_starts_at+p_duration_minutes*interval '1 minute',
    v_registration_opens_at,case when p_late_join then p_starts_at+p_duration_minutes*interval '1 minute' else p_starts_at end,
    p_duration_minutes,p_late_join,p_capacity,4,
    jsonb_build_object('betaSeason','S001','publicDirectory',false,'userCreated',true,'chat',false,
      'finishingPolicy','finish_active_games','fairPlay',jsonb_build_array('No engine assistance','One human per account','Server results are final'),
      'rules',jsonb_build_array('Standard chess','Win 2 - Draw 1 - Loss 0','Server-authoritative clocks','Active games finish after Arena time expires')),
    p_event_id,p_clerk_id,'live'
  ) returning id into v_tournament_id;
  insert into public.caissa_online_arena_events(tournament_id,event_id,event_type,actor_user_id,payload)
    values(v_tournament_id,p_event_id,'tournament.created',v_user_id,
      jsonb_build_object('startsAt',p_starts_at,'durationMinutes',p_duration_minutes,'capacity',p_capacity,'lateJoin',p_late_join,'rated',p_rated));
  return public.caissa_online_arena_sync(p_clerk_id,v_tournament_id);
end;
$$;

revoke all on function public.caissa_online_arena_create(text,text,text,timestamptz,integer,text,integer,integer,integer,boolean,boolean)
  from public,anon,authenticated;
grant execute on function public.caissa_online_arena_create(text,text,text,timestamptz,integer,text,integer,integer,integer,boolean,boolean)
  to service_role;

create or replace function caissa_online_private.daily_payload(p_clerk_id text,p_tournament_id uuid default null,p_game_id uuid default null)
returns jsonb
language plpgsql stable security invoker
set search_path = ''
as $$
declare v_user_id uuid; v_current uuid;
begin
  select id into v_user_id from public.users where clerk_id=p_clerk_id;
  select coalesce(p_tournament_id,
    (select t.id from public.caissa_online_tournaments t
      join public.caissa_online_tournament_participants p on p.tournament_id=t.id
      where p.user_id=v_user_id and p.state<>'withdrawn' and t.play_category='daily'
      order by (t.status='active') desc,t.starts_at limit 1)) into v_current;
  return jsonb_build_object(
    'tournaments',coalesce((select jsonb_agg(jsonb_build_object(
      'id',t.id,'name',t.name,'status',t.status,'rated',t.rated,'startsAt',t.starts_at,
      'registrationClosesAt',t.registration_closes_at,'daysPerMove',t.days_per_move,
      'groupSize',t.group_size,'capacity',t.capacity,'playCategory','daily',
      'participantCount',(select count(*) from public.caissa_online_tournament_participants p where p.tournament_id=t.id and p.state<>'withdrawn'),
      'myState',(select p.state from public.caissa_online_tournament_participants p where p.tournament_id=t.id and p.user_id=v_user_id)
    ) order by t.starts_at) from public.caissa_online_tournaments t where t.play_category='daily' and t.visibility='private'),'[]'::jsonb),
    'current',(select jsonb_build_object('id',t.id,'name',t.name,'status',t.status,'rated',t.rated,
      'startsAt',t.starts_at,'registrationClosesAt',t.registration_closes_at,'daysPerMove',t.days_per_move,
      'groupSize',t.group_size,'capacity',t.capacity,'playCategory','daily','scoringContract',t.scoring_contract,
      'participantCount',(select count(*) from public.caissa_online_tournament_participants p where p.tournament_id=t.id and p.state<>'withdrawn'),
      'myState',(select p.state from public.caissa_online_tournament_participants p where p.tournament_id=t.id and p.user_id=v_user_id),
      'standings',coalesce((select jsonb_agg(jsonb_build_object('userId',m.user_id,'clerkId',p.clerk_id,
        'displayName',p.display_name,'rank',m.rank,'points',m.score,'score',m.score,
        'tieBreak',m.tie_break,'wins',m.wins,'draws',m.draws,'losses',m.losses,'qualified',m.qualified,
        'isCurrentPlayer',m.user_id=v_user_id)
        order by g.round_number desc,m.rank nulls last,m.seed) from public.caissa_online_daily_groups g
        join public.caissa_online_daily_group_members m on m.group_id=g.id
        join public.caissa_online_tournament_participants p on p.tournament_id=t.id and p.user_id=m.user_id
        where g.tournament_id=t.id),'[]'::jsonb))
      from public.caissa_online_tournaments t where t.id=v_current and t.play_category='daily'),
    'games',coalesce((select jsonb_agg(to_jsonb(g)||jsonb_build_object('roundNumber',l.round,'boardNumber',l.board_number,'leg',l.leg)
      order by (g.turn=case when g.white_user_id=v_user_id then 'white' else 'black' end) desc,g.move_deadline_at)
      from public.caissa_online_games g join public.caissa_online_tournament_games l on l.game_id=g.id
      where g.tournament_id=v_current and g.play_category='daily'
        and v_user_id in (g.white_user_id,g.black_user_id) and g.status='active'),'[]'::jsonb),
    'game',(select to_jsonb(g)||jsonb_build_object('roundNumber',l.round,'boardNumber',l.board_number,'leg',l.leg)
      from public.caissa_online_games g join public.caissa_online_tournament_games l on l.game_id=g.id
      where g.id=p_game_id and g.tournament_id=v_current and v_user_id in(g.white_user_id,g.black_user_id)),
    'recentGames',coalesce((select jsonb_agg(row_data order by completed_at desc) from (
      select to_jsonb(g)||jsonb_build_object('roundNumber',l.round,'boardNumber',l.board_number,'leg',l.leg) row_data,g.completed_at
      from public.caissa_online_games g join public.caissa_online_tournament_games l on l.game_id=g.id
      where g.tournament_id=v_current and g.play_category='daily' and v_user_id in(g.white_user_id,g.black_user_id)
        and g.status='completed' order by g.completed_at desc limit 20) recent),'[]'::jsonb)
  );
end;
$$;

create or replace function public.caissa_online_daily_sync(p_clerk_id text,p_tournament_id uuid default null,p_game_id uuid default null)
returns jsonb language sql stable security invoker set search_path=''
as $$ select caissa_online_private.daily_payload(p_clerk_id,p_tournament_id,p_game_id) $$;

create or replace function public.caissa_online_daily_create(
  p_clerk_id text,p_event_id text,p_name text,p_starts_at timestamptz,p_registration_closes_at timestamptz,
  p_days_per_move integer,p_group_size integer,p_qualifiers_per_group integer,p_capacity integer,p_rated boolean
) returns jsonb
language plpgsql security invoker set search_path=''
as $$
declare v_user_id uuid; v_id uuid; v_now timestamptz:=clock_timestamp();
begin
  select id into v_user_id from public.users where clerk_id=p_clerk_id and role<>'online_guest';
  if v_user_id is null then raise exception 'CAISSA_ONLINE_IDENTITY_NOT_FOUND'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_event_id,701301));
  select id into v_id from public.caissa_online_tournaments where creation_event_id=p_event_id;
  if v_id is not null then return caissa_online_private.daily_payload(p_clerk_id,v_id,null); end if;
  if p_name is null or char_length(p_name) not between 3 and 80 or p_days_per_move not in(1,3,5,7)
    or p_group_size not between 3 and 6 or p_qualifiers_per_group not between 1 and p_group_size-1
    or p_capacity not between 4 and 100 or p_rated is null or p_starts_at<=v_now+interval '1 minute'
    or p_starts_at>v_now+interval '366 days' or p_registration_closes_at<=v_now or p_registration_closes_at>p_starts_at
  then raise exception 'CAISSA_ONLINE_DAILY_INVALID'; end if;
  insert into public.caissa_online_tournaments(owner_user_id,name,source,format,status,pool,base_ms,increment_ms,rated,
    visibility,starts_at,ends_at,registration_opens_at,registration_closes_at,duration_minutes,late_join,capacity,min_players,
    configuration,creation_event_id,created_by_clerk_id,play_category,days_per_move,group_size,qualifiers_per_group,scoring_contract)
  values(v_user_id,p_name,'community','round-robin','registration_open','daily',86400000,0,p_rated,'private',p_starts_at,null,
    v_now,p_registration_closes_at,null,false,p_capacity,4,
    jsonb_build_object('betaSeason','S001','publicDirectory',false,'userCreated',true,'chat',false,
      'rules',jsonb_build_array('Daily correspondence','One White and one Black game per group opponent','No late joining','Server-authoritative deadlines')),
    p_event_id,p_clerk_id,'daily',p_days_per_move,p_group_size,p_qualifiers_per_group,'daily-rr-1-0.5-0-v1') returning id into v_id;
  insert into public.caissa_online_daily_events(tournament_id,event_id,event_type,actor_user_id,payload)
    values(v_id,p_event_id,'daily.created',v_user_id,jsonb_build_object('daysPerMove',p_days_per_move,'groupSize',p_group_size,'capacity',p_capacity,'rated',p_rated));
  return caissa_online_private.daily_payload(p_clerk_id,v_id,null);
end;
$$;

create or replace function public.caissa_online_daily_join(p_clerk_id text,p_tournament_id uuid,p_event_id text)
returns jsonb language plpgsql security invoker set search_path=''
as $$
declare v_user_id uuid; v_profile public.caissa_online_profiles%rowtype; v_t public.caissa_online_tournaments%rowtype; v_rating integer;
begin
  select id into v_user_id from public.users where clerk_id=p_clerk_id and role<>'online_guest';
  select * into v_profile from public.caissa_online_profiles where clerk_id=p_clerk_id;
  if v_user_id is null or v_profile.user_id is null then raise exception 'CAISSA_ONLINE_IDENTITY_NOT_FOUND'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_tournament_id::text,701302));
  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text,701303));
  if exists(select 1 from public.caissa_online_daily_events where tournament_id=p_tournament_id and event_id=p_event_id)
    then return caissa_online_private.daily_payload(p_clerk_id,p_tournament_id,null); end if;
  select * into v_t from public.caissa_online_tournaments where id=p_tournament_id for update;
  if v_t.id is null or v_t.play_category<>'daily' then raise exception 'CAISSA_ONLINE_DAILY_NOT_FOUND'; end if;
  if v_t.status<>'registration_open' or v_t.registration_closes_at<=clock_timestamp() or v_t.starts_at<=clock_timestamp()
    then raise exception 'CAISSA_ONLINE_DAILY_REGISTRATION_CLOSED'; end if;
  if (select count(*) from public.caissa_online_tournament_participants where tournament_id=p_tournament_id and state<>'withdrawn')>=v_t.capacity
    then raise exception 'CAISSA_ONLINE_DAILY_FULL'; end if;
  select coalesce(rating,1500) into v_rating from public.caissa_online_ratings where user_id=v_user_id and pool='daily';
  insert into public.caissa_online_tournament_participants(tournament_id,user_id,clerk_id,display_name,rating_at_join,state,waiting_since)
    values(p_tournament_id,v_user_id,p_clerk_id,v_profile.display_name,coalesce(v_rating,1500),'registered',null)
  on conflict(tournament_id,user_id) do update set state='registered',withdrawn_at=null,updated_at=clock_timestamp(),
    display_name=excluded.display_name,rating_at_join=excluded.rating_at_join;
  insert into public.caissa_online_daily_events(tournament_id,event_id,event_type,actor_user_id)
    values(p_tournament_id,p_event_id,'daily.joined',v_user_id);
  update public.caissa_online_tournaments set version=version+1,updated_at=clock_timestamp() where id=p_tournament_id;
  return caissa_online_private.daily_payload(p_clerk_id,p_tournament_id,null);
end;
$$;

create or replace function public.caissa_online_daily_withdraw(p_clerk_id text,p_tournament_id uuid,p_event_id text)
returns jsonb language plpgsql security invoker set search_path=''
as $$
declare v_user_id uuid; v_t public.caissa_online_tournaments%rowtype;
begin
  select id into v_user_id from public.users where clerk_id=p_clerk_id and role<>'online_guest';
  perform pg_advisory_xact_lock(hashtextextended(p_tournament_id::text,701302));
  select * into v_t from public.caissa_online_tournaments where id=p_tournament_id for update;
  if v_t.id is null or v_t.play_category<>'daily' then raise exception 'CAISSA_ONLINE_DAILY_NOT_FOUND'; end if;
  if v_t.status not in('scheduled','registration_open') or v_t.starts_at<=clock_timestamp()
    then raise exception 'CAISSA_ONLINE_DAILY_REGISTRATION_CLOSED'; end if;
  update public.caissa_online_tournament_participants set state='withdrawn',withdrawn_at=clock_timestamp(),updated_at=clock_timestamp()
    where tournament_id=p_tournament_id and user_id=v_user_id and state<>'withdrawn';
  insert into public.caissa_online_daily_events(tournament_id,event_id,event_type,actor_user_id)
    values(p_tournament_id,p_event_id,'daily.withdrawn',v_user_id) on conflict(tournament_id,event_id) do nothing;
  update public.caissa_online_tournaments set version=version+1,updated_at=clock_timestamp() where id=p_tournament_id;
  return caissa_online_private.daily_payload(p_clerk_id,p_tournament_id,null);
end;
$$;

create or replace function caissa_online_private.daily_create_round(p_tournament_id uuid,p_round integer,p_players uuid[])
returns integer language plpgsql security invoker set search_path=''
as $$
declare
  v_t public.caissa_online_tournaments%rowtype; v_count integer; v_groups integer; v_group_number integer;
  v_group_id uuid; v_player uuid; v_seed integer:=0; v_band integer; v_offset integer; v_member record;
  v_opponent record; v_game_id uuid; v_board integer:=0; v_qualifiers integer; v_created integer:=0;
begin
  select * into v_t from public.caissa_online_tournaments where id=p_tournament_id for update;
  v_count:=coalesce(array_length(p_players,1),0);
  if v_t.id is null or v_t.play_category<>'daily' or v_count<2 then return 0; end if;
  if exists(select 1 from public.caissa_online_daily_groups where tournament_id=p_tournament_id and round_number=p_round) then return 0; end if;
  v_groups:=ceil(v_count::numeric/v_t.group_size)::integer;
  v_qualifiers:=case when v_groups=1 then 1 else v_t.qualifiers_per_group end;
  for v_group_number in 1..v_groups loop
    insert into public.caissa_online_daily_groups(tournament_id,round_number,group_number,qualifier_count)
      values(p_tournament_id,p_round,v_group_number,v_qualifiers) returning id into v_group_id;
  end loop;
  foreach v_player in array p_players loop
    v_seed:=v_seed+1; v_band:=(v_seed-1)/v_groups; v_offset:=(v_seed-1)%v_groups;
    v_group_number:=case when v_band%2=0 then v_offset+1 else v_groups-v_offset end;
    select id into v_group_id from public.caissa_online_daily_groups
      where tournament_id=p_tournament_id and round_number=p_round and group_number=v_group_number;
    insert into public.caissa_online_daily_group_members(group_id,user_id,seed) values(v_group_id,v_player,v_seed);
  end loop;
  update public.caissa_online_daily_groups g set qualifier_count=greatest(1,least(
      g.qualifier_count,
      (select count(*)-1 from public.caissa_online_daily_group_members m where m.group_id=g.id)
    ))
    where g.tournament_id=p_tournament_id and g.round_number=p_round;
  for v_group_number in 1..v_groups loop
    select id into v_group_id from public.caissa_online_daily_groups
      where tournament_id=p_tournament_id and round_number=p_round and group_number=v_group_number;
    for v_member in select m.user_id,p.clerk_id,p.display_name,p.rating_at_join,m.seed
      from public.caissa_online_daily_group_members m join public.caissa_online_tournament_participants p
        on p.tournament_id=p_tournament_id and p.user_id=m.user_id where m.group_id=v_group_id order by m.seed
    loop
      for v_opponent in select m.user_id,p.clerk_id,p.display_name,p.rating_at_join,m.seed
        from public.caissa_online_daily_group_members m join public.caissa_online_tournament_participants p
          on p.tournament_id=p_tournament_id and p.user_id=m.user_id
        where m.group_id=v_group_id and m.seed>v_member.seed order by m.seed
      loop
        for v_board in v_board+1..v_board+2 loop
          insert into public.caissa_online_games(pool,rated,base_ms,increment_ms,white_user_id,black_user_id,
            white_clerk_id,black_clerk_id,white_display_name,black_display_name,white_time_ms,black_time_ms,
            white_rating_before,black_rating_before,clock_started_at,tournament_id,play_category,days_per_move,move_deadline_at)
          values('daily',v_t.rated,86400000,0,
            case when v_board%2=1 then v_member.user_id else v_opponent.user_id end,
            case when v_board%2=1 then v_opponent.user_id else v_member.user_id end,
            case when v_board%2=1 then v_member.clerk_id else v_opponent.clerk_id end,
            case when v_board%2=1 then v_opponent.clerk_id else v_member.clerk_id end,
            case when v_board%2=1 then v_member.display_name else v_opponent.display_name end,
            case when v_board%2=1 then v_opponent.display_name else v_member.display_name end,
            0,0,case when v_board%2=1 then v_member.rating_at_join else v_opponent.rating_at_join end,
            case when v_board%2=1 then v_opponent.rating_at_join else v_member.rating_at_join end,
            null,p_tournament_id,'daily',v_t.days_per_move,clock_timestamp()+v_t.days_per_move*interval '1 day')
          returning id into v_game_id;
          insert into public.caissa_online_tournament_games(tournament_id,game_id,round,board_number,daily_group_id,leg)
            values(p_tournament_id,v_game_id,p_round,v_board,v_group_id,case when v_board%2=1 then 1 else 2 end);
          v_created:=v_created+1;
        end loop;
      end loop;
    end loop;
  end loop;
  update public.caissa_online_tournament_participants set state='playing',updated_at=clock_timestamp()
    where tournament_id=p_tournament_id and user_id=any(p_players);
  update public.caissa_online_tournaments set status='active',version=version+1,updated_at=clock_timestamp()
    where id=p_tournament_id;
  return v_created;
end;
$$;

create or replace function caissa_online_private.daily_score_and_advance(p_game_id uuid)
returns void language plpgsql security invoker set search_path=''
as $$
declare v_game public.caissa_online_games%rowtype; v_link public.caissa_online_tournament_games%rowtype;
  v_group public.caissa_online_daily_groups%rowtype; v_white_score numeric; v_black_score numeric;
  v_round smallint; v_tournament uuid; v_qualifiers uuid[]; v_total integer;
begin
  select * into v_game from public.caissa_online_games where id=p_game_id for update;
  if v_game.id is null or v_game.status<>'completed' or v_game.result is null then return; end if;
  select * into v_link from public.caissa_online_tournament_games where game_id=p_game_id for update;
  if v_link.daily_group_id is null or v_link.scored_at is not null then return; end if;
  select * into v_group from public.caissa_online_daily_groups where id=v_link.daily_group_id for update;
  v_white_score:=case v_game.result when '1-0' then 1 when '0-1' then 0 else 0.5 end; v_black_score:=1-v_white_score;
  update public.caissa_online_daily_group_members set score=score+v_white_score,games_played=games_played+1,
    wins=wins+(v_white_score=1)::integer,draws=draws+(v_white_score=0.5)::integer,losses=losses+(v_white_score=0)::integer
    where group_id=v_group.id and user_id=v_game.white_user_id;
  update public.caissa_online_daily_group_members set score=score+v_black_score,games_played=games_played+1,
    wins=wins+(v_black_score=1)::integer,draws=draws+(v_black_score=0.5)::integer,losses=losses+(v_black_score=0)::integer
    where group_id=v_group.id and user_id=v_game.black_user_id;
  update public.caissa_online_tournament_games set scored_at=clock_timestamp(),white_points=(v_white_score*2)::smallint,
    black_points=(v_black_score*2)::smallint where game_id=p_game_id;
  if exists(select 1 from public.caissa_online_tournament_games l join public.caissa_online_games g on g.id=l.game_id
      where l.daily_group_id=v_group.id and g.status='active') then return; end if;
  with opponents as (
    select me.user_id,sum((case when g.white_user_id=me.user_id then l.white_points else l.black_points end)::numeric
      *opp.score/2) tie_break
    from public.caissa_online_daily_group_members me
    join public.caissa_online_tournament_games l on l.daily_group_id=me.group_id
    join public.caissa_online_games g on g.id=l.game_id and me.user_id in(g.white_user_id,g.black_user_id)
    join public.caissa_online_daily_group_members opp on opp.group_id=me.group_id and opp.user_id=
      case when g.white_user_id=me.user_id then g.black_user_id else g.white_user_id end
    where me.group_id=v_group.id group by me.user_id
  ) update public.caissa_online_daily_group_members m set tie_break=o.tie_break from opponents o
    where m.group_id=v_group.id and m.user_id=o.user_id;
  with ranked as (select group_id,user_id,row_number() over(order by score desc,tie_break desc,wins desc,seed,user_id)::integer rank
    from public.caissa_online_daily_group_members where group_id=v_group.id)
  update public.caissa_online_daily_group_members m set rank=r.rank,qualified=r.rank<=v_group.qualifier_count
    from ranked r where m.group_id=r.group_id and m.user_id=r.user_id;
  update public.caissa_online_daily_groups set state='completed',completed_at=clock_timestamp() where id=v_group.id;
  v_round:=v_group.round_number; v_tournament:=v_group.tournament_id;
  if exists(select 1 from public.caissa_online_daily_groups where tournament_id=v_tournament and round_number=v_round and state<>'completed') then return; end if;
  select array_agg(m.user_id order by g.group_number,m.rank,m.seed),count(*) into v_qualifiers,v_total
    from public.caissa_online_daily_groups g join public.caissa_online_daily_group_members m on m.group_id=g.id and m.qualified
    where g.tournament_id=v_tournament and g.round_number=v_round;
  if v_total<=1 then
    update public.caissa_online_tournaments set status='completed',completed_at=clock_timestamp(),version=version+1,updated_at=clock_timestamp()
      where id=v_tournament;
  else
    perform caissa_online_private.daily_create_round(v_tournament,(v_round+1)::smallint,v_qualifiers);
  end if;
end;
$$;

create or replace function public.caissa_online_daily_commit_move(
  p_clerk_id text,p_game_id uuid,p_event_id text,p_expected_version integer,p_from text,p_to text,p_promotion text,
  p_san text,p_uci text,p_next_fen text,p_next_turn text,p_result text,p_termination text,p_pgn text,
  p_white_can_mate boolean,p_black_can_mate boolean,p_next_deadline_at timestamptz
) returns jsonb language plpgsql security invoker set search_path=''
as $$
declare v_game public.caissa_online_games%rowtype; v_actor uuid; v_sequence integer;
begin
  select * into v_game from public.caissa_online_games where id=p_game_id for update;
  if v_game.id is null or v_game.play_category<>'daily' then raise exception 'CAISSA_ONLINE_GAME_NOT_FOUND'; end if;
  if p_clerk_id not in(v_game.white_clerk_id,v_game.black_clerk_id) then raise exception 'CAISSA_ONLINE_NOT_PARTICIPANT'; end if;
  if exists(select 1 from public.caissa_online_game_events where game_id=p_game_id and event_id=p_event_id)
    then return caissa_online_private.daily_payload(p_clerk_id,v_game.tournament_id,p_game_id); end if;
  if v_game.status<>'active' then raise exception 'CAISSA_ONLINE_GAME_NOT_ACTIVE'; end if;
  if v_game.move_deadline_at<=clock_timestamp() then raise exception 'CAISSA_ONLINE_TIME_EXPIRED'; end if;
  if v_game.version<>p_expected_version then raise exception 'CAISSA_ONLINE_STALE_VERSION'; end if;
  if (v_game.turn='white' and p_clerk_id<>v_game.white_clerk_id) or (v_game.turn='black' and p_clerk_id<>v_game.black_clerk_id)
    then raise exception 'CAISSA_ONLINE_NOT_YOUR_TURN'; end if;
  if p_from!~'^[a-h][1-8]$' or p_to!~'^[a-h][1-8]$' or p_next_turn not in('white','black')
    or p_white_can_mate is null or p_black_can_mate is null or octet_length(p_pgn)>524288 or v_game.ply>=6000
    then raise exception 'CAISSA_ONLINE_INVALID_MOVE'; end if;
  select id into v_actor from public.users where clerk_id=p_clerk_id; v_sequence:=v_game.ply+1;
  update public.caissa_online_games set fen=p_next_fen,moves=moves||jsonb_build_array(jsonb_build_object(
    'ply',v_sequence,'from',p_from,'to',p_to,'promotion',p_promotion,'san',p_san,'uci',p_uci,'color',v_game.turn,'serverTimestamp',clock_timestamp())),
    pgn=p_pgn,white_can_mate=p_white_can_mate,black_can_mate=p_black_can_mate,ply=v_sequence,turn=p_next_turn,
    version=version+1,move_deadline_at=case when p_result is null then clock_timestamp()+days_per_move*interval '1 day' else null end,
    draw_offer_by=null,status=case when p_result is null then status else 'completed' end,result=p_result,termination=p_termination,
    completed_at=case when p_result is null then null else clock_timestamp() end,updated_at=clock_timestamp() where id=p_game_id;
  insert into public.caissa_online_game_events(game_id,sequence,event_id,event_type,actor_user_id,payload)
    values(p_game_id,v_sequence,p_event_id,case when p_result is null then 'game.moveAccepted' else 'game.result' end,v_actor,
      jsonb_build_object('from',p_from,'to',p_to,'san',p_san));
  if p_result is not null then perform caissa_online_private.apply_rating(p_game_id); perform caissa_online_private.daily_score_and_advance(p_game_id); end if;
  return caissa_online_private.daily_payload(p_clerk_id,v_game.tournament_id,p_game_id);
end;
$$;

create or replace function public.caissa_online_daily_finish_game(p_clerk_id text,p_game_id uuid,p_event_id text,p_reason text)
returns jsonb language plpgsql security invoker set search_path=''
as $$
declare v_game public.caissa_online_games%rowtype; v_actor uuid; v_result text; v_termination text;
begin
  select * into v_game from public.caissa_online_games where id=p_game_id for update;
  if v_game.id is null or v_game.play_category<>'daily' then raise exception 'CAISSA_ONLINE_GAME_NOT_FOUND'; end if;
  if p_clerk_id not in(v_game.white_clerk_id,v_game.black_clerk_id) then raise exception 'CAISSA_ONLINE_NOT_PARTICIPANT'; end if;
  if exists(select 1 from public.caissa_online_game_events where game_id=p_game_id and event_id=p_event_id)
    then return caissa_online_private.daily_payload(p_clerk_id,v_game.tournament_id,p_game_id); end if;
  if v_game.status<>'active' then return caissa_online_private.daily_payload(p_clerk_id,v_game.tournament_id,p_game_id); end if;
  if p_reason='timeout' and v_game.move_deadline_at<=clock_timestamp() then
    v_result:=caissa_online_private.timeout_result(v_game.turn,v_game.white_can_mate,v_game.black_can_mate); v_termination:='timeout';
  elsif p_reason='agreement' then
    if v_game.draw_offer_by is null or v_game.draw_offer_by=p_clerk_id then raise exception 'CAISSA_ONLINE_DRAW_OFFER_REQUIRED'; end if;
    v_result:='1/2-1/2';v_termination:='agreement';
  elsif p_reason='resignation' then v_result:=case when p_clerk_id=v_game.white_clerk_id then '0-1' else '1-0' end;v_termination:='resignation';
  else raise exception 'CAISSA_ONLINE_INVALID_TERMINATION'; end if;
  select id into v_actor from public.users where clerk_id=p_clerk_id;
  update public.caissa_online_games set status='completed',result=v_result,termination=v_termination,completed_at=clock_timestamp(),
    move_deadline_at=null,deadline_processed_at=case when v_termination='timeout' then clock_timestamp() else null end,
    version=version+1,updated_at=clock_timestamp() where id=p_game_id;
  insert into public.caissa_online_game_events(game_id,sequence,event_id,event_type,actor_user_id,payload)
    values(p_game_id,v_game.ply+1,p_event_id,'game.result',v_actor,jsonb_build_object('result',v_result,'termination',v_termination));
  perform caissa_online_private.apply_rating(p_game_id); perform caissa_online_private.daily_score_and_advance(p_game_id);
  return caissa_online_private.daily_payload(p_clerk_id,v_game.tournament_id,p_game_id);
end;
$$;

create or replace function caissa_online_private.weekly_generate(p_now timestamptz,p_weeks integer default 4)
returns integer language plpgsql security invoker set search_path=''
as $$
declare v_series public.caissa_online_tournament_series%rowtype; v_first date; v_date date; v_slot jsonb;
  v_start timestamptz; v_end timestamptz; v_open timestamptz; v_key text; v_count integer:=0; v_week integer;
begin
  for v_series in select * from public.caissa_online_tournament_series where enabled order by slug for update loop
    v_first:=greatest((p_now at time zone v_series.timezone)::date,v_series.launch_not_before);
    v_first:=v_first+((v_series.weekday-extract(dow from v_first)::integer+7)%7);
    for v_week in 0..least(greatest(p_weeks,1),12)-1 loop
      v_date:=v_first+(v_week*7);
      for v_slot in select value from jsonb_array_elements(v_series.slots) loop
        if exists(select 1 from public.caissa_online_tournament_series_skips s where s.series_id=v_series.id
          and s.local_date=v_date and s.slot_id=v_slot->>'id') then continue; end if;
        v_start:=(v_date+make_interval(hours=>(v_slot->>'hour')::integer,mins=>(v_slot->>'minute')::integer)) at time zone v_series.timezone;
        v_end:=v_start+v_series.duration_minutes*interval '1 minute'; v_open:=v_start-v_series.registration_lead_days*interval '1 day';
        v_key:=v_series.slug||':'||v_date::text||':'||(v_slot->>'id');
        insert into public.caissa_online_tournaments(name,source,format,status,pool,base_ms,increment_ms,rated,visibility,
          starts_at,ends_at,registration_opens_at,registration_closes_at,duration_minutes,late_join,capacity,min_players,
          configuration,created_by_clerk_id,play_category,series_id,series_occurrence_key)
        values(v_slot->>'label'||' · '||v_date::text,'official','arena',case when v_open<=p_now then 'registration_open' else 'scheduled' end,
          v_series.pool,v_series.base_ms,v_series.increment_ms,v_series.rated,'private',v_start,v_end,v_open,
          case when v_series.late_join then v_end else v_start end,v_series.duration_minutes,v_series.late_join,v_series.capacity,v_series.min_players,
          jsonb_build_object('betaSeason','S001','publicDirectory',false,'officialSeries',v_series.slug,'timeZone',v_series.timezone,
            'slotId',v_slot->>'id','featured',true,'chat',false,'finishingPolicy','finish_active_games'),
          'system:'||v_series.slug,'live',v_series.id,v_key)
        on conflict(series_occurrence_key) where series_occurrence_key is not null do nothing;
        if found then v_count:=v_count+1; end if;
      end loop;
    end loop;
    update public.caissa_online_tournament_series set last_generated_at=p_now,next_generation_at=p_now+interval '1 day',updated_at=p_now where id=v_series.id;
  end loop;
  return v_count;
end;
$$;

create or replace function caissa_online_private.daily_process(p_now timestamptz,p_limit integer default 100)
returns integer language plpgsql security invoker set search_path=''
as $$
declare v_t record; v_game record; v_players uuid[]; v_count integer:=0; v_result text;
begin
  update public.caissa_online_tournaments set status='registration_open',version=version+1,updated_at=p_now
    where play_category='daily' and status='scheduled' and registration_opens_at<=p_now;
  for v_t in select t.id,t.min_players from public.caissa_online_tournaments t
    where t.play_category='daily' and t.status in('scheduled','registration_open') and t.starts_at<=p_now
    order by t.starts_at for update skip locked loop
    select array_agg(p.user_id order by p.rating_at_join desc,p.joined_at,p.user_id),count(*) into v_players,v_count
      from public.caissa_online_tournament_participants p where p.tournament_id=v_t.id and p.state<>'withdrawn';
    if v_count<v_t.min_players then
      update public.caissa_online_tournaments set status='cancelled',cancelled_at=p_now,version=version+1,updated_at=p_now where id=v_t.id;
    else perform caissa_online_private.daily_create_round(v_t.id,1,v_players); end if;
  end loop;
  v_count:=0;
  for v_game in select g.* from public.caissa_online_games g where g.play_category='daily' and g.status='active'
    and g.move_deadline_at<=p_now order by g.move_deadline_at,g.id limit least(greatest(p_limit,1),500) for update skip locked loop
    v_result:=caissa_online_private.timeout_result(v_game.turn,v_game.white_can_mate,v_game.black_can_mate);
    update public.caissa_online_games set status='completed',result=v_result,termination='timeout',completed_at=p_now,
      move_deadline_at=null,deadline_processed_at=p_now,version=version+1,updated_at=p_now where id=v_game.id and status='active';
    insert into public.caissa_online_game_events(game_id,sequence,event_id,event_type,payload)
      values(v_game.id,v_game.ply+1,'daily-timeout:'||v_game.id::text||':'||v_game.version::text,'game.result',
        jsonb_build_object('result',v_result,'termination','timeout')) on conflict(game_id,event_id) do nothing;
    perform caissa_online_private.apply_rating(v_game.id); perform caissa_online_private.daily_score_and_advance(v_game.id); v_count:=v_count+1;
  end loop;
  return v_count;
end;
$$;

create or replace function public.caissa_online_tournament_scheduler_tick(p_now timestamptz default clock_timestamp())
returns jsonb language plpgsql security invoker set search_path=''
as $$
declare v_run uuid:=gen_random_uuid(); v_generated integer:=0; v_transitioned integer:=0; v_t record;
begin
  perform pg_advisory_xact_lock(hashtextextended('caissa-tournament-scheduler-s001',701401));
  insert into public.caissa_online_scheduler_ledger(run_id,scheduler,status,started_at) values(v_run,'combined','running',p_now);
  v_generated:=caissa_online_private.weekly_generate(p_now,4);
  update public.caissa_online_tournaments set status='registration_open',version=version+1,updated_at=p_now
    where series_id is not null and status='scheduled' and registration_opens_at<=p_now;
  for v_t in select t.id,t.status,t.min_players,t.starts_at,t.ends_at,
      (select count(*) from public.caissa_online_tournament_participants p where p.tournament_id=t.id and p.state<>'withdrawn') participants
    from public.caissa_online_tournaments t where t.series_id is not null and t.status in('registration_open','active','finishing')
    and (t.starts_at<=p_now or t.ends_at<=p_now) order by t.starts_at for update skip locked loop
    if v_t.status='registration_open' and v_t.starts_at<=p_now then
      if v_t.participants<v_t.min_players then update public.caissa_online_tournaments set status='cancelled',cancelled_at=p_now,version=version+1,updated_at=p_now where id=v_t.id;
      else update public.caissa_online_tournament_participants set state='waiting',waiting_since=p_now,updated_at=p_now where tournament_id=v_t.id and state='registered';
        update public.caissa_online_tournaments set status='active',version=version+1,updated_at=p_now where id=v_t.id;
        perform caissa_online_private.arena_reconcile(v_t.id); end if; v_transitioned:=v_transitioned+1;
    elsif v_t.status='active' and v_t.ends_at<=p_now then
      update public.caissa_online_tournaments set status='finishing',version=version+1,updated_at=p_now where id=v_t.id;
      perform caissa_online_private.arena_reconcile(v_t.id); v_transitioned:=v_transitioned+1;
    elsif v_t.status='finishing' then perform caissa_online_private.arena_reconcile(v_t.id); end if;
  end loop;
  v_transitioned:=v_transitioned+caissa_online_private.daily_process(p_now,100);
  update public.caissa_online_scheduler_ledger set status='completed',completed_at=clock_timestamp(),generated_count=v_generated,
    transitioned_count=v_transitioned,metadata=jsonb_build_object('asOf',p_now) where run_id=v_run;
  return jsonb_build_object('runId',v_run,'generated',v_generated,'transitioned',v_transitioned);
exception when others then
  insert into public.caissa_online_scheduler_ledger(run_id,scheduler,status,started_at,completed_at,error_code,metadata)
    values(v_run,'combined','failed',p_now,clock_timestamp(),sqlstate,
      jsonb_build_object('asOf',p_now,'message',left(sqlerrm,240)))
    on conflict(run_id) do update set status='failed',completed_at=excluded.completed_at,error_code=excluded.error_code,
      metadata=excluded.metadata;
  return jsonb_build_object('runId',v_run,'failed',true,'code',sqlstate);
end;
$$;

create or replace function public.caissa_online_weekly_admin(p_clerk_id text,p_event_id text,p_action text,p_payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security invoker set search_path=''
as $$
declare v_series public.caissa_online_tournament_series%rowtype; v_tournament uuid;
begin
  select * into v_series from public.caissa_online_tournament_series where slug='saturdays-of-chess-s001' for update;
  if v_series.id is null then raise exception 'CAISSA_ONLINE_SERIES_NOT_FOUND'; end if;
  if p_action='pause' then update public.caissa_online_tournament_series set enabled=false,updated_at=clock_timestamp() where id=v_series.id;
  elsif p_action='enable' then update public.caissa_online_tournament_series set enabled=true,next_generation_at=clock_timestamp(),updated_at=clock_timestamp() where id=v_series.id;
  elsif p_action='skip' then
    if (p_payload->>'localDate')::date<v_series.launch_not_before
      or not exists(select 1 from jsonb_array_elements(v_series.slots) slot where slot->>'id'=p_payload->>'slotId')
      then raise exception 'CAISSA_ONLINE_SERIES_INVALID_SKIP'; end if;
    insert into public.caissa_online_tournament_series_skips(series_id,local_date,slot_id,reason,created_by_clerk_id)
      values(v_series.id,(p_payload->>'localDate')::date,p_payload->>'slotId',left(coalesce(p_payload->>'reason','Organizer skip'),240),p_clerk_id)
      on conflict(series_id,local_date,slot_id) do update set reason=excluded.reason,created_by_clerk_id=excluded.created_by_clerk_id,created_at=clock_timestamp();
  elsif p_action='cancel' then
    v_tournament:=(p_payload->>'tournamentId')::uuid;
    update public.caissa_online_tournaments set status='cancelled',cancelled_at=clock_timestamp(),version=version+1,updated_at=clock_timestamp()
      where id=v_tournament and series_id=v_series.id and status in('scheduled','registration_open');
    if not found then raise exception 'CAISSA_ONLINE_SERIES_OCCURRENCE_NOT_CANCELLABLE'; end if;
  elsif p_action='update' then
    if (p_payload->>'capacity')::integer not between 4 and 100
      or (p_payload->>'minimumPlayers')::integer not between 4 and (p_payload->>'capacity')::integer
      or (p_payload->>'registrationLeadDays')::integer not between 1 and 30
      then raise exception 'CAISSA_ONLINE_SERIES_INVALID_CONFIGURATION'; end if;
    update public.caissa_online_tournament_series set
      capacity=(p_payload->>'capacity')::integer,
      min_players=(p_payload->>'minimumPlayers')::integer,
      registration_lead_days=(p_payload->>'registrationLeadDays')::integer,
      rated=coalesce((p_payload->>'rated')::boolean,false),updated_at=clock_timestamp()
      where id=v_series.id;
  elsif p_action='inspect' then null;
  else raise exception 'CAISSA_ONLINE_SERIES_INVALID_ACTION'; end if;
  select * into v_series from public.caissa_online_tournament_series where id=v_series.id;
  return jsonb_build_object('series',to_jsonb(v_series),
    'occurrences',coalesce((select jsonb_agg(jsonb_build_object(
      'id',t.id,'name',t.name,'status',t.status,'startsAt',t.starts_at,'endsAt',t.ends_at,
      'capacity',t.capacity,'participantCount',(select count(*) from public.caissa_online_tournament_participants p
        where p.tournament_id=t.id and p.state<>'withdrawn')) order by t.starts_at)
      from public.caissa_online_tournaments t where t.series_id=v_series.id
        and t.starts_at>=clock_timestamp()-interval '1 day'),'[]'::jsonb),
    'ledger',coalesce((select jsonb_agg(jsonb_build_object(
      'runId',l.run_id,'status',l.status,'startedAt',l.started_at,'completedAt',l.completed_at,
      'generatedCount',l.generated_count,'transitionedCount',l.transitioned_count,'errorCode',l.error_code)
      order by l.started_at desc) from (select * from public.caissa_online_scheduler_ledger
        order by started_at desc limit 20) l),'[]'::jsonb));
end;
$$;

revoke all on function caissa_online_private.daily_payload(text,uuid,uuid) from public,anon,authenticated;
revoke all on function caissa_online_private.daily_create_round(uuid,integer,uuid[]) from public,anon,authenticated;
revoke all on function caissa_online_private.daily_score_and_advance(uuid) from public,anon,authenticated;
revoke all on function caissa_online_private.weekly_generate(timestamptz,integer) from public,anon,authenticated;
revoke all on function caissa_online_private.daily_process(timestamptz,integer) from public,anon,authenticated;
revoke all on function public.caissa_online_daily_sync(text,uuid,uuid) from public,anon,authenticated;
revoke all on function public.caissa_online_daily_create(text,text,text,timestamptz,timestamptz,integer,integer,integer,integer,boolean) from public,anon,authenticated;
revoke all on function public.caissa_online_daily_join(text,uuid,text) from public,anon,authenticated;
revoke all on function public.caissa_online_daily_withdraw(text,uuid,text) from public,anon,authenticated;
revoke all on function public.caissa_online_daily_commit_move(text,uuid,text,integer,text,text,text,text,text,text,text,text,text,text,boolean,boolean,timestamptz) from public,anon,authenticated;
revoke all on function public.caissa_online_daily_finish_game(text,uuid,text,text) from public,anon,authenticated;
revoke all on function public.caissa_online_tournament_scheduler_tick(timestamptz) from public,anon,authenticated;
revoke all on function public.caissa_online_weekly_admin(text,text,text,jsonb) from public,anon,authenticated;

grant execute on function caissa_online_private.daily_payload(text,uuid,uuid) to service_role;
grant execute on function caissa_online_private.daily_create_round(uuid,integer,uuid[]) to service_role;
grant execute on function caissa_online_private.daily_score_and_advance(uuid) to service_role;
grant execute on function caissa_online_private.weekly_generate(timestamptz,integer) to service_role;
grant execute on function caissa_online_private.daily_process(timestamptz,integer) to service_role;
grant execute on function public.caissa_online_daily_sync(text,uuid,uuid) to service_role;
grant execute on function public.caissa_online_daily_create(text,text,text,timestamptz,timestamptz,integer,integer,integer,integer,boolean) to service_role;
grant execute on function public.caissa_online_daily_join(text,uuid,text) to service_role;
grant execute on function public.caissa_online_daily_withdraw(text,uuid,text) to service_role;
grant execute on function public.caissa_online_daily_commit_move(text,uuid,text,integer,text,text,text,text,text,text,text,text,text,text,boolean,boolean,timestamptz) to service_role;
grant execute on function public.caissa_online_daily_finish_game(text,uuid,text,text) to service_role;
grant execute on function public.caissa_online_tournament_scheduler_tick(timestamptz) to service_role;
grant execute on function public.caissa_online_weekly_admin(text,text,text,jsonb) to service_role;

alter function public.caissa_online_daily_join(text,uuid,text) set lock_timeout='2s';
alter function public.caissa_online_daily_commit_move(text,uuid,text,integer,text,text,text,text,text,text,text,text,text,text,boolean,boolean,timestamptz) set lock_timeout='2s';
alter function public.caissa_online_tournament_scheduler_tick(timestamptz) set lock_timeout='2s';

create extension if not exists pg_cron with schema pg_catalog;
do $$
begin
  if not exists(select 1 from cron.job where jobname='caissa-tournament-scheduler-s001') then
    perform cron.schedule('caissa-tournament-scheduler-s001','* * * * *',
      'select public.caissa_online_tournament_scheduler_tick(pg_catalog.clock_timestamp());');
  end if;
end
$$;

commit;
