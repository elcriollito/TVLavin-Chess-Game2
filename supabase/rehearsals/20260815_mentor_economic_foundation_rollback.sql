-- LOCAL/ISOLATED REHEARSAL ONLY. Never run before the feature is disabled and all active reservations reconcile.
do $$ begin
  if exists(select 1 from public.credit_reservations where state='RESERVED') then
    raise exception 'rollback blocked: active Mentor reservations exist';
  end if;
end $$;

drop function if exists public.reconcile_mentor_reservations(integer);
drop function if exists public.cleanup_mentor_economic_state(integer);
drop function if exists public.confirm_mentor_result_delivery(uuid,text);
drop function if exists public.get_mentor_result_for_replay(uuid,text);
drop function if exists public.mark_mentor_result_available(uuid);
drop function if exists public.expire_reservations(integer);
drop function if exists public.compensate_consumption(uuid,text);
drop function if exists public.consume_reservation(uuid);
drop function if exists public.release_reservation(uuid,text);
drop function if exists public.mark_reservation_provider_attempt(uuid);
drop function if exists public.reserve_credits(text,uuid,text,integer,timestamptz,text);
alter table public.credit_events drop constraint if exists credit_events_reservation_fk;
drop table if exists public.mentor_operation_results;
drop table if exists public.economic_usage_events;
drop table if exists public.credit_reservations;
drop index if exists public.credit_events_reservation_debit_unique;
drop index if exists public.credit_events_reversal_unique;
drop index if exists public.credit_events_operation_idx;
alter table public.credit_events
  drop column if exists operation_id, drop column if exists reservation_id,
  drop column if exists capability_id, drop column if exists result_code,
  drop column if exists event_kind, drop column if exists reverses_event_id,
  drop column if exists catalog_revision;
-- Intentionally never updates users.credits and never removes pre-existing credit_events rows.
