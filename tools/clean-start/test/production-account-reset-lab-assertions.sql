\set ON_ERROR_STOP on

do $assertions$
begin
  if exists (
    select 1 from (values
      ((select count(*) from public.users)),
      ((select count(*) from public.beta_audit_events)),
      ((select count(*) from public.caissa_public_identities)),
      ((select count(*) from public.identity_bindings)),
      ((select count(*) from public.identity_migration_challenges)),
      ((select count(*) from public.identity_manual_recovery_previews)),
      ((select count(*) from public.identity_enrollment_decisions)),
      ((select count(*) from public.caissa_online_rate_limits)),
      ((select count(*) from public.credit_events)),
      ((select count(*) from public.credit_reservations)),
      ((select count(*) from public.economic_usage_events)),
      ((select count(*) from public.mentor_operation_results)),
      ((select count(*) from public.user_entitlements)),
      ((select count(*) from public.puzzle_training_progress)),
      ((select count(*) from public.puzzle_training_attempts)),
      ((select count(*) from public.insight_datasets)),
      ((select count(*) from public.insight_reports)),
      ((select count(*) from public.library_positions)),
      ((select count(*) from public.library_collections)),
      ((select count(*) from public.library_sync_log))
    ) account_rows(n) where n <> 0
  ) then
    raise exception 'LAB_ACCOUNT_ROWS_REMAIN';
  end if;

  if (select count(*) from public.identity_migration_audit) <> 1
      or exists (
        select 1 from public.identity_migration_audit
        where user_id is not null or binding_id is not null or challenge_id is not null
      ) then
    raise exception 'LAB_AUDIT_NOT_SAFELY_DETACHED';
  end if;

  if (select count(*) from public.scanner_beta_scans) <> 1
      or (select count(*) from public.scanner_beta_scan_failures) <> 1
      or (select count(*) from public.scanner_beta_feedback) <> 1
      or (select count(*) from public.scanner_beta_square_corrections) <> 1
      or (select count(*) from public.scanner_beta_square_predictions) <> 1 then
    raise exception 'LAB_SCANNER_CORPUS_NOT_RETAINED';
  end if;
  if exists (
    select 1 from (
      select user_id, client_metadata from public.scanner_beta_scans
      union all select user_id, client_metadata from public.scanner_beta_scan_failures
      union all select user_id, client_metadata from public.scanner_beta_feedback
    ) retained where user_id is not null or client_metadata ? 'selectedImage'
  ) then
    raise exception 'LAB_SCANNER_PERSONAL_LINK_REMAINS';
  end if;

  if (select count(*) from public.stripe_events) <> 0 then
    raise exception 'LAB_PAYMENT_BASELINE_DIVERGED';
  end if;
  if (select count(*) from public.beta_experiments) <> 1 then
    raise exception 'LAB_GLOBAL_CATALOG_NOT_RETAINED';
  end if;
end
$assertions$;

select 'CAISSA_CLEAN_START_RESET_LAB_PASS';
