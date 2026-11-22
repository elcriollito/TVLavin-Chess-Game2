-- CAISSA Tournament UX S001. Expands the isolated Arena beta from one
-- administrator-created event to bounded, user-organized Arenas while keeping
-- every write behind service-role RPCs and server timestamps.
begin;

alter table public.caissa_online_tournaments
  drop constraint if exists caissa_online_arena_s001_capacity_check;
alter table public.caissa_online_tournaments
  add constraint caissa_online_arena_s001_capacity_check
  check (configuration->>'betaSeason' is distinct from 'S001' or capacity between 4 and 64);

create or replace function caissa_online_private.prevent_overlapping_arena_participation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_tournament public.caissa_online_tournaments%rowtype;
begin
  if new.state = 'withdrawn' then return new; end if;
  select * into v_tournament from public.caissa_online_tournaments where id = new.tournament_id;
  if v_tournament.id is null or v_tournament.configuration->>'betaSeason' <> 'S001' then return new; end if;
  if exists (
    select 1
    from public.caissa_online_tournament_participants participant
    join public.caissa_online_tournaments tournament on tournament.id = participant.tournament_id
    where participant.user_id = new.user_id
      and participant.tournament_id <> new.tournament_id
      and participant.state <> 'withdrawn'
      and tournament.configuration->>'betaSeason' = 'S001'
      and tournament.status in ('scheduled', 'registration_open', 'active', 'finishing')
      and pg_catalog.tstzrange(tournament.starts_at, tournament.ends_at, '[)')
        && pg_catalog.tstzrange(v_tournament.starts_at, v_tournament.ends_at, '[)')
  ) then
    raise exception 'CAISSA_ONLINE_ARENA_PARTICIPATION_CONFLICT';
  end if;
  return new;
end;
$$;

drop trigger if exists caissa_online_arena_participation_conflict
  on public.caissa_online_tournament_participants;
create trigger caissa_online_arena_participation_conflict
before insert or update of tournament_id, user_id, state
on public.caissa_online_tournament_participants
for each row execute function caissa_online_private.prevent_overlapping_arena_participation();

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
  select coalesce(
    p_tournament_id,
    (select participant.tournament_id
      from public.caissa_online_tournament_participants participant
      join public.caissa_online_tournaments tournament on tournament.id = participant.tournament_id
      where participant.user_id = v_user_id
        and participant.state <> 'withdrawn'
        and tournament.configuration->>'betaSeason' = 'S001'
        and tournament.status in ('scheduled', 'registration_open', 'active', 'finishing')
      order by (tournament.status in ('active', 'finishing')) desc, tournament.starts_at
      limit 1),
    (select tournament.id
      from public.caissa_online_tournaments tournament
      where tournament.created_by_clerk_id = p_clerk_id
        and tournament.configuration->>'betaSeason' = 'S001'
        and tournament.status in ('scheduled', 'registration_open', 'active', 'finishing')
      order by (tournament.status in ('active', 'finishing')) desc, tournament.starts_at
      limit 1)
  ) into v_current_id;

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
    'registrationOpensAt', tournament.registration_opens_at,
    'registrationClosesAt', tournament.registration_closes_at,
    'durationMinutes', tournament.duration_minutes,
    'lateJoin', tournament.late_join,
    'capacity', tournament.capacity,
    'minPlayers', tournament.min_players,
    'participantCount', (select count(*) from public.caissa_online_tournament_participants participant
      where participant.tournament_id = tournament.id and participant.state <> 'withdrawn'),
    'joined', exists(select 1 from public.caissa_online_tournament_participants participant
      where participant.tournament_id = tournament.id and participant.user_id = v_user_id
        and participant.state <> 'withdrawn'),
    'myState', (select participant.state from public.caissa_online_tournament_participants participant
      where participant.tournament_id = tournament.id and participant.user_id = v_user_id),
    'organizedByMe', tournament.created_by_clerk_id = p_clerk_id,
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
      'participantCount', (select count(*) from public.caissa_online_tournament_participants participant
        where participant.tournament_id = tournament.id and participant.state <> 'withdrawn'),
      'version', tournament.version,
      'scoringContract', tournament.scoring_contract,
      'finishingPolicy', tournament.finishing_policy,
      'myState', (select participant.state from public.caissa_online_tournament_participants participant
        where participant.tournament_id = tournament.id and participant.user_id = v_user_id),
      'organizedByMe', tournament.created_by_clerk_id = p_clerk_id,
      'rules', coalesce(tournament.configuration->'rules', '[]'::jsonb),
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

-- Keep the reviewed eight-argument S001 function during rollout. The new API
-- calls this ten-argument overload, while an immediate code rollback can still
-- use the previous signature without another database change.
create function public.caissa_online_arena_create(
  p_clerk_id text,
  p_event_id text,
  p_name text,
  p_starts_at timestamptz,
  p_duration_minutes integer,
  p_pool text,
  p_base_ms integer,
  p_increment_ms integer,
  p_capacity integer,
  p_late_join boolean
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_tournament_id uuid;
  v_existing uuid;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_registration_opens_at timestamptz;
begin
  select id into v_user_id from public.users where clerk_id = p_clerk_id and role <> 'online_guest';
  if v_user_id is null then raise exception 'CAISSA_ONLINE_IDENTITY_NOT_FOUND'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_event_id, 701201));
  select id into v_existing from public.caissa_online_tournaments where creation_event_id = p_event_id;
  if v_existing is not null then return public.caissa_online_arena_sync(p_clerk_id, v_existing); end if;
  if p_name is null or pg_catalog.char_length(p_name) not between 3 and 80
    or p_duration_minutes not between 5 and 180
    or p_capacity not between 4 and 64
    or p_late_join is null
    or p_pool not in ('bullet', 'blitz', 'rapid')
    or (p_base_ms, p_increment_ms) not in (
      (60000,0), (60000,1000), (180000,0), (180000,2000),
      (300000,0), (300000,5000), (600000,0), (600000,5000)
    ) or p_starts_at < v_now - interval '30 seconds'
    or p_starts_at > v_now + interval '31 days' then
    raise exception 'CAISSA_ONLINE_ARENA_INVALID';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_user_id::text, 701202));
  if (select count(*) from public.caissa_online_tournaments tournament
      where tournament.owner_user_id = v_user_id
        and tournament.configuration->>'betaSeason' = 'S001'
        and tournament.status in ('scheduled', 'registration_open', 'active', 'finishing')) >= 3 then
    raise exception 'CAISSA_ONLINE_ARENA_CREATION_LIMIT';
  end if;
  if exists (
    select 1 from public.caissa_online_tournaments tournament
    where tournament.owner_user_id = v_user_id
      and tournament.configuration->>'betaSeason' = 'S001'
      and tournament.created_at > v_now - interval '60 seconds'
  ) then raise exception 'CAISSA_ONLINE_ARENA_CREATION_COOLDOWN'; end if;
  if exists (
    select 1 from public.caissa_online_tournaments tournament
    where tournament.owner_user_id = v_user_id
      and tournament.configuration->>'betaSeason' = 'S001'
      and tournament.status in ('scheduled', 'registration_open', 'active', 'finishing')
      and pg_catalog.tstzrange(tournament.starts_at, tournament.ends_at, '[)')
        && pg_catalog.tstzrange(p_starts_at,
          p_starts_at + p_duration_minutes * interval '1 minute', '[)')
  ) then raise exception 'CAISSA_ONLINE_ARENA_CREATION_CONFLICT'; end if;

  v_registration_opens_at := case
    when p_starts_at > v_now + interval '24 hours' then p_starts_at - interval '24 hours'
    else v_now
  end;
  insert into public.caissa_online_tournaments(
    owner_user_id, name, source, format, status, pool, base_ms, increment_ms,
    rated, visibility, starts_at, ends_at, registration_opens_at, registration_closes_at,
    duration_minutes, late_join, capacity, min_players, configuration,
    creation_event_id, created_by_clerk_id
  ) values (
    v_user_id, p_name, 'community', 'arena',
    case when v_registration_opens_at <= v_now then 'registration_open' else 'scheduled' end,
    p_pool, p_base_ms, p_increment_ms, false, 'private', p_starts_at,
    p_starts_at + p_duration_minutes * interval '1 minute', v_registration_opens_at,
    case when p_late_join then p_starts_at + p_duration_minutes * interval '1 minute' else p_starts_at end,
    p_duration_minutes, p_late_join, p_capacity, 4,
    pg_catalog.jsonb_build_object(
      'betaSeason', 'S001', 'publicDirectory', false, 'userCreated', true,
      'chat', false, 'finishingPolicy', 'finish_active_games',
      'rules', pg_catalog.jsonb_build_array(
        'Standard chess', 'Win 2 - Draw 1 - Loss 0',
        'Server-authoritative clocks', 'Active games finish after Arena time expires'
      )
    ), p_event_id, p_clerk_id
  ) returning id into v_tournament_id;
  insert into public.caissa_online_arena_events(tournament_id, event_id, event_type, actor_user_id, payload)
  values (v_tournament_id, p_event_id, 'tournament.created', v_user_id,
    pg_catalog.jsonb_build_object(
      'startsAt', p_starts_at, 'durationMinutes', p_duration_minutes,
      'capacity', p_capacity, 'lateJoin', p_late_join
    ));
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
  -- Serialize this member across different tournaments so two concurrent Join
  -- requests cannot bypass the overlap trigger's committed-row check.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_user_id::text, 701202));
  if exists(select 1 from public.caissa_online_arena_events
    where tournament_id = p_tournament_id and event_id = p_event_id) then
    return public.caissa_online_arena_sync(p_clerk_id, p_tournament_id);
  end if;
  select * into v_tournament from public.caissa_online_tournaments
    where id = p_tournament_id for update;
  if v_tournament.id is null or v_tournament.configuration->>'betaSeason' <> 'S001' then
    raise exception 'CAISSA_ONLINE_ARENA_NOT_FOUND';
  end if;
  if exists (
    select 1 from public.caissa_online_tournament_participants
    where tournament_id = p_tournament_id and user_id = v_user_id and state <> 'withdrawn'
  ) then return public.caissa_online_arena_sync(p_clerk_id, p_tournament_id); end if;
  perform caissa_online_private.arena_reconcile(p_tournament_id);
  select * into v_tournament from public.caissa_online_tournaments where id = p_tournament_id for update;
  if v_tournament.status in ('draft', 'scheduled') then
    raise exception 'CAISSA_ONLINE_ARENA_REGISTRATION_NOT_OPEN';
  elsif v_tournament.status = 'completed' then
    raise exception 'CAISSA_ONLINE_ARENA_COMPLETED';
  elsif v_tournament.status in ('finishing', 'cancelled')
    or v_tournament.registration_closes_at <= pg_catalog.clock_timestamp() then
    raise exception 'CAISSA_ONLINE_ARENA_REGISTRATION_CLOSED';
  elsif v_tournament.status = 'active' and not v_tournament.late_join then
    raise exception 'CAISSA_ONLINE_ARENA_LATE_JOIN_DISABLED';
  elsif v_tournament.status not in ('registration_open', 'active') then
    raise exception 'CAISSA_ONLINE_ARENA_REGISTRATION_CLOSED';
  end if;
  if (select count(*) from public.caissa_online_tournament_participants
      where tournament_id = p_tournament_id and state <> 'withdrawn') >= coalesce(v_tournament.capacity, 64) then
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

create or replace function public.caissa_online_arena_manage(
  p_clerk_id text, p_tournament_id uuid, p_event_id text, p_action text
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_tournament public.caissa_online_tournaments%rowtype;
begin
  select id into v_user_id from public.users where clerk_id = p_clerk_id and role <> 'online_guest';
  if v_user_id is null then raise exception 'CAISSA_ONLINE_IDENTITY_NOT_FOUND'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_tournament_id::text, 701101));
  select * into v_tournament from public.caissa_online_tournaments
    where id = p_tournament_id and configuration->>'betaSeason' = 'S001' for update;
  if v_tournament.id is null then raise exception 'CAISSA_ONLINE_ARENA_NOT_FOUND'; end if;
  if v_tournament.created_by_clerk_id is distinct from p_clerk_id then
    raise exception 'CAISSA_ONLINE_ARENA_ORGANIZER_REQUIRED';
  end if;
  if exists(select 1 from public.caissa_online_arena_events
    where tournament_id = p_tournament_id and event_id = p_event_id) then
    return public.caissa_online_arena_sync(p_clerk_id, p_tournament_id);
  end if;
  if p_action = 'cancel' then
    if v_tournament.status not in ('scheduled', 'registration_open') then
      raise exception 'CAISSA_ONLINE_ARENA_MANAGE_INVALID_STATE';
    end if;
    update public.caissa_online_tournaments
    set status = 'cancelled', cancelled_at = pg_catalog.clock_timestamp(),
      version = version + 1, updated_at = pg_catalog.clock_timestamp()
    where id = p_tournament_id;
  elsif p_action = 'close' then
    if v_tournament.status not in ('active', 'finishing') then
      raise exception 'CAISSA_ONLINE_ARENA_MANAGE_INVALID_STATE';
    end if;
    update public.caissa_online_tournaments
    set status = 'finishing', ends_at = least(ends_at, pg_catalog.clock_timestamp()),
      registration_closes_at = least(registration_closes_at, pg_catalog.clock_timestamp()),
      version = version + 1, updated_at = pg_catalog.clock_timestamp()
    where id = p_tournament_id;
    update public.caissa_online_tournament_participants
    set state = case when state in ('waiting', 'disconnected') then 'registered' else state end,
      waiting_since = null, updated_at = pg_catalog.clock_timestamp()
    where tournament_id = p_tournament_id;
  else
    raise exception 'CAISSA_ONLINE_ARENA_MANAGE_INVALID_ACTION';
  end if;
  insert into public.caissa_online_arena_events(tournament_id, event_id, event_type, actor_user_id, payload)
  values (p_tournament_id, p_event_id,
    case when p_action = 'cancel' then 'tournament.cancelled' else 'tournament.closed' end,
    v_user_id,
    pg_catalog.jsonb_build_object('action', p_action));
  perform caissa_online_private.arena_reconcile(p_tournament_id);
  return caissa_online_private.arena_payload(p_clerk_id, p_tournament_id);
end;
$$;

revoke all on function caissa_online_private.prevent_overlapping_arena_participation() from public, anon, authenticated;
revoke all on function public.caissa_online_arena_create(text, text, text, timestamptz, integer, text, integer, integer, integer, boolean) from public, anon, authenticated;
revoke all on function public.caissa_online_arena_join(text, uuid, text) from public, anon, authenticated;
revoke all on function public.caissa_online_arena_manage(text, uuid, text, text) from public, anon, authenticated;
grant execute on function caissa_online_private.prevent_overlapping_arena_participation() to service_role;
grant execute on function public.caissa_online_arena_create(text, text, text, timestamptz, integer, text, integer, integer, integer, boolean) to service_role;
grant execute on function public.caissa_online_arena_join(text, uuid, text) to service_role;
grant execute on function public.caissa_online_arena_manage(text, uuid, text, text) to service_role;

commit;
