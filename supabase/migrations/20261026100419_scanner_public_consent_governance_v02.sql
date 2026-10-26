-- CAISSAScannerConsentGovernance@0.2.0
-- Additive release artifact only. Do not apply without the Season 2 database gate.
begin;

create table public.scanner_public_image_upload_grants (
  upload_id uuid primary key,
  feedback_id uuid not null unique,
  submitted_by uuid not null references public.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  purpose text not null check (purpose = 'scanner-feedback-improvement-review'),
  consent_version text not null check (consent_version = 'caissa-scanner-image-review-consent/1'),
  rights_attestation text not null check (rights_attestation = 'I_HAVE_RIGHTS_TO_SHARE_FOR_PRIVATE_REVIEW'),
  image_hash text not null check (image_hash ~ '^[A-F0-9]{64}$'),
  byte_size bigint not null check (byte_size > 0 and byte_size <= 12000000),
  content_type text not null check (content_type in ('image/jpeg','image/png','image/webp')),
  status text not null default 'reserved' check (status in (
    'reserved','uploading','uploaded','bound','failed','revoked','expired'
  )),
  object_key text not null unique,
  storage_reference text unique,
  uploaded_at timestamptz,
  bound_at timestamptz,
  failure_code text,
  check (expires_at > created_at),
  check ((status in ('uploaded','bound')) = (storage_reference is not null)),
  check (storage_reference is null or storage_reference = 'supabase://scanner-public-feedback-images/' || object_key)
);

create index scanner_public_image_grants_owner_status_idx
  on public.scanner_public_image_upload_grants(submitted_by, status, expires_at);
create index scanner_public_image_grants_lifecycle_idx
  on public.scanner_public_image_upload_grants(status, expires_at, created_at);

create table public.scanner_public_training_permissions (
  permission_id uuid primary key,
  feedback_id uuid not null references public.scanner_public_feedback_raw(feedback_id) on delete restrict,
  submitted_by uuid not null references public.users(id) on delete restrict,
  purpose text not null check (purpose = 'scanner-model-training'),
  consent_version text not null,
  rights_attestation text not null,
  consented_at timestamptz not null,
  revoked_at timestamptz,
  unique(feedback_id, submitted_by, consent_version)
);

alter table public.scanner_public_image_upload_grants enable row level security;
alter table public.scanner_public_training_permissions enable row level security;
alter table public.scanner_public_image_upload_grants force row level security;
alter table public.scanner_public_training_permissions force row level security;

revoke all on public.scanner_public_image_upload_grants,
  public.scanner_public_training_permissions from public, anon, authenticated;
grant select, insert, update on public.scanner_public_image_upload_grants to service_role;
grant select on public.scanner_public_training_permissions to service_role;

create or replace function public.reserve_scanner_public_image_upload(
  p_user_id uuid,
  p_upload_id uuid,
  p_feedback_id uuid,
  p_purpose text,
  p_consent_version text,
  p_rights_attestation text,
  p_image_hash text,
  p_byte_size bigint,
  p_content_type text,
  p_ttl_seconds integer,
  p_user_max_active_uploads integer,
  p_user_max_bytes bigint,
  p_project_max_bytes bigint
) returns table(accepted boolean, duplicate boolean, upload_id uuid, expires_at timestamptz, object_key text)
language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_existing public.scanner_public_image_upload_grants;
  v_expires timestamptz;
  v_object_key text;
  v_user_count bigint;
  v_user_bytes bigint;
  v_project_bytes bigint;
begin
  if p_ttl_seconds < 60 or p_ttl_seconds > 3600
    or p_user_max_active_uploads < 1 or p_user_max_active_uploads > 100
    or p_user_max_bytes < 1 or p_project_max_bytes < 1 then
    raise exception 'IMAGE_GOVERNANCE_CONFIG_INVALID';
  end if;
  if p_purpose <> 'scanner-feedback-improvement-review'
    or p_consent_version <> 'caissa-scanner-image-review-consent/1'
    or p_rights_attestation <> 'I_HAVE_RIGHTS_TO_SHARE_FOR_PRIVATE_REVIEW'
    or p_image_hash !~ '^[A-F0-9]{64}$'
    or p_byte_size < 1 or p_byte_size > 12000000
    or p_content_type not in ('image/jpeg','image/png','image/webp') then
    raise exception 'IMAGE_CONSENT_CONTRACT_INVALID';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('scanner-public-image-project', 0));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('scanner-public-image-user:' || p_user_id::text, 0));

  select * into v_existing from public.scanner_public_image_upload_grants
    where scanner_public_image_upload_grants.upload_id = p_upload_id
       or scanner_public_image_upload_grants.feedback_id = p_feedback_id
    for update;
  if found then
    if v_existing.upload_id <> p_upload_id or v_existing.feedback_id <> p_feedback_id
      or v_existing.submitted_by <> p_user_id or v_existing.purpose <> p_purpose
      or v_existing.consent_version <> p_consent_version
      or v_existing.rights_attestation <> p_rights_attestation
      or v_existing.image_hash <> p_image_hash or v_existing.byte_size <> p_byte_size
      or v_existing.content_type <> p_content_type then
      raise exception 'IMAGE_UPLOAD_IMMUTABLE_CONFLICT';
    end if;
    if v_existing.status in ('failed','revoked','expired') or v_existing.expires_at <= now() then
      raise exception 'IMAGE_UPLOAD_GRANT_INACTIVE';
    end if;
    return query select true, true, v_existing.upload_id, v_existing.expires_at, v_existing.object_key;
    return;
  end if;

  update public.scanner_public_image_upload_grants as grant_row
    set status = 'expired'
    where grant_row.status in ('reserved','uploading') and grant_row.expires_at <= now();

  select count(*), coalesce(sum(byte_size), 0) into v_user_count, v_user_bytes
    from public.scanner_public_image_upload_grants
    where submitted_by = p_user_id and status in ('reserved','uploading','uploaded','bound');
  select coalesce(sum(byte_size), 0) into v_project_bytes
    from public.scanner_public_image_upload_grants
    where status in ('reserved','uploading','uploaded','bound');
  if v_user_count >= p_user_max_active_uploads then raise exception 'IMAGE_USER_COUNT_QUOTA_EXCEEDED'; end if;
  if v_user_bytes + p_byte_size > p_user_max_bytes then raise exception 'IMAGE_USER_BYTES_QUOTA_EXCEEDED'; end if;
  if v_project_bytes + p_byte_size > p_project_max_bytes then raise exception 'IMAGE_PROJECT_BYTES_QUOTA_EXCEEDED'; end if;

  v_expires := now() + pg_catalog.make_interval(secs => p_ttl_seconds);
  v_object_key := p_user_id::text || '/' || left(p_image_hash, 2) || '/' || p_feedback_id::text || '/' || p_upload_id::text;
  insert into public.scanner_public_image_upload_grants(
    upload_id, feedback_id, submitted_by, expires_at, purpose, consent_version,
    rights_attestation, image_hash, byte_size, content_type, object_key
  ) values (
    p_upload_id, p_feedback_id, p_user_id, v_expires, p_purpose, p_consent_version,
    p_rights_attestation, p_image_hash, p_byte_size, p_content_type, v_object_key
  );
  return query select true, false, p_upload_id, v_expires, v_object_key;
end $$;

create or replace function public.claim_scanner_public_image_upload(
  p_user_id uuid,
  p_upload_id uuid,
  p_image_hash text,
  p_byte_size bigint,
  p_content_type text
) returns table(duplicate boolean, object_key text, storage_reference text)
language plpgsql security definer set search_path = pg_catalog as $$
declare v_grant public.scanner_public_image_upload_grants;
begin
  select * into v_grant from public.scanner_public_image_upload_grants
    where upload_id = p_upload_id for update;
  if not found then raise exception 'IMAGE_UPLOAD_GRANT_NOT_FOUND'; end if;
  if v_grant.submitted_by <> p_user_id or v_grant.image_hash <> p_image_hash
    or v_grant.byte_size <> p_byte_size or v_grant.content_type <> p_content_type then
    raise exception 'IMAGE_UPLOAD_GRANT_MISMATCH';
  end if;
  if v_grant.expires_at <= now() then
    update public.scanner_public_image_upload_grants set status = 'expired' where upload_id = p_upload_id;
    raise exception 'IMAGE_UPLOAD_GRANT_EXPIRED';
  end if;
  if v_grant.status in ('uploaded','bound') then
    return query select true, v_grant.object_key, v_grant.storage_reference; return;
  end if;
  if v_grant.status <> 'reserved' then raise exception 'IMAGE_UPLOAD_GRANT_INACTIVE'; end if;
  update public.scanner_public_image_upload_grants set status = 'uploading' where upload_id = p_upload_id;
  return query select false, v_grant.object_key, null::text;
end $$;

create or replace function public.complete_scanner_public_image_upload(
  p_user_id uuid,
  p_upload_id uuid,
  p_storage_reference text
) returns public.scanner_public_image_upload_grants
language plpgsql security definer set search_path = pg_catalog as $$
declare v_grant public.scanner_public_image_upload_grants;
begin
  select * into v_grant from public.scanner_public_image_upload_grants
    where upload_id = p_upload_id for update;
  if not found or v_grant.submitted_by <> p_user_id then raise exception 'IMAGE_UPLOAD_GRANT_NOT_FOUND'; end if;
  if p_storage_reference <> 'supabase://scanner-public-feedback-images/' || v_grant.object_key then
    raise exception 'IMAGE_STORAGE_REFERENCE_INVALID';
  end if;
  if v_grant.status in ('uploaded','bound') and v_grant.storage_reference = p_storage_reference then return v_grant; end if;
  if v_grant.status <> 'uploading' then raise exception 'IMAGE_UPLOAD_GRANT_INACTIVE'; end if;
  update public.scanner_public_image_upload_grants set
    status = 'uploaded', storage_reference = p_storage_reference, uploaded_at = now()
    where upload_id = p_upload_id returning * into v_grant;
  return v_grant;
end $$;

create or replace function public.fail_scanner_public_image_upload(
  p_user_id uuid,
  p_upload_id uuid,
  p_failure_code text
) returns boolean
language plpgsql security definer set search_path = pg_catalog as $$
begin
  update public.scanner_public_image_upload_grants set
    status = 'failed', failure_code = left(coalesce(p_failure_code, 'UPLOAD_FAILED'), 120)
    where upload_id = p_upload_id and submitted_by = p_user_id and status = 'uploading';
  return found;
end $$;

create or replace function public.submit_scanner_public_feedback_v02(
  p_user_id uuid,
  p_feedback jsonb,
  p_payload_hash text,
  p_image_upload_id uuid,
  p_evidence_fingerprint text
) returns table(accepted boolean, duplicate boolean, duplicate_suspected boolean)
language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_grant public.scanner_public_image_upload_grants;
  v_result record;
  v_reference text;
begin
  if p_image_upload_id is not null then
    select * into v_grant from public.scanner_public_image_upload_grants
      where upload_id = p_image_upload_id for update;
    if not found or v_grant.submitted_by <> p_user_id
      or v_grant.feedback_id <> (p_feedback->>'feedbackId')::uuid
      or v_grant.image_hash <> p_feedback->>'imageHash'
      or v_grant.status not in ('uploaded','bound')
      or v_grant.purpose <> 'scanner-feedback-improvement-review'
      or v_grant.consent_version <> 'caissa-scanner-image-review-consent/1'
      or v_grant.rights_attestation <> 'I_HAVE_RIGHTS_TO_SHARE_FOR_PRIVATE_REVIEW' then
      raise exception 'IMAGE_UPLOAD_BINDING_INVALID';
    end if;
    if coalesce((p_feedback->'consent'->>'shareImageForImprovement')::boolean, false) is not true then
      raise exception 'IMAGE_CONSENT_REQUIRED';
    end if;
    v_reference := v_grant.storage_reference;
  elsif coalesce((p_feedback->'consent'->>'shareImageForImprovement')::boolean, false) is true then
    raise exception 'IMAGE_UPLOAD_GRANT_REQUIRED';
  end if;

  select * into v_result from public.submit_scanner_public_feedback(
    p_user_id, p_feedback, p_payload_hash, v_reference, p_evidence_fingerprint
  );
  if p_image_upload_id is not null and v_grant.status = 'uploaded' then
    update public.scanner_public_image_upload_grants set status = 'bound', bound_at = now()
      where upload_id = p_image_upload_id;
  end if;
  return query select v_result.accepted, v_result.duplicate, v_result.duplicate_suspected;
end $$;

create or replace function private.enforce_scanner_training_permission()
returns trigger language plpgsql security definer set search_path = pg_catalog as $$
begin
  if new.training_eligible and not exists (
    select 1 from public.scanner_public_training_permissions p
    join public.scanner_public_feedback_raw f on f.feedback_id = p.feedback_id
    where p.feedback_id = new.feedback_id and p.submitted_by = f.submitted_by
      and p.purpose = 'scanner-model-training' and p.revoked_at is null
  ) then
    raise exception 'SEPARATE_TRAINING_PERMISSION_REQUIRED';
  end if;
  return new;
end $$;

create trigger scanner_training_permission_gate
before insert on public.scanner_feedback_certifications
for each row execute function private.enforce_scanner_training_permission();

revoke all on function public.reserve_scanner_public_image_upload(uuid,uuid,uuid,text,text,text,text,bigint,text,integer,integer,bigint,bigint) from public, anon, authenticated;
revoke all on function public.claim_scanner_public_image_upload(uuid,uuid,text,bigint,text) from public, anon, authenticated;
revoke all on function public.complete_scanner_public_image_upload(uuid,uuid,text) from public, anon, authenticated;
revoke all on function public.fail_scanner_public_image_upload(uuid,uuid,text) from public, anon, authenticated;
revoke all on function public.submit_scanner_public_feedback_v02(uuid,jsonb,text,uuid,text) from public, anon, authenticated;
revoke all on function private.enforce_scanner_training_permission() from public, anon, authenticated;
grant execute on function
  public.reserve_scanner_public_image_upload(uuid,uuid,uuid,text,text,text,text,bigint,text,integer,integer,bigint,bigint),
  public.claim_scanner_public_image_upload(uuid,uuid,text,bigint,text),
  public.complete_scanner_public_image_upload(uuid,uuid,text),
  public.fail_scanner_public_image_upload(uuid,uuid,text),
  public.submit_scanner_public_feedback_v02(uuid,jsonb,text,uuid,text)
to service_role;

commit;
