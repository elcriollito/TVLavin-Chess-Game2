create or replace function public.inspect_mentor_economic_maintenance(p_batch_size integer default 100)
returns table(release_count integer,consume_count integer,compensate_count integer,cleanup_count integer)
language plpgsql security definer set search_path=pg_catalog as $$
begin
  if p_batch_size not between 1 and 500 then raise exception 'invalid batch size' using errcode='22023'; end if;
  return query
  with reservation_targets as (
    select q.id,q.state
    from public.credit_reservations q
    where (q.state='RESERVED' and q.expires_at<=clock_timestamp())
       or (q.state='CONSUMED' and q.value_delivery_state<>'VALUE_DELIVERED' and q.expires_at<=clock_timestamp()
           and not exists(select 1 from public.mentor_operation_results m where m.reservation_id=q.id and m.expires_at>clock_timestamp()))
    order by q.expires_at
    limit p_batch_size
  ), classified as (
    select r.id,r.state,
      exists(select 1 from public.mentor_operation_results m where m.reservation_id=r.id and m.expires_at>clock_timestamp()) as has_live_result
    from reservation_targets r
  ), expired_results as (
    select m.operation_id from public.mentor_operation_results m
    where m.expires_at<=clock_timestamp() order by m.expires_at limit p_batch_size
  )
  select
    count(*) filter(where c.state='RESERVED' and not c.has_live_result)::integer,
    count(*) filter(where c.state='RESERVED' and c.has_live_result)::integer,
    count(*) filter(where c.state='CONSUMED')::integer,
    (select count(*)::integer from expired_results)
  from classified c;
end $$;

revoke all on function public.inspect_mentor_economic_maintenance(integer) from public,anon,authenticated;
grant execute on function public.inspect_mentor_economic_maintenance(integer) to service_role;
