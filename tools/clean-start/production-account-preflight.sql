\set ON_ERROR_STOP on
\pset tuples_only on
\pset format unaligned

begin isolation level repeatable read read only;

with recursive
fk_edges as (
  select c.oid constraint_oid, c.conname, c.conrelid child_oid,
         c.confrelid parent_oid, c.confdeltype, c.conkey, c.confkey
  from pg_constraint c
  where c.contype = 'f'
),
fk_walk as (
  select e.*, array[e.parent_oid, e.child_oid]::oid[] oid_path
  from fk_edges e
  where e.parent_oid = 'public.users'::regclass
  union all
  select e.*, w.oid_path || e.child_oid
  from fk_walk w
  join fk_edges e on e.parent_oid = w.child_oid
  where not e.child_oid = any(w.oid_path)
),
reachable_fks as (
  select distinct on (constraint_oid)
         constraint_oid, conname, child_oid, parent_oid, confdeltype, conkey, confkey
  from fk_walk
  order by constraint_oid
),
canonical_fks as (
  select format(
    '%s|%s|%s|%s|%s',
    parent_oid::regclass::text,
    child_oid::regclass::text,
    conname,
    confdeltype,
    (
      select string_agg(format('%s>%s', ca.attname, pa.attname), ',' order by u.ord)
      from unnest(conkey, confkey) with ordinality u(child_attnum, parent_attnum, ord)
      join pg_attribute ca on ca.attrelid = child_oid and ca.attnum = u.child_attnum
      join pg_attribute pa on pa.attrelid = parent_oid and pa.attnum = u.parent_attnum
    )
  ) line
  from reachable_fks
),
graph_state as (
  select
    (select count(*) from canonical_fks)::bigint edge_count,
    ((select count(distinct child_oid) from reachable_fks) + 1)::bigint relation_count,
    md5((select string_agg(line, E'\n' order by line) from canonical_fks)) fingerprint
),
semantic_surface as (
  select
    count(*)::bigint column_count,
    md5(string_agg(
      format('%s|%s|%s|%s', c.relname, a.attname,
             pg_catalog.format_type(a.atttypid, a.atttypmod), a.attnotnull),
      E'\n' order by c.relname, a.attnum
    )) fingerprint
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
  where n.nspname = 'public'
    and c.relname in ('caissa_online_rate_limits', 'identity_enrollment_decisions')
),
manifest as (
  select jsonb_object_agg(key, value) value
  from graph_state g
  cross join semantic_surface s
  cross join lateral (values
    ('account_fk_edge_count', to_jsonb(g.edge_count)),
    ('account_fk_relation_count', to_jsonb(g.relation_count)),
    ('account_fk_fingerprint', to_jsonb(g.fingerprint)),
    ('identity_surface_column_count', to_jsonb(s.column_count)),
    ('identity_surface_fingerprint', to_jsonb(s.fingerprint)),
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
  ) pairs(key, value)
)
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
  'counts', (select value from manifest),
  'beta_audit_policy', 'explicit_delete_after_encrypted_restore_tested_backup',
  'retained_audit_policy', 'detach_identity_migration_audit_and_scanner_corpus'
)::text;

rollback;
