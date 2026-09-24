-- Staging-only heartbeat detail, additive for already-instrumented databases.
alter table public.eae013a_session_audit
  add column if not exists main_last_heartbeat_at bigint,
  add column if not exists engine_last_heartbeat_at bigint;

do $$
declare definition text;
begin
  definition := pg_catalog.pg_get_functiondef('public.eae013a_audit_session()'::pg_catalog.regprocedure);
  if pg_catalog.strpos(definition,
      'main_lease_expires_at, engine_lease_expires_at, idle_expires_at') > 0 then
    definition := pg_catalog.replace(definition,
      'main_lease_expires_at, engine_lease_expires_at, idle_expires_at',
      'main_lease_expires_at, engine_lease_expires_at, main_last_heartbeat_at, engine_last_heartbeat_at, idle_expires_at');
    definition := pg_catalog.replace(definition,
      'nullif(old_state->>''engineStreamUntil'', '''')::bigint,',
      'nullif(old_state->>''engineStreamUntil'', '''')::bigint,
    nullif(old_state->>''mainHeartbeatAt'', '''')::bigint,
    nullif(old_state->>''engineHeartbeatAt'', '''')::bigint,');
    execute definition;
  end if;
end;
$$;
