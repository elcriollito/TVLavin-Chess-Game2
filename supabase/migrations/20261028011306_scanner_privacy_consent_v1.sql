-- CAISSAScannerPrivacyConsent@1.0.0
-- Additive release artifact. Requires 20261026100419_scanner_public_consent_governance_v02.sql.
-- Do not apply to production without the Scanner Privacy Consent release gate.
begin;

alter table public.scanner_public_image_upload_grants
  alter column feedback_id drop not null,
  add column if not exists scan_id uuid,
  add column if not exists consent_source text;

alter table public.scanner_public_image_upload_grants
  drop constraint scanner_public_image_upload_grants_purpose_check;
alter table public.scanner_public_image_upload_grants
  add constraint scanner_public_image_upload_grants_purpose_check
  check (purpose in ('scanner-feedback-improvement-review','scanner-photo-improvement-review'));

update public.scanner_public_image_upload_grants as grant_row
set scan_id = feedback.scan_id,
    consent_source = coalesce(grant_row.consent_source, 'legacy-feedback-sheet')
from public.scanner_public_feedback_raw as feedback
where grant_row.feedback_id = feedback.feedback_id
  and (grant_row.scan_id is null or grant_row.consent_source is null);

alter table public.scanner_public_image_upload_grants
  add constraint scanner_public_image_grants_scan_required_v1
  check (scan_id is not null) not valid,
  add constraint scanner_public_image_grants_consent_source_v1
  check (consent_source in ('scanner-review-consent-panel','legacy-feedback-sheet')) not valid;

create table public.scanner_public_consent_records (
  consent_id uuid primary key,
  submitted_by uuid not null references public.users(id) on delete restrict,
  scan_id uuid not null,
  feedback_id uuid references public.scanner_public_feedback_raw(feedback_id) on delete restrict,
  upload_id uuid references public.scanner_public_image_upload_grants(upload_id) on delete restrict,
  permission text not null check (permission in ('recognition-results','original-photo')),
  purpose text not null check (purpose in (
    'scanner-recognition-improvement-review',
    'scanner-photo-improvement-review'
  )),
  consent_version text not null check (consent_version in (
    'caissa-scanner-results-consent/1',
    'caissa-scanner-image-review-consent/1'
  )),
  choice boolean not null check (choice is true),
  consent_source text not null check (consent_source = 'scanner-review-consent-panel'),
  consented_at timestamptz not null default now(),
  withdrawn_at timestamptz,
  withdrawal_source text,
  metadata jsonb not null default '{}'::jsonb,
  check (
    (permission = 'recognition-results'
      and purpose = 'scanner-recognition-improvement-review'
      and consent_version = 'caissa-scanner-results-consent/1'
      and feedback_id is not null
      and upload_id is null)
    or
    (permission = 'original-photo'
      and purpose = 'scanner-photo-improvement-review'
      and consent_version = 'caissa-scanner-image-review-consent/1'
      and upload_id is not null)
  ),
  check (
    (withdrawn_at is null and withdrawal_source is null)
    or (withdrawn_at is not null and withdrawal_source in (
      'privacy-email-verified','account-request-verified','administrative-legal'
    ))
  ),
  unique (submitted_by, scan_id, permission, consent_version)
);

create index scanner_public_consent_owner_idx
  on public.scanner_public_consent_records(submitted_by, consented_at desc);
create index scanner_public_consent_scan_idx
  on public.scanner_public_consent_records(scan_id, permission);
create index scanner_public_consent_withdrawal_idx
  on public.scanner_public_consent_records(permission, withdrawn_at, consented_at);
create index scanner_public_consent_feedback_idx
  on public.scanner_public_consent_records(feedback_id)
  where feedback_id is not null;
create index scanner_public_consent_upload_idx
  on public.scanner_public_consent_records(upload_id)
  where upload_id is not null;

alter table public.scanner_public_consent_records enable row level security;
alter table public.scanner_public_consent_records force row level security;
revoke all on public.scanner_public_consent_records from public, anon, authenticated;
grant select, insert, update on public.scanner_public_consent_records to service_role;

create or replace function private.enforce_scanner_consent_history()
returns trigger language plpgsql security definer set search_path = pg_catalog as $$
begin
  if new.consent_id <> old.consent_id
    or new.submitted_by <> old.submitted_by
    or new.scan_id <> old.scan_id
    or new.feedback_id is distinct from old.feedback_id
    or new.upload_id is distinct from old.upload_id
    or new.permission <> old.permission
    or new.purpose <> old.purpose
    or new.consent_version <> old.consent_version
    or new.choice <> old.choice
    or new.consent_source <> old.consent_source
    or new.consented_at <> old.consented_at
    or new.metadata <> old.metadata then
    raise exception 'SCANNER_CONSENT_IMMUTABLE';
  end if;
  if old.withdrawn_at is not null
    and (new.withdrawn_at is distinct from old.withdrawn_at
      or new.withdrawal_source is distinct from old.withdrawal_source) then
    raise exception 'SCANNER_CONSENT_WITHDRAWAL_IMMUTABLE';
  end if;
  return new;
end $$;

create trigger scanner_public_consent_history_guard
before update on public.scanner_public_consent_records
for each row execute function private.enforce_scanner_consent_history();

create or replace function public.reserve_scanner_public_image_upload_v03(
  p_user_id uuid,
  p_upload_id uuid,
  p_scan_id uuid,
  p_feedback_id uuid,
  p_purpose text,
  p_consent_version text,
  p_consent_source text,
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
  if p_user_id is null or p_upload_id is null or p_scan_id is null then
    raise exception 'IMAGE_CONSENT_IDENTIFIERS_REQUIRED';
  end if;
  if p_ttl_seconds < 60 or p_ttl_seconds > 3600
    or p_user_max_active_uploads < 1 or p_user_max_active_uploads > 100
    or p_user_max_bytes < 1 or p_project_max_bytes < 1 then
    raise exception 'IMAGE_GOVERNANCE_CONFIG_INVALID';
  end if;
  if p_purpose <> 'scanner-photo-improvement-review'
    or p_consent_version <> 'caissa-scanner-image-review-consent/1'
    or p_consent_source <> 'scanner-review-consent-panel'
    or p_rights_attestation <> 'I_HAVE_RIGHTS_TO_SHARE_FOR_PRIVATE_REVIEW'
    or p_image_hash !~ '^[A-F0-9]{64}$'
    or p_byte_size < 1 or p_byte_size > 12000000
    or p_content_type not in ('image/jpeg','image/png','image/webp') then
    raise exception 'IMAGE_CONSENT_CONTRACT_INVALID';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('scanner-public-image-project', 0));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('scanner-public-image-user:' || p_user_id::text, 0));
  v_expires := now() + pg_catalog.make_interval(secs => p_ttl_seconds);

  select * into v_existing from public.scanner_public_image_upload_grants
    where scanner_public_image_upload_grants.upload_id = p_upload_id
       or (scanner_public_image_upload_grants.submitted_by = p_user_id
         and scanner_public_image_upload_grants.scan_id = p_scan_id
         and scanner_public_image_upload_grants.consent_version = p_consent_version)
    for update;
  if found then
    if v_existing.submitted_by <> p_user_id
      or v_existing.scan_id <> p_scan_id
      or v_existing.feedback_id is distinct from p_feedback_id
      or v_existing.purpose <> p_purpose
      or v_existing.consent_version <> p_consent_version
      or v_existing.consent_source <> p_consent_source
      or v_existing.rights_attestation <> p_rights_attestation
      or v_existing.image_hash <> p_image_hash
      or v_existing.byte_size <> p_byte_size
      or v_existing.content_type <> p_content_type then
      raise exception 'IMAGE_UPLOAD_IMMUTABLE_CONFLICT';
    end if;
    if v_existing.status = 'revoked' then
      raise exception 'IMAGE_UPLOAD_GRANT_INACTIVE';
    end if;
    if v_existing.status in ('failed','expired') or v_existing.expires_at <= now() then
      select count(*), coalesce(sum(byte_size), 0) into v_user_count, v_user_bytes
        from public.scanner_public_image_upload_grants as retry_grant
        where retry_grant.submitted_by = p_user_id
          and retry_grant.upload_id <> v_existing.upload_id
          and retry_grant.status in ('reserved','uploading','uploaded','bound');
      select coalesce(sum(byte_size), 0) into v_project_bytes
        from public.scanner_public_image_upload_grants as retry_grant
        where retry_grant.upload_id <> v_existing.upload_id
          and retry_grant.status in ('reserved','uploading','uploaded','bound');
      if v_user_count >= p_user_max_active_uploads then raise exception 'IMAGE_USER_COUNT_QUOTA_EXCEEDED'; end if;
      if v_user_bytes + p_byte_size > p_user_max_bytes then raise exception 'IMAGE_USER_BYTES_QUOTA_EXCEEDED'; end if;
      if v_project_bytes + p_byte_size > p_project_max_bytes then raise exception 'IMAGE_PROJECT_BYTES_QUOTA_EXCEEDED'; end if;
      update public.scanner_public_image_upload_grants as retry_grant set
        status = 'reserved', expires_at = v_expires, storage_reference = null,
        uploaded_at = null, bound_at = null, failure_code = null
        where retry_grant.upload_id = v_existing.upload_id;
      return query select true, false, v_existing.upload_id, v_expires, v_existing.object_key;
      return;
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

  -- Keep the object address compatible with the append-only v01 feedback
  -- evidence contract, which verifies that the sixth path segment is the
  -- image hash. scan_id and upload_id remain explicit relational bindings.
  v_object_key := p_user_id::text || '/' || left(p_image_hash, 2) || '/' || p_image_hash;
  insert into public.scanner_public_image_upload_grants(
    upload_id, feedback_id, scan_id, submitted_by, expires_at, purpose, consent_version,
    consent_source, rights_attestation, image_hash, byte_size, content_type, object_key
  ) values (
    p_upload_id, p_feedback_id, p_scan_id, p_user_id, v_expires, p_purpose, p_consent_version,
    p_consent_source, p_rights_attestation, p_image_hash, p_byte_size, p_content_type, v_object_key
  );
  insert into public.scanner_public_consent_records(
    consent_id, submitted_by, scan_id, upload_id, permission, purpose,
    consent_version, choice, consent_source, metadata
  ) values (
    pg_catalog.gen_random_uuid(), p_user_id, p_scan_id, p_upload_id, 'original-photo',
    p_purpose, p_consent_version, true, p_consent_source,
    pg_catalog.jsonb_build_object('rightsAttestation', p_rights_attestation)
  );
  return query select true, false, p_upload_id, v_expires, v_object_key;
end $$;

create or replace function public.complete_scanner_public_image_upload_v03(
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
    status = case when feedback_id is null then 'bound' else 'uploaded' end,
    storage_reference = p_storage_reference,
    uploaded_at = now(),
    bound_at = case when feedback_id is null then now() else null end
    where upload_id = p_upload_id returning * into v_grant;
  return v_grant;
end $$;

create or replace function public.submit_scanner_public_feedback_v03(
  p_user_id uuid,
  p_feedback jsonb,
  p_payload_hash text,
  p_image_upload_id uuid,
  p_evidence_fingerprint text,
  p_results_consent_version text,
  p_consent_source text
) returns table(accepted boolean, duplicate boolean, duplicate_suspected boolean)
language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_grant public.scanner_public_image_upload_grants;
  v_result record;
  v_reference text;
  v_feedback_id uuid;
  v_scan_id uuid;
begin
  v_feedback_id := (p_feedback->>'feedbackId')::uuid;
  v_scan_id := (p_feedback->>'scanId')::uuid;
  if coalesce((p_feedback->'consent'->>'shareCorrectionForImprovement')::boolean, false) is not true
    or p_results_consent_version <> 'caissa-scanner-results-consent/1'
    or p_consent_source <> 'scanner-review-consent-panel' then
    raise exception 'RESULTS_CONSENT_REQUIRED';
  end if;

  if p_image_upload_id is not null then
    select * into v_grant from public.scanner_public_image_upload_grants
      where upload_id = p_image_upload_id for update;
    if not found or v_grant.submitted_by <> p_user_id
      or v_grant.feedback_id <> v_feedback_id
      or v_grant.scan_id <> v_scan_id
      or v_grant.image_hash <> p_feedback->>'imageHash'
      or v_grant.status not in ('uploaded','bound')
      or v_grant.purpose <> 'scanner-photo-improvement-review'
      or v_grant.consent_version <> 'caissa-scanner-image-review-consent/1'
      or v_grant.consent_source <> p_consent_source
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
  insert into public.scanner_public_consent_records(
    consent_id, submitted_by, scan_id, feedback_id, permission, purpose,
    consent_version, choice, consent_source
  ) values (
    pg_catalog.gen_random_uuid(), p_user_id, v_scan_id, v_feedback_id,
    'recognition-results', 'scanner-recognition-improvement-review',
    p_results_consent_version, true, p_consent_source
  ) on conflict (submitted_by, scan_id, permission, consent_version) do nothing;
  if p_image_upload_id is not null and v_grant.status = 'uploaded' then
    update public.scanner_public_image_upload_grants set status = 'bound', bound_at = now()
      where upload_id = p_image_upload_id;
  end if;
  return query select v_result.accepted, v_result.duplicate, v_result.duplicate_suspected;
end $$;

revoke all on function public.reserve_scanner_public_image_upload_v03(uuid,uuid,uuid,uuid,text,text,text,text,text,bigint,text,integer,integer,bigint,bigint) from public, anon, authenticated;
revoke all on function public.complete_scanner_public_image_upload_v03(uuid,uuid,text) from public, anon, authenticated;
revoke all on function public.submit_scanner_public_feedback_v03(uuid,jsonb,text,uuid,text,text,text) from public, anon, authenticated;
revoke all on function private.enforce_scanner_consent_history() from public, anon, authenticated;
grant execute on function
  public.reserve_scanner_public_image_upload_v03(uuid,uuid,uuid,uuid,text,text,text,text,text,bigint,text,integer,integer,bigint,bigint),
  public.complete_scanner_public_image_upload_v03(uuid,uuid,text),
  public.submit_scanner_public_feedback_v03(uuid,jsonb,text,uuid,text,text,text)
to service_role;

commit;
