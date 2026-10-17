\set ON_ERROR_STOP on

-- Required psql variables (never secrets):
--   project_ref, confirmation, expected_manifest_b64, backup_sha256,
--   restore_attestation_sha256, backup_locator, retain_until
-- The database password must be supplied only through a private PGPASSFILE.

begin isolation level serializable;
set local lock_timeout = '5s';
set local statement_timeout = '90s';

select pg_advisory_xact_lock(hashtextextended('caissa.clean-start.production-account-reset', 0));
select set_config('caissa.clean_start.project_ref', :'project_ref', true);
select set_config('caissa.clean_start.confirmation', :'confirmation', true);
select set_config('caissa.clean_start.expected_manifest_b64', :'expected_manifest_b64', true);
select set_config('caissa.clean_start.backup_sha256', :'backup_sha256', true);
select set_config('caissa.clean_start.restore_attestation_sha256', :'restore_attestation_sha256', true);
select set_config('caissa.clean_start.backup_locator', :'backup_locator', true);
select set_config('caissa.clean_start.retain_until', :'retain_until', true);

do $guard$
declare
  actual_manifest jsonb;
  expected_manifest jsonb;
  ledger_rows bigint;
  ledger_fingerprint text;
  retain_until timestamptz;
begin
  if current_setting('caissa.clean_start.project_ref') <> 'jczauvkfkweuvdpurpem'
      or current_database() <> 'postgres'
      or (select system_identifier::text from pg_control_system()) <> '7581440907192989109' then
    raise exception 'CAISSA_CLEAN_START_WRONG_CLUSTER';
  end if;
  if current_setting('caissa.clean_start.confirmation') <>
      'RESET_ALL_CAISSA_PRODUCTION_ACCOUNTS_jczauvkfkweuvdpurpem' then
    raise exception 'CAISSA_CLEAN_START_CONFIRMATION_REQUIRED';
  end if;
  if current_setting('caissa.clean_start.backup_sha256') !~ '^[0-9a-f]{64}$'
      or current_setting('caissa.clean_start.restore_attestation_sha256') !~ '^[0-9a-f]{64}$' then
    raise exception 'CAISSA_CLEAN_START_RECOVERY_EVIDENCE_REQUIRED';
  end if;
  if current_setting('caissa.clean_start.backup_locator') !~ '^(gs|s3|az)://[^[:space:]]+$' then
    raise exception 'CAISSA_CLEAN_START_REMOTE_BACKUP_REQUIRED';
  end if;
  retain_until := current_setting('caissa.clean_start.retain_until')::timestamptz;
  if retain_until < clock_timestamp() + interval '7 days'
      or retain_until > clock_timestamp() + interval '30 days' then
    raise exception 'CAISSA_CLEAN_START_RETENTION_OUT_OF_RANGE';
  end if;

  select count(*), md5(string_agg(version || ':' || name, E'\n' order by version, name))
    into ledger_rows, ledger_fingerprint
  from supabase_migrations.schema_migrations;
  if ledger_rows <> 28 or ledger_fingerprint <> '8a9e642bcf09f0d1c2c121900261e4de' then
    raise exception 'CAISSA_CLEAN_START_LEDGER_DIVERGED';
  end if;

  actual_manifest := jsonb_build_object(
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
  );
  begin
    expected_manifest := convert_from(
      decode(current_setting('caissa.clean_start.expected_manifest_b64'), 'base64'),
      'utf8'
    )::jsonb;
  exception when others then
    raise exception 'CAISSA_CLEAN_START_EXPECTED_MANIFEST_INVALID';
  end;
  if actual_manifest <> expected_manifest then
    raise exception 'CAISSA_CLEAN_START_MANIFEST_DIVERGED';
  end if;
  if (actual_manifest->>'online_games')::bigint <> 0
      or (actual_manifest->>'online_events')::bigint <> 0
      or (actual_manifest->>'online_challenges')::bigint <> 0
      or (actual_manifest->>'online_tickets')::bigint <> 0
      or (actual_manifest->>'online_presence')::bigint <> 0 then
    raise exception 'CAISSA_CLEAN_START_ONLINE_ACTIVITY_PRESENT';
  end if;
end
$guard$;

-- Preserve the consented Scanner corpus while severing account ownership and
-- dropping the client-selected local filename from retained metadata.
update public.scanner_beta_scans
set user_id = null,
    client_metadata = coalesce(client_metadata, '{}'::jsonb) - 'selectedImage'
where user_id is not null;

update public.scanner_beta_scan_failures
set user_id = null,
    client_metadata = coalesce(client_metadata, '{}'::jsonb) - 'selectedImage'
where user_id is not null;

update public.scanner_beta_feedback
set user_id = null,
    client_metadata = coalesce(client_metadata, '{}'::jsonb) - 'selectedImage'
where user_id is not null;

-- Stripe event rows, if any exist in a future manifest, are retained as
-- payment evidence but detached from the deleted CAISSA profile.
update public.stripe_events set user_id = null where user_id is not null;

-- All active entitlements and account-owned records are removed through the
-- reviewed foreign-key graph. Financial/account history remains recoverable
-- only in the encrypted, restore-tested backup referenced by this run.
delete from public.users;

do $postflight$
declare
  identity_audit_expected bigint := (
    convert_from(
      decode(current_setting('caissa.clean_start.expected_manifest_b64'), 'base64'),
      'utf8'
    )::jsonb->>'identity_audit'
  )::bigint;
begin
  if exists (
    select 1 from (
      select count(*) as n from public.users
      union all select count(*) from public.caissa_public_identities
      union all select count(*) from public.identity_bindings
      union all select count(*) from public.identity_migration_challenges
      union all select count(*) from public.credit_events
      union all select count(*) from public.credit_reservations
      union all select count(*) from public.economic_usage_events
      union all select count(*) from public.user_entitlements
      union all select count(*) from public.puzzle_training_progress
      union all select count(*) from public.puzzle_training_attempts
      union all select count(*) from public.insight_datasets
      union all select count(*) from public.insight_reports
      union all select count(*) from public.library_positions
      union all select count(*) from public.library_collections
    ) account_rows where n <> 0
  ) then
    raise exception 'CAISSA_CLEAN_START_ACCOUNT_ROWS_REMAIN';
  end if;
  if exists (select 1 from public.scanner_beta_scans where user_id is not null)
      or exists (select 1 from public.scanner_beta_scan_failures where user_id is not null)
      or exists (select 1 from public.scanner_beta_feedback where user_id is not null)
      or exists (select 1 from public.stripe_events where user_id is not null) then
    raise exception 'CAISSA_CLEAN_START_RETAINED_ROWS_STILL_LINKED';
  end if;
  if (select count(*) from public.identity_migration_audit) <> identity_audit_expected
      or exists (
        select 1 from public.identity_migration_audit
        where user_id is not null or binding_id is not null or challenge_id is not null
      ) then
    raise exception 'CAISSA_CLEAN_START_AUDIT_RETENTION_DIVERGED';
  end if;
end
$postflight$;

select jsonb_build_object(
  'status', 'CAISSA_CLEAN_START_ACCOUNT_RESET_COMMITTED',
  'completed_at', clock_timestamp(),
  'users', (select count(*) from public.users),
  'public_identities', (select count(*) from public.caissa_public_identities),
  'active_entitlements', (select count(*) from public.user_entitlements where revoked_at is null),
  'scanner_rows_retained', (
    (select count(*) from public.scanner_beta_scans)
    + (select count(*) from public.scanner_beta_scan_failures)
    + (select count(*) from public.scanner_beta_feedback)
  ),
  'scanner_account_links', (
    (select count(*) from public.scanner_beta_scans where user_id is not null)
    + (select count(*) from public.scanner_beta_scan_failures where user_id is not null)
    + (select count(*) from public.scanner_beta_feedback where user_id is not null)
  ),
  'backup_sha256', current_setting('caissa.clean_start.backup_sha256'),
  'restore_attestation_sha256', current_setting('caissa.clean_start.restore_attestation_sha256'),
  'backup_locator', current_setting('caissa.clean_start.backup_locator'),
  'retain_until', current_setting('caissa.clean_start.retain_until')
)::text;

commit;
