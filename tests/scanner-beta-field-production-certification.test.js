import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  createFeedbackRecord, createPredictionSnapshot, createScanFailureRecord,
  expandPlacement, placementFromLabels, MODEL
} from '../scanner/beta/scanner-beta-contract.js';
import { sha256, stableJson } from '../api/_lib/scanner-beta-policy.js';
import {
  certifyProductionFieldSnapshot, CORPUS_VERSION, CURRENT_RUNTIME_CUTOFF
} from '../tools/scanner-beta-feedback/production-field-certification.mjs';

const BASE_FEN = '4k3/8/8/8/8/8/8/4K3 w - - 0 1';
const uuid = (prefix, index) => `${prefix.repeat(8)}-${prefix.repeat(4)}-4${prefix.repeat(3)}-8${prefix.repeat(3)}-${index.toString(16).padStart(12, '0')}`;
const isoMinute = (index) => new Date(Date.parse('2026-09-20T04:00:00.000Z') + index * 60_000).toISOString();

function correctedFen(count) {
  const labels = expandPlacement(BASE_FEN);
  for (let index = 0; index < count; index += 1) labels[8 + index] = ['P', 'N', 'B', 'R', 'Q'][index];
  return `${placementFromLabels(labels)} w - - 0 1`;
}

function makeSnapshot(index, timestamp = isoMinute(index)) {
  const labels = expandPlacement(BASE_FEN);
  return createPredictionSnapshot({
    scanId: uuid('1', index), timestamp,
    modelVersion: MODEL.version, modelChecksum: MODEL.checksum,
    occupancyThreshold: MODEL.occupancyThreshold,
    imageHash: index.toString(16).toUpperCase().padStart(64, '0'),
    predictedFEN: BASE_FEN, orientation: index % 2 ? 'white-at-bottom' : 'black-at-bottom',
    detectedCorners: [[0, 0], [511, 0], [511, 511], [0, 511]],
    squarePredictions: labels.map((label, squareIndex) => ({
      square: `${String.fromCharCode(97 + squareIndex % 8)}${8 - Math.floor(squareIndex / 8)}`,
      predictedClass: label, confidence: .999, occupancyProbability: label === 'empty' ? .001 : .999,
      colorProbabilities: [.5, .5], pieceTypeProbabilities: [0, 0, 0, 0, 0, 1],
      kingAuxiliaryProbability: label.toLowerCase() === 'k' ? .999 : .001
    }))
  });
}

function scanRow(snapshot, index) {
  return {
    scan_id: snapshot.scanId, schema_version: snapshot.schemaVersion, corpus_version: snapshot.corpusVersion,
    created_at: snapshot.timestamp, submitted_at: snapshot.timestamp,
    model_version: snapshot.modelVersion, model_checksum: snapshot.modelChecksum,
    occupancy_threshold: snapshot.occupancyThreshold, image_hash: snapshot.imageHash,
    consent_state: { shareImageForImprovement: true, shareCorrectionForImprovement: true },
    platform: index % 2 ? 'Chess.com' : 'Lichess', capture_type: index % 3 ? 'camera' : 'gallery',
    snapshot_hash: sha256(stableJson(snapshot)), snapshot, client_metadata: { betaStage: 'internal' }
  };
}

function feedbackRow(snapshot, index, type, correctionCount = 0) {
  const record = createFeedbackRecord({
    feedbackId: uuid('2', index), snapshot, feedbackType: type,
    correctedFEN: type === 'PIECE_CORRECTION' ? correctedFen(correctionCount) : null,
    finalPositionConfirmed: ['CONFIRMED_CORRECT', 'PIECE_CORRECTION'].includes(type),
    localizationValid: type !== 'LOCALIZATION_FAILURE',
    consent: { shareImageForImprovement: true, shareCorrectionForImprovement: true },
    platform: index % 2 ? 'Chess.com' : 'Lichess', captureType: index % 3 ? 'camera' : 'gallery',
    createdAt: isoMinute(index + 200)
  });
  return {
    row: {
      feedback_id: record.feedbackId, scan_id: record.scanId, schema_version: record.schemaVersion,
      corpus_version: record.corpusVersion, feedback_type: record.feedbackType,
      training_status: record.trainingStatus, payload_hash: sha256(stableJson(record)),
      original_fen: record.originalFEN, corrected_fen: record.correctedFEN,
      changed_square_count: record.changedSquareCount, final_position_confirmed: record.finalPositionConfirmed,
      localization_valid: record.localizationValid, share_image_for_improvement: true,
      share_correction_for_improvement: true, platform: record.platform, capture_type: record.captureType,
      client_metadata: record.clientMetadata, created_at: record.createdAt, submitted_at: record.createdAt
    },
    corrections: record.changedSquares.map((change) => ({
      feedback_id: record.feedbackId, square: change.square, predicted_class: change.predicted,
      corrected_class: change.corrected, original_confidence: change.originalConfidence,
      occupancy_probability: change.occupancyProbability, color_probabilities: change.colorProbabilities,
      piece_type_probabilities: change.pieceTypeProbabilities,
      king_auxiliary_probability: change.kingAuxiliaryProbability
    }))
  };
}

function failureRow(index) {
  const record = createScanFailureRecord({
    feedbackId: uuid('3', index), scanId: uuid('4', index), createdAt: isoMinute(index + 400),
    imageHash: (index + 500).toString(16).toUpperCase().padStart(64, '0'),
    modelVersion: MODEL.version, modelChecksum: MODEL.checksum,
    occupancyThreshold: MODEL.occupancyThreshold, orientation: 'white-at-bottom',
    consent: { shareImageForImprovement: true, shareCorrectionForImprovement: true },
    platform: index % 2 ? 'Chess.com' : 'Lichess', captureType: index % 3 ? 'camera' : 'gallery',
    failureStage: index <= 14 ? 'localization' : 'classifier',
    errorCode: index <= 13 ? 'LOCALIZATION_FAILURE' : index === 14 ? 'MULTIPLE-BOARD-CANDIDATES' : 'CLASSIFIER_UNAVAILABLE'
  });
  return {
    feedback_id: record.feedbackId, scan_id: record.scanId, schema_version: record.schemaVersion,
    corpus_version: record.corpusVersion, feedback_type: record.feedbackType,
    training_status: record.trainingStatus, payload_hash: sha256(stableJson(record)),
    created_at: record.createdAt, submitted_at: record.createdAt,
    model_version: record.modelVersion, model_checksum: record.modelChecksum,
    occupancy_threshold: record.occupancyThreshold, image_hash: record.imageHash,
    orientation: record.orientation, failure_stage: record.failureStage, error_code: record.errorCode,
    share_image_for_improvement: true, share_correction_for_improvement: true,
    platform: record.platform, capture_type: record.captureType, client_metadata: record.clientMetadata
  };
}

function productionFixture() {
  const scans = [], feedback = [], failures = [], squarePredictions = [], squareCorrections = [];
  for (let index = 1; index <= 96; index += 1) {
    const snapshot = makeSnapshot(index);
    scans.push(scanRow(snapshot, index));
    squarePredictions.push(...snapshot.squarePredictions.map((prediction) => ({
      scan_id: snapshot.scanId, square: prediction.square, predicted_class: prediction.predictedClass,
      confidence: prediction.confidence, occupancy_probability: prediction.occupancyProbability,
      color_probabilities: prediction.colorProbabilities, piece_type_probabilities: prediction.pieceTypeProbabilities,
      king_auxiliary_probability: prediction.kingAuxiliaryProbability
    })));
    if (index <= 76) {
      const built = feedbackRow(snapshot, index, 'CONFIRMED_CORRECT'); feedback.push(built.row);
    } else if (index <= 79) {
      const built = feedbackRow(snapshot, index, 'PIECE_CORRECTION', [1, 2, 5][index - 77]);
      feedback.push(built.row); squareCorrections.push(...built.corrections);
    } else if (index <= 92) {
      const built = feedbackRow(snapshot, index, 'LOCALIZATION_FAILURE'); feedback.push(built.row);
    }
  }
  for (let index = 1; index <= 19; index += 1) failures.push(failureRow(index));
  return {
    schemaVersion: 'caissa-scanner-beta-field-source-snapshot/1',
    cutoff: '2026-09-21T00:00:00.000Z',
    accountScope: { rule: 'single production account matching the owner milestone', scopeHash: 'TESTONLY0000' },
    scans, feedback, failures, squarePredictions, squareCorrections
  };
}

test('production field snapshot reconciles dashboard accounting and current runtime', () => {
  const result = certifyProductionFieldSnapshot(productionFixture());
  assert.equal(result.summary.certificationReady, true);
  assert.equal(result.summary.corpusVersion, CORPUS_VERSION);
  assert.deepEqual(result.summary.reconciliation, {
    canonicalScans: 96, finalFeedbackDispositions: 92, standaloneScanFailures: 19,
    logicalAttempts: 115, overlap: 0, pending: 4,
    identity: '96 canonical scans + 19 standalone failures = 115 logical attempts; 111 completed + 4 pending = 115',
    completedIdentity: '76 + 3 + 13 + 19 = 111',
    audit: {
      duplicateScanIds: 0, duplicateFeedbackIds: 0, duplicateFailureIds: 0, retryPayloads: 0,
      repeatedFinalDispositions: 0, overlapScanFailures: 0, orphanFeedback: 0,
      orphanPredictions: 0, orphanCorrections: 0
    }
  });
  assert.equal(result.summary.currentRuntime.completedSubmissions, 111);
  assert.equal(result.summary.dashboardAccounting.completedToday, 0);
  assert.equal(result.summary.dashboardAccounting.completedThisWeek, 0);
  assert.equal(result.summary.decision, 'LOCALIZATION / PRODUCT HARDENING REQUIRED');
});

test('classifier, correction, grouping, guardrail, and training metrics derive from confirmed truth only', () => {
  const { artifacts } = certifyProductionFieldSnapshot(productionFixture());
  const product = artifacts['product-metrics.json'];
  const classifier = artifacts['classifier-metrics.json'];
  assert.deepEqual(product.correctionHistogram, { '0': 76, '1': 1, '2': 1, '3-5': 1, '6-10': 0, '>10': 0 });
  assert.equal(product.correctionBurden.maximum, 5);
  assert.equal(classifier.eligibleBoards, 79);
  assert.equal(classifier.evaluatedSquares, 5056);
  assert.equal(classifier.occupancy.occupiedToEmpty, 8);
  assert.equal(classifier.occupancy.emptyToOccupied, 0);
  assert.equal(artifacts['platform-report.json'].cohorts['Chess.com'].logicalAttempts > 0, true);
  assert.equal(artifacts['capture-type-report.json'].cohorts.camera.logicalAttempts > 0, true);
  assert.equal(artifacts['guardrail-report.json'].statusCounts.NORMAL, 92);
  assert.equal(artifacts['training-candidate-preview.json'].technicalCandidates, 79);
  assert.equal(artifacts['training-candidate-preview.json'].automaticallyAdmitted, 0);
});

test('cutoff immutability and duplicate identities hold certification', () => {
  const fixture = productionFixture();
  fixture.scans[0] = { ...fixture.scans[0], submitted_at: '2026-09-22T00:00:00.000Z' };
  fixture.scans.push(fixture.scans[1]);
  const result = certifyProductionFieldSnapshot(fixture);
  assert.equal(result.summary.certificationReady, false);
  assert.deepEqual(result.summary.validationErrors, ['RECONCILIATION_ANOMALY', 'ROW_AFTER_CUTOFF']);
  assert.equal(result.summary.reconciliation.audit.duplicateScanIds, 1);
});

test('corpus checksum is deterministic under source row reordering', () => {
  const fixture = productionFixture();
  const reversed = Object.fromEntries(Object.entries(fixture).map(([key, value]) => [key, Array.isArray(value) ? [...value].reverse() : value]));
  const first = certifyProductionFieldSnapshot(fixture);
  const second = certifyProductionFieldSnapshot(reversed);
  assert.equal(first.summary.corpusSha256, second.summary.corpusSha256);
  assert.deepEqual(first.artifacts['manifest.json'], second.artifacts['manifest.json']);
});

test('all-time and current-runtime segmentation uses the certified deployment boundary', () => {
  const fixture = productionFixture();
  fixture.failures[0] = { ...fixture.failures[0], created_at: '2026-09-20T03:00:00.000Z', submitted_at: '2026-09-20T03:00:00.000Z' };
  const result = certifyProductionFieldSnapshot(fixture);
  assert.equal(Date.parse(CURRENT_RUNTIME_CUTOFF) > Date.parse(fixture.failures[0].submitted_at), true);
  assert.equal(result.summary.allTime.completedSubmissions, 111);
  assert.equal(result.summary.currentRuntime.completedSubmissions, 110);
  assert.equal(result.artifacts['failure-analysis.json'].eras.preStructuralGuardrail.completedSubmissions, 1);
});

test('governed field export remains a dry-run with no automatic admission', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'caissa-field-export-'));
  const input = join(directory, 'snapshot.json');
  try {
    await writeFile(input, JSON.stringify(productionFixture()), 'utf8');
    const run = spawnSync(process.execPath, ['tools/scanner-beta-feedback/export.mjs', `--input=${input}`], {
      cwd: new URL('..', import.meta.url), encoding: 'utf8'
    });
    assert.equal(run.status, 0, run.stderr);
    const output = JSON.parse(run.stdout);
    assert.equal(output.dryRun, true);
    assert.equal(output.candidateCount, 79);
    assert.equal(output.governanceReviewRequired, 79);
    assert.equal(output.automaticallyAdmitted, 0);
    assert.equal(output.exportedToTraining, 0);
    assert.deepEqual(output.candidates, []);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
