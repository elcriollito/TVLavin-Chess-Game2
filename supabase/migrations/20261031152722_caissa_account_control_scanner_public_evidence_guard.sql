-- Terminal Account Control integration for current-main owner data surfaces.
-- Governed Scanner evidence remains append-only and forces manual review;
-- ordinary owner data is exportable and erased or tombstoned by explicit policy.
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
    ('public.scanner_beta_scans'),
    ('public.scanner_beta_feedback'),
    ('public.scanner_beta_scan_failures'),
    ('public.scanner_beta_square_corrections'),
    ('public.opening_repertoires'),
    ('public.player_album_entitlements'),
    ('public.identity_enrollment_decisions'),
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

-- Snapshot boundaries must use a server-controlled clock. submitted_at is a
-- user event timestamp and may legitimately be in the future.
alter table public.scanner_public_scans
  add column if not exists inserted_at timestamptz not null default pg_catalog.clock_timestamp();
alter table public.identity_enrollment_decisions
  add column if not exists retired_subject_hash text;
create unique index if not exists identity_enrollment_decisions_retired_subject_hash_idx
  on public.identity_enrollment_decisions(environment,retired_subject_hash)
  where retired_subject_hash is not null;

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

create or replace function public.caissa_account_active_entitlement_count(p_user_id uuid)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_total integer:=0; v_count integer:=0;
begin
  if pg_catalog.to_regclass('public.product_entitlements') is not null then
    execute 'select count(*)::integer from public.product_entitlements where user_id=$1 and status=''active'''
      into v_count using p_user_id;
    v_total:=v_total+v_count;
  end if;
  if pg_catalog.to_regclass('public.user_entitlements') is not null then
    execute 'select count(*)::integer from public.user_entitlements where user_id=$1 and revoked_at is null and (expires_at is null or expires_at>clock_timestamp())'
      into v_count using p_user_id;
    v_total:=v_total+v_count;
  end if;
  select pg_catalog.count(*)::integer into v_count
    from public.player_album_entitlements e where e.user_id=p_user_id;
  return v_total+v_count;
end;
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
  v_opening_repertoires integer := 0;
  v_scanner_legacy_records integer := 0;
  v_scanner_legacy_feedback integer := 0;
  v_scanner_legacy_failures integer := 0;
  v_scanner_legacy_corrections integer := 0;
  v_scanner_public_scans integer := 0;
  v_scanner_public_feedback integer := 0;
  v_scanner_public_certifications integer := 0;
  v_scanner_public_review_events integer := 0;
  v_scanner_public_evidence integer := 0;
  v_mentor_results integer := 0;
  v_beta_activity integer := 0;
  v_player_album_entitlements integer := 0;
  v_identity_enrollment_decisions integer := 0;
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
  select pg_catalog.count(*)::integer into v_opening_repertoires
    from public.opening_repertoires r where r.user_id=p_user_id;
  if pg_catalog.to_regclass('public.scanner_beta_scans') is not null then
    execute 'select count(*)::integer from public.scanner_beta_scans where user_id=$1'
      into v_scanner_legacy_records using p_user_id;
  end if;
  select pg_catalog.count(*)::integer into v_scanner_legacy_feedback
    from public.scanner_beta_feedback f where f.user_id=p_user_id;
  select pg_catalog.count(*)::integer into v_scanner_legacy_failures
    from public.scanner_beta_scan_failures f where f.user_id=p_user_id;
  select pg_catalog.count(*)::integer into v_scanner_legacy_corrections
    from public.scanner_beta_square_corrections c
    join public.scanner_beta_feedback f on f.feedback_id=c.feedback_id
    where f.user_id=p_user_id;
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
  select pg_catalog.count(*)::integer into v_player_album_entitlements
    from public.player_album_entitlements e where e.user_id=p_user_id;
  select pg_catalog.count(*)::integer into v_identity_enrollment_decisions
    from public.identity_enrollment_decisions d
    where d.environment='production' and d.external_subject=v_binding.external_subject;

  return pg_catalog.jsonb_build_object(
    'ownership',case when v_conflict then 'REVIEW_REQUIRED' else 'VERIFIED' end,
    'accountState',coalesce(v_state,'ACTIVE'),
    'counts',pg_catalog.jsonb_build_object(
      'puzzleProgress',v_puzzle_progress,
      'puzzleAttempts',v_puzzle_attempts,
      'libraryPositions',v_library_positions,
      'libraryCollections',v_library_collections,
      'openingRepertoires',v_opening_repertoires,
      'scannerRecords',v_scanner_legacy_records+v_scanner_legacy_feedback
        +v_scanner_legacy_failures+v_scanner_legacy_corrections+v_scanner_public_evidence,
      'scannerLegacyRecords',v_scanner_legacy_records,
      'scannerLegacyFeedback',v_scanner_legacy_feedback,
      'scannerLegacyFailures',v_scanner_legacy_failures,
      'scannerLegacyCorrections',v_scanner_legacy_corrections,
      'scannerPublicScans',v_scanner_public_scans,
      'scannerPublicFeedback',v_scanner_public_feedback,
      'scannerPublicCertifications',v_scanner_public_certifications,
      'scannerPublicReviewEvents',v_scanner_public_review_events,
      'scannerPublicEvidence',v_scanner_public_evidence,
      'mentorResults',v_mentor_results,
      'betaActivity',v_beta_activity,
      'playerAlbumEntitlements',v_player_album_entitlements,
      'identityEnrollmentDecisions',v_identity_enrollment_decisions,
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
  v_limit integer:=least(greatest(coalesce(p_limit,0),1),2);
  v_offset integer:=greatest(coalesce(p_offset,0),0);
begin
  if p_section not in (
    'scannerPublicScans','scannerPublicFeedback',
    'scannerPublicCertifications','scannerPublicReviewEvents'
  ) or p_limit is null or p_limit not between 1 and 2
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
    where s.submitted_by=p_user_id and s.inserted_at<=p_snapshot_at
    order by s.inserted_at,s.scan_id offset v_offset limit v_limit;
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

create or replace function public.export_caissa_opening_repertoire_data_page(
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
  v_limit integer:=least(greatest(coalesce(p_limit,0),1),10);
  v_offset integer:=greatest(coalesce(p_offset,0),0);
begin
  if p_section<>'openingRepertoires' or p_limit is null or p_limit not between 1 and 10
     or p_offset is null or p_offset<0 or p_snapshot_at is null
     or p_snapshot_at>pg_catalog.clock_timestamp()+interval '5 minutes' then
    raise exception 'CAISSA_ACCOUNT_EXPORT_PAGE_INVALID';
  end if;
  v_summary:=public.caissa_account_control_summary(p_user_id,p_binding_id);
  if v_summary->>'ownership'<>'VERIFIED' or v_summary->>'accountState'<>'ACTIVE' then
    raise exception 'CAISSA_ACCOUNT_OWNERSHIP_REQUIRED';
  end if;

  return query select pg_catalog.jsonb_build_object(
    'schemaVersion',r.schema_version,
    'id',r.local_id,
    'name',r.name,
    'color',r.color,
    'eco',r.eco,
    'opening',r.opening,
    'initialFen',r.initial_fen,
    'lines',r.lines,
    'progress',r.progress,
    'createdAt',r.local_created_at,
    'updatedAt',r.local_updated_at
  )
  from public.opening_repertoires r
  where r.user_id=p_user_id and r.synced_at<=p_snapshot_at
  order by r.synced_at,r.id offset v_offset limit v_limit;
end;
$$;

create or replace function public.export_caissa_account_supplemental_data_page(
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
  v_binding public.identity_bindings%rowtype;
  v_limit integer:=greatest(coalesce(p_limit,0),1);
  v_offset integer:=greatest(coalesce(p_offset,0),0);
  v_scanner_section boolean:=p_section in (
    'scannerScans','scannerFeedback','scannerFailures','scannerCorrections');
begin
  if p_section not in (
       'scannerScans','scannerFeedback','scannerFailures','scannerCorrections',
       'playerAlbumEntitlements','identityEnrollmentDecisions'
     ) or p_limit is null or p_limit<1
     or (v_scanner_section and p_limit>2)
     or (not v_scanner_section and p_limit>100)
     or p_offset is null or p_offset<0 or p_snapshot_at is null
     or p_snapshot_at>pg_catalog.clock_timestamp()+interval '5 minutes' then
    raise exception 'CAISSA_ACCOUNT_EXPORT_PAGE_INVALID';
  end if;
  v_summary:=public.caissa_account_control_summary(p_user_id,p_binding_id);
  if v_summary->>'ownership'<>'VERIFIED' or v_summary->>'accountState'<>'ACTIVE' then
    raise exception 'CAISSA_ACCOUNT_OWNERSHIP_REQUIRED';
  end if;
  select b.* into v_binding from public.identity_bindings b
    where b.id=p_binding_id and b.user_id=p_user_id and b.provider='clerk' and b.status='ACTIVE';
  if v_binding.id is null then raise exception 'CAISSA_ACCOUNT_OWNERSHIP_REQUIRED'; end if;

  if p_section='scannerScans' then
    return query select pg_catalog.to_jsonb(s)-'user_id'
      from public.scanner_beta_scans s
      where s.user_id=p_user_id and s.inserted_at<=p_snapshot_at
      order by s.inserted_at,s.scan_id offset v_offset limit v_limit;
  elsif p_section='scannerFeedback' then
    return query select pg_catalog.to_jsonb(f)-'user_id'
      from public.scanner_beta_feedback f
      where f.user_id=p_user_id and f.inserted_at<=p_snapshot_at
      order by f.inserted_at,f.feedback_id offset v_offset limit v_limit;
  elsif p_section='scannerFailures' then
    return query select pg_catalog.to_jsonb(f)-'user_id'
      from public.scanner_beta_scan_failures f
      where f.user_id=p_user_id and f.inserted_at<=p_snapshot_at
      order by f.inserted_at,f.feedback_id offset v_offset limit v_limit;
  elsif p_section='scannerCorrections' then
    return query select pg_catalog.to_jsonb(c)
      from public.scanner_beta_square_corrections c
      join public.scanner_beta_feedback f on f.feedback_id=c.feedback_id
      where f.user_id=p_user_id and f.inserted_at<=p_snapshot_at
      order by f.inserted_at,c.feedback_id,c.square offset v_offset limit v_limit;
  elsif p_section='playerAlbumEntitlements' then
    return query select pg_catalog.jsonb_build_object(
      'albumId',e.album_id,'creditCost',e.credit_cost,'acquiredAt',e.acquired_at)
      from public.player_album_entitlements e
      where e.user_id=p_user_id and e.acquired_at<=p_snapshot_at
      order by e.acquired_at,e.id offset v_offset limit v_limit;
  elsif p_section='identityEnrollmentDecisions' then
    return query select pg_catalog.jsonb_build_object(
      'environment',d.environment,'decision',d.decision,'reason',d.reason,
      'createdAt',d.created_at,'expiresAt',d.expires_at,'consumedAt',d.consumed_at)
      from public.identity_enrollment_decisions d
      where d.environment='production' and d.external_subject=v_binding.external_subject
        and d.created_at<=p_snapshot_at
      order by d.created_at,d.id offset v_offset limit v_limit;
  end if;
end;
$$;

-- Restate the locked erasure function after modern-main reconciliation. The
-- only semantic addition is explicit deletion of mutable Opening Trainer data
-- before the user root is tombstoned.
create or replace function public.erase_caissa_account_data(
  p_operation_id uuid,
  p_user_id uuid,
  p_binding_id uuid,
  p_external_subject_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_operation public.caissa_account_control_operations%rowtype;
  v_binding public.identity_bindings%rowtype;
  v_deleted_subject text := 'deleted_' || pg_catalog.replace(p_user_id::text,'-','');
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('caissa.account-control.erasure.global',0));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text,0));
  select o.* into v_operation from public.caissa_account_control_operations o
  where o.id=p_operation_id and o.user_id=p_user_id and o.binding_id=p_binding_id
    and o.kind='ACCOUNT_DELETION' for update;
  if v_operation.id is null then raise exception 'CAISSA_ACCOUNT_OPERATION_NOT_FOUND'; end if;
  if v_operation.status='AUTH_DELETION_PENDING' then return v_operation.result || '{"duplicate":true}'::jsonb; end if;
  if v_operation.status <> 'LOCKED' then raise exception 'CAISSA_ACCOUNT_OPERATION_INVALID_STATE'; end if;
  perform pg_catalog.set_config('caissa.account_control_erasure_operation',p_operation_id::text,true);

  if public.caissa_account_has_blocking_state(p_user_id)
     or public.caissa_account_active_entitlement_count(p_user_id)>0
     or public.caissa_account_storage_reference_count(p_user_id)>0
     or public.caissa_account_has_active_economic_work(p_user_id) then
    update public.caissa_account_control_operations set status='REVIEW_REQUIRED',updated_at=pg_catalog.clock_timestamp()
      where id=p_operation_id;
    update public.caissa_account_states set state='REVIEW_REQUIRED',reason_code='CONCURRENT_REVIEW_REQUIRED',updated_at=pg_catalog.clock_timestamp()
      where user_id=p_user_id and operation_id=p_operation_id;
    insert into public.caissa_account_control_audit(operation_id,event_type) values(p_operation_id,'REVIEW_REQUIRED');
    return pg_catalog.jsonb_build_object('status','REVIEW_REQUIRED','duplicate',false);
  end if;

  select * into v_binding from public.identity_bindings
  where id=p_binding_id and user_id=p_user_id and provider='clerk' and status='ACTIVE'
    and p_external_subject_hash ~ '^[0-9a-f]{64}$'
    and pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(external_subject,'UTF8')),'hex')=p_external_subject_hash
  for update;
  if v_binding.id is null then raise exception 'CAISSA_ACCOUNT_OWNERSHIP_REQUIRED'; end if;

  delete from public.caissa_online_matchmaking_tickets where user_id=p_user_id;
  delete from public.caissa_online_presence where user_id=p_user_id;
  update public.caissa_online_challenges set state='cancelled',updated_at=pg_catalog.clock_timestamp()
  where (challenger_user_id=p_user_id or challenged_user_id=p_user_id) and state='pending';
  update public.caissa_online_tournaments set owner_user_id=null where owner_user_id=p_user_id;
  delete from public.caissa_online_ratings where user_id=p_user_id;
  delete from public.caissa_online_profiles where user_id=p_user_id;
  delete from public.insight_reports where user_id=p_user_id;
  delete from public.insight_datasets where user_id=p_user_id;
  delete from public.caissa_public_identities where user_id=p_user_id;
  delete from public.opening_repertoires where user_id=p_user_id;
  if pg_catalog.to_regclass('public.library_positions') is not null then
    execute 'delete from public.library_positions where user_id=$1' using p_user_id;
  end if;
  if pg_catalog.to_regclass('public.library_collections') is not null then
    execute 'delete from public.library_collections where user_id=$1' using p_user_id;
  end if;
  if pg_catalog.to_regclass('public.library_sync_log') is not null then
    execute 'delete from public.library_sync_log where user_id=$1' using p_user_id;
  end if;
  if pg_catalog.to_regclass('public.mentor_operation_results') is not null then
    execute 'delete from public.mentor_operation_results where user_id=$1' using p_user_id;
  end if;
  if pg_catalog.to_regclass('public.scanner_beta_feedback') is not null then
    execute 'delete from public.scanner_beta_feedback where user_id=$1' using p_user_id;
  end if;
  if pg_catalog.to_regclass('public.scanner_beta_scan_failures') is not null then
    execute 'delete from public.scanner_beta_scan_failures where user_id=$1' using p_user_id;
  end if;
  if pg_catalog.to_regclass('public.scanner_beta_scans') is not null then
    execute 'delete from public.scanner_beta_scans where user_id=$1' using p_user_id;
  end if;
  if pg_catalog.to_regclass('public.puzzle_training_attempts') is not null then
    execute 'delete from public.puzzle_training_attempts where user_id=$1' using p_user_id;
  end if;
  if pg_catalog.to_regclass('public.puzzle_training_progress') is not null then
    execute 'delete from public.puzzle_training_progress where user_id=$1' using p_user_id;
  end if;
  if pg_catalog.to_regclass('public.beta_audit_events') is not null then
    execute 'delete from public.beta_audit_events where user_id=$1' using p_user_id;
  end if;

  update public.caissa_online_games set
    white_clerk_id=v_deleted_subject,
    white_display_name='Deleted Player',
    draw_offer_by=case when draw_offer_by=v_binding.external_subject then null else draw_offer_by end,
    identity_policy_version=0,
    pgn=pg_catalog.regexp_replace(pgn,E'\\[White "[^"\\r\\n]*"\\]','[White "Deleted Player"]','g')
  where white_user_id=p_user_id;
  update public.caissa_online_games set
    black_clerk_id=v_deleted_subject,
    black_display_name='Deleted Player',
    draw_offer_by=case when draw_offer_by=v_binding.external_subject then null else draw_offer_by end,
    identity_policy_version=0,
    pgn=pg_catalog.regexp_replace(pgn,E'\\[Black "[^"\\r\\n]*"\\]','[Black "Deleted Player"]','g')
  where black_user_id=p_user_id;
  delete from public.caissa_online_rate_limits r
  using public.identity_bindings b
  where b.user_id=p_user_id and b.provider='clerk' and r.clerk_id=b.external_subject;

  update public.identity_migration_challenges set status='REVOKED'
  where user_id=p_user_id and status='PENDING';
  update public.identity_migration_challenges
  set metadata=pg_catalog.jsonb_build_object('erased',true)
  where user_id=p_user_id;
  update public.identity_manual_recovery_previews set
    status='REVOKED'
  where user_id=p_user_id and status='PENDING';
  update public.identity_manual_recovery_previews set reason='ACCOUNT_ERASURE_RETAINED'
  where user_id=p_user_id;
  update public.identity_enrollment_decisions set
    retired_subject_hash=pg_catalog.encode(pg_catalog.sha256(
      pg_catalog.convert_to(external_subject,'UTF8')
    ),'hex'),
    external_subject='deleted_' || pg_catalog.encode(pg_catalog.sha256(
      pg_catalog.convert_to(id::text || ':' || external_subject,'UTF8')
    ),'hex'),
    reason='ACCOUNT_ERASURE_RETAINED'
  where environment='production' and external_subject=v_binding.external_subject;
  update public.identity_bindings set
    status='RETIRED',
    retired_at=coalesce(retired_at,pg_catalog.clock_timestamp()),
    external_subject='deleted_' || pg_catalog.encode(pg_catalog.sha256(
      pg_catalog.convert_to(id::text || ':' || external_subject,'UTF8')
    ),'hex'),
    metadata=pg_catalog.jsonb_build_object('erased',true)
  where user_id=p_user_id;
  update public.users set
    clerk_id='deleted_' || pg_catalog.replace(id::text,'-',''),
    email=null,is_premium=false,stripe_customer_id=null,updated_at=pg_catalog.clock_timestamp()
  where id=p_user_id;
  update public.caissa_account_control_operations set status='AUTH_DELETION_PENDING',
    result=pg_catalog.jsonb_build_object(
      'status','AUTH_DELETION_PENDING','dataErased',true,
      'economicRecordsRetained',true,'sharedGamesRetained',true
    ),updated_at=pg_catalog.clock_timestamp()
  where id=p_operation_id returning * into v_operation;
  insert into public.caissa_account_control_audit(operation_id,event_type)
  values(p_operation_id,'DATA_ERASURE_COMPLETED');
  return v_operation.result;
end;
$$;

create or replace function public.caissa_account_external_subject_write_barrier()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_subject text;
  v_seen text;
  v_user_id uuid;
begin
  foreach v_subject in array array[
    case when tg_op='INSERT' then null else nullif(pg_catalog.to_jsonb(old)->>tg_argv[0],'') end,
    case when tg_op='DELETE' then null else nullif(pg_catalog.to_jsonb(new)->>tg_argv[0],'') end
  ] loop
    if v_subject is null or v_subject is not distinct from v_seen
       or v_subject ~ '^deleted_[0-9a-f]{32,64}$' then
      continue;
    end if;
    v_seen:=v_subject;
    if exists(select 1 from public.identity_enrollment_decisions d
      where d.retired_subject_hash=pg_catalog.encode(pg_catalog.sha256(
        pg_catalog.convert_to(v_subject,'UTF8')),'hex')) then
      raise exception 'CAISSA_ACCOUNT_IDENTITY_RETIRED' using errcode='55000';
    end if;
    select u.id into v_user_id from public.users u where u.clerk_id=v_subject;
    if v_user_id is null then
      select b.user_id into v_user_id from public.identity_bindings b
      where b.provider='clerk' and b.external_subject=v_subject and b.status='ACTIVE'
      order by b.activated_at desc nulls last,b.id limit 1;
    end if;
    if v_user_id is not null then
      perform public.caissa_account_assert_writable(v_user_id);
    end if;
  end loop;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function public.caissa_account_rate_limit_write_barrier()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_subject text;
  v_seen_subject text;
begin
  foreach v_subject in array array[
    case when tg_op='INSERT' then null else old.clerk_id end,
    case when tg_op='DELETE' then null else new.clerk_id end
  ] loop
    if v_subject is null or v_subject is not distinct from v_seen_subject then continue; end if;
    v_seen_subject:=v_subject;
    if v_subject='online-global' or v_subject ~ '^online-source:[0-9a-f]{64}$'
       or v_subject ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      continue;
    end if;
    select u.id into v_user_id from public.users u where u.clerk_id=v_subject;
    if v_user_id is null then
      select b.user_id into v_user_id from public.identity_bindings b
      where b.provider='clerk' and b.external_subject=v_subject
      order by (b.status='ACTIVE') desc,b.activated_at desc nulls last,b.id limit 1;
    end if;
    if v_user_id is null then
      raise exception 'CAISSA_ACCOUNT_IDENTITY_REQUIRED' using errcode='42501';
    end if;
    perform public.caissa_account_assert_writable(v_user_id);
  end loop;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;

create index if not exists scanner_public_scans_account_export_idx
  on public.scanner_public_scans(submitted_by,inserted_at,scan_id);
create index if not exists scanner_public_feedback_account_export_idx
  on public.scanner_public_feedback_raw(submitted_by,inserted_at,feedback_id);
create index if not exists scanner_feedback_certifications_actor_idx
  on public.scanner_feedback_certifications(certified_by,certified_at,id);
create index if not exists scanner_feedback_review_audit_actor_idx
  on public.scanner_feedback_review_audit(reviewer_id,recorded_at,id);
create index if not exists opening_repertoires_account_export_idx
  on public.opening_repertoires(user_id,synced_at,id);

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

-- Opening Trainer was added after the original dynamic barrier installation.
-- Reconcile it explicitly so a previously resolved UUID cannot write after an
-- account enters deletion.
drop trigger if exists caissa_account_write_barrier on public.opening_repertoires;
create trigger caissa_account_write_barrier
before insert or update or delete on public.opening_repertoires
for each row execute function public.caissa_account_write_barrier('user_id');

drop trigger if exists caissa_account_external_subject_write_barrier
  on public.identity_enrollment_decisions;
create trigger caissa_account_external_subject_write_barrier
before insert or update or delete on public.identity_enrollment_decisions
for each row execute function public.caissa_account_external_subject_write_barrier('external_subject');

revoke all on table public.opening_repertoires
from public,anon,authenticated,service_role;
grant select,insert,update,delete on table public.opening_repertoires to service_role;

revoke all on table public.player_album_entitlements
from public,anon,authenticated,service_role;
grant select,insert on table public.player_album_entitlements to service_role;

revoke all on table public.identity_enrollment_decisions
from public,anon,authenticated,service_role;

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
  public.export_caissa_opening_repertoire_data_page(uuid,uuid,text,integer,integer,timestamptz),
  public.export_caissa_account_supplemental_data_page(uuid,uuid,text,integer,integer,timestamptz),
  public.submit_scanner_public_scan(uuid,jsonb,text,jsonb),
  public.submit_scanner_public_feedback(uuid,jsonb,text,text,text),
  public.record_scanner_feedback_certification(jsonb),
  public.record_scanner_feedback_review_event(uuid,uuid,text)
from public,anon,authenticated,service_role;

revoke all on function public.caissa_account_external_subject_write_barrier()
from public,anon,authenticated,service_role;

grant execute on function
  public.caissa_account_scanner_public_evidence_count(uuid),
  public.export_caissa_scanner_public_data_page(uuid,uuid,text,integer,integer,timestamptz),
  public.export_caissa_opening_repertoire_data_page(uuid,uuid,text,integer,integer,timestamptz),
  public.export_caissa_account_supplemental_data_page(uuid,uuid,text,integer,integer,timestamptz),
  public.submit_scanner_public_scan(uuid,jsonb,text,jsonb),
  public.submit_scanner_public_feedback(uuid,jsonb,text,text,text),
  public.record_scanner_feedback_certification(jsonb),
  public.record_scanner_feedback_review_event(uuid,uuid,text)
to service_role;

-- CREATE OR REPLACE preserves the earlier grants; restate them explicitly.
revoke all on function
  public.caissa_account_has_blocking_state(uuid),
  public.caissa_account_active_entitlement_count(uuid),
  public.caissa_account_storage_reference_count(uuid),
  public.caissa_account_control_summary(uuid,uuid)
from public,anon,authenticated,service_role;
grant execute on function
  public.caissa_account_has_blocking_state(uuid),
  public.caissa_account_active_entitlement_count(uuid),
  public.caissa_account_storage_reference_count(uuid),
  public.caissa_account_control_summary(uuid,uuid)
to service_role;

comment on function public.caissa_account_scanner_public_evidence_count(uuid) is
  'Counts immutable Scanner public evidence related to an account. Any positive result requires manual deletion review.';
comment on function public.export_caissa_scanner_public_data_page(uuid,uuid,text,integer,integer,timestamptz) is
  'Returns bounded owner-scoped Scanner public evidence pages without exposing reviewer identities or cross-account target identifiers.';
comment on function public.export_caissa_opening_repertoire_data_page(uuid,uuid,text,integer,integer,timestamptz) is
  'Returns bounded owner-scoped Opening Trainer repertoire pages without exposing internal owner or row identifiers.';
comment on function public.export_caissa_account_supplemental_data_page(uuid,uuid,text,integer,integer,timestamptz) is
  'Returns bounded owner-scoped legacy Scanner, player-album entitlement, and identity-enrollment data omitted by the historical dispatcher.';

commit;
