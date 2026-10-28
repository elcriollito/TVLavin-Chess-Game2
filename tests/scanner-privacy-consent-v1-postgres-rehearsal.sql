\set ON_ERROR_STOP on

begin;

insert into public.users(id, clerk_id) values
  ('31111111-1111-4111-8111-111111111111', 'scanner_privacy_rehearsal_1'),
  ('32222222-2222-4222-8222-222222222222', 'scanner_privacy_rehearsal_2');

do $$
declare
  scan_submission record;
  photo_reservation record;
  photo_claim record;
  photo_completion public.scanner_public_image_upload_grants;
begin
  select * into scan_submission from public.submit_scanner_public_scan(
    '31111111-1111-4111-8111-111111111111',
    jsonb_build_object(
      'scanId', '33333333-3333-4333-8333-333333333333',
      'timestamp', '2026-10-28T01:30:00Z',
      'modelVersion', 'caissa-piece-classifier-v0.5-occupancy-recovery',
      'modelChecksum', '90D06A3C1AAC934188CBA5EEB4B68D51AC64C815351BFE372F2215101DD7209E',
      'occupancyThreshold', 0.99,
      'imageHash', repeat('A', 64)
    ),
    repeat('B', 64),
    jsonb_build_object('localizationVersion', 'caissa-scanner-board-localizer/4')
  );
  if not scan_submission.accepted or scan_submission.duplicate then
    raise exception 'SCAN_SUBMISSION_ASSERTION_FAILED';
  end if;

  -- Photo-only consent: no feedback ID is needed and no feedback row is made.
  select * into photo_reservation from public.reserve_scanner_public_image_upload_v03(
    '31111111-1111-4111-8111-111111111111',
    '34444444-4444-4444-8444-444444444444',
    '33333333-3333-4333-8333-333333333333',
    null,
    'scanner-photo-improvement-review',
    'caissa-scanner-image-review-consent/1',
    'scanner-review-consent-panel',
    'I_HAVE_RIGHTS_TO_SHARE_FOR_PRIVATE_REVIEW',
    repeat('A', 64), 2048, 'image/jpeg', 900, 4, 12000000, 24000000
  );
  if not photo_reservation.accepted or photo_reservation.duplicate
    or photo_reservation.object_key <> '31111111-1111-4111-8111-111111111111/AA/' || repeat('A', 64) then
    raise exception 'PHOTO_ONLY_RESERVATION_ASSERTION_FAILED';
  end if;

  select * into photo_claim from public.claim_scanner_public_image_upload(
    '31111111-1111-4111-8111-111111111111',
    photo_reservation.upload_id, repeat('A', 64), 2048, 'image/jpeg'
  );
  select * into photo_completion from public.complete_scanner_public_image_upload_v03(
    '31111111-1111-4111-8111-111111111111',
    photo_reservation.upload_id,
    'supabase://scanner-public-feedback-images/' || photo_reservation.object_key
  );
  if photo_completion.status <> 'bound' or photo_completion.feedback_id is not null then
    raise exception 'PHOTO_ONLY_COMPLETION_ASSERTION_FAILED';
  end if;
  if (select count(*) from public.scanner_public_feedback_raw) <> 0
    or (select count(*) from public.scanner_public_consent_records
        where permission = 'original-photo' and feedback_id is null) <> 1 then
    raise exception 'PHOTO_ONLY_INDEPENDENCE_ASSERTION_FAILED';
  end if;
end $$;

do $$
declare
  reservation record;
  claim record;
  retry_reservation record;
begin
  perform * from public.submit_scanner_public_scan(
    '31111111-1111-4111-8111-111111111111',
    jsonb_build_object(
      'scanId', '3bbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      'timestamp', '2026-10-28T01:30:30Z',
      'modelVersion', 'caissa-piece-classifier-v0.5-occupancy-recovery',
      'modelChecksum', '90D06A3C1AAC934188CBA5EEB4B68D51AC64C815351BFE372F2215101DD7209E',
      'occupancyThreshold', 0.99,
      'imageHash', repeat('9', 64)
    ),
    repeat('8', 64),
    jsonb_build_object('localizationVersion', 'caissa-scanner-board-localizer/4')
  );
  select * into reservation from public.reserve_scanner_public_image_upload_v03(
    '31111111-1111-4111-8111-111111111111',
    '39999999-9999-4999-8999-999999999999',
    '3bbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    null,
    'scanner-photo-improvement-review',
    'caissa-scanner-image-review-consent/1',
    'scanner-review-consent-panel',
    'I_HAVE_RIGHTS_TO_SHARE_FOR_PRIVATE_REVIEW',
    repeat('9', 64), 1024, 'image/webp', 900, 4, 12000000, 24000000
  );
  select * into claim from public.claim_scanner_public_image_upload(
    '31111111-1111-4111-8111-111111111111',
    reservation.upload_id, repeat('9', 64), 1024, 'image/webp'
  );
  perform public.fail_scanner_public_image_upload(
    '31111111-1111-4111-8111-111111111111', reservation.upload_id, 'NETWORK_INTERRUPTED'
  );
  select * into retry_reservation from public.reserve_scanner_public_image_upload_v03(
    '31111111-1111-4111-8111-111111111111',
    '3aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    '3bbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    null,
    'scanner-photo-improvement-review',
    'caissa-scanner-image-review-consent/1',
    'scanner-review-consent-panel',
    'I_HAVE_RIGHTS_TO_SHARE_FOR_PRIVATE_REVIEW',
    repeat('9', 64), 1024, 'image/webp', 900, 4, 12000000, 24000000
  );
  if retry_reservation.duplicate
    or retry_reservation.upload_id <> reservation.upload_id
    or (select status from public.scanner_public_image_upload_grants
        where upload_id = reservation.upload_id) <> 'reserved'
    or (select count(*) from public.scanner_public_consent_records
        where scan_id = '3bbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
          and permission = 'original-photo') <> 1 then
    raise exception 'FAILED_UPLOAD_RETRY_ASSERTION_FAILED';
  end if;
end $$;

do $$
declare
  results_submission record;
  feedback jsonb;
begin
  feedback := jsonb_build_object(
    'feedbackId', '35555555-5555-4555-8555-555555555555',
    'scanId', '33333333-3333-4333-8333-333333333333',
    'feedbackType', 'CONFIRMED_CORRECT',
    'createdAt', '2026-10-28T01:31:00Z',
    'schemaVersion', 'caissa-scanner-public-feedback/1',
    'corpusVersion', 'caissa-scanner-public-feedback-v0.1',
    'sourceTrust', 'public_user',
    'certificationStatus', 'raw-unverified',
    'modelVersion', 'caissa-piece-classifier-v0.5-occupancy-recovery',
    'imageHash', repeat('A', 64),
    'consent', jsonb_build_object(
      'shareImageForImprovement', false,
      'shareCorrectionForImprovement', true
    ),
    'clientMetadata', jsonb_build_object(
      'localizationVersion', 'caissa-scanner-board-localizer/4'
    )
  );
  select * into results_submission from public.submit_scanner_public_feedback_v03(
    '31111111-1111-4111-8111-111111111111', feedback, repeat('C', 64), null,
    repeat('D', 64), 'caissa-scanner-results-consent/1', 'scanner-review-consent-panel'
  );
  if not results_submission.accepted or results_submission.duplicate then
    raise exception 'RESULTS_ONLY_SUBMISSION_ASSERTION_FAILED';
  end if;
  if (select count(*) from public.scanner_public_consent_records
      where permission = 'recognition-results'
        and feedback_id = '35555555-5555-4555-8555-555555555555') <> 1 then
    raise exception 'RESULTS_ONLY_CONSENT_ASSERTION_FAILED';
  end if;
end $$;

do $$
declare
  reservation record;
  claim record;
  completion public.scanner_public_image_upload_grants;
  submission record;
  feedback jsonb;
begin
  perform * from public.submit_scanner_public_scan(
    '32222222-2222-4222-8222-222222222222',
    jsonb_build_object(
      'scanId', '36666666-6666-4666-8666-666666666666',
      'timestamp', '2026-10-28T01:32:00Z',
      'modelVersion', 'caissa-piece-classifier-v0.5-occupancy-recovery',
      'modelChecksum', '90D06A3C1AAC934188CBA5EEB4B68D51AC64C815351BFE372F2215101DD7209E',
      'occupancyThreshold', 0.99,
      'imageHash', repeat('E', 64)
    ),
    repeat('F', 64),
    jsonb_build_object('localizationVersion', 'caissa-scanner-board-localizer/4')
  );

  select * into reservation from public.reserve_scanner_public_image_upload_v03(
    '32222222-2222-4222-8222-222222222222',
    '37777777-7777-4777-8777-777777777777',
    '36666666-6666-4666-8666-666666666666',
    '38888888-8888-4888-8888-888888888888',
    'scanner-photo-improvement-review',
    'caissa-scanner-image-review-consent/1',
    'scanner-review-consent-panel',
    'I_HAVE_RIGHTS_TO_SHARE_FOR_PRIVATE_REVIEW',
    repeat('E', 64), 4096, 'image/png', 900, 4, 12000000, 24000000
  );
  select * into claim from public.claim_scanner_public_image_upload(
    '32222222-2222-4222-8222-222222222222',
    reservation.upload_id, repeat('E', 64), 4096, 'image/png'
  );
  select * into completion from public.complete_scanner_public_image_upload_v03(
    '32222222-2222-4222-8222-222222222222',
    reservation.upload_id,
    'supabase://scanner-public-feedback-images/' || reservation.object_key
  );

  feedback := jsonb_build_object(
    'feedbackId', '38888888-8888-4888-8888-888888888888',
    'scanId', '36666666-6666-4666-8666-666666666666',
    'feedbackType', 'CONFIRMED_CORRECT',
    'createdAt', '2026-10-28T01:33:00Z',
    'schemaVersion', 'caissa-scanner-public-feedback/1',
    'corpusVersion', 'caissa-scanner-public-feedback-v0.1',
    'sourceTrust', 'public_user',
    'certificationStatus', 'raw-unverified',
    'modelVersion', 'caissa-piece-classifier-v0.5-occupancy-recovery',
    'imageHash', repeat('E', 64),
    'consent', jsonb_build_object(
      'shareImageForImprovement', true,
      'shareCorrectionForImprovement', true
    ),
    'clientMetadata', jsonb_build_object(
      'localizationVersion', 'caissa-scanner-board-localizer/4'
    )
  );
  select * into submission from public.submit_scanner_public_feedback_v03(
    '32222222-2222-4222-8222-222222222222', feedback, repeat('1', 64),
    reservation.upload_id, repeat('2', 64),
    'caissa-scanner-results-consent/1', 'scanner-review-consent-panel'
  );
  if not submission.accepted or submission.duplicate
    or (select status from public.scanner_public_image_upload_grants
        where upload_id = reservation.upload_id) <> 'bound'
    or (select count(*) from public.scanner_public_consent_records
        where scan_id = '36666666-6666-4666-8666-666666666666') <> 2 then
    raise exception 'BOTH_PERMISSIONS_ASSERTION_FAILED';
  end if;

  -- Identical retry is idempotent and does not duplicate consent history.
  select * into submission from public.submit_scanner_public_feedback_v03(
    '32222222-2222-4222-8222-222222222222', feedback, repeat('1', 64),
    reservation.upload_id, repeat('2', 64),
    'caissa-scanner-results-consent/1', 'scanner-review-consent-panel'
  );
  if not submission.accepted or not submission.duplicate
    or (select count(*) from public.scanner_public_consent_records
        where scan_id = '36666666-6666-4666-8666-666666666666') <> 2 then
    raise exception 'RETRY_IDEMPOTENCY_ASSERTION_FAILED';
  end if;
end $$;

do $$
begin
  if has_table_privilege('anon', 'public.scanner_public_consent_records', 'select')
    or has_table_privilege('authenticated', 'public.scanner_public_consent_records', 'select')
    or not has_table_privilege('service_role', 'public.scanner_public_consent_records', 'select')
    or has_function_privilege(
      'anon',
      'public.reserve_scanner_public_image_upload_v03(uuid,uuid,uuid,uuid,text,text,text,text,text,bigint,text,integer,integer,bigint,bigint)',
      'execute'
    )
    or not has_function_privilege(
      'service_role',
      'public.reserve_scanner_public_image_upload_v03(uuid,uuid,uuid,uuid,text,text,text,text,text,bigint,text,integer,integer,bigint,bigint)',
      'execute'
    ) then
    raise exception 'PRIVILEGE_ASSERTION_FAILED';
  end if;

  if exists (
    select 1 from pg_class
    where relname = 'scanner_public_consent_records'
      and (not relrowsecurity or not relforcerowsecurity)
  ) then
    raise exception 'RLS_ASSERTION_FAILED';
  end if;

  begin
    update public.scanner_public_consent_records
      set purpose = 'scanner-recognition-improvement-review'
      where consent_id = (
        select consent_id from public.scanner_public_consent_records
        where permission = 'original-photo' order by consented_at limit 1
      );
    raise exception 'CONSENT_HISTORY_MUTATION_DID_NOT_FAIL';
  exception when others then
    if sqlerrm <> 'SCANNER_CONSENT_IMMUTABLE' then raise; end if;
  end;
end $$;

do $$
declare v_consent_id uuid;
begin
  select consent_id into v_consent_id
    from public.scanner_public_consent_records
    where permission = 'original-photo'
    order by consented_at
    limit 1;
  update public.scanner_public_consent_records
    set withdrawn_at = now(), withdrawal_source = 'privacy-email-verified'
    where consent_id = v_consent_id;
  if not exists (
    select 1 from public.scanner_public_consent_records
    where consent_id = v_consent_id
      and withdrawn_at is not null
      and withdrawal_source = 'privacy-email-verified'
  ) then
    raise exception 'CONSENT_WITHDRAWAL_ASSERTION_FAILED';
  end if;
end $$;

rollback;

\echo 'Scanner Privacy Consent v1 PostgreSQL rehearsal passed and rolled back.'
