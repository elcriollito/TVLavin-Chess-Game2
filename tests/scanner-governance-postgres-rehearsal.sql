\set ON_ERROR_STOP on

begin;

insert into public.users(id) values
  ('11111111-1111-4111-8111-111111111111'),
  ('22222222-2222-4222-8222-222222222222');

do $$
declare
  reservation record;
begin
  select * into reservation from public.reserve_scanner_public_image_upload(
    '11111111-1111-4111-8111-111111111111',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    'scanner-feedback-improvement-review',
    'caissa-scanner-image-review-consent/1',
    'I_HAVE_RIGHTS_TO_SHARE_FOR_PRIVATE_REVIEW',
    repeat('A', 64), 1024, 'image/jpeg', 900, 1, 12000000, 24000000
  );

  if not reservation.accepted or reservation.duplicate or reservation.object_key <>
    '11111111-1111-4111-8111-111111111111/AA/' || repeat('A', 64) then
    raise exception 'RESERVATION_ASSERTION_FAILED';
  end if;

  select * into reservation from public.reserve_scanner_public_image_upload(
    '11111111-1111-4111-8111-111111111111',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    'scanner-feedback-improvement-review',
    'caissa-scanner-image-review-consent/1',
    'I_HAVE_RIGHTS_TO_SHARE_FOR_PRIVATE_REVIEW',
    repeat('A', 64), 1024, 'image/jpeg', 900, 1, 12000000, 24000000
  );

  if not reservation.accepted or not reservation.duplicate then
    raise exception 'IDEMPOTENCY_ASSERTION_FAILED';
  end if;

  begin
    perform * from public.reserve_scanner_public_image_upload(
      '11111111-1111-4111-8111-111111111111',
      'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      'scanner-feedback-improvement-review',
      'caissa-scanner-image-review-consent/1',
      'I_HAVE_RIGHTS_TO_SHARE_FOR_PRIVATE_REVIEW',
      repeat('B', 64), 1024, 'image/jpeg', 900, 1, 12000000, 24000000
    );
    raise exception 'QUOTA_DID_NOT_FAIL';
  exception when others then
    if sqlerrm <> 'IMAGE_USER_COUNT_QUOTA_EXCEEDED' then
      raise;
    end if;
  end;

  begin
    perform * from public.claim_scanner_public_image_upload(
      '22222222-2222-4222-8222-222222222222',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      repeat('A', 64), 1024, 'image/jpeg'
    );
    raise exception 'OWNERSHIP_DID_NOT_FAIL';
  exception when others then
    if sqlerrm <> 'IMAGE_UPLOAD_GRANT_MISMATCH' then
      raise;
    end if;
  end;
end $$;

do $$
declare
  claim record;
  completed public.scanner_public_image_upload_grants;
begin
  select * into claim from public.claim_scanner_public_image_upload(
    '11111111-1111-4111-8111-111111111111',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    repeat('A', 64), 1024, 'image/jpeg'
  );
  if claim.duplicate or claim.storage_reference is not null then
    raise exception 'CLAIM_ASSERTION_FAILED';
  end if;

  select * into completed from public.complete_scanner_public_image_upload(
    '11111111-1111-4111-8111-111111111111',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'supabase://scanner-public-feedback-images/11111111-1111-4111-8111-111111111111/AA/' || repeat('A', 64)
  );
  if completed.status <> 'uploaded' then
    raise exception 'COMPLETION_ASSERTION_FAILED';
  end if;
end $$;

do $$
declare
  submission record;
begin
  select * into submission from public.submit_scanner_public_feedback_v02(
    '11111111-1111-4111-8111-111111111111',
    jsonb_build_object(
      'feedbackId', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      'feedbackType', 'SCAN_FAILURE',
      'createdAt', '2026-10-26T12:00:00Z',
      'schemaVersion', 'caissa-scanner-public-scan-failure/1',
      'corpusVersion', 'caissa-scanner-public-feedback-v0.1',
      'sourceTrust', 'public_user',
      'certificationStatus', 'raw-unverified',
      'modelVersion', 'caissa-piece-classifier-v0.5-occupancy-recovery',
      'imageHash', repeat('A', 64),
      'localizationValid', false,
      'consent', jsonb_build_object(
        'shareImageForImprovement', true,
        'shareCorrectionForImprovement', true
      ),
      'clientMetadata', jsonb_build_object(
        'localizationVersion', 'caissa-scanner-board-localizer/4'
      )
    ),
    repeat('C', 64),
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    repeat('D', 64)
  );

  if not submission.accepted or submission.duplicate or submission.duplicate_suspected then
    raise exception 'FEEDBACK_ASSERTION_FAILED';
  end if;
  if (select status from public.scanner_public_image_upload_grants
      where upload_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') <> 'bound' then
    raise exception 'BINDING_ASSERTION_FAILED';
  end if;

  begin
    perform public.record_scanner_feedback_certification(jsonb_build_object(
      'feedbackId', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      'action', 'CERTIFY_LOCALIZATION_FAILURE',
      'certifiedBy', '22222222-2222-4222-8222-222222222222',
      'certificationVersion', 'caissa-scanner-owner-certification/1',
      'targetCorpus', 'caissa-scanner-certified-localization-failures',
      'trainingEligible', true,
      'reasonCodes', jsonb_build_array('OWNER_REVIEWED')
    ));
    raise exception 'TRAINING_PERMISSION_DID_NOT_FAIL';
  exception when others then
    if sqlerrm <> 'SEPARATE_TRAINING_PERMISSION_REQUIRED' then
      raise;
    end if;
  end;
end $$;

insert into public.scanner_public_training_permissions(
  permission_id, feedback_id, submitted_by, purpose, consent_version,
  rights_attestation, consented_at
) values (
  'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  '11111111-1111-4111-8111-111111111111',
  'scanner-model-training',
  'caissa-scanner-training-consent/1',
  'I_HAVE_RIGHTS_TO_SHARE_FOR_MODEL_TRAINING',
  now()
);

do $$
declare
  certification public.scanner_feedback_certifications;
begin
  select * into certification from public.record_scanner_feedback_certification(jsonb_build_object(
    'feedbackId', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    'action', 'CERTIFY_LOCALIZATION_FAILURE',
    'certifiedBy', '22222222-2222-4222-8222-222222222222',
    'certificationVersion', 'caissa-scanner-owner-certification/1',
    'targetCorpus', 'caissa-scanner-certified-localization-failures',
    'trainingEligible', true,
    'reasonCodes', jsonb_build_array('OWNER_REVIEWED')
  ));
  if not certification.training_eligible then
    raise exception 'TRAINING_GATE_ASSERTION_FAILED';
  end if;
end $$;

do $$
begin
  if has_table_privilege('anon', 'public.scanner_public_image_upload_grants', 'select')
    or has_table_privilege('authenticated', 'public.scanner_public_image_upload_grants', 'select')
    or not has_table_privilege('service_role', 'public.scanner_public_image_upload_grants', 'select')
    or has_function_privilege(
      'anon',
      'public.reserve_scanner_public_image_upload(uuid,uuid,uuid,text,text,text,text,bigint,text,integer,integer,bigint,bigint)',
      'execute'
    )
    or not has_function_privilege(
      'service_role',
      'public.reserve_scanner_public_image_upload(uuid,uuid,uuid,text,text,text,text,bigint,text,integer,integer,bigint,bigint)',
      'execute'
    ) then
    raise exception 'PRIVILEGE_ASSERTION_FAILED';
  end if;

  if exists (
    select 1 from pg_class
    where relname in ('scanner_public_image_upload_grants', 'scanner_public_training_permissions')
      and (not relrowsecurity or not relforcerowsecurity)
  ) then
    raise exception 'RLS_ASSERTION_FAILED';
  end if;
end $$;

rollback;

\echo 'Scanner governance PostgreSQL rehearsal passed and rolled back.'
