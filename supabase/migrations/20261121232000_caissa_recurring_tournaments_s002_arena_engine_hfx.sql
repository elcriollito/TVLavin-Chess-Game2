-- S002 hosted certification hotfix. Recurrence is the S002 scheduler layer;
-- generated games continue to use the already-certified Arena S001 engine.
begin;

update public.caissa_online_tournaments tournament
set configuration = jsonb_set(tournament.configuration, '{betaSeason}', '"S001"'::jsonb, true),
    updated_at = clock_timestamp()
where tournament.configuration->>'betaSeason' = 'S002'
  and tournament.series_id in (
    select series.id
    from public.caissa_online_tournament_series series
    where series.series_kind = 'user'
  );

create or replace function caissa_online_private.recurring_generate(
  p_now timestamptz,p_limit integer default 100)
returns integer language plpgsql security invoker set search_path=''
as $$
declare v_series public.caissa_online_tournament_series%rowtype; v_candidate record;
  v_count integer:=0; v_next timestamptz; v_end timestamptz;
begin
  for v_series in select * from public.caissa_online_tournament_series
    where series_kind='user' and enabled
      and (next_generation_at is null or next_generation_at<=p_now)
    order by id for update skip locked loop
    for v_candidate in select * from caissa_online_private.recurring_candidate_dates(
      v_series.id,(p_now at time zone v_series.timezone)::date,
      (p_now at time zone v_series.timezone)::date+v_series.generation_lead_days+1)
      order by starts_at loop
      exit when v_count>=least(greatest(p_limit,1),500);
      if v_candidate.starts_at<=p_now
        or v_candidate.starts_at-v_series.generation_lead_days*interval '1 day'>p_now
        or exists(select 1 from public.caissa_online_tournament_series_skips skip
          where skip.series_id=v_series.id and skip.local_date=v_candidate.local_date and skip.slot_id='primary')
        then continue; end if;
      v_end:=v_candidate.starts_at+v_series.duration_minutes*interval '1 minute';
      insert into public.caissa_online_tournaments(
        name,source,format,status,pool,base_ms,increment_ms,rated,visibility,
        starts_at,ends_at,registration_opens_at,registration_closes_at,duration_minutes,
        late_join,capacity,min_players,configuration,created_by_clerk_id,play_category,
        series_id,series_occurrence_key)
      values(v_series.title,'community','arena','registration_open',v_series.pool,
        v_series.base_ms,v_series.increment_ms,false,'private',v_candidate.starts_at,v_end,
        v_candidate.starts_at-v_series.generation_lead_days*interval '1 day',
        case when v_series.late_join then v_end else v_candidate.starts_at end,
        v_series.duration_minutes,v_series.late_join,v_series.capacity,v_series.min_players,
        jsonb_build_object('betaSeason','S001','publicDirectory',true,
          'recurrenceSeason','S002','recurringSeries',v_series.slug,'timeZone',v_series.timezone,
          'localDate',v_candidate.local_date,'chat',false,'finishingPolicy','finish_active_games'),
        v_series.owner_clerk_id,'live',v_series.id,v_candidate.occurrence_key)
      on conflict(series_occurrence_key) where series_occurrence_key is not null do nothing;
      if found then
        v_count:=v_count+1;
        update public.caissa_online_tournament_series
          set generated_count=generated_count+1,last_occurrence_at=v_candidate.starts_at,
            last_generated_at=p_now,updated_at=p_now where id=v_series.id;
      end if;
    end loop;
    select min(candidate.starts_at-v_series.generation_lead_days*interval '1 day') into v_next
    from caissa_online_private.recurring_candidate_dates(v_series.id,
      (p_now at time zone v_series.timezone)::date,
      (p_now at time zone v_series.timezone)::date+370) candidate
    where candidate.starts_at>p_now
      and not exists(select 1 from public.caissa_online_tournament_series_skips skip
        where skip.series_id=v_series.id and skip.local_date=candidate.local_date and skip.slot_id='primary')
      and not exists(select 1 from public.caissa_online_tournaments tournament
        where tournament.series_occurrence_key=candidate.occurrence_key);
    update public.caissa_online_tournament_series set last_generated_at=p_now,
      next_generation_at=v_next,updated_at=p_now where id=v_series.id;
  end loop;
  return v_count;
end;
$$;

revoke all on function caissa_online_private.recurring_generate(timestamptz,integer)
  from public,anon,authenticated;
grant execute on function caissa_online_private.recurring_generate(timestamptz,integer)
  to service_role;
alter function caissa_online_private.recurring_generate(timestamptz,integer)
  set lock_timeout='2s';

comment on function caissa_online_private.recurring_generate(timestamptz,integer) is
  'Bounded S002 recurrence generator using the certified Arena S001 tournament engine.';

commit;
