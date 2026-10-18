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
  fk_edge_count bigint;
  fk_relation_count bigint;
  fk_fingerprint text;
  identity_surface_column_count bigint;
  identity_surface_fingerprint text;
  unmodeled_identity_tables text;
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

  with recursive
  fk_edges as (
    select c.oid constraint_oid, c.conname, c.conrelid child_oid,
           c.confrelid parent_oid, c.confdeltype, c.conkey, c.confkey
    from pg_constraint c where c.contype = 'f'
  ),
  fk_walk as (
    select e.*, array[e.parent_oid, e.child_oid]::oid[] oid_path
    from fk_edges e where e.parent_oid = 'public.users'::regclass
    union all
    select e.*, w.oid_path || e.child_oid
    from fk_walk w join fk_edges e on e.parent_oid = w.child_oid
    where not e.child_oid = any(w.oid_path)
  ),
  reachable_fks as (
    select distinct on (constraint_oid)
           constraint_oid, conname, child_oid, parent_oid, confdeltype, conkey, confkey
    from fk_walk order by constraint_oid
  ),
  canonical_fks as (
    select format('%s|%s|%s|%s|%s',
      parent_oid::regclass::text, child_oid::regclass::text, conname, confdeltype,
      (
        select string_agg(format('%s>%s', ca.attname, pa.attname), ',' order by u.ord)
        from unnest(conkey, confkey) with ordinality u(child_attnum, parent_attnum, ord)
        join pg_attribute ca on ca.attrelid = child_oid and ca.attnum = u.child_attnum
        join pg_attribute pa on pa.attrelid = parent_oid and pa.attnum = u.parent_attnum
      )
    ) line
    from reachable_fks
  )
  select
    (select count(*) from canonical_fks),
    (select count(distinct child_oid) + 1 from reachable_fks),
    md5((select string_agg(line, E'\n' order by line) from canonical_fks))
  into fk_edge_count, fk_relation_count, fk_fingerprint;

  if fk_edge_count <> 56 or fk_relation_count <> 35
      or fk_fingerprint <> '7eaa482811ddab5b65dc4637f461307b' then
    raise exception 'CAISSA_CLEAN_START_ACCOUNT_FK_GRAPH_DIVERGED';
  end if;

  select count(*), md5(string_agg(
    format('%s|%s|%s|%s', c.relname, a.attname,
           pg_catalog.format_type(a.atttypid, a.atttypmod), a.attnotnull),
    E'\n' order by c.relname, a.attnum
  ))
  into identity_surface_column_count, identity_surface_fingerprint
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
  where n.nspname = 'public'
    and c.relname in ('caissa_online_rate_limits', 'identity_enrollment_decisions');

  if identity_surface_column_count <> 13
      or identity_surface_fingerprint <> '709c54cf9d16bd4467d8e7b5adb326b9' then
    raise exception 'CAISSA_CLEAN_START_IDENTITY_SURFACE_DIVERGED';
  end if;

  select string_agg(distinct c.table_name, ', ' order by c.table_name)
  into unmodeled_identity_tables
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.column_name ~* '(user_id|clerk_id|subject|binding_id|challenge_id|email|stripe_customer_id)'
    and c.table_name <> all(array[
      'beta_audit_events','caissa_online_challenges','caissa_online_game_events',
      'caissa_online_games','caissa_online_matchmaking_tickets','caissa_online_presence',
      'caissa_online_profiles','caissa_online_rate_limits','caissa_online_ratings',
      'caissa_online_tournament_participants','caissa_online_tournaments',
      'caissa_public_identities','credit_events','credit_reservations',
      'economic_usage_events','identity_bindings','identity_enrollment_decisions',
      'identity_manual_recovery_previews','identity_migration_audit',
      'identity_migration_challenges','insight_datasets','insight_reports',
      'library_collections','library_positions','library_sync_log',
      'mentor_operation_results','puzzle_training_attempts','puzzle_training_progress',
      'scanner_beta_feedback','scanner_beta_scan_failures','scanner_beta_scans',
      'stripe_events','user_entitlements','users'
    ]);
  if unmodeled_identity_tables is not null then
    raise exception 'CAISSA_CLEAN_START_UNMODELED_IDENTITY_SURFACE:%', unmodeled_identity_tables;
  end if;

  select jsonb_object_agg(key, value)
  into actual_manifest
  from (values
    ('account_fk_edge_count', to_jsonb(fk_edge_count)),
    ('account_fk_relation_count', to_jsonb(fk_relation_count)),
    ('account_fk_fingerprint', to_jsonb(fk_fingerprint)),
    ('identity_surface_column_count', to_jsonb(identity_surface_column_count)),
    ('identity_surface_fingerprint', to_jsonb(identity_surface_fingerprint)),
    ('users', to_jsonb((select count(*) from public.users))),
    ('users_credits_total', to_jsonb((select coalesce(sum(credits), 0) from public.users))),
    ('users_premium', to_jsonb((select count(*) from public.users where is_premium))),
    ('users_stripe_customer_links', to_jsonb((select count(*) from public.users where stripe_customer_id is not null))),
    ('beta_audit_events', to_jsonb((select count(*) from public.beta_audit_events))),
    ('caissa_online_challenges', to_jsonb((select count(*) from public.caissa_online_challenges))),
    ('caissa_online_game_events', to_jsonb((select count(*) from public.caissa_online_game_events))),
    ('caissa_online_games', to_jsonb((select count(*) from public.caissa_online_games))),
    ('caissa_online_matchmaking_tickets', to_jsonb((select count(*) from public.caissa_online_matchmaking_tickets))),
    ('caissa_online_presence', to_jsonb((select count(*) from public.caissa_online_presence))),
    ('caissa_online_profiles', to_jsonb((select count(*) from public.caissa_online_profiles))),
    ('caissa_online_rate_limits', to_jsonb((select count(*) from public.caissa_online_rate_limits))),
    ('caissa_online_ratings', to_jsonb((select count(*) from public.caissa_online_ratings))),
    ('caissa_online_tournament_games', to_jsonb((select count(*) from public.caissa_online_tournament_games))),
    ('caissa_online_tournament_participants', to_jsonb((select count(*) from public.caissa_online_tournament_participants))),
    ('caissa_online_tournaments', to_jsonb((select count(*) from public.caissa_online_tournaments))),
    ('caissa_public_identities', to_jsonb((select count(*) from public.caissa_public_identities))),
    ('credit_events', to_jsonb((select count(*) from public.credit_events))),
    ('credit_reservations', to_jsonb((select count(*) from public.credit_reservations))),
    ('credit_reservations_live', to_jsonb((select count(*) from public.credit_reservations where state = 'RESERVED' and expires_at > clock_timestamp()))),
    ('economic_usage_events', to_jsonb((select count(*) from public.economic_usage_events))),
    ('identity_bindings', to_jsonb((select count(*) from public.identity_bindings))),
    ('identity_enrollment_decisions', to_jsonb((select count(*) from public.identity_enrollment_decisions))),
    ('identity_manual_recovery_previews', to_jsonb((select count(*) from public.identity_manual_recovery_previews))),
    ('identity_migration_audit', to_jsonb((select count(*) from public.identity_migration_audit))),
    ('identity_migration_audit_linked', to_jsonb((select count(*) from public.identity_migration_audit where user_id is not null or binding_id is not null or challenge_id is not null))),
    ('identity_migration_challenges', to_jsonb((select count(*) from public.identity_migration_challenges))),
    ('insight_datasets', to_jsonb((select count(*) from public.insight_datasets))),
    ('insight_reports', to_jsonb((select count(*) from public.insight_reports))),
    ('library_collections', to_jsonb((select count(*) from public.library_collections))),
    ('library_positions', to_jsonb((select count(*) from public.library_positions))),
    ('library_sync_log', to_jsonb((select count(*) from public.library_sync_log))),
    ('mentor_operation_results', to_jsonb((select count(*) from public.mentor_operation_results))),
    ('mentor_operation_results_live', to_jsonb((select count(*) from public.mentor_operation_results where expires_at > clock_timestamp()))),
    ('puzzle_training_attempts', to_jsonb((select count(*) from public.puzzle_training_attempts))),
    ('puzzle_training_progress', to_jsonb((select count(*) from public.puzzle_training_progress))),
    ('scanner_beta_feedback', to_jsonb((select count(*) from public.scanner_beta_feedback))),
    ('scanner_beta_feedback_linked', to_jsonb((select count(*) from public.scanner_beta_feedback where user_id is not null))),
    ('scanner_beta_scan_failures', to_jsonb((select count(*) from public.scanner_beta_scan_failures))),
    ('scanner_beta_scan_failures_linked', to_jsonb((select count(*) from public.scanner_beta_scan_failures where user_id is not null))),
    ('scanner_beta_scans', to_jsonb((select count(*) from public.scanner_beta_scans))),
    ('scanner_beta_scans_linked', to_jsonb((select count(*) from public.scanner_beta_scans where user_id is not null))),
    ('scanner_beta_square_corrections', to_jsonb((select count(*) from public.scanner_beta_square_corrections))),
    ('scanner_beta_square_predictions', to_jsonb((select count(*) from public.scanner_beta_square_predictions))),
    ('stripe_events', to_jsonb((select count(*) from public.stripe_events))),
    ('stripe_events_linked', to_jsonb((select count(*) from public.stripe_events where user_id is not null))),
    ('user_entitlements', to_jsonb((select count(*) from public.user_entitlements))),
    ('user_entitlements_active', to_jsonb((select count(*) from public.user_entitlements where revoked_at is null))),
    ('user_entitlements_active_non_beta', to_jsonb((select count(*) from public.user_entitlements where revoked_at is null and entitlement <> 'beta_tester'))),
    ('beta_experiments', to_jsonb((select count(*) from public.beta_experiments))),
    ('player_album_entitlements_exists', to_jsonb(to_regclass('public.player_album_entitlements') is not null))
  ) pairs(key, value);

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

  -- The operator-supplied manifest proves same-snapshot equality, but it must
  -- not be able to widen the owner-approved reset scope. Pin the certified
  -- Production baseline independently of that manifest.
  if (actual_manifest->>'users')::bigint <> 14
      or (actual_manifest->>'caissa_public_identities')::bigint <> 14
      or (actual_manifest->>'users_credits_total')::bigint <> 65
      or (actual_manifest->>'user_entitlements')::bigint <> 1
      or (actual_manifest->>'user_entitlements_active')::bigint <> 1
      or (actual_manifest->>'user_entitlements_active_non_beta')::bigint <> 0 then
    raise exception 'CAISSA_CLEAN_START_CERTIFIED_BASELINE_DIVERGED';
  end if;

  if (actual_manifest->>'users_premium')::bigint <> 0
      or (actual_manifest->>'users_stripe_customer_links')::bigint <> 0
      or (actual_manifest->>'stripe_events')::bigint <> 0
      or (actual_manifest->>'user_entitlements_active_non_beta')::bigint <> 0 then
    raise exception 'CAISSA_CLEAN_START_BILLING_OBLIGATION_REVIEW_REQUIRED';
  end if;
  if (actual_manifest->>'credit_reservations_live')::bigint <> 0
      or (actual_manifest->>'mentor_operation_results_live')::bigint <> 0 then
    raise exception 'CAISSA_CLEAN_START_LIVE_ECONOMIC_OPERATION_PRESENT';
  end if;
  if (actual_manifest->>'caissa_online_games')::bigint <> 0
      or (actual_manifest->>'caissa_online_game_events')::bigint <> 0
      or (actual_manifest->>'caissa_online_challenges')::bigint <> 0
      or (actual_manifest->>'caissa_online_matchmaking_tickets')::bigint <> 0
      or (actual_manifest->>'caissa_online_presence')::bigint <> 0
      or (actual_manifest->>'caissa_online_profiles')::bigint <> 0
      or (actual_manifest->>'caissa_online_ratings')::bigint <> 0
      or (actual_manifest->>'caissa_online_tournament_games')::bigint <> 0
      or (actual_manifest->>'caissa_online_tournament_participants')::bigint <> 0
      or (actual_manifest->>'caissa_online_tournaments')::bigint <> 0 then
    raise exception 'CAISSA_CLEAN_START_ONLINE_ACTIVITY_PRESENT';
  end if;
  if (actual_manifest->>'player_album_entitlements_exists')::boolean then
    raise exception 'CAISSA_CLEAN_START_UNMODELED_PLAYER_ALBUM_ENTITLEMENTS';
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

-- Stripe evidence is retained and detached. The billing guard above requires
-- this table and every linked Stripe/customer indicator to be empty today.
update public.stripe_events set user_id = null where user_id is not null;

-- These two identity-bearing surfaces do not have FKs to users. Rate-limit
-- rows are ephemeral enforcement state; enrollment decisions are SEC-005
-- account state. Both are explicitly reset instead of becoming stale orphans.
delete from public.caissa_online_rate_limits;
delete from public.identity_enrollment_decisions;

-- beta_audit_events contains only beta-center/open telemetry and has no
-- financial or security-retention role. Its exact preimage is in the encrypted,
-- restore-tested backup. Delete it explicitly rather than silently by CASCADE.
delete from public.beta_audit_events;

-- Remove restrictive identity dependants in an auditable order. The separate
-- identity_migration_audit table is retained and its FK columns become NULL.
delete from public.identity_manual_recovery_previews;
delete from public.identity_migration_challenges;
delete from public.identity_bindings;

-- Resolve the account-owned dependency chains before deleting users.
delete from public.insight_reports;
delete from public.insight_datasets;
delete from public.mentor_operation_results;
delete from public.economic_usage_events;
update public.credit_reservations
set consumed_event_id = null, compensation_event_id = null
where consumed_event_id is not null or compensation_event_id is not null;
update public.credit_events
set reservation_id = null, reverses_event_id = null
where reservation_id is not null or reverses_event_id is not null;
delete from public.credit_events;
delete from public.credit_reservations;

-- Remaining account-owned records are covered by the certified FK graph.
delete from public.users;

do $postflight$
declare
  expected_manifest jsonb := convert_from(
    decode(current_setting('caissa.clean_start.expected_manifest_b64'), 'base64'),
    'utf8'
  )::jsonb;
begin
  if exists (
    select 1 from (values
      ((select count(*) from public.users)),
      ((select count(*) from public.beta_audit_events)),
      ((select count(*) from public.caissa_online_challenges)),
      ((select count(*) from public.caissa_online_game_events)),
      ((select count(*) from public.caissa_online_games)),
      ((select count(*) from public.caissa_online_matchmaking_tickets)),
      ((select count(*) from public.caissa_online_presence)),
      ((select count(*) from public.caissa_online_profiles)),
      ((select count(*) from public.caissa_online_rate_limits)),
      ((select count(*) from public.caissa_online_ratings)),
      ((select count(*) from public.caissa_online_tournament_games)),
      ((select count(*) from public.caissa_online_tournament_participants)),
      ((select count(*) from public.caissa_online_tournaments)),
      ((select count(*) from public.caissa_public_identities)),
      ((select count(*) from public.credit_events)),
      ((select count(*) from public.credit_reservations)),
      ((select count(*) from public.economic_usage_events)),
      ((select count(*) from public.identity_bindings)),
      ((select count(*) from public.identity_enrollment_decisions)),
      ((select count(*) from public.identity_manual_recovery_previews)),
      ((select count(*) from public.identity_migration_challenges)),
      ((select count(*) from public.insight_datasets)),
      ((select count(*) from public.insight_reports)),
      ((select count(*) from public.library_collections)),
      ((select count(*) from public.library_positions)),
      ((select count(*) from public.library_sync_log)),
      ((select count(*) from public.mentor_operation_results)),
      ((select count(*) from public.puzzle_training_attempts)),
      ((select count(*) from public.puzzle_training_progress)),
      ((select count(*) from public.user_entitlements))
    ) account_rows(n)
    where n <> 0
  ) then
    raise exception 'CAISSA_CLEAN_START_ACCOUNT_ROWS_REMAIN';
  end if;

  if exists (select 1 from public.scanner_beta_scans where user_id is not null)
      or exists (select 1 from public.scanner_beta_scan_failures where user_id is not null)
      or exists (select 1 from public.scanner_beta_feedback where user_id is not null)
      or exists (select 1 from public.stripe_events where user_id is not null) then
    raise exception 'CAISSA_CLEAN_START_RETAINED_ROWS_STILL_LINKED';
  end if;

  if (select count(*) from public.identity_migration_audit) <>
       (expected_manifest->>'identity_migration_audit')::bigint
      or exists (
        select 1 from public.identity_migration_audit
        where user_id is not null or binding_id is not null or challenge_id is not null
      ) then
    raise exception 'CAISSA_CLEAN_START_AUDIT_RETENTION_DIVERGED';
  end if;

  if (select count(*) from public.scanner_beta_scans) <>
       (expected_manifest->>'scanner_beta_scans')::bigint
      or (select count(*) from public.scanner_beta_scan_failures) <>
       (expected_manifest->>'scanner_beta_scan_failures')::bigint
      or (select count(*) from public.scanner_beta_feedback) <>
       (expected_manifest->>'scanner_beta_feedback')::bigint
      or (select count(*) from public.scanner_beta_square_corrections) <>
       (expected_manifest->>'scanner_beta_square_corrections')::bigint
      or (select count(*) from public.scanner_beta_square_predictions) <>
       (expected_manifest->>'scanner_beta_square_predictions')::bigint then
    raise exception 'CAISSA_CLEAN_START_SCANNER_RETENTION_DIVERGED';
  end if;

  if (select count(*) from public.stripe_events) <>
       (expected_manifest->>'stripe_events')::bigint
      or (select count(*) from public.beta_experiments) <>
       (expected_manifest->>'beta_experiments')::bigint then
    raise exception 'CAISSA_CLEAN_START_GLOBAL_RETENTION_DIVERGED';
  end if;
end
$postflight$;

select jsonb_build_object(
  'status', 'CAISSA_CLEAN_START_ACCOUNT_RESET_COMMITTED',
  'completed_at', clock_timestamp(),
  'users', (select count(*) from public.users),
  'beta_audit_events', (select count(*) from public.beta_audit_events),
  'identity_migration_audit_retained', (select count(*) from public.identity_migration_audit),
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
