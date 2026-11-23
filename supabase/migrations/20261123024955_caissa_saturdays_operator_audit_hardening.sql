-- Persist the dedicated Saturdays of Chess operator event id in the same
-- service-role-only audit ledger used by the general official-series
-- operator. The series itself and all existing occurrence identifiers remain
-- unchanged.

create or replace function public.caissa_online_weekly_admin(
  p_clerk_id text,
  p_event_id text,
  p_action text,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path=''
as $$
declare
  v_series public.caissa_online_tournament_series%rowtype;
  v_tournament uuid;
  v_actor text:=nullif(pg_catalog.btrim(p_clerk_id),'');
  v_audit_action text;
  v_idempotent boolean:=false;
begin
  if v_actor is null
    or char_length(v_actor) not between 6 and 160
    or p_event_id is null
    or p_event_id!~'^[A-Za-z0-9:_-]{12,120}$'
    or p_action not in('pause','enable','skip','cancel','update','inspect')
    or p_payload is null
    or pg_catalog.jsonb_typeof(p_payload)<>'object'
  then
    raise exception 'CAISSA_ONLINE_SERIES_INVALID_ADMIN_OPERATION';
  end if;

  if (p_action in('pause','enable','inspect') and p_payload<>'{}'::jsonb)
    or (p_action='skip' and exists(
      select 1 from pg_catalog.jsonb_object_keys(p_payload) key
      where key not in('localDate','slotId','reason')))
    or (p_action='cancel' and exists(
      select 1 from pg_catalog.jsonb_object_keys(p_payload) key
      where key<>'tournamentId'))
    or (p_action='update' and exists(
      select 1 from pg_catalog.jsonb_object_keys(p_payload) key
      where key not in('capacity','minimumPlayers','registrationLeadDays','rated')))
  then
    raise exception 'CAISSA_ONLINE_SERIES_INVALID_ADMIN_OPERATION';
  end if;

  select * into v_series
  from public.caissa_online_tournament_series
  where slug='saturdays-of-chess-s001'
  for update;
  if v_series.id is null then
    raise exception 'CAISSA_ONLINE_SERIES_NOT_FOUND';
  end if;

  -- Recheck only after the series row is locked. Concurrent retries therefore
  -- serialize before either the mutation or the audit insert is evaluated.
  if exists(
    select 1
    from public.caissa_online_series_operator_audit
    where event_id=p_event_id
      and series_id=v_series.id
      and actor=v_actor
      and payload->>'operator'='saturdays-of-chess'
      and payload->>'requestedAction'=p_action
  ) then
    v_idempotent:=true;
  elsif exists(
    select 1 from public.caissa_online_series_operator_audit
    where event_id=p_event_id
  ) then
    raise exception 'CAISSA_ONLINE_SERIES_EVENT_ID_CONFLICT';
  end if;

  if not v_idempotent then
    if p_action='pause' then
      update public.caissa_online_tournament_series
      set enabled=false,updated_at=pg_catalog.clock_timestamp()
      where id=v_series.id;
    elsif p_action='enable' then
      update public.caissa_online_tournament_series
      set enabled=true,next_generation_at=pg_catalog.clock_timestamp(),
        updated_at=pg_catalog.clock_timestamp()
      where id=v_series.id;
    elsif p_action='skip' then
      if not (p_payload ?& array['localDate','slotId'])
        or not pg_catalog.pg_input_is_valid(p_payload->>'localDate','date')
        or (p_payload->>'localDate')::date<v_series.launch_not_before
        or not exists(
          select 1 from pg_catalog.jsonb_array_elements(v_series.slots) slot
          where slot->>'id'=p_payload->>'slotId')
      then
        raise exception 'CAISSA_ONLINE_SERIES_INVALID_SKIP';
      end if;
      insert into public.caissa_online_tournament_series_skips(
        series_id,local_date,slot_id,reason,created_by_clerk_id)
      values(
        v_series.id,(p_payload->>'localDate')::date,p_payload->>'slotId',
        left(coalesce(nullif(pg_catalog.btrim(p_payload->>'reason'),''),'Organizer skip'),240),
        v_actor)
      on conflict(series_id,local_date,slot_id) do update
      set reason=excluded.reason,
        created_by_clerk_id=excluded.created_by_clerk_id,
        created_at=pg_catalog.clock_timestamp();
    elsif p_action='cancel' then
      if not (p_payload ? 'tournamentId')
        or not pg_catalog.pg_input_is_valid(p_payload->>'tournamentId','uuid')
      then
        raise exception 'CAISSA_ONLINE_SERIES_INVALID_ADMIN_OPERATION';
      end if;
      v_tournament:=(p_payload->>'tournamentId')::uuid;
      update public.caissa_online_tournaments
      set status='cancelled',cancelled_at=pg_catalog.clock_timestamp(),
        version=version+1,updated_at=pg_catalog.clock_timestamp()
      where id=v_tournament
        and series_id=v_series.id
        and status in('scheduled','registration_open');
      if not found then
        raise exception 'CAISSA_ONLINE_SERIES_OCCURRENCE_NOT_CANCELLABLE';
      end if;
    elsif p_action='update' then
      if not (p_payload ?& array['capacity','minimumPlayers','registrationLeadDays','rated'])
        or not pg_catalog.pg_input_is_valid(p_payload->>'capacity','integer')
        or not pg_catalog.pg_input_is_valid(p_payload->>'minimumPlayers','integer')
        or not pg_catalog.pg_input_is_valid(p_payload->>'registrationLeadDays','integer')
        or pg_catalog.jsonb_typeof(p_payload->'rated')<>'boolean'
        or (p_payload->>'capacity')::integer not between 4 and 100
        or (p_payload->>'minimumPlayers')::integer not between 4 and (p_payload->>'capacity')::integer
        or (p_payload->>'registrationLeadDays')::integer not between 1 and 30
      then
        raise exception 'CAISSA_ONLINE_SERIES_INVALID_CONFIGURATION';
      end if;
      update public.caissa_online_tournament_series
      set capacity=(p_payload->>'capacity')::integer,
        min_players=(p_payload->>'minimumPlayers')::integer,
        registration_lead_days=(p_payload->>'registrationLeadDays')::integer,
        rated=(p_payload->>'rated')::boolean,
        updated_at=pg_catalog.clock_timestamp()
      where id=v_series.id;
    end if;

    v_audit_action:=case when p_action='enable' then 'resume' else p_action end;
    insert into public.caissa_online_series_operator_audit(
      event_id,actor,action,series_id,payload)
    values(
      p_event_id,v_actor,v_audit_action,v_series.id,
      p_payload||pg_catalog.jsonb_build_object(
        'operator','saturdays-of-chess','requestedAction',p_action));
  end if;

  select * into v_series
  from public.caissa_online_tournament_series
  where id=v_series.id;

  return pg_catalog.jsonb_build_object(
    'series',to_jsonb(v_series),
    'idempotent',v_idempotent,
    'auditEventId',p_event_id,
    'occurrences',coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id',t.id,'name',t.name,'status',t.status,
        'startsAt',t.starts_at,'endsAt',t.ends_at,
        'capacity',t.capacity,'participantCount',(
          select count(*)
          from public.caissa_online_tournament_participants participant
          where participant.tournament_id=t.id
            and participant.state<>'withdrawn')) order by t.starts_at)
      from public.caissa_online_tournaments t
      where t.series_id=v_series.id
        and t.starts_at>=pg_catalog.clock_timestamp()-interval '1 day'
    ),'[]'::jsonb),
    'ledger',coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'runId',ledger.run_id,'status',ledger.status,
        'startedAt',ledger.started_at,'completedAt',ledger.completed_at,
        'generatedCount',ledger.generated_count,
        'transitionedCount',ledger.transitioned_count,
        'errorCode',ledger.error_code) order by ledger.started_at desc)
      from (
        select * from public.caissa_online_scheduler_ledger
        order by started_at desc limit 20
      ) ledger
    ),'[]'::jsonb)
  );
end;
$$;

revoke all on function public.caissa_online_weekly_admin(text,text,text,jsonb)
  from public,anon,authenticated;
grant execute on function public.caissa_online_weekly_admin(text,text,text,jsonb)
  to service_role;
alter function public.caissa_online_weekly_admin(text,text,text,jsonb)
  set lock_timeout='2s';

comment on function public.caissa_online_weekly_admin(text,text,text,jsonb) is
  'Service-role-only Saturdays of Chess operator with immutable event-id audit and idempotent retries.';
