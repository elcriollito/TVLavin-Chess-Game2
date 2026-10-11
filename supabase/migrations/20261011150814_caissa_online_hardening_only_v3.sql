-- Forward-only hardening discovered by Canonical Migration V2 certification.
-- CAISSA_ONLINE_ROLLOUT must remain off while these indexes are created.

create index if not exists caissa_online_challenges_challenged_user_fk_idx
  on public.caissa_online_challenges(challenged_user_id);

create index if not exists caissa_online_challenges_game_fk_idx
  on public.caissa_online_challenges(game_id);

create index if not exists caissa_online_game_events_actor_user_fk_idx
  on public.caissa_online_game_events(actor_user_id);

create index if not exists caissa_online_games_tournament_fk_idx
  on public.caissa_online_games(tournament_id);

create index if not exists caissa_online_matchmaking_tickets_game_fk_idx
  on public.caissa_online_matchmaking_tickets(matched_game_id);

create index if not exists caissa_online_presence_active_game_fk_idx
  on public.caissa_online_presence(active_game_id);

create index if not exists caissa_online_tournament_games_game_fk_idx
  on public.caissa_online_tournament_games(game_id);

create index if not exists caissa_online_tournament_participants_user_fk_idx
  on public.caissa_online_tournament_participants(user_id);

create index if not exists caissa_online_tournaments_owner_user_fk_idx
  on public.caissa_online_tournaments(owner_user_id);

-- Keep auth helper evaluation in an init plan instead of per row.
drop policy if exists caissa_online_participant_game_read on public.caissa_online_games;
create policy caissa_online_participant_game_read
on public.caissa_online_games
for select
to authenticated
using (((select auth.jwt())->>'sub') in (white_clerk_id, black_clerk_id));

drop policy if exists caissa_online_game_broadcast_read on realtime.messages;
create policy caissa_online_game_broadcast_read
on realtime.messages
for select
to authenticated
using (
  realtime.messages.extension = 'broadcast'
  and exists (
    select 1 from public.caissa_online_games game
    where (select realtime.topic()) = 'online-game:' || game.id::text
      and ((select auth.jwt())->>'sub') in (game.white_clerk_id, game.black_clerk_id)
  )
);

-- Serialize join attempts by exact matchmaking pool before a caller locks its
-- own ticket. This prevents two simultaneous joiners from both skipping the
-- opposing locked row. The signature is unchanged, so the v1 rollback remains
-- complete and the historical migration remains immutable.
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

  if not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended(
      'caissa-online-queue:' || p_pool || ':' || p_base_ms::text || ':'
        || p_increment_ms::text || ':' || p_rated::text,
      701002
    )) then
    raise exception 'CAISSA_ONLINE_QUEUE_BUSY' using errcode = '55P03';
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

revoke all on function public.caissa_online_join_queue(text, text, text, integer, integer, boolean)
  from public, anon, authenticated;
grant execute on function public.caissa_online_join_queue(text, text, text, integer, integer, boolean)
  to service_role;

-- A terminal result is insufficient by itself to authorize a rating update:
-- synthetic recovery rows and administrative aborts may retain a result for
-- audit purposes. Only a normally completed, non-aborted game is ratable.
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
  if v_game.rating_processed_at is not null
    or v_game.result is null
    or v_game.status <> 'completed'
    or v_game.termination = 'aborted' then
    return;
  end if;
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

revoke all on function caissa_online_private.apply_rating(uuid)
  from public, anon, authenticated;
grant execute on function caissa_online_private.apply_rating(uuid)
  to service_role;

-- Bound every remaining row/advisory wait in matchmaking and challenge
-- acceptance. Pool contention is normally rejected immediately above; this is
-- the final circuit breaker for participant locks shared with challenges.
alter function public.caissa_online_join_queue(text, text, text, integer, integer, boolean)
  set lock_timeout = '2s';
alter function public.caissa_online_respond_challenge(text, uuid, text)
  set lock_timeout = '2s';
