-- CAISSAScannerPublicFeedback@0.1.0
-- Versioned release artifact only. Do not apply without the Phase 4 human release gate.
begin;

create table public.scanner_public_scans (
  scan_id uuid primary key,
  submitted_by uuid references public.users(id) on delete set null,
  submitted_at timestamptz not null default now(),
  source_trust text not null default 'public_user' check (source_trust = 'public_user'),
  model_version text not null check (model_version = 'caissa-piece-classifier-v0.5-occupancy-recovery'),
  model_checksum text not null check (model_checksum = '90D06A3C1AAC934188CBA5EEB4B68D51AC64C815351BFE372F2215101DD7209E'),
  occupancy_threshold numeric not null check (occupancy_threshold = 0.99),
  localization_version text not null check (localization_version = 'caissa-scanner-board-localizer/4'),
  image_hash text not null check (image_hash ~ '^[A-F0-9]{64}$'),
  snapshot_hash text not null unique check (snapshot_hash ~ '^[A-F0-9]{64}$'),
  platform text,
  capture_type text check (capture_type is null or capture_type in ('camera','gallery','screenshot','photo-of-screen')),
  snapshot jsonb not null,
  client_metadata jsonb not null default '{}'::jsonb
);

create table public.scanner_public_feedback_raw (
  feedback_id uuid primary key,
  scan_id uuid references public.scanner_public_scans(scan_id) on delete restrict,
  submitted_by uuid not null references public.users(id) on delete restrict,
  submitted_at timestamptz not null,
  schema_version text not null check (schema_version in ('caissa-scanner-public-feedback/1','caissa-scanner-public-scan-failure/1')),
  corpus_version text not null check (corpus_version = 'caissa-scanner-public-feedback-v0.1'),
  source_trust text not null check (source_trust = 'public_user'),
  certification_status text not null check (certification_status = 'raw-unverified'),
  feedback_type text not null check (feedback_type in ('CONFIRMED_CORRECT','PIECE_CORRECTION','LOCALIZATION_FAILURE','SCAN_FAILURE')),
  model_version text not null check (model_version = 'caissa-piece-classifier-v0.5-occupancy-recovery'),
  localization_version text not null check (localization_version = 'caissa-scanner-board-localizer/4'),
  platform text,
  capture_type text check (capture_type is null or capture_type in ('camera','gallery','screenshot','photo-of-screen')),
  image_storage_reference text,
  payload_hash text not null unique check (payload_hash ~ '^[A-F0-9]{64}$'),
  evidence_fingerprint text not null check (evidence_fingerprint ~ '^[A-F0-9]{64}$'),
  duplicate_suspected boolean not null default false,
  payload jsonb not null,
  inserted_at timestamptz not null default now(),
  check ((feedback_type = 'SCAN_FAILURE' and scan_id is null) or (feedback_type <> 'SCAN_FAILURE' and scan_id is not null)),
  check (image_storage_reference is null or image_storage_reference ~ '^supabase://scanner-public-feedback-images/[0-9a-f-]{36}/[A-F0-9]{2}/[A-F0-9]{64}$')
);

create table public.scanner_feedback_certifications (
  id bigint generated always as identity primary key,
  feedback_id uuid not null references public.scanner_public_feedback_raw(feedback_id) on delete restrict,
  action text not null check (action in (
    'CERTIFY','CERTIFY_CLASSIFIER_CORRECTION','CERTIFY_LOCALIZATION_FAILURE',
    'NEEDS_FIX','DUPLICATE','HOLD','EXCLUDE'
  )),
  certified_by uuid not null references public.users(id) on delete restrict,
  certified_at timestamptz not null default now(),
  certification_version text not null check (certification_version = 'caissa-scanner-owner-certification/1'),
  certification_notes text check (certification_notes is null or length(certification_notes) <= 2000),
  target_corpus text check (target_corpus is null or target_corpus in (
    'caissa-scanner-certified-classifier-corrections',
    'caissa-scanner-certified-localization-failures'
  )),
  training_eligible boolean not null default false,
  reason_codes text[] not null default '{}',
  duplicate_of uuid references public.scanner_public_feedback_raw(feedback_id) on delete restrict,
  check (not training_eligible or action in ('CERTIFY_CLASSIFIER_CORRECTION','CERTIFY_LOCALIZATION_FAILURE')),
  check (
    (action = 'CERTIFY_CLASSIFIER_CORRECTION' and target_corpus = 'caissa-scanner-certified-classifier-corrections')
    or (action = 'CERTIFY_LOCALIZATION_FAILURE' and target_corpus = 'caissa-scanner-certified-localization-failures')
    or (action not in ('CERTIFY_CLASSIFIER_CORRECTION','CERTIFY_LOCALIZATION_FAILURE') and target_corpus is null)
  ),
  check ((action = 'DUPLICATE') = (duplicate_of is not null))
);

create table public.scanner_feedback_review_audit (
  id bigint generated always as identity primary key,
  feedback_id uuid not null references public.scanner_public_feedback_raw(feedback_id) on delete restrict,
  reviewer_id uuid not null references public.users(id) on delete restrict,
  event_type text not null check (event_type in (
    'CASE_OPENED','CERTIFIED','HELD','EXCLUDED','DUPLICATE','TRAINING_ELIGIBILITY_GRANTED'
  )),
  recorded_at timestamptz not null default now()
);

create index scanner_public_feedback_review_idx
  on public.scanner_public_feedback_raw(submitted_at desc);
create index scanner_public_feedback_type_idx
  on public.scanner_public_feedback_raw(feedback_type, submitted_at desc);
create index scanner_public_feedback_fingerprint_idx
  on public.scanner_public_feedback_raw(evidence_fingerprint, submitted_at desc);
create index scanner_feedback_certifications_history_idx
  on public.scanner_feedback_certifications(feedback_id, certified_at desc, id desc);
create index scanner_feedback_training_candidates_idx
  on public.scanner_feedback_certifications(target_corpus, certified_at desc)
  where training_eligible;
create index scanner_feedback_review_audit_idx
  on public.scanner_feedback_review_audit(feedback_id, recorded_at desc, id desc);

alter table public.scanner_public_scans enable row level security;
alter table public.scanner_public_feedback_raw enable row level security;
alter table public.scanner_feedback_certifications enable row level security;
alter table public.scanner_feedback_review_audit enable row level security;
alter table public.scanner_public_scans force row level security;
alter table public.scanner_public_feedback_raw force row level security;
alter table public.scanner_feedback_certifications force row level security;
alter table public.scanner_feedback_review_audit force row level security;

revoke all on public.scanner_public_scans, public.scanner_public_feedback_raw,
  public.scanner_feedback_certifications, public.scanner_feedback_review_audit from public, anon, authenticated;
revoke all on sequence public.scanner_feedback_certifications_id_seq,
  public.scanner_feedback_review_audit_id_seq from public, anon, authenticated;
grant select, insert on public.scanner_public_scans, public.scanner_public_feedback_raw,
  public.scanner_feedback_certifications, public.scanner_feedback_review_audit to service_role;
grant usage, select on sequence public.scanner_feedback_certifications_id_seq,
  public.scanner_feedback_review_audit_id_seq to service_role;

create or replace function private.scanner_public_append_only()
returns trigger language plpgsql security invoker set search_path = pg_catalog as $$
begin
  raise exception 'SCANNER_PUBLIC_EVIDENCE_APPEND_ONLY';
end $$;

create trigger scanner_public_scans_append_only
before update or delete on public.scanner_public_scans
for each row execute function private.scanner_public_append_only();
create trigger scanner_public_feedback_append_only
before update or delete on public.scanner_public_feedback_raw
for each row execute function private.scanner_public_append_only();
create trigger scanner_feedback_certifications_append_only
before update or delete on public.scanner_feedback_certifications
for each row execute function private.scanner_public_append_only();
create trigger scanner_feedback_review_audit_append_only
before update or delete on public.scanner_feedback_review_audit
for each row execute function private.scanner_public_append_only();

create or replace function public.submit_scanner_public_scan(
  p_user_id uuid,
  p_snapshot jsonb,
  p_snapshot_hash text,
  p_metadata jsonb default '{}'::jsonb
) returns table(accepted boolean, duplicate boolean)
language plpgsql security definer set search_path = pg_catalog as $$
declare v_scan_id uuid; v_prior_hash text;
begin
  v_scan_id := (p_snapshot->>'scanId')::uuid;
  if p_snapshot_hash !~ '^[A-F0-9]{64}$' then raise exception 'SNAPSHOT_HASH_INVALID'; end if;
  select s.snapshot_hash into v_prior_hash from public.scanner_public_scans s where s.scan_id = v_scan_id;
  if found then
    if v_prior_hash <> p_snapshot_hash then raise exception 'SNAPSHOT_IMMUTABLE_CONFLICT'; end if;
    return query select true, true; return;
  end if;
  insert into public.scanner_public_scans(
    scan_id,submitted_by,submitted_at,model_version,model_checksum,occupancy_threshold,
    localization_version,image_hash,snapshot_hash,platform,capture_type,snapshot,client_metadata
  ) values (
    v_scan_id,p_user_id,(p_snapshot->>'timestamp')::timestamptz,
    p_snapshot->>'modelVersion',p_snapshot->>'modelChecksum',(p_snapshot->>'occupancyThreshold')::numeric,
    p_metadata->>'localizationVersion',p_snapshot->>'imageHash',p_snapshot_hash,
    nullif(p_metadata->>'platform',''),nullif(p_metadata->>'captureType',''),p_snapshot,
    coalesce(p_metadata->'clientMetadata','{}'::jsonb)
  );
  return query select true, false;
end $$;

create or replace function public.submit_scanner_public_feedback(
  p_user_id uuid,
  p_feedback jsonb,
  p_payload_hash text,
  p_image_storage_reference text,
  p_evidence_fingerprint text
) returns table(accepted boolean, duplicate boolean, duplicate_suspected boolean)
language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_feedback_id uuid; v_scan_id uuid; v_prior_hash text; v_duplicate boolean;
  v_feedback_type text; v_client_metadata jsonb; v_consent jsonb;
begin
  v_feedback_id := (p_feedback->>'feedbackId')::uuid;
  v_feedback_type := p_feedback->>'feedbackType';
  v_scan_id := nullif(p_feedback->>'scanId','')::uuid;
  v_client_metadata := coalesce(p_feedback->'clientMetadata','{}'::jsonb);
  v_consent := coalesce(p_feedback->'consent','{}'::jsonb);
  if p_payload_hash !~ '^[A-F0-9]{64}$' or p_evidence_fingerprint !~ '^[A-F0-9]{64}$' then
    raise exception 'FEEDBACK_HASH_INVALID';
  end if;
  if p_feedback->>'sourceTrust' <> 'public_user'
    or p_feedback->>'certificationStatus' <> 'raw-unverified'
    or p_feedback->>'corpusVersion' <> 'caissa-scanner-public-feedback-v0.1' then
    raise exception 'PUBLIC_FEEDBACK_TRUST_INVALID';
  end if;
  if v_feedback_type <> 'SCAN_FAILURE' then
    perform 1 from public.scanner_public_scans where scan_id = v_scan_id;
    if not found then raise exception 'SCAN_NOT_FOUND'; end if;
  else
    v_scan_id := null;
  end if;
  if p_image_storage_reference is not null then
    if coalesce((v_consent->>'shareImageForImprovement')::boolean,false) is not true
      or p_image_storage_reference not like 'supabase://scanner-public-feedback-images/' || p_user_id::text || '/%' then
      raise exception 'IMAGE_CONSENT_OR_OWNERSHIP_INVALID';
    end if;
    if split_part(p_image_storage_reference,'/',6) <> p_feedback->>'imageHash' then
      raise exception 'IMAGE_EVIDENCE_HASH_MISMATCH';
    end if;
  end if;
  select f.payload_hash into v_prior_hash from public.scanner_public_feedback_raw f
    where f.feedback_id = v_feedback_id;
  if found then
    if v_prior_hash <> p_payload_hash then raise exception 'FEEDBACK_IMMUTABLE_CONFLICT'; end if;
    return query select true, true, f.duplicate_suspected
      from public.scanner_public_feedback_raw f where f.feedback_id = v_feedback_id;
    return;
  end if;
  select exists(select 1 from public.scanner_public_feedback_raw f
    where f.evidence_fingerprint = p_evidence_fingerprint) into v_duplicate;
  insert into public.scanner_public_feedback_raw(
    feedback_id,scan_id,submitted_by,submitted_at,schema_version,corpus_version,source_trust,
    certification_status,feedback_type,model_version,localization_version,platform,capture_type,
    image_storage_reference,payload_hash,evidence_fingerprint,duplicate_suspected,payload
  ) values (
    v_feedback_id,v_scan_id,p_user_id,(p_feedback->>'createdAt')::timestamptz,
    p_feedback->>'schemaVersion',p_feedback->>'corpusVersion',p_feedback->>'sourceTrust',
    p_feedback->>'certificationStatus',v_feedback_type,p_feedback->>'modelVersion',
    v_client_metadata->>'localizationVersion',nullif(p_feedback->>'platform',''),
    nullif(p_feedback->>'captureType',''),p_image_storage_reference,p_payload_hash,
    p_evidence_fingerprint,v_duplicate,p_feedback
  );
  return query select true, false, v_duplicate;
end $$;

create or replace function public.record_scanner_feedback_certification(p_decision jsonb)
returns public.scanner_feedback_certifications
language plpgsql security definer set search_path = pg_catalog as $$
declare v_raw public.scanner_public_feedback_raw; v_row public.scanner_feedback_certifications;
begin
  select * into v_raw from public.scanner_public_feedback_raw
    where feedback_id = (p_decision->>'feedbackId')::uuid;
  if not found then raise exception 'FEEDBACK_NOT_FOUND'; end if;
  if coalesce((p_decision->>'trainingEligible')::boolean,false) then
    if v_raw.duplicate_suspected or v_raw.image_storage_reference is null
      or coalesce((v_raw.payload->'consent'->>'shareImageForImprovement')::boolean,false) is not true
      or coalesce((v_raw.payload->'consent'->>'shareCorrectionForImprovement')::boolean,false) is not true then
      raise exception 'TRAINING_ELIGIBILITY_GATE_FAILED';
    end if;
    if exists(select 1 from public.scanner_feedback_certifications c
      where c.feedback_id = v_raw.feedback_id and c.action in ('DUPLICATE','EXCLUDE')) then
      raise exception 'TRAINING_ELIGIBILITY_HISTORY_BLOCKED';
    end if;
  end if;
  if p_decision->>'action' = 'CERTIFY_CLASSIFIER_CORRECTION'
    and (v_raw.feedback_type <> 'PIECE_CORRECTION'
      or coalesce((v_raw.payload->>'localizationValid')::boolean,false) is not true) then
    raise exception 'CLASSIFIER_ROUTING_INVALID';
  end if;
  if p_decision->>'action' = 'CERTIFY_LOCALIZATION_FAILURE'
    and (v_raw.feedback_type not in ('LOCALIZATION_FAILURE','SCAN_FAILURE')
      or coalesce((v_raw.payload->>'localizationValid')::boolean,true) is not false) then
    raise exception 'LOCALIZATION_ROUTING_INVALID';
  end if;
  insert into public.scanner_feedback_certifications(
    feedback_id,action,certified_by,certification_version,certification_notes,target_corpus,
    training_eligible,reason_codes,duplicate_of
  ) values (
    (p_decision->>'feedbackId')::uuid,p_decision->>'action',(p_decision->>'certifiedBy')::uuid,
    p_decision->>'certificationVersion',nullif(p_decision->>'notes',''),nullif(p_decision->>'targetCorpus',''),
    coalesce((p_decision->>'trainingEligible')::boolean,false),
    coalesce(array(select jsonb_array_elements_text(coalesce(p_decision->'reasonCodes','[]'::jsonb))),array[]::text[]),
    nullif(p_decision->>'duplicateOf','')::uuid
  ) returning * into v_row;
  if v_row.action like 'CERTIFY%' then
    insert into public.scanner_feedback_review_audit(feedback_id,reviewer_id,event_type)
      values (v_row.feedback_id,v_row.certified_by,'CERTIFIED');
  elsif v_row.action = 'HOLD' then
    insert into public.scanner_feedback_review_audit(feedback_id,reviewer_id,event_type)
      values (v_row.feedback_id,v_row.certified_by,'HELD');
  elsif v_row.action = 'EXCLUDE' then
    insert into public.scanner_feedback_review_audit(feedback_id,reviewer_id,event_type)
      values (v_row.feedback_id,v_row.certified_by,'EXCLUDED');
  elsif v_row.action = 'DUPLICATE' then
    insert into public.scanner_feedback_review_audit(feedback_id,reviewer_id,event_type)
      values (v_row.feedback_id,v_row.certified_by,'DUPLICATE');
  end if;
  if v_row.training_eligible then
    insert into public.scanner_feedback_review_audit(feedback_id,reviewer_id,event_type)
      values (v_row.feedback_id,v_row.certified_by,'TRAINING_ELIGIBILITY_GRANTED');
  end if;
  return v_row;
end $$;

create or replace function public.record_scanner_feedback_review_event(
  p_feedback_id uuid,
  p_reviewer_id uuid,
  p_event_type text
) returns public.scanner_feedback_review_audit
language plpgsql security definer set search_path = pg_catalog as $$
declare v_row public.scanner_feedback_review_audit;
begin
  if p_event_type <> 'CASE_OPENED' then raise exception 'REVIEW_AUDIT_EVENT_INVALID'; end if;
  insert into public.scanner_feedback_review_audit(feedback_id,reviewer_id,event_type)
    values (p_feedback_id,p_reviewer_id,p_event_type) returning * into v_row;
  return v_row;
end $$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'scanner-public-feedback-images',
  'scanner-public-feedback-images',
  false,
  12000000,
  array['image/jpeg','image/png','image/webp']
) on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

revoke all on function private.scanner_public_append_only() from public, anon, authenticated;
revoke all on function public.submit_scanner_public_scan(uuid,jsonb,text,jsonb) from public, anon, authenticated;
revoke all on function public.submit_scanner_public_feedback(uuid,jsonb,text,text,text) from public, anon, authenticated;
revoke all on function public.record_scanner_feedback_certification(jsonb) from public, anon, authenticated;
revoke all on function public.record_scanner_feedback_review_event(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.submit_scanner_public_scan(uuid,jsonb,text,jsonb),
  public.submit_scanner_public_feedback(uuid,jsonb,text,text,text),
  public.record_scanner_feedback_certification(jsonb),
  public.record_scanner_feedback_review_event(uuid,uuid,text) to service_role;

commit;
