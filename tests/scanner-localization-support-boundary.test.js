import test from 'node:test';
import assert from 'node:assert/strict';
import '../scanner/recognition/scanner-board-geometry.js';
import '../scanner/recognition/scanner-board-localizer.js';
import { classifyV03Sample, verifyV03Split, V03_GROUPS } from '../scanner/recognition/benchmark/localization-v03-split.js';
import { summarizeV03 } from '../scanner/recognition/benchmark/localization-v03-report.js';
import { createV02DevelopmentFixtures } from './fixtures/scanner-localization-hard-v02-fixtures.js';

const localizer = globalThis.CaissaScannerBoardLocalizer;

test('fresh v0.3 split is exhaustive, grouped, and keeps exact v0.1 overlaps out of evaluation', () => {
  const samples = [...V03_GROUPS.flatMap((group) => group.sampleIds.map((sampleId) => ({
    sampleId, boardPresent: sampleId.includes('positive'), priorCorpusSampleId: null
  }))), ...Array.from({ length: 14 }, (_, index) => ({
    sampleId: `real-v03-positive-${String(index + 20).padStart(3, '0')}`,
    boardPresent: true, priorCorpusSampleId: `real-v01-${index + 1}`
  }))];
  assert.deepEqual(verifyV03Split(samples), {
    developmentPositive: 13, developmentNegative: 8,
    evaluationPositive: 6, evaluationNegative: 5, legacyOverlap: 14
  });
  assert.equal(classifyV03Sample('real-v03-positive-020').split, 'legacy-overlap');
  assert.equal(classifyV03Sample('real-v03-positive-002').group, classifyV03Sample('real-v03-positive-003').group);
  assert.equal(classifyV03Sample('real-v03-negative-010').split, classifyV03Sample('real-v03-negative-011').split);
  assert.throws(() => verifyV03Split(samples.slice(1)), /Invalid v0.3 split|Incomplete leakage group/);
  assert.throws(() => verifyV03Split(samples.map((sample) => sample.sampleId === 'real-v03-positive-001'
    ? { ...sample, priorCorpusSampleId: 'leak' } : sample)), /overlap leaked/);
});

test('geometry alone cannot auto-accept a chess-like checkers grid without independent identity evidence', () => {
  const candidate = { accepted: true, gridPhaseEvidenceScore: 0.9, outerFrameRisk: 0.02, perspectiveRisk: 0.1 };
  assert.deepEqual(localizer.assessSupportBoundary({ candidate }), {
    decision: 'review-needed', reasons: ['chess-identity-unconfirmed']
  });
  assert.equal(localizer.assessSupportBoundary({ candidate, identityConfirmed: true }).decision, 'accepted');
  assert.equal(localizer.assessSupportBoundary({ candidate, ambiguity: true }).decision, 'multiple-board-candidates');
  assert.equal(localizer.assessSupportBoundary({ candidate: null }).decision, 'board-not-found');
});

test('outer-frame, phase, and perspective risks abstain even if identity is later confirmed', () => {
  const candidate = { accepted: true, gridPhaseEvidenceScore: 0.9, outerFrameRisk: 0.4, perspectiveRisk: 0.1 };
  assert.equal(localizer.assessSupportBoundary({ candidate, identityConfirmed: true }).decision, 'review-needed');
  assert.deepEqual(localizer.assessSupportBoundary({ candidate, identityConfirmed: true }).reasons, ['outer-frame-risk']);
  assert.equal(localizer.assessSupportBoundary({ candidate: { ...candidate, outerFrameRisk: 0, gridPhaseEvidenceScore: 0.4 }, identityConfirmed: true }).decision, 'review-needed');
  assert.equal(localizer.assessSupportBoundary({ candidate: { ...candidate, outerFrameRisk: 0, perspectiveRisk: 0.8 }, identityConfirmed: true }).decision, 'deferred-unsupported');
});

test('bounded independent-side inset preserves corner order and does not shrink unrequested sides', () => {
  const corners = [[10, 20], [210, 20], [210, 220], [10, 220]];
  assert.deepEqual(localizer.insetCorners(corners, 0.05, 0, 0, 0), [[10, 30], [210, 30], [210, 220], [10, 220]]);
  assert.deepEqual(localizer.insetCorners(corners, 0.05, 0.05, 0.05, 0.05)
    .map((point) => point.map((value) => Math.round(value))), [[20, 30], [200, 30], [200, 210], [20, 210]]);
});

test('playable grid phase outranks a decorative frame, with explicit outer-frame risk', () => {
  const fixture = createV02DevelopmentFixtures().find((item) => item.id === 'synthetic-thick-coordinate-frame');
  const field = localizer.scoreSourceCorners(fixture);
  const frame = localizer.scoreSourceCorners({ ...fixture,
    corners: [[27, 24], [293, 24], [293, 290], [27, 290]] });
  assert.equal(field.accepted, true);
  assert.equal(frame.accepted, false);
  assert.ok(field.gridPhaseEvidenceScore > frame.gridPhaseEvidenceScore + 0.4);
  assert.ok(frame.outerFrameRisk > field.outerFrameRisk + 0.35);
});

test('perspective risk is distinct from geometric validity and rises with skew', () => {
  const square = { opposingEdgeRatios: [1, 1], angles: [90, 90, 90, 90] };
  const skewed = { opposingEdgeRatios: [2.3, 1.8], angles: [42, 138, 65, 115] };
  assert.equal(localizer.perspectiveRisk(square), 0);
  assert.ok(localizer.perspectiveRisk(skewed) > 0.7);
});

test('fresh reporting separates safe decisions from geometric false candidates and uses positive-only wrong-board denominator', () => {
  const record = (boardPresent, decision, wrongBoard, boardFound) => ({ boardPresent, decision, wrongBoard,
    boardFound, outerFrame: false, cornerRmse: boardFound && boardPresent ? 0.01 : null,
    worstCornerError: boardFound && boardPresent ? 0.02 : null,
    homographySuccess: boardFound, geometryPass: boardFound, timingMs: { totalGeometryMs: 10 } });
  const result = summarizeV03([
    record(true, 'review-needed', false, true),
    record(true, 'review-needed', true, true),
    record(false, 'review-needed', false, true),
    record(false, 'board-not-found', false, false)
  ]);
  assert.equal(result.wrongBoardRate, 0.5);
  assert.equal(result.falsePositiveRate, 0);
  assert.equal(result.geometryFalseCandidateRate, 0.5);
  assert.equal(result.trueNegativeRate, 1);
});
