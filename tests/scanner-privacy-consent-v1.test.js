import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { canonicalFeedbackSnapshot, createScannerPublicService } from '../api/_lib/scanner-public-service.js';
import { createScannerPublicSupabaseStore } from '../api/_lib/scanner-public-store.js';
import { planScannerImageLifecycle } from '../api/_lib/scanner-governance-lifecycle.js';
import { MODEL, createPublicFeedbackRecord, createPublicPredictionSnapshot } from '../scanner/public/scanner-public-contract.js';
import { expandPlacement, squareAt } from '../scanner/beta/scanner-beta-contract.js';
import { publicErrorMessage, publicImageHash, resolvePublicImage } from '../scanner/public/scanner-public-client.js';

const root = new URL('../', import.meta.url);
const read = relative => fs.readFileSync(new URL(relative, root), 'utf8');
const USER_ID = '11111111-1111-4111-8111-111111111111';
const UPLOAD_ID = '22222222-2222-4222-8222-222222222222';
const SCAN_ID = '33333333-3333-4333-8333-333333333333';
const HASH = 'A'.repeat(64);
const RAW_BLACK_BOTTOM_FEN = '5r2/PP4P1/2K3P1/1r6/6p1/2n1p2R/1pp5/1k6 w - - 0 1';
const CANONICAL_BLACK_BOTTOM_FEN = '6k1/5pp1/R2p1n2/1p6/6r1/1P3K2/1P4PP/2r5 w - - 0 1';
const requestHeaders = { host: 'caissa.test', origin: 'https://caissa.test' };

function response() {
  return {
    statusCode: null, headers: {}, body: null,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
    end() { return this; }
  };
}

function configuredEnvironment() {
  return {
    CAISSA_SCANNER_PUBLIC_STAGE: 'public-beta',
    CAISSA_SCANNER_IMAGE_GRANT_TTL_SECONDS: '900',
    CAISSA_SCANNER_IMAGE_USER_MAX_ACTIVE_UPLOADS: '3',
    CAISSA_SCANNER_IMAGE_USER_MAX_BYTES: '24000000',
    CAISSA_SCANNER_IMAGE_PROJECT_MAX_BYTES: '240000000'
  };
}

function blackBottomPrediction() {
  const labels = expandPlacement(RAW_BLACK_BOTTOM_FEN);
  return createPublicPredictionSnapshot({
    scanId: SCAN_ID,
    timestamp: '2026-10-28T13:54:30.000Z',
    imageHash: HASH,
    orientation: 'white-at-bottom',
    detectedCorners: [[0, 0], [512, 0], [512, 512], [0, 512]],
    predictedFEN: RAW_BLACK_BOTTOM_FEN,
    modelVersion: MODEL.version,
    modelChecksum: MODEL.checksum,
    occupancyThreshold: MODEL.occupancyThreshold,
    squarePredictions: labels.map((predictedClass, index) => ({
      square: squareAt(index),
      predictedClass,
      confidence: 0.99,
      occupancyProbability: predictedClass === 'empty' ? 0.01 : 0.99,
      colorProbabilities: [0.5, 0.5],
      pieceTypeProbabilities: [1, 0, 0, 0, 0, 0],
      kingAuxiliaryProbability: 0.1
    }))
  });
}

test('consent panel exposes two unchecked independent permissions and an accurate interim disclosure', () => {
  const html = read('scanner/index.html');
  assert.match(html, /Help Improve CAISSA Scanner/);
  assert.match(html, /id="shareCorrectionConsent" type="checkbox"(?![^>]*checked)/);
  assert.match(html, /id="shareImageConsent" type="checkbox"(?![^>]*checked)/);
  assert.match(html, />Continue</);
  assert.match(html, />Not now</);
  assert.match(html, /id="feedbackImageReselectBtn"/);
  assert.match(html, /id="feedbackImageInput"[^>]*type="file"/);
  assert.match(html, /privacy@caissa-chess\.org/);
  assert.doesNotMatch(html, /href="\/privacy"/);
  assert.match(html, /final Privacy Policy remains subject to its separate publication approval/);
});

test('no-consent path closes the panel without calling persistence and preserves analysis', () => {
  const app = read('scanner/scanner-app.js');
  const send = app.slice(app.indexOf('async function sendPublicFeedback'), app.indexOf('function routeRecognitionResult'));
  assert.match(send, /if \(!shareResults && !shareImage\) \{[\s\S]*declineOptionalContribution\(\)/);
  assert.ok(send.indexOf('declineOptionalContribution()') < send.indexOf('loadPublicClient()'));
  assert.match(app, /els\.handoff\.hidden = false/);
  assert.match(read('scanner/index.html'), /Declining does not block Stockfish analysis/i);
});

test('photo-only consent reserves a standalone private evidence record without forcing feedback', async () => {
  let reserved = null;
  const service = createScannerPublicService({
    env: configuredEnvironment(),
    authenticate: async () => ({ authenticated: true, userId: 'clerk-1' }),
    userStore: { async getUserByClerkId() { return { id: USER_ID }; } },
    rateLimit: () => ({ allowed: true, remaining: 5 }),
    store: { async reserveImageUpload(value) { reserved = value; return { expires_at: '2026-10-28T02:00:00Z' }; } }
  });
  const res = response();
  await service.imageConsent({ method: 'POST', headers: requestHeaders, body: {
    uploadId: UPLOAD_ID,
    scanId: SCAN_ID,
    feedbackId: null,
    imageHash: HASH,
    byteSize: 2048,
    contentType: 'image/png',
    purpose: 'scanner-photo-improvement-review',
    consentVersion: 'caissa-scanner-image-review-consent/1',
    consentSource: 'scanner-review-consent-panel',
    rightsAttestation: 'I_HAVE_RIGHTS_TO_SHARE_FOR_PRIVATE_REVIEW'
  } }, res);
  assert.equal(res.statusCode, 201);
  assert.equal(reserved.feedbackId, null);
  assert.equal(reserved.scanId, SCAN_ID);
  assert.equal(reserved.purpose, 'scanner-photo-improvement-review');
  assert.equal(reserved.consentSource, 'scanner-review-consent-panel');
});

test('v1 migration separates purposes, supports photo-only binding, and keeps training permission independent', () => {
  const sql = read('supabase/migrations/20261028011306_scanner_privacy_consent_v1.sql');
  assert.match(sql, /create table public\.scanner_public_consent_records/);
  assert.match(sql, /permission in \('recognition-results','original-photo'\)/);
  assert.match(sql, /alter column feedback_id drop not null/);
  assert.match(sql, /reserve_scanner_public_image_upload_v03/);
  assert.match(sql, /case when feedback_id is null then 'bound' else 'uploaded' end/);
  assert.match(sql, /status = 'reserved', expires_at = v_expires/);
  assert.match(sql, /v_existing\.status = 'revoked'/);
  assert.match(sql, /submit_scanner_public_feedback_v03/);
  assert.match(sql, /choice boolean not null check \(choice is true\)/);
  assert.match(sql, /withdrawn_at timestamptz/);
  assert.match(sql, /SCANNER_CONSENT_IMMUTABLE/);
  assert.match(sql, /SCANNER_CONSENT_WITHDRAWAL_IMMUTABLE/);
  assert.match(sql, /revoke all on public\.scanner_public_consent_records from public, anon, authenticated/);
  assert.doesNotMatch(sql, /grant (select|insert|update|delete)[^;]+ to anon/);
  const v02 = read('supabase/migrations/20261026100419_scanner_public_consent_governance_v02.sql');
  assert.match(v02, /SEPARATE_TRAINING_PERMISSION_REQUIRED/);
});

test('hotfix 005 excludes stale unbound uploads from active count and preserves idempotent evidence retry', () => {
  const sql = read('supabase/migrations/20261028152238_scanner_image_unbound_expiry_hotfix.sql');
  assert.match(sql, /reserve_scanner_public_image_upload_v04/);
  assert.match(sql, /status in \('reserved','uploading','uploaded'\)[\s\S]*expires_at > now\(\)/);
  const activeCountFilters = [...sql.matchAll(/count\(\*\)\s+filter\s*\(where\s+\w+\.status in \(([^)]*)\)/g)];
  assert.equal(activeCountFilters.length, 2);
  assert.ok(activeCountFilters.every(match => !match[1].includes("'bound'")));
  assert.match(sql, /status = 'uploaded' and v_existing\.storage_reference is not null[\s\S]*set expires_at = v_expires/);
  assert.match(sql, /status = 'bound'[\s\S]*return query select true, true/);
  assert.match(sql, /failure_code = coalesce\([^,]+, 'IMAGE_UPLOAD_GRANT_EXPIRED'\)/);
  assert.match(sql, /revoke all on function public\.reserve_scanner_public_image_upload_v04/);
  assert.match(sql, /grant execute on function public\.reserve_scanner_public_image_upload_v04[^;]+to service_role/);
  assert.match(read('api/_lib/scanner-public-store.js'), /reserve_scanner_public_image_upload_v04/);
});

test('database quota codes remain sanitized and actionable instead of collapsing to P0001', async () => {
  const client = {
    async rpc() {
      return { data: null, error: { code: 'P0001', message: 'IMAGE_USER_COUNT_QUOTA_EXCEEDED' } };
    }
  };
  const store = createScannerPublicSupabaseStore(client);
  await assert.rejects(() => store.reserveImageUpload({
    userId: USER_ID,
    uploadId: UPLOAD_ID,
    scanId: SCAN_ID,
    feedbackId: null,
    purpose: 'scanner-photo-improvement-review',
    consentVersion: 'caissa-scanner-image-review-consent/1',
    consentSource: 'scanner-review-consent-panel',
    rightsAttestation: 'I_HAVE_RIGHTS_TO_SHARE_FOR_PRIVATE_REVIEW',
    imageHash: HASH,
    byteSize: 2048,
    contentType: 'image/png',
    ttlSeconds: 900,
    userMaxActiveUploads: 3,
    userMaxBytes: 24000000,
    projectMaxBytes: 240000000
  }), /IMAGE_USER_COUNT_QUOTA_EXCEEDED/);
  assert.match(publicErrorMessage({ code: 'IMAGE_USER_COUNT_QUOTA_EXCEEDED' }), /upload is still in progress/i);
});

test('expired in-flight uploads are cleanup candidates while completed photo-only evidence is retained', () => {
  const plan = planScannerImageLifecycle({
    now: '2026-10-28T03:00:00Z',
    orphanGraceMs: 60_000,
    unboundUploadGraceMs: 120_000,
    objects: [],
    grants: [
      { uploadId: UPLOAD_ID, objectKey: 'partial', status: 'uploading', expiresAt: '2026-10-28T02:00:00Z' },
      { uploadId: '44444444-4444-4444-8444-444444444444', objectKey: 'photo-only', status: 'bound', expiresAt: '2026-10-28T02:00:00Z' }
    ],
    feedbackIds: []
  });
  assert.deepEqual(plan.candidates, [{
    action: 'delete-expired-upload',
    uploadId: UPLOAD_ID,
    objectKey: 'partial',
    reason: 'upload-completion-not-recorded'
  }]);
});

test('client keeps four consent states distinct and never turns photo consent into training consent', () => {
  const client = read('scanner/public/scanner-public-client.js');
  assert.match(client, /submitOriginalPhotoContribution/);
  assert.match(client, /scanId,\s*null,\s*sourceImageRightsConfirmed/);
  assert.match(client, /trainingEligible:\s*false/);
  assert.match(client, /RESULTS_CONSENT_VERSION = 'caissa-scanner-results-consent\/1'/);
  assert.match(client, /IMAGE_CONSENT_VERSION = 'caissa-scanner-image-review-consent\/1'/);
  assert.doesNotMatch(client, /trainingEligible:\s*true/);
});

test('authenticated feedback handoff is same-origin, explicit, and never stores the original photo', () => {
  const handoff = read('scanner/public/scanner-feedback-auth-handoff.js');
  const app = read('scanner/scanner-app.js');
  assert.match(handoff, /RETURN_PATH = '\/scanner\?feedback_return=1'/);
  assert.match(app, /sessionStorage/);
  assert.doesNotMatch(handoff, /localStorage|sourceFile|photoBytes|accessToken/);
  assert.match(app, /Sign in to share feedback/);
  assert.match(app, /Confirm and share feedback/);
  assert.match(app, /sourceImageRights\.checked = false/);
  assert.match(app, /imageHash\.toLowerCase\(\) !== String\(publicRecognition/);
});

test('physical iPhone black-bottom feedback is revalidated against the canonical server snapshot', async () => {
  const source = blackBottomPrediction();
  const canonical = canonicalFeedbackSnapshot(source);
  assert.equal(canonical.predictedFEN, CANONICAL_BLACK_BOTTOM_FEN);
  assert.equal(canonical.orientation, 'black-at-bottom');

  assert.throws(() => createPublicFeedbackRecord({
    feedbackId: UPLOAD_ID,
    snapshot: source,
    feedbackType: 'CONFIRMED_CORRECT',
    correctedFEN: CANONICAL_BLACK_BOTTOM_FEN,
    finalPositionConfirmed: true,
    localizationValid: true,
    consent: { shareCorrectionForImprovement: true, shareImageForImprovement: true },
    captureType: 'camera'
  }), /CONFIRMED_CORRECT_CHANGED/);

  const feedback = createPublicFeedbackRecord({
    feedbackId: UPLOAD_ID,
    snapshot: canonical,
    feedbackType: 'CONFIRMED_CORRECT',
    correctedFEN: CANONICAL_BLACK_BOTTOM_FEN,
    finalPositionConfirmed: true,
    localizationValid: true,
    consent: { shareCorrectionForImprovement: true, shareImageForImprovement: true },
    captureType: 'camera',
    clientMetadata: { finalCanonicalOrientation: 'black-bottom' }
  });
  let persisted = null;
  const service = createScannerPublicService({
    env: configuredEnvironment(),
    authenticate: async () => ({ authenticated: true, userId: 'clerk-1' }),
    userStore: { async getUserByClerkId() { return { id: USER_ID }; } },
    rateLimit: () => ({ allowed: true, remaining: 5 }),
    store: {
      async getScan() { return { submitted_by: USER_ID, snapshot: source }; },
      async putFeedback(value) { persisted = value; return { duplicate: false, duplicate_suspected: false }; }
    }
  });
  const res = response();
  await service.feedback({
    method: 'POST',
    headers: requestHeaders,
    body: { feedback, imageUploadId: UPLOAD_ID }
  }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(persisted.feedback.originalFEN, CANONICAL_BLACK_BOTTOM_FEN);
  assert.equal(persisted.feedback.certificationStatus, 'raw-unverified');
});

test('mobile image selection distinguishes supported, HEIC, size, read, upload, and feedback failures', async () => {
  const image = (name, type, size = 128, arrayBuffer = async () => new Uint8Array(size).buffer) => ({
    name, type, size, arrayBuffer,
    slice(start, end, nextType) { return { size: end - start, type: nextType }; }
  });
  for (const [name, type] of [['camera.jpg', 'image/jpeg'], ['library.png', 'image/png'], ['share.webp', 'image/webp']]) {
    assert.equal(resolvePublicImage(image(name, type)).sourceImageType, type);
  }
  assert.throws(() => resolvePublicImage(image('camera.heic', 'image/heic')), /UNSUPPORTED_HEIC/);
  assert.throws(() => resolvePublicImage(image('large.jpg', 'image/jpeg', 12_000_001)), /IMAGE_TOO_LARGE/);
  await assert.rejects(() => publicImageHash(image('stale.jpg', 'image/jpeg', 128, async () => { throw new Error('stale'); })), /IMAGE_READ_FAILED/);
  assert.match(publicErrorMessage({ code: 'IMAGE_TOO_LARGE' }), /smaller than 12 MB/);
  assert.match(publicErrorMessage({ code: 'NETWORK_FAILURE' }), /connection/);
  assert.match(publicErrorMessage({ code: 'SCANNER_PUBLIC_IMAGE_ERROR' }), /Private photo upload/);
  assert.match(publicErrorMessage({ code: 'CONFIRMED_CORRECT_CHANGED', photoUploaded: true }), /stored privately/);
});
