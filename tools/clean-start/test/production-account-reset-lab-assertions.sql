\set ON_ERROR_STOP on

do $assertions$
begin
  if exists (select 1 from public.users) then raise exception 'LAB_USERS_REMAIN'; end if;
  if exists (select 1 from public.caissa_public_identities) then raise exception 'LAB_IDENTITIES_REMAIN'; end if;
  if exists (select 1 from public.identity_bindings) then raise exception 'LAB_BINDINGS_REMAIN'; end if;
  if exists (select 1 from public.identity_migration_challenges) then raise exception 'LAB_CHALLENGES_REMAIN'; end if;
  if (select count(*) from public.identity_migration_audit) <> 1
      or exists (select 1 from public.identity_migration_audit where user_id is not null or binding_id is not null or challenge_id is not null) then
    raise exception 'LAB_AUDIT_NOT_SAFELY_DETACHED';
  end if;
  if (select count(*) from public.scanner_beta_scans) <> 1
      or (select count(*) from public.scanner_beta_scan_failures) <> 1
      or (select count(*) from public.scanner_beta_feedback) <> 1 then
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
  if (select count(*) from public.stripe_events) <> 1
      or exists (select 1 from public.stripe_events where user_id is not null) then
    raise exception 'LAB_PAYMENT_EVIDENCE_NOT_DETACHED';
  end if;
end
$assertions$;

select 'CAISSA_CLEAN_START_RESET_LAB_PASS';
