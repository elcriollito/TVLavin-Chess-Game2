import test from 'node:test';
import assert from 'node:assert/strict';
import { HISTORICAL_CLASSES } from '../scanner/recognition/benchmark/historical-tfjs-baseline.js';
import { NONSTANDARD_EDGE_CASE, certifyVerifiedRealEligibility }
  from '../scanner/recognition/benchmark/historical-classifier-eligibility.js';
import { evaluateHistoricalBoards, knownHardCaseObservations, selectUniqueSources }
  from '../scanner/recognition/benchmark/historical-classifier-evaluation.js';

const labels = () => Array(64).fill('empty');
const prediction = (label, confidence = 1) => {
  const classProbabilities = Array(13).fill((1 - confidence) / 12);
  classProbabilities[HISTORICAL_CLASSES.indexOf(label)] = confidence;
  return { predictedClass: label, classProbabilities };
};
const board = (sampleId, truthLabels, errors = {}) => ({ sampleId,
  truth: { verifiedBy: 'Alexander', reviewedAgainstRectifiedBoard: true,
    sourceSha256: 'A'.repeat(64), orientation: 'white-at-bottom', squareLabels: truthLabels },
  predictions: truthLabels.map((label, index) => prediction(errors[index] || label)),
  pieceSetStyle: 'outline', pieceSetFamily: 'unknown', sourceCategory: 'printed', difficultyTags: ['book'] });

test('31-board eligibility retains the artistic edge case without scoring it or an alias', () => {
  const samples = Array.from({ length: 31 }, (_, index) => ({ sampleId: `board-${index}`,
    sourceSha256: index.toString(16).toUpperCase().padStart(64, '0') }));
  samples.push({ sampleId: NONSTANDARD_EDGE_CASE.sampleId, sourceSha256: 'F'.repeat(64) });
  const manifest = { samples: samples.map((sample) => ({ sampleId: sample.sampleId,
    annotation: { status: sample.sampleId === NONSTANDARD_EDGE_CASE.sampleId ? 'draft' : 'verified' } })) };
  const certified = certifyVerifiedRealEligibility(samples, manifest);
  assert.equal(certified.scoredBoards, 31);
  assert.equal(certified.scoredSquares, 1984);
  assert.equal(certified.scoringSampleIds.includes(NONSTANDARD_EDGE_CASE.sampleId), false);
  assert.deepEqual(certified.excluded, { ...NONSTANDARD_EDGE_CASE, annotationStatus: 'draft' });
  manifest.samples[0].annotation.status = 'draft';
  assert.throws(() => certifyVerifiedRealEligibility(samples, manifest), /31 human-verified/);
  manifest.samples[0].annotation.status = 'verified';
  samples[1].sourceSha256 = samples[0].sourceSha256;
  assert.throws(() => certifyVerifiedRealEligibility(samples, manifest), /alias/);
  assert.equal(selectUniqueSources(samples).duplicates.length, 1);
});

test('13-class, color/type, exact-board, correction and confidence metrics are deterministic', () => {
  const truth = labels(); truth[0] = 'K'; truth[1] = 'B'; truth[2] = 'p'; truth[3] = 'N';
  const one = board('board-one', truth, { 0: 'k', 1: 'N', 2: 'P' });
  one.predictions[0] = prediction('k', 0.95);
  const exact = board('board-exact', labels());
  const report = evaluateHistoricalBoards([one, exact]);
  assert.equal(report.boardCount, 2);
  assert.equal(report.squareCount, 128);
  assert.equal(report.accuracy13, 125 / 128);
  assert.equal(report.occupiedVsEmptyAccuracy, 1);
  assert.equal(report.pieceTypeAccuracyOnTrueOccupied, 3 / 4);
  assert.equal(report.colorAccuracyOnTrueOccupied, 2 / 4);
  assert.equal(report.whitePieceAccuracy, 1 / 3);
  assert.equal(report.blackPieceAccuracy, 0);
  assert.equal(report.totalColorSwaps, 2);
  assert.equal(report.colorSwapsAsFractionOfOccupiedErrors, 2 / 3);
  assert.equal(report.colorSwap.K.whiteToBlack, 1);
  assert.equal(report.colorSwap.P.blackToWhite, 1);
  assert.equal(report.pieceTypeConfusion['B->N'], 1);
  assert.equal(report.confusionMatrix[6][12], 1);
  assert.equal(report.exactBoardAccuracy, 0.5);
  assert.equal(report.correctionBurden.zero, 1);
  assert.equal(report.correctionBurden.threePlus, 1);
  assert.equal(report.correctionBurden.mean, 1.5);
  assert.equal(report.groups.pieceSetStyle.outline.squares, 128);
  assert.equal(report.groups.pieceSetStyle.outline.colorSwapRateOnTrueOccupied, 0.5);
  assert.equal(report.perClass.find((item) => item.label === 'K').f1, null);
  assert.ok(report.confidence.brier13 > 0);
  assert.ok(report.confidence.ece10 !== null);
  assert.equal(report.confidence.highConfidenceErrors.length, 3);
  assert.equal(report.perBoard[0].squarePredictions[0].square, 'a8');
  assert.equal(report.perBoard[0].squarePredictions[0].top1, 'k');
  assert.equal(report.perBoard[0].squarePredictions[0].top2, 'empty');
  assert.equal(report.perBoard[0].squarePredictions[0].classProbabilities.length, 13);
  assert.equal(JSON.stringify(report), JSON.stringify(evaluateHistoricalBoards([one, exact])));
});

test('zero, one, two and three-plus board buckets and structural warnings do not alter scores', () => {
  const truth = labels(); truth[0] = 'K'; truth[63] = 'k';
  const cases = [board('zero', truth), board('one', truth, { 0: 'empty' }),
    board('two', truth, { 0: 'k', 63: 'K' }), board('three', truth, { 0: 'empty', 1: 'P', 63: 'empty' })];
  const metrics = evaluateHistoricalBoards(cases);
  assert.deepEqual([metrics.correctionBurden.zero, metrics.correctionBurden.one,
    metrics.correctionBurden.two, metrics.correctionBurden.threePlus], [1, 1, 1, 1]);
  assert.equal(metrics.correctionBurden.median, 1.5);
  assert.equal(metrics.perBoard.find((item) => item.sampleId === 'one').structuralWarnings.includes('missing-white-king'), true);
  assert.equal(metrics.perBoard.find((item) => item.sampleId === 'three').structuralWarnings.includes('pawn-on-back-rank'), true);
  assert.equal(metrics.perBoard.find((item) => item.sampleId === 'zero').structuralWarnings.length, 0);
  assert.equal(metrics.exactBoardAccuracy, 0.25);
});

test('partial hard-case matches retain model evidence without claiming a Chessvision comparison', () => {
  const truth = labels(); truth[60] = 'K';
  const metrics = evaluateHistoricalBoards([board('candidate', truth, { 60: 'k' })]);
  const observations = knownHardCaseObservations(metrics.perBoard);
  assert.equal(observations.find((item) => item.id === 'C').candidates[0].sampleId, 'candidate');
  assert.equal(observations.find((item) => item.id === 'C').candidates[0].observations[0].top1, 'k');
  assert.equal(observations.find((item) => item.id === 'C').candidates[0].matchesPreviouslyObservedChessvisionError, null);
  assert.equal(observations.find((item) => item.id === 'A').candidates.length, 0);
});
