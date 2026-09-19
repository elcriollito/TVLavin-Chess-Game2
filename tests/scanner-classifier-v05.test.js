import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const artifact = (name) => new URL(`../artifacts/scanner-piece-classifier-v0.5/${name}`, import.meta.url);
const configUrl = new URL('../scanner/recognition/classifier-revision/config-v0.5.json', import.meta.url);
const trainerUrl = new URL('../tools/train-scanner-piece-classifier-v05.py', import.meta.url);
const scorerUrl = new URL('../tools/score-scanner-piece-classifier-v02-real.mjs', import.meta.url);
const readJson = async (url) => JSON.parse(await readFile(url, 'utf8'));
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex').toUpperCase();

test('v0.5 threshold selection is cost-aware, bounded, and validation-only', async () => {
  const [summary, config, trainer] = await Promise.all([
    readJson(artifact('experiment-summary.json')), readJson(configUrl), readFile(trainerUrl, 'utf8')
  ]);
  assert.equal(config.threshold.falsePositiveCost, 2);
  assert.equal(config.threshold.falseNegativeCost, 1);
  assert.deepEqual(config.threshold.grid, [.5, .55, .6, .65, .7, .75, .8, .85, .9, .95, .975, .99]);
  assert.equal(summary.selected.variant, 'threshold-only');
  assert.equal(summary.selected.occupancyThreshold, .99);
  assert.equal(summary.thresholdSelection.validationFalsePositivePerBoard, 0);
  assert.match(trainer, /falsePositiveCost"\] \* row\["falsePositive"\][\s\S]*falseNegativeCost"\] \* row\["falseNegative"\]/);
  assert.match(trainer, /falsePositivePerBoard/);
  assert.match(config.training.selectionPolicy, /protected benchmark unavailable until freeze/);
});

test('small matrix preserves the king auxiliary and deterministically selects the best gated score', async () => {
  const [summary, config] = await Promise.all([
    readJson(artifact('experiment-summary.json')), readJson(configUrl)
  ]);
  assert.equal(summary.matrix.length, 7);
  assert.equal(summary.matrix.filter((row) => row.seed !== null).length, 6);
  assert.deepEqual(config.training.seeds, [2101, 2102]);
  assert.equal(summary.selected.architecture, 'shared-king-aux');
  assert.equal(summary.selected.kingAuxiliary, true);
  assert.ok(summary.matrix.every((row) => row.kingPreservationPassed));
  const ranked = [...summary.matrix].sort((a, b) => b.selectionScore - a.selectionScore
    || a.variant.localeCompare(b.variant) || (a.seed ?? 0) - (b.seed ?? 0));
  assert.equal(ranked[0].variant, summary.selected.variant);
  assert.equal(summary.selected.occupancyOnlyFineTune, false);
});

test('protected occupancy and king-preservation metrics are internally consistent', async () => {
  const report = await readJson(artifact('protected-summary.json'));
  assert.equal(report.occupancy.falsePositivePerBoard, report.occupancy.emptyToOccupied / report.boards);
  assert.equal(report.kingSink.falseK, report.kingSink.emptyToK + report.kingSink.otherPieceToK);
  assert.equal(report.kingSink.falsek, report.kingSink.emptyTok + report.kingSink.otherPieceTok);
  assert.equal(report.kingSink.falseKRate, report.kingSink.falseK / report.kingSink.predictedK);
  assert.equal(report.kingSink.falseKingRate, report.kingSink.falsek / report.kingSink.predictedk);
  assert.equal(report.exactBoards + report.oneErrorBoards + report.twoErrorBoards
    + report.threePlusErrorBoards, report.boards);
  assert.ok(report.occupancy.precision > report.v04Comparison.occupancyPrecision);
  assert.ok(report.occupancy.emptyToOccupied < report.v04Comparison.emptyToOccupied);
  assert.ok(report.kingSink.predictedk <= report.v04Comparison.predictedk);
});

test('high-confidence false occupancy and abstention capture remain explicit analysis-only evidence', async () => {
  const [report, scorer] = await Promise.all([
    readJson(artifact('protected-summary.json')), readFile(scorerUrl, 'utf8')
  ]);
  assert.ok(report.confidence.falseOccupancyAtLeast095 <= report.confidence.falseOccupancyAtLeast090);
  assert.equal(report.abstention.coverage, report.abstention.accepted / report.abstention.total);
  assert.equal(report.abstention.abstainedErrorRate, 76 / report.abstention.abstained);
  assert.equal(report.abstention.falseOccupancyCapturedFraction,
    report.abstention.falseOccupancyCaptured / report.abstention.falseOccupancyTotal);
  assert.equal(report.abstention.runtimeIntegrated, false);
  assert.match(scorer, /falseOccupancyAtLeast090/);
  assert.match(scorer, /falseOccupancyWithAnySignal/);
});

test('development decomposition and compact reports are deterministic immutable evidence', async () => {
  const [analysis, summary, configBytes, first, second] = await Promise.all([
    readJson(artifact('development-analysis.json')), readJson(artifact('experiment-summary.json')),
    readFile(configUrl), readFile(artifact('protected-summary.json')), readFile(artifact('protected-summary.json'))
  ]);
  assert.equal(analysis.protectedBenchmarkUsed, false);
  assert.deepEqual(analysis.falseOccupancy.rankedPredictedClasses,
    [{ class: 'n', count: 2 }, { class: 'p', count: 1 }]);
  assert.equal(analysis.falseOccupancy.failures.length, 3);
  assert.equal(analysis.occupancyDistributions.trueOccupied.probabilityMinimum > .99, true);
  assert.equal(summary.checksums.configSha256, sha256(configBytes));
  assert.equal(sha256(first), sha256(second));
  assert.equal(summary.protectedBenchmarkPasses, 1);
  assert.equal(summary.runtimeIntegrated, false);
  assert.equal(summary.decision, 'PROMISING REVISION — READY FOR PHASE 3-008');
});
