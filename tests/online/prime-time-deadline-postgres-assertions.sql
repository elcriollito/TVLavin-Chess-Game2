begin;

do $$
declare
  v_users uuid[];
  v_clerks text[];
  v_tournament uuid:=gen_random_uuid();
  v_game_a uuid:=gen_random_uuid();
  v_game_b uuid:=gen_random_uuid();
  v_before_ratings jsonb;
  v_after_ratings jsonb;
  v_retry_snapshot jsonb;
  v_second integer;
begin
  select array_agg(id order by id),array_agg(clerk_id order by id)
  into v_users,v_clerks
  from (select id,clerk_id from public.users where role<>'online_guest' order by id limit 4) users;
  if cardinality(v_users)<>4 then raise exception 'QA_REQUIRES_FOUR_BETA_USERS'; end if;

  select coalesce(jsonb_agg(to_jsonb(rating) order by user_id,pool),'[]'::jsonb)
  into v_before_ratings from public.caissa_online_ratings rating where user_id=any(v_users);

  insert into public.caissa_online_tournaments(
    id,name,source,format,status,pool,base_ms,increment_ms,rated,visibility,
    starts_at,ends_at,registration_opens_at,registration_closes_at,duration_minutes,
    late_join,capacity,min_players,configuration,created_by_clerk_id,play_category,
    finishing_policy)
  values(v_tournament,'QA strict multiple games','official','arena','active','blitz',180000,2000,
    false,'private',clock_timestamp()-interval '61 minutes',clock_timestamp()-interval '1 minute',
    clock_timestamp()-interval '2 hours',clock_timestamp()-interval '1 minute',60,true,64,4,
    '{"betaSeason":"S001","finishingPolicy":"abort_at_deadline"}'::jsonb,
    'system:deadline-qa','live','abort_at_deadline');
  for i in 1..4 loop
    insert into public.caissa_online_tournament_participants(
      tournament_id,user_id,clerk_id,display_name,rating_at_join,state)
    values(v_tournament,v_users[i],v_clerks[i],'Deadline QA '||i,1500,'playing');
  end loop;
  insert into public.caissa_online_games(
    id,pool,rated,base_ms,increment_ms,white_user_id,black_user_id,
    white_clerk_id,black_clerk_id,white_display_name,black_display_name,
    white_time_ms,black_time_ms,clock_started_at,tournament_id,pgn)
  values
    (v_game_a,'blitz',false,180000,2000,v_users[1],v_users[2],v_clerks[1],v_clerks[2],
      'Deadline QA 1','Deadline QA 2',180000,180000,clock_timestamp()-interval '2 minutes',v_tournament,''),
    (v_game_b,'blitz',false,180000,2000,v_users[3],v_users[4],v_clerks[3],v_clerks[4],
      'Deadline QA 3','Deadline QA 4',180000,180000,clock_timestamp()-interval '2 minutes',v_tournament,
      '[Event "Malformed QA"]'||E'\n\nnot-valid-movetext 0-1');
  insert into public.caissa_online_tournament_games(tournament_id,game_id,board_number)
  values(v_tournament,v_game_a,1),(v_tournament,v_game_b,2);

  perform caissa_online_private.arena_reconcile(v_tournament);
  if (select count(*) from public.caissa_online_games where id in(v_game_a,v_game_b)
      and status='aborted' and result is null and termination='tournament_deadline'
      and rating_processed_at is null)<>2
    then raise exception 'QA_DEADLINE_ABORT_FAILED'; end if;
  if (select pgn from public.caissa_online_games where id=v_game_a)
      <>'[Result "*"]'||E'\n\n*'
    then raise exception 'QA_EMPTY_PGN_NOT_NORMALIZED'; end if;
  if not exists(select 1 from public.caissa_online_games where id=v_game_b
      and pgn like '[Result "*"]%'
      and pgn like '%[Event "Malformed QA"]%'
      and pgn like '%not-valid-movetext%'
      and pg_catalog.right(pgn,1)='*')
    then raise exception 'QA_MALFORMED_PGN_NOT_NORMALIZED_SAFELY'; end if;
  if exists(select 1 from public.caissa_online_tournament_games
      where tournament_id=v_tournament and (scored_at is not null or white_points is not null
        or black_points is not null))
    then raise exception 'QA_ABORT_WAS_SCORED'; end if;
  if exists(select 1 from public.caissa_online_tournament_participants
      where tournament_id=v_tournament and (score<>0 or games_played<>0 or wins<>0 or draws<>0 or losses<>0))
    then raise exception 'QA_ABORT_CHANGED_STANDINGS'; end if;
  if (select status from public.caissa_online_tournaments where id=v_tournament)<>'completed'
    then raise exception 'QA_TOURNAMENT_NOT_FINALIZED'; end if;
  if (select count(*) from public.caissa_online_arena_events
      where tournament_id=v_tournament and event_type='game.aborted')<>2
    then raise exception 'QA_ABORT_AUDIT_MISSING'; end if;
  select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id',id,'pgn',pgn,'version',version) order by id)
  into v_retry_snapshot from public.caissa_online_games where id in(v_game_a,v_game_b);
  v_second:=caissa_online_private.arena_apply_deadline(v_tournament,clock_timestamp());
  if v_second<>0 then raise exception 'QA_DEADLINE_RETRY_NOT_IDEMPOTENT'; end if;
  if v_retry_snapshot<>(select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'id',id,'pgn',pgn,'version',version) order by id)
      from public.caissa_online_games where id in(v_game_a,v_game_b))
    then raise exception 'QA_DEADLINE_RETRY_CHANGED_PGN'; end if;
  if (select count(*) from public.caissa_online_arena_events
      where tournament_id=v_tournament and event_type='game.aborted')<>2
    then raise exception 'QA_DEADLINE_RETRY_DUPLICATED_AUDIT'; end if;
  begin
    perform public.caissa_online_arena_next(v_clerks[1],v_tournament,'deadline-next-rejected-qa');
    raise exception 'QA_NEXT_AFTER_DEADLINE_ALLOWED';
  exception when others then
    if sqlerrm not like '%CAISSA_ONLINE_ARENA_MANAGE_INVALID_STATE%'
      then raise; end if;
  end;

  select coalesce(jsonb_agg(to_jsonb(rating) order by user_id,pool),'[]'::jsonb)
  into v_after_ratings from public.caissa_online_ratings rating where user_id=any(v_users);
  if v_after_ratings<>v_before_ratings then raise exception 'QA_ABORT_CHANGED_RATINGS'; end if;
end $$;

do $$
declare
  v_users uuid[];
  v_clerks text[];
  v_tournament uuid:=gen_random_uuid();
  v_game uuid:=gen_random_uuid();
begin
  select array_agg(id order by id),array_agg(clerk_id order by id)
  into v_users,v_clerks from (select id,clerk_id from public.users order by id limit 4) users;
  insert into public.caissa_online_tournaments(
    id,name,source,format,status,pool,base_ms,increment_ms,rated,visibility,
    starts_at,ends_at,duration_minutes,late_join,capacity,min_players,configuration,
    play_category,finishing_policy)
  values(v_tournament,'QA completed before deadline','official','arena','active','bullet',120000,1000,
    false,'private',clock_timestamp()-interval '61 minutes',clock_timestamp()-interval '1 minute',
    60,true,64,4,'{"betaSeason":"S001"}'::jsonb,'live','abort_at_deadline');
  insert into public.caissa_online_tournament_participants(
    tournament_id,user_id,clerk_id,display_name,rating_at_join,state)
  select v_tournament,v_users[i],v_clerks[i],'Completed QA '||i,1500,'playing'
  from generate_series(1,4) i;
  insert into public.caissa_online_games(
    id,status,pool,rated,base_ms,increment_ms,white_user_id,black_user_id,
    white_clerk_id,black_clerk_id,white_display_name,black_display_name,
    white_time_ms,black_time_ms,result,termination,completed_at,tournament_id,pgn)
  values(v_game,'completed','bullet',false,120000,1000,v_users[1],v_users[2],
    v_clerks[1],v_clerks[2],'Completed QA 1','Completed QA 2',100000,90000,
    '1-0','checkmate',clock_timestamp()-interval '2 minutes',v_tournament,
    '[Event "Completed Before Deadline"]'||E'\n'||'[Result "1-0"]'||E'\n\n1. e4 1-0');
  insert into public.caissa_online_tournament_games(tournament_id,game_id,board_number)
  values(v_tournament,v_game,1);
  perform caissa_online_private.arena_reconcile(v_tournament);
  if (select coalesce(sum(score),0) from public.caissa_online_tournament_participants
      where tournament_id=v_tournament)<>2
    then raise exception 'QA_PRE_DEADLINE_POINTS_LOST'; end if;
  if (select games_played from public.caissa_online_tournament_participants
      where tournament_id=v_tournament and user_id=v_users[1])<>1
    then raise exception 'QA_PRE_DEADLINE_GAME_NOT_COUNTED'; end if;
  if (select status from public.caissa_online_games where id=v_game)<>'completed'
    then raise exception 'QA_PRE_DEADLINE_RESULT_DISCARDED'; end if;
  if (select pgn from public.caissa_online_games where id=v_game)
      <>'[Event "Completed Before Deadline"]'||E'\n'||'[Result "1-0"]'||E'\n\n1. e4 1-0'
    then raise exception 'QA_PRE_DEADLINE_PGN_CHANGED'; end if;
end $$;

do $$
declare
  v_users uuid[];
  v_clerks text[];
  v_tournament uuid:=gen_random_uuid();
  v_game uuid:=gen_random_uuid();
begin
  select array_agg(id order by id),array_agg(clerk_id order by id)
  into v_users,v_clerks from (select id,clerk_id from public.users order by id limit 4) users;
  insert into public.caissa_online_tournaments(
    id,name,source,format,status,pool,base_ms,increment_ms,rated,visibility,
    starts_at,ends_at,duration_minutes,late_join,capacity,min_players,configuration,
    play_category,finishing_policy)
  values(v_tournament,'QA delayed timeout','official','arena','active','bullet',60000,0,
    false,'private',clock_timestamp()-interval '61 minutes',clock_timestamp()-interval '1 minute',
    60,true,64,4,'{"betaSeason":"S001"}'::jsonb,'live','abort_at_deadline');
  insert into public.caissa_online_tournament_participants(
    tournament_id,user_id,clerk_id,display_name,rating_at_join,state)
  select v_tournament,v_users[i],v_clerks[i],'Timeout QA '||i,1500,'playing'
  from generate_series(1,4) i;
  insert into public.caissa_online_games(
    id,pool,rated,base_ms,increment_ms,white_user_id,black_user_id,
    white_clerk_id,black_clerk_id,white_display_name,black_display_name,
    white_time_ms,black_time_ms,clock_started_at,tournament_id)
  values(v_game,'bullet',false,60000,0,v_users[1],v_users[2],v_clerks[1],v_clerks[2],
    'Timeout QA 1','Timeout QA 2',60000,60000,clock_timestamp()-interval '5 minutes',v_tournament);
  insert into public.caissa_online_tournament_games(tournament_id,game_id,board_number)
  values(v_tournament,v_game,1);
  perform caissa_online_private.arena_reconcile(v_tournament);
  if not exists(select 1 from public.caissa_online_games where id=v_game
      and status='completed' and termination='timeout' and result is not null)
    then raise exception 'QA_PRE_DEADLINE_TIMEOUT_ABORTED'; end if;
  if not exists(select 1 from public.caissa_online_tournament_games
      where game_id=v_game and scored_at is not null)
    then raise exception 'QA_PRE_DEADLINE_TIMEOUT_NOT_SCORED'; end if;
end $$;

do $$
declare
  v_users uuid[];
  v_clerks text[];
  v_standard uuid:=gen_random_uuid();
  v_daily uuid:=gen_random_uuid();
  v_standard_game uuid:=gen_random_uuid();
  v_daily_game uuid:=gen_random_uuid();
begin
  select array_agg(id order by id),array_agg(clerk_id order by id)
  into v_users,v_clerks from (select id,clerk_id from public.users order by id limit 2) users;
  insert into public.caissa_online_tournaments(
    id,name,source,format,status,pool,base_ms,increment_ms,rated,visibility,
    starts_at,ends_at,duration_minutes,late_join,capacity,min_players,configuration,
    play_category,finishing_policy)
  values(v_standard,'QA standard Arena','community','arena','active','blitz',300000,0,
    false,'private',clock_timestamp()-interval '61 minutes',clock_timestamp()-interval '1 minute',
    60,true,16,4,'{"betaSeason":"S001"}'::jsonb,'live','finish_active_games');
  insert into public.caissa_online_games(
    id,pool,rated,base_ms,increment_ms,white_user_id,black_user_id,
    white_clerk_id,black_clerk_id,white_display_name,black_display_name,
    white_time_ms,black_time_ms,clock_started_at,tournament_id)
  values(v_standard_game,'blitz',false,300000,0,v_users[1],v_users[2],v_clerks[1],v_clerks[2],
    'Standard QA 1','Standard QA 2',300000,300000,clock_timestamp(),v_standard);
  insert into public.caissa_online_tournament_games(tournament_id,game_id,board_number)
  values(v_standard,v_standard_game,1);
  perform caissa_online_private.arena_reconcile(v_standard);
  if (select status from public.caissa_online_games where id=v_standard_game)<>'active'
    or (select status from public.caissa_online_tournaments where id=v_standard)<>'finishing'
    then raise exception 'QA_STANDARD_ARENA_POLICY_CHANGED'; end if;

  insert into public.caissa_online_tournaments(
    id,name,source,format,status,pool,base_ms,increment_ms,rated,visibility,
    starts_at,ends_at,duration_minutes,late_join,capacity,min_players,configuration,
    play_category,days_per_move,group_size,qualifiers_per_group,
    scoring_contract,finishing_policy)
  values(v_daily,'QA Daily unaffected','community','round-robin','active','daily',86400000,0,
    false,'private',clock_timestamp()-interval '8 days',clock_timestamp()-interval '1 minute',
    null,false,8,4,'{}'::jsonb,'daily',7,4,2,'daily-rr-1-0.5-0-v1','finish_active_games');
  insert into public.caissa_online_games(
    id,pool,rated,base_ms,increment_ms,white_user_id,black_user_id,
    white_clerk_id,black_clerk_id,white_display_name,black_display_name,
    white_time_ms,black_time_ms,tournament_id,play_category,days_per_move,move_deadline_at)
  values(v_daily_game,'daily',false,86400000,0,v_users[1],v_users[2],v_clerks[1],v_clerks[2],
    'Daily QA 1','Daily QA 2',0,0,v_daily,'daily',7,clock_timestamp()+interval '7 days');
  insert into public.caissa_online_tournament_games(tournament_id,game_id,board_number)
  values(v_daily,v_daily_game,1);
  if caissa_online_private.arena_apply_deadline(v_daily,clock_timestamp())<>0
    or (select status from public.caissa_online_games where id=v_daily_game)<>'active'
    then raise exception 'QA_DAILY_POLICY_CHANGED'; end if;
end $$;

do $$
declare
  v_users uuid[];
  v_clerks text[];
  v_tournament uuid:=gen_random_uuid();
  v_game uuid:=gen_random_uuid();
  v_ends_at timestamptz:=clock_timestamp()-interval '1 minute';
  v_before_ratings jsonb;
  v_after_ratings jsonb;
  v_original_pgn text:='[Event "Late Result QA"]'||E'\n'
    ||'[Site "CAISSA Beta"]'||E'\n'||'[Result "1-0"]'||E'\n\n'
    ||'1. e4 e5 2. Nf3 1-0';
  v_original_moves jsonb:='[{"ply":1,"san":"e4"},{"ply":2,"san":"e5"},{"ply":3,"san":"Nf3"}]'::jsonb;
  v_normalized_pgn text;
begin
  select array_agg(id order by id),array_agg(clerk_id order by id)
  into v_users,v_clerks
  from (select id,clerk_id from public.users where role<>'online_guest' order by id limit 2) users;
  if cardinality(v_users)<>2 then raise exception 'QA_REQUIRES_TWO_BETA_USERS'; end if;

  select coalesce(jsonb_agg(to_jsonb(rating) order by user_id,pool),'[]'::jsonb)
  into v_before_ratings from public.caissa_online_ratings rating where user_id=any(v_users);
  insert into public.caissa_online_tournaments(
    id,name,source,format,status,pool,base_ms,increment_ms,rated,visibility,
    starts_at,ends_at,registration_opens_at,registration_closes_at,duration_minutes,
    late_join,capacity,min_players,configuration,created_by_clerk_id,play_category,
    finishing_policy)
  values(v_tournament,'QA strict delayed result','official','arena','active','blitz',300000,0,
    true,'private',v_ends_at-interval '60 minutes',v_ends_at,
    v_ends_at-interval '2 hours',v_ends_at,60,true,64,2,
    '{"betaSeason":"S001","finishingPolicy":"abort_at_deadline"}'::jsonb,
    'system:deadline-qa','live','abort_at_deadline');
  for i in 1..2 loop
    insert into public.caissa_online_tournament_participants(
      tournament_id,user_id,clerk_id,display_name,rating_at_join,state)
    values(v_tournament,v_users[i],v_clerks[i],'Deadline QA '||i,1500,'playing');
  end loop;
  insert into public.caissa_online_games(
    id,pool,rated,base_ms,increment_ms,white_user_id,black_user_id,
    white_clerk_id,black_clerk_id,white_display_name,black_display_name,
    status,result,termination,completed_at,white_time_ms,black_time_ms,tournament_id,
    pgn,moves,ply)
  values(v_game,'blitz',true,300000,0,v_users[1],v_users[2],v_clerks[1],v_clerks[2],
    'Deadline QA 1','Deadline QA 2','completed','1-0','checkmate',
    v_ends_at+interval '1 millisecond',120000,100000,v_tournament,
    v_original_pgn,v_original_moves,3);
  insert into public.caissa_online_tournament_games(tournament_id,game_id,board_number)
  values(v_tournament,v_game,1);
  insert into public.caissa_online_game_events(game_id,sequence,event_id,event_type,payload)
  values(v_game,1,'qa-late-result','game.result','{"result":"1-0"}'::jsonb);

  perform caissa_online_private.apply_rating(v_game);
  if (select rating_processed_at is not null from public.caissa_online_games where id=v_game)
    then raise exception 'QA_LATE_RESULT_RATING_PROCESSED'; end if;
  perform caissa_online_private.arena_reconcile(v_tournament);
  if not exists(select 1 from public.caissa_online_games where id=v_game
      and status='aborted' and result is null and termination='tournament_deadline')
    then raise exception 'QA_LATE_RESULT_NOT_RECOVERED'; end if;
  select pgn into v_normalized_pgn from public.caissa_online_games where id=v_game;
  if v_normalized_pgn not like '%[Event "Late Result QA"]%'
    or v_normalized_pgn not like '%[Site "CAISSA Beta"]%'
    or v_normalized_pgn not like '%[Result "*"]%'
    or v_normalized_pgn not like '%1. e4 e5 2. Nf3 *'
    or v_normalized_pgn like '%[Result "1-0"]%'
    then raise exception 'QA_LATE_RESULT_PGN_NOT_CANONICAL:%',v_normalized_pgn; end if;
  if (select moves from public.caissa_online_games where id=v_game)<>v_original_moves
    then raise exception 'QA_LATE_RESULT_MOVES_CHANGED'; end if;
  if caissa_online_private.normalize_deadline_aborted_pgn(v_normalized_pgn)<>v_normalized_pgn
    then raise exception 'QA_PGN_NORMALIZER_NOT_IDEMPOTENT'; end if;
  if not exists(select 1 from public.caissa_online_game_events where game_id=v_game
      and event_id='arena-deadline:'||v_game::text and sequence=2)
    then raise exception 'QA_LATE_RESULT_AUDIT_MISSING'; end if;
  if exists(select 1 from public.caissa_online_tournament_games where game_id=v_game
      and (scored_at is not null or white_points is not null or black_points is not null))
    then raise exception 'QA_LATE_RESULT_SCORED'; end if;
  select coalesce(jsonb_agg(to_jsonb(rating) order by user_id,pool),'[]'::jsonb)
  into v_after_ratings from public.caissa_online_ratings rating where user_id=any(v_users);
  if v_after_ratings<>v_before_ratings then raise exception 'QA_LATE_RESULT_RATINGS_CHANGED'; end if;
end $$;

do $$
declare
  v_users uuid[];
  v_clerks text[];
  v_control record;
  v_tournament uuid;
  v_game uuid;
begin
  select array_agg(id order by id),array_agg(clerk_id order by id)
  into v_users,v_clerks
  from (select id,clerk_id from public.users where role<>'online_guest' order by id limit 2) users;
  if cardinality(v_users)<>2 then raise exception 'QA_REQUIRES_TWO_BETA_USERS'; end if;

  for v_control in select * from jsonb_to_recordset('[
    {"label":"Bullet 1+0","pool":"bullet","base_ms":60000,"increment_ms":0},
    {"label":"Bullet 1+1","pool":"bullet","base_ms":60000,"increment_ms":1000},
    {"label":"Bullet 2+1","pool":"bullet","base_ms":120000,"increment_ms":1000},
    {"label":"Blitz 3+0","pool":"blitz","base_ms":180000,"increment_ms":0},
    {"label":"Blitz 3+2","pool":"blitz","base_ms":180000,"increment_ms":2000},
    {"label":"Blitz 5+0","pool":"blitz","base_ms":300000,"increment_ms":0},
    {"label":"Blitz 5+5","pool":"blitz","base_ms":300000,"increment_ms":5000},
    {"label":"Rapid 10+0","pool":"rapid","base_ms":600000,"increment_ms":0},
    {"label":"Rapid 10+5","pool":"rapid","base_ms":600000,"increment_ms":5000}
  ]'::jsonb) as control(label text,pool text,base_ms integer,increment_ms integer)
  loop
    v_tournament:=gen_random_uuid(); v_game:=gen_random_uuid();
    insert into public.caissa_online_tournaments(
      id,name,source,format,status,pool,base_ms,increment_ms,rated,visibility,
      starts_at,ends_at,registration_opens_at,registration_closes_at,duration_minutes,
      late_join,capacity,min_players,configuration,created_by_clerk_id,play_category,
      finishing_policy)
    values(v_tournament,'QA strict '||v_control.label,'official','arena','active',
      v_control.pool,v_control.base_ms,v_control.increment_ms,false,'private',
      clock_timestamp()-interval '61 minutes',clock_timestamp()-interval '1 minute',
      clock_timestamp()-interval '2 hours',clock_timestamp()-interval '1 minute',60,true,64,2,
      '{"betaSeason":"S001","finishingPolicy":"abort_at_deadline"}'::jsonb,
      'system:deadline-qa','live','abort_at_deadline');
    for i in 1..2 loop
      insert into public.caissa_online_tournament_participants(
        tournament_id,user_id,clerk_id,display_name,rating_at_join,state)
      values(v_tournament,v_users[i],v_clerks[i],'Deadline QA '||i,1500,'playing');
    end loop;
    insert into public.caissa_online_games(
      id,pool,rated,base_ms,increment_ms,white_user_id,black_user_id,
      white_clerk_id,black_clerk_id,white_display_name,black_display_name,
      white_time_ms,black_time_ms,clock_started_at,tournament_id)
    values(v_game,v_control.pool,false,v_control.base_ms,v_control.increment_ms,
      v_users[1],v_users[2],v_clerks[1],v_clerks[2],'Deadline QA 1','Deadline QA 2',
      v_control.base_ms,v_control.base_ms,clock_timestamp(),v_tournament);
    insert into public.caissa_online_tournament_games(tournament_id,game_id,board_number)
    values(v_tournament,v_game,1);
    perform caissa_online_private.arena_reconcile(v_tournament);
    if not exists(select 1 from public.caissa_online_games where id=v_game
        and status='aborted' and result is null and termination='tournament_deadline')
      then raise exception 'QA_CONTROL_NOT_ABORTED:%',v_control.label; end if;
    if exists(select 1 from public.caissa_online_tournament_games where game_id=v_game
        and (scored_at is not null or white_points is not null or black_points is not null))
      then raise exception 'QA_CONTROL_SCORED:%',v_control.label; end if;
  end loop;
end $$;

rollback;
select 'prime_time_deadline_postgres_pass' result;
