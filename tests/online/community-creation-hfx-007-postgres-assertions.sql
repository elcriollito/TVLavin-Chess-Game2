\set ON_ERROR_STOP on

begin;

do $$
declare
  v_user_id uuid;
  v_event_id text := 'hfx007-pg-create-001';
  v_tournament_id uuid;
  v_count integer;
  v_index integer;
begin
  insert into public.users(clerk_id, email, role)
  values('hfx007_postgres_member', 'hfx007-member@example.test', 'user')
  returning id into v_user_id;

  perform public.caissa_online_daily_create(
    'hfx007_postgres_member', v_event_id, 'HFX007 Community Daily', '',
    clock_timestamp() + interval '2 days', 7, 4, 2, 16, false
  );

  select id into v_tournament_id
  from public.caissa_online_tournaments
  where creation_event_id = v_event_id;

  if v_tournament_id is null then
    raise exception 'HFX007 Daily tournament was not created';
  end if;
  if exists (
    select 1 from public.caissa_online_tournaments
    where id = v_tournament_id
      and (source <> 'community' or series_id is not null or play_category <> 'daily'
        or configuration ->> 'userCreated' <> 'true')
  ) then
    raise exception 'HFX007 creation escaped the community one-time contract';
  end if;

  perform public.caissa_online_daily_create(
    'hfx007_postgres_member', v_event_id, 'HFX007 Community Daily', '',
    clock_timestamp() + interval '2 days', 7, 4, 2, 16, false
  );
  select count(*) into v_count
  from public.caissa_online_tournaments
  where creation_event_id = v_event_id;
  if v_count <> 1 then
    raise exception 'HFX007 idempotent retry created % rows', v_count;
  end if;

  begin
    perform public.caissa_online_daily_create(
      'hfx007_postgres_member', 'hfx007-pg-cooldown', 'Cooldown Daily', '',
      clock_timestamp() + interval '4 days', 7, 4, 2, 16, false
    );
    raise exception 'HFX007 cooldown was not enforced';
  exception when others then
    if sqlerrm <> 'CAISSA_ONLINE_ARENA_CREATION_COOLDOWN' then raise; end if;
  end;

  update public.caissa_online_tournaments
  set created_at = clock_timestamp() - interval '2 minutes'
  where id = v_tournament_id;

  for v_index in 2..3 loop
    perform public.caissa_online_daily_create(
      'hfx007_postgres_member', 'hfx007-pg-quota-' || v_index,
      'Quota Daily ' || v_index, '',
      clock_timestamp() + (v_index * interval '3 days'), 7, 4, 2, 16, false
    );
    update public.caissa_online_tournaments
    set created_at = clock_timestamp() - interval '2 minutes'
    where creation_event_id = 'hfx007-pg-quota-' || v_index;
  end loop;

  begin
    perform public.caissa_online_daily_create(
      'hfx007_postgres_member', 'hfx007-pg-quota-4', 'Quota Daily 4', '',
      clock_timestamp() + interval '12 days', 7, 4, 2, 16, false
    );
    raise exception 'HFX007 three-event quota was not enforced';
  exception when others then
    if sqlerrm <> 'CAISSA_ONLINE_ARENA_CREATION_LIMIT' then raise; end if;
  end;

  if has_function_privilege('authenticated',
      'public.caissa_online_daily_create(text,text,text,text,timestamptz,integer,integer,integer,integer,boolean)',
      'EXECUTE') then
    raise exception 'authenticated unexpectedly has direct Daily-create EXECUTE';
  end if;
  if not has_function_privilege('service_role',
      'public.caissa_online_daily_create(text,text,text,text,timestamptz,integer,integer,integer,integer,boolean)',
      'EXECUTE') then
    raise exception 'service_role lacks Daily-create EXECUTE';
  end if;
end;
$$;

rollback;

\echo CAISSA_HFX007_POSTGRES_PASS
