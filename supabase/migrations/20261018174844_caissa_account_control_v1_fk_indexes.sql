-- Additive Staging follow-up for Account Control v1.0.
-- The IF NOT EXISTS guards keep a fresh migration chain reproducible because
-- the primary v1 migration now creates the same indexes directly.

begin;

create index if not exists caissa_account_control_operations_binding_idx
  on public.caissa_account_control_operations(binding_id);

create index if not exists caissa_account_states_operation_idx
  on public.caissa_account_states(operation_id)
  where operation_id is not null;

commit;
