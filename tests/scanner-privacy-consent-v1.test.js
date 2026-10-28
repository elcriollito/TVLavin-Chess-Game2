import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createScannerPublicService } from '../api/_lib/scanner-public-service.js';
import { planScannerImageLifecycle } from '../api/_lib/scanner-governance-lifecycle.js';

const root = new URL('../', import.meta.url);
const read = relative => fs.readFileSync(new URL(relative, root), 'utf8');
const USER_ID = '11111111-1111-4111-8111-111111111111';
const UPLOAD_ID = '22222222-2222-4222-8222-222222222222';
const SCAN_ID = '33333333-3333-4333-8333-333333333333';
const HASH = 'A'.repeat(64);
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

test('consent panel exposes two unchecked independent permissions and an accurate interim disclosure', () => {
  const html = read('scanner/index.html');
  assert.match(html, /Help Improve CAISSA Scanner/);
  assert.match(html, /id="shareCorrectionConsent" type="checkbox"(?![^>]*checked)/);
  assert.match(html, /id="shareImageConsent" type="checkbox"(?![^>]*checked)/);
  assert.match(html, />Continue</);
  assert.match(html, />Not now</);
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
