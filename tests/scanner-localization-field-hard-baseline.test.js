import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildReports, cornerErrorMetrics, diagnoseSample, matchCandidate, polygonArea, quadIou
} from '../tools/scanner-localization-field-hard/baseline-scoring.mjs';

const square = (left = 0, top = 0, size = 100) => [
  [left, top], [left + size, top], [left + size, top + size], [left, top + size]
];
const truthSample = (id, held = false) => ({
  sampleId: id,
  humanVerified: true,
  sourceDimensions: { width: 200, height: 200 },
  corners: { TL: { x: 20, y: 20 }, TR: { x: 120, y: 20 }, BR: { x: 120, y: 120 }, BL: { x: 20, y: 120 } },
  governanceStatus: held ? 'review-required' : 'admitted',
  developmentRole: held ? 'held-duplicate-review' : 'development',
  duplicateGroup: held ? 'held-group' : null
});
const candidate = (corners = square(20, 20), score = .9, accepted = true) => ({
  source: 'fixture', corners, accepted, candidateScore: score, geometryScore: .9,
  gridEvidenceScore: .9, checkerEvidenceScore: .9, gridPhaseEvidenceScore: .9,
  edgeEvidenceScore: .9, playableFieldEvidence: .9
});
const diagnostic = (candidates) => ({
  sampleId: 'fixture', ok: true, errorCode: null,
  preprocessing: { sourceWidth: 200, sourceHeight: 200, workingWidth: 200, workingHeight: 200 },
  candidateCount: candidates.length,
  candidateSummaries: candidates
});

test('corner error and board-diagonal normalization are exact', () => {
  const truth = square(0, 0);
  const predicted = truth.map(([x, y]) => [x + 10, y]);
  const metrics = cornerErrorMetrics(predicted, truth, 200, 200);
  assert.deepEqual(metrics.cornerErrorsPx, [10, 10, 10, 10]);
  assert.equal(metrics.meanCornerErrorPx, 10);
  assert.equal(metrics.maxCornerErrorPx, 10);
  assert.equal(metrics.meanNormalizedCornerError, 0.070711);
});

test('quad IoU handles exact, partial, and disjoint convex quads', () => {
  assert.equal(quadIou(square(), square()), 1);
  assert.equal(quadIou(square(), square(50, 0)), 1 / 3);
  assert.equal(quadIou(square(), square(200, 200)), 0);
  assert.equal(polygonArea(square()), 10000);
});

test('candidate matching uses fixed IoU and normalized-corner gates', () => {
  const match = matchCandidate(candidate(), truthSample('field-hard-v0.1-001'), diagnostic([]).preprocessing, 1);
  const miss = matchCandidate(candidate(square(120, 120)), truthSample('field-hard-v0.1-001'), diagnostic([]).preprocessing, 2);
  assert.equal(match.humanMatch, true);
  assert.equal(match.quadIou, 1);
  assert.equal(miss.humanMatch, false);
});

test('diagnosis separates generation, ranking, corner estimation, ambiguity, and homography', () => {
  const match = { rank: 2, humanMatch: true };
  assert.equal(diagnoseSample({ selected: { rank: 1 }, bestMatch: null, bestOverlap: null }), 'GENERATION_FAILURE');
  assert.equal(diagnoseSample({ selected: { rank: 1 }, bestMatch: null, bestOverlap: {} }), 'CORNER_ESTIMATION_FAILURE');
  assert.equal(diagnoseSample({ selected: { rank: 1 }, bestMatch: match, bestOverlap: {} }), 'RANKING_FAILURE');
  assert.equal(diagnoseSample({ selected: null, bestMatch: match, bestOverlap: {} }), 'AMBIGUITY_POLICY_FAILURE');
  assert.equal(diagnoseSample({ selected: null, bestMatch: null, bestOverlap: null, errorCode: 'homography-failed' }), 'HOMOGRAPHY_FAILURE');
});

test('baseline preserves 7 admitted and 5 held samples without inflating independent metrics', () => {
  const truth = { samples: Array.from({ length: 12 }, (_, index) => truthSample(`field-hard-v0.1-${String(index + 1).padStart(3, '0')}`, index >= 7)) };
  const browser = { runtime: 'chromium-browser-production-decode-and-worker', samples: truth.samples.map((sample) => ({
    ...diagnostic([candidate()]), sampleId: sample.sampleId
  })) };
  const audit = { certifiedSource: { sha256: 'A'.repeat(64), preserved: true }, samples: truth.samples.map((sample) => ({
    sampleId: sample.sampleId, platform: 'fixture', captureType: 'camera', orientation: 'white-at-bottom'
  })) };
  const first = buildReports({ truthManifest: truth, browserDiagnostics: browser, auditReport: audit,
    truthSha256: 'B'.repeat(64), browserSha256: 'C'.repeat(64) });
  const second = buildReports({ truthManifest: truth, browserDiagnostics: browser, auditReport: audit,
    truthSha256: 'B'.repeat(64), browserSha256: 'C'.repeat(64) });
  assert.equal(first.baseline.independentAdmitted.sampleCount, 7);
  assert.equal(first.baseline.heldDuplicateGroup.sampleCount, 5);
  assert.deepEqual(first, second);
});
