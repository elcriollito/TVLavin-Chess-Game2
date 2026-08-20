\set ON_ERROR_STOP on
begin;
drop schema public cascade;
create schema public;
do $$ begin if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if; if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if; if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role; end if; end $$;
create table public.users(id uuid primary key,clerk_id text,email text);
create table public.credit_events(id uuid primary key,user_id uuid,operation_id uuid,reservation_id uuid,capability_id text,result_code text,event_kind text,delta int,reverses_event_id uuid,created_at timestamptz);
create table public.credit_reservations(id uuid primary key,user_id uuid,operation_id uuid,capability_id text,requested_amount int,reserved_amount int,state text,result_code text,expires_at timestamptz,provider_attempt_state text,value_delivery_state text,consumed_event_id uuid,compensation_event_id uuid,created_at timestamptz);
create table public.economic_usage_events(event_id uuid primary key,operation_id uuid,user_id uuid,unit text,quantity int,provider text,model text,result_code text,value_delivery_state text,occurred_at timestamptz);
create table public.mentor_operation_results(operation_id uuid primary key,user_id uuid,ciphertext bytea,iv bytea,auth_tag bytea,plaintext_bytes int,expires_at timestamptz,replay_count int,delivered_at timestamptz,created_at timestamptz);
revoke all on public.credit_reservations,public.credit_events,public.economic_usage_events,public.mentor_operation_results from public,anon,authenticated,service_role;
\ir ../supabase/migrations/20260820231423_mentor_safe_operation_inspection.sql

do $$ declare v jsonb; begin
  select public.inspect_mentor_operation('00000000-0000-4000-8000-000000000099') into v;
  if v <> '{"found":false,"operationId":"00000000-0000-4000-8000-000000000099","reservation":null,"ledger":[],"usage":[],"result":{"exists":false,"expiresAt":null,"replayCount":null,"deliveredAt":null,"createdAt":null}}'::jsonb then raise exception 'unknown projection mismatch'; end if;
end $$;

insert into public.users values('10000000-0000-4000-8000-000000000001','private-subject','private@example.invalid');
insert into public.credit_reservations values
('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','mentor.shared_response',1,1,'RESERVED',null,clock_timestamp()+interval '10 minutes','NOT_STARTED','NOT_STARTED',null,null,clock_timestamp()),
('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002','mentor.shared_response',1,1,'CONSUMED','SUCCESS',clock_timestamp()+interval '10 minutes','SUCCEEDED','VALUE_DELIVERED','40000000-0000-4000-8000-000000000001',null,clock_timestamp()),
('20000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000003','mentor.shared_response',1,1,'COMPENSATED','COMPENSATED',clock_timestamp()+interval '10 minutes','SUCCEEDED','VALUE_UNDELIVERED','40000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000003',clock_timestamp());
insert into public.credit_events values
('40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002',null,'mentor.shared_response','SUCCESS','RESERVATION_CONSUMED',-1,null,clock_timestamp()),
('40000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000003',null,'mentor.shared_response','SUCCESS','RESERVATION_CONSUMED',-1,null,clock_timestamp()),
('40000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000003',null,'mentor.shared_response','COMPENSATED','RESERVATION_COMPENSATED',1,'40000000-0000-4000-8000-000000000002',clock_timestamp());
insert into public.economic_usage_events values('50000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','INPUT_TOKEN',7,'TOGETHER','moonshotai/Kimi-K2.5','SUCCESS','VALUE_DELIVERED',clock_timestamp());
insert into public.mentor_operation_results values('30000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','secret','secret','secret',99,clock_timestamp()+interval '10 minutes',0,null,clock_timestamp());

create temporary table before_counts as select (select count(*) from credit_events) e,(select count(*) from credit_reservations) r,(select count(*) from economic_usage_events) u,(select count(*) from mentor_operation_results) m;
do $$ declare a jsonb;b jsonb;c jsonb;serialized text; begin
 select public.inspect_mentor_operation('30000000-0000-4000-8000-000000000001') into a;
 select public.inspect_mentor_operation('30000000-0000-4000-8000-000000000002') into b;
 select public.inspect_mentor_operation('30000000-0000-4000-8000-000000000003') into c;
 if a#>>'{reservation,state}' <> 'RESERVED' then raise exception 'reserved projection'; end if;
 if jsonb_array_length(b->'ledger') <> 1 or b#>>'{usage,0,quantity}' <> '7' or b#>>'{result,exists}' <> 'true' then raise exception 'consumed projection'; end if;
 if jsonb_array_length(c->'ledger') <> 2 or c#>>'{reservation,compensationEventExists}' <> 'true' then raise exception 'compensated projection'; end if;
 serialized:=b::text; if serialized ~* 'private|secret|user_id|clerk|email|ciphertext|auth_tag|plaintext|"iv"' then raise exception 'privacy leak'; end if;
 if has_function_privilege('anon','public.inspect_mentor_operation(uuid)','EXECUTE') or has_function_privilege('authenticated','public.inspect_mentor_operation(uuid)','EXECUTE') or not has_function_privilege('service_role','public.inspect_mentor_operation(uuid)','EXECUTE') then raise exception 'grant mismatch'; end if;
 perform public.inspect_mentor_operation('30000000-0000-4000-8000-000000000002'); perform public.inspect_mentor_operation('30000000-0000-4000-8000-000000000002');
end $$;
do $$ declare before_row record;after_row record; begin select * into before_row from before_counts; select (select count(*) from credit_events) e,(select count(*) from credit_reservations) r,(select count(*) from economic_usage_events) u,(select count(*) from mentor_operation_results) m into after_row; if before_row <> after_row then raise exception 'inspection mutated state'; end if; end $$;
rollback;
\echo 'mentor operation inspection PostgreSQL rehearsal: PASS'
