-- ScannerBetaFeedback@1.0.0. Versioned only; do not apply without release authorization.
begin;

create schema if not exists private;

create table public.scanner_beta_scans (
  scan_id uuid primary key,
  schema_version text not null check (schema_version = 'caissa-scanner-beta-prediction-snapshot/1'),
  corpus_version text not null check (corpus_version = 'caissa-scanner-beta-feedback-v0.1'),
  created_at timestamptz not null,
  model_version text not null check (model_version = 'caissa-piece-classifier-v0.5-occupancy-recovery'),
  model_checksum text not null check (model_checksum = '90D06A3C1AAC934188CBA5EEB4B68D51AC64C815351BFE372F2215101DD7209E'),
  occupancy_threshold numeric not null check (occupancy_threshold = 0.99),
  image_hash text not null check (image_hash ~ '^[A-F0-9]{64}$'),
  image_storage_reference text,
  consent_state jsonb not null default '{"shareImageForImprovement":false,"shareCorrectionForImprovement":false}'::jsonb,
  platform text check (platform is null or platform in ('Chess.com','Lichess','ChessBase / Playchess','ICC','PlayOK','FIDE/event','Chessworld','CAISSA gateway','other')),
  capture_type text check (capture_type is null or capture_type in ('camera','gallery','screenshot','photo-of-screen')),
  snapshot_hash text not null unique check (snapshot_hash ~ '^[A-F0-9]{64}$'),
  snapshot jsonb not null,
  client_metadata jsonb,
  inserted_at timestamptz not null default now()
);

create table public.scanner_beta_square_predictions (
  scan_id uuid not null references public.scanner_beta_scans(scan_id) on delete cascade,
  square text not null check (square ~ '^[a-h][1-8]$'),
  predicted_class text not null check (predicted_class in ('empty','P','N','B','R','Q','K','p','n','b','r','q','k')),
  confidence real not null check (confidence between 0 and 1),
  occupancy_probability real not null check (occupancy_probability between 0 and 1),
  color_probabilities jsonb not null,
  piece_type_probabilities jsonb not null,
  king_auxiliary_probability real check (king_auxiliary_probability is null or king_auxiliary_probability between 0 and 1),
  primary key (scan_id, square)
);

create table public.scanner_beta_feedback (
  feedback_id uuid primary key,
  scan_id uuid not null unique references public.scanner_beta_scans(scan_id) on delete cascade,
  schema_version text not null check (schema_version = 'caissa-scanner-beta-feedback/1'),
  corpus_version text not null check (corpus_version = 'caissa-scanner-beta-feedback-v0.1'),
  feedback_type text not null check (feedback_type in ('CONFIRMED_CORRECT','PIECE_CORRECTION','LOCALIZATION_FAILURE','SCAN_FAILURE')),
  training_status text not null default 'pending-review' check (training_status in ('pending-review','human-confirmed','duplicate','held','excluded','eligible-for-training','consumed-in-dataset')),
  payload_hash text not null unique check (payload_hash ~ '^[A-F0-9]{64}$'),
  original_fen text not null,
  corrected_fen text,
  changed_square_count smallint not null check (changed_square_count between 0 and 64),
  final_position_confirmed boolean not null default false,
  localization_valid boolean not null default true,
  share_image_for_improvement boolean not null default false,
  share_correction_for_improvement boolean not null default false,
  platform text check (platform is null or platform in ('Chess.com','Lichess','ChessBase / Playchess','ICC','PlayOK','FIDE/event','Chessworld','CAISSA gateway','other')),
  capture_type text check (capture_type is null or capture_type in ('camera','gallery','screenshot','photo-of-screen')),
  client_metadata jsonb,
  created_at timestamptz not null,
  inserted_at timestamptz not null default now(),
  check (training_status <> 'eligible-for-training' or
    (final_position_confirmed and localization_valid and share_image_for_improvement and share_correction_for_improvement))
);

create table public.scanner_beta_square_corrections (
  feedback_id uuid not null references public.scanner_beta_feedback(feedback_id) on delete cascade,
  square text not null check (square ~ '^[a-h][1-8]$'),
  predicted_class text not null check (predicted_class in ('empty','P','N','B','R','Q','K','p','n','b','r','q','k')),
  corrected_class text not null check (corrected_class in ('empty','P','N','B','R','Q','K','p','n','b','r','q','k')),
  original_confidence real not null check (original_confidence between 0 and 1),
  occupancy_probability real not null check (occupancy_probability between 0 and 1),
  color_probabilities jsonb not null,
  piece_type_probabilities jsonb not null,
  king_auxiliary_probability real check (king_auxiliary_probability is null or king_auxiliary_probability between 0 and 1),
  primary key (feedback_id, square),
  check (predicted_class <> corrected_class)
);

create index scanner_beta_feedback_platform_created_idx
  on public.scanner_beta_feedback(platform, created_at desc) where platform is not null;
create index scanner_beta_feedback_pending_idx
  on public.scanner_beta_feedback(created_at) where training_status = 'pending-review';
create index scanner_beta_feedback_training_idx
  on public.scanner_beta_feedback(created_at) where training_status = 'eligible-for-training';

alter table public.scanner_beta_scans enable row level security;
alter table public.scanner_beta_square_predictions enable row level security;
alter table public.scanner_beta_feedback enable row level security;
alter table public.scanner_beta_square_corrections enable row level security;
alter table public.scanner_beta_scans force row level security;
alter table public.scanner_beta_square_predictions force row level security;
alter table public.scanner_beta_feedback force row level security;
alter table public.scanner_beta_square_corrections force row level security;

revoke all on public.scanner_beta_scans, public.scanner_beta_square_predictions,
  public.scanner_beta_feedback, public.scanner_beta_square_corrections from public, anon, authenticated;
grant select, insert on public.scanner_beta_scans, public.scanner_beta_square_predictions,
  public.scanner_beta_feedback, public.scanner_beta_square_corrections to service_role;

create or replace function private.scanner_beta_snapshot_immutable()
returns trigger language plpgsql security invoker set search_path = pg_catalog as $$
begin
  if new.snapshot is distinct from old.snapshot or new.snapshot_hash is distinct from old.snapshot_hash
    or new.model_version is distinct from old.model_version or new.model_checksum is distinct from old.model_checksum
    or new.occupancy_threshold is distinct from old.occupancy_threshold then
    raise exception 'SCANNER_BETA_SNAPSHOT_IMMUTABLE';
  end if;
  return new;
end $$;

create trigger scanner_beta_snapshot_immutable
before update on public.scanner_beta_scans
for each row execute function private.scanner_beta_snapshot_immutable();

create or replace function public.submit_scanner_beta_scan(
  p_snapshot jsonb, p_snapshot_hash text, p_metadata jsonb default '{}'::jsonb)
returns table(accepted boolean, duplicate boolean)
language plpgsql security definer set search_path = pg_catalog as $$
declare v_scan_id uuid; v_prior_hash text; v_predictions jsonb;
begin
  v_scan_id := (p_snapshot->>'scanId')::uuid;
  if p_snapshot_hash !~ '^[A-F0-9]{64}$' then raise exception 'SNAPSHOT_HASH_INVALID'; end if;
  select s.snapshot_hash into v_prior_hash from public.scanner_beta_scans s where s.scan_id = v_scan_id;
  if found then
    if v_prior_hash <> p_snapshot_hash then raise exception 'SNAPSHOT_IMMUTABLE_CONFLICT'; end if;
    return query select true, true; return;
  end if;
  v_predictions := p_snapshot->'squarePredictions';
  if jsonb_typeof(v_predictions) <> 'array' or jsonb_array_length(v_predictions) <> 64 then
    raise exception 'PREDICTION_COUNT';
  end if;
  insert into public.scanner_beta_scans(scan_id,schema_version,corpus_version,created_at,model_version,
    model_checksum,occupancy_threshold,image_hash,image_storage_reference,consent_state,platform,capture_type,
    snapshot_hash,snapshot,client_metadata)
  values(v_scan_id,p_snapshot->>'schemaVersion',p_snapshot->>'corpusVersion',(p_snapshot->>'timestamp')::timestamptz,
    p_snapshot->>'modelVersion',p_snapshot->>'modelChecksum',(p_snapshot->>'occupancyThreshold')::numeric,
    p_snapshot->>'imageHash',nullif(p_metadata->>'imageStorageReference',''),coalesce(p_metadata->'consent','{}'::jsonb),
    nullif(p_metadata->>'platform',''),nullif(p_metadata->>'captureType',''),p_snapshot_hash,p_snapshot,
    p_metadata->'clientMetadata');
  insert into public.scanner_beta_square_predictions(scan_id,square,predicted_class,confidence,
    occupancy_probability,color_probabilities,piece_type_probabilities,king_auxiliary_probability)
  select v_scan_id,item->>'square',item->>'predictedClass',(item->>'confidence')::real,
    (item->>'occupancyProbability')::real,item->'colorProbabilities',item->'pieceTypeProbabilities',
    nullif(item->>'kingAuxiliaryProbability','')::real
  from jsonb_array_elements(v_predictions) item;
  if (select count(*) from public.scanner_beta_square_predictions where scan_id=v_scan_id) <> 64 then
    raise exception 'PREDICTION_COUNT';
  end if;
  return query select true, false;
end $$;

create or replace function public.submit_scanner_beta_feedback(p_feedback jsonb,p_payload_hash text)
returns table(accepted boolean, duplicate boolean)
language plpgsql security definer set search_path = pg_catalog as $$
declare v_feedback_id uuid; v_scan_id uuid; v_prior_hash text; v_changed jsonb; v_consent jsonb;
begin
  v_feedback_id := (p_feedback->>'feedbackId')::uuid;
  v_scan_id := (p_feedback->>'scanId')::uuid;
  if p_payload_hash !~ '^[A-F0-9]{64}$' then raise exception 'PAYLOAD_HASH_INVALID'; end if;
  perform 1 from public.scanner_beta_scans where scan_id=v_scan_id;
  if not found then raise exception 'SCAN_NOT_FOUND'; end if;
  select f.payload_hash into v_prior_hash from public.scanner_beta_feedback f
    where f.feedback_id=v_feedback_id or f.scan_id=v_scan_id;
  if found then
    if v_prior_hash <> p_payload_hash then raise exception 'FEEDBACK_ID_CONFLICT'; end if;
    return query select true, true; return;
  end if;
  v_changed := p_feedback->'changedSquares'; v_consent := p_feedback->'consent';
  if jsonb_typeof(v_changed) <> 'array' or jsonb_array_length(v_changed) <> (p_feedback->>'changedSquareCount')::integer then
    raise exception 'CORRECTION_COUNT_MISMATCH';
  end if;
  insert into public.scanner_beta_feedback(feedback_id,scan_id,schema_version,corpus_version,feedback_type,
    training_status,payload_hash,original_fen,corrected_fen,changed_square_count,final_position_confirmed,
    localization_valid,share_image_for_improvement,share_correction_for_improvement,platform,capture_type,
    client_metadata,created_at)
  values(v_feedback_id,v_scan_id,p_feedback->>'schemaVersion',p_feedback->>'corpusVersion',p_feedback->>'feedbackType',
    'pending-review',p_payload_hash,p_feedback->>'originalFEN',nullif(p_feedback->>'correctedFEN',''),
    (p_feedback->>'changedSquareCount')::smallint,(p_feedback->>'finalPositionConfirmed')::boolean,
    (p_feedback->>'localizationValid')::boolean,(v_consent->>'shareImageForImprovement')::boolean,
    (v_consent->>'shareCorrectionForImprovement')::boolean,nullif(p_feedback->>'platform',''),
    nullif(p_feedback->>'captureType',''),p_feedback->'clientMetadata',(p_feedback->>'createdAt')::timestamptz);
  insert into public.scanner_beta_square_corrections(feedback_id,square,predicted_class,corrected_class,
    original_confidence,occupancy_probability,color_probabilities,piece_type_probabilities,king_auxiliary_probability)
  select v_feedback_id,item->>'square',item->>'predicted',item->>'corrected',
    (item->>'originalConfidence')::real,(item->>'occupancyProbability')::real,item->'colorProbabilities',
    item->'pieceTypeProbabilities',nullif(item->>'kingAuxiliaryProbability','')::real
  from jsonb_array_elements(v_changed) item;
  return query select true, false;
end $$;

revoke all on function private.scanner_beta_snapshot_immutable() from public, anon, authenticated;
revoke all on function public.submit_scanner_beta_scan(jsonb,text,jsonb) from public, anon, authenticated;
revoke all on function public.submit_scanner_beta_feedback(jsonb,text) from public, anon, authenticated;
grant execute on function public.submit_scanner_beta_scan(jsonb,text,jsonb),
  public.submit_scanner_beta_feedback(jsonb,text) to service_role;

commit;
