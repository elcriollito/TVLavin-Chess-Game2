-- S0.2P.4 Mentor economic foundation. Source/local rehearsal only; reservations default off in application code.
alter table public.credit_events
  add column if not exists operation_id uuid,
  add column if not exists reservation_id uuid,
  add column if not exists capability_id text,
  add column if not exists result_code text,
  add column if not exists event_kind text,
  add column if not exists reverses_event_id uuid references public.credit_events(id) on delete restrict,
  add column if not exists catalog_revision text;
create unique index if not exists credit_events_reservation_debit_unique on public.credit_events(reservation_id) where event_kind='RESERVATION_CONSUMED';
create unique index if not exists credit_events_reversal_unique on public.credit_events(reverses_event_id) where reverses_event_id is not null;
create index if not exists credit_events_operation_idx on public.credit_events(operation_id) where operation_id is not null;

create table if not exists public.credit_reservations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  operation_id uuid not null,
  capability_id text not null check (capability_id in ('mentor.shared_response','mentor.byo_response')),
  requested_amount integer not null check (requested_amount between 0 and 2),
  reserved_amount integer not null check (reserved_amount between 0 and 2),
  state text not null check (state in ('RESERVED','CONSUMED','RELEASED','EXPIRED_RELEASED','COMPENSATED','REJECTED')),
  result_code text,
  expires_at timestamptz not null,
  provider_attempt_state text not null default 'NOT_STARTED' check (provider_attempt_state in ('NOT_STARTED','IN_PROGRESS','SUCCEEDED','FAILED','UNKNOWN')),
  value_delivery_state text not null default 'NOT_STARTED' check (value_delivery_state in ('NOT_STARTED','PROVIDER_WORK_INCURRED','VALUE_AVAILABLE','VALUE_DELIVERED','VALUE_UNDELIVERED','UNKNOWN')),
  consumed_event_id uuid references public.credit_events(id) on delete restrict,
  compensation_event_id uuid references public.credit_events(id) on delete restrict,
  catalog_revision text not null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique(user_id,operation_id,capability_id),
  check (expires_at > created_at)
);
create index if not exists credit_reservations_reconcile_idx on public.credit_reservations(state,expires_at,id);
create index if not exists credit_reservations_user_active_idx on public.credit_reservations(user_id,state) where state='RESERVED';
create index if not exists credit_reservations_operation_idx on public.credit_reservations(operation_id);

do $$ begin
  alter table public.credit_events add constraint credit_events_reservation_fk foreign key (reservation_id) references public.credit_reservations(id) on delete restrict;
exception when duplicate_object then null; end $$;

create table if not exists public.economic_usage_events (
  event_id uuid primary key,
  operation_id uuid not null,
  reservation_id uuid references public.credit_reservations(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  capability_id text not null check (capability_id in ('mentor.shared_response','mentor.byo_response')),
  provider text not null check (provider in ('TOGETHER','LLAMA','OPENAI','ANTHROPIC')),
  model text not null check (length(model) between 1 and 128),
  unit text not null check (unit in ('INPUT_TOKEN','OUTPUT_TOKEN','CACHED_INPUT_TOKEN','AI_COMPUTE_UNIT','CREDIT')),
  quantity integer not null check (quantity between 0 and 2147483647),
  usage_available boolean not null,
  duration_ms integer not null check (duration_ms between 0 and 300000),
  result_code text not null,
  value_delivery_state text not null check (value_delivery_state in ('NOT_STARTED','PROVIDER_WORK_INCURRED','VALUE_AVAILABLE','VALUE_DELIVERED','VALUE_UNDELIVERED','UNKNOWN')),
  catalog_revision text not null,
  schema_version integer not null check (schema_version=1),
  occurred_at timestamptz not null,
  created_at timestamptz not null default clock_timestamp(),
  unique(operation_id,event_id,unit)
);
create index if not exists economic_usage_operation_idx on public.economic_usage_events(operation_id);

do $$ begin
  alter table public.credit_reservations add constraint credit_reservations_result_code_check
    check (result_code is null or result_code in (
      'SUCCESS','USER_CANCELED','VALIDATION_FAILED','AUTH_FAILED','INSUFFICIENT_CREDITS',
      'RATE_LIMITED','PROVIDER_FAILED','PROVIDER_TIMEOUT','INTERNAL_FAILED','CLIENT_DISCONNECTED',
      'DUPLICATE','RESERVATION_EXPIRED','COMPENSATED','DELIVERY_CONFIRMED','DELIVERY_UNKNOWN',
      'PAYLOAD_TOO_LARGE','UNKNOWN_PROVIDER','UNKNOWN_MODEL','USAGE_UNAVAILABLE'
    ));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.economic_usage_events add constraint economic_usage_events_result_code_check
    check (result_code in (
      'SUCCESS','USER_CANCELED','VALIDATION_FAILED','AUTH_FAILED','INSUFFICIENT_CREDITS',
      'RATE_LIMITED','PROVIDER_FAILED','PROVIDER_TIMEOUT','INTERNAL_FAILED','CLIENT_DISCONNECTED',
      'DUPLICATE','RESERVATION_EXPIRED','COMPENSATED','DELIVERY_CONFIRMED','DELIVERY_UNKNOWN',
      'PAYLOAD_TOO_LARGE','UNKNOWN_PROVIDER','UNKNOWN_MODEL','USAGE_UNAVAILABLE'
    ));
exception when duplicate_object then null; end $$;

create table if not exists public.mentor_operation_results (
  operation_id uuid primary key,
  reservation_id uuid not null unique references public.credit_reservations(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  schema_version text not null check (schema_version='MENTOR_RESULT_JSON_V1'),
  content_type text not null check (content_type='MENTOR_RESULT_JSON_V1'),
  ciphertext bytea not null,
  iv bytea not null check (octet_length(iv)=12),
  auth_tag bytea not null check (octet_length(auth_tag)=16),
  plaintext_bytes integer not null check (plaintext_bytes between 1 and 327680),
  expires_at timestamptz not null,
  replay_count integer not null default 0 check (replay_count between 0 and 20),
  delivered_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  check (expires_at > created_at)
);
create index if not exists mentor_results_expiry_idx on public.mentor_operation_results(expires_at);

alter table public.credit_reservations enable row level security;
alter table public.economic_usage_events enable row level security;
alter table public.mentor_operation_results enable row level security;
revoke all on public.credit_reservations,public.economic_usage_events,public.mentor_operation_results from public,anon,authenticated,service_role;
grant select,insert on public.economic_usage_events to service_role;
grant select,insert,update,delete on public.mentor_operation_results to service_role;

create or replace function public.reserve_credits(p_clerk_id text,p_operation_id uuid,p_capability_id text,p_amount integer,p_expires_at timestamptz,p_catalog_revision text)
returns table(success boolean,code text,reservation_id uuid,user_id uuid,state text,reserved_amount integer,new_balance integer,premium boolean)
language plpgsql security definer set search_path=pg_catalog as $$
declare v_user public.users%rowtype; v_res public.credit_reservations%rowtype; v_active integer;
begin
 if p_clerk_id is null or length(p_clerk_id) not between 1 and 255 or p_operation_id is null or p_capability_id<>'mentor.shared_response' or p_amount not between 1 and 2 or p_expires_at<=clock_timestamp() or p_expires_at>clock_timestamp()+interval '15 minutes' or length(p_catalog_revision) not between 1 and 64 then raise exception 'invalid reservation request' using errcode='22023'; end if;
 select * into v_user from public.users where clerk_id=p_clerk_id for update;
 if v_user.id is null then return query select false,'USER_NOT_FOUND',null::uuid,null::uuid,null::text,0,0,false; return; end if;
 select * into v_res from public.credit_reservations where credit_reservations.user_id=v_user.id and operation_id=p_operation_id and capability_id=p_capability_id;
 if v_res.id is not null then return query select (v_res.state in ('RESERVED','CONSUMED')),case when v_res.state in ('RESERVED','CONSUMED') then 'DUPLICATE' else v_res.state end,v_res.id,v_user.id,v_res.state,v_res.reserved_amount,v_user.credits,v_user.is_premium; return; end if;
 select coalesce(sum(r.reserved_amount),0)::integer into v_active from public.credit_reservations r where r.user_id=v_user.id and r.state='RESERVED' and r.expires_at>clock_timestamp();
 if not v_user.is_premium and v_user.credits-v_active<p_amount then return query select false,'INSUFFICIENT_CREDITS',null::uuid,v_user.id,'REJECTED',0,v_user.credits,false; return; end if;
 insert into public.credit_reservations(user_id,operation_id,capability_id,requested_amount,reserved_amount,state,expires_at,catalog_revision)
 values(v_user.id,p_operation_id,p_capability_id,p_amount,case when v_user.is_premium then 0 else p_amount end,'RESERVED',p_expires_at,p_catalog_revision) returning * into v_res;
 return query select true,'RESERVED',v_res.id,v_user.id,v_res.state,v_res.reserved_amount,v_user.credits,v_user.is_premium;
end $$;

create or replace function public.mark_reservation_provider_attempt(p_reservation_id uuid)
returns table(success boolean,code text,should_call_provider boolean) language plpgsql security definer set search_path=pg_catalog as $$
declare v public.credit_reservations%rowtype;
begin select * into v from public.credit_reservations where id=p_reservation_id for update;
 if v.id is null then return query select false,'NOT_FOUND',false; return; end if;
 if v.state<>'RESERVED' then return query select false,v.state,false; return; end if;
 if v.provider_attempt_state<>'NOT_STARTED' then return query select true,'DUPLICATE',false; return; end if;
 update public.credit_reservations set provider_attempt_state='IN_PROGRESS',value_delivery_state='PROVIDER_WORK_INCURRED',updated_at=clock_timestamp() where id=v.id;
 return query select true,'PROVIDER_WORK_INCURRED',true; end $$;

create or replace function public.release_reservation(p_reservation_id uuid,p_result_code text)
returns table(success boolean,code text,state text) language plpgsql security definer set search_path=pg_catalog as $$
declare v public.credit_reservations%rowtype;
begin select * into v from public.credit_reservations where id=p_reservation_id for update;
 if v.id is null then return query select false,'NOT_FOUND',null::text; return; end if;
 if v.state='RELEASED' then return query select true,'DUPLICATE',v.state; return; end if;
 if v.state<>'RESERVED' then raise exception 'invalid reservation transition' using errcode='55000'; end if;
 update public.credit_reservations set state='RELEASED',result_code=p_result_code,provider_attempt_state=case when provider_attempt_state='IN_PROGRESS' then 'FAILED' else provider_attempt_state end,value_delivery_state='VALUE_UNDELIVERED',updated_at=clock_timestamp() where id=v.id;
 return query select true,'RELEASED','RELEASED'; end $$;

create or replace function public.consume_reservation(p_reservation_id uuid)
returns table(success boolean,code text,state text,new_balance integer) language plpgsql security definer set search_path=pg_catalog as $$
declare v public.credit_reservations%rowtype; u public.users%rowtype; eid uuid; bal integer;
begin select * into v from public.credit_reservations where id=p_reservation_id for update;
 if v.id is null then return query select false,'NOT_FOUND',null::text,0; return; end if;
 select * into u from public.users where id=v.user_id for update;
 if v.state='CONSUMED' then return query select true,'DUPLICATE',v.state,u.credits; return; end if;
 if v.state<>'RESERVED' or v.value_delivery_state<>'VALUE_AVAILABLE' or not exists(select 1 from public.mentor_operation_results where reservation_id=v.id and expires_at>clock_timestamp()) then raise exception 'result not available for consumption' using errcode='55000'; end if;
 if u.credits<v.reserved_amount then raise exception 'reserved wallet invariant violated' using errcode='55000'; end if;
 bal:=u.credits-v.reserved_amount;
 if v.reserved_amount>0 then update public.users set credits=bal,updated_at=clock_timestamp() where id=u.id;
  insert into public.credit_events(user_id,action,delta,balance_after,operation_id,reservation_id,capability_id,result_code,event_kind,catalog_revision) values(u.id,'mentor_chat',-v.reserved_amount,bal,v.operation_id,v.id,v.capability_id,'SUCCESS','RESERVATION_CONSUMED',v.catalog_revision) returning id into eid; end if;
 update public.credit_reservations set state='CONSUMED',result_code='SUCCESS',provider_attempt_state='SUCCEEDED',consumed_event_id=eid,updated_at=clock_timestamp() where id=v.id;
 return query select true,'CONSUMED','CONSUMED',bal; end $$;

create or replace function public.compensate_consumption(p_reservation_id uuid,p_result_code text)
returns table(success boolean,code text,state text,new_balance integer) language plpgsql security definer set search_path=pg_catalog as $$
declare v public.credit_reservations%rowtype; u public.users%rowtype; eid uuid; bal integer;
begin select * into v from public.credit_reservations where id=p_reservation_id for update; if v.id is null then return query select false,'NOT_FOUND',null::text,0; return; end if;
 select * into u from public.users where id=v.user_id for update;
 if v.state='COMPENSATED' then return query select true,'DUPLICATE',v.state,u.credits; return; end if;
 if v.state<>'CONSUMED' then raise exception 'invalid reservation transition' using errcode='55000'; end if;
 bal:=u.credits+v.reserved_amount;
 if v.reserved_amount>0 then update public.users set credits=bal,updated_at=clock_timestamp() where id=u.id;
  insert into public.credit_events(user_id,action,delta,balance_after,operation_id,reservation_id,capability_id,result_code,event_kind,reverses_event_id,catalog_revision) values(u.id,'mentor_chat_compensation',v.reserved_amount,bal,v.operation_id,v.id,v.capability_id,p_result_code,'RESERVATION_COMPENSATED',v.consumed_event_id,v.catalog_revision) returning id into eid; end if;
 update public.credit_reservations set state='COMPENSATED',result_code='COMPENSATED',value_delivery_state='VALUE_UNDELIVERED',compensation_event_id=eid,updated_at=clock_timestamp() where id=v.id;
 return query select true,'COMPENSATED','COMPENSATED',bal; end $$;

create or replace function public.expire_reservations(p_batch_size integer default 100)
returns integer language plpgsql security definer set search_path=pg_catalog as $$ declare n integer; begin
 if p_batch_size not between 1 and 500 then raise exception 'invalid batch size' using errcode='22023'; end if;
 with targets as (select id from public.credit_reservations where state='RESERVED' and expires_at<=clock_timestamp() order by expires_at limit p_batch_size for update skip locked)
 update public.credit_reservations r set state='EXPIRED_RELEASED',result_code='RESERVATION_EXPIRED',value_delivery_state='VALUE_UNDELIVERED',updated_at=clock_timestamp() from targets where r.id=targets.id;
 get diagnostics n=row_count; return n; end $$;

create or replace function public.mark_mentor_result_available(p_reservation_id uuid)
returns boolean language plpgsql security definer set search_path=pg_catalog as $$ begin
 update public.credit_reservations r set value_delivery_state='VALUE_AVAILABLE',provider_attempt_state='SUCCEEDED',updated_at=clock_timestamp() where r.id=p_reservation_id and r.state='RESERVED' and exists(select 1 from public.mentor_operation_results m where m.reservation_id=r.id and m.expires_at>clock_timestamp()); return found; end $$;

create or replace function public.get_mentor_result_for_replay(p_operation_id uuid,p_clerk_id text)
returns table(found boolean,code text,user_id uuid,schema_version text,ciphertext bytea,iv bytea,auth_tag bytea,delivered_at timestamptz) language plpgsql security definer set search_path=pg_catalog as $$
declare m public.mentor_operation_results%rowtype; uid uuid;
begin select id into uid from public.users where clerk_id=p_clerk_id; if uid is null then return query select false,'NOT_FOUND',null::uuid,null::text,null::bytea,null::bytea,null::bytea,null::timestamptz; return; end if;
 select x.* into m from public.mentor_operation_results x where x.operation_id=p_operation_id and x.user_id=uid and x.expires_at>clock_timestamp() and x.replay_count<20 for update;
 if m.operation_id is null then return query select false,'NOT_FOUND',null::uuid,null::text,null::bytea,null::bytea,null::bytea,null::timestamptz; return; end if;
 update public.mentor_operation_results set replay_count=replay_count+1 where operation_id=m.operation_id;
 return query select true,'AVAILABLE',m.user_id,m.schema_version,m.ciphertext,m.iv,m.auth_tag,m.delivered_at; end $$;

create or replace function public.confirm_mentor_result_delivery(p_operation_id uuid,p_clerk_id text)
returns table(success boolean,code text) language plpgsql security definer set search_path=pg_catalog as $$ declare rid uuid; begin
 select m.reservation_id into rid from public.mentor_operation_results m join public.users u on u.id=m.user_id where m.operation_id=p_operation_id and u.clerk_id=p_clerk_id for update of m;
 if rid is null then return query select false,'NOT_FOUND'; return; end if;
 update public.mentor_operation_results set delivered_at=coalesce(delivered_at,clock_timestamp()) where operation_id=p_operation_id;
 update public.credit_reservations set value_delivery_state='VALUE_DELIVERED',updated_at=clock_timestamp() where id=rid and state='CONSUMED' and value_delivery_state in ('VALUE_AVAILABLE','VALUE_DELIVERED');
 return query select true,'DELIVERY_CONFIRMED'; end $$;

create or replace function public.cleanup_mentor_economic_state(p_batch_size integer default 100)
returns integer language plpgsql security definer set search_path=pg_catalog as $$ declare n integer; begin
 if p_batch_size not between 1 and 500 then raise exception 'invalid batch size' using errcode='22023'; end if;
 with targets as (select operation_id from public.mentor_operation_results where expires_at<=clock_timestamp() order by expires_at limit p_batch_size for update skip locked) delete from public.mentor_operation_results m using targets where m.operation_id=targets.operation_id; get diagnostics n=row_count; return n; end $$;

create or replace function public.reconcile_mentor_reservations(p_batch_size integer default 100)
returns table(reservation_id uuid,action text) language plpgsql security definer set search_path=pg_catalog as $$
declare r public.credit_reservations%rowtype; outcome record;
begin
 if p_batch_size not between 1 and 500 then raise exception 'invalid batch size' using errcode='22023'; end if;
 for r in select * from public.credit_reservations q where (q.state='RESERVED' and q.expires_at<=clock_timestamp()) or (q.state='CONSUMED' and q.value_delivery_state<>'VALUE_DELIVERED' and q.expires_at<=clock_timestamp() and not exists(select 1 from public.mentor_operation_results m where m.reservation_id=q.id and m.expires_at>clock_timestamp())) order by q.expires_at limit p_batch_size for update skip locked loop
  if r.state='RESERVED' and exists(select 1 from public.mentor_operation_results m where m.reservation_id=r.id and m.expires_at>clock_timestamp()) then
   perform public.mark_mentor_result_available(r.id); select * into outcome from public.consume_reservation(r.id); return query select r.id,'CONSUMED';
  elsif r.state='RESERVED' then
   update public.credit_reservations set state='EXPIRED_RELEASED',result_code='RESERVATION_EXPIRED',value_delivery_state='VALUE_UNDELIVERED',updated_at=clock_timestamp() where id=r.id; return query select r.id,'EXPIRED_RELEASED';
  elsif r.state='CONSUMED' and not exists(select 1 from public.mentor_operation_results m where m.reservation_id=r.id and m.expires_at>clock_timestamp()) then
   select * into outcome from public.compensate_consumption(r.id,'DELIVERY_UNKNOWN'); return query select r.id,'COMPENSATED';
  end if;
 end loop;
end $$;

do $$ declare f record; begin for f in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('reserve_credits','mark_reservation_provider_attempt','release_reservation','consume_reservation','compensate_consumption','expire_reservations','mark_mentor_result_available','get_mentor_result_for_replay','confirm_mentor_result_delivery','cleanup_mentor_economic_state','reconcile_mentor_reservations') loop execute format('revoke all on function %s from public,anon,authenticated',f.sig); execute format('grant execute on function %s to service_role',f.sig); end loop; end $$;
