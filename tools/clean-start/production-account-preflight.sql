\set ON_ERROR_STOP on
\pset tuples_only on
\pset format unaligned

begin isolation level repeatable read read only;

select jsonb_build_object(
  'project_ref', :'project_ref',
  'database_name', current_database(),
  'system_identifier', (select system_identifier::text from pg_control_system()),
  'captured_at', clock_timestamp(),
  'ledger_rows', (select count(*) from supabase_migrations.schema_migrations),
  'ledger_fingerprint', (
    select md5(string_agg(version || ':' || name, E'\n' order by version, name))
    from supabase_migrations.schema_migrations
  ),
  'counts', jsonb_build_object(
    'users', (select count(*) from public.users),
    'public_identities', (select count(*) from public.caissa_public_identities),
    'identity_bindings', (select count(*) from public.identity_bindings),
    'identity_challenges', (select count(*) from public.identity_migration_challenges),
    'identity_audit', (select count(*) from public.identity_migration_audit),
    'credit_events', (select count(*) from public.credit_events),
    'credit_reservations', (select count(*) from public.credit_reservations),
    'economic_usage_events', (select count(*) from public.economic_usage_events),
    'stripe_events', (select count(*) from public.stripe_events),
    'entitlements', (select count(*) from public.user_entitlements),
    'puzzle_progress', (select count(*) from public.puzzle_training_progress),
    'puzzle_attempts', (select count(*) from public.puzzle_training_attempts),
    'scanner_scans', (select count(*) from public.scanner_beta_scans),
    'scanner_failures', (select count(*) from public.scanner_beta_scan_failures),
    'scanner_feedback', (select count(*) from public.scanner_beta_feedback),
    'insight_datasets', (select count(*) from public.insight_datasets),
    'insight_reports', (select count(*) from public.insight_reports),
    'library_positions', (select count(*) from public.library_positions),
    'library_collections', (select count(*) from public.library_collections),
    'online_games', (select count(*) from public.caissa_online_games),
    'online_events', (select count(*) from public.caissa_online_game_events),
    'online_challenges', (select count(*) from public.caissa_online_challenges),
    'online_tickets', (select count(*) from public.caissa_online_matchmaking_tickets),
    'online_presence', (select count(*) from public.caissa_online_presence)
  )
)::text;

rollback;
