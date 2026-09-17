import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { CLASSES } from '../scanner/recognition/datasets/pieces/dataset-core.js';
import { buildComparison, writeComparison } from '../tools/compare-scanner-piece-classifier-v02.mjs';

const path = (name) => new URL(`../artifacts/scanner-piece-classifier-v0.2/${name}`, import.meta.url);
const json = async (name) => JSON.parse(await readFile(path(name), 'utf8'));
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex').toUpperCase();

test('controlled matrix, masked-head contract and freeze use validation only', async () => {
  const configBytes = await readFile(new URL('../scanner/recognition/classifier-revision/config-v0.2.json', import.meta.url));
  const config = JSON.parse(configBytes), summary = await json('training-summary.json');
  const freeze = await json('freeze-manifest.json'), validation = await json('validation-report.json');
  const synthetic = await json('synthetic-test-report.json');
  assert.equal(freeze.configSha256, sha(configBytes));
  assert.equal(freeze.datasetMetadataSha256, config.datasetMetadataSha256);
  assert.equal(freeze.datasetPixelsSha256, config.datasetPixelsSha256);
  assert.deepEqual(freeze.classOrder, CLASSES);
  assert.deepEqual(freeze.inputShape, [null, 3, 64, 64]);
  assert.equal(summary.attempts.length, 6);
  assert.deepEqual(new Set(summary.attempts.map((item) => item.variant)), new Set(config.variants.map((item) => item.id)));
  for (const variant of config.variants) {
    assert.deepEqual(summary.attempts.filter((item) => item.variant === variant.id).map((item) => item.seed), [1801, 1802]);
  }
  const best = [...summary.attempts].sort((a, b) => b.validationSelectionScore - a.validationSelectionScore
    || a.validation.confidence.nll13 - b.validation.confidence.nll13
    || a.variant.localeCompare(b.variant) || a.seed - b.seed)[0];
  assert.equal(freeze.selectedVariant, best.variant);
  assert.equal(freeze.selectedSeed, best.seed);
  assert.equal(freeze.selectedBestEpoch, best.bestEpoch);
  assert.equal(freeze.parameterCount, 649706);
  assert.equal(summary.realTrainingTiles, 0);
  assert.match(summary.selectionPolicy, /validation only/);
  assert.match(freeze.selectionEvidence, /no synthetic test or real inference/);
  assert.match(config.training.multiLoss, /color\|occupied/);
  assert.match(config.training.multiLoss, /type\|occupied/);
  assert.deepEqual(Object.keys(validation.byFamilyCalibrated).sort(), [...config.training.validationFamilies].sort());
  assert.deepEqual(Object.keys(synthetic.byFamilyCalibrated).sort(), [...config.training.testFamilies].sort());
  assert.equal(validation.raw.sampleCount, 1440);
  assert.equal(synthetic.raw.sampleCount, 1440);
  assert.equal(synthetic.stateSha256, freeze.stateSha256);
  assert.match(freeze.stateSha256, /^[0-9A-F]{64}$/);
  assert.match(freeze.torchscriptSha256, /^[0-9A-F]{64}$/);
});

test('canonical hierarchical derivation and occupancy gating preserve exact class order', () => {
  const combine = (occ, white, type) => [1 - occ, ...type.map((value) => occ * white * value),
    ...type.map((value) => occ * (1 - white) * value)];
  const argmax = (values) => values.indexOf(Math.max(...values));
  const king = [0, 0, 0, 0, 0, 1];
  assert.equal(CLASSES[argmax(combine(0.1, 0.9, king))], 'empty');
  assert.equal(CLASSES[argmax(combine(0.99, 0.99, king))], 'K');
  assert.equal(CLASSES[argmax(combine(0.99, 0.01, king))], 'k');
  assert.equal(combine(0.7, 0.4, king).reduce((sum, value) => sum + value, 0), 1);
});

test('king/non-king contrast cohort is split-bound, tone-complete and uses the one frozen test matrix', async () => {
  const contrast = await json('king-contrast-set.json');
  const config = JSON.parse(await readFile(new URL('../scanner/recognition/classifier-revision/config-v0.2.json', import.meta.url)));
  const synthetic = await json('synthetic-test-report.json');
  assert.equal(contrast.datasetMetadataSha256, config.datasetMetadataSha256);
  assert.deepEqual(contrast.classScope, ['empty', 'B', 'R', 'Q', 'K', 'b', 'r', 'q', 'k']);
  assert.deepEqual([contrast.bySplit.train.sampleCount, contrast.bySplit.validation.sampleCount,
    contrast.bySplit.test.sampleCount], [4480, 1280, 1280]);
  for (const group of Object.values(contrast.bySplit)) {
    assert.equal(group.byTone.light + group.byTone.dark, group.sampleCount);
    assert.equal(Object.keys(group.byTheme).length, 10);
    assert.match(group.sampleIdsSha256, /^[0-9A-F]{64}$/);
    assert.ok(group.screenEffectProxy > 0 && group.printEffectProxy > 0);
  }
  assert.equal(contrast.syntheticTestFromSingleFrozenPass.raw.emptyTok, synthetic.raw.confusionMatrix[0][12]);
  assert.equal(contrast.syntheticTestFromSingleFrozenPass.raw.predictedk, 46);
  assert.match(contrast.coverageLimitations, /no certified outline-versus-solid/);
});

test('real raw/calibrated confusion, occupancy, king sink, corrections and calibration are internally consistent', async () => {
  const report = await json('real-31-board-report.json');
  const freeze = await json('freeze-manifest.json');
  assert.equal(report.stateSha256, freeze.stateSha256);
  assert.deepEqual(report.classOrder, CLASSES);
  assert.equal(report.boardCount, 31);
  assert.equal(report.squareCount, 1984);
  assert.equal(report.modelChangedAfterBenchmark, false);
  assert.equal(report.scannerRuntimeIntegrated, false);
  for (const key of ['raw', 'calibrated']) {
    const value = report[key], matrix = value.confusionMatrix;
    assert.equal(matrix.flat().reduce((sum, count) => sum + count, 0), 1984);
    assert.equal(matrix[0].slice(1).reduce((sum, count) => sum + count, 0), value.occupancy.trueEmptyPredictedOccupied);
    assert.equal(matrix.slice(1).reduce((sum, row) => sum + row[0], 0), value.occupancy.trueOccupiedPredictedEmpty);
    assert.equal(matrix.reduce((sum, row) => sum + row[12], 0), value.kingSink.predictedk);
    assert.equal(matrix[0][12], value.kingSink.emptyTok);
    assert.equal(matrix[0][6], value.kingSink.emptyToK);
    assert.equal(matrix.reduce((sum, row, index) => sum + row[index], 0) / 1984, value.accuracy13);
    assert.equal(value.perClass.slice(1).reduce((sum, item) => sum + (item.f1 ?? 0), 0) / 12, value.occupiedMacroF1);
    assert.equal(value.perBoard.reduce((sum, board) => sum + board.wrongSquares, 0) / 31, value.correctionBurden.mean);
    assert.equal(value.correctionBurden.zero + value.correctionBurden.one + value.correctionBurden.two + value.correctionBurden.threePlus, 31);
    assert.equal(value.exactBoardAccuracy, value.correctionBurden.zero / 31);
    assert.equal(Object.values(value.colorSwap).reduce((sum, item) => sum + item.whiteToBlack + item.blackToWhite, 0), value.totalColorSwaps);
    assert.ok(value.confidence.brier13 > 0 && value.confidence.ece10 > 0);
    assert.ok(value.confidence.wrongAtLeast090 >= value.confidence.highestConfidenceErrors.length);
    assert.equal(value.chessAwareSignals.boardsWithAnyWarning,
      value.perBoard.filter((board) => board.structuralWarnings.length).length);
    assert.ok(value.uncertainty.anySignal >= value.uncertainty.errorsWithAnySignal);
  }
});

test('comparison is deterministic and refuses mismatched frozen artifact', async () => {
  const input = {
    historical: JSON.parse(await readFile(new URL('../artifacts/scanner-classifier-baseline/historical-tfjs-verified-real-benchmark.json', import.meta.url))),
    v01: JSON.parse(await readFile(new URL('../artifacts/scanner-piece-classifier-v0.1/real-31-board-report.json', import.meta.url))),
    current: await json('real-31-board-report.json'), freeze: await json('freeze-manifest.json'),
    performance: await json('performance-report.json'), hashes: {}
  };
  const comparison = buildComparison(input);
  assert.equal(comparison.decision, 'MORE DATA / ARCHITECTURE WORK REQUIRED');
  assert.equal(comparison.kingSink.v02Raw.emptyTok, 66);
  assert.throws(() => buildComparison({ ...input, freeze: { ...input.freeze, stateSha256: '0'.repeat(64) } }), /mismatch/);
  assert.equal((await writeComparison({ check: true })).sha256, sha(await readFile(path('historical-comparison.json'))));
});
