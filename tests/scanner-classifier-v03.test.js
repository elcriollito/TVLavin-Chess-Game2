import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { evaluateHistoricalBoards } from '../scanner/recognition/benchmark/historical-classifier-evaluation.js';
import { CLASSES, stableJson } from '../scanner/recognition/datasets/pieces/dataset-core.js';

const artifact = (name) => new URL(`../artifacts/scanner-piece-classifier-v0.3/${name}`, import.meta.url);
const readJson = async (url) => JSON.parse(await readFile(url, 'utf8'));
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex').toUpperCase();

test('v0.3 report is canonical, frozen, and mirrors the compact experiment evidence', async () => {
  const summaryBytes = await readFile(artifact('experiment-summary.json'));
  const protectedBytes = await readFile(artifact('real-31-board-report.json'));
  const summary = JSON.parse(summaryBytes), report = JSON.parse(protectedBytes);
  const configBytes = await readFile(new URL('../scanner/recognition/classifier-revision/config-v0.3.json', import.meta.url));
  const config = JSON.parse(configBytes);
  assert.equal(summaryBytes.toString(), stableJson(summary));
  assert.equal(protectedBytes.toString(), stableJson(report));
  assert.equal(summary.checksums.configSha256, sha256(configBytes));
  assert.equal(summary.checksums.humanTruthSha256, config.humanTruthSha256);
  assert.equal(summary.checksums.datasetMetadataSha256, config.datasetMetadataSha256);
  assert.equal(summary.checksums.datasetPixelsSha256, config.datasetPixelsSha256);
  assert.equal(report.stateSha256, summary.checksums.stateSha256);
  assert.equal(report.torchscriptSha256, summary.checksums.torchscriptSha256);
  assert.equal(report.modelChangedAfterBenchmark, false);
  assert.equal(report.scannerRuntimeIntegrated, false);
  assert.equal(summary.protectedBenchmarkPasses, 1);
  assert.equal(summary.runtimeIntegrated, false);
});

test('controlled matrix, split roles, threshold and calibration selection stay bounded', async () => {
  const summary = await readJson(artifact('experiment-summary.json'));
  const config = await readJson(new URL('../scanner/recognition/classifier-revision/config-v0.3.json', import.meta.url));
  assert.equal(summary.matrix.length, 6);
  assert.deepEqual(new Set(summary.matrix.map((item) => item.variant)), new Set(config.variants.map((item) => item.id)));
  for (const variant of config.variants) {
    assert.deepEqual(summary.matrix.filter((item) => item.variant === variant.id).map((item) => item.seed), [1901, 1902]);
  }
  const selected = [...summary.matrix].sort((a, b) => b.selectionScore - a.selectionScore)[0];
  assert.equal(summary.selected.variant, selected.variant);
  assert.equal(summary.selected.seed, selected.seed);
  assert.equal(summary.selected.bestEpoch, selected.bestEpoch);
  assert.equal(summary.selected.occupancyThreshold, 0.5);
  assert.ok(config.threshold.grid.includes(summary.selected.occupancyThreshold));
  assert.equal(summary.selected.calibrationMethod, 'separate-head-temperatures');
  assert.deepEqual(summary.selected.temperature, { occupancy: 0.75, color: 0.75, type: 0.75 });
  assert.deepEqual(summary.samplingRatio, { synthetic: 0.8, realDevelopment: 0.2, realEmptyWithinReal: 0.75 });
  assert.equal(summary.hardNegativeMining.role, 'real-development-train-only');
  assert.equal(summary.hardNegativeMining.count, 3);
  assert.equal(summary.hardNegativeMining.developmentValidationUsed, false);
});

test('protected metrics, king sink and correction counts are internally consistent', async () => {
  const report = await readJson(artifact('real-31-board-report.json'));
  const summary = await readJson(artifact('experiment-summary.json'));
  const value = report.calibrated, matrix = value.confusionMatrix, compact = summary.protected31Calibrated;
  assert.deepEqual(report.classOrder, CLASSES);
  assert.equal(matrix.flat().reduce((sum, count) => sum + count, 0), 1984);
  assert.equal(matrix[0].slice(1).reduce((sum, count) => sum + count, 0), value.occupancy.trueEmptyPredictedOccupied);
  assert.equal(matrix.slice(1).reduce((sum, row) => sum + row[0], 0), value.occupancy.trueOccupiedPredictedEmpty);
  assert.equal(matrix.reduce((sum, row) => sum + row[12], 0), value.kingSink.predictedk);
  assert.equal(value.kingSink.predictedk - matrix[0][12] - matrix[12][12], compact.otherPieceTok);
  assert.equal(Object.values(value.colorSwap).reduce((sum, item) => sum + item.whiteToBlack + item.blackToWhite, 0), compact.colorSwaps);
  assert.equal(value.correctionBurden.zero, compact.exactBoards);
  assert.equal(value.correctionBurden.one, compact.oneErrorBoards);
  assert.equal(value.correctionBurden.two, compact.twoErrorBoards);
  assert.equal(value.correctionBurden.threePlus, compact.threePlusErrorBoards);
  assert.equal(value.accuracy13, compact.accuracy13);
  assert.equal(value.confidence.wrongAtLeast090, compact.wrongAtLeast090);
  assert.equal(value.confidence.wrongAtLeast095, compact.wrongAtLeast095);
  assert.ok(value.confidence.wrongAtLeast090 >= value.confidence.wrongAtLeast095);
});

test('occupancy-threshold decisions are scored explicitly while ordinary reports remain argmax-strict', () => {
  const truth = { verifiedBy: 'human', verifiedAt: '2026-09-18T00:00:00Z',
    sourceSha256: 'A'.repeat(64), orientation: 'white-at-bottom', squareLabels: Array(64).fill('empty') };
  const probabilities = [0.4, 0.6, ...Array(11).fill(0)];
  const predictions = Array.from({ length: 64 }, () => ({ predictedClass: 'empty',
    decisionBasis: 'occupancy-threshold', classProbabilities: probabilities }));
  const report = evaluateHistoricalBoards([{ sampleId: 'policy', truth, predictions }]);
  assert.equal(report.accuracy13, 1);
  assert.equal(report.perBoard[0].squarePredictions[0].top1Confidence, 0.4);
  assert.equal(report.perBoard[0].squarePredictions[0].top2, 'P');
  const strict = predictions.map(({ decisionBasis, ...prediction }) => prediction);
  assert.throws(() => evaluateHistoricalBoards([{ sampleId: 'strict', truth, predictions: strict }]), /top probability/);
});
