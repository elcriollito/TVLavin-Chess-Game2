import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { buildComparison, writeComparison } from '../tools/compare-scanner-piece-classifier.mjs';
import { CERTIFIED_CATALOG_SHA256, CERTIFIED_MANIFEST_SHA256, RGB_BYTES_PER_TILE, syntheticRgb64 }
  from '../scanner/recognition/classifier-baseline/data-contract.js';
import { CLASSES } from '../scanner/recognition/datasets/pieces/dataset-core.js';
import { evaluateHistoricalBoards } from '../scanner/recognition/benchmark/historical-classifier-evaluation.js';

const artifact = (name) => new URL(`../artifacts/scanner-piece-classifier-v0.1/${name}`, import.meta.url);
const json = async (path) => JSON.parse(await readFile(path, 'utf8'));
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex').toUpperCase();

test('certified dataset identity, whole-family split, balance and 13-class contract are bound to the frozen artifact', async () => {
  const config = await json(new URL('../scanner/recognition/classifier-baseline/config-v0.1.json', import.meta.url));
  const training = await json(artifact('training-summary.json'));
  const validation = await json(artifact('validation-report.json'));
  const synthetic = await json(artifact('synthetic-test-report.json'));
  const freeze = await json(artifact('freeze-manifest.json'));
  assert.equal(config.datasetManifestSha256, CERTIFIED_MANIFEST_SHA256);
  assert.equal(config.catalogSha256, CERTIFIED_CATALOG_SHA256);
  assert.equal(training.datasetManifestSha256, CERTIFIED_MANIFEST_SHA256);
  assert.equal(synthetic.datasetManifestSha256, CERTIFIED_MANIFEST_SHA256);
  assert.deepEqual(config.classOrder, CLASSES);
  assert.deepEqual(training.classOrder, CLASSES);
  assert.deepEqual(freeze.classOrder, CLASSES);
  assert.deepEqual(freeze.inputShape, [null, 3, 64, 64]);
  assert.equal(freeze.parameterCount, 617453);
  assert.equal(training.realTrainingTiles, 0);
  assert.equal(training.syntheticTestSeenBeforeFreeze, false);
  assert.deepEqual(training.seedResults.map((item) => item.trainingSeed), [1701, 1702, 1703]);
  assert.equal(training.selectedSeed, freeze.selectedSeed);
  assert.equal(training.selectedBestEpoch, freeze.bestEpoch);
  assert.deepEqual(Object.keys(validation.byFamily).sort(), [...config.training.validationFamilies].sort());
  assert.deepEqual(Object.keys(synthetic.byFamily).sort(), [...config.training.testFamilies].sort());
  assert.equal(validation.metrics.sampleCount, 960);
  assert.equal(synthetic.metrics.sampleCount, 960);
  assert.equal(training.seedResults.every((item) => item.bestEpoch > 1 && item.epochsRun <= 35), true);
  assert.equal(training.seedResults.every((item) => item.validation.perClass.every((entry) => entry.support === (entry.label === 'empty' ? 480 : 40))), true);
  assert.equal(synthetic.metrics.perClass.every((entry) => entry.support === (entry.label === 'empty' ? 480 : 40)), true);
  assert.equal(digest(await readFile(new URL('../scanner/recognition/classifier-baseline/config-v0.1.json', import.meta.url))), freeze.configSha256);
  assert.match(freeze.stateSha256, /^[A-F0-9]{64}$/);
  assert.match(freeze.torchscriptSha256, /^[A-F0-9]{64}$/);
});

test('RGB64 preprocessing is deterministic, retains color and emits exact model input bytes', async () => {
  const source = Buffer.alloc(128 * 128 * 3);
  for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
    const i = (y * 128 + x) * 3;
    source[i] = x * 2; source[i + 1] = y * 2; source[i + 2] = 20;
  }
  const png = await sharp(source, { raw: { width: 128, height: 128, channels: 3 } }).png().toBuffer();
  const first = await syntheticRgb64(png), second = await syntheticRgb64(png);
  assert.equal(first.length, RGB_BYTES_PER_TILE);
  assert.deepEqual(first, second);
  const offDiagonal = (15 * 64 + 45) * 3;
  assert.notEqual(first[offDiagonal], first[offDiagonal + 1]);
  assert.equal(first[2], 20);
});

test('real report recomputes macro-F1, color swaps, correction buckets, confidence and confusion contracts', async () => {
  const current = await json(artifact('real-31-board-report.json'));
  const freeze = await json(artifact('freeze-manifest.json'));
  assert.equal(current.stateSha256, freeze.stateSha256);
  assert.deepEqual(current.classOrder, CLASSES);
  assert.equal(current.boardCount, 31);
  assert.equal(current.squareCount, 1984);
  const matrix = current.confusionMatrix;
  assert.equal(matrix.length, 13);
  assert.equal(matrix.flat().reduce((sum, value) => sum + value, 0), 1984);
  assert.equal(matrix.reduce((sum, row, index) => sum + row[index], 0) / 1984, current.accuracy13);
  const f1 = CLASSES.slice(1).map((label, offset) => {
    const index = offset + 1, tp = matrix[index][index];
    const actual = matrix[index].reduce((sum, value) => sum + value, 0);
    const predicted = matrix.reduce((sum, row) => sum + row[index], 0);
    return tp ? 2 * tp / (actual + predicted) : 0;
  });
  assert.ok(Math.abs(f1.reduce((sum, value) => sum + value, 0) / 12 - current.occupiedMacroF1) < 1e-12);
  assert.equal(Object.values(current.colorSwap).reduce((sum, item) => sum + item.whiteToBlack + item.blackToWhite, 0), current.totalColorSwaps);
  assert.equal(current.perBoard.reduce((sum, board) => sum + board.wrongSquares, 0) / 31, current.correctionBurden.mean);
  assert.equal(current.correctionBurden.zero + current.correctionBurden.one + current.correctionBurden.two + current.correctionBurden.threePlus, 31);
  assert.equal(current.exactBoardAccuracy, current.correctionBurden.zero / 31);
  assert.equal(current.chessAwareSignals.boardsWithAnyWarning, current.perBoard.filter((board) => board.structuralWarnings.length).length);
  for (const field of ['meanTop1', 'meanTop2', 'meanMargin', 'brier13', 'ece10', 'meanTop1Correct', 'meanTop1Incorrect']) {
    assert.equal(Number.isFinite(current.confidence[field]), true);
  }
  assert.equal(current.confidence.bins.reduce((sum, bin) => sum + bin.count, 0), 1984);
  assert.equal(current.confidence.wrongAtLeast090 >= current.confidence.highestConfidenceErrors.length, true);
  assert.equal(current.modelChangedAfterBenchmark, false);
  assert.equal(current.scannerRuntimeIntegrated, false);
});

test('scorer metric semantics cover swaps, macro-F1, exact boards and high-confidence errors', () => {
  const labels = Array(64).fill('empty'); labels[0] = 'K'; labels[1] = 'k'; labels[2] = 'P';
  const probability = (label) => CLASSES.map((item) => item === label ? 0.95 : 0.05 / 12);
  const makeBoard = (sampleId, found) => ({ sampleId,
    truth: { verifiedBy: 'Alexander', reviewedAgainstRectifiedBoard: true, sourceSha256: 'A'.repeat(64),
      orientation: 'white-at-bottom', squareLabels: labels },
    predictions: found.map((label) => ({ predictedClass: label, classProbabilities: probability(label) })) });
  const mismatched = [...labels]; mismatched[0] = 'k'; mismatched[2] = 'B';
  const metrics = evaluateHistoricalBoards([makeBoard('one', labels), makeBoard('two', mismatched)]);
  const macro = metrics.perClass.slice(1).reduce((sum, item) => sum + (item.f1 ?? 0), 0) / 12;
  assert.equal(metrics.totalColorSwaps, 1);
  assert.equal(metrics.pieceTypeConfusion['P->B'], 1);
  assert.equal(metrics.correctionBurden.zero, 1);
  assert.equal(metrics.correctionBurden.two, 1);
  assert.equal(metrics.exactBoardAccuracy, 0.5);
  assert.equal(metrics.confidence.highConfidenceErrors.length, 2);
  assert.ok(macro > 0 && macro < 1);
  assert.ok(metrics.confidence.brier13 > 0);
  assert.ok(metrics.confidence.ece10 > 0);
  assert.deepEqual(metrics, evaluateHistoricalBoards([makeBoard('one', labels), makeBoard('two', mismatched)]));
});

test('comparison checksum binding rejects swapped checkpoint and generated report is deterministic', async () => {
  const historical = await json(new URL('../artifacts/scanner-classifier-baseline/historical-tfjs-verified-real-benchmark.json', import.meta.url));
  const historicalPerformance = await json(new URL('../artifacts/scanner-classifier-baseline/historical-tfjs-verified-real-performance.json', import.meta.url));
  const current = await json(artifact('real-31-board-report.json'));
  const freeze = await json(artifact('freeze-manifest.json'));
  const performance = await json(artifact('performance-report.json'));
  const args = { historical, historicalPerformance, current, freeze, performance, hashes: {} };
  const report = buildComparison(args);
  assert.equal(report.decision, 'DATASET / ARCHITECTURE NEEDS REVISION');
  assert.equal(report.rows.find((row) => row.name === 'high-confidence wrong >=0.90').newBaseline, 144);
  assert.throws(() => buildComparison({ ...args, freeze: { ...freeze, stateSha256: '0'.repeat(64) } }), /same 31-board/);
  assert.equal((await writeComparison({ check: true })).sha256, digest(await readFile(artifact('historical-comparison.json'))));
});
