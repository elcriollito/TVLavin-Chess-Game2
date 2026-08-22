\set ON_ERROR_STOP on
begin;
drop schema public cascade;
create schema public;
do $$ begin
 if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if;
 if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
 if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role; end if;
end $$;
create table public.users(id uuid primary key,clerk_id text unique,credits integer not null,is_premium boolean not null default false,updated_at timestamptz default clock_timestamp());
create table public.credit_events(id uuid primary key default gen_random_uuid(),user_id uuid references public.users(id),action text,delta integer,balance_after integer,created_at timestamptz default clock_timestamp());
\ir ../supabase/migrations/20260815_mentor_economic_foundation.sql
\ir ../supabase/migrations/20260820095640_mentor_maintenance_inspection.sql
\ir ../supabase/migrations/20260822001255_align_mentor_maintenance_value_available_boundary.sql

insert into public.users(id,clerk_id,credits,is_premium) values
 ('10000000-0000-4000-8000-000000000001','value-available',4,false),
 ('10000000-0000-4000-8000-000000000002','value-delivered',4,false),
 ('10000000-0000-4000-8000-000000000003','true-failure',4,false),
 ('10000000-0000-4000-8000-000000000004','provider-failure',5,false);

insert into public.credit_reservations(id,user_id,operation_id,capability_id,requested_amount,reserved_amount,state,result_code,expires_at,provider_attempt_state,value_delivery_state,catalog_revision,created_at) values
 ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','mentor.shared_response',1,1,'RESERVED',null,clock_timestamp()-interval '1 hour','SUCCEEDED','VALUE_AVAILABLE','fixture',clock_timestamp()-interval '2 hours'),
 ('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000002','mentor.shared_response',1,1,'RESERVED',null,clock_timestamp()-interval '1 hour','SUCCEEDED','VALUE_AVAILABLE','fixture',clock_timestamp()-interval '2 hours'),
 ('20000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000003','30000000-0000-4000-8000-000000000003','mentor.shared_response',1,1,'RESERVED',null,clock_timestamp()-interval '1 hour','IN_PROGRESS','PROVIDER_WORK_INCURRED','fixture',clock_timestamp()-interval '2 hours'),
 ('20000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000004','30000000-0000-4000-8000-000000000004','mentor.shared_response',1,1,'RELEASED','PROVIDER_FAILED',clock_timestamp()-interval '1 hour','FAILED','VALUE_UNDELIVERED','fixture',clock_timestamp()-interval '2 hours');
insert into public.credit_events(id,user_id,action,delta,balance_after,operation_id,reservation_id,capability_id,result_code,event_kind,catalog_revision) values
 ('40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','mentor_chat',-1,4,'30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','mentor.shared_response','SUCCESS','RESERVATION_CONSUMED','fixture'),
 ('40000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','mentor_chat',-1,4,'30000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','mentor.shared_response','SUCCESS','RESERVATION_CONSUMED','fixture'),
 ('40000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000003','mentor_chat',-1,4,'30000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000003','mentor.shared_response','SUCCESS','RESERVATION_CONSUMED','fixture');
update public.credit_reservations set state='CONSUMED',result_code='SUCCESS',consumed_event_id='40000000-0000-4000-8000-000000000001' where id='20000000-0000-4000-8000-000000000001';
update public.credit_reservations set state='CONSUMED',result_code='SUCCESS',value_delivery_state='VALUE_DELIVERED',consumed_event_id='40000000-0000-4000-8000-000000000002' where id='20000000-0000-4000-8000-000000000002';
update public.credit_reservations set state='CONSUMED',result_code='INTERNAL_FAILED',provider_attempt_state='FAILED',value_delivery_state='VALUE_UNDELIVERED',consumed_event_id='40000000-0000-4000-8000-000000000003' where id='20000000-0000-4000-8000-000000000003';
insert into public.mentor_operation_results(operation_id,reservation_id,user_id,schema_version,content_type,ciphertext,iv,auth_tag,plaintext_bytes,expires_at,delivered_at,created_at) values
 ('30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','MENTOR_RESULT_JSON_V1','MENTOR_RESULT_JSON_V1','x',decode(repeat('00',12),'hex'),decode(repeat('00',16),'hex'),1,clock_timestamp()-interval '1 minute',null,clock_timestamp()-interval '2 hours'),
 ('30000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','MENTOR_RESULT_JSON_V1','MENTOR_RESULT_JSON_V1','x',decode(repeat('00',12),'hex'),decode(repeat('00',16),'hex'),1,clock_timestamp()-interval '1 minute',clock_timestamp()-interval '2 minutes',clock_timestamp()-interval '2 hours');

\ir ../supabase/rehearsals/20260822001255_align_mentor_maintenance_value_available_boundary_rollback.sql
do $$ declare p record; begin
 select * into p from public.inspect_mentor_economic_maintenance(100);
 if p.compensate_count<>2 or (select credits from public.users where clerk_id='value-available')<>4
    or not exists(select 1 from public.mentor_operation_results where operation_id='30000000-0000-4000-8000-000000000001')
 then raise exception 'rollback changed fixture data or failed to restore old classification'; end if;
end $$;
\ir ../supabase/migrations/20260822001255_align_mentor_maintenance_value_available_boundary.sql
do $$ begin
 if has_function_privilege('public','public.reconcile_mentor_reservations(integer)','execute')
    or has_function_privilege('anon','public.reconcile_mentor_reservations(integer)','execute')
    or has_function_privilege('authenticated','public.reconcile_mentor_reservations(integer)','execute')
    or not has_function_privilege('service_role','public.reconcile_mentor_reservations(integer)','execute')
 then raise exception 'reconciliation privilege boundary failed'; end if;
 if has_function_privilege('anon','public.inspect_mentor_economic_maintenance(integer)','execute')
    or not has_function_privilege('service_role','public.inspect_mentor_economic_maintenance(integer)','execute')
 then raise exception 'inspection privilege boundary failed'; end if;
 if not exists(select 1 from pg_proc where oid='public.reconcile_mentor_reservations(integer)'::regprocedure and prosecdef and proconfig @> array['search_path=pg_catalog'])
 then raise exception 'fixed search_path/security definer missing'; end if;
end $$;
do $$ declare p record; begin select * into p from public.inspect_mentor_economic_maintenance(100); if p.compensate_count<>1 or p.cleanup_count<>1 or p.pending_delivery_ack_review<>1 then raise exception 'incorrect FIX2 classification'; end if; end $$;
select * from public.reconcile_mentor_reservations(100);
select * from public.reconcile_mentor_reservations(100);
select public.cleanup_mentor_economic_state(100);
do $$ begin
 if (select credits from public.users where clerk_id='value-available')<>4 then raise exception 'VALUE_AVAILABLE compensated'; end if;
 if (select state from public.credit_reservations where id='20000000-0000-4000-8000-000000000001')<>'CONSUMED' then raise exception 'VALUE_AVAILABLE transitioned'; end if;
 if not exists(select 1 from public.mentor_operation_results where operation_id='30000000-0000-4000-8000-000000000001') then raise exception 'ACK-missing evidence cleaned'; end if;
 if exists(select 1 from public.mentor_operation_results where operation_id='30000000-0000-4000-8000-000000000002') then raise exception 'VALUE_DELIVERED not cleaned'; end if;
 if (select credits from public.users where clerk_id='true-failure')<>5 then raise exception 'true failure not compensated exactly once'; end if;
 if (select count(*) from public.credit_events where user_id='10000000-0000-4000-8000-000000000003' and event_kind='RESERVATION_COMPENSATED')<>1 then raise exception 'compensation not idempotent'; end if;
 if (select credits from public.users where clerk_id='provider-failure')<>5 then raise exception 'provider failure mutated wallet'; end if;
end $$;
rollback;
\echo 'FIX2 PostgreSQL certification: PASS'
