\set ON_ERROR_STOP on

insert into public.users(clerk_id,email,role)
values('recurring_owner_local','owner@example.test','user'),
      ('recurring_other_local','other@example.test','user')
on conflict(clerk_id) do nothing;

do $$
declare v_state jsonb; v_series uuid; v_first timestamptz; v_generated integer; v_repeat integer;
  v_official jsonb; v_tournament uuid; v_wrong_owner boolean:=false;
begin
  select jsonb_build_object('slug',slug,'timezone',timezone,'weekday',weekday,
    'launch',launch_not_before,'lead',registration_lead_days,'slots',slots,
    'pool',pool,'base',base_ms,'increment',increment_ms,'duration',duration_minutes,
    'capacity',capacity,'minimum',min_players,'rated',rated,'lateJoin',late_join)
  into v_official from public.caissa_online_tournament_series
  where slug='saturdays-of-chess-s001';

  v_state:=public.caissa_online_recurring_series_create(
    'recurring_owner_local','series-create:local-s002','Local S002 Arena','America/New_York',
    'weekly',2::smallint,array[1,5]::smallint[],
    (clock_timestamp() at time zone 'America/New_York')::date+7,'19:00'::time,2::smallint,
    'after_count',null,4::smallint,true,'bullet',120000,1000,30,16,true,false);
  select id into v_series from public.caissa_online_tournament_series
    where owner_clerk_id='recurring_owner_local' and creation_event_id='series-create:local-s002';
  if v_series is null then raise exception 'recurring series was not created'; end if;
  perform public.caissa_online_recurring_series_create(
    'recurring_owner_local','series-create:local-s002','Local S002 Arena','America/New_York',
    'weekly',2::smallint,array[1,5]::smallint[],
    (clock_timestamp() at time zone 'America/New_York')::date+7,'19:00'::time,2::smallint,
    'after_count',null,4::smallint,true,'bullet',120000,1000,30,16,true,false);
  if (select count(*) from public.caissa_online_tournament_series
      where owner_clerk_id='recurring_owner_local' and creation_event_id='series-create:local-s002')<>1
    then raise exception 'retried create was not idempotent'; end if;
  if jsonb_array_length(public.caissa_online_recurring_series_sync('recurring_other_local')->'series')<>0
    or jsonb_array_length(public.caissa_online_recurring_series_sync('recurring_other_local')->'directory')<>1
    then raise exception 'participant schedule visibility leaked ownership or omitted the public plan'; end if;
  if jsonb_array_length(v_state->'series')<>1 then raise exception 'owner state did not return one series'; end if;
  if (select count(*) from caissa_online_private.recurring_candidate_dates(v_series,
      (clock_timestamp() at time zone 'America/New_York')::date,
      (clock_timestamp() at time zone 'America/New_York')::date+90))<>4
    then raise exception 'after-count or alternating-week candidates are incorrect'; end if;

  select starts_at into v_first from caissa_online_private.recurring_candidate_dates(
    v_series,(clock_timestamp() at time zone 'America/New_York')::date,
    (clock_timestamp() at time zone 'America/New_York')::date+90) order by starts_at limit 1;
  v_generated:=caissa_online_private.recurring_generate(v_first-interval '2 days',100);
  v_repeat:=caissa_online_private.recurring_generate(v_first-interval '2 days',100);
  if v_generated<>1 or v_repeat<>0 then raise exception 'recurring generation is not idempotent'; end if;
  select id into v_tournament from public.caissa_online_tournaments
    where series_id=v_series and starts_at=v_first;
  if v_tournament is null then raise exception 'due occurrence was not generated'; end if;
  if (select base_ms<>120000 or increment_ms<>1000 or pool<>'bullet' or rated
      or status<>'registration_open' or configuration->>'betaSeason'<>'S001'
      or configuration->>'recurrenceSeason'<>'S002'
      from public.caissa_online_tournaments where id=v_tournament)
    then raise exception 'generated Arena template is incorrect'; end if;
  if caissa_online_private.weekly_generate(v_first-interval '2 days',4)<>0
    then raise exception 'official generator processed a user series'; end if;

  begin
    perform public.caissa_online_recurring_series_manage('recurring_other_local','series-pause:wrong-owner',
      'pause',jsonb_build_object('seriesId',v_series));
  exception when others then v_wrong_owner:=position('RECURRING_NOT_OWNER' in sqlerrm)>0; end;
  if not v_wrong_owner then raise exception 'cross-owner series mutation was not rejected'; end if;

  perform public.caissa_online_recurring_series_manage('recurring_owner_local','series-pause:local-s002',
    'pause',jsonb_build_object('seriesId',v_series));
  if (select enabled from public.caissa_online_tournament_series where id=v_series)
    then raise exception 'pause did not persist'; end if;
  perform public.caissa_online_recurring_series_manage('recurring_owner_local','series-resume:local-s002',
    'resume',jsonb_build_object('seriesId',v_series));
  if not (select enabled from public.caissa_online_tournament_series where id=v_series)
    then raise exception 'resume did not persist'; end if;

  if v_official<>(select jsonb_build_object('slug',slug,'timezone',timezone,'weekday',weekday,
      'launch',launch_not_before,'lead',registration_lead_days,'slots',slots,
      'pool',pool,'base',base_ms,'increment',increment_ms,'duration',duration_minutes,
      'capacity',capacity,'minimum',min_players,'rated',rated,'lateJoin',late_join)
    from public.caissa_online_tournament_series where slug='saturdays-of-chess-s001')
    then raise exception 'official Saturday settings changed'; end if;
end
$$;

do $$
declare v_series uuid; v_local_date date;
begin
  select id into v_series from public.caissa_online_tournament_series
    where owner_clerk_id='recurring_owner_local' and creation_event_id='series-create:local-s002';
  select local_date into v_local_date from caissa_online_private.recurring_candidate_dates(v_series,
    (clock_timestamp() at time zone 'America/New_York')::date,
    (clock_timestamp() at time zone 'America/New_York')::date+90) candidate
    where not exists(select 1 from public.caissa_online_tournaments tournament
      where tournament.series_occurrence_key=candidate.occurrence_key)
    order by starts_at limit 1;
  perform public.caissa_online_recurring_series_manage('recurring_owner_local','series-skip:unskip-test',
    'skip',jsonb_build_object('seriesId',v_series,'localDate',v_local_date,'reason','Local recovery test'));
  perform public.caissa_online_recurring_series_unskip('recurring_owner_local','series-unskip:local-s002',
    v_series,v_local_date,'Local recovery test');
  perform public.caissa_online_recurring_series_unskip('recurring_owner_local','series-unskip:local-s002',
    v_series,v_local_date,'Local recovery test');
  if exists(select 1 from public.caissa_online_tournament_series_skips
      where series_id=v_series and local_date=v_local_date and slot_id='primary')
    or (select count(*) from public.caissa_online_tournament_series_skip_recoveries
      where series_id=v_series and local_date=v_local_date)<>1
    then raise exception 'audited unskip was not idempotent'; end if;
end
$$;

do $$
declare v_series uuid; v_start timestamptz; v_generated integer;
begin
  update public.caissa_online_tournament_series
    set created_at=created_at-interval '2 minutes'
    where owner_clerk_id='recurring_owner_local';
  perform public.caissa_online_recurring_series_create(
    'recurring_owner_local','series-create:missed-s002','Missed S002 Arena','America/New_York',
    'daily',1::smallint,'{}'::smallint[],
    (clock_timestamp() at time zone 'America/New_York')::date+1,'23:00'::time,1::smallint,
    'after_count',null,1::smallint,true,'blitz',180000,2000,30,16,true,false);
  select id into v_series from public.caissa_online_tournament_series
    where owner_clerk_id='recurring_owner_local' and creation_event_id='series-create:missed-s002';
  select starts_at into v_start from caissa_online_private.recurring_candidate_dates(v_series,
    (clock_timestamp() at time zone 'America/New_York')::date,
    (clock_timestamp() at time zone 'America/New_York')::date+3) limit 1;
  v_generated:=caissa_online_private.recurring_generate(v_start+interval '1 minute',100);
  if v_generated<>0 or exists(select 1 from public.caissa_online_tournaments where series_id=v_series)
    then raise exception 'missed scheduler execution created a past backlog'; end if;
end
$$;

do $$
declare v_series uuid; v_start timestamptz; v_due timestamptz; v_generated integer;
begin
  update public.caissa_online_tournament_series
    set created_at=created_at-interval '2 minutes'
    where owner_clerk_id='recurring_owner_local';
  perform public.caissa_online_recurring_series_create(
    'recurring_owner_local','series-create:inside-lead','Inside Lead Window','America/New_York',
    'weekly',1::smallint,array[extract(dow from ((clock_timestamp() at time zone 'America/New_York')::date+1))::smallint]::smallint[],
    (clock_timestamp() at time zone 'America/New_York')::date+1,'19:00'::time,2::smallint,
    'after_count',null,1::smallint,true,'bullet',120000,1000,30,16,true,false);
  select id,next_generation_at into v_series,v_due from public.caissa_online_tournament_series
    where owner_clerk_id='recurring_owner_local' and creation_event_id='series-create:inside-lead';
  select starts_at into v_start from caissa_online_private.recurring_candidate_dates(v_series,
    (clock_timestamp() at time zone 'America/New_York')::date,
    (clock_timestamp() at time zone 'America/New_York')::date+2) limit 1;
  if v_start<=clock_timestamp() or v_due>clock_timestamp()+interval '5 seconds'
    then raise exception 'inside-lead first occurrence was not made immediately due'; end if;
  v_generated:=caissa_online_private.recurring_generate(clock_timestamp(),100);
  if v_generated<1 or not exists(select 1 from public.caissa_online_tournaments
      where series_id=v_series and starts_at=v_start and source='community')
    then raise exception 'inside-lead first occurrence was not generated'; end if;
  if (select count(*) from public.caissa_online_tournaments where series_id=v_series)<>1
    then raise exception 'inside-lead generation duplicated its occurrence'; end if;
end
$$;

do $$
begin
  if has_function_privilege('anon',
      'public.caissa_online_recurring_series_create(text,text,text,text,text,smallint,smallint[],date,time without time zone,smallint,text,date,smallint,boolean,text,integer,integer,integer,integer,boolean,boolean)','execute')
    or has_function_privilege('authenticated',
      'public.caissa_online_recurring_series_manage(text,text,text,jsonb)','execute')
    or has_function_privilege('authenticated',
      'public.caissa_online_tournament_scheduler_tick(timestamptz)','execute')
    then raise exception 'browser role can execute a privileged recurrence RPC'; end if;
  if (select count(*) from cron.job where jobname='caissa-tournament-scheduler-s001')<>1
    then raise exception 'S002 did not preserve exactly one scheduler Cron'; end if;
  if has_function_privilege('anon','public.caissa_online_tournament_identity_projection(uuid[])','execute')
    or has_function_privilege('authenticated','public.caissa_online_tournament_identity_projection(uuid[])','execute')
    then raise exception 'browser role can read the tournament identity projection'; end if;
  if has_function_privilege('anon','public.caissa_online_recurring_series_unskip(text,text,uuid,date,text)','execute')
    or has_function_privilege('authenticated','public.caissa_online_recurring_series_unskip(text,text,uuid,date,text)','execute')
    then raise exception 'browser role can execute the audited unskip RPC'; end if;
end
$$;

select 'CAISSA_RECURRING_S002_POSTGRES_ASSERTIONS_OK';
