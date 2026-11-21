\set ON_ERROR_STOP on

\pset tuples_only on
\pset format unaligned

insert into public.users(clerk_id,email,role)
select 'load_player_'||n, 'load'||n||'@example.test', 'user' from generate_series(1,109) n;
do $$ declare r record; begin
  for r in select clerk_id from public.users order by clerk_id loop
    perform public.caissa_public_identity_get_or_create(r.clerk_id);
  end loop;
  for r in select n from generate_series(1,109) n loop
    perform public.caissa_online_heartbeat('load_player_'||r.n,'Load Player '||r.n);
  end loop;
end $$;

select public.caissa_online_arena_create(
  'load_player_1','arena-create:capacity-100','CAISSA 100 Player Load',
  clock_timestamp()+interval '2 minutes',60,'blitz',300000,0,100,true,false
);

do $$
declare v_id uuid; n integer;
begin
  select id into v_id from public.caissa_online_tournaments where creation_event_id='arena-create:capacity-100';
  for n in 1..100 loop
    perform public.caissa_online_arena_join('load_player_'||n,v_id,'arena-load-join:'||lpad(n::text,3,'0'));
  end loop;
  begin
    perform public.caissa_online_arena_join('load_player_101',v_id,'arena-load-join:101');
    raise exception '101st Arena participant unexpectedly joined';
  exception when others then
    if sqlerrm<>'CAISSA_ONLINE_ARENA_FULL' then raise; end if;
  end;
  if (select count(*) from public.caissa_online_tournament_participants where tournament_id=v_id and state<>'withdrawn')<>100 then
    raise exception 'Arena capacity did not persist exactly 100 participants';
  end if;
  update public.caissa_online_tournaments set starts_at=clock_timestamp()-interval '1 second',
    ends_at=clock_timestamp()+interval '60 minutes',registration_closes_at=clock_timestamp()+interval '60 minutes'
    where id=v_id;
  perform public.caissa_online_arena_sync('load_player_1',v_id);
  if (select count(*) from public.caissa_online_games where tournament_id=v_id and status='active')<>50 then
    raise exception '100-player Arena did not create 50 simultaneous games';
  end if;
  if (select count(distinct player_id) from (
      select white_user_id player_id from public.caissa_online_games where tournament_id=v_id and status='active'
      union all select black_user_id from public.caissa_online_games where tournament_id=v_id and status='active'
    ) players)<>100 then raise exception 'Arena load paired a player more than once'; end if;
end;
$$;

select public.caissa_online_daily_create(
  'load_player_102','daily-create:round-robin-001','CAISSA Daily Local Rehearsal',
  clock_timestamp()+interval '2 minutes',clock_timestamp()+interval '1 minute',7,4,2,16,true
);
do $$
declare v_id uuid; n integer; v_game uuid; v_games_before integer;
begin
  select id into v_id from public.caissa_online_tournaments where creation_event_id='daily-create:round-robin-001';
  for n in 102..105 loop
    perform public.caissa_online_daily_join('load_player_'||n,v_id,'daily-load-join:'||n);
  end loop;
  update public.caissa_online_tournaments set starts_at=clock_timestamp()-interval '1 second',
    registration_closes_at=clock_timestamp()-interval '1 second' where id=v_id;
  perform caissa_online_private.daily_process(clock_timestamp(),100);
  if (select count(*) from public.caissa_online_games where tournament_id=v_id)<>12 then
    raise exception 'four-player Daily group did not create 12 double-round-robin games';
  end if;
  if exists(select user_id from (
      select white_user_id user_id from public.caissa_online_games where tournament_id=v_id
      union all select black_user_id from public.caissa_online_games where tournament_id=v_id
    ) seats group by user_id having count(*)<>6) then raise exception 'Daily workload per player is not six games'; end if;
  select id into v_game from public.caissa_online_games where tournament_id=v_id order by id limit 1;
  update public.caissa_online_games set move_deadline_at=clock_timestamp()-interval '1 second' where id=v_game;
  perform caissa_online_private.daily_process(clock_timestamp(),100);
  if (select status from public.caissa_online_games where id=v_game)<>'completed'
    or (select termination from public.caissa_online_games where id=v_game)<>'timeout' then
    raise exception 'Daily deadline processor did not adjudicate timeout';
  end if;
  select sum(games) into v_games_before from public.caissa_online_ratings where pool='daily';
  perform caissa_online_private.daily_process(clock_timestamp(),100);
  if (select sum(games) from public.caissa_online_ratings where pool='daily')<>v_games_before then
    raise exception 'Daily retry applied rating twice';
  end if;
end;
$$;

select public.caissa_online_daily_create(
  'load_player_1','daily-create:edge-groups-001','CAISSA Daily Edge Groups',
  clock_timestamp()+interval '2 minutes',clock_timestamp()+interval '1 minute',7,3,2,4,false
);
do $$
declare v_id uuid; n integer; v_game uuid;
begin
  select id into v_id from public.caissa_online_tournaments where creation_event_id='daily-create:edge-groups-001';
  for n in 106..109 loop
    perform public.caissa_online_daily_join('load_player_'||n,v_id,'daily-edge-join:'||n);
  end loop;
  update public.caissa_online_tournaments set starts_at=clock_timestamp()-interval '1 second',
    registration_closes_at=clock_timestamp()-interval '1 second' where id=v_id;
  perform caissa_online_private.daily_process(clock_timestamp(),100);
  if exists(select 1 from public.caissa_online_daily_groups where tournament_id=v_id and qualifier_count<>1) then
    raise exception 'two-player Daily edge groups must eliminate one player each';
  end if;
  for v_game in select g.id from public.caissa_online_games g where g.tournament_id=v_id and g.status='active' order by g.id loop
    update public.caissa_online_games set status='completed',result='1-0',termination='checkmate',completed_at=clock_timestamp()
      where id=v_game;
    perform caissa_online_private.daily_score_and_advance(v_game);
  end loop;
  if (select count(*) from public.caissa_online_daily_groups where tournament_id=v_id and round_number=2)<>1 then
    raise exception 'Daily edge groups did not advance to a smaller final';
  end if;
end;
$$;

do $$
declare v_generated integer; v_repeat integer;
begin
  v_generated:=caissa_online_private.weekly_generate('2026-11-20 12:00:00+00'::timestamptz,4);
  if v_generated<>0 then raise exception 'disabled weekly series generated occurrences'; end if;
  perform public.caissa_online_weekly_admin('load_player_1','weekly-enable:local-001','enable','{}'::jsonb);
  v_generated:=caissa_online_private.weekly_generate('2026-11-20 12:00:00+00'::timestamptz,4);
  v_repeat:=caissa_online_private.weekly_generate('2026-11-20 12:00:00+00'::timestamptz,4);
  if v_generated<>8 or v_repeat<>0 then raise exception 'weekly generation is not four-week idempotent'; end if;
  if exists(select 1 from public.caissa_online_tournaments t
      join public.caissa_online_tournament_series s on s.id=t.series_id
      where s.slug='saturdays-of-chess-s001' and
        (extract(dow from t.starts_at at time zone s.timezone)<>6
          or extract(hour from t.starts_at at time zone s.timezone) not in(11,19)
          or (t.starts_at at time zone s.timezone)::date<'2026-11-28')) then
    raise exception 'weekly occurrence violated Saturday local-time contract';
  end if;
  perform public.caissa_online_weekly_admin('load_player_1','weekly-pause:local-001','pause','{}'::jsonb);
end;
$$;

\echo CAISSA_TOURNAMENT_EXPANSION_POSTGRES_PASS
