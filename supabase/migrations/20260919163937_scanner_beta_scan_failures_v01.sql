-- ScannerBetaScanFailures@1.0.0. Versioned only; do not apply without infrastructure authorization.
begin;

create table public.scanner_beta_scan_failures (
  feedback_id uuid primary key,
  scan_id uuid not null unique,
  schema_version text not null check (schema_version = 'caissa-scanner-beta-scan-failure/1'),
  corpus_version text not null check (corpus_version = 'caissa-scanner-beta-feedback-v0.1'),
  feedback_type text not null check (feedback_type = 'SCAN_FAILURE'),
  training_status text not null default 'pending-review' check (training_status in
    ('pending-review','human-confirmed','duplicate','held','excluded','eligible-for-training','consumed-in-dataset')),
  payload_hash text not null unique check (payload_hash ~ '^[A-F0-9]{64}$'),
  created_at timestamptz not null,
  model_version text not null check (model_version = 'caissa-piece-classifier-v0.5-occupancy-recovery'),
  model_checksum text not null check (model_checksum = '90D06A3C1AAC934188CBA5EEB4B68D51AC64C815351BFE372F2215101DD7209E'),
  occupancy_threshold numeric not null check (occupancy_threshold = 0.99),
  image_hash text not null check (image_hash ~ '^[A-F0-9]{64}$'),
  orientation text not null check (orientation in ('white-at-bottom','black-at-bottom')),
  failure_stage text not null check (failure_stage in ('unsupported-input','decode','localization','classifier','feedback')),
  error_code text not null check (error_code ~ '^[A-Z0-9_-]{1,80}$'),
  share_image_for_improvement boolean not null default false,
  share_correction_for_improvement boolean not null default false,
  platform text check (platform is null or platform in
    ('Chess.com','Lichess','ChessBase / Playchess','ICC','PlayOK','FIDE/event','Chessworld','CAISSA gateway','other')),
  capture_type text check (capture_type is null or capture_type in ('camera','gallery','screenshot','photo-of-screen')),
  client_metadata jsonb,
  inserted_at timestamptz not null default now(),
  check (training_status <> 'eligible-for-training')
);

create index scanner_beta_scan_failures_stage_created_idx
  on public.scanner_beta_scan_failures(failure_stage, created_at desc);

alter table public.scanner_beta_scan_failures enable row level security;
alter table public.scanner_beta_scan_failures force row level security;
revoke all on public.scanner_beta_scan_failures from public, anon, authenticated;
grant select, insert on public.scanner_beta_scan_failures to service_role;

create or replace function public.submit_scanner_beta_scan_failure(p_failure jsonb, p_payload_hash text)
returns table(accepted boolean, duplicate boolean)
language plpgsql security definer set search_path = pg_catalog as $$
declare v_feedback_id uuid; v_scan_id uuid; v_prior_hash text; v_consent jsonb;
begin
  v_feedback_id := (p_failure->>'feedbackId')::uuid;
  v_scan_id := (p_failure->>'scanId')::uuid;
  if p_payload_hash !~ '^[A-F0-9]{64}$' then raise exception 'PAYLOAD_HASH_INVALID'; end if;
  select f.payload_hash into v_prior_hash from public.scanner_beta_scan_failures f
    where f.feedback_id=v_feedback_id or f.scan_id=v_scan_id;
  if found then
    if v_prior_hash <> p_payload_hash then raise exception 'SCAN_FAILURE_ID_CONFLICT'; end if;
    return query select true, true; return;
  end if;
  v_consent := p_failure->'consent';
  insert into public.scanner_beta_scan_failures(feedback_id,scan_id,schema_version,corpus_version,
    feedback_type,training_status,payload_hash,created_at,model_version,model_checksum,occupancy_threshold,
    image_hash,orientation,failure_stage,error_code,share_image_for_improvement,
    share_correction_for_improvement,platform,capture_type,client_metadata)
  values(v_feedback_id,v_scan_id,p_failure->>'schemaVersion',p_failure->>'corpusVersion',
    p_failure->>'feedbackType','pending-review',p_payload_hash,(p_failure->>'createdAt')::timestamptz,
    p_failure->>'modelVersion',p_failure->>'modelChecksum',(p_failure->>'occupancyThreshold')::numeric,
    p_failure->>'imageHash',p_failure->>'orientation',p_failure->>'failureStage',p_failure->>'errorCode',
    (v_consent->>'shareImageForImprovement')::boolean,(v_consent->>'shareCorrectionForImprovement')::boolean,
    nullif(p_failure->>'platform',''),nullif(p_failure->>'captureType',''),p_failure->'clientMetadata');
  return query select true, false;
end $$;

revoke all on function public.submit_scanner_beta_scan_failure(jsonb,text) from public, anon, authenticated;
grant execute on function public.submit_scanner_beta_scan_failure(jsonb,text) to service_role;

commit;
