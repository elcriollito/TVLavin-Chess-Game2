-- CAISSA tournament creation UX-HFX-002.
-- Daily registration closes at the server-authoritative start time. The new
-- overload persists the bounded description without changing existing events.
begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

create or replace function caissa_online_private.daily_payload(
  p_clerk_id text,
  p_tournament_id uuid default null,
  p_game_id uuid default null
) returns jsonb
language plpgsql stable security invoker
set search_path = ''
as $$
declare v_user_id uuid; v_current uuid;
begin
  select id into v_user_id from public.users where clerk_id=p_clerk_id;
  select coalesce(p_tournament_id,
    (select t.id from public.caissa_online_tournaments t
      join public.caissa_online_tournament_participants p on p.tournament_id=t.id
      where p.user_id=v_user_id and p.state<>'withdrawn' and t.play_category='daily'
      order by (t.status='active') desc,t.starts_at limit 1)) into v_current;
  return jsonb_build_object(
    'tournaments',coalesce((select jsonb_agg(jsonb_build_object(
      'id',t.id,'name',t.name,'description',coalesce(t.configuration->>'description',''),
      'status',t.status,'rated',t.rated,'startsAt',t.starts_at,
      'registrationClosesAt',t.registration_closes_at,'daysPerMove',t.days_per_move,
      'groupSize',t.group_size,'qualifiersPerGroup',t.qualifiers_per_group,
      'capacity',t.capacity,'playCategory','daily',
      'participantCount',(select count(*) from public.caissa_online_tournament_participants p where p.tournament_id=t.id and p.state<>'withdrawn'),
      'myState',(select p.state from public.caissa_online_tournament_participants p where p.tournament_id=t.id and p.user_id=v_user_id)
    ) order by t.starts_at) from public.caissa_online_tournaments t where t.play_category='daily' and t.visibility='private'),'[]'::jsonb),
    'current',(select jsonb_build_object(
      'id',t.id,'name',t.name,'description',coalesce(t.configuration->>'description',''),
      'status',t.status,'rated',t.rated,'startsAt',t.starts_at,
      'registrationClosesAt',t.registration_closes_at,'daysPerMove',t.days_per_move,
      'groupSize',t.group_size,'qualifiersPerGroup',t.qualifiers_per_group,
      'capacity',t.capacity,'playCategory','daily','scoringContract',t.scoring_contract,
      'participantCount',(select count(*) from public.caissa_online_tournament_participants p where p.tournament_id=t.id and p.state<>'withdrawn'),
      'myState',(select p.state from public.caissa_online_tournament_participants p where p.tournament_id=t.id and p.user_id=v_user_id),
      'standings',coalesce((select jsonb_agg(jsonb_build_object('userId',m.user_id,'clerkId',p.clerk_id,
        'displayName',p.display_name,'rank',m.rank,'points',m.score,'score',m.score,
        'tieBreak',m.tie_break,'wins',m.wins,'draws',m.draws,'losses',m.losses,'qualified',m.qualified,
        'isCurrentPlayer',m.user_id=v_user_id)
        order by g.round_number desc,m.rank nulls last,m.seed) from public.caissa_online_daily_groups g
        join public.caissa_online_daily_group_members m on m.group_id=g.id
        join public.caissa_online_tournament_participants p on p.tournament_id=t.id and p.user_id=m.user_id
        where g.tournament_id=t.id),'[]'::jsonb))
      from public.caissa_online_tournaments t where t.id=v_current and t.play_category='daily'),
    'games',coalesce((select jsonb_agg(to_jsonb(g)||jsonb_build_object('roundNumber',l.round,'boardNumber',l.board_number,'leg',l.leg)
      order by (g.turn=case when g.white_user_id=v_user_id then 'white' else 'black' end) desc,g.move_deadline_at)
      from public.caissa_online_games g join public.caissa_online_tournament_games l on l.game_id=g.id
      where g.tournament_id=v_current and g.play_category='daily'
        and v_user_id in (g.white_user_id,g.black_user_id) and g.status='active'),'[]'::jsonb),
    'game',(select to_jsonb(g)||jsonb_build_object('roundNumber',l.round,'boardNumber',l.board_number,'leg',l.leg)
      from public.caissa_online_games g join public.caissa_online_tournament_games l on l.game_id=g.id
      where g.id=p_game_id and g.tournament_id=v_current and v_user_id in(g.white_user_id,g.black_user_id)),
    'recentGames',coalesce((select jsonb_agg(row_data order by completed_at desc) from (
      select to_jsonb(g)||jsonb_build_object('roundNumber',l.round,'boardNumber',l.board_number,'leg',l.leg) row_data,g.completed_at
      from public.caissa_online_games g join public.caissa_online_tournament_games l on l.game_id=g.id
      where g.tournament_id=v_current and g.play_category='daily' and v_user_id in(g.white_user_id,g.black_user_id)
        and g.status='completed' order by g.completed_at desc limit 20) recent),'[]'::jsonb)
  );
end;
$$;

create or replace function public.caissa_online_daily_create(
  p_clerk_id text,
  p_event_id text,
  p_name text,
  p_description text,
  p_starts_at timestamptz,
  p_days_per_move integer,
  p_group_size integer,
  p_qualifiers_per_group integer,
  p_capacity integer,
  p_rated boolean
) returns jsonb
language plpgsql security invoker
set search_path = ''
as $$
declare v_user_id uuid; v_id uuid; v_now timestamptz:=clock_timestamp();
begin
  select id into v_user_id from public.users where clerk_id=p_clerk_id and role<>'online_guest';
  if v_user_id is null then raise exception 'CAISSA_ONLINE_IDENTITY_NOT_FOUND'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_event_id,701301));
  select id into v_id from public.caissa_online_tournaments where creation_event_id=p_event_id;
  if v_id is not null then return caissa_online_private.daily_payload(p_clerk_id,v_id,null); end if;
  if p_name is null or char_length(p_name) not between 3 and 80
    or p_description is null or char_length(p_description)>500 or p_description ~ '[<>[:cntrl:]]'
    or p_days_per_move not in(1,3,5,7) or p_group_size not between 3 and 6
    or p_group_size>p_capacity or p_qualifiers_per_group not in(1,2)
    or p_qualifiers_per_group>=p_group_size or p_capacity not between 4 and 100
    or p_rated is null or p_starts_at<=v_now+interval '1 minute'
    or p_starts_at>v_now+interval '366 days'
  then raise exception 'CAISSA_ONLINE_DAILY_INVALID'; end if;
  insert into public.caissa_online_tournaments(owner_user_id,name,source,format,status,pool,base_ms,increment_ms,rated,
    visibility,starts_at,ends_at,registration_opens_at,registration_closes_at,duration_minutes,late_join,capacity,min_players,
    configuration,creation_event_id,created_by_clerk_id,play_category,days_per_move,group_size,qualifiers_per_group,scoring_contract)
  values(v_user_id,p_name,'community','round-robin','registration_open','daily',86400000,0,p_rated,'private',p_starts_at,null,
    v_now,p_starts_at,null,false,p_capacity,4,
    jsonb_build_object('betaSeason','S001','publicDirectory',false,'userCreated',true,'chat',false,
      'description',p_description,
      'rules',jsonb_build_array('Daily correspondence','One White and one Black game per group opponent','No late joining','Server-authoritative deadlines')),
    p_event_id,p_clerk_id,'daily',p_days_per_move,p_group_size,p_qualifiers_per_group,'daily-rr-1-0.5-0-v1') returning id into v_id;
  insert into public.caissa_online_daily_events(tournament_id,event_id,event_type,actor_user_id,payload)
    values(v_id,p_event_id,'daily.created',v_user_id,jsonb_build_object(
      'daysPerMove',p_days_per_move,'groupSize',p_group_size,
      'qualifiersPerGroup',p_qualifiers_per_group,'capacity',p_capacity,'rated',p_rated));
  return caissa_online_private.daily_payload(p_clerk_id,v_id,null);
end;
$$;

revoke all on function public.caissa_online_daily_create(
  text,text,text,text,timestamptz,integer,integer,integer,integer,boolean
) from public,anon,authenticated;
grant execute on function public.caissa_online_daily_create(
  text,text,text,text,timestamptz,integer,integer,integer,integer,boolean
) to service_role;

comment on function public.caissa_online_daily_create(
  text,text,text,text,timestamptz,integer,integer,integer,integer,boolean
) is 'Creates Daily S001 events with server-managed registration closure at starts_at.';

commit;
