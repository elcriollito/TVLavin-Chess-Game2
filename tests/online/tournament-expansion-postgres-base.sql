\set ON_ERROR_STOP on

create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create schema realtime;

create or replace function auth.jwt()
returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb)
$$;
create or replace function realtime.topic()
returns text language sql stable as $$
  select nullif(current_setting('realtime.topic', true), '')
$$;
create table realtime.messages(extension text);
alter table realtime.messages enable row level security;
create or replace function realtime.send(jsonb, text, text, boolean)
returns void language sql as $$ select $$;
create or replace function realtime.broadcast_changes(text, text, text, text, text, anyelement, anyelement)
returns void language sql as $$ select $$;

create table public.users (
  id uuid primary key default gen_random_uuid(),
  clerk_id text not null unique,
  email text,
  role text not null default 'user',
  is_premium boolean not null default false,
  credits integer not null default 0
);

\ir ../../supabase/migrations/20261005204209_caissa_online_native_v1.sql
\ir ../../supabase/migrations/20261011150814_caissa_online_hardening_only_v3.sql
\ir ../../supabase/migrations/20261014035549_caissa_public_identity_v1.sql
\ir ../../supabase/migrations/20261120033413_caissa_online_arena_s001.sql
\ir ../../supabase/migrations/20261121034500_caissa_tournament_ux_s001.sql
