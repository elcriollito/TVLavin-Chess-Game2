-- Normalize Account Control privileges independently of Supabase default ACLs.
-- This migration is intentionally terminal for the Account Control package.

begin;

do $$
declare
  v_missing_relations text[];
  v_missing_functions text[];
begin
  select pg_catalog.array_agg(required.object_name order by required.object_name)
    into v_missing_relations
  from (values
    ('public.caissa_identity_ownership_reviews'),
    ('public.caissa_account_states'),
    ('public.caissa_account_control_operations'),
    ('public.caissa_account_control_audit'),
    ('public.caissa_account_control_rate_limits'),
    ('public.caissa_account_control_audit_id_seq')
  ) as required(object_name)
  where pg_catalog.to_regclass(required.object_name) is null;

  if pg_catalog.cardinality(v_missing_relations) > 0 then
    raise exception using
      errcode = 'P0001',
      message = 'CAISSA_ACCOUNT_CONTROL_GRANTS_PREREQUISITE_MISSING: '
        || pg_catalog.array_to_string(v_missing_relations, ', ');
  end if;

  select pg_catalog.array_agg(required.signature order by required.signature)
    into v_missing_functions
  from (values
    ('public.consume_caissa_account_control_rate_limit(text,text,integer,integer)'),
    ('public.caissa_account_active_entitlement_count(uuid)'),
    ('public.caissa_account_has_blocking_state(uuid)'),
    ('public.caissa_account_storage_reference_count(uuid)'),
    ('public.caissa_account_has_active_economic_work(uuid)'),
    ('public.caissa_account_assert_writable(uuid)'),
    ('public.caissa_account_write_barrier()'),
    ('public.caissa_account_rate_limit_write_barrier()'),
    ('public.caissa_account_control_summary(uuid,uuid)'),
    ('public.export_caissa_account_data_page(uuid,uuid,text,integer,integer,timestamptz)'),
    ('public.prepare_caissa_account_control(uuid,uuid,text,text,text,text,timestamptz)'),
    ('public.confirm_caissa_progress_reset(uuid,uuid,uuid,text,text,text,text)'),
    ('public.lock_caissa_account_deletion(uuid,uuid,uuid,text,text,text,text)'),
    ('public.mark_caissa_data_deletion_failed(uuid,uuid)'),
    ('public.erase_caissa_account_data(uuid,uuid,uuid,text)'),
    ('public.mark_caissa_auth_deletion_failed(uuid,uuid)'),
    ('public.complete_caissa_account_deletion(uuid,uuid,uuid)'),
    ('public.resolve_caissa_identity_ownership(text,text)')
  ) as required(signature)
  where pg_catalog.to_regprocedure(required.signature) is null;

  if pg_catalog.cardinality(v_missing_functions) > 0 then
    raise exception using
      errcode = 'P0001',
      message = 'CAISSA_ACCOUNT_CONTROL_GRANTS_PREREQUISITE_MISSING: '
        || pg_catalog.array_to_string(v_missing_functions, ', ');
  end if;
end
$$;

revoke all on table
  public.caissa_identity_ownership_reviews,
  public.caissa_account_states,
  public.caissa_account_control_operations,
  public.caissa_account_control_audit,
  public.caissa_account_control_rate_limits
from public, anon, authenticated, service_role;

grant select, insert, update on table
  public.caissa_account_states,
  public.caissa_account_control_operations,
  public.caissa_account_control_rate_limits
to service_role;

grant select, insert on table public.caissa_account_control_audit to service_role;

revoke all on sequence public.caissa_account_control_audit_id_seq
from public, anon, authenticated, service_role;
grant usage, select on sequence public.caissa_account_control_audit_id_seq to service_role;

revoke all on function
  public.consume_caissa_account_control_rate_limit(text,text,integer,integer),
  public.caissa_account_active_entitlement_count(uuid),
  public.caissa_account_has_blocking_state(uuid),
  public.caissa_account_storage_reference_count(uuid),
  public.caissa_account_has_active_economic_work(uuid),
  public.caissa_account_assert_writable(uuid),
  public.caissa_account_write_barrier(),
  public.caissa_account_rate_limit_write_barrier(),
  public.caissa_account_control_summary(uuid,uuid),
  public.export_caissa_account_data_page(uuid,uuid,text,integer,integer,timestamptz),
  public.prepare_caissa_account_control(uuid,uuid,text,text,text,text,timestamptz),
  public.confirm_caissa_progress_reset(uuid,uuid,uuid,text,text,text,text),
  public.lock_caissa_account_deletion(uuid,uuid,uuid,text,text,text,text),
  public.mark_caissa_data_deletion_failed(uuid,uuid),
  public.erase_caissa_account_data(uuid,uuid,uuid,text),
  public.mark_caissa_auth_deletion_failed(uuid,uuid),
  public.complete_caissa_account_deletion(uuid,uuid,uuid),
  public.resolve_caissa_identity_ownership(text,text)
from public, anon, authenticated, service_role;

grant execute on function
  public.consume_caissa_account_control_rate_limit(text,text,integer,integer),
  public.caissa_account_active_entitlement_count(uuid),
  public.caissa_account_has_blocking_state(uuid),
  public.caissa_account_storage_reference_count(uuid),
  public.caissa_account_has_active_economic_work(uuid),
  public.caissa_account_control_summary(uuid,uuid),
  public.export_caissa_account_data_page(uuid,uuid,text,integer,integer,timestamptz),
  public.prepare_caissa_account_control(uuid,uuid,text,text,text,text,timestamptz),
  public.confirm_caissa_progress_reset(uuid,uuid,uuid,text,text,text,text),
  public.lock_caissa_account_deletion(uuid,uuid,uuid,text,text,text,text),
  public.mark_caissa_data_deletion_failed(uuid,uuid),
  public.erase_caissa_account_data(uuid,uuid,uuid,text),
  public.mark_caissa_auth_deletion_failed(uuid,uuid),
  public.complete_caissa_account_deletion(uuid,uuid,uuid),
  public.resolve_caissa_identity_ownership(text,text)
to service_role;

commit;
