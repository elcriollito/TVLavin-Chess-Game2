-- Staging-only pending-command evidence for deadline/root-cause diagnosis.
alter table public.eae013a_session_audit
  add column if not exists pending_command text,
  add column if not exists pending_deadline bigint;

do $$
declare definition text;
begin
  definition := pg_catalog.pg_get_functiondef('public.eae013a_audit_session()'::pg_catalog.regprocedure);
  if pg_catalog.strpos(definition,
      'last_engine_seq, last_ack_type, last_terminal_event, cleanup_observed') > 0 then
    definition := pg_catalog.replace(definition,
      'last_engine_seq, last_ack_type, last_terminal_event, cleanup_observed',
      'last_engine_seq, last_ack_type, last_terminal_event, pending_command, pending_deadline, cleanup_observed');
    definition := pg_catalog.replace(definition,
      'old_state->''events''->-1->''value''->>''type'',',
      'old_state->''events''->-1->''value''->>''type'',
    old_state->''pending''->>''type'',
    nullif(old_state->''pending''->>''deadline'', '''')::bigint,');
    execute definition;
  end if;
end;
$$;
