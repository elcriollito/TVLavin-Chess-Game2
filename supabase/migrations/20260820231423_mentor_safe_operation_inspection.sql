-- S0.2P.4C-R2B: bounded, read-only inspection for one Mentor operation.
create or replace function public.inspect_mentor_operation(p_operation_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $inspect_mentor_operation$
  select pg_catalog.jsonb_build_object(
    'found', exists(
      select 1 from public.credit_reservations r where r.operation_id = p_operation_id
    ),
    'operationId', p_operation_id,
    'reservation', coalesce((
      select pg_catalog.jsonb_build_object(
        'operationId', r.operation_id,
        'capabilityId', r.capability_id,
        'state', r.state,
        'requestedAmount', r.requested_amount,
        'reservedAmount', r.reserved_amount,
        'providerAttemptState', r.provider_attempt_state,
        'valueDeliveryState', r.value_delivery_state,
        'resultCode', r.result_code,
        'createdAt', r.created_at,
        'expiresAt', r.expires_at,
        'debitEventExists', r.consumed_event_id is not null,
        'debitEventId', r.consumed_event_id,
        'compensationEventExists', r.compensation_event_id is not null,
        'compensationEventId', r.compensation_event_id
      )
      from public.credit_reservations r
      where r.operation_id = p_operation_id
      order by r.created_at, r.id
      limit 1
    ), 'null'::jsonb),
    'ledger', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'eventKind', e.event_kind,
        'delta', e.delta,
        'capabilityId', e.capability_id,
        'resultCode', e.result_code,
        'reversesEventId', e.reverses_event_id,
        'createdAt', e.created_at
      ) order by e.created_at, e.id)
      from public.credit_events e
      where e.operation_id = p_operation_id
    ), '[]'::jsonb),
    'usage', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'unit', e.unit,
        'quantity', e.quantity,
        'provider', e.provider,
        'model', e.model,
        'resultCode', e.result_code,
        'valueDeliveryState', e.value_delivery_state,
        'occurredAt', e.occurred_at
      ) order by e.occurred_at, e.event_id)
      from public.economic_usage_events e
      where e.operation_id = p_operation_id
    ), '[]'::jsonb),
    'result', pg_catalog.jsonb_build_object(
      'exists', exists(
        select 1 from public.mentor_operation_results m where m.operation_id = p_operation_id
      ),
      'expiresAt', (select m.expires_at from public.mentor_operation_results m where m.operation_id = p_operation_id),
      'replayCount', (select m.replay_count from public.mentor_operation_results m where m.operation_id = p_operation_id),
      'deliveredAt', (select m.delivered_at from public.mentor_operation_results m where m.operation_id = p_operation_id),
      'createdAt', (select m.created_at from public.mentor_operation_results m where m.operation_id = p_operation_id)
    )
  );
$inspect_mentor_operation$;

alter function public.inspect_mentor_operation(uuid) owner to postgres;
revoke all on function public.inspect_mentor_operation(uuid) from public, anon, authenticated;
grant execute on function public.inspect_mentor_operation(uuid) to service_role;
