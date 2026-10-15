-- Synthetic-only compatibility stubs for the isolated SEC-005 PostgreSQL lab.
-- They model only the Supabase-owned catalog objects referenced by migrations.
-- Never apply this file to a hosted Supabase project.

create schema if not exists auth;
create schema if not exists realtime;

create table if not exists realtime.messages (
  id bigint generated always as identity primary key,
  extension text not null default 'broadcast',
  topic text,
  event text,
  payload jsonb
);
alter table realtime.messages enable row level security;

create or replace function auth.jwt()
returns jsonb
language sql
stable
set search_path = ''
as $$
  select coalesce(
    nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb,
    '{}'::jsonb
  );
$$;

create or replace function realtime.topic()
returns text
language sql
stable
set search_path = ''
as $$
  select nullif(pg_catalog.current_setting('realtime.topic', true), '');
$$;

create or replace function realtime.broadcast_changes(
  topic text,
  event text,
  operation text,
  table_name text,
  table_schema text,
  new_record record,
  old_record record
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  insert into realtime.messages(extension, topic, event, payload)
  values (
    'broadcast', topic, event,
    pg_catalog.jsonb_build_object('operation', operation, 'table', table_name, 'schema', table_schema)
  );
end;
$$;

create or replace function realtime.send(
  payload jsonb,
  event text,
  topic text,
  private boolean
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  insert into realtime.messages(extension, topic, event, payload)
  values ('broadcast', topic, event, payload);
end;
$$;

