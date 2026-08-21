\set ON_ERROR_STOP on
begin;
drop schema public cascade;
create schema public;
do $$ begin
  if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if;
  if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
  if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role; end if;
end $$;
create table public.users(id uuid primary key,clerk_id text unique,credits integer not null,is_premium boolean not null default false);
create table public.credit_events(id uuid primary key default gen_random_uuid(),user_id uuid references public.users(id),action text,delta integer,balance_after integer,created_at timestamptz default clock_timestamp());
\ir ../supabase/migrations/20260815_mentor_economic_foundation.sql
insert into public.users values('10000000-0000-4000-8000-000000000001','fixture-subject',4,false);
insert into public.credit_reservations(id,user_id,operation_id,capability_id,requested_amount,reserved_amount,state,result_code,expires_at,provider_attempt_state,value_delivery_state,catalog_revision,created_at)
values('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','mentor.shared_response',1,1,'CONSUMED','SUCCESS',clock_timestamp()+interval '5 minutes','SUCCEEDED','VALUE_AVAILABLE','fixture',clock_timestamp());
insert into public.mentor_operation_results(operation_id,reservation_id,user_id,schema_version,content_type,ciphertext,iv,auth_tag,plaintext_bytes,expires_at)
values('30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','MENTOR_RESULT_JSON_V1','MENTOR_RESULT_JSON_V1','x',decode(repeat('00',12),'hex'),decode(repeat('00',16),'hex'),1,clock_timestamp()+interval '15 minutes');
create temporary table before_state as select credits,(select count(*) from public.credit_events) event_count,(select count(*) from public.economic_usage_events) usage_count from public.users;
do $$ declare acknowledged record; delivered_before timestamptz; delivered_after timestamptz; begin
  select * into acknowledged from public.confirm_mentor_result_delivery('30000000-0000-4000-8000-000000000001','fixture-subject');
  select delivered_at into delivered_before from public.mentor_operation_results where operation_id='30000000-0000-4000-8000-000000000001';
  if not acknowledged.success or delivered_before is null or (select value_delivery_state from public.credit_reservations where id='20000000-0000-4000-8000-000000000001')<>'VALUE_DELIVERED' then raise exception 'first acknowledgement failed'; end if;
  select * into acknowledged from public.confirm_mentor_result_delivery('30000000-0000-4000-8000-000000000001','fixture-subject');
  select delivered_at into delivered_after from public.mentor_operation_results where operation_id='30000000-0000-4000-8000-000000000001';
  if not acknowledged.success or delivered_after<>delivered_before then raise exception 'repeated acknowledgement is not idempotent'; end if;
end $$;
do $$ declare before_row record; after_row record; begin
  select * into before_row from before_state;
  select credits,(select count(*) from public.credit_events),(select count(*) from public.economic_usage_events) into after_row from public.users;
  if before_row<>after_row then raise exception 'acknowledgement mutated economics'; end if;
end $$;
rollback;
\echo 'Mentor delivery confirmation PostgreSQL certification: PASS'
