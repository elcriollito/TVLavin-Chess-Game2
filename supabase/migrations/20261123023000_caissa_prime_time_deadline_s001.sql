-- CAISSA Prime Time Arenas S001: exact server-authoritative Arena deadlines.
-- This migration is dormant for existing finish_active_games tournaments. Only
-- operator-created Prime Time occurrences and the Saturdays evening occurrence
-- opt in to abort_at_deadline.
begin;

set local lock_timeout = '5s';
set local statement_timeout = '90s';

alter table public.caissa_online_tournaments
  drop constraint if exists caissa_online_tournaments_finishing_policy_check;
alter table public.caissa_online_tournaments
  add constraint caissa_online_tournaments_finishing_policy_check
  check (finishing_policy in ('finish_active_games','abort_at_deadline'));

alter table public.caissa_online_games
  drop constraint if exists caissa_online_games_termination_check;
alter table public.caissa_online_games
  add constraint caissa_online_games_termination_check
  check (termination is null or termination in (
    'checkmate','resignation','timeout','draw','stalemate','repetition',
    'insufficient-material','agreement','aborted','tournament_deadline'
  )),
  add column if not exists arena_deadline_processed_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname='caissa_online_games_deadline_abort_check'
      and conrelid='public.caissa_online_games'::pg_catalog.regclass
  ) then
    alter table public.caissa_online_games
      add constraint caissa_online_games_deadline_abort_check
      check (termination<>'tournament_deadline'
        or (status='aborted' and result is null and tournament_id is not null));
  end if;
end $$;

create index if not exists caissa_online_games_active_tournament_idx
  on public.caissa_online_games(tournament_id,id)
  where status='active' and tournament_id is not null;

-- Lock order for deadline settlement is tournament advisory lock -> tournament
-- row -> linked game rows ordered by UUID. A clock flag that became effective
-- before ends_at remains a valid timeout. Every other unfinished game is an
-- unscored deadline abort. Replays are idempotent through terminal status and
-- unique event ids.
create or replace function caissa_online_private.arena_apply_deadline(
  p_tournament_id uuid,p_now timestamptz default pg_catalog.clock_timestamp())
returns integer
language plpgsql
security invoker
set search_path=''
as $$
declare
  v_tournament public.caissa_online_tournaments%rowtype;
  v_game public.caissa_online_games%rowtype;
  v_flag_at timestamptz;
  v_result text;
  v_terminal_count integer:=0;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_tournament_id::text,701101));
  select * into v_tournament
  from public.caissa_online_tournaments
  where id=p_tournament_id
  for update;

  if v_tournament.id is null
    or v_tournament.play_category<>'live'
    or v_tournament.finishing_policy<>'abort_at_deadline'
    or v_tournament.status not in('active','finishing')
    or p_now<v_tournament.ends_at
  then return 0; end if;

  if v_tournament.status='active' then
    update public.caissa_online_tournaments
    set status='finishing',version=version+1,updated_at=p_now
    where id=p_tournament_id and status='active';
  end if;

  for v_game in
    select game.*
    from public.caissa_online_tournament_games link
    join public.caissa_online_games game on game.id=link.game_id
    where link.tournament_id=p_tournament_id and game.status='active'
    order by game.id
    for update of link,game
  loop
    v_flag_at:=case when v_game.clock_started_at is null then null
      else v_game.clock_started_at
        +(case when v_game.turn='white' then v_game.white_time_ms
          else v_game.black_time_ms end)*interval '1 millisecond' end;

    if v_flag_at is not null and v_flag_at<v_tournament.ends_at and v_flag_at<=p_now then
      v_result:=caissa_online_private.timeout_result(
        v_game.turn,v_game.white_can_mate,v_game.black_can_mate);
      update public.caissa_online_games
      set status='completed',result=v_result,termination='timeout',
        white_time_ms=case when v_game.turn='white' then 0 else white_time_ms end,
        black_time_ms=case when v_game.turn='black' then 0 else black_time_ms end,
        clock_started_at=null,completed_at=v_flag_at,version=version+1,
        updated_at=p_now,
        pgn=case when pgn='' then '[Event "CAISSA Online"]'||E'\n'
            ||'[Result "'||v_result||'"]'||E'\n\n'||v_result
          else pg_catalog.regexp_replace(pg_catalog.regexp_replace(
            pgn,'\[Result "\*"\]','[Result "'||v_result||'"]'),'\s\*\s*$',' '||v_result) end
      where id=v_game.id and status='active';
      insert into public.caissa_online_game_events(
        game_id,sequence,event_id,event_type,payload,server_timestamp)
      values(v_game.id,v_game.ply+1,'arena-timeout:'||v_game.id::text,
        'game.result',pg_catalog.jsonb_build_object(
          'result',v_result,'termination','timeout','effectiveAt',v_flag_at,
          'processedAt',p_now),p_now)
      on conflict(game_id,event_id) do nothing;
      perform caissa_online_private.apply_rating(v_game.id);
    else
      update public.caissa_online_games
      set status='aborted',result=null,termination='tournament_deadline',
        clock_started_at=null,completed_at=v_tournament.ends_at,
        arena_deadline_processed_at=p_now,version=version+1,updated_at=p_now
      where id=v_game.id and status='active';
      update public.caissa_online_tournament_games
      set scored_at=null,white_points=null,black_points=null
      where tournament_id=p_tournament_id and game_id=v_game.id;
      insert into public.caissa_online_game_events(
        game_id,sequence,event_id,event_type,payload,server_timestamp)
      values(v_game.id,v_game.ply+1,'arena-deadline:'||v_game.id::text,
        'game.aborted',pg_catalog.jsonb_build_object(
          'termination','tournament_deadline','result',null,'pointsAwarded',0,
          'effectiveAt',v_tournament.ends_at,'processedAt',p_now,
          'message','Arena time expired — Game aborted. No points awarded.'),p_now)
      on conflict(game_id,event_id) do nothing;
      insert into public.caissa_online_arena_events(
        tournament_id,event_id,event_type,payload,created_at)
      values(p_tournament_id,'arena-deadline:'||v_game.id::text,'game.aborted',
        pg_catalog.jsonb_build_object(
          'gameId',v_game.id,'termination','tournament_deadline',
          'whitePoints',0,'blackPoints',0,'effectiveAt',v_tournament.ends_at),p_now)
      on conflict(tournament_id,event_id) do nothing;
    end if;
    v_terminal_count:=v_terminal_count+1;
  end loop;

  update public.caissa_online_arena_pairings pairing
  set state='finished',finished_at=v_tournament.ends_at,updated_at=p_now
  where pairing.tournament_id=p_tournament_id
    and pairing.state in('waiting','assigned','ready','active')
    and exists(select 1 from public.caissa_online_games game
      where game.id=pairing.game_id and game.status in('completed','aborted'));
  update public.caissa_online_tournament_participants
  set state=case when state='withdrawn' then 'withdrawn' else 'registered' end,
    waiting_since=null,disconnected_at=null,updated_at=p_now
  where tournament_id=p_tournament_id;
  update public.caissa_online_presence presence
  set active_game_id=null,status='online',last_seen_at=p_now
  where exists(select 1 from public.caissa_online_games game
    where game.id=presence.active_game_id and game.tournament_id=p_tournament_id
      and game.status in('completed','aborted'));
  insert into public.caissa_online_arena_events(
    tournament_id,event_id,event_type,payload,created_at)
  values(p_tournament_id,'arena-deadline:'||p_tournament_id::text,
    'tournament.deadline-settled',pg_catalog.jsonb_build_object(
      'endsAt',v_tournament.ends_at,'processedAt',p_now,
      'terminalGames',v_terminal_count),p_now)
  on conflict(tournament_id,event_id) do nothing;
  return v_terminal_count;
end;
$$;

-- Score only terminal results whose server completion timestamp precedes the
-- strict Arena cutoff. Deadline-aborted games remain unscored and do not alter
-- participant W/D/L or game counts.
create or replace function caissa_online_private.arena_score_game(p_game_id uuid)
returns boolean
language plpgsql
security invoker
set search_path=''
as $$
declare
  v_game public.caissa_online_games%rowtype;
  v_link public.caissa_online_tournament_games%rowtype;
  v_tournament public.caissa_online_tournaments%rowtype;
  v_white_points smallint;
  v_black_points smallint;
begin
  select * into v_link from public.caissa_online_tournament_games
    where game_id=p_game_id;
  if v_link.game_id is null then return false; end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_link.tournament_id::text,701101));
  select * into v_tournament from public.caissa_online_tournaments
    where id=v_link.tournament_id for update;
  select * into v_link from public.caissa_online_tournament_games
    where tournament_id=v_link.tournament_id and game_id=p_game_id for update;
  select * into v_game from public.caissa_online_games where id=p_game_id for update;
  if v_game.id is null or v_game.status<>'completed' or v_game.result is null
    or v_link.scored_at is not null
    or (v_tournament.finishing_policy='abort_at_deadline'
      and (v_game.completed_at is null or v_game.completed_at>=v_tournament.ends_at))
  then return false; end if;
  if v_tournament.scoring_contract<>'arena-s001-2-1-0' then
    raise exception 'CAISSA_ONLINE_ARENA_SCORING_CONTRACT';
  end if;

  v_white_points:=case v_game.result when '1-0' then 2 when '1/2-1/2' then 1 else 0 end;
  v_black_points:=case v_game.result when '0-1' then 2 when '1/2-1/2' then 1 else 0 end;
  update public.caissa_online_tournament_participants participant
  set score=score+case when participant.user_id=v_game.white_user_id
        then v_white_points else v_black_points end,
      games_played=games_played+1,
      wins=wins+case
        when participant.user_id=v_game.white_user_id and v_white_points=2 then 1
        when participant.user_id=v_game.black_user_id and v_black_points=2 then 1 else 0 end,
      draws=draws+case when v_game.result='1/2-1/2' then 1 else 0 end,
      losses=losses+case
        when participant.user_id=v_game.white_user_id and v_white_points=0 then 1
        when participant.user_id=v_game.black_user_id and v_black_points=0 then 1 else 0 end,
      state=case when participant.state='withdrawn' then 'withdrawn'
        when v_tournament.status='active'
          and v_tournament.ends_at>pg_catalog.clock_timestamp() then 'resting'
        else 'registered' end,
      waiting_since=null,disconnected_at=null,updated_at=pg_catalog.clock_timestamp()
  where participant.tournament_id=v_link.tournament_id
    and participant.user_id in(v_game.white_user_id,v_game.black_user_id);
  update public.caissa_online_tournament_games
  set scored_at=pg_catalog.clock_timestamp(),white_points=v_white_points,black_points=v_black_points
  where tournament_id=v_link.tournament_id and game_id=p_game_id and scored_at is null;
  update public.caissa_online_arena_pairings
  set state='finished',finished_at=coalesce(v_game.completed_at,pg_catalog.clock_timestamp()),
    updated_at=pg_catalog.clock_timestamp()
  where id=v_link.pairing_id and state<>'finished';
  update public.caissa_online_tournaments
  set version=version+1,updated_at=pg_catalog.clock_timestamp()
  where id=v_link.tournament_id;
  insert into public.caissa_online_arena_events(tournament_id,event_id,event_type,payload)
  values(v_link.tournament_id,'arena-result:'||p_game_id::text,'game.scored',
    pg_catalog.jsonb_build_object('gameId',p_game_id,'result',v_game.result,
      'whitePoints',v_white_points,'blackPoints',v_black_points,
      'nextState',case when v_tournament.status='active' then 'resting' else 'registered' end))
  on conflict(tournament_id,event_id) do nothing;
  return true;
end;
$$;

create or replace function caissa_online_private.arena_reconcile(p_tournament_id uuid)
returns void
language plpgsql
security invoker
set search_path=''
as $$
declare
  v_tournament public.caissa_online_tournaments%rowtype;
  v_game_id uuid;
  v_count integer;
  v_now timestamptz:=pg_catalog.clock_timestamp();
  v_changed boolean:=false;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_tournament_id::text,701101));
  select * into v_tournament from public.caissa_online_tournaments
    where id=p_tournament_id for update;
  if v_tournament.id is null or v_tournament.status in('completed','cancelled','draft') then return; end if;

  if v_tournament.status='scheduled'
    and coalesce(v_tournament.registration_opens_at,v_tournament.starts_at)<=v_now then
    update public.caissa_online_tournaments
    set status='registration_open',version=version+1,updated_at=v_now
    where id=p_tournament_id;
    v_tournament.status:='registration_open';
  end if;
  if v_tournament.status='registration_open' and v_tournament.starts_at<=v_now then
    select count(*) into v_count from public.caissa_online_tournament_participants
    where tournament_id=p_tournament_id and state<>'withdrawn';
    if v_count<v_tournament.min_players then
      update public.caissa_online_tournaments
      set status='cancelled',cancelled_at=v_now,version=version+1,updated_at=v_now
      where id=p_tournament_id;
      insert into public.caissa_online_arena_events(tournament_id,event_id,event_type,payload)
      values(p_tournament_id,'arena-cancel:'||p_tournament_id::text,'tournament.cancelled',
        pg_catalog.jsonb_build_object('reason','minimum-not-met','participants',v_count))
      on conflict(tournament_id,event_id) do nothing;
      return;
    end if;
    update public.caissa_online_tournaments
    set status='active',version=version+1,updated_at=v_now where id=p_tournament_id;
    update public.caissa_online_tournament_participants
    set state=case when state='withdrawn' then state else 'waiting' end,
      waiting_since=case when state='withdrawn' then null else v_now end,updated_at=v_now
    where tournament_id=p_tournament_id;
    v_tournament.status:='active';
  end if;

  if v_tournament.finishing_policy='abort_at_deadline'
    and v_tournament.status in('active','finishing') and v_tournament.ends_at<=v_now then
    perform caissa_online_private.arena_apply_deadline(p_tournament_id,v_now);
    select * into v_tournament from public.caissa_online_tournaments
      where id=p_tournament_id for update;
  elsif v_tournament.status='active' and v_tournament.ends_at<=v_now then
    update public.caissa_online_tournaments
    set status='finishing',version=version+1,updated_at=v_now where id=p_tournament_id;
    update public.caissa_online_tournament_participants
    set state=case when state in('waiting','disconnected','resting') then 'registered' else state end,
      waiting_since=null,updated_at=v_now where tournament_id=p_tournament_id;
    v_tournament.status:='finishing';
  end if;

  for v_game_id in
    select game.id
    from public.caissa_online_tournament_games link
    join public.caissa_online_games game on game.id=link.game_id
    where link.tournament_id=p_tournament_id and link.scored_at is null
      and game.status='completed' and game.result is not null
    order by game.completed_at,game.id
  loop
    v_changed:=caissa_online_private.arena_score_game(v_game_id) or v_changed;
  end loop;

  if v_tournament.status='active' then
    update public.caissa_online_tournament_participants participant
    set state='disconnected',waiting_since=null,
      disconnected_at=coalesce(participant.disconnected_at,v_now),updated_at=v_now
    where participant.tournament_id=p_tournament_id and participant.state='waiting'
      and not exists(select 1 from public.caissa_online_presence presence
        where presence.user_id=participant.user_id and presence.expires_at>v_now);
    perform caissa_online_private.arena_pair_waiters(p_tournament_id);
  elsif v_tournament.status='finishing' and not exists(
    select 1 from public.caissa_online_tournament_games link
    join public.caissa_online_games game on game.id=link.game_id
    where link.tournament_id=p_tournament_id and game.status='active') then
    with ranked as (
      select participant.user_id,row_number() over(order by participant.score desc,
        participant.wins desc,participant.draws desc,participant.joined_at,
        participant.user_id) final_rank
      from public.caissa_online_tournament_participants participant
      where participant.tournament_id=p_tournament_id
    )
    update public.caissa_online_tournament_participants participant
    set rank=ranked.final_rank,updated_at=v_now
    from ranked where participant.tournament_id=p_tournament_id
      and participant.user_id=ranked.user_id;
    update public.caissa_online_tournaments
    set status='completed',completed_at=v_now,version=version+1,updated_at=v_now
    where id=p_tournament_id and status='finishing';
    insert into public.caissa_online_arena_events(tournament_id,event_id,event_type)
    values(p_tournament_id,'arena-complete:'||p_tournament_id::text,'tournament.completed')
    on conflict(tournament_id,event_id) do nothing;
  end if;
end;
$$;

-- The general Online state boundary enforces an Arena cutoff before resolving
-- an ordinary live-game timeout. Daily games are excluded by policy/category.
create or replace function public.caissa_online_state(p_clerk_id text)
returns jsonb
language plpgsql
security invoker
set search_path=''
as $$
declare
  v_game public.caissa_online_games%rowtype;
  v_result text;
  v_tournament_id uuid;
  v_now timestamptz:=pg_catalog.statement_timestamp();
begin
  for v_tournament_id in
    select distinct tournament.id
    from public.caissa_online_games game
    join public.caissa_online_tournaments tournament on tournament.id=game.tournament_id
    where game.status='active' and p_clerk_id in(game.white_clerk_id,game.black_clerk_id)
      and tournament.play_category='live'
      and tournament.finishing_policy='abort_at_deadline'
      and tournament.ends_at<=v_now
    order by tournament.id
  loop perform caissa_online_private.arena_reconcile(v_tournament_id); end loop;

  select * into v_game from public.caissa_online_games
  where status='active' and p_clerk_id in(white_clerk_id,black_clerk_id)
  order by created_at desc limit 1 for update;
  if v_game.id is not null and v_game.clock_started_at is not null
    and v_game.clock_started_at
      +(case when v_game.turn='white' then v_game.white_time_ms else v_game.black_time_ms end)
        *interval '1 millisecond'<=v_now then
    v_result:=caissa_online_private.timeout_result(
      v_game.turn,v_game.white_can_mate,v_game.black_can_mate);
    update public.caissa_online_games
    set status='completed',result=v_result,termination='timeout',
      white_time_ms=case when v_game.turn='white' then 0 else white_time_ms end,
      black_time_ms=case when v_game.turn='black' then 0 else black_time_ms end,
      clock_started_at=null,completed_at=v_now,version=version+1,updated_at=v_now,
      pgn=case when pgn='' then '[Event "CAISSA Online"]'||E'\n'
          ||'[Result "'||v_result||'"]'||E'\n\n'||v_result
        else pg_catalog.regexp_replace(pg_catalog.regexp_replace(
          pgn,'\[Result "\*"\]','[Result "'||v_result||'"]'),'\s\*\s*$',' '||v_result) end
    where id=v_game.id and status='active';
    insert into public.caissa_online_game_events(game_id,sequence,event_id,event_type,payload)
    values(v_game.id,v_game.ply+1,'timeout:'||v_game.id::text||':'||v_game.version::text,
      'game.result',pg_catalog.jsonb_build_object('result',v_result,'termination','timeout'))
    on conflict(game_id,event_id) do nothing;
    perform caissa_online_private.apply_rating(v_game.id);
    update public.caissa_online_presence set active_game_id=null,status='online'
      where active_game_id=v_game.id;
    if v_game.tournament_id is not null then
      perform caissa_online_private.arena_reconcile(v_game.tournament_id);
    end if;
  end if;
  return caissa_online_private.game_state(p_clerk_id);
end;
$$;

-- Guard every live move at the database transaction boundary. The reconciler
-- runs before the game row lock, using the same tournament advisory lock as
-- pairing and Cron recovery.
create or replace function public.caissa_online_commit_move(
  p_clerk_id text,p_game_id uuid,p_event_id text,p_expected_version integer,
  p_from text,p_to text,p_promotion text,p_san text,p_uci text,p_next_fen text,
  p_next_turn text,p_result text,p_termination text,p_pgn text,
  p_white_can_mate boolean,p_black_can_mate boolean)
returns jsonb
language plpgsql security invoker set search_path=''
as $$
declare
  v_game public.caissa_online_games%rowtype;
  v_actor uuid;
  v_elapsed integer;
  v_white_ms integer;
  v_black_ms integer;
  v_sequence integer;
  v_result text;
  v_tournament_id uuid;
  v_now timestamptz:=pg_catalog.statement_timestamp();
begin
  select tournament_id into v_tournament_id from public.caissa_online_games where id=p_game_id;
  if v_tournament_id is not null then
    perform caissa_online_private.arena_reconcile(v_tournament_id);
  end if;
  select * into v_game from public.caissa_online_games where id=p_game_id for update;
  if v_game.id is null then raise exception 'CAISSA_ONLINE_GAME_NOT_FOUND'; end if;
  if p_clerk_id not in(v_game.white_clerk_id,v_game.black_clerk_id)
    then raise exception 'CAISSA_ONLINE_NOT_PARTICIPANT'; end if;
  if exists(select 1 from public.caissa_online_game_events
    where game_id=p_game_id and event_id=p_event_id)
    then return caissa_online_private.game_state(p_clerk_id); end if;
  if v_game.status='aborted' and v_game.termination='tournament_deadline'
    then return caissa_online_private.game_state(p_clerk_id); end if;
  if v_game.status<>'active' then raise exception 'CAISSA_ONLINE_GAME_NOT_ACTIVE'; end if;
  if v_game.version<>p_expected_version then raise exception 'CAISSA_ONLINE_STALE_VERSION'; end if;
  if (v_game.turn='white' and p_clerk_id<>v_game.white_clerk_id)
    or (v_game.turn='black' and p_clerk_id<>v_game.black_clerk_id)
    then raise exception 'CAISSA_ONLINE_NOT_YOUR_TURN'; end if;
  if p_from!~'^[a-h][1-8]$' or p_to!~'^[a-h][1-8]$'
    or p_next_turn not in('white','black') or p_white_can_mate is null
    or p_black_can_mate is null or pg_catalog.octet_length(p_pgn)>524288
    or v_game.ply>=6000 then raise exception 'CAISSA_ONLINE_INVALID_MOVE'; end if;
  v_elapsed:=greatest(0,pg_catalog.floor(extract(
    epoch from(v_now-v_game.clock_started_at))*1000))::integer;
  v_white_ms:=v_game.white_time_ms; v_black_ms:=v_game.black_time_ms;
  if v_game.turn='white' then v_white_ms:=greatest(0,v_white_ms-v_elapsed);
  else v_black_ms:=greatest(0,v_black_ms-v_elapsed); end if;
  if (v_game.turn='white' and v_white_ms=0) or (v_game.turn='black' and v_black_ms=0) then
    v_result:=caissa_online_private.timeout_result(
      v_game.turn,v_game.white_can_mate,v_game.black_can_mate);
    update public.caissa_online_games
    set status='completed',result=v_result,termination='timeout',white_time_ms=v_white_ms,
      black_time_ms=v_black_ms,completed_at=v_now,clock_started_at=null,
      version=version+1,updated_at=v_now,
      pgn=case when pgn='' then '[Event "CAISSA Online"]'||E'\n'
          ||'[Result "'||v_result||'"]'||E'\n\n'||v_result
        else pg_catalog.regexp_replace(pg_catalog.regexp_replace(
          pgn,'\[Result "\*"\]','[Result "'||v_result||'"]'),'\s\*\s*$',' '||v_result) end
    where id=p_game_id;
    select id into v_actor from public.users where clerk_id=p_clerk_id;
    insert into public.caissa_online_game_events(game_id,sequence,event_id,event_type,actor_user_id,payload)
    values(p_game_id,v_game.ply+1,p_event_id,'game.result',v_actor,
      pg_catalog.jsonb_build_object('result',v_result,'termination','timeout'));
    perform caissa_online_private.apply_rating(p_game_id);
    update public.caissa_online_presence set active_game_id=null,status='online'
      where active_game_id=p_game_id;
    if v_tournament_id is not null then
      perform caissa_online_private.arena_reconcile(v_tournament_id);
    end if;
    return caissa_online_private.game_state(p_clerk_id);
  end if;
  if v_game.turn='white' then v_white_ms:=v_white_ms+v_game.increment_ms;
  else v_black_ms:=v_black_ms+v_game.increment_ms; end if;
  select id into v_actor from public.users where clerk_id=p_clerk_id;
  v_sequence:=v_game.ply+1;
  update public.caissa_online_games set
    fen=p_next_fen,moves=moves||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'ply',v_sequence,'from',p_from,'to',p_to,'promotion',p_promotion,
      'san',p_san,'uci',p_uci,'color',v_game.turn,'serverTimestamp',v_now)),
    pgn=p_pgn,white_can_mate=p_white_can_mate,black_can_mate=p_black_can_mate,
    ply=v_sequence,turn=p_next_turn,version=version+1,white_time_ms=v_white_ms,
    black_time_ms=v_black_ms,clock_started_at=case when p_result is null then v_now else null end,
    draw_offer_by=null,status=case when p_result is null then status else 'completed' end,
    result=p_result,termination=p_termination,
    completed_at=case when p_result is null then null else v_now end,updated_at=v_now
  where id=p_game_id;
  insert into public.caissa_online_game_events(game_id,sequence,event_id,event_type,actor_user_id,payload)
  values(p_game_id,v_sequence,p_event_id,
    case when p_result is null then 'game.moveAccepted' else 'game.result' end,
    v_actor,pg_catalog.jsonb_build_object('from',p_from,'to',p_to,'san',p_san));
  if p_result is not null then
    perform caissa_online_private.apply_rating(p_game_id);
    update public.caissa_online_presence set active_game_id=null,status='online'
      where active_game_id=p_game_id;
    if v_tournament_id is not null then
      perform caissa_online_private.arena_reconcile(v_tournament_id);
    end if;
  end if;
  return caissa_online_private.game_state(p_clerk_id);
end;
$$;

create or replace function public.caissa_online_finish_game(
  p_clerk_id text,p_game_id uuid,p_event_id text,p_reason text)
returns jsonb
language plpgsql security invoker set search_path=''
as $$
declare
  v_game public.caissa_online_games%rowtype;
  v_actor uuid;
  v_result text;
  v_termination text;
  v_tournament_id uuid;
  v_now timestamptz:=pg_catalog.statement_timestamp();
begin
  select tournament_id into v_tournament_id from public.caissa_online_games where id=p_game_id;
  if v_tournament_id is not null then
    perform caissa_online_private.arena_reconcile(v_tournament_id);
  end if;
  select * into v_game from public.caissa_online_games where id=p_game_id for update;
  if v_game.id is null then raise exception 'CAISSA_ONLINE_GAME_NOT_FOUND'; end if;
  if p_clerk_id not in(v_game.white_clerk_id,v_game.black_clerk_id)
    then raise exception 'CAISSA_ONLINE_NOT_PARTICIPANT'; end if;
  if exists(select 1 from public.caissa_online_game_events
    where game_id=p_game_id and event_id=p_event_id)
    then return caissa_online_private.game_state(p_clerk_id); end if;
  if v_game.status<>'active' then return caissa_online_private.game_state(p_clerk_id); end if;
  if v_game.clock_started_at is not null
    and v_game.clock_started_at
      +(case when v_game.turn='white' then v_game.white_time_ms else v_game.black_time_ms end)
        *interval '1 millisecond'<=v_now then
    v_result:=caissa_online_private.timeout_result(
      v_game.turn,v_game.white_can_mate,v_game.black_can_mate);
    v_termination:='timeout';
  elsif p_reason='agreement' then
    if v_game.draw_offer_by is null or v_game.draw_offer_by=p_clerk_id
      then raise exception 'CAISSA_ONLINE_DRAW_OFFER_REQUIRED'; end if;
    v_result:='1/2-1/2'; v_termination:='agreement';
  elsif p_reason='resignation' then
    v_result:=case when p_clerk_id=v_game.white_clerk_id then '0-1' else '1-0' end;
    v_termination:='resignation';
  else raise exception 'CAISSA_ONLINE_INVALID_TERMINATION'; end if;
  select id into v_actor from public.users where clerk_id=p_clerk_id;
  update public.caissa_online_games
  set status='completed',result=v_result,termination=v_termination,completed_at=v_now,
    clock_started_at=null,version=version+1,updated_at=v_now,
    pgn=case when pgn='' then '[Event "CAISSA Online"]'||E'\n'
        ||'[Result "'||v_result||'"]'||E'\n\n'||v_result
      else pg_catalog.regexp_replace(pg_catalog.regexp_replace(
        pgn,'\[Result "\*"\]','[Result "'||v_result||'"]'),'\s\*\s*$',' '||v_result) end
  where id=p_game_id;
  insert into public.caissa_online_game_events(game_id,sequence,event_id,event_type,actor_user_id,payload)
  values(p_game_id,v_game.ply+1,p_event_id,'game.result',v_actor,
    pg_catalog.jsonb_build_object('result',v_result,'termination',v_termination));
  perform caissa_online_private.apply_rating(p_game_id);
  update public.caissa_online_presence set active_game_id=null,status='online'
    where active_game_id=p_game_id;
  if v_tournament_id is not null then
    perform caissa_online_private.arena_reconcile(v_tournament_id);
  end if;
  return caissa_online_private.game_state(p_clerk_id);
end;
$$;

-- Saturdays keeps its stable series/occurrence keys. Only the existing evening
-- slot joins the Prime Time cutoff contract; the morning occurrence remains on
-- finish_active_games.
create or replace function caissa_online_private.weekly_generate(
  p_now timestamptz,p_weeks integer default 4)
returns integer language plpgsql security invoker set search_path=''
as $$
declare v_series public.caissa_online_tournament_series%rowtype; v_first date; v_date date; v_slot jsonb;
  v_start timestamptz; v_end timestamptz; v_open timestamptz; v_key text; v_count integer:=0; v_week integer;
  v_policy text;
begin
  for v_series in select * from public.caissa_online_tournament_series
    where enabled and series_kind='official' and slug='saturdays-of-chess-s001'
    order by slug for update loop
    v_first:=greatest((p_now at time zone v_series.timezone)::date,v_series.launch_not_before);
    v_first:=v_first+((v_series.weekday-extract(dow from v_first)::integer+7)%7);
    for v_week in 0..least(greatest(p_weeks,1),12)-1 loop
      v_date:=v_first+(v_week*7);
      for v_slot in select value from pg_catalog.jsonb_array_elements(v_series.slots) loop
        if exists(select 1 from public.caissa_online_tournament_series_skips skip
          where skip.series_id=v_series.id and skip.local_date=v_date and skip.slot_id=v_slot->>'id')
          then continue; end if;
        v_start:=(v_date+pg_catalog.make_interval(hours=>(v_slot->>'hour')::integer,
          mins=>(v_slot->>'minute')::integer)) at time zone v_series.timezone;
        v_end:=v_start+v_series.duration_minutes*interval '1 minute';
        v_open:=v_start-v_series.registration_lead_days*interval '1 day';
        v_key:=v_series.slug||':'||v_date::text||':'||(v_slot->>'id');
        v_policy:=case when v_slot->>'id'='evening' then 'abort_at_deadline'
          else 'finish_active_games' end;
        insert into public.caissa_online_tournaments(
          name,source,format,status,pool,base_ms,increment_ms,rated,visibility,
          starts_at,ends_at,registration_opens_at,registration_closes_at,duration_minutes,
          late_join,capacity,min_players,configuration,created_by_clerk_id,play_category,
          series_id,series_occurrence_key,finishing_policy)
        values(v_slot->>'label'||' · '||v_date::text,'official','arena',
          case when v_open<=p_now then 'registration_open' else 'scheduled' end,
          v_series.pool,v_series.base_ms,v_series.increment_ms,v_series.rated,'private',
          v_start,v_end,v_open,case when v_series.late_join then v_end else v_start end,
          v_series.duration_minutes,v_series.late_join,v_series.capacity,v_series.min_players,
          pg_catalog.jsonb_build_object('betaSeason','S001','publicDirectory',false,
            'officialSeries',v_series.slug,'timeZone',v_series.timezone,
            'slotId',v_slot->>'id','featured',true,'chat',false,
            'finishingPolicy',v_policy),
          'system:'||v_series.slug,'live',v_series.id,v_key,v_policy)
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

-- Private operator series opt in only through the reviewed Prime Time slug
-- namespace. Other official/operator series keep the existing policy.
create or replace function caissa_online_private.official_flexible_generate(
  p_now timestamptz,p_limit integer default 100)
returns integer language plpgsql security invoker set search_path=''
as $$
declare v_series public.caissa_online_tournament_series%rowtype; v_candidate record;
  v_count integer:=0; v_next timestamptz; v_end timestamptz; v_open timestamptz; v_policy text;
begin
  for v_series in select * from public.caissa_online_tournament_series
    where series_kind='official' and slug<>'saturdays-of-chess-s001'
      and enabled and next_generation_at<=p_now
    order by id for update skip locked loop
    v_policy:=case when v_series.slug like 'caissa-prime-time-%-s001'
      then 'abort_at_deadline' else 'finish_active_games' end;
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
        series_id,series_occurrence_key,finishing_policy)
      values(v_candidate.label||' · '||v_candidate.local_date::text,'official','arena',
        case when v_open<=p_now then 'registration_open' else 'scheduled' end,
        v_series.pool,v_series.base_ms,v_series.increment_ms,false,'private',
        v_candidate.starts_at,v_end,v_open,
        case when v_series.late_join then v_end else v_candidate.starts_at end,
        v_series.duration_minutes,v_series.late_join,v_series.capacity,v_series.min_players,
        pg_catalog.jsonb_build_object('betaSeason','S001','publicDirectory',false,
          'officialSeries',v_series.slug,'timeZone',v_series.timezone,
          'slotId',v_candidate.slot_id,'featured',true,'chat',false,
          'finishingPolicy',v_policy),
        'system:'||v_series.slug,'live',v_series.id,v_candidate.occurrence_key,v_policy)
      on conflict(series_occurrence_key) where series_occurrence_key is not null do nothing;
      if found then
        v_count:=v_count+1;
        update public.caissa_online_tournament_series
        set generated_count=generated_count+1,last_occurrence_at=v_candidate.starts_at,
          last_generated_at=p_now,updated_at=p_now where id=v_series.id;
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
    update public.caissa_online_tournament_series
    set last_generated_at=p_now,
      next_generation_at=case when v_next is null then null
        else greatest(p_now,v_next) end,updated_at=p_now
    where id=v_series.id;
  end loop;
  return v_count;
end;
$$;

revoke all on function caissa_online_private.arena_apply_deadline(uuid,timestamptz)
  from public,anon,authenticated;
grant execute on function caissa_online_private.arena_apply_deadline(uuid,timestamptz)
  to service_role;
revoke all on function caissa_online_private.arena_score_game(uuid)
  from public,anon,authenticated;
revoke all on function caissa_online_private.arena_reconcile(uuid)
  from public,anon,authenticated;
grant execute on function caissa_online_private.arena_score_game(uuid) to service_role;
grant execute on function caissa_online_private.arena_reconcile(uuid) to service_role;
revoke all on function public.caissa_online_state(text) from public,anon,authenticated;
revoke all on function public.caissa_online_commit_move(
  text,uuid,text,integer,text,text,text,text,text,text,text,text,text,text,boolean,boolean)
  from public,anon,authenticated;
revoke all on function public.caissa_online_finish_game(text,uuid,text,text)
  from public,anon,authenticated;
grant execute on function public.caissa_online_state(text) to service_role;
grant execute on function public.caissa_online_commit_move(
  text,uuid,text,integer,text,text,text,text,text,text,text,text,text,text,boolean,boolean)
  to service_role;
grant execute on function public.caissa_online_finish_game(text,uuid,text,text) to service_role;

alter function caissa_online_private.arena_apply_deadline(uuid,timestamptz)
  set lock_timeout='2s';
alter function caissa_online_private.arena_reconcile(uuid) set lock_timeout='2s';
alter function public.caissa_online_state(text) set lock_timeout='2s';
alter function public.caissa_online_commit_move(
  text,uuid,text,integer,text,text,text,text,text,text,text,text,text,text,boolean,boolean)
  set lock_timeout='2s';
alter function public.caissa_online_finish_game(text,uuid,text,text) set lock_timeout='2s';

comment on function caissa_online_private.arena_apply_deadline(uuid,timestamptz) is
  'Atomically settles pre-deadline clock flags and aborts every other unfinished strict-deadline Arena game without points or ratings.';
comment on column public.caissa_online_games.arena_deadline_processed_at is
  'Server processing timestamp for an audit-preserved tournament_deadline abort.';

commit;
