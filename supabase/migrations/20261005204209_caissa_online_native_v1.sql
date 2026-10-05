-- CAISSA Online native Season 1 foundation.
-- This migration is intentionally dormant until CAISSA_ONLINE_ROLLOUT is enabled.

create schema if not exists caissa_online_private;
revoke all on schema caissa_online_private from public, anon, authenticated;

create table public.caissa_online_profiles (
  user_id uuid primary key references public.users(id) on delete cascade,
  clerk_id text not null unique,
  display_name text not null check (char_length(display_name) between 1 and 40),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);

create table public.caissa_online_ratings (
  user_id uuid not null references public.users(id) on delete cascade,
  pool text not null check (pool in ('bullet', 'blitz', 'rapid', 'daily')),
  rating integer not null default 1500 check (rating between 100 and 4000),
  games integer not null default 0 check (games >= 0),
  wins integer not null default 0 check (wins >= 0),
  draws integer not null default 0 check (draws >= 0),
  losses integer not null default 0 check (losses >= 0),
  updated_at timestamptz not null default clock_timestamp(),
  primary key (user_id, pool)
);

create table public.caissa_online_matchmaking_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  clerk_id text not null,
  pool text not null check (pool in ('bullet', 'blitz', 'rapid', 'daily')),
  base_ms integer not null check (base_ms between 10000 and 86400000),
  increment_ms integer not null check (increment_ms between 0 and 600000),
  rated boolean not null default false,
  rating integer not null check (rating between 100 and 4000),
  state text not null default 'queued' check (state in ('queued', 'matched', 'cancelled', 'expired')),
  matched_game_id uuid,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null default (clock_timestamp() + interval '15 minutes')
);

create unique index caissa_online_one_queued_ticket_per_user
  on public.caissa_online_matchmaking_tickets(user_id) where state = 'queued';
create index caissa_online_matchmaking_pool_lookup
  on public.caissa_online_matchmaking_tickets(pool, rated, base_ms, increment_ms, created_at)
  where state = 'queued';

create table public.caissa_online_games (
  id uuid primary key default gen_random_uuid(),
  protocol_version text not null default '1.0.0',
  status text not null default 'active' check (status in ('active', 'completed', 'aborted')),
  pool text not null check (pool in ('bullet', 'blitz', 'rapid', 'daily')),
  rated boolean not null default false,
  base_ms integer not null check (base_ms between 10000 and 86400000),
  increment_ms integer not null check (increment_ms between 0 and 600000),
  white_user_id uuid not null references public.users(id),
  black_user_id uuid not null references public.users(id),
  white_clerk_id text not null,
  black_clerk_id text not null,
  white_display_name text not null,
  black_display_name text not null,
  initial_fen text not null default 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  fen text not null default 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  moves jsonb not null default '[]'::jsonb check (
    jsonb_typeof(moves) = 'array' and jsonb_array_length(moves) <= 6000
  ),
  pgn text not null default '' check (octet_length(pgn) <= 524288),
  ply integer not null default 0 check (ply between 0 and 6000),
  turn text not null default 'white' check (turn in ('white', 'black')),
  version integer not null default 1 check (version >= 1),
  white_time_ms integer not null check (white_time_ms >= 0),
  black_time_ms integer not null check (black_time_ms >= 0),
  white_can_mate boolean not null default true,
  black_can_mate boolean not null default true,
  clock_started_at timestamptz,
  draw_offer_by text,
  result text check (result is null or result in ('1-0', '0-1', '1/2-1/2')),
  termination text check (termination is null or termination in (
    'checkmate', 'resignation', 'timeout', 'draw', 'stalemate',
    'repetition', 'insufficient-material', 'agreement', 'aborted'
  )),
  white_rating_before integer,
  white_rating_after integer,
  white_rating_delta integer,
  black_rating_before integer,
  black_rating_after integer,
  black_rating_delta integer,
  rating_processed_at timestamptz,
  tournament_id uuid,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  completed_at timestamptz,
  check (white_user_id <> black_user_id),
  check (white_clerk_id <> black_clerk_id)
);

alter table public.caissa_online_matchmaking_tickets
  add constraint caissa_online_ticket_game_fk foreign key (matched_game_id)
  references public.caissa_online_games(id) on delete set null;

create index caissa_online_games_white_recent on public.caissa_online_games(white_user_id, created_at desc);
create index caissa_online_games_black_recent on public.caissa_online_games(black_user_id, created_at desc);
create index caissa_online_games_active on public.caissa_online_games(status, updated_at desc);

create table public.caissa_online_game_events (
  game_id uuid not null references public.caissa_online_games(id) on delete cascade,
  sequence integer not null,
  event_id text not null check (char_length(event_id) between 12 and 120),
  event_type text not null,
  actor_user_id uuid references public.users(id),
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  server_timestamp timestamptz not null default clock_timestamp(),
  primary key (game_id, event_id)
);
create index caissa_online_game_events_order on public.caissa_online_game_events(game_id, sequence, server_timestamp);

create table public.caissa_online_presence (
  user_id uuid primary key references public.users(id) on delete cascade,
  clerk_id text not null unique,
  display_name text not null check (char_length(display_name) between 1 and 40),
  status text not null default 'online' check (status in ('online', 'playing', 'away', 'offline')),
  active_game_id uuid references public.caissa_online_games(id) on delete set null,
  last_seen_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null default (clock_timestamp() + interval '45 seconds')
);
create index caissa_online_presence_live on public.caissa_online_presence(expires_at desc);

create table public.caissa_online_rate_limits (
  clerk_id text not null,
  bucket text not null check (bucket ~ '^[a-z][a-z0-9-]{0,39}$'),
  window_started_at timestamptz not null default clock_timestamp(),
  request_count integer not null default 0 check (request_count between 0 and 10000),
  updated_at timestamptz not null default clock_timestamp(),
  primary key (clerk_id, bucket)
);

create table public.caissa_online_challenges (
  id uuid primary key default gen_random_uuid(),
  challenger_user_id uuid not null references public.users(id) on delete cascade,
  challenged_user_id uuid not null references public.users(id) on delete cascade,
  pool text not null check (pool in ('bullet', 'blitz', 'rapid', 'daily')),
  base_ms integer not null,
  increment_ms integer not null,
  rated boolean not null default false,
  state text not null default 'pending' check (state in ('pending', 'accepted', 'declined', 'expired', 'cancelled')),
  game_id uuid references public.caissa_online_games(id) on delete set null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null default (clock_timestamp() + interval '2 minutes'),
  check (challenger_user_id <> challenged_user_id)
);
create unique index caissa_online_one_pending_challenge_pair
  on public.caissa_online_challenges(challenger_user_id, challenged_user_id)
  where state = 'pending';

create table public.caissa_online_tournaments (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid references public.users(id) on delete set null,
  name text not null check (char_length(name) between 3 and 80),
  source text not null default 'community' check (source in ('official', 'community')),
  format text not null check (format in ('arena', 'swiss', 'round-robin')),
  status text not null default 'upcoming' check (status in ('upcoming', 'live', 'completed', 'cancelled')),
  pool text not null check (pool in ('bullet', 'blitz', 'rapid', 'daily')),
  base_ms integer not null,
  increment_ms integer not null,
  rated boolean not null default false,
  visibility text not null default 'public' check (visibility in ('public', 'private')),
  starts_at timestamptz not null,
  ends_at timestamptz,
  rounds integer,
  duration_minutes integer,
  late_join boolean not null default true,
  capacity integer check (capacity is null or capacity between 2 and 10000),
  configuration jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default clock_timestamp()
);

create table public.caissa_online_tournament_participants (
  tournament_id uuid not null references public.caissa_online_tournaments(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  score numeric(8,2) not null default 0,
  tie_break numeric(12,4) not null default 0,
  rank integer,
  joined_at timestamptz not null default clock_timestamp(),
  primary key (tournament_id, user_id)
);

create table public.caissa_online_tournament_games (
  tournament_id uuid not null references public.caissa_online_tournaments(id) on delete cascade,
  game_id uuid not null references public.caissa_online_games(id) on delete cascade,
  round integer,
  board_number integer,
  primary key (tournament_id, game_id)
);

alter table public.caissa_online_games
  add constraint caissa_online_game_tournament_fk foreign key (tournament_id)
  references public.caissa_online_tournaments(id) on delete set null;

alter table public.caissa_online_profiles enable row level security;
alter table public.caissa_online_ratings enable row level security;
alter table public.caissa_online_matchmaking_tickets enable row level security;
alter table public.caissa_online_games enable row level security;
alter table public.caissa_online_game_events enable row level security;
alter table public.caissa_online_presence enable row level security;
alter table public.caissa_online_rate_limits enable row level security;
alter table public.caissa_online_challenges enable row level security;
alter table public.caissa_online_tournaments enable row level security;
alter table public.caissa_online_tournament_participants enable row level security;
alter table public.caissa_online_tournament_games enable row level security;

revoke all on public.caissa_online_profiles from anon, authenticated;
revoke all on public.caissa_online_ratings from anon, authenticated;
revoke all on public.caissa_online_matchmaking_tickets from anon, authenticated;
revoke all on public.caissa_online_games from anon, authenticated;
revoke all on public.caissa_online_game_events from anon, authenticated;
revoke all on public.caissa_online_presence from anon, authenticated;
revoke all on public.caissa_online_rate_limits from anon, authenticated;
revoke all on public.caissa_online_challenges from anon, authenticated;
revoke all on public.caissa_online_tournaments from anon, authenticated;
revoke all on public.caissa_online_tournament_participants from anon, authenticated;
revoke all on public.caissa_online_tournament_games from anon, authenticated;

grant select on public.caissa_online_games to authenticated;
create policy caissa_online_participant_game_read on public.caissa_online_games
  for select to authenticated
  using ((select auth.jwt()->>'sub') in (white_clerk_id, black_clerk_id));

grant all on public.caissa_online_profiles to service_role;
grant all on public.caissa_online_ratings to service_role;
grant all on public.caissa_online_matchmaking_tickets to service_role;
grant all on public.caissa_online_games to service_role;
grant all on public.caissa_online_game_events to service_role;
grant all on public.caissa_online_presence to service_role;
grant all on public.caissa_online_rate_limits to service_role;
grant all on public.caissa_online_challenges to service_role;
grant all on public.caissa_online_tournaments to service_role;
grant all on public.caissa_online_tournament_participants to service_role;
grant all on public.caissa_online_tournament_games to service_role;

create or replace function caissa_online_private.rating_delta(
  p_rating integer,
  p_opponent_rating integer,
  p_games integer,
  p_score numeric
) returns integer
language sql immutable security invoker
set search_path = ''
as $$
  select round(
    (case when p_games < 20 then 40 else 24 end)
    * (p_score - (1.0 / (1.0 + power(10.0, (p_opponent_rating - p_rating) / 400.0))))
  )::integer
$$;

create or replace function caissa_online_private.timeout_result(
  p_turn text,
  p_white_can_mate boolean,
  p_black_can_mate boolean
) returns text
language sql immutable security invoker
set search_path = ''
as $$
  select case
    when p_turn = 'white' and not p_black_can_mate then '1/2-1/2'
    when p_turn = 'black' and not p_white_can_mate then '1/2-1/2'
    when p_turn = 'white' then '0-1'
    else '1-0'
  end
$$;

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
  if v_game.rating_processed_at is not null or v_game.result is null then return; end if;
  if not v_game.rated then
    update public.caissa_online_games set rating_processed_at = clock_timestamp() where id = p_game_id;
    return;
  end if;

  insert into public.caissa_online_ratings(user_id, pool) values (v_game.white_user_id, v_game.pool)
    on conflict (user_id, pool) do nothing;
  insert into public.caissa_online_ratings(user_id, pool) values (v_game.black_user_id, v_game.pool)
    on conflict (user_id, pool) do nothing;
  select * into v_white from public.caissa_online_ratings
    where user_id = v_game.white_user_id and pool = v_game.pool for update;
  select * into v_black from public.caissa_online_ratings
    where user_id = v_game.black_user_id and pool = v_game.pool for update;

  v_white_score := case v_game.result when '1-0' then 1 when '0-1' then 0 else 0.5 end;
  v_black_score := 1 - v_white_score;
  v_white_delta := caissa_online_private.rating_delta(v_white.rating, v_black.rating, v_white.games, v_white_score);
  v_black_delta := caissa_online_private.rating_delta(v_black.rating, v_white.rating, v_black.games, v_black_score);

  update public.caissa_online_ratings set
    rating = greatest(100, least(4000, rating + v_white_delta)), games = games + 1,
    wins = wins + case when v_white_score = 1 then 1 else 0 end,
    draws = draws + case when v_white_score = 0.5 then 1 else 0 end,
    losses = losses + case when v_white_score = 0 then 1 else 0 end,
    updated_at = clock_timestamp()
    where user_id = v_game.white_user_id and pool = v_game.pool;
  update public.caissa_online_ratings set
    rating = greatest(100, least(4000, rating + v_black_delta)), games = games + 1,
    wins = wins + case when v_black_score = 1 then 1 else 0 end,
    draws = draws + case when v_black_score = 0.5 then 1 else 0 end,
    losses = losses + case when v_black_score = 0 then 1 else 0 end,
    updated_at = clock_timestamp()
    where user_id = v_game.black_user_id and pool = v_game.pool;
  update public.caissa_online_games set
    white_rating_before = v_white.rating,
    white_rating_after = greatest(100, least(4000, v_white.rating + v_white_delta)),
    white_rating_delta = greatest(100, least(4000, v_white.rating + v_white_delta)) - v_white.rating,
    black_rating_before = v_black.rating,
    black_rating_after = greatest(100, least(4000, v_black.rating + v_black_delta)),
    black_rating_delta = greatest(100, least(4000, v_black.rating + v_black_delta)) - v_black.rating,
    rating_processed_at = clock_timestamp()
    where id = p_game_id and rating_processed_at is null;
end;
$$;

create or replace function caissa_online_private.game_state(p_subject text)
returns jsonb
language sql stable security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'profile', (select to_jsonb(p) from public.caissa_online_profiles p where p.clerk_id = p_subject),
    'ticket', (select to_jsonb(t) from public.caissa_online_matchmaking_tickets t
      where t.clerk_id = p_subject and t.state = 'queued' order by t.created_at desc limit 1),
    'game', (select to_jsonb(g) from public.caissa_online_games g
      where g.status = 'active' and p_subject in (g.white_clerk_id, g.black_clerk_id)
      order by g.created_at desc limit 1),
    'recentGames', coalesce((select jsonb_agg(to_jsonb(recent_game) order by recent_game.created_at desc)
      from (select * from public.caissa_online_games g
        where p_subject in (g.white_clerk_id, g.black_clerk_id)
        order by g.created_at desc limit 12) recent_game), '[]'::jsonb),
    'players', coalesce((select jsonb_agg(jsonb_build_object(
        'clerkId', pr.clerk_id,
        'displayName', pr.display_name,
        'status', pr.status,
        'rating', coalesce(rt.rating, 1500),
        'pool', coalesce(rt.pool, 'rapid')
      ) order by pr.display_name)
      from public.caissa_online_presence pr
      left join lateral (select * from public.caissa_online_ratings r where r.user_id = pr.user_id order by r.games desc limit 1) rt on true
      where pr.clerk_id <> p_subject and pr.expires_at > clock_timestamp()), '[]'::jsonb),
    'challenges', coalesce((select jsonb_agg(jsonb_build_object(
        'id', c.id,
        'direction', case when challenger.clerk_id = p_subject then 'outgoing' else 'incoming' end,
        'otherClerkId', case when challenger.clerk_id = p_subject then challenged.clerk_id else challenger.clerk_id end,
        'otherDisplayName', case when challenger.clerk_id = p_subject then challenged.display_name else challenger.display_name end,
        'pool', c.pool, 'baseMs', c.base_ms, 'incrementMs', c.increment_ms,
        'rated', c.rated, 'state', c.state, 'expiresAt', c.expires_at
      ) order by c.created_at desc)
      from public.caissa_online_challenges c
      join public.caissa_online_profiles challenger on challenger.user_id = c.challenger_user_id
      join public.caissa_online_profiles challenged on challenged.user_id = c.challenged_user_id
      where p_subject in (challenger.clerk_id, challenged.clerk_id)
        and c.state = 'pending' and c.expires_at > clock_timestamp()), '[]'::jsonb)
  )
$$;

create or replace function public.caissa_online_state(p_clerk_id text)
returns jsonb
language plpgsql security invoker
set search_path = ''
as $$
declare
  v_game public.caissa_online_games%rowtype;
  v_result text;
begin
  select * into v_game from public.caissa_online_games
    where status = 'active' and p_clerk_id in (white_clerk_id, black_clerk_id)
    order by created_at desc limit 1 for update;
  if v_game.id is not null and v_game.clock_started_at is not null
    and v_game.clock_started_at
      + (case when v_game.turn = 'white' then v_game.white_time_ms else v_game.black_time_ms end) * interval '1 millisecond'
      <= clock_timestamp() then
    v_result := caissa_online_private.timeout_result(
      v_game.turn, v_game.white_can_mate, v_game.black_can_mate
    );
    update public.caissa_online_games set status = 'completed', result = v_result, termination = 'timeout',
      white_time_ms = case when v_game.turn = 'white' then 0 else white_time_ms end,
      black_time_ms = case when v_game.turn = 'black' then 0 else black_time_ms end,
      clock_started_at = null, completed_at = clock_timestamp(), version = version + 1,
      updated_at = clock_timestamp(),
      pgn = case when pgn = '' then '[Event "CAISSA Online"]' || E'\n' || '[Result "' || v_result || '"]' || E'\n\n' || v_result
        else regexp_replace(regexp_replace(pgn, '\[Result "\*"\]', '[Result "' || v_result || '"]'), '\s\*\s*$', ' ' || v_result) end
      where id = v_game.id and status = 'active';
    insert into public.caissa_online_game_events(game_id, sequence, event_id, event_type, payload)
      values (v_game.id, v_game.ply + 1, 'timeout:' || v_game.id::text || ':' || v_game.version::text,
        'game.result', jsonb_build_object('result', v_result, 'termination', 'timeout'))
      on conflict (game_id, event_id) do nothing;
    perform caissa_online_private.apply_rating(v_game.id);
    update public.caissa_online_presence set active_game_id = null, status = 'online'
      where active_game_id = v_game.id;
  end if;
  return caissa_online_private.game_state(p_clerk_id);
end;
$$;

create or replace function public.caissa_online_heartbeat(p_clerk_id text, p_display_name text)
returns jsonb
language plpgsql security invoker
set search_path = ''
as $$
declare v_user_id uuid;
begin
  select id into v_user_id from public.users where clerk_id = p_clerk_id;
  if v_user_id is null then raise exception 'CAISSA_ONLINE_IDENTITY_NOT_FOUND'; end if;
  insert into public.caissa_online_profiles(user_id, clerk_id, display_name)
    values (v_user_id, p_clerk_id, left(p_display_name, 40))
    on conflict (user_id) do update set display_name = excluded.display_name, updated_at = clock_timestamp();
  insert into public.caissa_online_presence(user_id, clerk_id, display_name, status, last_seen_at, expires_at)
    values (v_user_id, p_clerk_id, left(p_display_name, 40), 'online', clock_timestamp(), clock_timestamp() + interval '45 seconds')
    on conflict (user_id) do update set display_name = excluded.display_name,
      status = case when public.caissa_online_presence.active_game_id is null then 'online' else 'playing' end,
      last_seen_at = clock_timestamp(), expires_at = clock_timestamp() + interval '45 seconds';
  return caissa_online_private.game_state(p_clerk_id);
end;
$$;

create or replace function public.caissa_online_check_rate_limit(
  p_clerk_id text,
  p_bucket text,
  p_limit integer,
  p_window_seconds integer
) returns jsonb
language plpgsql security invoker
set search_path = ''
as $$
declare
  v_row public.caissa_online_rate_limits%rowtype;
  v_now timestamptz := clock_timestamp();
  v_retry integer;
begin
  if p_clerk_id is null or char_length(p_clerk_id) not between 6 and 80
    or p_bucket is null or p_bucket !~ '^[a-z][a-z0-9-]{0,39}$'
    or p_limit is null or p_limit not between 1 and 1000
    or p_window_seconds is null or p_window_seconds not between 1 and 3600 then
    raise exception 'CAISSA_ONLINE_INVALID_RATE_LIMIT';
  end if;
  insert into public.caissa_online_rate_limits(clerk_id, bucket)
    values (p_clerk_id, p_bucket) on conflict (clerk_id, bucket) do nothing;
  select * into strict v_row from public.caissa_online_rate_limits
    where clerk_id = p_clerk_id and bucket = p_bucket for update;
  if v_row.window_started_at + make_interval(secs => p_window_seconds) <= v_now then
    update public.caissa_online_rate_limits set window_started_at = v_now,
      request_count = 1, updated_at = v_now
      where clerk_id = p_clerk_id and bucket = p_bucket;
    return jsonb_build_object('allowed', true, 'remaining', p_limit - 1, 'retryAfter', 0);
  end if;
  if v_row.request_count >= p_limit then
    v_retry := greatest(1, ceil(extract(epoch from (
      v_row.window_started_at + make_interval(secs => p_window_seconds) - v_now
    )))::integer);
    return jsonb_build_object('allowed', false, 'remaining', 0, 'retryAfter', v_retry);
  end if;
  update public.caissa_online_rate_limits set request_count = request_count + 1, updated_at = v_now
    where clerk_id = p_clerk_id and bucket = p_bucket;
  return jsonb_build_object('allowed', true, 'remaining', p_limit - v_row.request_count - 1, 'retryAfter', 0);
end;
$$;

create or replace function public.caissa_online_join_queue(
  p_clerk_id text,
  p_display_name text,
  p_pool text,
  p_base_ms integer,
  p_increment_ms integer,
  p_rated boolean
) returns jsonb
language plpgsql security invoker
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_rating integer;
  v_ticket public.caissa_online_matchmaking_tickets%rowtype;
  v_opponent public.caissa_online_matchmaking_tickets%rowtype;
  v_game_id uuid;
  v_white_user uuid;
  v_black_user uuid;
  v_white_clerk text;
  v_black_clerk text;
  v_white_name text;
  v_black_name text;
begin
  if p_pool not in ('bullet', 'blitz', 'rapid', 'daily')
    or p_base_ms not between 10000 and 86400000
    or p_increment_ms not between 0 and 600000 then
    raise exception 'CAISSA_ONLINE_INVALID_QUEUE';
  end if;
  select id into v_user_id from public.users where clerk_id = p_clerk_id;
  if v_user_id is null then raise exception 'CAISSA_ONLINE_IDENTITY_NOT_FOUND'; end if;
  if exists(select 1 from public.caissa_online_games where status = 'active'
    and p_clerk_id in (white_clerk_id, black_clerk_id)) then
    return caissa_online_private.game_state(p_clerk_id);
  end if;
  insert into public.caissa_online_profiles(user_id, clerk_id, display_name)
    values (v_user_id, p_clerk_id, left(p_display_name, 40))
    on conflict (user_id) do update set display_name = excluded.display_name, updated_at = clock_timestamp();
  insert into public.caissa_online_ratings(user_id, pool) values (v_user_id, p_pool)
    on conflict (user_id, pool) do nothing;
  select rating into v_rating from public.caissa_online_ratings where user_id = v_user_id and pool = p_pool;
  update public.caissa_online_matchmaking_tickets set state = 'expired', updated_at = clock_timestamp()
    where state = 'queued' and expires_at <= clock_timestamp();
  select * into v_ticket from public.caissa_online_matchmaking_tickets
    where user_id = v_user_id and state = 'queued' for update;
  if found then
    if (v_ticket.pool, v_ticket.base_ms, v_ticket.increment_ms, v_ticket.rated)
      is distinct from (p_pool, p_base_ms, p_increment_ms, p_rated) then
      update public.caissa_online_matchmaking_tickets set state = 'cancelled', updated_at = clock_timestamp()
        where id = v_ticket.id;
      v_ticket := null;
    end if;
  end if;
  if v_ticket.id is null then
    insert into public.caissa_online_matchmaking_tickets(user_id, clerk_id, pool, base_ms, increment_ms, rated, rating)
      values (v_user_id, p_clerk_id, p_pool, p_base_ms, p_increment_ms, p_rated, v_rating)
      returning * into v_ticket;
  end if;
  select * into v_opponent from public.caissa_online_matchmaking_tickets candidate
    where candidate.state = 'queued' and candidate.user_id <> v_user_id
      and candidate.pool = p_pool and candidate.base_ms = p_base_ms
      and candidate.increment_ms = p_increment_ms and candidate.rated = p_rated
      and abs(candidate.rating - v_rating) <= greatest(
        least(600, 100 + floor(extract(epoch from (clock_timestamp() - candidate.created_at)) / 15) * 50),
        100
      )
    order by candidate.created_at, candidate.id
    limit 1 for update skip locked;
  if v_opponent.id is null then return caissa_online_private.game_state(p_clerk_id); end if;

  perform pg_advisory_xact_lock(hashtextextended(least(v_user_id::text, v_opponent.user_id::text), 701001));
  perform pg_advisory_xact_lock(hashtextextended(greatest(v_user_id::text, v_opponent.user_id::text), 701001));
  if exists(select 1 from public.caissa_online_games where status = 'active'
    and (white_user_id = v_user_id or black_user_id = v_user_id)) then
    update public.caissa_online_matchmaking_tickets set state = 'cancelled', updated_at = clock_timestamp()
      where id = v_ticket.id;
    return caissa_online_private.game_state(p_clerk_id);
  end if;
  if exists(select 1 from public.caissa_online_games where status = 'active'
    and (white_user_id = v_opponent.user_id or black_user_id = v_opponent.user_id)) then
    update public.caissa_online_matchmaking_tickets set state = 'cancelled', updated_at = clock_timestamp()
      where id = v_opponent.id;
    return caissa_online_private.game_state(p_clerk_id);
  end if;

  if random() < 0.5 then
    v_white_user := v_user_id; v_black_user := v_opponent.user_id;
    v_white_clerk := p_clerk_id; v_black_clerk := v_opponent.clerk_id;
  else
    v_white_user := v_opponent.user_id; v_black_user := v_user_id;
    v_white_clerk := v_opponent.clerk_id; v_black_clerk := p_clerk_id;
  end if;
  select display_name into v_white_name from public.caissa_online_profiles where user_id = v_white_user;
  select display_name into v_black_name from public.caissa_online_profiles where user_id = v_black_user;
  insert into public.caissa_online_games(
    pool, rated, base_ms, increment_ms, white_user_id, black_user_id,
    white_clerk_id, black_clerk_id, white_display_name, black_display_name,
    white_time_ms, black_time_ms, clock_started_at
  ) values (
    p_pool, p_rated, p_base_ms, p_increment_ms, v_white_user, v_black_user,
    v_white_clerk, v_black_clerk, v_white_name, v_black_name,
    p_base_ms, p_base_ms, clock_timestamp() + interval '5 seconds'
  ) returning id into v_game_id;
  update public.caissa_online_matchmaking_tickets set state = 'matched', matched_game_id = v_game_id,
    updated_at = clock_timestamp() where id in (v_ticket.id, v_opponent.id);
  update public.caissa_online_challenges set state = 'cancelled', updated_at = clock_timestamp()
    where state = 'pending'
      and (challenger_user_id in (v_white_user, v_black_user)
        or challenged_user_id in (v_white_user, v_black_user));
  update public.caissa_online_presence set active_game_id = v_game_id, status = 'playing',
    last_seen_at = clock_timestamp(), expires_at = clock_timestamp() + interval '45 seconds'
    where user_id in (v_white_user, v_black_user);
  insert into public.caissa_online_game_events(game_id, sequence, event_id, event_type, payload)
    values (v_game_id, 0, 'match:' || v_game_id::text, 'match.found',
      jsonb_build_object('pool', p_pool, 'rated', p_rated));
  return caissa_online_private.game_state(p_clerk_id);
end;
$$;

create or replace function public.caissa_online_leave_queue(p_clerk_id text)
returns jsonb
language plpgsql security invoker
set search_path = ''
as $$
begin
  update public.caissa_online_matchmaking_tickets set state = 'cancelled', updated_at = clock_timestamp()
    where clerk_id = p_clerk_id and state = 'queued';
  return caissa_online_private.game_state(p_clerk_id);
end;
$$;

create or replace function public.caissa_online_commit_move(
  p_clerk_id text,
  p_game_id uuid,
  p_event_id text,
  p_expected_version integer,
  p_from text,
  p_to text,
  p_promotion text,
  p_san text,
  p_uci text,
  p_next_fen text,
  p_next_turn text,
  p_result text,
  p_termination text,
  p_pgn text,
  p_white_can_mate boolean,
  p_black_can_mate boolean
) returns jsonb
language plpgsql security invoker
set search_path = ''
as $$
declare
  v_game public.caissa_online_games%rowtype;
  v_actor uuid;
  v_elapsed integer;
  v_white_ms integer;
  v_black_ms integer;
  v_sequence integer;
  v_result text;
begin
  select * into v_game from public.caissa_online_games where id = p_game_id for update;
  if v_game.id is null then raise exception 'CAISSA_ONLINE_GAME_NOT_FOUND'; end if;
  if p_clerk_id not in (v_game.white_clerk_id, v_game.black_clerk_id) then raise exception 'CAISSA_ONLINE_NOT_PARTICIPANT'; end if;
  if exists(select 1 from public.caissa_online_game_events where game_id = p_game_id and event_id = p_event_id) then
    return caissa_online_private.game_state(p_clerk_id);
  end if;
  if v_game.status <> 'active' then raise exception 'CAISSA_ONLINE_GAME_NOT_ACTIVE'; end if;
  if v_game.version <> p_expected_version then raise exception 'CAISSA_ONLINE_STALE_VERSION'; end if;
  if (v_game.turn = 'white' and p_clerk_id <> v_game.white_clerk_id)
    or (v_game.turn = 'black' and p_clerk_id <> v_game.black_clerk_id) then
    raise exception 'CAISSA_ONLINE_NOT_YOUR_TURN';
  end if;
  if p_from !~ '^[a-h][1-8]$' or p_to !~ '^[a-h][1-8]$' or p_next_turn not in ('white', 'black')
    or p_white_can_mate is null or p_black_can_mate is null
    or octet_length(p_pgn) > 524288 or v_game.ply >= 6000 then
    raise exception 'CAISSA_ONLINE_INVALID_MOVE';
  end if;
  v_elapsed := greatest(0, floor(extract(epoch from (clock_timestamp() - v_game.clock_started_at)) * 1000))::integer;
  v_white_ms := v_game.white_time_ms;
  v_black_ms := v_game.black_time_ms;
  if v_game.turn = 'white' then v_white_ms := greatest(0, v_white_ms - v_elapsed);
  else v_black_ms := greatest(0, v_black_ms - v_elapsed); end if;
  if (v_game.turn = 'white' and v_white_ms = 0) or (v_game.turn = 'black' and v_black_ms = 0) then
    v_result := caissa_online_private.timeout_result(
      v_game.turn, v_game.white_can_mate, v_game.black_can_mate
    );
    update public.caissa_online_games set status = 'completed',
      result = v_result,
      termination = 'timeout', white_time_ms = v_white_ms, black_time_ms = v_black_ms,
      completed_at = clock_timestamp(), clock_started_at = null, version = version + 1,
      updated_at = clock_timestamp(),
      pgn = case when pgn = '' then '[Event "CAISSA Online"]' || E'\n'
          || '[Result "' || v_result || '"]' || E'\n\n' || v_result
        else regexp_replace(regexp_replace(pgn, '\[Result "\*"\]', '[Result "'
          || v_result || '"]'), '\s\*\s*$', ' ' || v_result) end
      where id = p_game_id;
    select id into v_actor from public.users where clerk_id = p_clerk_id;
    insert into public.caissa_online_game_events(game_id, sequence, event_id, event_type, actor_user_id, payload)
      values (p_game_id, v_game.ply + 1, p_event_id, 'game.result', v_actor,
        jsonb_build_object('result', v_result, 'termination', 'timeout'));
    perform caissa_online_private.apply_rating(p_game_id);
    update public.caissa_online_presence set active_game_id = null, status = 'online'
      where active_game_id = p_game_id;
    return caissa_online_private.game_state(p_clerk_id);
  end if;
  if v_game.turn = 'white' then v_white_ms := v_white_ms + v_game.increment_ms;
  else v_black_ms := v_black_ms + v_game.increment_ms; end if;
  select id into v_actor from public.users where clerk_id = p_clerk_id;
  v_sequence := v_game.ply + 1;
  update public.caissa_online_games set
    fen = p_next_fen,
    moves = moves || jsonb_build_array(jsonb_build_object(
      'ply', v_sequence, 'from', p_from, 'to', p_to, 'promotion', p_promotion,
      'san', p_san, 'uci', p_uci, 'color', v_game.turn,
      'serverTimestamp', clock_timestamp()
    )),
    pgn = p_pgn,
    white_can_mate = p_white_can_mate,
    black_can_mate = p_black_can_mate,
    ply = v_sequence,
    turn = p_next_turn,
    version = version + 1,
    white_time_ms = v_white_ms,
    black_time_ms = v_black_ms,
    clock_started_at = case when p_result is null then clock_timestamp() else null end,
    draw_offer_by = null,
    status = case when p_result is null then status else 'completed' end,
    result = p_result,
    termination = p_termination,
    completed_at = case when p_result is null then null else clock_timestamp() end,
    updated_at = clock_timestamp()
    where id = p_game_id;
  insert into public.caissa_online_game_events(game_id, sequence, event_id, event_type, actor_user_id, payload)
    values (p_game_id, v_sequence, p_event_id,
      case when p_result is null then 'game.moveAccepted' else 'game.result' end,
      v_actor, jsonb_build_object('from', p_from, 'to', p_to, 'san', p_san));
  if p_result is not null then
    perform caissa_online_private.apply_rating(p_game_id);
    update public.caissa_online_presence set active_game_id = null, status = 'online'
      where active_game_id = p_game_id;
  end if;
  return caissa_online_private.game_state(p_clerk_id);
end;
$$;

create or replace function public.caissa_online_finish_game(
  p_clerk_id text,
  p_game_id uuid,
  p_event_id text,
  p_reason text
) returns jsonb
language plpgsql security invoker
set search_path = ''
as $$
declare
  v_game public.caissa_online_games%rowtype;
  v_actor uuid;
  v_result text;
  v_termination text;
begin
  select * into v_game from public.caissa_online_games where id = p_game_id for update;
  if v_game.id is null then raise exception 'CAISSA_ONLINE_GAME_NOT_FOUND'; end if;
  if p_clerk_id not in (v_game.white_clerk_id, v_game.black_clerk_id) then raise exception 'CAISSA_ONLINE_NOT_PARTICIPANT'; end if;
  if exists(select 1 from public.caissa_online_game_events where game_id = p_game_id and event_id = p_event_id) then
    return caissa_online_private.game_state(p_clerk_id);
  end if;
  if v_game.status <> 'active' then return caissa_online_private.game_state(p_clerk_id); end if;
  if v_game.clock_started_at is not null
    and v_game.clock_started_at
      + (case when v_game.turn = 'white' then v_game.white_time_ms else v_game.black_time_ms end) * interval '1 millisecond'
      <= clock_timestamp() then
    v_result := caissa_online_private.timeout_result(
      v_game.turn, v_game.white_can_mate, v_game.black_can_mate
    );
    v_termination := 'timeout';
  elsif p_reason = 'agreement' then
    if v_game.draw_offer_by is null or v_game.draw_offer_by = p_clerk_id then
      raise exception 'CAISSA_ONLINE_DRAW_OFFER_REQUIRED';
    end if;
    v_result := '1/2-1/2';
    v_termination := 'agreement';
  elsif p_reason = 'resignation' then
    v_result := case when p_clerk_id = v_game.white_clerk_id then '0-1' else '1-0' end;
    v_termination := 'resignation';
  else raise exception 'CAISSA_ONLINE_INVALID_TERMINATION'; end if;
  select id into v_actor from public.users where clerk_id = p_clerk_id;
  update public.caissa_online_games set status = 'completed', result = v_result,
    termination = v_termination, completed_at = clock_timestamp(), clock_started_at = null,
    version = version + 1, updated_at = clock_timestamp(),
    pgn = case when pgn = '' then '[Event "CAISSA Online"]' || E'\n' || '[Result "' || v_result || '"]' || E'\n\n' || v_result
      else regexp_replace(regexp_replace(pgn, '\[Result "\*"\]', '[Result "' || v_result || '"]'), '\s\*\s*$', ' ' || v_result) end
    where id = p_game_id;
  insert into public.caissa_online_game_events(game_id, sequence, event_id, event_type, actor_user_id, payload)
    values (p_game_id, v_game.ply + 1, p_event_id, 'game.result', v_actor,
      jsonb_build_object('result', v_result, 'termination', v_termination));
  perform caissa_online_private.apply_rating(p_game_id);
  update public.caissa_online_presence set active_game_id = null, status = 'online'
    where active_game_id = p_game_id;
  return caissa_online_private.game_state(p_clerk_id);
end;
$$;

create or replace function public.caissa_online_draw_offer(
  p_clerk_id text,
  p_game_id uuid,
  p_event_id text,
  p_action text
) returns jsonb
language plpgsql security invoker
set search_path = ''
as $$
declare
  v_game public.caissa_online_games%rowtype;
  v_actor uuid;
begin
  select * into v_game from public.caissa_online_games where id = p_game_id for update;
  if v_game.id is null then raise exception 'CAISSA_ONLINE_GAME_NOT_FOUND'; end if;
  if p_clerk_id not in (v_game.white_clerk_id, v_game.black_clerk_id) then raise exception 'CAISSA_ONLINE_NOT_PARTICIPANT'; end if;
  if v_game.status <> 'active' then raise exception 'CAISSA_ONLINE_GAME_NOT_ACTIVE'; end if;
  if exists(select 1 from public.caissa_online_game_events where game_id = p_game_id and event_id = p_event_id) then
    return caissa_online_private.game_state(p_clerk_id);
  end if;
  if p_action = 'offer' then
    if v_game.draw_offer_by is not null then raise exception 'CAISSA_ONLINE_DRAW_ALREADY_OFFERED'; end if;
    update public.caissa_online_games set draw_offer_by = p_clerk_id, version = version + 1,
      updated_at = clock_timestamp() where id = p_game_id;
  elsif p_action = 'decline' then
    if v_game.draw_offer_by is null or v_game.draw_offer_by = p_clerk_id then
      raise exception 'CAISSA_ONLINE_DRAW_OFFER_REQUIRED';
    end if;
    update public.caissa_online_games set draw_offer_by = null, version = version + 1,
      updated_at = clock_timestamp() where id = p_game_id;
  else raise exception 'CAISSA_ONLINE_INVALID_DRAW_ACTION'; end if;
  select id into v_actor from public.users where clerk_id = p_clerk_id;
  insert into public.caissa_online_game_events(game_id, sequence, event_id, event_type, actor_user_id, payload)
    values (p_game_id, v_game.ply + 1, p_event_id,
      case when p_action = 'offer' then 'game.drawOffer' else 'game.drawDecline' end,
      v_actor, jsonb_build_object('action', p_action));
  return caissa_online_private.game_state(p_clerk_id);
end;
$$;

create or replace function public.caissa_online_create_challenge(
  p_clerk_id text,
  p_target_clerk_id text,
  p_pool text,
  p_base_ms integer,
  p_increment_ms integer,
  p_rated boolean
) returns jsonb
language plpgsql security invoker
set search_path = ''
as $$
declare
  v_challenger uuid;
  v_challenged uuid;
begin
  if p_clerk_id = p_target_clerk_id then raise exception 'CAISSA_ONLINE_INVALID_CHALLENGE'; end if;
  if p_pool not in ('bullet', 'blitz', 'rapid', 'daily')
    or p_base_ms not between 10000 and 86400000 or p_increment_ms not between 0 and 600000 then
    raise exception 'CAISSA_ONLINE_INVALID_CHALLENGE';
  end if;
  select id into v_challenger from public.users where clerk_id = p_clerk_id;
  select id into v_challenged from public.users where clerk_id = p_target_clerk_id;
  if v_challenger is null or v_challenged is null then raise exception 'CAISSA_ONLINE_IDENTITY_NOT_FOUND'; end if;
  if not exists(select 1 from public.caissa_online_profiles where user_id = v_challenged) then
    raise exception 'CAISSA_ONLINE_PLAYER_NOT_AVAILABLE';
  end if;
  update public.caissa_online_challenges set state = 'expired', updated_at = clock_timestamp()
    where state = 'pending' and expires_at <= clock_timestamp();
  if exists(select 1 from public.caissa_online_games where status = 'active'
    and (p_clerk_id in (white_clerk_id, black_clerk_id) or p_target_clerk_id in (white_clerk_id, black_clerk_id))) then
    raise exception 'CAISSA_ONLINE_PLAYER_BUSY';
  end if;
  insert into public.caissa_online_challenges(
    challenger_user_id, challenged_user_id, pool, base_ms, increment_ms, rated
  ) values (v_challenger, v_challenged, p_pool, p_base_ms, p_increment_ms, p_rated)
  on conflict (challenger_user_id, challenged_user_id) where state = 'pending'
  do update set pool = excluded.pool, base_ms = excluded.base_ms, increment_ms = excluded.increment_ms,
    rated = excluded.rated, updated_at = clock_timestamp(), expires_at = clock_timestamp() + interval '2 minutes';
  return caissa_online_private.game_state(p_clerk_id);
end;
$$;

create or replace function public.caissa_online_respond_challenge(
  p_clerk_id text,
  p_challenge_id uuid,
  p_action text
) returns jsonb
language plpgsql security invoker
set search_path = ''
as $$
declare
  v_challenge public.caissa_online_challenges%rowtype;
  v_actor uuid;
  v_white uuid;
  v_black uuid;
  v_white_clerk text;
  v_black_clerk text;
  v_white_name text;
  v_black_name text;
  v_game_id uuid;
begin
  select id into v_actor from public.users where clerk_id = p_clerk_id;
  if v_actor is null then raise exception 'CAISSA_ONLINE_IDENTITY_NOT_FOUND'; end if;
  select * into v_challenge from public.caissa_online_challenges where id = p_challenge_id for update;
  if v_challenge.id is null then raise exception 'CAISSA_ONLINE_CHALLENGE_NOT_FOUND'; end if;
  if v_challenge.state <> 'pending' or v_challenge.expires_at <= clock_timestamp() then
    update public.caissa_online_challenges set state = 'expired', updated_at = clock_timestamp()
      where id = p_challenge_id and state = 'pending';
    raise exception 'CAISSA_ONLINE_CHALLENGE_EXPIRED';
  end if;
  if v_actor is distinct from v_challenge.challenged_user_id then raise exception 'CAISSA_ONLINE_NOT_CHALLENGED_PLAYER'; end if;
  if p_action = 'decline' then
    update public.caissa_online_challenges set state = 'declined', updated_at = clock_timestamp() where id = p_challenge_id;
    return caissa_online_private.game_state(p_clerk_id);
  end if;
  if p_action <> 'accept' then raise exception 'CAISSA_ONLINE_INVALID_CHALLENGE_ACTION'; end if;
  perform 1 from public.caissa_online_matchmaking_tickets
    where user_id in (v_challenge.challenger_user_id, v_challenge.challenged_user_id) and state = 'queued'
    order by user_id for update;
  perform pg_advisory_xact_lock(hashtextextended(
    least(v_challenge.challenger_user_id::text, v_challenge.challenged_user_id::text), 701001
  ));
  perform pg_advisory_xact_lock(hashtextextended(
    greatest(v_challenge.challenger_user_id::text, v_challenge.challenged_user_id::text), 701001
  ));
  if exists(select 1 from public.caissa_online_games where status = 'active'
    and (white_user_id in (v_challenge.challenger_user_id, v_challenge.challenged_user_id)
      or black_user_id in (v_challenge.challenger_user_id, v_challenge.challenged_user_id))) then
    raise exception 'CAISSA_ONLINE_PLAYER_BUSY';
  end if;
  if random() < 0.5 then v_white := v_challenge.challenger_user_id; v_black := v_challenge.challenged_user_id;
  else v_white := v_challenge.challenged_user_id; v_black := v_challenge.challenger_user_id; end if;
  select clerk_id, display_name into v_white_clerk, v_white_name from public.caissa_online_profiles where user_id = v_white;
  select clerk_id, display_name into v_black_clerk, v_black_name from public.caissa_online_profiles where user_id = v_black;
  insert into public.caissa_online_ratings(user_id, pool)
    values (v_white, v_challenge.pool), (v_black, v_challenge.pool) on conflict (user_id, pool) do nothing;
  insert into public.caissa_online_games(
    pool, rated, base_ms, increment_ms, white_user_id, black_user_id,
    white_clerk_id, black_clerk_id, white_display_name, black_display_name,
    white_time_ms, black_time_ms, clock_started_at
  ) values (
    v_challenge.pool, v_challenge.rated, v_challenge.base_ms, v_challenge.increment_ms, v_white, v_black,
    v_white_clerk, v_black_clerk, v_white_name, v_black_name,
    v_challenge.base_ms, v_challenge.base_ms, clock_timestamp() + interval '5 seconds'
  ) returning id into v_game_id;
  update public.caissa_online_challenges set state = 'accepted', game_id = v_game_id,
    updated_at = clock_timestamp() where id = p_challenge_id;
  update public.caissa_online_challenges set state = 'cancelled', updated_at = clock_timestamp()
    where id <> p_challenge_id and state = 'pending'
      and (challenger_user_id in (v_white, v_black) or challenged_user_id in (v_white, v_black));
  update public.caissa_online_matchmaking_tickets set state = 'cancelled', updated_at = clock_timestamp()
    where user_id in (v_white, v_black) and state = 'queued';
  update public.caissa_online_presence set active_game_id = v_game_id, status = 'playing',
    last_seen_at = clock_timestamp(), expires_at = clock_timestamp() + interval '45 seconds'
    where user_id in (v_white, v_black);
  insert into public.caissa_online_game_events(game_id, sequence, event_id, event_type, actor_user_id, payload)
    values (v_game_id, 0, 'challenge:' || p_challenge_id::text, 'match.found', v_actor,
      jsonb_build_object('challengeId', p_challenge_id));
  return caissa_online_private.game_state(p_clerk_id);
end;
$$;

revoke all on function caissa_online_private.rating_delta(integer, integer, integer, numeric) from public, anon, authenticated;
revoke all on function caissa_online_private.timeout_result(text, boolean, boolean) from public, anon, authenticated;
revoke all on function caissa_online_private.apply_rating(uuid) from public, anon, authenticated;
revoke all on function caissa_online_private.game_state(text) from public, anon, authenticated;
grant usage on schema caissa_online_private to service_role;
grant execute on function caissa_online_private.rating_delta(integer, integer, integer, numeric) to service_role;
grant execute on function caissa_online_private.timeout_result(text, boolean, boolean) to service_role;
grant execute on function caissa_online_private.apply_rating(uuid) to service_role;
grant execute on function caissa_online_private.game_state(text) to service_role;

revoke all on function public.caissa_online_state(text) from public, anon, authenticated;
revoke all on function public.caissa_online_heartbeat(text, text) from public, anon, authenticated;
revoke all on function public.caissa_online_check_rate_limit(text, text, integer, integer) from public, anon, authenticated;
revoke all on function public.caissa_online_join_queue(text, text, text, integer, integer, boolean) from public, anon, authenticated;
revoke all on function public.caissa_online_leave_queue(text) from public, anon, authenticated;
revoke all on function public.caissa_online_commit_move(text, uuid, text, integer, text, text, text, text, text, text, text, text, text, text, boolean, boolean) from public, anon, authenticated;
revoke all on function public.caissa_online_finish_game(text, uuid, text, text) from public, anon, authenticated;
revoke all on function public.caissa_online_draw_offer(text, uuid, text, text) from public, anon, authenticated;
revoke all on function public.caissa_online_create_challenge(text, text, text, integer, integer, boolean) from public, anon, authenticated;
revoke all on function public.caissa_online_respond_challenge(text, uuid, text) from public, anon, authenticated;
grant execute on function public.caissa_online_state(text) to service_role;
grant execute on function public.caissa_online_heartbeat(text, text) to service_role;
grant execute on function public.caissa_online_check_rate_limit(text, text, integer, integer) to service_role;
grant execute on function public.caissa_online_join_queue(text, text, text, integer, integer, boolean) to service_role;
grant execute on function public.caissa_online_leave_queue(text) to service_role;
grant execute on function public.caissa_online_commit_move(text, uuid, text, integer, text, text, text, text, text, text, text, text, text, text, boolean, boolean) to service_role;
grant execute on function public.caissa_online_finish_game(text, uuid, text, text) to service_role;
grant execute on function public.caissa_online_draw_offer(text, uuid, text, text) to service_role;
grant execute on function public.caissa_online_create_challenge(text, text, text, integer, integer, boolean) to service_role;
grant execute on function public.caissa_online_respond_challenge(text, uuid, text) to service_role;

create or replace function caissa_online_private.broadcast_game_change()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  perform realtime.broadcast_changes(
    'online-game:' || coalesce(new.id, old.id)::text,
    tg_op,
    tg_op,
    tg_table_name,
    tg_table_schema,
    new,
    old
  );
  return null;
end;
$$;
revoke all on function caissa_online_private.broadcast_game_change() from public, anon, authenticated;

create trigger caissa_online_game_broadcast
after insert or update or delete on public.caissa_online_games
for each row execute function caissa_online_private.broadcast_game_change();

create policy caissa_online_game_broadcast_read
on realtime.messages
for select
to authenticated
using (
  realtime.messages.extension = 'broadcast'
  and (select realtime.topic()) like 'online-game:%'
  and exists (
    select 1 from public.caissa_online_games game
    where game.id::text = split_part((select realtime.topic()), ':', 2)
      and (select auth.jwt()->>'sub') in (game.white_clerk_id, game.black_clerk_id)
  )
);

comment on table public.caissa_online_game_events is
  'Server-authored audit/event log. Payloads exclude tokens, chat, FEN duplication, and client-declared identity.';
comment on function public.caissa_online_commit_move is
  'Service-role-only optimistic transaction. Chess legality is validated by the authenticated Vercel game authority before this RPC.';
