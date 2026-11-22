-- CAISSA Arena S001 isolated-beta foundation.
--
-- This is intentionally not the general CAISSA application baseline. It creates
-- only the account anchor required by the reviewed Online, Public Identity, and
-- Arena migrations. Apply it only to a new, empty, dedicated beta project.

begin;

create table public.users (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  clerk_id text not null unique,
  email text,
  role text not null default 'member',
  is_premium boolean not null default false,
  credits integer not null default 5,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint caissa_arena_beta_users_clerk_id_check
    check (pg_catalog.char_length(clerk_id) between 1 and 255),
  constraint caissa_arena_beta_users_role_check
    check (role in ('member', 'user', 'online_guest')),
  constraint caissa_arena_beta_users_credits_check
    check (credits >= 0)
);

alter table public.users enable row level security;

revoke all on table public.users from public, anon, authenticated, service_role;
grant select, insert, update on table public.users to service_role;

comment on table public.users is
  'Minimal isolated-beta account anchor for CAISSA Online and Arena S001. Browser roles have no direct access.';

commit;
