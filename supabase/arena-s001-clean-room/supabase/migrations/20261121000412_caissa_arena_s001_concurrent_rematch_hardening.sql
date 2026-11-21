-- Arena S001 hosted concurrency hardening.
-- If a player's only currently waiting opponent is a rematch, wait while an
-- unseen opponent is still participating in another game. This closes the
-- separate-transaction race found by the four-identity hosted certification.

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
      and (
        not exists (
          select 1
          from public.caissa_online_arena_pairings previous
          where previous.tournament_id = p_tournament_id
            and previous.state = 'finished'
            and ((previous.white_user_id = v_first.user_id and previous.black_user_id = candidate.user_id)
              or (previous.white_user_id = candidate.user_id and previous.black_user_id = v_first.user_id))
        )
        or not exists (
          select 1
          from public.caissa_online_tournament_participants alternative
          where alternative.tournament_id = p_tournament_id
            and alternative.user_id <> v_first.user_id
            and alternative.state in ('waiting', 'playing')
            and not exists (
              select 1
              from public.caissa_online_arena_pairings prior_alternative
              where prior_alternative.tournament_id = p_tournament_id
                and prior_alternative.state = 'finished'
                and ((prior_alternative.white_user_id = v_first.user_id
                      and prior_alternative.black_user_id = alternative.user_id)
                  or (prior_alternative.white_user_id = alternative.user_id
                      and prior_alternative.black_user_id = v_first.user_id))
            )
        )
      )
    order by
      (exists (
        select 1
        from public.caissa_online_arena_pairings previous
        where previous.tournament_id = p_tournament_id
          and previous.state = 'finished'
          and ((previous.white_user_id = v_first.user_id and previous.black_user_id = candidate.user_id)
            or (previous.white_user_id = candidate.user_id and previous.black_user_id = v_first.user_id))
      ))::integer,
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

revoke all on function caissa_online_private.arena_pair_waiters(uuid) from public, anon, authenticated;
grant execute on function caissa_online_private.arena_pair_waiters(uuid) to service_role;

comment on function caissa_online_private.arena_pair_waiters(uuid) is
  'Arena S001 pairing authority. Waits for active unseen opponents before allowing a tournament rematch.';
