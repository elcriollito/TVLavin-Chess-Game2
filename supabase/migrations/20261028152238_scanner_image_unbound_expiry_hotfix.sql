begin;

-- Uploaded evidence that never reached an immutable feedback binding must not
-- consume the short-lived active-upload count forever. Its row and private
-- object remain intact for an idempotent feedback retry and still count toward
-- byte quotas until lifecycle cleanup removes them.

create or replace function public.reserve_scanner_public_image_upload_v04(
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

  update public.scanner_public_image_upload_grants as expired_grant
  set status = 'expired',
      failure_code = coalesce(expired_grant.failure_code, 'IMAGE_UPLOAD_GRANT_EXPIRED')
  where expired_grant.expires_at <= now()
    and expired_grant.status in ('reserved','uploading');

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
    if v_existing.status = 'bound' then
      return query select true, true, v_existing.upload_id, v_existing.expires_at, v_existing.object_key;
      return;
    end if;
    if v_existing.status = 'uploaded' and v_existing.storage_reference is not null then
      if v_existing.expires_at <= now() then
        update public.scanner_public_image_upload_grants as retry_grant
          set expires_at = v_expires
          where retry_grant.upload_id = v_existing.upload_id;
        v_existing.expires_at := v_expires;
      end if;
      return query select true, true, v_existing.upload_id, v_existing.expires_at, v_existing.object_key;
      return;
    end if;
    if v_existing.status in ('failed','expired') or v_existing.expires_at <= now() then
      select
        count(*) filter (where retry_grant.status in ('reserved','uploading','uploaded')
          and retry_grant.expires_at > now()),
        coalesce(sum(retry_grant.byte_size) filter
          (where retry_grant.status in ('reserved','uploading','uploaded','bound')), 0)
      into v_user_count, v_user_bytes
      from public.scanner_public_image_upload_grants as retry_grant
      where retry_grant.submitted_by = p_user_id
        and retry_grant.upload_id <> v_existing.upload_id;
      select coalesce(sum(retry_grant.byte_size), 0) into v_project_bytes
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

  select
    count(*) filter (where grant_row.status in ('reserved','uploading','uploaded')
      and grant_row.expires_at > now()),
    coalesce(sum(grant_row.byte_size) filter
      (where grant_row.status in ('reserved','uploading','uploaded','bound')), 0)
  into v_user_count, v_user_bytes
  from public.scanner_public_image_upload_grants as grant_row
  where grant_row.submitted_by = p_user_id;
  select coalesce(sum(grant_row.byte_size), 0) into v_project_bytes
    from public.scanner_public_image_upload_grants as grant_row
    where grant_row.status in ('reserved','uploading','uploaded','bound');
  if v_user_count >= p_user_max_active_uploads then raise exception 'IMAGE_USER_COUNT_QUOTA_EXCEEDED'; end if;
  if v_user_bytes + p_byte_size > p_user_max_bytes then raise exception 'IMAGE_USER_BYTES_QUOTA_EXCEEDED'; end if;
  if v_project_bytes + p_byte_size > p_project_max_bytes then raise exception 'IMAGE_PROJECT_BYTES_QUOTA_EXCEEDED'; end if;

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

revoke all on function public.reserve_scanner_public_image_upload_v04(uuid,uuid,uuid,uuid,text,text,text,text,text,bigint,text,integer,integer,bigint,bigint) from public, anon, authenticated;
grant execute on function public.reserve_scanner_public_image_upload_v04(uuid,uuid,uuid,uuid,text,text,text,text,text,bigint,text,integer,integer,bigint,bigint) to service_role;

commit;
