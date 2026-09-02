begin;

alter table public.users
  add column if not exists coach_trial_consumed_at timestamptz,
  add column if not exists coach_trial_operation_id uuid;

alter table public.users
  drop constraint if exists users_coach_trial_pair_check;
alter table public.users
  add constraint users_coach_trial_pair_check check (
    (coach_trial_consumed_at is null and coach_trial_operation_id is null)
    or (coach_trial_consumed_at is not null and coach_trial_operation_id is not null)
  );

create unique index if not exists users_coach_trial_operation_unique
  on public.users(coach_trial_operation_id)
  where coach_trial_operation_id is not null;

create or replace function public.consume_coach_game_access(
  p_clerk_id text,
  p_operation_id uuid
)
returns table(
  allowed boolean,
  code text,
  coach_access text,
  coach_trial_games_remaining integer,
  coach_game_consumed boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user public.users%rowtype;
begin
  if p_clerk_id is null or length(p_clerk_id) not between 3 and 255
     or p_operation_id is null then
    raise exception 'invalid Coach game access command' using errcode = '22023';
  end if;

  select u.* into v_user
  from public.users u
  where u.clerk_id = p_clerk_id
  for update;

  if v_user.id is null then
    return query select false, 'ACCOUNT_SYNC_REQUIRED'::text, 'none'::text, 0, false;
    return;
  end if;

  if v_user.is_premium then
    return query select true, 'PREMIUM_ACCESS'::text, 'premium'::text, 0, false;
    return;
  end if;

  if v_user.coach_trial_operation_id = p_operation_id then
    return query select true, 'TRIAL_REPLAY'::text, 'trial'::text, 0, true;
    return;
  end if;

  if v_user.coach_trial_consumed_at is not null then
    return query select false, 'COACH_TRIAL_USED'::text, 'locked'::text, 0, false;
    return;
  end if;

  update public.users
  set coach_trial_consumed_at = pg_catalog.clock_timestamp(),
      coach_trial_operation_id = p_operation_id,
      updated_at = pg_catalog.clock_timestamp()
  where id = v_user.id;

  return query select true, 'TRIAL_CONSUMED'::text, 'trial'::text, 0, true;
end;
$$;

revoke execute on function public.consume_coach_game_access(text, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.consume_coach_game_access(text, uuid) to service_role;

commit;
