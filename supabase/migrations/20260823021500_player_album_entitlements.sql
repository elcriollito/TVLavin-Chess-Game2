begin;

create table if not exists public.player_album_entitlements (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  album_id text not null,
  credit_cost integer not null default 1,
  operation_id uuid not null,
  acquired_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint player_album_entitlements_album_id_check
    check (album_id ~ '^[a-z0-9][a-z0-9-]{2,95}$'),
  constraint player_album_entitlements_credit_cost_check check (credit_cost = 1),
  constraint player_album_entitlements_user_album_unique unique (user_id, album_id),
  constraint player_album_entitlements_user_operation_unique unique (user_id, operation_id)
);

create index if not exists player_album_entitlements_user_id_idx
  on public.player_album_entitlements(user_id);

alter table public.player_album_entitlements enable row level security;
alter table public.player_album_entitlements force row level security;
revoke all on public.player_album_entitlements from public, anon, authenticated, service_role;
grant select, insert on public.player_album_entitlements to service_role;

create or replace function public.unlock_player_album(
  p_clerk_id text,
  p_album_id text,
  p_operation_id uuid
)
returns table(success boolean, code text, credits integer, owned boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user public.users%rowtype;
  v_entitlement public.player_album_entitlements%rowtype;
  v_balance integer;
begin
  if p_clerk_id is null or length(p_clerk_id) not between 3 and 255
     or p_album_id is null or p_album_id !~ '^[a-z0-9][a-z0-9-]{2,95}$'
     or p_operation_id is null then
    raise exception 'invalid player album unlock command' using errcode = '22023';
  end if;

  select u.* into v_user
  from public.users u
  where u.clerk_id = p_clerk_id
  for update;
  if v_user.id is null then
    return query select false, 'ACCOUNT_SYNC_REQUIRED'::text, 0, false;
    return;
  end if;

  select e.* into v_entitlement
  from public.player_album_entitlements e
  where e.user_id = v_user.id and e.album_id = p_album_id;
  if v_entitlement.id is not null then
    return query select true, 'ALREADY_OWNED'::text, v_user.credits, true;
    return;
  end if;

  select e.* into v_entitlement
  from public.player_album_entitlements e
  where e.user_id = v_user.id and e.operation_id = p_operation_id;
  if v_entitlement.id is not null then
    raise exception 'idempotency key already used for another album' using errcode = '22023';
  end if;

  if v_user.credits < 1 then
    return query select false, 'INSUFFICIENT_CREDITS'::text, v_user.credits, false;
    return;
  end if;

  v_balance := v_user.credits - 1;
  update public.users set credits = v_balance, updated_at = pg_catalog.clock_timestamp()
  where id = v_user.id;

  insert into public.player_album_entitlements(user_id, album_id, credit_cost, operation_id)
  values (v_user.id, p_album_id, 1, p_operation_id);

  insert into public.credit_events(
    user_id, action, delta, balance_after, operation_id,
    capability_id, result_code, event_kind, catalog_revision
  ) values (
    v_user.id, 'player_album_unlock', -1, v_balance, p_operation_id,
    p_album_id, 'SUCCESS', 'PLAYER_ALBUM_UNLOCK', 'pgn-player-albums@1'
  );

  return query select true, 'UNLOCKED'::text, v_balance, true;
end;
$$;

revoke execute on function public.unlock_player_album(text, text, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.unlock_player_album(text, text, uuid) to service_role;

commit;
