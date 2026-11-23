\set ON_ERROR_STOP on

begin;

do $$
declare
  v_series_id uuid;
  v_enabled boolean;
  v_next_generation_at timestamptz;
  v_first jsonb;
  v_retry jsonb;
  v_conflict boolean:=false;
begin
  select id,enabled,next_generation_at
  into v_series_id,v_enabled,v_next_generation_at
  from public.caissa_online_tournament_series
  where slug='saturdays-of-chess-s001';

  if v_series_id is null then
    raise exception 'Saturdays of Chess series is missing';
  end if;

  v_first:=public.caissa_online_weekly_admin(
    'operator_test','saturdays-audit:test001','inspect','{}'::jsonb);
  v_retry:=public.caissa_online_weekly_admin(
    'operator_test','saturdays-audit:test001','inspect','{}'::jsonb);

  if coalesce((v_first->>'idempotent')::boolean,true)
    or not coalesce((v_retry->>'idempotent')::boolean,false)
  then
    raise exception 'Saturdays operator retry was not idempotent';
  end if;

  if (select count(*) from public.caissa_online_series_operator_audit
      where event_id='saturdays-audit:test001')<>1
    or not exists(
      select 1 from public.caissa_online_series_operator_audit
      where event_id='saturdays-audit:test001'
        and series_id=v_series_id
        and actor='operator_test'
        and action='inspect'
        and payload->>'operator'='saturdays-of-chess'
        and payload->>'requestedAction'='inspect')
  then
    raise exception 'Saturdays operator audit event was not persisted exactly once';
  end if;

  begin
    perform public.caissa_online_weekly_admin(
      'operator_test','saturdays-audit:test001','pause','{}'::jsonb);
  exception when others then
    if sqlerrm='CAISSA_ONLINE_SERIES_EVENT_ID_CONFLICT' then
      v_conflict:=true;
    else
      raise;
    end if;
  end;
  if not v_conflict then
    raise exception 'Reusing an event id for a different action was not rejected';
  end if;

  if exists(
      select 1 from public.caissa_online_tournament_series
      where id=v_series_id
        and (enabled is distinct from v_enabled
          or next_generation_at is distinct from v_next_generation_at))
  then
    raise exception 'Audit-only verification changed Saturdays configuration';
  end if;

  if pg_catalog.has_function_privilege(
      'public','public.caissa_online_weekly_admin(text,text,text,jsonb)','execute')
    or pg_catalog.has_function_privilege(
      'anon','public.caissa_online_weekly_admin(text,text,text,jsonb)','execute')
    or pg_catalog.has_function_privilege(
      'authenticated','public.caissa_online_weekly_admin(text,text,text,jsonb)','execute')
    or not pg_catalog.has_function_privilege(
      'service_role','public.caissa_online_weekly_admin(text,text,text,jsonb)','execute')
  then
    raise exception 'Saturdays operator privileges are not service-role-only';
  end if;
end;
$$;

rollback;

\echo CAISSA_SATURDAYS_OPERATOR_AUDIT_POSTGRES_PASS
