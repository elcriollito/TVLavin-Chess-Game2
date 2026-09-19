import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MODEL, createFeedbackRecord, createPredictionSnapshot, createScanFailureRecord, expandPlacement
} from '../scanner/beta/scanner-beta-contract.js';
import { sha256, stableJson } from '../api/_lib/scanner-beta-policy.js';
import {
  analyzeFieldCorpus, createCertificationArtifacts, FIELD_CORPUS_VERSION
} from '../tools/scanner-beta-feedback/field-certification.mjs';

const PREDICTED_FEN = '4k3/8/8/8/8/8/8/4K3 w - - 0 1';
const CORRECTED_FEN = '4k3/8/8/8/8/8/5B2/4K3 w - - 0 1';
const consent = { shareImageForImprovement: true, shareCorrectionForImprovement: true };
const uuid = (prefix, index) => `${prefix.repeat(8)}-${prefix.repeat(4)}-4${prefix.repeat(3)}-8${prefix.repeat(3)}-${index.toString(16).padStart(12, '0')}`;

function snapshot(index) {
  const labels = expandPlacement(PREDICTED_FEN);
  return createPredictionSnapshot({
    scanId: uuid('1', index), timestamp: `2026-09-19T12:${String(index % 60).padStart(2, '0')}:00.000Z`,
    modelVersion: MODEL.version, modelChecksum: MODEL.checksum, occupancyThreshold: MODEL.occupancyThreshold,
    imageHash: index.toString(16).toUpperCase().padStart(64, '0'), predictedFEN: PREDICTED_FEN,
    orientation: 'white-at-bottom', detectedCorners: [[0, 0], [511, 0], [511, 511], [0, 511]],
    squarePredictions: labels.map((label, squareIndex) => ({
      square: `${String.fromCharCode(97 + squareIndex % 8)}${8 - Math.floor(squareIndex / 8)}`,
      predictedClass: label, confidence: .999, occupancyProbability: label === 'empty' ? .001 : .999,
      colorProbabilities: [.5, .5], pieceTypeProbabilities: [0, 0, 0, 0, 0, 1],
      kingAuxiliaryProbability: label.toLowerCase() === 'k' ? .999 : .001
    }))
  });
}

function record(index, type = 'CONFIRMED_CORRECT') {
  const original = snapshot(index);
  if (type === 'SCAN_FAILURE') {
    const failure = createScanFailureRecord({
      feedbackId: uuid('2', index), scanId: original.scanId, timestamp: `2026-09-19T13:${String(index % 60).padStart(2, '0')}:00.000Z`,
      imageHash: original.imageHash, modelVersion: MODEL.version, modelChecksum: MODEL.checksum,
      occupancyThreshold: MODEL.occupancyThreshold, orientation: original.orientation, consent,
      platform: index % 2 ? 'Chess.com' : 'Lichess', captureType: index % 2 ? 'camera' : 'gallery',
      failureStage: 'classifier', errorCode: 'CLASSIFIER_UNAVAILABLE'
    });
    return { scan: null, feedback: { feedbackId: failure.feedbackId, payloadHash: sha256(stableJson(failure)), failure } };
  }
  const feedback = createFeedbackRecord({
    feedbackId: uuid('2', index), snapshot: original, feedbackType: type,
    correctedFEN: type === 'PIECE_CORRECTION' ? CORRECTED_FEN : null,
    finalPositionConfirmed: ['CONFIRMED_CORRECT', 'PIECE_CORRECTION'].includes(type),
    localizationValid: type !== 'LOCALIZATION_FAILURE', consent,
    platform: index % 2 ? 'Chess.com' : 'Lichess', captureType: index % 2 ? 'camera' : 'gallery',
    createdAt: `2026-09-19T13:${String(index % 60).padStart(2, '0')}:00.000Z`
  });
  return {
    scan: { scanId: original.scanId, snapshotHash: sha256(stableJson(original)), snapshot: original,
      metadata: { platform: feedback.platform, captureType: feedback.captureType } },
    feedback: { feedbackId: feedback.feedbackId, payloadHash: sha256(stableJson(feedback)), feedback }
  };
}

function stateFrom(types) {
  const rows = types.map((type, index) => record(index + 1, type));
  return {
    scans: rows.map((row) => row.scan).filter(Boolean),
    feedback: rows.filter((row) => row.feedback.feedback).map((row) => row.feedback),
    failures: rows.filter((row) => row.feedback.failure).map((row) => row.feedback)
  };
}

test('field certification refuses to fabricate a snapshot below 30 real completed scans', () => {
  const state = stateFrom(Array(29).fill('CONFIRMED_CORRECT'));
  const analysis = analyzeFieldCorpus(state);
  assert.equal(analysis.report.certificationReady, false);
  assert.equal(analysis.report.decision, 'CONTINUE MOBILE BETA COLLECTION');
  assert.throws(() => createCertificationArtifacts(state), /FIELD_CORPUS_MINIMUM_NOT_MET/);
});

test('field corpus metrics separate classifier truth from localization and scan failures', () => {
  const state = stateFrom([
    ...Array(20).fill('CONFIRMED_CORRECT'), ...Array(5).fill('PIECE_CORRECTION'),
    ...Array(2).fill('LOCALIZATION_FAILURE'), ...Array(3).fill('SCAN_FAILURE')
  ]);
  const { report } = analyzeFieldCorpus(state);
  assert.equal(report.certificationReady, true);
  assert.equal(report.eligibleCompletedScans, 30);
  assert.deepEqual(report.outcomes, { confirmedCorrect: 20, corrected: 5, localizationFailures: 2, scanFailures: 3 });
  assert.equal(report.correctionHistogram['0'], 20);
  assert.equal(report.correctionHistogram['1'], 5);
  assert.equal(report.occupancy.emptyToOccupied, 5);
  assert.equal(report.occupancy.occupiedToEmpty, 0);
  assert.equal(report.pieceConfusions['empty→B'], 5);
  assert.equal(report.platform['Chess.com'].scans, 15);
  assert.equal(report.captureType.camera.scans, 15);
  assert.equal(report.localization.successful, 28);
  assert.equal(report.localization.failures, 2);
  assert.deepEqual(report.scanFailureBreakdown, { classifier: 3 });
});

test('retry artifacts and duplicate identities do not double-count field evidence', () => {
  const state = stateFrom(Array(30).fill('CONFIRMED_CORRECT'));
  state.scans.push(state.scans[0]);
  state.feedback.push(state.feedback[0]);
  state.feedback.push({ ...state.feedback[1], feedbackId: uuid('3', 99) });
  const { report } = analyzeFieldCorpus(state);
  assert.equal(report.eligibleCompletedScans, 30);
  assert.equal(report.deduplication.duplicateScanIds, 1);
  assert.equal(report.deduplication.duplicateFeedbackIds, 1);
  assert.equal(report.deduplication.retryPayloads, 1);
});

test('mixed model records are excluded from the frozen v0.5 headline corpus', () => {
  const state = stateFrom(Array(30).fill('CONFIRMED_CORRECT'));
  state.scans[0] = { ...state.scans[0], snapshot: { ...state.scans[0].snapshot, modelVersion: 'future-model' } };
  state.feedback[0] = { ...state.feedback[0], feedback: { ...state.feedback[0].feedback, modelVersion: 'future-model' } };
  state.scans[0].snapshotHash = sha256(stableJson(state.scans[0].snapshot));
  state.feedback[0].payloadHash = sha256(stableJson(state.feedback[0].feedback));
  const { report } = analyzeFieldCorpus(state);
  assert.equal(report.eligibleCompletedScans, 29);
  assert.equal(report.certificationReady, false);
  assert.deepEqual(report.invalidRecords[0].errors, ['MODEL_VERSION_MISMATCH']);
});

test('tampered stored hashes are excluded from eligible field evidence', () => {
  const state = stateFrom(Array(30).fill('CONFIRMED_CORRECT'));
  state.scans[0] = { ...state.scans[0], snapshotHash: 'A'.repeat(64) };
  state.feedback[1] = { ...state.feedback[1], payloadHash: 'B'.repeat(64) };
  const { report } = analyzeFieldCorpus(state);
  assert.equal(report.eligibleCompletedScans, 28);
  assert.equal(report.certificationReady, false);
  assert.deepEqual(report.invalidRecords.map((item) => item.errors), [
    ['SNAPSHOT_HASH_MISMATCH'], ['FEEDBACK_HASH_MISMATCH']
  ]);
});

test('certification artifacts and corpus SHA are deterministic under input reordering', () => {
  const state = stateFrom(Array(30).fill('CONFIRMED_CORRECT'));
  const reversed = { scans: [...state.scans].reverse(), feedback: [...state.feedback].reverse() };
  const first = createCertificationArtifacts(state);
  const second = createCertificationArtifacts(reversed);
  assert.equal(first['beta-field-v0.1-report.json'].corpusVersion, FIELD_CORPUS_VERSION);
  assert.equal(first['beta-field-v0.1-manifest.json'].recordCount, 30);
  assert.equal(first['beta-field-v0.1-manifest.json'].corpusSha256, second['beta-field-v0.1-manifest.json'].corpusSha256);
  assert.deepEqual(first, second);
});

test('offline auto-accept analysis highlights every false accepted board', () => {
  const state = stateFrom([...Array(29).fill('CONFIRMED_CORRECT'), 'PIECE_CORRECTION']);
  const { report } = analyzeFieldCorpus(state);
  assert.equal(report.autoAccept.coverage, 1);
  assert.equal(report.autoAccept.accepted, 30);
  assert.equal(report.autoAccept.falseAutoAcceptScanIds.length, 1);
  assert.equal(report.autoAccept.exactBoardPrecision, 29 / 30);
  assert.equal(report.autoAccept.withinOneCorrectionPrecision, 1);
});
