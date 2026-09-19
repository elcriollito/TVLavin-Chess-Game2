import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const artifact = (name) => new URL(`../artifacts/scanner-piece-classifier-v0.4/${name}`, import.meta.url);
const configUrl = new URL('../scanner/recognition/classifier-revision/config-v0.4.json', import.meta.url);
const trainerUrl = new URL('../tools/train-scanner-piece-classifier-v04.py', import.meta.url);
const readJson = async (url) => JSON.parse(await readFile(url, 'utf8'));
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex').toUpperCase();

test('v0.4 matrix is bounded, development-selected, and calibration cannot sharpen', async () => {
  const [summary, config, configBytes] = await Promise.all([
    readJson(artifact('experiment-summary.json')), readJson(configUrl), readFile(configUrl)
  ]);
  assert.equal(summary.matrix.length, 6);
  assert.deepEqual(config.training.seeds, [2001, 2002]);
  assert.deepEqual(new Set(summary.matrix.map((row) => row.variant)), new Set(config.variants.map((row) => row.id)));
  assert.equal(summary.selected.variant, 'king-auxiliary');
  assert.equal(summary.selected.seed, 2002);
  assert.equal(summary.selected.calibrationMethod, 'raw-no-calibration');
  assert.deepEqual(summary.selected.temperature, { occupancy: 1, color: 1, type: 1 });
  assert.ok(Math.min(...config.calibration.temperatureGrid) >= 1);
  assert.equal(summary.checksums.configSha256, sha256(configBytes));
  assert.equal(summary.protectedBenchmarkPasses, 1);
  assert.equal(summary.runtimeIntegrated, false);
});

test('king auxiliary labels are occupied-only and asymmetric occupancy penalizes false positives', async () => {
  const [config, trainer] = await Promise.all([readJson(configUrl), readFile(trainerUrl, 'utf8')]);
  const auxiliary = config.variants.find((row) => row.id === 'king-auxiliary');
  const asymmetric = config.variants.find((row) => row.id === 'king-auxiliary-asymmetric-occupancy');
  assert.equal(auxiliary.kingAuxiliary, true);
  assert.deepEqual(asymmetric.occupancyWeights, [2, 1]);
  assert.match(trainer, /king_target = \(\(\(labels\[occupied\] - 1\) % 6\) == 5\)\.long\(\)/);
  assert.match(trainer, /output\[3\]\[occupied\], king_target/);
  assert.match(trainer, /weight=weights/);
});

test('protected king false-positive and occupancy burden metrics are internally consistent', async () => {
  const report = await readJson(artifact('protected-summary.json'));
  const king = report.kingSink;
  assert.equal(king.falsek, king.predictedk - king.correctk);
  assert.equal(king.falsek, king.emptyTok + king.otherPieceTok);
  assert.equal(king.falseKingRate, king.falsek / king.predictedk);
  assert.equal(report.occupancy.falsePositivePerBoard, report.occupancy.emptyToOccupied / report.boards);
  assert.equal(report.exactBoards, 11);
  assert.equal(report.exactBoards + report.oneErrorBoards + report.twoErrorBoards + report.threePlusErrorBoards, report.boards);
  assert.equal(report.decision, 'MORE TARGETED CLASSIFIER WORK REQUIRED');
});

test('threshold and king policy remain visual, deterministic, and validation-derived', async () => {
  const [summary, analysis, trainer] = await Promise.all([
    readJson(artifact('experiment-summary.json')), readJson(artifact('development-analysis.json')), readFile(trainerUrl, 'utf8')
  ]);
  assert.equal(summary.selected.occupancyThreshold, 0.5);
  assert.deepEqual(summary.selected.kingPolicy, {
    minimumTypeProbability: 0, minimumTypeMargin: 0, minimumOccupancyProbability: 0.5
  });
  assert.equal(analysis.protectedBenchmarkUsedForSelection, false);
  assert.equal(analysis.blackKingDecomposition.developmentTrain.falseK, 0);
  assert.equal(analysis.blackKingDecomposition.developmentValidation.nTok, 2);
  assert.equal(analysis.occupancyAnalysis.v03DevelopmentTrainFalsePositive, 3);
  assert.deepEqual(analysis.occupancyAnalysis.v03DevelopmentTrainFalsePositiveMetadata.subtypeTags,
    { 'photo-of-screen': 3, 'screen-glare': 1 });
  assert.match(trainer, /next-highest black non-king identity|probability\[:, 7:12\]/);
  assert.doesNotMatch(trainer, /only one black king/i);
});

test('compact reports are deterministic evidence with immutable external checksums', async () => {
  const [first, second, summary] = await Promise.all([
    readFile(artifact('protected-summary.json')), readFile(artifact('protected-summary.json')),
    readJson(artifact('experiment-summary.json'))
  ]);
  assert.equal(sha256(first), sha256(second));
  assert.match(summary.checksums.stateSha256, /^[A-F0-9]{64}$/);
  assert.match(summary.checksums.torchscriptSha256, /^[A-F0-9]{64}$/);
  assert.match(summary.checksums.protectedReportSha256, /^[A-F0-9]{64}$/);
  assert.equal(summary.decision, 'MORE TARGETED CLASSIFIER WORK REQUIRED');
});
