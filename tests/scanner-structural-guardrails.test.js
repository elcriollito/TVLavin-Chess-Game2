import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  MODEL, analyzeStructuralPosition, createFeedbackRecord, createPredictionSnapshot, expandPlacement,
  placementFromLabels
} from '../scanner/beta/scanner-beta-contract.js';
import { sha256, stableJson } from '../api/_lib/scanner-beta-policy.js';
import { createScannerBetaService } from '../api/_lib/scanner-beta-service.js';
import { createScannerBetaLocalStore } from '../tools/scanner-beta-feedback/local-store.mjs';
import { buildStructuralGuardrailReport } from '../tools/scanner-beta-feedback/structural-report.mjs';

const SCAN_ID = '11111111-1111-4111-8111-111111111111';
const FEEDBACK_ID = '22222222-2222-4222-8222-222222222222';
const USER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CONSENT = { shareImageForImprovement: true, shareCorrectionForImprovement: true };

function squareIndex(square) {
  return (8 - Number(square[1])) * 8 + square.charCodeAt(0) - 97;
}

function fenWith(pieces) {
  const labels = Array(64).fill('empty');
  for (const [square, piece] of pieces) labels[squareIndex(square)] = piece;
  return placementFromLabels(labels);
}

function codes(fen) {
  return analyzeStructuralPosition(fen).warningCodes;
}

function prediction(fen, scanId = SCAN_ID) {
  const labels = expandPlacement(fen);
  return {
    scanId,
    timestamp: '2026-09-20T12:00:00.000Z',
    modelVersion: MODEL.version,
    modelChecksum: MODEL.checksum,
    occupancyThreshold: MODEL.occupancyThreshold,
    imageHash: 'A'.repeat(64),
    predictedFEN: `${fen} w - - 0 1`,
    orientation: 'white-at-bottom',
    detectedCorners: [[0, 0], [100, 0], [100, 100], [0, 100]],
    squarePredictions: labels.map((label, index) => ({
      square: String.fromCharCode(97 + index % 8) + String(8 - Math.floor(index / 8)),
      predictedClass: label,
      confidence: .98,
      occupancyProbability: label === 'empty' ? .01 : .999,
      colorProbabilities: [.5, .5],
      pieceTypeProbabilities: [1 / 6, 1 / 6, 1 / 6, 1 / 6, 1 / 6, 1 / 6],
      kingAuxiliaryProbability: label.toLowerCase() === 'k' ? .99 : .01
    }))
  };
}

const NORMAL_KINGS = [['e1', 'K'], ['e8', 'k']];
const SEVERE_FEN = fenWith([
  ['d1', 'K'], ['e1', 'K'],
  ['a2', 'N'], ['b2', 'N'], ['c2', 'N'], ['d2', 'N'], ['e2', 'N'], ['f2', 'N'],
  ['g7', 'n'], ['h7', 'n']
]);

test('king-count hard alerts are deterministic', () => {
  const cases = [
    [fenWith([['e8', 'k']]), ['MISSING_WHITE_KING', 'INVALID_TOTAL_KINGS']],
    [fenWith([['d1', 'K'], ['e1', 'K'], ['e8', 'k']]), ['MULTIPLE_WHITE_KINGS', 'INVALID_TOTAL_KINGS']],
    [fenWith([['e1', 'K']]), ['MISSING_BLACK_KING', 'INVALID_TOTAL_KINGS']],
    [fenWith([['e1', 'K'], ['d8', 'k'], ['e8', 'k']]), ['MULTIPLE_BLACK_KINGS', 'INVALID_TOTAL_KINGS']],
    [fenWith([['d1', 'K'], ['e1', 'K'], ['e8', 'k']]), ['MULTIPLE_WHITE_KINGS', 'INVALID_TOTAL_KINGS']]
  ];
  for (const [fen, expected] of cases) {
    const result = analyzeStructuralPosition(fen);
    assert.equal(result.status, 'REVIEW_REQUIRED');
    assert.deepEqual(result.warningCodes, expected);
  }
});

test('pawn-count and back-rank pawn violations are hard alerts', () => {
  const whiteNine = NORMAL_KINGS.concat(['a2', 'b2', 'c2', 'd2', 'e2', 'f2', 'g2', 'h2', 'a3'].map((square) => [square, 'P']));
  const blackNine = NORMAL_KINGS.concat(['a7', 'b7', 'c7', 'd7', 'e7', 'f7', 'g7', 'h7', 'a6'].map((square) => [square, 'p']));
  assert.ok(codes(fenWith(whiteNine)).includes('TOO_MANY_WHITE_PAWNS'));
  assert.ok(codes(fenWith(blackNine)).includes('TOO_MANY_BLACK_PAWNS'));
  for (const [square, piece, expected] of [
    ['a1', 'P', 'WHITE_PAWN_ON_BACK_RANK'], ['a8', 'P', 'WHITE_PAWN_ON_BACK_RANK'],
    ['h1', 'p', 'BLACK_PAWN_ON_BACK_RANK'], ['h8', 'p', 'BLACK_PAWN_ON_BACK_RANK']
  ]) {
    const result = analyzeStructuralPosition(fenWith([...NORMAL_KINGS, [square, piece]]));
    assert.equal(result.status, 'REVIEW_REQUIRED');
    assert.ok(result.warningCodes.includes(expected));
  }
});

test('promotion-aware multiplicity rules are soft and conservative', () => {
  const threeQueens = analyzeStructuralPosition(fenWith([...NORMAL_KINGS, ['a2', 'Q'], ['b2', 'Q'], ['c2', 'Q']]));
  assert.equal(threeQueens.status, 'REVIEW_RECOMMENDED');
  assert.deepEqual(threeQueens.warningCodes, ['UNUSUAL_WHITE_QUEEN_COUNT']);
  const fourKnights = analyzeStructuralPosition(fenWith([...NORMAL_KINGS, ['a2', 'N'], ['b2', 'N'], ['c2', 'N'], ['d2', 'N']]));
  assert.equal(fourKnights.status, 'REVIEW_RECOMMENDED');
  assert.deepEqual(fourKnights.warningCodes, ['UNUSUAL_WHITE_KNIGHT_COUNT']);
});

test('all required soft warning codes remain machine-stable for both colors', () => {
  const cases = [
    ['Q', 3, 'UNUSUAL_WHITE_QUEEN_COUNT'], ['q', 3, 'UNUSUAL_BLACK_QUEEN_COUNT'],
    ['R', 4, 'UNUSUAL_WHITE_ROOK_COUNT'], ['r', 4, 'UNUSUAL_BLACK_ROOK_COUNT'],
    ['B', 4, 'UNUSUAL_WHITE_BISHOP_COUNT'], ['b', 4, 'UNUSUAL_BLACK_BISHOP_COUNT'],
    ['N', 4, 'UNUSUAL_WHITE_KNIGHT_COUNT'], ['n', 4, 'UNUSUAL_BLACK_KNIGHT_COUNT']
  ];
  const whiteSquares = ['a2', 'b2', 'c2', 'd2'];
  const blackSquares = ['a7', 'b7', 'c7', 'd7'];
  for (const [piece, count, expected] of cases) {
    const squares = piece === piece.toUpperCase() ? whiteSquares : blackSquares;
    const result = analyzeStructuralPosition(fenWith([
      ...NORMAL_KINGS,
      ...squares.slice(0, count).map((square) => [square, piece])
    ]));
    assert.equal(result.status, 'REVIEW_RECOMMENDED');
    assert.ok(result.warningCodes.includes(expected));
  }

  const sixteenSquares = [
    'a2', 'b2', 'c2', 'd2', 'e2', 'f2', 'g2', 'h2',
    'a3', 'b3', 'c3', 'd3', 'e3', 'f3', 'g3', 'h3'
  ];
  const whiteCrowded = analyzeStructuralPosition(fenWith([
    ...NORMAL_KINGS, ...sixteenSquares.map((square) => [square, 'N'])
  ]));
  const blackCrowded = analyzeStructuralPosition(fenWith([
    ...NORMAL_KINGS, ...sixteenSquares.map((square) => [square, 'n'])
  ]));
  assert.ok(whiteCrowded.warningCodes.includes('UNUSUAL_WHITE_PIECE_COUNT'));
  assert.ok(blackCrowded.warningCodes.includes('UNUSUAL_BLACK_PIECE_COUNT'));
});

test('normal positions and conservative promoted-material examples have no hard alerts', () => {
  const fixtures = [
    'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR',
    'r1bq1rk1/ppp2ppp/2np1n2/2b1p3/2B1P3/2NP1N2/PPP2PPP/R1BQ1RK1',
    '8/8/8/8/8/4k3/8/4K3',
    fenWith([...NORMAL_KINGS, ['a2', 'Q'], ['b2', 'Q'], ['a3', 'R'], ['b3', 'R'], ['c3', 'R'], ['a4', 'N'], ['b4', 'N'], ['c4', 'N']])
  ];
  for (const fen of fixtures) {
    const result = analyzeStructuralPosition(fen);
    assert.equal(result.status, 'NORMAL', `${fen}: ${result.warningCodes.join(',')}`);
    assert.equal(result.warnings.some((item) => item.severity === 'HARD'), false);
  }
});

test('observed severe beta fixture requires review without changing its placement', () => {
  const before = SEVERE_FEN;
  const result = analyzeStructuralPosition(SEVERE_FEN);
  assert.equal(result.status, 'REVIEW_REQUIRED');
  assert.ok(result.warningCodes.includes('MULTIPLE_WHITE_KINGS'));
  assert.ok(result.warningCodes.includes('MISSING_BLACK_KING'));
  assert.ok(result.warningCodes.includes('UNUSUAL_WHITE_KNIGHT_COUNT'));
  assert.equal(SEVERE_FEN, before);
});

test('snapshot and feedback preserve deterministic structural metadata in review quarantine', () => {
  const snapshot = createPredictionSnapshot({
    ...prediction(SEVERE_FEN),
    structuralGuardrails: { status: 'NORMAL', warnings: [], warningCodes: [] }
  });
  assert.equal(snapshot.structuralGuardrails.status, 'REVIEW_REQUIRED');
  const feedback = createFeedbackRecord({
    feedbackId: FEEDBACK_ID,
    snapshot,
    feedbackType: 'CONFIRMED_CORRECT',
    finalPositionConfirmed: true,
    consent: CONSENT,
    clientMetadata: { viewport: { width: 390, height: 844 } }
  });
  assert.equal(feedback.trainingStatus, 'pending-review');
  assert.equal(feedback.structuralStatus, 'REVIEW_REQUIRED');
  assert.deepEqual(feedback.warningCodes, snapshot.structuralGuardrails.warningCodes);
  assert.deepEqual(feedback.structuralWarnings, snapshot.structuralGuardrails.warnings);
  assert.equal(feedback.clientMetadata.structuralStatus, 'REVIEW_REQUIRED');
  assert.deepEqual(feedback.clientMetadata.warningCodes, feedback.warningCodes);
  assert.equal(feedback.finalPositionConfirmed, true);
  assert.equal(feedback.localizationValid, true);
});

test('feedback service recomputes structural metadata instead of trusting the client', async () => {
  const snapshot = createPredictionSnapshot(prediction(SEVERE_FEN));
  let stored = null;
  const service = createScannerBetaService({
    env: { CAISSA_SCANNER_BETA_STAGE: 'internal' },
    authorizeExperiment: async () => ({ ok: true, user: { id: USER_ID } }),
    store: {
      getScan: async () => ({ snapshot }),
      putFeedback: async (value) => { stored = value; return { duplicate: false }; }
    }
  });
  let response = null;
  const res = { setHeader() {}, status(status) { return { json(body) { response = { status, body }; } }; } };
  await service.feedback({ method: 'POST', headers: {}, body: { feedback: {
    feedbackId: FEEDBACK_ID,
    scanId: snapshot.scanId,
    feedbackType: 'CONFIRMED_CORRECT',
    correctedFEN: snapshot.predictedFEN,
    finalPositionConfirmed: true,
    localizationValid: true,
    consent: CONSENT,
    structuralStatus: 'NORMAL',
    structuralWarnings: [],
    warningCodes: []
  } } }, res);
  assert.equal(response.status, 200);
  assert.equal(stored.feedback.structuralStatus, 'REVIEW_REQUIRED');
  assert.ok(stored.feedback.warningCodes.includes('MISSING_BLACK_KING'));
  assert.equal(stored.feedback.clientMetadata.structuralStatus, 'REVIEW_REQUIRED');
});

test('structural warnings alone do not change progress-counter semantics', async () => {
  const root = await mkdtemp(join(tmpdir(), 'caissa-structural-counter-'));
  try {
    const store = createScannerBetaLocalStore({ root });
    const snapshot = createPredictionSnapshot(prediction(SEVERE_FEN));
    await store.putScan({ userId: USER_ID, snapshot, snapshotHash: sha256(stableJson(snapshot)), metadata: {} });
    assert.deepEqual(await store.getBetaActivitySummary(USER_ID), {
      attempted: 1, completed: 0, confirmedCorrect: 0, corrected: 0,
      localizationFailures: 0, scanFailures: 0, pending: 1,
      completedToday: 0, completedThisWeek: 0, completedAllTime: 0
    });
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('offline structural report is non-mutating and measures warning/disposition overlap', () => {
  const severe = createPredictionSnapshot(prediction(SEVERE_FEN));
  const normal = createPredictionSnapshot(prediction(fenWith(NORMAL_KINGS), '33333333-3333-4333-8333-333333333333'));
  const state = {
    scans: [{ snapshot: severe }, { snapshot: normal }],
    feedback: [{ feedback: { scanId: severe.scanId, feedbackType: 'LOCALIZATION_FAILURE' } }]
  };
  const before = JSON.stringify(state);
  const report = buildStructuralGuardrailReport(state);
  assert.equal(report.scansAnalyzed, 2);
  assert.equal(report.hardWarningScans, 1);
  assert.equal(report.softWarningScans, 0);
  assert.equal(report.warningCodeFrequencies.MULTIPLE_WHITE_KINGS, 1);
  assert.equal(report.overlapWithLocalizationFailures, 1);
  assert.equal(JSON.stringify(state), before);
});

test('structural analysis has negligible local latency and no engine dependency', () => {
  const started = performance.now();
  for (let index = 0; index < 10_000; index += 1) analyzeStructuralPosition(SEVERE_FEN);
  const elapsed = performance.now() - started;
  assert.ok(elapsed < 1_000, `10,000 analyses took ${elapsed.toFixed(1)}ms`);
});
