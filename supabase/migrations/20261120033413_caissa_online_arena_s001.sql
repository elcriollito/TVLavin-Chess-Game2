-- CAISSA Arena S001. Forward-only and dormant unless the server-side Arena
-- feature gates are enabled in a non-production environment.
begin;

alter table public.caissa_online_tournaments
  drop constraint if exists caissa_online_tournaments_status_check;

update public.caissa_online_tournaments
set status = case status when 'upcoming' then 'scheduled' when 'live' then 'active' else status end
where status in ('upcoming', 'live');

alter table public.caissa_online_tournaments
  alter column status set default 'draft',
  add constraint caissa_online_tournaments_status_check
    check (status in ('draft', 'scheduled', 'registration_open', 'active', 'finishing', 'completed', 'cancelled')),
  add column if not exists registration_opens_at timestamptz,
  add column if not exists registration_closes_at timestamptz,
  add column if not exists min_players smallint not null default 4,
  add column if not exists version integer not null default 1,
  add column if not exists creation_event_id text,
  add column if not exists created_by_clerk_id text,
  add column if not exists updated_at timestamptz not null default clock_timestamp(),
  add column if not exists completed_at timestamptz,
  add column if not exists cancelled_at timestamptz,
  add column if not exists finishing_policy text not null default 'finish_active_games',
  add column if not exists scoring_contract text not null default 'arena-s001-2-1-0',
  add constraint caissa_online_tournaments_min_players_check check (min_players between 2 and 256),
  add constraint caissa_online_tournaments_version_check check (version > 0),
  add constraint caissa_online_tournaments_finishing_policy_check check (finishing_policy = 'finish_active_games'),
  add constraint caissa_online_tournaments_scoring_contract_check check (scoring_contract = 'arena-s001-2-1-0');

create unique index if not exists caissa_online_tournaments_creation_event_uq
  on public.caissa_online_tournaments(creation_event_id)
  where creation_event_id is not null;

alter table public.caissa_online_tournament_participants
  add column if not exists clerk_id text,
  add column if not exists display_name text,
  add column if not exists rating_at_join integer,
  add column if not exists state text not null default 'registered',
  add column if not exists games_played integer not null default 0,
  add column if not exists wins integer not null default 0,
  add column if not exists draws integer not null default 0,
  add column if not exists losses integer not null default 0,
  add column if not exists color_balance integer not null default 0,
  add column if not exists last_opponent_user_id uuid references public.users(id) on delete set null,
  add column if not exists last_pairing_at timestamptz,
  add column if not exists waiting_since timestamptz,
  add column if not exists withdrawn_at timestamptz,
  add column if not exists disconnected_at timestamptz,
  add column if not exists updated_at timestamptz not null default clock_timestamp(),
  add constraint caissa_online_arena_participant_state_check
    check (state in ('registered', 'waiting', 'playing', 'withdrawn', 'disconnected')),
  add constraint caissa_online_arena_participant_stats_check
    check (games_played >= 0 and wins >= 0 and draws >= 0 and losses >= 0
      and games_played = wins + draws + losses);

update public.caissa_online_tournament_participants participant
set clerk_id = profile.clerk_id,
    display_name = profile.display_name,
    rating_at_join = coalesce(rating.rating, 1500)
from public.caissa_online_profiles profile
left join public.caissa_online_ratings rating
  on rating.user_id = profile.user_id and rating.pool = 'blitz'
where participant.user_id = profile.user_id
  and participant.clerk_id is null;

create unique index if not exists caissa_online_arena_participant_subject_uq
  on public.caissa_online_tournament_participants(tournament_id, clerk_id)
  where clerk_id is not null;
create index if not exists caissa_online_arena_participant_waiting_idx
  on public.caissa_online_tournament_participants(tournament_id, state, waiting_since, user_id);
create index if not exists caissa_online_arena_participant_last_opponent_idx
  on public.caissa_online_tournament_participants(last_opponent_user_id);

create table public.caissa_online_arena_pairings (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.caissa_online_tournaments(id) on delete cascade,
  game_id uuid unique references public.caissa_online_games(id) on delete cascade,
  white_user_id uuid not null references public.users(id) on delete cascade,
  black_user_id uuid not null references public.users(id) on delete cascade,
  white_clerk_id text not null,
  black_clerk_id text not null,
  state text not null default 'assigned'
    check (state in ('waiting', 'assigned', 'ready', 'active', 'finished', 'expired')),
  assigned_at timestamptz not null default clock_timestamp(),
  ready_at timestamptz,
  active_at timestamptz,
  finished_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  check (white_user_id <> black_user_id),
  check (white_clerk_id <> black_clerk_id)
);

create index caissa_online_arena_pairings_tournament_state_idx
  on public.caissa_online_arena_pairings(tournament_id, state, assigned_at);
create unique index caissa_online_arena_pairings_white_active_uq
  on public.caissa_online_arena_pairings(tournament_id, white_user_id)
  where state in ('assigned', 'ready', 'active');
create unique index caissa_online_arena_pairings_black_active_uq
  on public.caissa_online_arena_pairings(tournament_id, black_user_id)
  where state in ('assigned', 'ready', 'active');

alter table public.caissa_online_tournament_games
  add column if not exists pairing_id uuid references public.caissa_online_arena_pairings(id) on delete set null,
  add column if not exists scored_at timestamptz,
  add column if not exists white_points smallint,
  add column if not exists black_points smallint,
  add constraint caissa_online_arena_game_points_check
    check ((white_points is null and black_points is null)
      or (white_points between 0 and 2 and black_points between 0 and 2));

create unique index if not exists caissa_online_tournament_games_pairing_uq
  on public.caissa_online_tournament_games(pairing_id)
  where pairing_id is not null;

create table public.caissa_online_arena_events (
  id bigint generated always as identity primary key,
  tournament_id uuid not null references public.caissa_online_tournaments(id) on delete cascade,
  event_id text not null check (char_length(event_id) between 12 and 120),
  event_type text not null check (char_length(event_type) between 3 and 80),
  actor_user_id uuid references public.users(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default clock_timestamp(),
  unique (tournament_id, event_id)
);
create index caissa_online_arena_events_actor_idx on public.caissa_online_arena_events(actor_user_id);

alter table public.caissa_online_arena_pairings enable row level security;
alter table public.caissa_online_arena_events enable row level security;
revoke all on public.caissa_online_arena_pairings from public, anon, authenticated;
revoke all on public.caissa_online_arena_events from public, anon, authenticated;
grant all on public.caissa_online_arena_pairings to service_role;
grant all on public.caissa_online_arena_events to service_role;
grant usage, select on sequence public.caissa_online_arena_events_id_seq to service_role;

create or replace function caissa_online_private.arena_pair_waiters(p_tournament_id uuid)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_tournament public.caissa_online_tournaments%rowtype;
  v_first public.caissa_online_tournament_participants%rowtype;
  v_second public.caissa_online_tournament_participants%rowtype;
  v_white public.caissa_online_tournament_participants%rowtype;
  v_black public.caissa_online_tournament_participants%rowtype;
  v_pairing_id uuid;
  v_game_id uuid;
  v_board integer;
  v_created integer := 0;
  v_first_white_cost integer;
  v_second_white_cost integer;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_tournament_id::text, 701101));
  select * into v_tournament from public.caissa_online_tournaments
    where id = p_tournament_id for update;
  if v_tournament.id is null or v_tournament.status <> 'active'
    or v_tournament.ends_at <= pg_catalog.clock_timestamp() then
    return 0;
  end if;

  update public.caissa_online_tournament_participants participant
  set state = 'playing', updated_at = pg_catalog.clock_timestamp()
  where participant.tournament_id = p_tournament_id
    and participant.state in ('waiting', 'disconnected')
    and exists (
      select 1 from public.caissa_online_games game
      where game.status = 'active'
        and participant.user_id in (game.white_user_id, game.black_user_id)
    );

  loop
    v_first := null;
    v_second := null;
    select * into v_first
    from public.caissa_online_tournament_participants participant
    where participant.tournament_id = p_tournament_id
      and participant.state = 'waiting'
      and not exists (
        select 1 from public.caissa_online_games game
        where game.status = 'active'
          and participant.user_id in (game.white_user_id, game.black_user_id)
      )
    order by participant.waiting_since nulls first, participant.joined_at, participant.user_id
    limit 1 for update skip locked;
    exit when v_first.user_id is null;

    select * into v_second
    from public.caissa_online_tournament_participants candidate
    where candidate.tournament_id = p_tournament_id
      and candidate.state = 'waiting'
      and candidate.user_id <> v_first.user_id
      and not exists (
        select 1 from public.caissa_online_games game
        where game.status = 'active'
          and candidate.user_id in (game.white_user_id, game.black_user_id)
      )
    order by
      ((candidate.user_id = v_first.last_opponent_user_id)
        or (candidate.last_opponent_user_id = v_first.user_id))::integer,
      abs(coalesce(candidate.rating_at_join, 1500) - coalesce(v_first.rating_at_join, 1500)),
      candidate.waiting_since nulls first,
      candidate.joined_at,
      candidate.user_id
    limit 1 for update skip locked;
    exit when v_second.user_id is null;

    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
      least(v_first.user_id::text, v_second.user_id::text), 701001));
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
      greatest(v_first.user_id::text, v_second.user_id::text), 701001));

    if exists (
      select 1 from public.caissa_online_games game
      where game.status = 'active'
        and (game.white_user_id in (v_first.user_id, v_second.user_id)
          or game.black_user_id in (v_first.user_id, v_second.user_id))
    ) then
      update public.caissa_online_tournament_participants participant
      set state = 'playing', updated_at = pg_catalog.clock_timestamp()
      where participant.tournament_id = p_tournament_id
        and participant.user_id in (v_first.user_id, v_second.user_id)
        and exists (
          select 1 from public.caissa_online_games game
          where game.status = 'active'
            and participant.user_id in (game.white_user_id, game.black_user_id)
        );
      continue;
    end if;

    v_first_white_cost := abs(v_first.color_balance + 1) + abs(v_second.color_balance - 1);
    v_second_white_cost := abs(v_first.color_balance - 1) + abs(v_second.color_balance + 1);
    if v_first_white_cost < v_second_white_cost
      or (v_first_white_cost = v_second_white_cost and v_first.user_id::text < v_second.user_id::text) then
      v_white := v_first;
      v_black := v_second;
    else
      v_white := v_second;
      v_black := v_first;
    end if;

    select coalesce(max(link.board_number), 0) + 1 into v_board
    from public.caissa_online_tournament_games link
    join public.caissa_online_games game on game.id = link.game_id
    where link.tournament_id = p_tournament_id and game.status = 'active';

    insert into public.caissa_online_games(
      pool, rated, base_ms, increment_ms, white_user_id, black_user_id,
      white_clerk_id, black_clerk_id, white_display_name, black_display_name,
      white_time_ms, black_time_ms, white_rating_before, black_rating_before,
      clock_started_at, tournament_id
    ) values (
      v_tournament.pool, false, v_tournament.base_ms, v_tournament.increment_ms,
      v_white.user_id, v_black.user_id, v_white.clerk_id, v_black.clerk_id,
      v_white.display_name, v_black.display_name, v_tournament.base_ms, v_tournament.base_ms,
      v_white.rating_at_join, v_black.rating_at_join,
      pg_catalog.clock_timestamp() + interval '3 seconds', p_tournament_id
    ) returning id into v_game_id;

    insert into public.caissa_online_arena_pairings(
      tournament_id, game_id, white_user_id, black_user_id, white_clerk_id, black_clerk_id,
      state, ready_at, active_at, expires_at
    ) values (
      p_tournament_id, v_game_id, v_white.user_id, v_black.user_id,
      v_white.clerk_id, v_black.clerk_id, 'active', pg_catalog.clock_timestamp(),
      pg_catalog.clock_timestamp(), null
    ) returning id into v_pairing_id;

    insert into public.caissa_online_tournament_games(
      tournament_id, game_id, board_number, pairing_id
    ) values (p_tournament_id, v_game_id, v_board, v_pairing_id);

    update public.caissa_online_tournament_participants participant
    set state = 'playing',
        color_balance = color_balance + case when participant.user_id = v_white.user_id then 1 else -1 end,
        last_opponent_user_id = case when participant.user_id = v_white.user_id
          then v_black.user_id else v_white.user_id end,
        last_pairing_at = pg_catalog.clock_timestamp(), waiting_since = null,
        disconnected_at = null, updated_at = pg_catalog.clock_timestamp()
    where participant.tournament_id = p_tournament_id
      and participant.user_id in (v_white.user_id, v_black.user_id);

    update public.caissa_online_matchmaking_tickets
    set state = 'cancelled', updated_at = pg_catalog.clock_timestamp()
    where state = 'queued' and user_id in (v_white.user_id, v_black.user_id);
    update public.caissa_online_challenges
    set state = 'cancelled', updated_at = pg_catalog.clock_timestamp()
    where state = 'pending'
      and (challenger_user_id in (v_white.user_id, v_black.user_id)
        or challenged_user_id in (v_white.user_id, v_black.user_id));
    update public.caissa_online_presence
    set active_game_id = v_game_id, status = 'playing',
      last_seen_at = pg_catalog.clock_timestamp(), expires_at = pg_catalog.clock_timestamp() + interval '45 seconds'
    where user_id in (v_white.user_id, v_black.user_id);

    insert into public.caissa_online_game_events(game_id, sequence, event_id, event_type, payload)
    values (v_game_id, 0, 'arena-pairing:' || v_pairing_id::text, 'match.found',
      pg_catalog.jsonb_build_object('tournamentId', p_tournament_id, 'pairingId', v_pairing_id));
    insert into public.caissa_online_arena_events(tournament_id, event_id, event_type, payload)
    values (p_tournament_id, 'arena-pairing:' || v_pairing_id::text, 'pairing.active',
      pg_catalog.jsonb_build_object('pairingId', v_pairing_id, 'gameId', v_game_id, 'board', v_board));
    update public.caissa_online_tournaments
    set version = version + 1, updated_at = pg_catalog.clock_timestamp()
    where id = p_tournament_id;
    v_created := v_created + 1;
  end loop;
  return v_created;
end;
$$;

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
  select * into v_game from public.caissa_online_games where id = p_game_id for update;
  if v_game.id is null or v_game.status <> 'completed' or v_game.result is null then return false; end if;
  select * into v_link from public.caissa_online_tournament_games
    where game_id = p_game_id for update;
  if v_link.game_id is null or v_link.scored_at is not null then return false; end if;
  select * into v_tournament from public.caissa_online_tournaments
    where id = v_link.tournament_id for update;
  if v_tournament.scoring_contract <> 'arena-s001-2-1-0' then
    raise exception 'CAISSA_ONLINE_ARENA_SCORING_CONTRACT';
  end if;

  v_white_points := case v_game.result when '1-0' then 2 when '1/2-1/2' then 1 else 0 end;
  v_black_points := case v_game.result when '0-1' then 2 when '1/2-1/2' then 1 else 0 end;

  update public.caissa_online_tournament_participants participant
  set score = score + case when participant.user_id = v_game.white_user_id then v_white_points else v_black_points end,
      games_played = games_played + 1,
      wins = wins + case
        when participant.user_id = v_game.white_user_id and v_white_points = 2 then 1
        when participant.user_id = v_game.black_user_id and v_black_points = 2 then 1 else 0 end,
      draws = draws + case when v_game.result = '1/2-1/2' then 1 else 0 end,
      losses = losses + case
        when participant.user_id = v_game.white_user_id and v_white_points = 0 then 1
        when participant.user_id = v_game.black_user_id and v_black_points = 0 then 1 else 0 end,
      state = case when participant.state = 'withdrawn' then 'withdrawn'
        when v_tournament.status = 'active' and v_tournament.ends_at > pg_catalog.clock_timestamp()
          and exists (select 1 from public.caissa_online_presence presence
            where presence.user_id = participant.user_id and presence.expires_at > pg_catalog.clock_timestamp())
          then 'waiting'
        when v_tournament.status = 'active' then 'disconnected'
        else 'registered' end,
      waiting_since = case when participant.state <> 'withdrawn'
          and v_tournament.status = 'active' and v_tournament.ends_at > pg_catalog.clock_timestamp()
        then pg_catalog.clock_timestamp() else null end,
      disconnected_at = case when participant.state <> 'withdrawn'
          and v_tournament.status = 'active'
          and not exists (select 1 from public.caissa_online_presence presence
            where presence.user_id = participant.user_id and presence.expires_at > pg_catalog.clock_timestamp())
        then pg_catalog.clock_timestamp() else null end,
      updated_at = pg_catalog.clock_timestamp()
  where participant.tournament_id = v_link.tournament_id
    and participant.user_id in (v_game.white_user_id, v_game.black_user_id);

  update public.caissa_online_tournament_games
  set scored_at = pg_catalog.clock_timestamp(), white_points = v_white_points, black_points = v_black_points
  where tournament_id = v_link.tournament_id and game_id = p_game_id and scored_at is null;
  update public.caissa_online_arena_pairings
  set state = 'finished', finished_at = pg_catalog.clock_timestamp(), updated_at = pg_catalog.clock_timestamp()
  where id = v_link.pairing_id and state <> 'finished';
  update public.caissa_online_tournaments
  set version = version + 1, updated_at = pg_catalog.clock_timestamp()
  where id = v_link.tournament_id;
  insert into public.caissa_online_arena_events(tournament_id, event_id, event_type, payload)
  values (v_link.tournament_id, 'arena-result:' || p_game_id::text, 'game.scored',
    pg_catalog.jsonb_build_object('gameId', p_game_id, 'result', v_game.result,
      'whitePoints', v_white_points, 'blackPoints', v_black_points))
  on conflict (tournament_id, event_id) do nothing;
  return true;
end;
$$;

create or replace function caissa_online_private.arena_reconcile(p_tournament_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_tournament public.caissa_online_tournaments%rowtype;
  v_game_id uuid;
  v_count integer;
  v_changed boolean := false;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_tournament_id::text, 701101));
  select * into v_tournament from public.caissa_online_tournaments
    where id = p_tournament_id for update;
  if v_tournament.id is null or v_tournament.status in ('completed', 'cancelled', 'draft') then return; end if;

  if v_tournament.status = 'scheduled'
    and coalesce(v_tournament.registration_opens_at, v_tournament.starts_at) <= pg_catalog.clock_timestamp() then
    update public.caissa_online_tournaments
    set status = 'registration_open', version = version + 1, updated_at = pg_catalog.clock_timestamp()
    where id = p_tournament_id;
    v_tournament.status := 'registration_open';
  end if;

  if v_tournament.status = 'registration_open' and v_tournament.starts_at <= pg_catalog.clock_timestamp() then
    select count(*) into v_count from public.caissa_online_tournament_participants
    where tournament_id = p_tournament_id and state <> 'withdrawn';
    if v_count < v_tournament.min_players then
      update public.caissa_online_tournaments
      set status = 'cancelled', cancelled_at = pg_catalog.clock_timestamp(),
        version = version + 1, updated_at = pg_catalog.clock_timestamp()
      where id = p_tournament_id;
      insert into public.caissa_online_arena_events(tournament_id, event_id, event_type, payload)
      values (p_tournament_id, 'arena-cancel:' || p_tournament_id::text, 'tournament.cancelled',
        pg_catalog.jsonb_build_object('reason', 'minimum-not-met', 'participants', v_count))
      on conflict (tournament_id, event_id) do nothing;
      return;
    end if;
    update public.caissa_online_tournaments
    set status = 'active', version = version + 1, updated_at = pg_catalog.clock_timestamp()
    where id = p_tournament_id;
    update public.caissa_online_tournament_participants
    set state = case when state = 'withdrawn' then state else 'waiting' end,
      waiting_since = case when state = 'withdrawn' then null else pg_catalog.clock_timestamp() end,
      updated_at = pg_catalog.clock_timestamp()
    where tournament_id = p_tournament_id;
    v_tournament.status := 'active';
  end if;

  if v_tournament.status = 'active' and v_tournament.ends_at <= pg_catalog.clock_timestamp() then
    update public.caissa_online_tournaments
    set status = 'finishing', version = version + 1, updated_at = pg_catalog.clock_timestamp()
    where id = p_tournament_id;
    update public.caissa_online_tournament_participants
    set state = case when state in ('waiting', 'disconnected') then 'registered' else state end,
      waiting_since = null, updated_at = pg_catalog.clock_timestamp()
    where tournament_id = p_tournament_id;
    v_tournament.status := 'finishing';
  end if;

  for v_game_id in
    select game.id
    from public.caissa_online_tournament_games link
    join public.caissa_online_games game on game.id = link.game_id
    where link.tournament_id = p_tournament_id
      and link.scored_at is null and game.status = 'completed' and game.result is not null
    order by game.completed_at, game.id
  loop
    v_changed := caissa_online_private.arena_score_game(v_game_id) or v_changed;
  end loop;

  if v_tournament.status = 'active' then
    update public.caissa_online_tournament_participants participant
    set state = 'disconnected', waiting_since = null,
      disconnected_at = coalesce(participant.disconnected_at, pg_catalog.clock_timestamp()),
      updated_at = pg_catalog.clock_timestamp()
    where participant.tournament_id = p_tournament_id
      and participant.state = 'waiting'
      and not exists (
        select 1 from public.caissa_online_presence presence
        where presence.user_id = participant.user_id
          and presence.expires_at > pg_catalog.clock_timestamp()
      );
    perform caissa_online_private.arena_pair_waiters(p_tournament_id);
  elsif v_tournament.status = 'finishing' and not exists (
    select 1 from public.caissa_online_tournament_games link
    join public.caissa_online_games game on game.id = link.game_id
    where link.tournament_id = p_tournament_id and game.status = 'active'
  ) then
    with ranked as (
      select participant.user_id,
        row_number() over (order by participant.score desc, participant.wins desc,
          participant.draws desc, participant.joined_at, participant.user_id) as final_rank
      from public.caissa_online_tournament_participants participant
      where participant.tournament_id = p_tournament_id
    )
    update public.caissa_online_tournament_participants participant
    set rank = ranked.final_rank, updated_at = pg_catalog.clock_timestamp()
    from ranked
    where participant.tournament_id = p_tournament_id and participant.user_id = ranked.user_id;
    update public.caissa_online_tournaments
    set status = 'completed', completed_at = pg_catalog.clock_timestamp(),
      version = version + 1, updated_at = pg_catalog.clock_timestamp()
    where id = p_tournament_id;
    insert into public.caissa_online_arena_events(tournament_id, event_id, event_type)
    values (p_tournament_id, 'arena-complete:' || p_tournament_id::text, 'tournament.completed')
    on conflict (tournament_id, event_id) do nothing;
  end if;
end;
$$;

create or replace function caissa_online_private.arena_payload(p_clerk_id text, p_tournament_id uuid)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_current_id uuid;
  v_directory jsonb;
  v_current jsonb;
begin
  select id into v_user_id from public.users where clerk_id = p_clerk_id;
  select coalesce(p_tournament_id, (
    select participant.tournament_id
    from public.caissa_online_tournament_participants participant
    join public.caissa_online_tournaments tournament on tournament.id = participant.tournament_id
    where participant.user_id = v_user_id
      and tournament.configuration->>'betaSeason' = 'S001'
    order by (tournament.status in ('active', 'finishing')) desc,
      (participant.state <> 'withdrawn') desc, tournament.starts_at desc
    limit 1
  )) into v_current_id;

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id', tournament.id,
    'name', tournament.name,
    'format', tournament.format,
    'status', tournament.status,
    'pool', tournament.pool,
    'baseMs', tournament.base_ms,
    'incrementMs', tournament.increment_ms,
    'rated', tournament.rated,
    'startsAt', tournament.starts_at,
    'endsAt', tournament.ends_at,
    'durationMinutes', tournament.duration_minutes,
    'lateJoin', tournament.late_join,
    'capacity', tournament.capacity,
    'participantCount', (select count(*) from public.caissa_online_tournament_participants p
      where p.tournament_id = tournament.id and p.state <> 'withdrawn'),
    'joined', exists(select 1 from public.caissa_online_tournament_participants p
      where p.tournament_id = tournament.id and p.user_id = v_user_id and p.state <> 'withdrawn'),
    'myState', (select p.state from public.caissa_online_tournament_participants p
      where p.tournament_id = tournament.id and p.user_id = v_user_id),
    'version', tournament.version
  ) order by
    case tournament.status when 'active' then 0 when 'registration_open' then 1
      when 'scheduled' then 2 when 'finishing' then 3 when 'completed' then 4 else 5 end,
    tournament.starts_at), '[]'::jsonb)
  into v_directory
  from public.caissa_online_tournaments tournament
  where tournament.configuration->>'betaSeason' = 'S001'
    and tournament.visibility = 'private';

  if v_current_id is not null then
    select pg_catalog.jsonb_build_object(
      'id', tournament.id,
      'name', tournament.name,
      'format', tournament.format,
      'status', tournament.status,
      'pool', tournament.pool,
      'baseMs', tournament.base_ms,
      'incrementMs', tournament.increment_ms,
      'rated', tournament.rated,
      'startsAt', tournament.starts_at,
      'endsAt', tournament.ends_at,
      'registrationOpensAt', tournament.registration_opens_at,
      'registrationClosesAt', tournament.registration_closes_at,
      'durationMinutes', tournament.duration_minutes,
      'lateJoin', tournament.late_join,
      'capacity', tournament.capacity,
      'minPlayers', tournament.min_players,
      'participantCount', (select count(*) from public.caissa_online_tournament_participants p
        where p.tournament_id = tournament.id and p.state <> 'withdrawn'),
      'version', tournament.version,
      'scoringContract', tournament.scoring_contract,
      'finishingPolicy', tournament.finishing_policy,
      'myState', (select p.state from public.caissa_online_tournament_participants p
        where p.tournament_id = tournament.id and p.user_id = v_user_id),
      'standings', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
          'rank', standing.position,
          'userId', standing.user_id,
          'clerkId', standing.clerk_id,
          'displayName', standing.display_name,
          'rating', standing.rating_at_join,
          'gamesPlayed', standing.games_played,
          'wins', standing.wins,
          'draws', standing.draws,
          'losses', standing.losses,
          'points', standing.score,
          'state', standing.state,
          'isCurrentPlayer', standing.user_id = v_user_id
        ) order by standing.position)
        from (select participant.*,
          row_number() over (order by participant.score desc, participant.wins desc,
            participant.draws desc, participant.joined_at, participant.user_id) position
          from public.caissa_online_tournament_participants participant
          where participant.tournament_id = tournament.id) standing), '[]'::jsonb),
      'games', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
          'gameId', game.id,
          'status', game.status,
          'result', game.result,
          'termination', game.termination,
          'whiteUserId', game.white_user_id,
          'blackUserId', game.black_user_id,
          'whiteClerkId', game.white_clerk_id,
          'blackClerkId', game.black_clerk_id,
          'whiteDisplayName', game.white_display_name,
          'blackDisplayName', game.black_display_name,
          'boardNumber', link.board_number,
          'pairingState', pairing.state,
          'createdAt', game.created_at,
          'completedAt', game.completed_at
        ) order by game.created_at desc)
        from public.caissa_online_tournament_games link
        join public.caissa_online_games game on game.id = link.game_id
        left join public.caissa_online_arena_pairings pairing on pairing.id = link.pairing_id
        where link.tournament_id = tournament.id
          and v_user_id in (game.white_user_id, game.black_user_id)), '[]'::jsonb),
      'nextPairing', (select pg_catalog.jsonb_build_object(
          'id', pairing.id, 'gameId', pairing.game_id, 'state', pairing.state,
          'color', case when pairing.white_user_id = v_user_id then 'white' else 'black' end,
          'opponentClerkId', case when pairing.white_user_id = v_user_id
            then pairing.black_clerk_id else pairing.white_clerk_id end,
          'opponentDisplayName', case when pairing.white_user_id = v_user_id
            then black_participant.display_name else white_participant.display_name end,
          'assignedAt', pairing.assigned_at
        )
        from public.caissa_online_arena_pairings pairing
        join public.caissa_online_tournament_participants white_participant
          on white_participant.tournament_id = pairing.tournament_id
          and white_participant.user_id = pairing.white_user_id
        join public.caissa_online_tournament_participants black_participant
          on black_participant.tournament_id = pairing.tournament_id
          and black_participant.user_id = pairing.black_user_id
        where pairing.tournament_id = tournament.id
          and v_user_id in (pairing.white_user_id, pairing.black_user_id)
          and pairing.state in ('assigned', 'ready', 'active')
        order by pairing.assigned_at desc limit 1)
    ) into v_current
    from public.caissa_online_tournaments tournament
    where tournament.id = v_current_id and tournament.configuration->>'betaSeason' = 'S001';
  end if;
  return pg_catalog.jsonb_build_object('tournaments', v_directory, 'current', v_current);
end;
$$;

create or replace function public.caissa_online_arena_sync(p_clerk_id text, p_tournament_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_tournament_id uuid;
begin
  select id into v_user_id from public.users where clerk_id = p_clerk_id;
  if v_user_id is null then raise exception 'CAISSA_ONLINE_IDENTITY_NOT_FOUND'; end if;
  if p_tournament_id is not null and not exists (
    select 1 from public.caissa_online_tournaments
    where id = p_tournament_id and configuration->>'betaSeason' = 'S001'
  ) then raise exception 'CAISSA_ONLINE_ARENA_NOT_FOUND'; end if;

  update public.caissa_online_tournament_participants participant
  set state = 'waiting', waiting_since = pg_catalog.clock_timestamp(),
    disconnected_at = null, updated_at = pg_catalog.clock_timestamp()
  from public.caissa_online_tournaments tournament
  where participant.tournament_id = tournament.id and participant.user_id = v_user_id
    and participant.state = 'disconnected' and tournament.status = 'active'
    and tournament.ends_at > pg_catalog.clock_timestamp();

  for v_tournament_id in
    select tournament.id from public.caissa_online_tournaments tournament
    where tournament.configuration->>'betaSeason' = 'S001'
      and tournament.status in ('scheduled', 'registration_open', 'active', 'finishing')
    order by tournament.starts_at, tournament.id
  loop
    perform caissa_online_private.arena_reconcile(v_tournament_id);
  end loop;
  return caissa_online_private.arena_payload(p_clerk_id, p_tournament_id);
end;
$$;

create or replace function public.caissa_online_arena_create(
  p_clerk_id text,
  p_event_id text,
  p_name text,
  p_starts_at timestamptz,
  p_duration_minutes integer,
  p_pool text,
  p_base_ms integer,
  p_increment_ms integer
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_tournament_id uuid;
  v_existing uuid;
begin
  select id into v_user_id from public.users where clerk_id = p_clerk_id and role <> 'online_guest';
  if v_user_id is null then raise exception 'CAISSA_ONLINE_IDENTITY_NOT_FOUND'; end if;
  select id into v_existing from public.caissa_online_tournaments where creation_event_id = p_event_id;
  if v_existing is not null then return public.caissa_online_arena_sync(p_clerk_id, v_existing); end if;
  if p_name is null or pg_catalog.char_length(p_name) not between 3 and 80
    or p_duration_minutes not between 5 and 180
    or p_pool not in ('bullet', 'blitz', 'rapid')
    or (p_base_ms, p_increment_ms) not in (
      (60000,0), (60000,1000), (180000,0), (180000,2000),
      (300000,0), (300000,5000), (600000,0), (600000,5000)
    ) or p_starts_at < pg_catalog.clock_timestamp() - interval '30 seconds'
    or p_starts_at > pg_catalog.clock_timestamp() + interval '31 days' then
    raise exception 'CAISSA_ONLINE_ARENA_INVALID';
  end if;
  insert into public.caissa_online_tournaments(
    owner_user_id, name, source, format, status, pool, base_ms, increment_ms,
    rated, visibility, starts_at, ends_at, registration_opens_at, registration_closes_at,
    duration_minutes, late_join, capacity, min_players, configuration,
    creation_event_id, created_by_clerk_id
  ) values (
    v_user_id, p_name, 'official', 'arena',
    case when p_starts_at <= pg_catalog.clock_timestamp() then 'registration_open' else 'scheduled' end,
    p_pool, p_base_ms, p_increment_ms, false, 'private', p_starts_at,
    p_starts_at + p_duration_minutes * interval '1 minute', pg_catalog.clock_timestamp(),
    p_starts_at + p_duration_minutes * interval '1 minute', p_duration_minutes,
    true, 4, 4,
    pg_catalog.jsonb_build_object('betaSeason', 'S001', 'publicDirectory', false,
      'chat', false, 'finishingPolicy', 'finish_active_games'),
    p_event_id, p_clerk_id
  ) returning id into v_tournament_id;
  insert into public.caissa_online_arena_events(tournament_id, event_id, event_type, actor_user_id, payload)
  values (v_tournament_id, p_event_id, 'tournament.created', v_user_id,
    pg_catalog.jsonb_build_object('startsAt', p_starts_at, 'durationMinutes', p_duration_minutes));
  return public.caissa_online_arena_sync(p_clerk_id, v_tournament_id);
end;
$$;

create or replace function public.caissa_online_arena_join(
  p_clerk_id text, p_tournament_id uuid, p_event_id text
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_profile public.caissa_online_profiles%rowtype;
  v_tournament public.caissa_online_tournaments%rowtype;
  v_rating integer;
begin
  select id into v_user_id from public.users where clerk_id = p_clerk_id and role <> 'online_guest';
  if v_user_id is null then raise exception 'CAISSA_ONLINE_IDENTITY_NOT_FOUND'; end if;
  if exists(select 1 from public.caissa_online_arena_events
    where tournament_id = p_tournament_id and event_id = p_event_id) then
    return public.caissa_online_arena_sync(p_clerk_id, p_tournament_id);
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_tournament_id::text, 701101));
  select * into v_tournament from public.caissa_online_tournaments
    where id = p_tournament_id for update;
  if v_tournament.id is null or v_tournament.configuration->>'betaSeason' <> 'S001' then
    raise exception 'CAISSA_ONLINE_ARENA_NOT_FOUND';
  end if;
  perform caissa_online_private.arena_reconcile(p_tournament_id);
  select * into v_tournament from public.caissa_online_tournaments where id = p_tournament_id for update;
  if v_tournament.status not in ('registration_open', 'active')
    or v_tournament.registration_closes_at <= pg_catalog.clock_timestamp()
    or (v_tournament.status = 'active' and not v_tournament.late_join) then
    raise exception 'CAISSA_ONLINE_ARENA_REGISTRATION_CLOSED';
  end if;
  if not exists(select 1 from public.caissa_online_tournament_participants
      where tournament_id = p_tournament_id and user_id = v_user_id and state <> 'withdrawn')
    and (select count(*) from public.caissa_online_tournament_participants
      where tournament_id = p_tournament_id and state <> 'withdrawn') >= coalesce(v_tournament.capacity, 10000) then
    raise exception 'CAISSA_ONLINE_ARENA_FULL';
  end if;
  select * into v_profile from public.caissa_online_profiles where user_id = v_user_id;
  if v_profile.user_id is null then raise exception 'CAISSA_ONLINE_PROFILE_REQUIRED'; end if;
  select coalesce(rating, 1500) into v_rating from public.caissa_online_ratings
    where user_id = v_user_id and pool = v_tournament.pool;
  v_rating := coalesce(v_rating, 1500);
  insert into public.caissa_online_tournament_participants(
    tournament_id, user_id, clerk_id, display_name, rating_at_join, state, waiting_since
  ) values (
    p_tournament_id, v_user_id, p_clerk_id, v_profile.display_name, v_rating,
    case when v_tournament.status = 'active' then 'waiting' else 'registered' end,
    case when v_tournament.status = 'active' then pg_catalog.clock_timestamp() else null end
  ) on conflict (tournament_id, user_id) do update
    set clerk_id = excluded.clerk_id, display_name = excluded.display_name,
      rating_at_join = excluded.rating_at_join,
      state = case when v_tournament.status = 'active' then 'waiting' else 'registered' end,
      waiting_since = case when v_tournament.status = 'active' then pg_catalog.clock_timestamp() else null end,
      withdrawn_at = null, disconnected_at = null, updated_at = pg_catalog.clock_timestamp()
    where public.caissa_online_tournament_participants.state = 'withdrawn';
  update public.caissa_online_matchmaking_tickets set state = 'cancelled', updated_at = pg_catalog.clock_timestamp()
    where user_id = v_user_id and state = 'queued';
  update public.caissa_online_tournaments set version = version + 1, updated_at = pg_catalog.clock_timestamp()
    where id = p_tournament_id;
  insert into public.caissa_online_arena_events(tournament_id, event_id, event_type, actor_user_id)
  values (p_tournament_id, p_event_id, 'participant.joined', v_user_id)
  on conflict (tournament_id, event_id) do nothing;
  perform caissa_online_private.arena_reconcile(p_tournament_id);
  return caissa_online_private.arena_payload(p_clerk_id, p_tournament_id);
end;
$$;

create or replace function public.caissa_online_arena_withdraw(
  p_clerk_id text, p_tournament_id uuid, p_event_id text
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare v_user_id uuid;
begin
  select id into v_user_id from public.users where clerk_id = p_clerk_id and role <> 'online_guest';
  if v_user_id is null then raise exception 'CAISSA_ONLINE_IDENTITY_NOT_FOUND'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_tournament_id::text, 701101));
  if not exists(select 1 from public.caissa_online_tournaments
    where id = p_tournament_id and configuration->>'betaSeason' = 'S001') then
    raise exception 'CAISSA_ONLINE_ARENA_NOT_FOUND';
  end if;
  if exists(select 1 from public.caissa_online_arena_events
    where tournament_id = p_tournament_id and event_id = p_event_id) then
    return public.caissa_online_arena_sync(p_clerk_id, p_tournament_id);
  end if;
  update public.caissa_online_tournament_participants
  set state = 'withdrawn', waiting_since = null, withdrawn_at = pg_catalog.clock_timestamp(),
    updated_at = pg_catalog.clock_timestamp()
  where tournament_id = p_tournament_id and user_id = v_user_id and state <> 'withdrawn';
  update public.caissa_online_arena_pairings
  set state = 'expired', finished_at = pg_catalog.clock_timestamp(), updated_at = pg_catalog.clock_timestamp()
  where tournament_id = p_tournament_id and game_id is null
    and state in ('waiting', 'assigned', 'ready')
    and v_user_id in (white_user_id, black_user_id);
  update public.caissa_online_tournaments set version = version + 1, updated_at = pg_catalog.clock_timestamp()
    where id = p_tournament_id;
  insert into public.caissa_online_arena_events(tournament_id, event_id, event_type, actor_user_id)
  values (p_tournament_id, p_event_id, 'participant.withdrawn', v_user_id)
  on conflict (tournament_id, event_id) do nothing;
  perform caissa_online_private.arena_reconcile(p_tournament_id);
  return caissa_online_private.arena_payload(p_clerk_id, p_tournament_id);
end;
$$;

create or replace function caissa_online_private.can_read_current_tournament_topic()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.caissa_online_tournament_participants participant
    join public.users account on account.id = participant.user_id
    where (select realtime.topic()) = 'online-tournament:' || participant.tournament_id::text
      and account.clerk_id = ((select auth.jwt())->>'sub')
  );
$$;

create or replace function caissa_online_private.broadcast_tournament_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tournament_id uuid;
  v_version integer;
begin
  if tg_table_name = 'caissa_online_tournaments' then
    v_tournament_id := coalesce(new.id, old.id);
    v_version := coalesce(new.version, old.version);
  else
    v_tournament_id := coalesce(new.tournament_id, old.tournament_id);
    select version into v_version from public.caissa_online_tournaments where id = v_tournament_id;
  end if;
  perform realtime.send(
    pg_catalog.jsonb_build_object('tournamentId', v_tournament_id::text,
      'version', v_version, 'eventType', 'tournament.snapshot'),
    tg_op, 'online-tournament:' || v_tournament_id::text, true
  );
  return null;
end;
$$;

create trigger caissa_online_arena_tournament_broadcast
after insert or update on public.caissa_online_tournaments
for each row execute function caissa_online_private.broadcast_tournament_change();
create trigger caissa_online_arena_participant_broadcast
after insert or update on public.caissa_online_tournament_participants
for each row execute function caissa_online_private.broadcast_tournament_change();
create trigger caissa_online_arena_pairing_broadcast
after insert or update on public.caissa_online_arena_pairings
for each row execute function caissa_online_private.broadcast_tournament_change();

create policy caissa_online_tournament_broadcast_read
on realtime.messages
for select
to authenticated
using (
  realtime.messages.extension = 'broadcast'
  and caissa_online_private.can_read_current_tournament_topic()
);

revoke all on function caissa_online_private.arena_pair_waiters(uuid) from public, anon, authenticated;
revoke all on function caissa_online_private.arena_score_game(uuid) from public, anon, authenticated;
revoke all on function caissa_online_private.arena_reconcile(uuid) from public, anon, authenticated;
revoke all on function caissa_online_private.arena_payload(text, uuid) from public, anon, authenticated;
revoke all on function caissa_online_private.can_read_current_tournament_topic() from public, anon, authenticated;
revoke all on function caissa_online_private.broadcast_tournament_change() from public, anon, authenticated;
grant execute on function caissa_online_private.arena_pair_waiters(uuid) to service_role;
grant execute on function caissa_online_private.arena_score_game(uuid) to service_role;
grant execute on function caissa_online_private.arena_reconcile(uuid) to service_role;
grant execute on function caissa_online_private.arena_payload(text, uuid) to service_role;
grant usage on schema caissa_online_private to authenticated;
grant execute on function caissa_online_private.can_read_current_tournament_topic() to authenticated;

revoke all on function public.caissa_online_arena_sync(text, uuid) from public, anon, authenticated;
revoke all on function public.caissa_online_arena_create(text, text, text, timestamptz, integer, text, integer, integer) from public, anon, authenticated;
revoke all on function public.caissa_online_arena_join(text, uuid, text) from public, anon, authenticated;
revoke all on function public.caissa_online_arena_withdraw(text, uuid, text) from public, anon, authenticated;
grant execute on function public.caissa_online_arena_sync(text, uuid) to service_role;
grant execute on function public.caissa_online_arena_create(text, text, text, timestamptz, integer, text, integer, integer) to service_role;
grant execute on function public.caissa_online_arena_join(text, uuid, text) to service_role;
grant execute on function public.caissa_online_arena_withdraw(text, uuid, text) to service_role;

comment on function public.caissa_online_arena_sync(text, uuid) is
  'Service-role-only Arena lifecycle, score, pairing, recovery, and private snapshot transaction.';
comment on table public.caissa_online_arena_pairings is
  'Durable S001 pairing authority. Browser clients never write or select this table directly.';
comment on column public.caissa_online_tournament_games.scored_at is
  'Exact-once guard for the Arena S001 2/1/0 scoring contract.';

commit;
