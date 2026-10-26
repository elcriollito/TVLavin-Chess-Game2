import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createScannerPublicService } from '../api/_lib/scanner-public-service.js';
import { executeScannerImageLifecycle, planScannerImageLifecycle } from '../api/_lib/scanner-governance-lifecycle.js';

const root = new URL('../', import.meta.url);
const read = relative => fs.readFileSync(new URL(relative, root), 'utf8');
const USER_ID = '11111111-1111-4111-8111-111111111111';
const UPLOAD_ID = '22222222-2222-4222-8222-222222222222';
const FEEDBACK_ID = '33333333-3333-4333-8333-333333333333';
const HASH = 'A'.repeat(64);

function response() {
  return {
    statusCode: null, headers: {}, body: null,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
    end() { return this; }
  };
}

const requestHeaders = { host: 'caissa.test', origin: 'https://caissa.test' };

test('ordinary recognition remains ephemeral and scan persistence requires authentication', async () => {
  const client = read('scanner/public/scanner-public-client.js');
  const recognitionBody = client.slice(client.indexOf('export async function recognizePublicPosition'), client.indexOf('export async function createPublicFailureContext'));
  assert.doesNotMatch(recognitionBody, /api\/scanner\/public\/scan/);

  const service = createScannerPublicService({
    env: { CAISSA_SCANNER_PUBLIC_STAGE: 'public-beta' },
    authenticate: async () => ({ authenticated: false, code: 'AUTH_REQUIRED' })
  });
  const res = response();
  await service.scan({ method: 'POST', headers: requestHeaders, body: {} }, res);
  assert.equal(res.statusCode, 401);
});

test('image sharing fails closed unless all server quota and expiry controls are configured', async () => {
  const service = createScannerPublicService({
    env: { CAISSA_SCANNER_PUBLIC_STAGE: 'public-beta' },
    authenticate: async () => ({ authenticated: true, userId: 'clerk-1' }),
    userStore: { async getUserByClerkId() { return { id: USER_ID }; } },
    rateLimit: () => ({ allowed: true, remaining: 5 })
  });
  const res = response();
  await service.imageConsent({ method: 'POST', headers: requestHeaders, body: {} }, res);
  assert.equal(res.statusCode, 503);
  assert.equal(res.body.error, 'IMAGE_GOVERNANCE_DISABLED');
});

test('server records the complete purpose-bound image grant before accepting bytes', async () => {
  let reserved = null;
  const service = createScannerPublicService({
    env: {
      CAISSA_SCANNER_PUBLIC_STAGE: 'public-beta',
      CAISSA_SCANNER_IMAGE_GRANT_TTL_SECONDS: '900',
      CAISSA_SCANNER_IMAGE_USER_MAX_ACTIVE_UPLOADS: '3',
      CAISSA_SCANNER_IMAGE_USER_MAX_BYTES: '24000000',
      CAISSA_SCANNER_IMAGE_PROJECT_MAX_BYTES: '240000000'
    },
    authenticate: async () => ({ authenticated: true, userId: 'clerk-1' }),
    userStore: { async getUserByClerkId() { return { id: USER_ID }; } },
    rateLimit: () => ({ allowed: true, remaining: 5 }),
    store: { async reserveImageUpload(value) { reserved = value; return { duplicate: false, expires_at: '2026-10-26T18:00:00Z' }; } }
  });
  const res = response();
  await service.imageConsent({ method: 'POST', headers: requestHeaders, body: {
    uploadId: UPLOAD_ID,
    feedbackId: FEEDBACK_ID,
    imageHash: HASH,
    byteSize: 1024,
    contentType: 'image/png',
    purpose: 'scanner-feedback-improvement-review',
    consentVersion: 'caissa-scanner-image-review-consent/1',
    rightsAttestation: 'I_HAVE_RIGHTS_TO_SHARE_FOR_PRIVATE_REVIEW'
  } }, res);
  assert.equal(res.statusCode, 201);
  assert.deepEqual({
    userId: reserved.userId,
    feedbackId: reserved.feedbackId,
    purpose: reserved.purpose,
    consentVersion: reserved.consentVersion,
    rightsAttestation: reserved.rightsAttestation,
    ttlSeconds: reserved.ttlSeconds,
    userMaxActiveUploads: reserved.userMaxActiveUploads
  }, {
    userId: USER_ID,
    feedbackId: FEEDBACK_ID,
    purpose: 'scanner-feedback-improvement-review',
    consentVersion: 'caissa-scanner-image-review-consent/1',
    rightsAttestation: 'I_HAVE_RIGHTS_TO_SHARE_FOR_PRIVATE_REVIEW',
    ttlSeconds: 900,
    userMaxActiveUploads: 3
  });
});

test('client and migration bind upload grants instead of accepting raw storage references', () => {
  const client = read('scanner/public/scanner-public-client.js');
  const service = read('api/_lib/scanner-public-service.js');
  const sql = read('supabase/migrations/20261026100419_scanner_public_consent_governance_v02.sql');
  assert.ok(client.indexOf('/api/scanner/public/image-consent') < client.indexOf("method: 'PUT'"));
  assert.doesNotMatch(client, /imageStorageReference/);
  assert.doesNotMatch(service, /validImageReference/);
  assert.match(sql, /for update/);
  assert.match(sql, /pg_advisory_xact_lock/);
  assert.match(sql, /submit_scanner_public_feedback_v02/);
  assert.match(sql, /SEPARATE_TRAINING_PERMISSION_REQUIRED/);
  assert.doesNotMatch(sql, /to anon|to authenticated/);
});

test('image-rights attestation is separate from image sharing and training remains undisclosed', () => {
  const html = read('scanner/index.html');
  const app = read('scanner/scanner-app.js');
  assert.match(html, /id="sourceImageRightsConsent"/);
  assert.match(html, /private improvement review only, not model training/);
  assert.match(app, /sourceImageRightsConfirmed: els\.sourceImageRights\.checked/);
});

test('orphan cleanup is explicit, bounded, idempotency-keyed, and execution-disabled by default', async () => {
  const plan = planScannerImageLifecycle({
    now: '2026-10-26T12:00:00Z',
    orphanGraceMs: 60_000,
    unboundUploadGraceMs: 120_000,
    maxItems: 2,
    objects: [{ key: 'orphan', createdAt: '2026-10-26T11:00:00Z' }],
    grants: [{ uploadId: UPLOAD_ID, feedbackId: FEEDBACK_ID, objectKey: 'stranded', status: 'uploaded', uploadedAt: '2026-10-26T11:00:00Z' }],
    feedbackIds: []
  });
  assert.equal(plan.mode, 'dry-run');
  assert.equal(plan.candidateCount, 2);
  await assert.rejects(() => executeScannerImageLifecycle(plan, { adapter: {} }), /LIFECYCLE_EXECUTION_DISABLED/);
});

