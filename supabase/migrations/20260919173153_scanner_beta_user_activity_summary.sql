-- ScannerBetaUserActivity@1.0.0. Versioned only; do not apply without deployment authorization.
begin;

alter table public.scanner_beta_scans
  add column user_id uuid references public.users(id) on delete restrict,
  add column submitted_at timestamptz not null default now();
alter table public.scanner_beta_feedback
  add column user_id uuid references public.users(id) on delete restrict,
  add column submitted_at timestamptz not null default now();
alter table public.scanner_beta_scan_failures
  add column user_id uuid references public.users(id) on delete restrict,
  add column submitted_at timestamptz not null default now();

create index scanner_beta_scans_user_submitted_idx
  on public.scanner_beta_scans(user_id, submitted_at desc) where user_id is not null;
create index scanner_beta_feedback_user_submitted_idx
  on public.scanner_beta_feedback(user_id, submitted_at desc) where user_id is not null;
create index scanner_beta_failures_user_submitted_idx
  on public.scanner_beta_scan_failures(user_id, submitted_at desc) where user_id is not null;

create function private.scanner_beta_activity_scope_immutable()
returns trigger language plpgsql set search_path = pg_catalog as $$
begin
  if new.user_id is distinct from old.user_id or new.submitted_at is distinct from old.submitted_at then
    raise exception 'SCANNER_BETA_ACTIVITY_SCOPE_IMMUTABLE';
  end if;
  return new;
end $$;

create trigger scanner_beta_scan_activity_scope_immutable
  before update on public.scanner_beta_scans for each row
  execute function private.scanner_beta_activity_scope_immutable();
create trigger scanner_beta_feedback_activity_scope_immutable
  before update on public.scanner_beta_feedback for each row
  execute function private.scanner_beta_activity_scope_immutable();
create trigger scanner_beta_failure_activity_scope_immutable
  before update on public.scanner_beta_scan_failures for each row
  execute function private.scanner_beta_activity_scope_immutable();

drop function if exists public.submit_scanner_beta_scan(jsonb,text,jsonb);
drop function if exists public.submit_scanner_beta_feedback(jsonb,text);
drop function if exists public.submit_scanner_beta_scan_failure(jsonb,text);

create function public.submit_scanner_beta_scan(
  p_user_id uuid, p_snapshot jsonb, p_snapshot_hash text, p_metadata jsonb default '{}'::jsonb)
returns table(accepted boolean, duplicate boolean)
language plpgsql security definer set search_path = pg_catalog as $$
declare v_scan_id uuid; v_prior_hash text; v_prior_user uuid; v_predictions jsonb;
begin
  if p_user_id is null then raise exception 'USER_ID_REQUIRED'; end if;
  v_scan_id := (p_snapshot->>'scanId')::uuid;
  perform pg_advisory_xact_lock(hashtextextended(v_scan_id::text,0));
  if p_snapshot_hash !~ '^[A-F0-9]{64}$' then raise exception 'SNAPSHOT_HASH_INVALID'; end if;
  select s.snapshot_hash,s.user_id into v_prior_hash,v_prior_user
    from public.scanner_beta_scans s where s.scan_id=v_scan_id;
  if found then
    if v_prior_user is distinct from p_user_id then raise exception 'SCAN_OWNER_CONFLICT'; end if;
    if v_prior_hash <> p_snapshot_hash then raise exception 'SNAPSHOT_IMMUTABLE_CONFLICT'; end if;
    return query select true, true; return;
  end if;
  v_predictions := p_snapshot->'squarePredictions';
  if jsonb_typeof(v_predictions) <> 'array' or jsonb_array_length(v_predictions) <> 64 then
    raise exception 'PREDICTION_COUNT';
  end if;
  insert into public.scanner_beta_scans(user_id,scan_id,schema_version,corpus_version,created_at,model_version,
    model_checksum,occupancy_threshold,image_hash,image_storage_reference,consent_state,platform,capture_type,
    snapshot_hash,snapshot,client_metadata)
  values(p_user_id,v_scan_id,p_snapshot->>'schemaVersion',p_snapshot->>'corpusVersion',
    (p_snapshot->>'timestamp')::timestamptz,p_snapshot->>'modelVersion',p_snapshot->>'modelChecksum',
    (p_snapshot->>'occupancyThreshold')::numeric,p_snapshot->>'imageHash',
    nullif(p_metadata->>'imageStorageReference',''),coalesce(p_metadata->'consent','{}'::jsonb),
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

create function public.submit_scanner_beta_feedback(p_user_id uuid, p_feedback jsonb, p_payload_hash text)
returns table(accepted boolean, duplicate boolean)
language plpgsql security definer set search_path = pg_catalog as $$
declare v_feedback_id uuid; v_scan_id uuid; v_prior_hash text; v_prior_user uuid; v_changed jsonb; v_consent jsonb;
begin
  if p_user_id is null then raise exception 'USER_ID_REQUIRED'; end if;
  v_feedback_id := (p_feedback->>'feedbackId')::uuid;
  v_scan_id := (p_feedback->>'scanId')::uuid;
  perform pg_advisory_xact_lock(hashtextextended(v_scan_id::text,0));
  if p_payload_hash !~ '^[A-F0-9]{64}$' then raise exception 'PAYLOAD_HASH_INVALID'; end if;
  perform 1 from public.scanner_beta_scans where scan_id=v_scan_id and user_id=p_user_id;
  if not found then raise exception 'SCAN_NOT_FOUND'; end if;
  perform 1 from public.scanner_beta_scan_failures where scan_id=v_scan_id;
  if found then raise exception 'SCAN_DISPOSITION_CONFLICT'; end if;
  select f.payload_hash,f.user_id into v_prior_hash,v_prior_user from public.scanner_beta_feedback f
    where f.feedback_id=v_feedback_id or f.scan_id=v_scan_id;
  if found then
    if v_prior_user is distinct from p_user_id then raise exception 'FEEDBACK_OWNER_CONFLICT'; end if;
    if v_prior_hash <> p_payload_hash then raise exception 'FEEDBACK_ID_CONFLICT'; end if;
    return query select true, true; return;
  end if;
  v_changed := p_feedback->'changedSquares'; v_consent := p_feedback->'consent';
  if jsonb_typeof(v_changed) <> 'array' or jsonb_array_length(v_changed) <> (p_feedback->>'changedSquareCount')::integer then
    raise exception 'CORRECTION_COUNT_MISMATCH';
  end if;
  insert into public.scanner_beta_feedback(user_id,feedback_id,scan_id,schema_version,corpus_version,feedback_type,
    training_status,payload_hash,original_fen,corrected_fen,changed_square_count,final_position_confirmed,
    localization_valid,share_image_for_improvement,share_correction_for_improvement,platform,capture_type,
    client_metadata,created_at)
  values(p_user_id,v_feedback_id,v_scan_id,p_feedback->>'schemaVersion',p_feedback->>'corpusVersion',
    p_feedback->>'feedbackType','pending-review',p_payload_hash,p_feedback->>'originalFEN',
    nullif(p_feedback->>'correctedFEN',''),(p_feedback->>'changedSquareCount')::smallint,
    (p_feedback->>'finalPositionConfirmed')::boolean,(p_feedback->>'localizationValid')::boolean,
    (v_consent->>'shareImageForImprovement')::boolean,(v_consent->>'shareCorrectionForImprovement')::boolean,
    nullif(p_feedback->>'platform',''),nullif(p_feedback->>'captureType',''),p_feedback->'clientMetadata',
    (p_feedback->>'createdAt')::timestamptz);
  insert into public.scanner_beta_square_corrections(feedback_id,square,predicted_class,corrected_class,
    original_confidence,occupancy_probability,color_probabilities,piece_type_probabilities,king_auxiliary_probability)
  select v_feedback_id,item->>'square',item->>'predicted',item->>'corrected',
    (item->>'originalConfidence')::real,(item->>'occupancyProbability')::real,item->'colorProbabilities',
    item->'pieceTypeProbabilities',nullif(item->>'kingAuxiliaryProbability','')::real
  from jsonb_array_elements(v_changed) item;
  return query select true, false;
end $$;

create function public.submit_scanner_beta_scan_failure(p_user_id uuid, p_failure jsonb, p_payload_hash text)
returns table(accepted boolean, duplicate boolean)
language plpgsql security definer set search_path = pg_catalog as $$
declare v_feedback_id uuid; v_scan_id uuid; v_prior_hash text; v_prior_user uuid; v_consent jsonb;
begin
  if p_user_id is null then raise exception 'USER_ID_REQUIRED'; end if;
  v_feedback_id := (p_failure->>'feedbackId')::uuid;
  v_scan_id := (p_failure->>'scanId')::uuid;
  perform pg_advisory_xact_lock(hashtextextended(v_scan_id::text,0));
  if p_payload_hash !~ '^[A-F0-9]{64}$' then raise exception 'PAYLOAD_HASH_INVALID'; end if;
  perform 1 from public.scanner_beta_feedback where scan_id=v_scan_id;
  if found then raise exception 'SCAN_DISPOSITION_CONFLICT'; end if;
  select f.payload_hash,f.user_id into v_prior_hash,v_prior_user from public.scanner_beta_scan_failures f
    where f.feedback_id=v_feedback_id or f.scan_id=v_scan_id;
  if found then
    if v_prior_user is distinct from p_user_id then raise exception 'FAILURE_OWNER_CONFLICT'; end if;
    if v_prior_hash <> p_payload_hash then raise exception 'SCAN_FAILURE_ID_CONFLICT'; end if;
    return query select true, true; return;
  end if;
  v_consent := p_failure->'consent';
  insert into public.scanner_beta_scan_failures(user_id,feedback_id,scan_id,schema_version,corpus_version,
    feedback_type,training_status,payload_hash,created_at,model_version,model_checksum,occupancy_threshold,
    image_hash,orientation,failure_stage,error_code,share_image_for_improvement,
    share_correction_for_improvement,platform,capture_type,client_metadata)
  values(p_user_id,v_feedback_id,v_scan_id,p_failure->>'schemaVersion',p_failure->>'corpusVersion',
    p_failure->>'feedbackType','pending-review',p_payload_hash,(p_failure->>'createdAt')::timestamptz,
    p_failure->>'modelVersion',p_failure->>'modelChecksum',(p_failure->>'occupancyThreshold')::numeric,
    p_failure->>'imageHash',p_failure->>'orientation',p_failure->>'failureStage',p_failure->>'errorCode',
    (v_consent->>'shareImageForImprovement')::boolean,(v_consent->>'shareCorrectionForImprovement')::boolean,
    nullif(p_failure->>'platform',''),nullif(p_failure->>'captureType',''),p_failure->'clientMetadata');
  return query select true, false;
end $$;

create function public.get_scanner_beta_activity_summary(p_user_id uuid)
returns table(
  attempted bigint, completed bigint, confirmed_correct bigint, corrected bigint,
  localization_failures bigint, scan_failures bigint, pending bigint,
  completed_today bigint, completed_this_week bigint, completed_all_time bigint)
language sql stable security invoker set search_path = pg_catalog as $$
  with final_dispositions as (
    select f.scan_id,f.feedback_type,f.submitted_at
      from public.scanner_beta_feedback f where f.user_id=p_user_id
    union all
    select x.scan_id,'SCAN_FAILURE'::text,x.submitted_at
      from public.scanner_beta_scan_failures x where x.user_id=p_user_id
  )
  select
    (select count(distinct s.scan_id) from public.scanner_beta_scans s where s.user_id=p_user_id),
    count(distinct d.scan_id),
    count(distinct d.scan_id) filter (where d.feedback_type='CONFIRMED_CORRECT'),
    count(distinct d.scan_id) filter (where d.feedback_type='PIECE_CORRECTION'),
    count(distinct d.scan_id) filter (where d.feedback_type='LOCALIZATION_FAILURE'),
    count(distinct d.scan_id) filter (where d.feedback_type='SCAN_FAILURE'),
    (select count(distinct s.scan_id) from public.scanner_beta_scans s
      where s.user_id=p_user_id and not exists (select 1 from final_dispositions d where d.scan_id=s.scan_id)),
    count(distinct d.scan_id) filter (where d.submitted_at >= date_trunc('day',now())),
    count(distinct d.scan_id) filter (where d.submitted_at >= date_trunc('week',now())),
    count(distinct d.scan_id)
  from final_dispositions d;
$$;

revoke all on function public.submit_scanner_beta_scan(uuid,jsonb,text,jsonb),
  public.submit_scanner_beta_feedback(uuid,jsonb,text),
  public.submit_scanner_beta_scan_failure(uuid,jsonb,text),
  public.get_scanner_beta_activity_summary(uuid) from public, anon, authenticated;
revoke all on function private.scanner_beta_activity_scope_immutable() from public, anon, authenticated;
grant execute on function public.submit_scanner_beta_scan(uuid,jsonb,text,jsonb),
  public.submit_scanner_beta_feedback(uuid,jsonb,text),
  public.submit_scanner_beta_scan_failure(uuid,jsonb,text),
  public.get_scanner_beta_activity_summary(uuid) to service_role;

commit;
