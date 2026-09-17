import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { HISTORICAL_CLASSES, HISTORICAL_HASHES, histogramNormalize, preprocessCanonicalRgba, HistoricalTFJSBaseline, certifyHistoricalArtifacts } from '../scanner/recognition/benchmark/historical-tfjs-baseline.js';
import { evaluateHistoricalBoards, selectUniqueSources, truthLabels } from '../scanner/recognition/benchmark/historical-classifier-evaluation.js';

const blank = () => Array(64).fill('empty');
const truth = (labels, sourceSha256 = 'A'.repeat(64)) => ({ verifiedBy: 'human-test', verifiedAt: '2026-09-16', sourceSha256, squareLabels: labels });
const prediction = (label, confidence = 1) => {
  const classProbabilities = Array(13).fill((1 - confidence) / 12);
  classProbabilities[HISTORICAL_CLASSES.indexOf(label)] = confidence;
  return { predictedClass: label, classProbabilities };
};

test('historical artifact checksum and label-order contract is immutable', async () => {
  assert.deepEqual(HISTORICAL_CLASSES, ['empty', 'P', 'N', 'B', 'R', 'Q', 'K', 'p', 'n', 'b', 'r', 'q', 'k']);
  assert.equal(HISTORICAL_HASHES['weights.bin'], '2FF117276E1D22BEAC35F2DBDBC4D8A29650917A9D657E81FFDFB026ADD2C458');
  await assert.rejects(() => certifyHistoricalArtifacts(import.meta.dirname), /ENOENT/);
});

test('per-tile historical min-max normalization is deterministic, including low-range bypass', () => {
  const ramp = Uint8Array.from({ length: 1024 }, (_, index) => index % 256);
  assert.deepEqual(histogramNormalize(ramp), histogramNormalize(ramp));
  assert.equal(histogramNormalize(ramp)[0], 0);
  assert.equal(histogramNormalize(ramp)[255], 255);
  const lowContrast = Uint8Array.from({ length: 1024 }, (_, index) => 120 + index % 9);
  assert.deepEqual(histogramNormalize(lowContrast), lowContrast);
});

test('canonical RGBA converts to 64 row-major grayscale 32x32 tiles', async () => {
  const rgba = new Uint8Array(512 * 512 * 4);
  for (let y = 0; y < 512; y++) for (let x = 0; x < 512; x++) {
    const offset = (y * 512 + x) * 4;
    rgba[offset] = x < 256 ? 0 : 255;
    rgba[offset + 1] = rgba[offset];
    rgba[offset + 2] = rgba[offset];
    rgba[offset + 3] = 255;
  }
  const first = await preprocessCanonicalRgba(sharp, rgba.buffer);
  const second = await preprocessCanonicalRgba(sharp, rgba.buffer);
  assert.equal(first.tiles.length, 64);
  assert.ok(first.tiles.every((tile) => tile.length === 1024));
  assert.deepEqual(first.tiles, second.tiles);
  assert.equal(first.tiles[0][0], 0);
  assert.equal(first.tiles[4][31], 255);
});

test('adapter emits 64 normalized 13-class vectors and timing without runtime integration', async () => {
  let disposed = 0;
  const tf = {
    loadLayersModel: async (handler) => {
      await handler.load();
      return { countParams: () => 544909, predict: () => ({ data: async () => Float32Array.from({ length: 64 * 13 }, (_, index) => index % 13 === 0 ? 1 : 0), dispose: () => { disposed++; } }), dispose: () => {} };
    },
    tensor4d: (values, shape) => { assert.deepEqual(shape, [64, 32, 32, 1]); assert.equal(values.length, 65536); return { dispose: () => { disposed++; } }; }
  };
  const artifacts = { model: { modelTopology: {} }, weightSpecs: [], weightData: Buffer.alloc(0), metadata: { version: '4.0.0' } };
  const adapter = await new HistoricalTFJSBaseline({ tf, artifacts }).load();
  const result = await adapter.predictTiles(Array.from({ length: 64 }, () => new Uint8Array(1024)));
  assert.equal(result.predictions.length, 64);
  assert.equal(result.predictions[0].predictedClass, 'empty');
  assert.equal(result.predictions[0].classProbabilities.reduce((a, b) => a + b, 0), 1);
  assert.ok(result.inferenceMs >= 0);
  assert.equal(disposed, 2);
  adapter.dispose();
});

test('truth requires human verification, 64 valid labels, source identity and oriented FEN', () => {
  assert.throws(() => truthLabels({ squareLabels: blank() }), /verifier/);
  assert.throws(() => truthLabels(truth(blank().slice(1))), /64/);
  assert.deepEqual(truthLabels({ ...truth(blank()), orientation: 'white-at-bottom', fenPlacement: '8/8/8/8/8/8/8/8' }), blank());
  assert.throws(() => truthLabels({ ...truth(blank()), fenPlacement: '8/8/8/8/8/8/8/8' }), /orientation/);
});

test('confusion, color swap, exact board, corrections, confidence and report metrics are deterministic', () => {
  const labels = blank(); labels[0] = 'K'; labels[1] = 'B';
  const predictions = labels.map((label) => prediction(label));
  predictions[0] = prediction('k', 0.95);
  predictions[1] = prediction('N', 0.9);
  const boards = [{ sampleId: 'one', truth: truth(labels), predictions, pieceSetFamily: 'outline', sourceCategory: 'digital-2d', difficultyTags: ['low-contrast'] }];
  const one = evaluateHistoricalBoards(boards);
  assert.deepEqual(one, evaluateHistoricalBoards(boards));
  assert.equal(one.squareCount, 64);
  assert.equal(one.accuracy13, 62 / 64);
  assert.equal(one.occupiedVsEmptyAccuracy, 1);
  assert.equal(one.colorSwap.K.whiteToBlack, 1);
  assert.equal(one.pieceTypeConfusion['B->N'], 1);
  assert.equal(one.confusionMatrix[HISTORICAL_CLASSES.indexOf('K')][HISTORICAL_CLASSES.indexOf('k')], 1);
  assert.equal(one.exactBoardAccuracy, 0);
  assert.equal(one.correctionBurden.two, 1);
  assert.equal(one.confidence.highConfidenceErrors.length, 2);
  assert.equal(one.groups.pieceSetFamily.outline.squareAccuracy, 62 / 64);
  const inconsistent = predictions.map((item) => ({ ...item }));
  inconsistent[0] = { ...inconsistent[0], predictedClass: 'K' };
  assert.throws(() => evaluateHistoricalBoards([{ ...boards[0], predictions: inconsistent }]), /top probability/);
});

test('exact duplicate image SHA sources are excluded regardless of sample ID', () => {
  const { selected, duplicates } = selectUniqueSources([{ sampleId: 'v01', sourceSha256: 'A' }, { sampleId: 'v03-overlap', sourceSha256: 'A' }, { sampleId: 'fresh', sourceSha256: 'B' }]);
  assert.deepEqual(selected.map((item) => item.sampleId), ['v01', 'fresh']);
  assert.deepEqual(duplicates, ['v03-overlap']);
});
