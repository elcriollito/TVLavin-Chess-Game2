-- S0.2P.4C-R2-OBS1: bounded discovery of one recent Mentor operation.
create or replace function public.find_recent_mentor_operation(
  p_user_id uuid,
  p_start timestamptz,
  p_end timestamptz
)
returns table(operation_id uuid, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = pg_catalog
as $find_recent_mentor_operation$
declare
  v_operation_ids uuid[];
begin
  if p_user_id is null or p_start is null or p_end is null then
    raise exception using errcode = '22023', message = 'user and time window are required';
  end if;
  if p_end <= p_start then
    raise exception using errcode = '22023', message = 'time window must be ordered';
  end if;
  if p_end - p_start > interval '15 minutes' then
    raise exception using errcode = '22023', message = 'time window exceeds 15 minutes';
  end if;

  select pg_catalog.array_agg(candidate.operation_id order by candidate.created_at desc, candidate.operation_id desc)
    into v_operation_ids
  from (
    select r.operation_id, r.created_at
    from public.credit_reservations r
    where r.user_id = p_user_id
      and r.capability_id = 'mentor.shared_response'
      and r.created_at >= p_start
      and r.created_at < p_end
    order by r.created_at desc, r.operation_id desc
    limit 2
  ) candidate;

  if coalesce(pg_catalog.array_length(v_operation_ids, 1), 0) > 1 then
    raise exception using errcode = '21000', message = 'recent Mentor operation is ambiguous';
  end if;

  return query
  select r.operation_id, r.created_at
  from public.credit_reservations r
  where r.operation_id = v_operation_ids[1]
  order by r.created_at desc, r.operation_id desc
  limit 1;
end;
$find_recent_mentor_operation$;

alter function public.find_recent_mentor_operation(uuid,timestamptz,timestamptz) owner to postgres;
revoke all on function public.find_recent_mentor_operation(uuid,timestamptz,timestamptz) from public, anon, authenticated;
grant execute on function public.find_recent_mentor_operation(uuid,timestamptz,timestamptz) to service_role;
