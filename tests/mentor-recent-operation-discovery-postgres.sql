\set ON_ERROR_STOP on
begin;
drop schema public cascade;
create schema public;
do $$ begin
  if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if;
  if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
  if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role; end if;
end $$;
create table public.credit_reservations(
  id uuid primary key,user_id uuid,operation_id uuid,capability_id text,
  requested_amount int,reserved_amount int,state text,result_code text,
  expires_at timestamptz,provider_attempt_state text,value_delivery_state text,
  consumed_event_id uuid,compensation_event_id uuid,created_at timestamptz
);
create table public.credit_events(id uuid primary key);
create table public.economic_usage_events(event_id uuid primary key);
create table public.mentor_operation_results(operation_id uuid primary key);
revoke all on public.credit_reservations,public.credit_events,public.economic_usage_events,public.mentor_operation_results from public,anon,authenticated,service_role;
\ir ../supabase/migrations/20260821210019_mentor_recent_operation_discovery.sql

do $$ begin
  if has_function_privilege('anon','public.find_recent_mentor_operation(uuid,timestamptz,timestamptz)','EXECUTE')
    or has_function_privilege('authenticated','public.find_recent_mentor_operation(uuid,timestamptz,timestamptz)','EXECUTE')
    or not has_function_privilege('service_role','public.find_recent_mentor_operation(uuid,timestamptz,timestamptz)','EXECUTE')
    or has_table_privilege('service_role','public.credit_reservations','SELECT') then
    raise exception 'privilege boundary mismatch';
  end if;
end $$;

do $$ declare n int; begin
  select count(*) into n from public.find_recent_mentor_operation('10000000-0000-4000-8000-000000000001','2026-08-21T20:30:00Z','2026-08-21T20:40:00Z');
  if n <> 0 then raise exception 'zero-match contract'; end if;
end $$;

insert into public.credit_reservations values
('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','mentor.shared_response',1,1,'CONSUMED','SUCCESS','2026-08-21T20:45:00Z','SUCCEEDED','VALUE_DELIVERED',null,null,'2026-08-21T20:35:00Z');

create temporary table before_counts as select count(*) n from public.credit_reservations;
do $$ declare n int; op uuid; begin
  select count(*) into n from public.find_recent_mentor_operation('10000000-0000-4000-8000-000000000001','2026-08-21T20:30:00Z','2026-08-21T20:40:00Z');
  select operation_id into op from public.find_recent_mentor_operation('10000000-0000-4000-8000-000000000001','2026-08-21T20:30:00Z','2026-08-21T20:40:00Z');
  if n <> 1 or op <> '30000000-0000-4000-8000-000000000001' then raise exception 'one-match contract'; end if;
end $$;

do $$ begin
  begin perform * from public.find_recent_mentor_operation(null,'2026-08-21T20:30:00Z','2026-08-21T20:40:00Z'); raise exception 'null accepted'; exception when invalid_parameter_value then null; end;
  begin perform * from public.find_recent_mentor_operation('10000000-0000-4000-8000-000000000001','2026-08-21T20:40:00Z','2026-08-21T20:30:00Z'); raise exception 'reversed accepted'; exception when invalid_parameter_value then null; end;
  begin perform * from public.find_recent_mentor_operation('10000000-0000-4000-8000-000000000001','2026-08-21T20:00:00Z','2026-08-21T20:30:01Z'); raise exception 'wide accepted'; exception when invalid_parameter_value then null; end;
end $$;

insert into public.credit_reservations values
('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002','mentor.shared_response',1,1,'RELEASED','PROVIDER_FAILED','2026-08-21T20:46:00Z','FAILED','VALUE_UNDELIVERED',null,null,'2026-08-21T20:36:00Z');
do $$ begin
  begin perform * from public.find_recent_mentor_operation('10000000-0000-4000-8000-000000000001','2026-08-21T20:30:00Z','2026-08-21T20:40:00Z'); raise exception 'ambiguity accepted'; exception when cardinality_violation then null; end;
end $$;
do $$ declare before_n int; after_n int; begin
  select n into before_n from before_counts;
  select count(*) - 1 into after_n from public.credit_reservations;
  if before_n <> after_n then raise exception 'discovery mutated state'; end if;
end $$;

\ir ../supabase/rehearsals/20260821210019_mentor_recent_operation_discovery_rollback.sql
do $$ begin if to_regprocedure('public.find_recent_mentor_operation(uuid,timestamptz,timestamptz)') is not null then raise exception 'rollback failed'; end if; end $$;
\ir ../supabase/migrations/20260821210019_mentor_recent_operation_discovery.sql
do $$ begin if to_regprocedure('public.find_recent_mentor_operation(uuid,timestamptz,timestamptz)') is null then raise exception 'reapply failed'; end if; end $$;
rollback;
\echo 'mentor recent operation discovery PostgreSQL rehearsal: PASS'
