-- CAISSA Prime Time Arenas S001: settle the deadline/write race.
-- The first deadline migration establishes the policy. This follow-up makes the
-- mutation timestamp immediate, rejects/recovers late terminal writes, and
-- gives rating settlement an independent strict-deadline guard.
begin;

set local lock_timeout = '5s';
set local statement_timeout = '90s';

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
  v_event_sequence integer;
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
    where link.tournament_id=p_tournament_id
      and (
        game.status='active'
        or (game.status='completed'
          and coalesce(game.completed_at,p_now)>=v_tournament.ends_at
          and link.scored_at is null)
      )
    order by game.id
    for update of link,game
  loop
    v_flag_at:=case when v_game.status<>'active' or v_game.clock_started_at is null then null
      else v_game.clock_started_at
        +(case when v_game.turn='white' then v_game.white_time_ms
          else v_game.black_time_ms end)*interval '1 millisecond' end;

    select coalesce(max(event.sequence),0)+1 into v_event_sequence
    from public.caissa_online_game_events event where event.game_id=v_game.id;

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
      values(v_game.id,v_event_sequence,'arena-timeout:'||v_game.id::text,
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
      where id=v_game.id and status in('active','completed');
      update public.caissa_online_tournament_games
      set scored_at=null,white_points=null,black_points=null
      where tournament_id=p_tournament_id and game_id=v_game.id;
      insert into public.caissa_online_game_events(
        game_id,sequence,event_id,event_type,payload,server_timestamp)
      values(v_game.id,v_event_sequence,'arena-deadline:'||v_game.id::text,
        'game.aborted',pg_catalog.jsonb_build_object(
          'termination','tournament_deadline','result',null,'pointsAwarded',0,
          'effectiveAt',v_tournament.ends_at,'processedAt',p_now,
          'previousStatus',v_game.status,'previousResult',v_game.result,
          'previousTermination',v_game.termination,
          'message','Arena time expired '||chr(8212)||' Game aborted. No points awarded.'),p_now)
      on conflict(game_id,event_id) do nothing;
      insert into public.caissa_online_arena_events(
        tournament_id,event_id,event_type,payload,created_at)
      values(p_tournament_id,'arena-deadline:'||v_game.id::text,'game.aborted',
        pg_catalog.jsonb_build_object(
          'gameId',v_game.id,'termination','tournament_deadline',
          'whitePoints',0,'blackPoints',0,'effectiveAt',v_tournament.ends_at,
          'previousStatus',v_game.status,'previousResult',v_game.result),p_now)
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

create or replace function caissa_online_private.apply_rating(p_game_id uuid)
returns void
language plpgsql security invoker
set search_path=''
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
  select * into v_game from public.caissa_online_games where id=p_game_id for update;
  if v_game.rating_processed_at is not null or v_game.result is null
    or v_game.status<>'completed' or v_game.termination in('aborted','tournament_deadline')
    or exists(
      select 1 from public.caissa_online_tournaments tournament
      where tournament.id=v_game.tournament_id
        and tournament.finishing_policy='abort_at_deadline'
        and (v_game.completed_at is null or v_game.completed_at>=tournament.ends_at)
    )
  then return; end if;
  if not v_game.rated then
    update public.caissa_online_games set rating_processed_at=pg_catalog.clock_timestamp()
      where id=p_game_id and rating_processed_at is null;
    return;
  end if;
  insert into public.caissa_online_ratings(user_id,pool)
    values(v_game.white_user_id,v_game.pool),(v_game.black_user_id,v_game.pool)
    on conflict(user_id,pool) do nothing;
  perform 1 from public.caissa_online_ratings
    where pool=v_game.pool and user_id in(v_game.white_user_id,v_game.black_user_id)
    order by user_id for update;
  select * into v_white from public.caissa_online_ratings
    where user_id=v_game.white_user_id and pool=v_game.pool;
  select * into v_black from public.caissa_online_ratings
    where user_id=v_game.black_user_id and pool=v_game.pool;
  v_white_score:=case v_game.result when '1-0' then 1 when '0-1' then 0 else 0.5 end;
  v_black_score:=1-v_white_score;
  v_white_delta:=caissa_online_private.rating_delta(
    v_white.rating,v_black.rating,v_white.games,v_white_score);
  v_black_delta:=caissa_online_private.rating_delta(
    v_black.rating,v_white.rating,v_black.games,v_black_score);
  update public.caissa_online_ratings set
    rating=greatest(100,least(4000,rating+v_white_delta)),games=games+1,
    wins=wins+(v_white_score=1)::integer,draws=draws+(v_white_score=0.5)::integer,
    losses=losses+(v_white_score=0)::integer,updated_at=pg_catalog.clock_timestamp()
    where user_id=v_game.white_user_id and pool=v_game.pool;
  update public.caissa_online_ratings set
    rating=greatest(100,least(4000,rating+v_black_delta)),games=games+1,
    wins=wins+(v_black_score=1)::integer,draws=draws+(v_black_score=0.5)::integer,
    losses=losses+(v_black_score=0)::integer,updated_at=pg_catalog.clock_timestamp()
    where user_id=v_game.black_user_id and pool=v_game.pool;
  update public.caissa_online_games set
    white_rating_before=v_white.rating,
    white_rating_after=greatest(100,least(4000,v_white.rating+v_white_delta)),
    white_rating_delta=greatest(100,least(4000,v_white.rating+v_white_delta))-v_white.rating,
    black_rating_before=v_black.rating,
    black_rating_after=greatest(100,least(4000,v_black.rating+v_black_delta)),
    black_rating_delta=greatest(100,least(4000,v_black.rating+v_black_delta))-v_black.rating,
    rating_processed_at=pg_catalog.clock_timestamp()
    where id=p_game_id and rating_processed_at is null;
end;
$$;

-- A mutation that reached the database before the cutoff uses this immediate
-- server timestamp as its effective time. If it reaches this boundary at or
-- after ends_at, the deadline settlement wins and the attempted write is not
-- applied.
create or replace function caissa_online_private.arena_guard_write(
  p_tournament_id uuid,p_effective_at timestamptz)
returns boolean
language plpgsql security invoker set search_path=''
as $$
declare v_policy text; v_ends_at timestamptz;
begin
  if p_tournament_id is null then return true; end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_tournament_id::text,701101));
  select finishing_policy,ends_at into v_policy,v_ends_at
  from public.caissa_online_tournaments where id=p_tournament_id for update;
  if v_policy='abort_at_deadline' and p_effective_at>=v_ends_at then
    perform caissa_online_private.arena_apply_deadline(p_tournament_id,p_effective_at);
    return false;
  end if;
  return true;
end;
$$;

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
  v_now timestamptz;
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

  v_now:=pg_catalog.clock_timestamp();
  if not caissa_online_private.arena_guard_write(v_tournament_id,v_now) then
    return caissa_online_private.game_state(p_clerk_id);
  end if;
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
  v_now timestamptz;
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

  v_now:=pg_catalog.clock_timestamp();
  if not caissa_online_private.arena_guard_write(v_tournament_id,v_now) then
    return caissa_online_private.game_state(p_clerk_id);
  end if;
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

revoke all on function caissa_online_private.arena_apply_deadline(uuid,timestamptz)
  from public,anon,authenticated;
revoke all on function caissa_online_private.arena_guard_write(uuid,timestamptz)
  from public,anon,authenticated;
revoke all on function caissa_online_private.apply_rating(uuid)
  from public,anon,authenticated;
grant execute on function caissa_online_private.arena_apply_deadline(uuid,timestamptz)
  to service_role;
grant execute on function caissa_online_private.arena_guard_write(uuid,timestamptz)
  to service_role;
grant execute on function caissa_online_private.apply_rating(uuid) to service_role;

revoke all on function public.caissa_online_commit_move(
  text,uuid,text,integer,text,text,text,text,text,text,text,text,text,text,boolean,boolean)
  from public,anon,authenticated;
revoke all on function public.caissa_online_finish_game(text,uuid,text,text)
  from public,anon,authenticated;
grant execute on function public.caissa_online_commit_move(
  text,uuid,text,integer,text,text,text,text,text,text,text,text,text,text,boolean,boolean)
  to service_role;
grant execute on function public.caissa_online_finish_game(text,uuid,text,text) to service_role;

alter function caissa_online_private.arena_apply_deadline(uuid,timestamptz)
  set lock_timeout='2s';
alter function caissa_online_private.arena_guard_write(uuid,timestamptz)
  set lock_timeout='2s';
alter function public.caissa_online_commit_move(
  text,uuid,text,integer,text,text,text,text,text,text,text,text,text,text,boolean,boolean)
  set lock_timeout='2s';
alter function public.caissa_online_finish_game(text,uuid,text,text) set lock_timeout='2s';

comment on function caissa_online_private.arena_guard_write(uuid,timestamptz) is
  'Final server-time gate for live Arena mutations; deadline settlement wins at ends_at.';

commit;
