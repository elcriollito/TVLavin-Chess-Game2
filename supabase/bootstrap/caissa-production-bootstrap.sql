-- CAISSA authoritative production application-schema bootstrap.
-- Deliberate operator action only. Do not add this file to the migration queue.
-- Release invariant: apply only after the certified new webhook code is serving.

begin;

do $caissa_preflight$
declare
  v_unexpected text;
begin
  if current_user <> 'postgres' then
    raise exception 'CAISSA bootstrap must run as the Supabase postgres owner';
  end if;

  if current_database() is null then
    raise exception 'CAISSA bootstrap requires a PostgreSQL database';
  end if;

  if to_regprocedure('pg_catalog.gen_random_uuid()') is null then
    raise exception 'CAISSA bootstrap requires pg_catalog.gen_random_uuid()';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_roles where rolname = 'postgres'
  ) or not exists (
    select 1 from pg_catalog.pg_roles where rolname = 'service_role'
  ) or not exists (
    select 1 from pg_catalog.pg_roles where rolname = 'anon'
  ) or not exists (
    select 1 from pg_catalog.pg_roles where rolname = 'authenticated'
  ) then
    raise exception 'CAISSA bootstrap requires Supabase postgres, service_role, anon, and authenticated roles';
  end if;

  if to_regclass('public.caissa_schema_meta') is not null then
    if exists (
      select 1
      from public.caissa_schema_meta
      where schema_family = 'caissa-application'
        and bootstrap_version = '2026-08-11.1'
        and release_compatibility = 'security-season-12'
    ) then
      raise exception 'CAISSA_BOOTSTRAP_ALREADY_APPLIED:2026-08-11.1';
    end if;
    raise exception 'CAISSA_BOOTSTRAP_PARTIAL_OR_UNKNOWN:caissa_schema_meta';
  end if;

  select string_agg(candidate, ', ' order by candidate)
  into v_unexpected
  from (
    select candidate
    from unnest(array[
      'users', 'credit_events', 'stripe_events', 'library_positions',
      'library_collections', 'library_sync_log'
    ]) candidate
    where to_regclass('public.' || candidate) is not null
    union all
    select candidate
    from unnest(array[
      'consume_credits(text,integer,text)', 'add_credits(text,integer,text)'
    ]) candidate
    where to_regprocedure('public.' || candidate) is not null
  ) unexpected;

  if v_unexpected is not null then
    raise exception 'CAISSA_BOOTSTRAP_PARTIAL_OR_UNKNOWN:%', v_unexpected;
  end if;
end
$caissa_preflight$;

revoke create on schema public from public, anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;

create table public.caissa_schema_meta (
  schema_family text primary key,
  bootstrap_version text not null,
  release_compatibility text not null,
  applied_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint caissa_schema_meta_family_check
    check (schema_family = 'caissa-application'),
  constraint caissa_schema_meta_version_check
    check (bootstrap_version = '2026-08-11.1'),
  constraint caissa_schema_meta_release_check
    check (release_compatibility = 'security-season-12')
);

create table public.users (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  clerk_id text not null unique,
  email text,
  role text not null default 'member',
  is_premium boolean not null default false,
  credits integer not null default 5,
  stripe_customer_id text,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint users_clerk_id_check check (length(clerk_id) between 1 and 255),
  constraint users_email_check check (email is null or length(email) between 3 and 320),
  constraint users_role_check check (length(role) between 1 and 64),
  constraint users_credits_check check (credits between 0 and 2147483647),
  constraint users_stripe_customer_id_check
    check (stripe_customer_id is null or length(stripe_customer_id) between 5 and 255)
);

create index idx_users_clerk_id on public.users(clerk_id);
create index idx_users_stripe_customer on public.users(stripe_customer_id);

create table public.credit_events (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  action text not null,
  delta integer not null,
  balance_after integer not null,
  created_at timestamptz not null default pg_catalog.now(),
  constraint credit_events_action_check check (length(action) between 1 and 128),
  constraint credit_events_delta_check check (delta <> 0),
  constraint credit_events_balance_check check (balance_after between 0 and 2147483647)
);

create index idx_credit_events_user_id on public.credit_events(user_id);
create index idx_credit_events_created_at on public.credit_events(created_at);

create table public.stripe_events (
  event_id text primary key,
  event_type text not null,
  processed_at timestamptz not null default pg_catalog.now(),
  constraint stripe_events_event_id_check check (length(event_id) between 5 and 255),
  constraint stripe_events_event_type_check check (length(event_type) between 3 and 128)
);

create index idx_stripe_events_type on public.stripe_events(event_type);

create table public.library_positions (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  local_id text not null,
  fen text not null,
  fen_hash text,
  title text,
  author text,
  source text,
  tags jsonb not null default '[]'::jsonb,
  themes jsonb not null default '[]'::jsonb,
  collection_local_id text,
  engine_report jsonb,
  annotations jsonb not null default '[]'::jsonb,
  is_favorite boolean not null default false,
  is_archived boolean not null default false,
  game_context jsonb,
  local_created_at bigint,
  local_updated_at bigint,
  synced_at timestamptz not null default pg_catalog.now(),
  version integer not null default 1,
  constraint library_positions_local_id_check check (length(local_id) between 1 and 255),
  constraint library_positions_fen_check check (length(fen) between 1 and 255),
  constraint library_positions_version_check check (version > 0),
  unique(user_id, local_id)
);

create index idx_library_positions_user on public.library_positions(user_id);
create index idx_library_positions_synced on public.library_positions(user_id, synced_at);

create table public.library_collections (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  local_id text not null,
  name text not null,
  description text,
  type text not null default 'manual',
  game_metadata jsonb,
  is_default boolean not null default false,
  local_created_at bigint,
  local_updated_at bigint,
  synced_at timestamptz not null default pg_catalog.now(),
  version integer not null default 1,
  constraint library_collections_local_id_check check (length(local_id) between 1 and 255),
  constraint library_collections_name_check check (length(name) between 1 and 255),
  constraint library_collections_type_check check (length(type) between 1 and 64),
  constraint library_collections_version_check check (version > 0),
  unique(user_id, local_id)
);

create index idx_library_collections_user on public.library_collections(user_id);

create table public.library_sync_log (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  action text not null,
  item_type text not null,
  item_count integer not null default 0,
  synced_at timestamptz not null default pg_catalog.now(),
  constraint library_sync_log_action_check check (length(action) between 1 and 64),
  constraint library_sync_log_item_type_check check (length(item_type) between 1 and 64),
  constraint library_sync_log_item_count_check check (item_count >= 0)
);

create index idx_library_sync_log_user on public.library_sync_log(user_id);

alter table public.caissa_schema_meta enable row level security;
alter table public.users enable row level security;
alter table public.credit_events enable row level security;
alter table public.stripe_events enable row level security;
alter table public.library_positions enable row level security;
alter table public.library_collections enable row level security;
alter table public.library_sync_log enable row level security;

revoke all on table public.caissa_schema_meta from public, anon, authenticated, service_role;
revoke all on table public.users from public, anon, authenticated, service_role;
revoke all on table public.credit_events from public, anon, authenticated, service_role;
revoke all on table public.stripe_events from public, anon, authenticated, service_role;
revoke all on table public.library_positions from public, anon, authenticated, service_role;
revoke all on table public.library_collections from public, anon, authenticated, service_role;
revoke all on table public.library_sync_log from public, anon, authenticated, service_role;

grant select on table public.caissa_schema_meta to service_role;
grant select, insert, update on table public.users to service_role;
grant select on table public.credit_events to service_role;
grant select, insert, update, delete on table public.library_positions to service_role;
grant select, insert, update, delete on table public.library_collections to service_role;
grant select, insert on table public.library_sync_log to service_role;

create function public.consume_credits(
  p_clerk_id text,
  p_cost integer,
  p_action text
)
returns table(success boolean, new_balance integer, message text)
language plpgsql
security definer
set search_path = pg_catalog
as $consume_credits$
declare
  v_user public.users%rowtype;
  v_new_balance integer;
begin
  if p_clerk_id is null or length(p_clerk_id) not between 1 and 255 then
    raise exception 'invalid credit subject' using errcode = '22023';
  end if;
  if p_cost is null or p_cost not between 1 and 2 then
    raise exception 'invalid credit cost' using errcode = '22023';
  end if;
  if p_action is null or p_action not in ('mentor_chat', 'insight', 'batch_analysis', 'game_review') then
    raise exception 'invalid credit action' using errcode = '22023';
  end if;

  select u.* into v_user
  from public.users u
  where u.clerk_id = p_clerk_id
  for update;

  if v_user.id is null then
    return query select false, 0, 'User not found'::text;
    return;
  end if;
  if v_user.is_premium then
    return query select true, v_user.credits, 'Premium user - no deduction'::text;
    return;
  end if;
  if v_user.credits < p_cost then
    return query select false, v_user.credits, 'Insufficient credits'::text;
    return;
  end if;

  v_new_balance := v_user.credits - p_cost;
  update public.users u
  set credits = v_new_balance, updated_at = pg_catalog.now()
  where u.id = v_user.id;
  insert into public.credit_events(user_id, action, delta, balance_after)
  values (v_user.id, p_action, -p_cost, v_new_balance);
  return query select true, v_new_balance, 'Credits consumed'::text;
end
$consume_credits$;

create function public.add_credits(
  p_clerk_id text,
  p_amount integer,
  p_reason text
)
returns table(success boolean, new_balance integer)
language plpgsql
security definer
set search_path = pg_catalog
as $add_credits$
declare
  v_user public.users%rowtype;
  v_new_balance_bigint bigint;
  v_new_balance integer;
begin
  if p_clerk_id is null or length(p_clerk_id) not between 1 and 255 then
    raise exception 'invalid credit subject' using errcode = '22023';
  end if;
  if p_amount is null or p_amount not between 1 and 200 then
    raise exception 'invalid credit amount' using errcode = '22023';
  end if;
  if p_reason is null or length(p_reason) not between 1 and 128 then
    raise exception 'invalid credit reason' using errcode = '22023';
  end if;

  select u.* into v_user
  from public.users u
  where u.clerk_id = p_clerk_id
  for update;

  if v_user.id is null then
    return query select false, 0;
    return;
  end if;

  v_new_balance_bigint := v_user.credits::bigint + p_amount::bigint;
  if v_new_balance_bigint > 2147483647 then
    raise exception 'credit balance overflow' using errcode = '22003';
  end if;
  v_new_balance := v_new_balance_bigint::integer;
  update public.users u
  set credits = v_new_balance, updated_at = pg_catalog.now()
  where u.id = v_user.id;
  insert into public.credit_events(user_id, action, delta, balance_after)
  values (v_user.id, p_reason, p_amount, v_new_balance);
  return query select true, v_new_balance;
end
$add_credits$;

alter function public.consume_credits(text, integer, text) owner to postgres;
alter function public.add_credits(text, integer, text) owner to postgres;
revoke all on function public.consume_credits(text, integer, text) from public, anon, authenticated;
revoke all on function public.add_credits(text, integer, text) from public, anon, authenticated;
grant execute on function public.consume_credits(text, integer, text) to service_role;
grant execute on function public.add_credits(text, integer, text) to service_role;

insert into public.caissa_schema_meta(schema_family, bootstrap_version, release_compatibility)
values ('caissa-application', '2026-08-11.1', 'security-season-12');

commit;
