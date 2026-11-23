-- CAISSA Prime Time Arenas S001: keep deadline-aborted PGN canonical.
--
-- The earlier deadline migrations are already installed in the isolated Beta
-- project. This forward migration leaves their history intact, normalizes any
-- existing deadline-aborted rows, and updates future deadline recovery without
-- changing scoring, rating, locking, audit, or non-strict tournament behavior.
begin;

set local lock_timeout = '5s';
set local statement_timeout = '90s';

create or replace function caissa_online_private.normalize_deadline_aborted_pgn(
  p_pgn text)
returns text
language plpgsql
immutable
security invoker
set search_path=''
as $$
declare
  v_pgn text:=coalesce(p_pgn,'');
  v_has_result_header boolean;
begin
  if pg_catalog.btrim(v_pgn)='' then
    return '[Result "*"]'||E'\n\n*';
  end if;

  v_has_result_header:=v_pgn~*'(^|[\r\n])[ \t]*\[Result[ \t]+"[^"\r\n]*"\]';
  if v_has_result_header then
    v_pgn:=pg_catalog.regexp_replace(
      v_pgn,
      '^[ \t]*\[Result[ \t]+"[^"\r\n]*"\][ \t]*\r?$',
      '[Result "*"]',
      'gim');
  else
    v_pgn:='[Result "*"]'||E'\n'||v_pgn;
  end if;

  if v_pgn~'(1-0|0-1|1/2-1/2|\*)[ \t\r\n]*$' then
    v_pgn:=pg_catalog.regexp_replace(
      v_pgn,'(1-0|0-1|1/2-1/2|\*)[ \t\r\n]*$','*');
  else
    v_pgn:=v_pgn||case when pg_catalog.right(v_pgn,1)=E'\n' then '' else E'\n' end||'*';
  end if;
  return v_pgn;
end;
$$;

revoke all on function caissa_online_private.normalize_deadline_aborted_pgn(text)
  from public,anon,authenticated;
grant execute on function caissa_online_private.normalize_deadline_aborted_pgn(text)
  to service_role;

comment on function caissa_online_private.normalize_deadline_aborted_pgn(text) is
  'Idempotently sets a deadline-aborted PGN Result tag and terminal marker to *.';

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
        arena_deadline_processed_at=p_now,version=version+1,updated_at=p_now,
        pgn=caissa_online_private.normalize_deadline_aborted_pgn(pgn)
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

-- Repair only records already canonicalized as deadline aborts. No game result,
-- move list, rating, score, or audit row is touched by this data correction.
update public.caissa_online_games game
set pgn=caissa_online_private.normalize_deadline_aborted_pgn(game.pgn),
  version=game.version+1,
  updated_at=pg_catalog.clock_timestamp()
where game.status='aborted'
  and game.result is null
  and game.termination='tournament_deadline'
  and game.pgn is distinct from
    caissa_online_private.normalize_deadline_aborted_pgn(game.pgn);

revoke all on function caissa_online_private.arena_apply_deadline(uuid,timestamptz)
  from public,anon,authenticated;
grant execute on function caissa_online_private.arena_apply_deadline(uuid,timestamptz)
  to service_role;

alter function caissa_online_private.arena_apply_deadline(uuid,timestamptz)
  set lock_timeout='2s';

commit;
