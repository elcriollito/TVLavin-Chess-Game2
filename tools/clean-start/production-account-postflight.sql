\set ON_ERROR_STOP on
\pset tuples_only on
\pset format unaligned

begin isolation level repeatable read read only;

select jsonb_build_object(
  'database_name', current_database(),
  'system_identifier', (select system_identifier::text from pg_control_system()),
  'users', (select count(*) from public.users),
  'public_identities', (select count(*) from public.caissa_public_identities),
  'identity_bindings', (select count(*) from public.identity_bindings),
  'identity_challenges', (select count(*) from public.identity_migration_challenges),
  'active_entitlements', (select count(*) from public.user_entitlements where revoked_at is null),
  'puzzle_progress', (select count(*) from public.puzzle_training_progress),
  'puzzle_attempts', (select count(*) from public.puzzle_training_attempts),
  'scanner_account_links', (
    (select count(*) from public.scanner_beta_scans where user_id is not null)
    + (select count(*) from public.scanner_beta_scan_failures where user_id is not null)
    + (select count(*) from public.scanner_beta_feedback where user_id is not null)
  ),
  'online_active_games', (select count(*) from public.caissa_online_games where status = 'active'),
  'online_tickets', (select count(*) from public.caissa_online_matchmaking_tickets),
  'online_presence', (select count(*) from public.caissa_online_presence)
)::text;

rollback;
