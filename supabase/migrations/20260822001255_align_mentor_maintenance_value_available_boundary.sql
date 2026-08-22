-- FIX2: VALUE_AVAILABLE is the server-owned chargeable boundary.
create or replace function public.reconcile_mentor_reservations(p_batch_size integer default 100)
returns table(reservation_id uuid,action text) language plpgsql security definer set search_path=pg_catalog as $$
declare r public.credit_reservations%rowtype; outcome record;
begin
 if p_batch_size not between 1 and 500 then raise exception 'invalid batch size' using errcode='22023'; end if;
 for r in
  select * from public.credit_reservations q
  where (q.state='RESERVED' and q.expires_at<=clock_timestamp())
     or (q.state='CONSUMED'
         and q.value_delivery_state not in ('VALUE_AVAILABLE','VALUE_DELIVERED')
         and q.expires_at<=clock_timestamp()
         and not exists(select 1 from public.mentor_operation_results m where m.reservation_id=q.id and m.expires_at>clock_timestamp()))
  order by q.expires_at limit p_batch_size for update skip locked
 loop
  if r.state='RESERVED' and exists(select 1 from public.mentor_operation_results m where m.reservation_id=r.id and m.expires_at>clock_timestamp()) then
   perform public.mark_mentor_result_available(r.id); select * into outcome from public.consume_reservation(r.id); return query select r.id,'CONSUMED';
  elsif r.state='RESERVED' then
   update public.credit_reservations set state='EXPIRED_RELEASED',result_code='RESERVATION_EXPIRED',value_delivery_state='VALUE_UNDELIVERED',updated_at=clock_timestamp() where id=r.id; return query select r.id,'EXPIRED_RELEASED';
  elsif r.state='CONSUMED' and r.value_delivery_state not in ('VALUE_AVAILABLE','VALUE_DELIVERED') then
   select * into outcome from public.compensate_consumption(r.id,'VALUE_NOT_AVAILABLE'); return query select r.id,'COMPENSATED';
  end if;
 end loop;
end $$;

create or replace function public.cleanup_mentor_economic_state(p_batch_size integer default 100)
returns integer language plpgsql security definer set search_path=pg_catalog as $$ declare n integer; begin
 if p_batch_size not between 1 and 500 then raise exception 'invalid batch size' using errcode='22023'; end if;
 with targets as (
  select m.operation_id from public.mentor_operation_results m
  join public.credit_reservations r on r.id=m.reservation_id
  where m.expires_at<=clock_timestamp()
    and not (r.state='CONSUMED' and r.value_delivery_state='VALUE_AVAILABLE' and m.delivered_at is null)
  order by m.expires_at limit p_batch_size for update of m skip locked
 )
 delete from public.mentor_operation_results m using targets where m.operation_id=targets.operation_id;
 get diagnostics n=row_count; return n;
end $$;

drop function if exists public.inspect_mentor_economic_maintenance(integer);
create function public.inspect_mentor_economic_maintenance(p_batch_size integer default 100)
returns table(release_count integer,consume_count integer,compensate_count integer,cleanup_count integer,pending_delivery_ack_review integer)
language plpgsql security definer set search_path=pg_catalog as $$
begin
 if p_batch_size not between 1 and 500 then raise exception 'invalid batch size' using errcode='22023'; end if;
 return query
 with reservation_targets as (
  select q.id,q.state,q.value_delivery_state
  from public.credit_reservations q
  where (q.state='RESERVED' and q.expires_at<=clock_timestamp())
     or (q.state='CONSUMED' and q.value_delivery_state not in ('VALUE_AVAILABLE','VALUE_DELIVERED') and q.expires_at<=clock_timestamp()
         and not exists(select 1 from public.mentor_operation_results m where m.reservation_id=q.id and m.expires_at>clock_timestamp()))
  order by q.expires_at limit p_batch_size
 ), classified as (
  select r.id,r.state,exists(select 1 from public.mentor_operation_results m where m.reservation_id=r.id and m.expires_at>clock_timestamp()) has_live_result
  from reservation_targets r
 ), expired_results as (
  select m.operation_id from public.mentor_operation_results m join public.credit_reservations r on r.id=m.reservation_id
  where m.expires_at<=clock_timestamp() and not (r.state='CONSUMED' and r.value_delivery_state='VALUE_AVAILABLE' and m.delivered_at is null)
  order by m.expires_at limit p_batch_size
 ), ack_review as (
  select m.operation_id from public.mentor_operation_results m join public.credit_reservations r on r.id=m.reservation_id
  where r.state='CONSUMED' and r.value_delivery_state='VALUE_AVAILABLE' and m.delivered_at is null
  order by m.expires_at limit p_batch_size
 )
 select count(*) filter(where c.state='RESERVED' and not c.has_live_result)::integer,
        count(*) filter(where c.state='RESERVED' and c.has_live_result)::integer,
        count(*) filter(where c.state='CONSUMED')::integer,
        (select count(*)::integer from expired_results),
        (select count(*)::integer from ack_review)
 from classified c;
end $$;

alter function public.reconcile_mentor_reservations(integer) owner to postgres;
alter function public.cleanup_mentor_economic_state(integer) owner to postgres;
alter function public.inspect_mentor_economic_maintenance(integer) owner to postgres;
revoke all on function public.reconcile_mentor_reservations(integer) from public,anon,authenticated;
revoke all on function public.cleanup_mentor_economic_state(integer) from public,anon,authenticated;
revoke all on function public.inspect_mentor_economic_maintenance(integer) from public,anon,authenticated;
grant execute on function public.reconcile_mentor_reservations(integer) to service_role;
grant execute on function public.cleanup_mentor_economic_state(integer) to service_role;
grant execute on function public.inspect_mentor_economic_maintenance(integer) to service_role;
