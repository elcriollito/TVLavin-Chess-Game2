-- CAISSA HFX-005 advisor follow-up: cover the service-only audit foreign key.
begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

create index if not exists caissa_online_series_operator_audit_series_idx
  on public.caissa_online_series_operator_audit(series_id);

commit;
