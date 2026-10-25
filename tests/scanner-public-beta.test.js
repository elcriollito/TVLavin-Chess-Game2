import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  MODEL,
  PUBLIC_FEEDBACK,
  REVIEWER_ENTITLEMENT,
  TARGET_CORPORA,
  canReviewPublicFeedback,
  createPublicFeedbackRecord,
  createPublicPredictionSnapshot,
  eligiblePublicExport,
  feedbackPriority,
  validateCertificationDecision
} from '../scanner/public/scanner-public-contract.js';
import { expandPlacement, squareAt } from '../scanner/beta/scanner-beta-contract.js';
import { createScannerPublicRecognitionService } from '../api/_lib/scanner-public-recognition-service.js';
import { createScannerPublicService } from '../api/_lib/scanner-public-service.js';
import { createScannerFeedbackReviewAuthorizer } from '../api/_lib/scanner-feedback-review-auth.js';
import { createScannerFeedbackReviewService } from '../api/_lib/scanner-feedback-review-service.js';
import { buildPublicFeedbackExport } from '../api/_lib/scanner-public-export.js';

const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');
const FEN = '4k3/8/8/8/8/8/8/4K3 w - - 0 1';
const HASH = 'A'.repeat(64);
const UUIDS = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'];

function prediction() {
  const labels = expandPlacement(FEN);
  return createPublicPredictionSnapshot({
    scanId: UUIDS[0], timestamp: '2026-10-24T12:00:00.000Z', imageHash: HASH,
    orientation: 'white-at-bottom', detectedCorners: [[0, 0], [512, 0], [512, 512], [0, 512]],
    predictedFEN: FEN, modelVersion: MODEL.version, modelChecksum: MODEL.checksum,
    occupancyThreshold: MODEL.occupancyThreshold,
    squarePredictions: labels.map((predictedClass, index) => ({
      square: squareAt(index), predictedClass, confidence: 0.99,
      occupancyProbability: predictedClass === 'empty' ? 0.01 : 0.99,
      colorProbabilities: [0.5, 0.5], pieceTypeProbabilities: [1, 0, 0, 0, 0, 0], kingAuxiliaryProbability: 0.1
    }))
  });
}

function feedback(overrides = {}) {
  return createPublicFeedbackRecord({
    feedbackId: UUIDS[1], snapshot: prediction(), feedbackType: 'CONFIRMED_CORRECT',
    correctedFEN: FEN, finalPositionConfirmed: true, localizationValid: true,
    consent: { shareCorrectionForImprovement: true, shareImageForImprovement: true },
    platform: 'Lichess', captureType: 'gallery', ...overrides
  });
}

function response() {
  return {
    statusCode: null, headers: {}, body: null,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
    end() { return this; }
  };
}

test('public records start raw-unverified in the isolated public corpus', () => {
  const record = feedback();
  assert.equal(record.schemaVersion, PUBLIC_FEEDBACK.schemaVersion);
  assert.equal(record.corpusVersion, 'caissa-scanner-public-feedback-v0.1');
  assert.equal(record.sourceTrust, 'public_user');
  assert.equal(record.certificationStatus, 'raw-unverified');
  assert.equal(record.imageHash, HASH);
  assert.equal('trainingStatus' in record, false);
});

test('review authorization allows owner, admin, and explicit reviewer but denies members and beta tester alone', () => {
  const user = overrides => ({ authenticated: true, role: 'member', entitlements: [], id: 'reviewer', ...overrides });
  assert.equal(canReviewPublicFeedback(user({ role: 'owner' })), true);
  assert.equal(canReviewPublicFeedback(user({ role: 'admin' })), true);
  assert.equal(canReviewPublicFeedback(user({ entitlements: [REVIEWER_ENTITLEMENT] })), true);
  assert.equal(canReviewPublicFeedback(user({ entitlements: ['beta_tester'] })), false);
  assert.equal(canReviewPublicFeedback(user({})), false);
});

test('certification is a separate deliberate decision with strict routing', () => {
  const reviewer = { authenticated: true, id: UUIDS[0], role: 'owner', entitlements: [] };
  const decision = validateCertificationDecision({
    feedbackId: UUIDS[1], action: 'CERTIFY_CLASSIFIER_CORRECTION', trainingEligible: true,
    notes: 'Reviewed square evidence.', reasonCodes: ['high confidence error']
  }, reviewer);
  assert.equal(decision.targetCorpus, TARGET_CORPORA[0]);
  assert.equal(decision.certifiedBy, reviewer.id);
  assert.equal(decision.certificationVersion, 'caissa-scanner-owner-certification/1');
  assert.throws(() => validateCertificationDecision({ feedbackId: UUIDS[1], action: 'HOLD', trainingEligible: true }, reviewer), /TRAINING_ELIGIBILITY/);
  assert.throws(() => validateCertificationDecision({ feedbackId: UUIDS[1], action: 'CERTIFY', trainingEligible: true }, reviewer), /ROUTED_CERTIFICATION/);
  assert.throws(() => validateCertificationDecision({ feedbackId: UUIDS[1], action: 'DUPLICATE' }, reviewer), /DUPLICATE_REFERENCE/);
});

test('priority is review ordering and high-confidence corrections rise without becoming truth', () => {
  const record = feedback({
    feedbackType: 'PIECE_CORRECTION', correctedFEN: '4k3/8/8/8/8/8/5B2/4K3 w - - 0 1'
  });
  assert.equal(feedbackPriority(record), 'high');
  assert.equal(record.certificationStatus, 'raw-unverified');
});

test('governed export requires every certification, consent, image, routing, and duplicate gate', () => {
  const raw = feedback({ feedbackType: 'PIECE_CORRECTION', correctedFEN: '4k3/8/8/8/8/8/5B2/4K3 w - - 0 1' });
  const record = { ...raw, payload: raw, feedbackId: raw.feedbackId,
    imageStorageReference: `supabase://scanner-public-feedback-images/${UUIDS[0]}/AA/${HASH}`,
    evidenceFingerprint: HASH, duplicateSuspected: false };
  const history = [{ action: 'CERTIFY_CLASSIFIER_CORRECTION', trainingEligible: true,
    targetCorpus: TARGET_CORPORA[0], certifiedBy: UUIDS[0], certifiedAt: '2026-10-24T13:00:00Z', certificationVersion: PUBLIC_FEEDBACK.certificationVersion }];
  assert.equal(eligiblePublicExport(record, history), true);
  assert.equal(eligiblePublicExport({ ...record, duplicateSuspected: true }, history), false);
  assert.equal(eligiblePublicExport(record, [{ ...history[0], trainingEligible: false }]), false);
  assert.equal(eligiblePublicExport(record, [{ action: 'DUPLICATE' }, ...history]), false);
  const exported = buildPublicFeedbackExport([{ record, certifications: history }]);
  assert.equal(exported.dryRun, true);
  assert.equal(exported.eligible.length, 1);
});

test('orientation corrections are high-priority localization review and never classifier-training truth', () => {
  const raw = feedback({
    feedbackType: 'PIECE_CORRECTION',
    correctedFEN: '3K4/8/8/8/8/8/8/3k4 w - - 0 1',
    clientMetadata: {
      orientationCorrectionApplied: true,
      orientationDiagnostic: 'CANONICAL_180_ROTATION',
      orientationReviewRequired: true,
      trainingTruthPolicy: 'ORIENTATION_REVIEW_ONLY'
    }
  });
  const record = {
    ...raw,
    payload: raw,
    feedbackId: raw.feedbackId,
    imageStorageReference: `supabase://scanner-public-feedback-images/${UUIDS[0]}/AA/${HASH}`,
    evidenceFingerprint: HASH,
    duplicateSuspected: false
  };
  const history = [{
    action: 'CERTIFY_CLASSIFIER_CORRECTION', trainingEligible: true,
    targetCorpus: TARGET_CORPORA[0], certifiedBy: UUIDS[0],
    certifiedAt: '2026-10-24T13:00:00Z', certificationVersion: PUBLIC_FEEDBACK.certificationVersion
  }];
  assert.equal(feedbackPriority(record), 'high');
  assert.equal(eligiblePublicExport(record, history), false);
  assert.equal(buildPublicFeedbackExport([{ record, certifications: history }]).eligible.length, 0);

  const ambiguous = { ...record, payload: { ...raw, clientMetadata: {
    orientationInferenceVersion: 'caissa-scanner-orientation-inference/1',
    orientationConfidence: 'LOW_AMBIGUOUS',
    userOrientationOverride: false,
    whiteBottomScore: 0.51,
    blackBottomScore: 0.49,
    recommendedOrientation: 'white-bottom',
    orientationEvidence: ['ORIENTATION_EVIDENCE_AMBIGUOUS'],
    finalCanonicalOrientation: 'black-bottom'
  } } };
  assert.equal(feedbackPriority(ambiguous), 'high');
  assert.equal(eligiblePublicExport(ambiguous, history), false);
});

test('public recognition is kill-switched, same-origin, and separately rate limited for guests', async () => {
  let attempts = 0;
  const service = createScannerPublicRecognitionService({
    env: { CAISSA_SCANNER_PUBLIC_STAGE: 'public-beta', CAISSA_SCANNER_PUBLIC_GUEST_RPM: '1' },
    authenticate: async () => ({ authenticated: false, status: 401, code: 'AUTH_REQUIRED' }),
    rateLimit: (_key, policy) => ({ allowed: ++attempts <= policy.max, remaining: Math.max(0, policy.max - attempts) }),
    infer: async () => ({ response: { predictedFEN: FEN }, metrics: { modelLoadMs: 1, inferenceMs: 2 } }),
    log: () => {}
  });
  const req = { method: 'POST', url: '/api/scanner/public/recognize', headers: { host: 'caissa.test', origin: 'https://caissa.test', 'content-type': 'application/json' }, body: {} };
  const first = response(); await service.recognize(req, first); assert.equal(first.statusCode, 200); assert.equal(first.headers['X-RateLimit-Limit'], '1');
  const second = response(); await service.recognize(req, second); assert.equal(second.statusCode, 429); assert.equal(second.body.error, 'RATE_LIMITED');
  const disabled = createScannerPublicRecognitionService({ env: {}, log: () => {} });
  const stopped = response(); await disabled.recognize(req, stopped); assert.equal(stopped.statusCode, 404);

  const invalidCredential = createScannerPublicRecognitionService({
    env: { CAISSA_SCANNER_PUBLIC_STAGE: 'public-beta' },
    authenticate: async () => ({ authenticated: false, status: 401, code: 'INVALID_TOKEN' }),
    infer: async () => { throw new Error('must not infer'); },
    log: () => {}
  });
  const rejected = response();
  await invalidCredential.recognize({ ...req, headers: { ...req.headers, authorization: 'Bearer invalid' } }, rejected);
  assert.equal(rejected.statusCode, 401);
  assert.equal(rejected.body.error, 'AUTH_REQUIRED');
});

test('review authorizer fails closed and beta entitlement alone is denied', async () => {
  const authenticate = async () => ({ authenticated: true, userId: 'clerk-1' });
  const authorizer = createScannerFeedbackReviewAuthorizer({ authenticate, store: {
    async getUserByClerkId() { return { authenticated: true, id: UUIDS[0], role: 'member', entitlements: ['beta_tester'] }; }
  } });
  assert.equal((await authorizer({})).code, 'REVIEWER_ACCESS_DENIED');
  const reviewer = createScannerFeedbackReviewAuthorizer({ authenticate, store: {
    async getUserByClerkId() { return { authenticated: true, id: UUIDS[0], role: 'member', entitlements: [REVIEWER_ENTITLEMENT] }; }
  } });
  assert.equal((await reviewer({})).ok, true);
});

test('public submission rejects invalid credentials and cross-account scan attribution', async () => {
  const invalidCredentialService = createScannerPublicService({
    env: { CAISSA_SCANNER_PUBLIC_STAGE: 'public-beta' },
    authenticate: async () => ({ authenticated: false, code: 'INVALID_TOKEN' })
  });
  const invalid = response();
  await invalidCredentialService.scan({ method: 'POST', headers: {
    host: 'caissa.test', origin: 'https://caissa.test', authorization: 'Bearer invalid'
  }, body: {} }, invalid);
  assert.equal(invalid.statusCode, 401);

  const raw = feedback();
  const ownershipService = createScannerPublicService({
    env: { CAISSA_SCANNER_PUBLIC_STAGE: 'public-beta' },
    authenticate: async () => ({ authenticated: true, userId: 'clerk-1' }),
    userStore: { async getUserByClerkId() { return { id: UUIDS[0] }; } },
    store: { async getScan() { return { snapshot: prediction(), submitted_by: UUIDS[1] }; } }
  });
  const denied = response();
  await ownershipService.feedback({ method: 'POST', headers: {
    host: 'caissa.test', origin: 'https://caissa.test'
  }, body: { feedback: raw } }, denied);
  assert.equal(denied.statusCode, 400);
  assert.equal(denied.body.error, 'FEEDBACK_SCAN_OWNERSHIP_INVALID');
});

test('public mutation endpoints are throttled before accepting evidence', async () => {
  const service = createScannerPublicService({
    env: { CAISSA_SCANNER_PUBLIC_STAGE: 'public-beta' },
    authenticate: async () => ({ authenticated: false, status: 401, code: 'AUTH_REQUIRED' }),
    rateLimit: () => ({ allowed: false, remaining: 0, retryAfter: 27 })
  });
  const limited = response();
  await service.scan({ method: 'POST', headers: { host: 'caissa.test', origin: 'https://caissa.test' }, body: {} }, limited);
  assert.equal(limited.statusCode, 429);
  assert.equal(limited.headers['Retry-After'], '27');
  assert.equal(limited.body.error, 'RATE_LIMITED');
});

test('feedback images must match both their declared format and source scan hash', async () => {
  const user = { authenticated: true, id: UUIDS[0], role: 'member', entitlements: [] };
  const common = {
    env: { CAISSA_SCANNER_PUBLIC_STAGE: 'public-beta' },
    authenticate: async () => ({ authenticated: true, userId: 'clerk-1' }),
    userStore: { async getUserByClerkId() { return user; } },
    rateLimit: () => ({ allowed: true, remaining: 5 })
  };
  let uploaded = false;
  const imageService = createScannerPublicService({ ...common, store: {
    async putImage() { uploaded = true; }
  } });
  const invalidImage = response();
  await imageService.image({ method: 'PUT', headers: {
    host: 'caissa.test', origin: 'https://caissa.test', 'content-type': 'image/png',
    'x-caissa-image-sha256': HASH
  }, body: Buffer.from([0xff, 0xd8, 0xff, 0x00]) }, invalidImage);
  assert.equal(invalidImage.statusCode, 409);
  assert.equal(invalidImage.body.error, 'IMAGE_TYPE_MISMATCH');
  assert.equal(uploaded, false);

  const feedbackService = createScannerPublicService({ ...common, store: {
    async getScan() { return { snapshot: prediction(), submitted_by: UUIDS[0] }; },
    async putFeedback() { throw new Error('must not store mismatched evidence'); }
  } });
  const mismatched = response();
  await feedbackService.feedback({ method: 'POST', headers: {
    host: 'caissa.test', origin: 'https://caissa.test'
  }, body: {
    feedback: feedback(),
    imageStorageReference: `supabase://scanner-public-feedback-images/${UUIDS[0]}/BB/${'B'.repeat(64)}`
  } }, mismatched);
  assert.equal(mismatched.statusCode, 409);
  assert.equal(mismatched.body.error, 'IMAGE_EVIDENCE_HASH_MISMATCH');
});

test('review actions append history and reject classifier/localization cross-contamination', async () => {
  const raw = feedback({ feedbackType: 'PIECE_CORRECTION', correctedFEN: '4k3/8/8/8/8/8/5B2/4K3 w - - 0 1' });
  let saved = null;
  const store = {
    async getFeedback() { return { feedbackId: UUIDS[1], payload: raw, imageStorageReference: 'private', duplicateSuspected: false, certifications: [] }; },
    async addCertification(value) { saved = value; return value; }
  };
  const authorize = async () => ({ ok: true, user: { authenticated: true, id: UUIDS[0], role: 'owner', entitlements: [] } });
  const service = createScannerFeedbackReviewService({ store, authorize });
  const req = { method: 'POST', url: '/api/scanner/feedback-review/action', headers: { host: 'caissa.test', origin: 'https://caissa.test' },
    body: { feedbackId: UUIDS[1], action: 'CERTIFY_CLASSIFIER_CORRECTION', trainingEligible: true } };
  const res = response(); await service.action(req, res);
  assert.equal(res.statusCode, 201); assert.equal(saved.targetCorpus, TARGET_CORPORA[0]);
  const wrong = response(); await service.action({ ...req, body: { ...req.body, action: 'CERTIFY_LOCALIZATION_FAILURE', trainingEligible: false } }, wrong);
  assert.equal(wrong.statusCode, 400); assert.equal(wrong.body.error, 'LOCALIZATION_ROUTING_INVALID');

  store.getFeedback = async () => ({ feedbackId: UUIDS[1], payload: raw, imageStorageReference: 'private',
    duplicateSuspected: false, certifications: [{ action: 'DUPLICATE' }] });
  const blocked = response(); await service.action(req, blocked);
  assert.equal(blocked.statusCode, 400); assert.equal(blocked.body.error, 'TRAINING_ELIGIBILITY_HISTORY_BLOCKED');

  const orientationRaw = feedback({
    feedbackType: 'PIECE_CORRECTION',
    correctedFEN: '3K4/8/8/8/8/8/8/3k4 w - - 0 1',
    clientMetadata: { orientationCorrectionApplied: true }
  });
  store.getFeedback = async () => ({ feedbackId: UUIDS[1], payload: orientationRaw,
    imageStorageReference: 'private', duplicateSuspected: false, certifications: [] });
  const orientationBlocked = response();
  await service.action(req, orientationBlocked);
  assert.equal(orientationBlocked.statusCode, 400);
  assert.equal(orientationBlocked.body.error, 'ORIENTATION_REVIEW_REQUIRED');

  const ambiguousRaw = feedback({
    feedbackType: 'PIECE_CORRECTION',
    correctedFEN: '3K4/8/8/8/8/8/8/3k4 w - - 0 1',
    clientMetadata: { orientationConfidence: 'LOW_AMBIGUOUS', userOrientationOverride: false }
  });
  store.getFeedback = async () => ({ feedbackId: UUIDS[1], payload: ambiguousRaw,
    imageStorageReference: 'private', duplicateSuspected: false, certifications: [] });
  const ambiguousBlocked = response();
  await service.action(req, ambiguousBlocked);
  assert.equal(ambiguousBlocked.statusCode, 400);
  assert.equal(ambiguousBlocked.body.error, 'ORIENTATION_REVIEW_REQUIRED');
});

test('review case-open audit is privileged, same-origin, and explicitly bounded', async () => {
  let event = null;
  const service = createScannerFeedbackReviewService({
    authorize: async () => ({ ok: true, user: { authenticated: true, id: UUIDS[0], role: 'owner', entitlements: [] } }),
    store: { async recordReviewEvent(value) { event = value; return value; } }
  });
  const accepted = response();
  await service.audit({ method: 'POST', headers: { host: 'caissa.test', origin: 'https://caissa.test' },
    body: { feedbackId: UUIDS[1], eventType: 'CASE_OPENED' } }, accepted);
  assert.equal(accepted.statusCode, 201);
  assert.deepEqual(event, { feedbackId: UUIDS[1], reviewerId: UUIDS[0], eventType: 'CASE_OPENED' });
  const rejected = response();
  await service.audit({ method: 'POST', headers: { host: 'caissa.test', origin: 'https://evil.test' },
    body: { feedbackId: UUIDS[1], eventType: 'CASE_OPENED' } }, rejected);
  assert.equal(rejected.statusCode, 403);
});

test('migration makes raw evidence and certification history append-only with private storage and explicit grants', async () => {
  const sql = await read('supabase/migrations/20261024230355_scanner_public_feedback_v01.sql');
  for (const table of ['scanner_public_scans', 'scanner_public_feedback_raw', 'scanner_feedback_certifications', 'scanner_feedback_review_audit']) {
    assert.match(sql, new RegExp(`alter table public\\.${table} force row level security`));
  }
  assert.match(sql, /SCANNER_PUBLIC_EVIDENCE_APPEND_ONLY/);
  assert.match(sql, /before update or delete on public\.scanner_public_feedback_raw/);
  assert.match(sql, /before update or delete on public\.scanner_feedback_certifications/);
  assert.match(sql, /before update or delete on public\.scanner_feedback_review_audit/);
  assert.match(sql, /'CASE_OPENED','CERTIFIED','HELD','EXCLUDED','DUPLICATE','TRAINING_ELIGIBILITY_GRANTED'/);
  assert.match(sql, /revoke all on public\.scanner_public_scans, public\.scanner_public_feedback_raw,[\s\S]*from public, anon, authenticated/);
  assert.match(sql, /'scanner-public-feedback-images',[\s\S]*false/);
  assert.match(sql, /split_part\(p_image_storage_reference,'\/',6\) <> p_feedback->>'imageHash'/);
  assert.match(sql, /grant execute on function[\s\S]*to service_role/);
  assert.doesNotMatch(sql, /to anon|to authenticated/);
});

test('public route is responsive, canonical, environment-aware, QR-based, and preserves the private beta route', async () => {
  const [html, css, vercel, privateBeta] = await Promise.all([
    read('scanner/index.html'), read('scanner/public/scanner-public.css'), read('vercel.json'), read('api/_private/scanner-beta-index.html')
  ]);
  assert.match(html, /Public Beta/); assert.match(html, /id="scannerMobileCta"/);
  assert.match(html, /scanner-handoff\.js/); assert.match(html, /JPEG, PNG, or WebP/); assert.match(html, /HEIC\/HEIF/);
  assert.doesNotMatch(html, /id="scannerCanonicalUrl"[^>]+www\.caissa-chess\.org/);
  assert.match(html, /Review\/Edit remains the required safety step/);
  assert.match(css, /@media\s*\(min-width:\s*1024px\)\s*and\s*\(pointer:\s*fine\)/);
  assert.match(css, /\.app-shell\s*\{[\s\S]*?display:\s*none\s*!important/);
  const config = JSON.parse(vercel); assert.equal(config.rewrites.some(item => item.source === '/scanner/feedback-review'), true);
  assert.match(privateBeta, /INTERNAL BETA/); assert.match(privateBeta, /scanner\/beta\/beta-app\.js/);
});

test('owner review console exposes full orientation diagnostics without public certification controls', async () => {
  const review = await read('scanner/public/feedback-review.js');
  for (const label of ['Original detected orientation', 'Auto orientation', 'Orientation confidence',
    'Orientation score A/B', 'Orientation evidence', 'Human override applied', 'Final canonical orientation']) {
    assert.match(review, new RegExp(label));
  }
  assert.doesNotMatch(review, /public user[^\n]*(?:certif|training)/i);
});

test('public implementation has no automatic learning or online weight update path', async () => {
  const source = await read('scanner/public/scanner-public-client.js');
  assert.doesNotMatch(source, /train\(|fit\(|optimizer|backprop|weight update/i);
  assert.match(source, /api\/scanner\/public\/feedback/);
});
