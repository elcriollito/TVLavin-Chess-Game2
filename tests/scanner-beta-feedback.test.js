import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  MODEL, aggregateFeedback, createFeedbackRecord, createPredictionSnapshot, createScanFailureRecord, eligibleForTraining,
  expandPlacement, fenDiff, placementFromLabels
} from '../scanner/beta/scanner-beta-contract.js';
import { enqueueSubmission, flushSubmissions, pendingCount } from '../scanner/beta/scanner-beta-queue.js';
import { randomUuid, sha256Hex } from '../scanner/beta/scanner-beta-crypto.js';
import { sha256, stableJson } from '../api/_lib/scanner-beta-policy.js';
import { createScannerBetaService } from '../api/_lib/scanner-beta-service.js';
import { createScannerBetaLocalStore } from '../tools/scanner-beta-feedback/local-store.mjs';

const FEN = '4k3/8/8/8/8/8/8/4K3 w - - 0 1';
const ids = {
  scan: '11111111-1111-4111-8111-111111111111',
  feedback: '22222222-2222-4222-8222-222222222222'
};

function prediction(overrides = {}) {
  const labels = expandPlacement(overrides.predictedFEN || FEN);
  return {
    scanId: ids.scan,
    timestamp: '2026-09-19T12:00:00.000Z',
    modelVersion: MODEL.version,
    modelChecksum: MODEL.checksum,
    occupancyThreshold: MODEL.occupancyThreshold,
    imageHash: 'A'.repeat(64),
    predictedFEN: overrides.predictedFEN || FEN,
    orientation: 'white-at-bottom',
    detectedCorners: [[0, 0], [100, 0], [100, 100], [0, 100]],
    squarePredictions: labels.map((label, index) => ({
      square: String.fromCharCode(97 + index % 8) + String(8 - Math.floor(index / 8)),
      predictedClass: label,
      confidence: .97,
      occupancyProbability: label === 'empty' ? .01 : .999,
      colorProbabilities: [.5, .5],
      pieceTypeProbabilities: [1 / 6, 1 / 6, 1 / 6, 1 / 6, 1 / 6, 1 / 6],
      kingAuxiliaryProbability: label.toLowerCase() === 'k' ? .99 : .01
    })),
    ...overrides
  };
}

const consent = { shareImageForImprovement: true, shareCorrectionForImprovement: true };

test('LAN-safe beta crypto preserves SHA-256 and UUID contracts without a secure context', async () => {
  const bytes = new TextEncoder().encode('abc');
  assert.equal(await sha256Hex(bytes, {}), 'BA7816BF8F01CFEA414140DE5DAE2223B00361A396177A9CB410FF61F20015AD');
  const insecureCrypto = { getRandomValues(target) { target.forEach((_, index) => { target[index] = index; }); return target; } };
  assert.equal(randomUuid(insecureCrypto), '00010203-0405-4607-8809-0a0b0c0d0e0f');
});

test('prediction snapshots are deeply immutable and trace frozen v0.5', () => {
  const snapshot = createPredictionSnapshot(prediction());
  assert.equal(snapshot.modelVersion, MODEL.version);
  assert.equal(snapshot.modelChecksum, MODEL.checksum);
  assert.equal(snapshot.occupancyThreshold, .99);
  assert.ok(Object.isFrozen(snapshot));
  assert.ok(Object.isFrozen(snapshot.squarePredictions[0]));
  assert.throws(() => { snapshot.squarePredictions[0].predictedClass = 'Q'; }, TypeError);
});

test('FEN placement expands to exactly 64 allowed labels and round-trips', () => {
  const labels = expandPlacement(FEN);
  assert.equal(labels.length, 64);
  assert.equal(placementFromLabels(labels), FEN.split(' ')[0]);
  assert.throws(() => expandPlacement('8/8/8/8/8/8/8/7x'), /FEN_PIECE_CLASS/);
  assert.throws(() => expandPlacement('8/8'), /FEN_RANK_COUNT/);
});

test('FEN diff is deterministic and ignores non-placement metadata', () => {
  assert.deepEqual(fenDiff(FEN, '4k3/8/8/8/8/8/8/4K3 b KQ - 9 10'), []);
  assert.deepEqual(fenDiff(FEN, '4k3/8/8/8/8/8/5B2/4K3 w - - 0 1'), [
    { square: 'f2', predicted: 'empty', corrected: 'B' }
  ]);
});

test('confirmed-correct and piece-correction flows derive their own differences', () => {
  const snapshot = createPredictionSnapshot(prediction());
  const exact = createFeedbackRecord({ feedbackId: ids.feedback, snapshot, feedbackType: 'CONFIRMED_CORRECT',
    correctedFEN: FEN, finalPositionConfirmed: true, consent });
  assert.equal(exact.changedSquareCount, 0);
  assert.equal(exact.trainingStatus, 'pending-review');
  const corrected = createFeedbackRecord({ feedbackId: '33333333-3333-4333-8333-333333333333', snapshot,
    feedbackType: 'PIECE_CORRECTION', correctedFEN: '4k3/8/8/8/8/8/5B2/4K3 w - - 0 1',
    finalPositionConfirmed: true, consent });
  assert.equal(corrected.changedSquareCount, 1);
  assert.equal(corrected.changedSquares[0].square, 'f2');
  assert.equal(corrected.changedSquares[0].originalConfidence, .97);
});

test('localization failures cannot become full-board truth', () => {
  const record = createFeedbackRecord({ feedbackId: ids.feedback, snapshot: prediction(),
    feedbackType: 'LOCALIZATION_FAILURE', finalPositionConfirmed: false, localizationValid: false, consent });
  assert.equal(record.localizationValid, false);
  assert.equal(record.correctedFEN, null);
  assert.equal(eligibleForTraining({ ...record, trainingStatus: 'eligible-for-training' }), false);
  const failed = createFeedbackRecord({ feedbackId: '44444444-4444-4444-8444-444444444444', snapshot: prediction(),
    feedbackType: 'SCAN_FAILURE', finalPositionConfirmed: false, localizationValid: true, consent });
  assert.equal(failed.feedbackType, 'SCAN_FAILURE');
  assert.equal(failed.finalPositionConfirmed, false);
});

test('scan failures are durable dispositions without fabricated board truth', async () => {
  const failure = createScanFailureRecord({
    feedbackId: '55555555-5555-4555-8555-555555555555', scanId: '66666666-6666-4666-8666-666666666666',
    timestamp: '2026-09-19T14:00:00Z', imageHash: 'D'.repeat(64), modelVersion: MODEL.version,
    modelChecksum: MODEL.checksum, occupancyThreshold: MODEL.occupancyThreshold, orientation: 'white-at-bottom',
    consent, platform: 'Lichess', captureType: 'camera', failureStage: 'classifier', errorCode: 'CLASSIFIER_UNAVAILABLE'
  });
  assert.equal(failure.feedbackType, 'SCAN_FAILURE');
  assert.equal(failure.originalFEN, null);
  assert.equal(failure.finalPositionConfirmed, false);
  assert.deepEqual(createScanFailureRecord(failure), failure);
  const root = await mkdtemp(join(tmpdir(), 'caissa-scanner-beta-failure-'));
  try {
    const store = createScannerBetaLocalStore({ root });
    const payloadHash = sha256(stableJson(failure));
    assert.deepEqual(await store.putFailure({ failure, payloadHash }), { duplicate: false });
    assert.deepEqual(await store.putFailure({ failure, payloadHash }), { duplicate: true });
    assert.deepEqual(await store.allFeedback(), [failure]);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('final-position and consent gates are mandatory for training eligibility', () => {
  const snapshot = prediction();
  assert.throws(() => createFeedbackRecord({ feedbackId: ids.feedback, snapshot, feedbackType: 'PIECE_CORRECTION',
    correctedFEN: '4k3/8/8/8/8/8/5B2/4K3', finalPositionConfirmed: false, consent }), /FINAL_POSITION_CONFIRMATION_REQUIRED/);
  const record = createFeedbackRecord({ feedbackId: ids.feedback, snapshot, feedbackType: 'CONFIRMED_CORRECT',
    finalPositionConfirmed: true, consent });
  assert.equal(eligibleForTraining(record), false);
  assert.equal(eligibleForTraining({ ...record, trainingStatus: 'eligible-for-training' }), true);
  assert.equal(eligibleForTraining({ ...record, trainingStatus: 'eligible-for-training', consent: { ...consent, shareImageForImprovement: false } }), false);
});

test('local canonical store enforces immutable snapshots and idempotency', async () => {
  const root = await mkdtemp(join(tmpdir(), 'caissa-scanner-beta-'));
  try {
    const store = createScannerBetaLocalStore({ root });
    const snapshot = createPredictionSnapshot(prediction());
    const snapshotHash = sha256(stableJson(snapshot));
    assert.deepEqual(await store.putScan({ snapshot, snapshotHash, metadata: {} }), { duplicate: false });
    assert.deepEqual(await store.putScan({ snapshot, snapshotHash, metadata: {} }), { duplicate: true });
    await assert.rejects(store.putScan({ snapshot: { ...snapshot, timestamp: '2026-09-19T12:01:00Z' }, snapshotHash: 'B'.repeat(64), metadata: {} }), /SNAPSHOT_IMMUTABLE_CONFLICT/);
    const feedback = createFeedbackRecord({ feedbackId: ids.feedback, snapshot, feedbackType: 'CONFIRMED_CORRECT', finalPositionConfirmed: true, consent });
    const payloadHash = sha256(stableJson(feedback));
    assert.deepEqual(await store.putFeedback({ feedback, payloadHash }), { duplicate: false });
    assert.deepEqual(await store.putFeedback({ feedback, payloadHash }), { duplicate: true });
    await assert.rejects(store.putFeedback({ feedback, payloadHash: 'C'.repeat(64) }), /FEEDBACK_ID_CONFLICT/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('server rejects unapproved scan metadata and arbitrary storage references', async () => {
  let stored = false;
  const service = createScannerBetaService({ env: { CAISSA_SCANNER_BETA_STAGE: 'internal' }, authorizeExperiment: async () => ({ ok: true }), store: {
    putScan: async () => { stored = true; return { duplicate: false }; }
  } });
  const invoke = async (metadata) => {
    let result;
    const res = { setHeader() {}, status(status) { return { json(body) { result = { status, body }; } }; } };
    await service.scan({ method: 'POST', headers: {}, body: { snapshot: createPredictionSnapshot(prediction()), metadata } }, res);
    return result;
  };
  assert.equal((await invoke({ platform: 'guessed-from-image' })).body.error, 'PLATFORM_INVALID');
  assert.equal((await invoke({ imageStorageReference: 'C:\\private\\board.png' })).body.error, 'IMAGE_STORAGE_REFERENCE_INVALID');
  assert.equal(stored, false);
});

test('offline queue preserves pending-sync submissions and retries without duplication', async () => {
  const values = new Map();
  const storage = { getItem: (key) => values.get(key) || null, setItem: (key, value) => values.set(key, value) };
  enqueueSubmission({ id: 'one', endpoint: '/feedback', body: { value: 1 } }, storage);
  enqueueSubmission({ id: 'one', endpoint: '/feedback', body: { value: 1 } }, storage);
  assert.equal(pendingCount(storage), 1);
  let online = false;
  assert.deepEqual(await flushSubmissions({ storage, fetcher: async () => ({ ok: online }) }), { synced: 0, pending: 1 });
  online = true;
  assert.deepEqual(await flushSubmissions({ storage, fetcher: async () => ({ ok: online }) }), { synced: 1, pending: 0 });
});

test('report aggregation covers correction bands, confusions, platforms, and models', () => {
  const snapshot = prediction();
  const exact = createFeedbackRecord({ feedbackId: ids.feedback, snapshot, feedbackType: 'CONFIRMED_CORRECT', finalPositionConfirmed: true, consent, platform: 'Chess.com' });
  const correction = createFeedbackRecord({ feedbackId: '33333333-3333-4333-8333-333333333333', snapshot,
    feedbackType: 'PIECE_CORRECTION', correctedFEN: '4k3/8/8/8/8/8/5B2/4K3', finalPositionConfirmed: true, consent, platform: 'Chess.com' });
  const report = aggregateFeedback([exact, correction]);
  assert.equal(report.scans, 1);
  assert.equal(report.exact, 1);
  assert.equal(report.corrected, 1);
  assert.equal(report.correctionHistogram['0'], 1);
  assert.equal(report.correctionHistogram['1'], 1);
  assert.equal(report.pieceErrorMetrics['empty→piece'], 1);
  assert.equal(report.pieceConfusions['empty→B'], 1);
  assert.equal(report.platform['Chess.com'].scans, 2);
  assert.equal(report.platform['Chess.com'].exactBoardRate, .5);
  assert.equal(report.platform['Chess.com'].meanCorrections, .5);
  assert.equal(report.platform['Chess.com'].withinTwoCorrectionRate, 1);
  assert.equal(report.platform['Chess.com'].localizationFailureRate, 0);
  assert.equal(report.platform['Chess.com'].smallSample, true);
  assert.equal(report.model[MODEL.version], 2);
});

test('versioned database schema is normalized, private by default, and has immutable snapshots', async () => {
  const sql = await readFile(new URL('../supabase/migrations/20260919154753_scanner_beta_feedback_v01.sql', import.meta.url), 'utf8');
  for (const table of ['scanner_beta_scans', 'scanner_beta_square_predictions', 'scanner_beta_feedback', 'scanner_beta_square_corrections']) {
    assert.match(sql, new RegExp(`create table public\\.${table}`));
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`));
  }
  assert.match(sql, /revoke all[\s\S]+from public, anon, authenticated/);
  assert.match(sql, /SCANNER_BETA_SNAPSHOT_IMMUTABLE/);
  assert.match(sql, /training_status <> 'eligible-for-training'/);
  assert.doesNotMatch(sql, /grant (?:all|select|insert|update|delete)[^;]+to (?:anon|authenticated)/i);
});

test('scan-failure migration is quarantined, private, and never training eligible', async () => {
  const sql = await readFile(new URL('../supabase/migrations/20260919163937_scanner_beta_scan_failures_v01.sql', import.meta.url), 'utf8');
  assert.match(sql, /create table public\.scanner_beta_scan_failures/);
  assert.match(sql, /enable row level security/);
  assert.match(sql, /force row level security/);
  assert.match(sql, /revoke all on public\.scanner_beta_scan_failures from public, anon, authenticated/);
  assert.match(sql, /training_status <> 'eligible-for-training'/);
  assert.match(sql, /submit_scanner_beta_scan_failure/);
});
