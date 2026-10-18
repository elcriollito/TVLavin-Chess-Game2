\set ON_ERROR_STOP on
\pset tuples_only on
\pset format unaligned

begin isolation level repeatable read read only;

select jsonb_build_object(
  'database_name', current_database(),
  'system_identifier', (select system_identifier::text from pg_control_system()),
  'account_rows', jsonb_build_object(
    'users', (select count(*) from public.users),
    'beta_audit_events', (select count(*) from public.beta_audit_events),
    'caissa_public_identities', (select count(*) from public.caissa_public_identities),
    'identity_bindings', (select count(*) from public.identity_bindings),
    'identity_challenges', (select count(*) from public.identity_migration_challenges),
    'identity_enrollment_decisions', (select count(*) from public.identity_enrollment_decisions),
    'identity_manual_recovery_previews', (select count(*) from public.identity_manual_recovery_previews),
    'credit_events', (select count(*) from public.credit_events),
    'credit_reservations', (select count(*) from public.credit_reservations),
    'economic_usage_events', (select count(*) from public.economic_usage_events),
    'active_entitlements', (select count(*) from public.user_entitlements where revoked_at is null),
    'puzzle_progress', (select count(*) from public.puzzle_training_progress),
    'puzzle_attempts', (select count(*) from public.puzzle_training_attempts),
    'insight_datasets', (select count(*) from public.insight_datasets),
    'insight_reports', (select count(*) from public.insight_reports),
    'library_positions', (select count(*) from public.library_positions),
    'library_collections', (select count(*) from public.library_collections),
    'library_sync_log', (select count(*) from public.library_sync_log),
    'mentor_operation_results', (select count(*) from public.mentor_operation_results),
    'online_profiles', (select count(*) from public.caissa_online_profiles),
    'online_ratings', (select count(*) from public.caissa_online_ratings),
    'online_rate_limits', (select count(*) from public.caissa_online_rate_limits),
    'online_games', (select count(*) from public.caissa_online_games),
    'online_active_games', (select count(*) from public.caissa_online_games where status = 'active'),
    'online_game_events', (select count(*) from public.caissa_online_game_events),
    'online_challenges', (select count(*) from public.caissa_online_challenges),
    'online_tickets', (select count(*) from public.caissa_online_matchmaking_tickets),
    'online_presence', (select count(*) from public.caissa_online_presence),
    'online_tournaments', (select count(*) from public.caissa_online_tournaments),
    'online_tournament_games', (select count(*) from public.caissa_online_tournament_games),
    'online_tournament_participants', (select count(*) from public.caissa_online_tournament_participants)
  ),
  'retained_rows', jsonb_build_object(
    'identity_migration_audit', (select count(*) from public.identity_migration_audit),
    'identity_migration_audit_links', (
      select count(*) from public.identity_migration_audit
      where user_id is not null or binding_id is not null or challenge_id is not null
    ),
    'scanner_scans', (select count(*) from public.scanner_beta_scans),
    'scanner_failures', (select count(*) from public.scanner_beta_scan_failures),
    'scanner_feedback', (select count(*) from public.scanner_beta_feedback),
    'scanner_square_corrections', (select count(*) from public.scanner_beta_square_corrections),
    'scanner_square_predictions', (select count(*) from public.scanner_beta_square_predictions),
    'scanner_account_links', (
      (select count(*) from public.scanner_beta_scans where user_id is not null)
      + (select count(*) from public.scanner_beta_scan_failures where user_id is not null)
      + (select count(*) from public.scanner_beta_feedback where user_id is not null)
    ),
    'stripe_events', (select count(*) from public.stripe_events),
    'stripe_account_links', (select count(*) from public.stripe_events where user_id is not null),
    'beta_experiments', (select count(*) from public.beta_experiments)
  )
)::text;

rollback;
