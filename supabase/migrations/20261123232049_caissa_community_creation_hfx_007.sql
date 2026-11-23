-- HFX-007: apply the existing community-tournament creation safeguards to
-- Daily correspondence before allowing ordinary authenticated members to
-- create one-time events. Official identity and recurrence remain impossible
-- through this RPC because both are server-authored constants.
begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

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
declare
  v_user_id uuid;
  v_id uuid;
  v_now timestamptz := clock_timestamp();
begin
  select id into v_user_id
  from public.users
  where clerk_id = p_clerk_id and role <> 'online_guest';

  if v_user_id is null then
    raise exception 'CAISSA_ONLINE_IDENTITY_NOT_FOUND';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_event_id, 701301));
  select id into v_id
  from public.caissa_online_tournaments
  where creation_event_id = p_event_id;

  if v_id is not null then
    return caissa_online_private.daily_payload(p_clerk_id, v_id, null);
  end if;

  if p_name is null or char_length(p_name) not between 3 and 80
    or p_description is null or char_length(p_description) > 500
    or p_description ~ '[<>[:cntrl:]]'
    or p_days_per_move not in (1, 3, 5, 7)
    or p_group_size not between 3 and 6
    or p_group_size > p_capacity
    or p_qualifiers_per_group not in (1, 2)
    or p_qualifiers_per_group >= p_group_size
    or p_capacity not between 4 and 100
    or p_rated is null
    or p_starts_at <= v_now + interval '1 minute'
    or p_starts_at > v_now + interval '366 days'
  then
    raise exception 'CAISSA_ONLINE_DAILY_INVALID';
  end if;

  -- Serialize all one-time creation attempts by the same member so parallel
  -- Arena and Daily requests cannot evade the shared quota or cooldown.
  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text, 701202));

  if (
    select count(*)
    from public.caissa_online_tournaments t
    where t.owner_user_id = v_user_id
      and t.configuration ->> 'betaSeason' = 'S001'
      and t.status in ('scheduled', 'registration_open', 'active', 'finishing')
  ) >= 3 then
    raise exception 'CAISSA_ONLINE_ARENA_CREATION_LIMIT';
  end if;

  if exists (
    select 1
    from public.caissa_online_tournaments t
    where t.owner_user_id = v_user_id
      and t.configuration ->> 'betaSeason' = 'S001'
      and t.created_at > v_now - interval '60 seconds'
  ) then
    raise exception 'CAISSA_ONLINE_ARENA_CREATION_COOLDOWN';
  end if;

  insert into public.caissa_online_tournaments(
    owner_user_id, name, source, format, status, pool, base_ms, increment_ms,
    rated, visibility, starts_at, ends_at, registration_opens_at,
    registration_closes_at, duration_minutes, late_join, capacity, min_players,
    configuration, creation_event_id, created_by_clerk_id, play_category,
    days_per_move, group_size, qualifiers_per_group, scoring_contract
  ) values (
    v_user_id, p_name, 'community', 'round-robin', 'registration_open', 'daily',
    86400000, 0, p_rated, 'private', p_starts_at, null, v_now, p_starts_at,
    null, false, p_capacity, 4,
    jsonb_build_object(
      'betaSeason', 'S001',
      'publicDirectory', false,
      'userCreated', true,
      'chat', false,
      'description', p_description,
      'rules', jsonb_build_array(
        'Daily correspondence',
        'One White and one Black game per group opponent',
        'No late joining',
        'Server-authoritative deadlines'
      )
    ),
    p_event_id, p_clerk_id, 'daily', p_days_per_move, p_group_size,
    p_qualifiers_per_group, 'daily-rr-1-0.5-0-v1'
  ) returning id into v_id;

  insert into public.caissa_online_daily_events(
    tournament_id, event_id, event_type, actor_user_id, payload
  ) values (
    v_id, p_event_id, 'daily.created', v_user_id,
    jsonb_build_object(
      'daysPerMove', p_days_per_move,
      'groupSize', p_group_size,
      'qualifiersPerGroup', p_qualifiers_per_group,
      'capacity', p_capacity,
      'rated', p_rated
    )
  );

  return caissa_online_private.daily_payload(p_clerk_id, v_id, null);
end;
$$;

revoke all on function public.caissa_online_daily_create(
  text, text, text, text, timestamptz, integer, integer, integer, integer, boolean
) from public, anon, authenticated;

grant execute on function public.caissa_online_daily_create(
  text, text, text, text, timestamptz, integer, integer, integer, integer, boolean
) to service_role;

comment on function public.caissa_online_daily_create(
  text, text, text, text, timestamptz, integer, integer, integer, integer, boolean
) is 'Creates one-time community Daily events with shared per-member quotas, cooldown and idempotency.';

commit;
