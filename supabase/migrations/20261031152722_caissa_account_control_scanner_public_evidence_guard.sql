-- Account Control integration for immutable Scanner public evidence.
-- This terminal migration intentionally leaves the Scanner append-only records
-- untouched. Self-service deletion fails closed to manual review whenever an
-- account is referenced by that governed evidence.
begin;

do $$
declare v_missing text[];
begin
  select pg_catalog.array_agg(required.object_name order by required.object_name)
    into v_missing
  from (values
    ('public.scanner_public_scans'),
    ('public.scanner_public_feedback_raw'),
    ('public.scanner_feedback_certifications'),
    ('public.scanner_feedback_review_audit'),
    ('public.caissa_account_states'),
    ('public.identity_bindings')
  ) as required(object_name)
  where pg_catalog.to_regclass(required.object_name) is null;
  if pg_catalog.cardinality(v_missing) > 0 then
    raise exception 'CAISSA_SCANNER_ACCOUNT_CONTROL_PREREQUISITES_MISSING:%',
      pg_catalog.array_to_string(v_missing, ',');
  end if;
  if pg_catalog.to_regprocedure('public.caissa_account_write_barrier()') is null
     or pg_catalog.to_regprocedure('public.caissa_account_control_summary(uuid,uuid)') is null
     or pg_catalog.to_regprocedure('private.scanner_public_append_only()') is null then
    raise exception 'CAISSA_SCANNER_ACCOUNT_CONTROL_FUNCTIONS_MISSING';
  end if;
end
$$;

-- Keep identity/migration conflicts separate from governed Scanner evidence so
-- users can still export their data while self-service deletion is held.
create or replace function public.caissa_account_identity_has_blocking_state(p_user_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_found boolean:=false;
begin
  if pg_catalog.to_regclass('public.identity_incident_holds') is not null then
    execute 'select exists(select 1 from public.identity_incident_holds where user_id=$1 and status=''ACTIVE'')'
      into v_found using p_user_id;
    if v_found then return true; end if;
  end if;
  if exists(select 1 from public.identity_migration_challenges c where c.user_id=p_user_id
      and c.status='PENDING' and c.expires_at>pg_catalog.clock_timestamp()) then return true; end if;
  if exists(select 1 from public.identity_manual_recovery_previews p where p.user_id=p_user_id
      and p.status='PENDING' and p.expires_at>pg_catalog.clock_timestamp()) then return true; end if;
  return false;
end;
$$;

create or replace function public.caissa_account_scanner_public_evidence_count(p_user_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select (
    (select pg_catalog.count(*) from public.scanner_public_scans s
      where s.submitted_by=p_user_id)
    + (select pg_catalog.count(*) from public.scanner_public_feedback_raw f
      where f.submitted_by=p_user_id)
    + (select pg_catalog.count(*) from public.scanner_feedback_certifications c
      join public.scanner_public_feedback_raw f on f.feedback_id=c.feedback_id
      where c.certified_by=p_user_id or f.submitted_by=p_user_id)
    + (select pg_catalog.count(*) from public.scanner_feedback_review_audit a
      join public.scanner_public_feedback_raw f on f.feedback_id=a.feedback_id
      where a.reviewer_id=p_user_id or f.submitted_by=p_user_id)
  )::integer;
$$;

create or replace function public.caissa_account_has_blocking_state(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.caissa_account_identity_has_blocking_state(p_user_id)
    or public.caissa_account_scanner_public_evidence_count(p_user_id)>0;
$$;

create or replace function public.caissa_account_storage_reference_count(p_user_id uuid)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_count integer:=0; v_public_count integer:=0;
begin
  if pg_catalog.to_regclass('public.scanner_beta_scans') is not null then
    execute 'select count(*)::integer from public.scanner_beta_scans where user_id=$1 and nullif(btrim(image_storage_reference),'''') is not null'
      into v_count using p_user_id;
  end if;
  select pg_catalog.count(*)::integer into v_public_count
  from public.scanner_public_feedback_raw f
  where f.submitted_by=p_user_id
    and nullif(pg_catalog.btrim(f.image_storage_reference),'') is not null;
  return v_count+v_public_count;
end;
$$;

create or replace function public.caissa_account_control_summary(
  p_user_id uuid,
  p_binding_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_binding public.identity_bindings%rowtype;
  v_state text;
  v_conflict boolean;
  v_active_entitlements integer;
  v_puzzle_progress integer := 0;
  v_puzzle_attempts integer := 0;
  v_library_positions integer := 0;
  v_library_collections integer := 0;
  v_scanner_legacy_records integer := 0;
  v_scanner_public_scans integer := 0;
  v_scanner_public_feedback integer := 0;
  v_scanner_public_certifications integer := 0;
  v_scanner_public_review_events integer := 0;
  v_scanner_public_evidence integer := 0;
  v_mentor_results integer := 0;
  v_beta_activity integer := 0;
  v_storage_references integer := 0;
  v_active_economic_work boolean := false;
begin
  select b.* into v_binding
  from public.identity_bindings b
  where b.id=p_binding_id and b.user_id=p_user_id
    and b.provider='clerk' and b.status='ACTIVE';
  if v_binding.id is null then raise exception 'CAISSA_ACCOUNT_OWNERSHIP_REQUIRED'; end if;

  select s.state into v_state from public.caissa_account_states s where s.user_id=p_user_id;
  select public.caissa_account_identity_has_blocking_state(p_user_id) or exists (
    select 1 from public.caissa_identity_ownership_reviews r
    where r.user_id=p_user_id and r.status in ('REVIEW_REQUIRED','QUARANTINED','REVOKED')
  ) into v_conflict;

  v_active_entitlements := public.caissa_account_active_entitlement_count(p_user_id);
  v_storage_references := public.caissa_account_storage_reference_count(p_user_id);
  v_active_economic_work := public.caissa_account_has_active_economic_work(p_user_id);

  if pg_catalog.to_regclass('public.puzzle_training_progress') is not null then
    execute 'select count(*)::integer from public.puzzle_training_progress where user_id=$1'
      into v_puzzle_progress using p_user_id;
  end if;
  if pg_catalog.to_regclass('public.puzzle_training_attempts') is not null then
    execute 'select count(*)::integer from public.puzzle_training_attempts where user_id=$1'
      into v_puzzle_attempts using p_user_id;
  end if;
  if pg_catalog.to_regclass('public.library_positions') is not null then
    execute 'select count(*)::integer from public.library_positions where user_id=$1'
      into v_library_positions using p_user_id;
  end if;
  if pg_catalog.to_regclass('public.library_collections') is not null then
    execute 'select count(*)::integer from public.library_collections where user_id=$1'
      into v_library_collections using p_user_id;
  end if;
  if pg_catalog.to_regclass('public.scanner_beta_scans') is not null then
    execute 'select count(*)::integer from public.scanner_beta_scans where user_id=$1'
      into v_scanner_legacy_records using p_user_id;
  end if;
  select pg_catalog.count(*)::integer into v_scanner_public_scans
    from public.scanner_public_scans s where s.submitted_by=p_user_id;
  select pg_catalog.count(*)::integer into v_scanner_public_feedback
    from public.scanner_public_feedback_raw f where f.submitted_by=p_user_id;
  select pg_catalog.count(*)::integer into v_scanner_public_certifications
    from public.scanner_feedback_certifications c
    join public.scanner_public_feedback_raw f on f.feedback_id=c.feedback_id
    where c.certified_by=p_user_id or f.submitted_by=p_user_id;
  select pg_catalog.count(*)::integer into v_scanner_public_review_events
    from public.scanner_feedback_review_audit a
    join public.scanner_public_feedback_raw f on f.feedback_id=a.feedback_id
    where a.reviewer_id=p_user_id or f.submitted_by=p_user_id;
  v_scanner_public_evidence := v_scanner_public_scans+v_scanner_public_feedback
    +v_scanner_public_certifications+v_scanner_public_review_events;
  if pg_catalog.to_regclass('public.mentor_operation_results') is not null then
    execute 'select count(*)::integer from public.mentor_operation_results where user_id=$1'
      into v_mentor_results using p_user_id;
  end if;
  if pg_catalog.to_regclass('public.beta_audit_events') is not null then
    execute 'select count(*)::integer from public.beta_audit_events where user_id=$1'
      into v_beta_activity using p_user_id;
  end if;

  return pg_catalog.jsonb_build_object(
    'ownership',case when v_conflict then 'REVIEW_REQUIRED' else 'VERIFIED' end,
    'accountState',coalesce(v_state,'ACTIVE'),
    'counts',pg_catalog.jsonb_build_object(
      'puzzleProgress',v_puzzle_progress,
      'puzzleAttempts',v_puzzle_attempts,
      'libraryPositions',v_library_positions,
      'libraryCollections',v_library_collections,
      'scannerRecords',v_scanner_legacy_records+v_scanner_public_evidence,
      'scannerLegacyRecords',v_scanner_legacy_records,
      'scannerPublicScans',v_scanner_public_scans,
      'scannerPublicFeedback',v_scanner_public_feedback,
      'scannerPublicCertifications',v_scanner_public_certifications,
      'scannerPublicReviewEvents',v_scanner_public_review_events,
      'scannerPublicEvidence',v_scanner_public_evidence,
      'mentorResults',v_mentor_results,
      'betaActivity',v_beta_activity,
      'storageReferences',v_storage_references,
      'insightDatasets',(select pg_catalog.count(*) from public.insight_datasets d where d.user_id=p_user_id),
      'insightReports',(select pg_catalog.count(*) from public.insight_reports r where r.user_id=p_user_id),
      'onlineGames',(select pg_catalog.count(*) from public.caissa_online_games g where g.white_user_id=p_user_id or g.black_user_id=p_user_id),
      'creditEvents',(select pg_catalog.count(*) from public.credit_events c where c.user_id=p_user_id),
      'activeEntitlements',v_active_entitlements,
      'billingRecords',(select pg_catalog.count(*) from public.stripe_events s where s.user_id=p_user_id)
    ),
    'capabilities',pg_catalog.jsonb_build_object(
      'export',not v_conflict and coalesce(v_state,'ACTIVE')='ACTIVE',
      'progressReset',not v_conflict and coalesce(v_state,'ACTIVE')='ACTIVE',
      'accountDeletion',not v_conflict and coalesce(v_state,'ACTIVE')='ACTIVE'
        and v_active_entitlements=0 and v_storage_references=0 and not v_active_economic_work
        and v_scanner_public_evidence=0
    ),
    'economicRetentionRequired',v_active_entitlements>0 or exists (
      select 1 from public.credit_events c where c.user_id=p_user_id
    ) or exists (
      select 1 from public.stripe_events s where s.user_id=p_user_id
    ),
    'manualReviewRequired',v_conflict or v_active_entitlements>0
      or v_storage_references>0 or v_active_economic_work or v_scanner_public_evidence>0
  );
end;
$$;

create or replace function public.export_caissa_scanner_public_data_page(
  p_user_id uuid,
  p_binding_id uuid,
  p_section text,
  p_offset integer,
  p_limit integer,
  p_snapshot_at timestamptz
)
returns table(data jsonb)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_summary jsonb;
  v_limit integer:=least(greatest(coalesce(p_limit,0),1),100);
  v_offset integer:=greatest(coalesce(p_offset,0),0);
begin
  if p_section not in (
    'scannerPublicScans','scannerPublicFeedback',
    'scannerPublicCertifications','scannerPublicReviewEvents'
  ) or p_limit is null or p_limit not between 1 and 100
     or p_offset is null or p_offset<0 or p_snapshot_at is null
     or p_snapshot_at>pg_catalog.clock_timestamp()+interval '5 minutes' then
    raise exception 'CAISSA_ACCOUNT_EXPORT_PAGE_INVALID';
  end if;
  v_summary:=public.caissa_account_control_summary(p_user_id,p_binding_id);
  if v_summary->>'ownership'<>'VERIFIED' or v_summary->>'accountState'<>'ACTIVE' then
    raise exception 'CAISSA_ACCOUNT_OWNERSHIP_REQUIRED';
  end if;

  if p_section='scannerPublicScans' then
    return query select pg_catalog.to_jsonb(s)-'submitted_by'
    from public.scanner_public_scans s
    where s.submitted_by=p_user_id and s.submitted_at<=p_snapshot_at
    order by s.submitted_at,s.scan_id offset v_offset limit v_limit;
  elsif p_section='scannerPublicFeedback' then
    return query select pg_catalog.to_jsonb(f)-'submitted_by'
    from public.scanner_public_feedback_raw f
    where f.submitted_by=p_user_id and f.inserted_at<=p_snapshot_at
    order by f.inserted_at,f.feedback_id offset v_offset limit v_limit;
  elsif p_section='scannerPublicCertifications' then
    return query select pg_catalog.jsonb_build_object(
      'id',c.id,
      'scope',case when f.submitted_by=p_user_id then 'submittedFeedback' else 'reviewerAction' end,
      'feedbackId',case when f.submitted_by=p_user_id then c.feedback_id else null end,
      'action',c.action,'certifiedAt',c.certified_at,
      'certificationVersion',c.certification_version,
      'targetCorpus',c.target_corpus,'trainingEligible',c.training_eligible,
      'reasonCodes',c.reason_codes
    )
    from public.scanner_feedback_certifications c
    join public.scanner_public_feedback_raw f on f.feedback_id=c.feedback_id
    where (f.submitted_by=p_user_id or c.certified_by=p_user_id)
      and c.certified_at<=p_snapshot_at
    order by c.certified_at,c.id offset v_offset limit v_limit;
  elsif p_section='scannerPublicReviewEvents' then
    return query select pg_catalog.jsonb_build_object(
      'id',a.id,
      'scope',case when f.submitted_by=p_user_id then 'submittedFeedback' else 'reviewerAction' end,
      'feedbackId',case when f.submitted_by=p_user_id then a.feedback_id else null end,
      'eventType',a.event_type,'recordedAt',a.recorded_at
    )
    from public.scanner_feedback_review_audit a
    join public.scanner_public_feedback_raw f on f.feedback_id=a.feedback_id
    where (f.submitted_by=p_user_id or a.reviewer_id=p_user_id)
      and a.recorded_at<=p_snapshot_at
    order by a.recorded_at,a.id offset v_offset limit v_limit;
  end if;
end;
$$;

create index if not exists scanner_public_scans_account_export_idx
  on public.scanner_public_scans(submitted_by,submitted_at,scan_id);
create index if not exists scanner_public_feedback_account_export_idx
  on public.scanner_public_feedback_raw(submitted_by,inserted_at,feedback_id);
create index if not exists scanner_feedback_certifications_actor_idx
  on public.scanner_feedback_certifications(certified_by,certified_at,id);
create index if not exists scanner_feedback_review_audit_actor_idx
  on public.scanner_feedback_review_audit(reviewer_id,recorded_at,id);

-- Account state changes and immutable Scanner evidence now share the same
-- advisory-lock barrier. The Scanner's own append-only triggers remain active.
drop trigger if exists caissa_account_write_barrier on public.scanner_public_scans;
create trigger caissa_account_write_barrier
before insert or update or delete on public.scanner_public_scans
for each row execute function public.caissa_account_write_barrier('submitted_by');

drop trigger if exists caissa_account_write_barrier on public.scanner_public_feedback_raw;
create trigger caissa_account_write_barrier
before insert or update or delete on public.scanner_public_feedback_raw
for each row execute function public.caissa_account_write_barrier('submitted_by');

drop trigger if exists caissa_account_write_barrier on public.scanner_feedback_certifications;
create trigger caissa_account_write_barrier
before insert or update or delete on public.scanner_feedback_certifications
for each row execute function public.caissa_account_write_barrier('certified_by');

drop trigger if exists caissa_account_write_barrier on public.scanner_feedback_review_audit;
create trigger caissa_account_write_barrier
before insert or update or delete on public.scanner_feedback_review_audit
for each row execute function public.caissa_account_write_barrier('reviewer_id');

-- Neutralize broad creator default ACLs while retaining the Scanner runtime's
-- exact append-only service contract.
revoke all on table
  public.scanner_public_scans,
  public.scanner_public_feedback_raw,
  public.scanner_feedback_certifications,
  public.scanner_feedback_review_audit
from public,anon,authenticated,service_role;
grant select,insert on table
  public.scanner_public_scans,
  public.scanner_public_feedback_raw,
  public.scanner_feedback_certifications,
  public.scanner_feedback_review_audit
to service_role;

revoke all on sequence
  public.scanner_feedback_certifications_id_seq,
  public.scanner_feedback_review_audit_id_seq
from public,anon,authenticated,service_role;
grant usage,select on sequence
  public.scanner_feedback_certifications_id_seq,
  public.scanner_feedback_review_audit_id_seq
to service_role;

revoke all on function
  private.scanner_public_append_only(),
  public.caissa_account_identity_has_blocking_state(uuid),
  public.caissa_account_scanner_public_evidence_count(uuid),
  public.export_caissa_scanner_public_data_page(uuid,uuid,text,integer,integer,timestamptz),
  public.submit_scanner_public_scan(uuid,jsonb,text,jsonb),
  public.submit_scanner_public_feedback(uuid,jsonb,text,text,text),
  public.record_scanner_feedback_certification(jsonb),
  public.record_scanner_feedback_review_event(uuid,uuid,text)
from public,anon,authenticated,service_role;

grant execute on function
  public.caissa_account_scanner_public_evidence_count(uuid),
  public.export_caissa_scanner_public_data_page(uuid,uuid,text,integer,integer,timestamptz),
  public.submit_scanner_public_scan(uuid,jsonb,text,jsonb),
  public.submit_scanner_public_feedback(uuid,jsonb,text,text,text),
  public.record_scanner_feedback_certification(jsonb),
  public.record_scanner_feedback_review_event(uuid,uuid,text)
to service_role;

-- CREATE OR REPLACE preserves the earlier grants; restate them explicitly.
revoke all on function
  public.caissa_account_has_blocking_state(uuid),
  public.caissa_account_storage_reference_count(uuid),
  public.caissa_account_control_summary(uuid,uuid)
from public,anon,authenticated,service_role;
grant execute on function
  public.caissa_account_has_blocking_state(uuid),
  public.caissa_account_storage_reference_count(uuid),
  public.caissa_account_control_summary(uuid,uuid)
to service_role;

comment on function public.caissa_account_scanner_public_evidence_count(uuid) is
  'Counts immutable Scanner public evidence related to an account. Any positive result requires manual deletion review.';
comment on function public.export_caissa_scanner_public_data_page(uuid,uuid,text,integer,integer,timestamptz) is
  'Returns bounded owner-scoped Scanner public evidence pages without exposing reviewer identities or cross-account target identifiers.';

commit;
