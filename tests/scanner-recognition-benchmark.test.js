import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';

import {
  GEOMETRY_FAILURE_TYPE,
  REFERENCE_BOARD_SIZE,
  RecognitionGeometryError,
  createTileDescriptors,
  validateHomographyOutput
} from '../scanner/recognition/benchmark/geometry.js';
import {
  BENCHMARK_SCHEMA_VERSION,
  MANIFEST_SCHEMA_VERSION,
  PIECE_CLASSES,
  fenPlacementToLabels,
  labelsToFenPlacement,
  sha256Bytes,
  validateBenchmarkManifest,
  validateGroupedSplits,
  validateSquareGroundTruth,
  verifyRepositoryFixtureChecksum
} from '../scanner/recognition/benchmark/manifest.js';
import {
  createBenchmarkReport,
  serializeBenchmarkReport,
  summarizeBenchmarkReport
} from '../scanner/recognition/benchmark/evaluator.js';

const fixtureRoot = new URL('../scanner/recognition/benchmark/fixtures/', import.meta.url);
const fixtureManifestUrl = new URL('unit-manifest-v1.json', fixtureRoot);
const fixtureImageUrl = new URL('unit-board.pgm', fixtureRoot);
const recognizer = Object.freeze({
  modelVersion: 'unit-recognizer/1',
  preprocessingVersion: 'unit-preprocessing/1',
  backend: 'deterministic-test',
  device: 'node-test-runner',
  browser: 'not-applicable'
});

async function loadFixtureManifest() {
  return JSON.parse(await readFile(fixtureManifestUrl, 'utf8'));
}

async function fixtureManifestChecksum() {
  return sha256Bytes(await readFile(fixtureManifestUrl));
}

function geometryInput(size, overrides = {}) {
  return {
    width: size,
    height: size,
    pixelSpace: 'canonical-board-pixels',
    sourceCorners: [[0, 0], [size, 0], [size, size], [0, size]],
    transformMetadata: { transformVersion: 'unit-homography/1' },
    orientationState: 'white-at-bottom',
    ...overrides
  };
}

function perfectOutput(sample, overrides = {}) {
  return {
    sampleId: sample.sampleId,
    status: 'candidate',
    boardDetected: true,
    boardCorners: structuredClone(sample.groundTruth.boardCorners),
    orientation: sample.groundTruth.orientation,
    geometry: geometryInput(REFERENCE_BOARD_SIZE),
    squareLabels: [...sample.groundTruth.squareLabels],
    candidateFenPlacement: sample.groundTruth.fenPlacement,
    timingsMs: { total: 12 },
    peakMemoryBytes: 1024,
    ...overrides
  };
}

async function evaluate(outputs, manifest = null) {
  const resolvedManifest = manifest || await loadFixtureManifest();
  return createBenchmarkReport({
    manifest: resolvedManifest,
    outputs,
    manifestChecksum: await fixtureManifestChecksum(),
    recognizer
  });
}

test('reference geometry size is explicit and remains a benchmark choice, not a production decision', () => {
  assert.equal(REFERENCE_BOARD_SIZE, 512);
  assert.equal(REFERENCE_BOARD_SIZE % 8, 0);
});

for (const boardSize of [256, 512, 1024]) {
  test(`${boardSize} geometry yields exactly 64 identical, gapless, non-overlapping tiles`, () => {
    const first = createTileDescriptors(geometryInput(boardSize));
    const second = createTileDescriptors(geometryInput(boardSize));
    const expectedTileSize = boardSize / 8;

    assert.equal(first.tiles.length, 64);
    assert.equal(new Set(first.tiles.map((tile) => tile.y)).size, 8);
    assert.equal(new Set(first.tiles.map((tile) => tile.x)).size, 8);
    assert.deepEqual(new Set(first.tiles.map((tile) => tile.width)), new Set([expectedTileSize]));
    assert.deepEqual(new Set(first.tiles.map((tile) => tile.height)), new Set([expectedTileSize]));
    assert.ok(first.tiles.every((tile) => tile.width === tile.height));
    assert.deepEqual([first.tiles[0].x, first.tiles[0].y], [0, 0]);
    assert.deepEqual([first.tiles[63].x1, first.tiles[63].y1], [boardSize, boardSize]);
    assert.equal(first.tiles.reduce((sum, tile) => sum + tile.width * tile.height, 0), boardSize * boardSize);
    assert.deepEqual(first.tiles.map((tile) => tile.square), [
      'a8', 'b8', 'c8', 'd8', 'e8', 'f8', 'g8', 'h8',
      'a7', 'b7', 'c7', 'd7', 'e7', 'f7', 'g7', 'h7',
      'a6', 'b6', 'c6', 'd6', 'e6', 'f6', 'g6', 'h6',
      'a5', 'b5', 'c5', 'd5', 'e5', 'f5', 'g5', 'h5',
      'a4', 'b4', 'c4', 'd4', 'e4', 'f4', 'g4', 'h4',
      'a3', 'b3', 'c3', 'd3', 'e3', 'f3', 'g3', 'h3',
      'a2', 'b2', 'c2', 'd2', 'e2', 'f2', 'g2', 'h2',
      'a1', 'b1', 'c1', 'd1', 'e1', 'f1', 'g1', 'h1'
    ]);

    const coverage = new Uint8Array(boardSize * boardSize);
    for (const tile of first.tiles) {
      for (let y = tile.y; y < tile.y1; y += 1) {
        for (let x = tile.x; x < tile.x1; x += 1) coverage[y * boardSize + x] += 1;
      }
    }
    assert.ok(coverage.every((count) => count === 1));
    assert.deepEqual(second, first);
  });
}

test('unresolved orientation keeps image-grid coordinates separate from chess-square names', () => {
  const geometry = createTileDescriptors(geometryInput(512, { orientationState: 'unresolved' }));
  assert.equal(geometry.tiles[0].imageGridCoordinate, 'r0c0');
  assert.equal(geometry.tiles[0].square, null);
  assert.equal(geometry.tiles[63].imageGridCoordinate, 'r7c7');
  assert.equal(geometry.tiles[63].file, null);
  assert.equal(geometry.tiles[63].rank, null);
});

test('invalid normalized geometry fails explicitly without rounding or uneven compensation', () => {
  const invalidCases = [
    [geometryInput(255), 'BOARD_SIZE_NOT_DIVISIBLE_BY_8'],
    [geometryInput(510), 'BOARD_SIZE_NOT_DIVISIBLE_BY_8'],
    [geometryInput(512, { height: 504 }), 'NON_SQUARE_BOARD']
  ];
  for (const [input, code] of invalidCases) {
    const validation = validateHomographyOutput(input);
    assert.equal(validation.ok, false);
    assert.equal(validation.error.type, GEOMETRY_FAILURE_TYPE);
    assert.equal(validation.error.code, code);
    assert.throws(() => createTileDescriptors(input), (error) => (
      error instanceof RecognitionGeometryError
      && error.type === GEOMETRY_FAILURE_TYPE
      && error.code === code
    ));
  }
});

test('manifest schema versions and deterministic test fixture validate', async () => {
  const manifest = await loadFixtureManifest();
  assert.equal(manifest.schemaVersion, MANIFEST_SCHEMA_VERSION);
  assert.equal(manifest.samples[0].schemaVersion, BENCHMARK_SCHEMA_VERSION);
  assert.equal(validateBenchmarkManifest(manifest).ok, true);

  const jsonSchema = JSON.parse(await readFile(new URL('../scanner/recognition/benchmark/schema/benchmark-manifest-v1.schema.json', import.meta.url), 'utf8'));
  assert.equal(jsonSchema.properties.schemaVersion.const, MANIFEST_SCHEMA_VERSION);
  assert.equal(jsonSchema.$defs.squareLabels.minItems, 64);
  assert.equal(jsonSchema.$defs.squareLabels.maxItems, 64);
});

test('64-label ground truth round-trips FEN placement in a8-to-h1 ordering', async () => {
  const { groundTruth } = (await loadFixtureManifest()).samples[0];
  assert.equal(groundTruth.squareLabels.length, 64);
  assert.deepEqual(fenPlacementToLabels(groundTruth.fenPlacement), groundTruth.squareLabels);
  assert.equal(labelsToFenPlacement(groundTruth.squareLabels), groundTruth.fenPlacement);
  assert.equal(validateSquareGroundTruth(groundTruth.squareLabels, groundTruth.fenPlacement).ok, true);
});

test('ground truth fails closed on invalid label count, class, or FEN disagreement', async () => {
  const { groundTruth } = (await loadFixtureManifest()).samples[0];
  assert.equal(validateSquareGroundTruth(groundTruth.squareLabels.slice(0, 63), groundTruth.fenPlacement).errors[0].code, 'INVALID_LABEL_COUNT');

  const invalidClass = [...groundTruth.squareLabels];
  invalidClass[0] = 'x';
  assert.equal(validateSquareGroundTruth(invalidClass, groundTruth.fenPlacement).errors[0].code, 'INVALID_PIECE_CLASS');

  const mismatch = [...groundTruth.squareLabels];
  mismatch[0] = 'empty';
  assert.equal(validateSquareGroundTruth(mismatch, groundTruth.fenPlacement).errors[0].code, 'FEN_LABEL_MISMATCH');
});

test('fixture checksum is verified read-only and mismatch is explicit', async () => {
  const manifest = await loadFixtureManifest();
  const beforeBytes = await readFile(fixtureImageUrl);
  const beforeStat = await stat(fixtureImageUrl);
  const result = await verifyRepositoryFixtureChecksum(manifest.samples[0], fixtureRoot);
  const afterBytes = await readFile(fixtureImageUrl);
  const afterStat = await stat(fixtureImageUrl);
  assert.equal(result.ok, true);
  assert.deepEqual(afterBytes, beforeBytes);
  assert.equal(afterStat.mtimeMs, beforeStat.mtimeMs);

  const changed = structuredClone(manifest.samples[0]);
  changed.sourceChecksum = `sha256:${'0'.repeat(64)}`;
  const mismatch = await verifyRepositoryFixtureChecksum(changed, fixtureRoot);
  assert.equal(mismatch.ok, false);
  assert.equal(mismatch.code, 'CHECKSUM_MISMATCH');
});

test('grouped split validator rejects source, position, piece-family, and augmentation leakage', async () => {
  const original = (await loadFixtureManifest()).samples[0];
  const train = structuredClone(original);
  train.sampleId = 'train-copy';
  train.split = 'train';
  const testCopy = structuredClone(original);
  testCopy.sampleId = 'test-copy';
  testCopy.split = 'test';
  const validation = validateGroupedSplits([train, testCopy]);
  assert.equal(validation.ok, false);
  assert.deepEqual(
    validation.errors.map((error) => error.path),
    [
      'grouping.sourceGroup',
      'grouping.positionGroup',
      'grouping.pieceFamilyGroup',
      'grouping.augmentationFamilyGroup'
    ]
  );
});

test('perfect recognizer result reports 100 percent square and exact-board accuracy', async () => {
  const manifest = await loadFixtureManifest();
  const report = await evaluate([perfectOutput(manifest.samples[0])], manifest);
  assert.equal(report.detection.successRate, 1);
  assert.equal(report.geometry.successRate, 1);
  assert.equal(report.orientation.accuracy, 1);
  assert.equal(report.squares.fullClassAccuracy, 1);
  assert.equal(report.positions.exactBoardAccuracy, 1);
  assert.equal(report.positions.exactFenPlacementAccuracy, 1);
  assert.equal(report.correctionBurden.zeroCorrections, 1);
  assert.match(summarizeBenchmarkReport(report), /Exact-board accuracy: 100\.00%/);
});

test('one wrong square preserves high square accuracy but makes exact-board accuracy zero', async () => {
  const manifest = await loadFixtureManifest();
  const output = perfectOutput(manifest.samples[0]);
  output.squareLabels[0] = 'empty';
  delete output.candidateFenPlacement;
  const report = await evaluate([output], manifest);
  assert.equal(report.squares.fullClassAccuracy, 63 / 64);
  assert.equal(report.positions.exactBoardAccuracy, 0);
  assert.equal(report.positions.wrongSquareCount, 1);
  assert.equal(report.correctionBurden.oneCorrection, 1);
  assert.equal(report.correctionBurden.meanCorrections, 1);
  assert.equal(report.correctionBurden.medianCorrections, 1);
});

test('wrong color and wrong piece type are measured independently', async () => {
  const manifest = await loadFixtureManifest();
  const truth = manifest.samples[0].groundTruth.squareLabels;
  const wrongColor = perfectOutput(manifest.samples[0]);
  const pawnIndex = truth.indexOf('P');
  wrongColor.squareLabels[pawnIndex] = 'p';
  delete wrongColor.candidateFenPlacement;
  const colorReport = await evaluate([wrongColor], manifest);
  assert.equal(colorReport.squares.pieceTypeAccuracy, 1);
  assert.ok(colorReport.squares.colorAccuracy < 1);

  const wrongType = perfectOutput(manifest.samples[0]);
  const knightIndex = truth.indexOf('N');
  wrongType.squareLabels[knightIndex] = 'B';
  delete wrongType.candidateFenPlacement;
  const typeReport = await evaluate([wrongType], manifest);
  assert.equal(typeReport.squares.colorAccuracy, 1);
  assert.ok(typeReport.squares.pieceTypeAccuracy < 1);
});

test('missing board, orientation error, and geometry failure remain distinct failures', async () => {
  const manifest = await loadFixtureManifest();
  const sample = manifest.samples[0];
  const missing = await evaluate([{ sampleId: sample.sampleId, status: 'no-board', boardDetected: false }], manifest);
  assert.equal(missing.detection.falseNegative, 1);
  assert.equal(missing.positions.exactBoardAccuracy, 0);

  const wrongOrientation = await evaluate([perfectOutput(sample, { orientation: 'black-at-bottom' })], manifest);
  assert.equal(wrongOrientation.orientation.accuracy, 0);
  assert.equal(wrongOrientation.positions.exactBoardAccuracy, 1);

  const geometryFailure = await evaluate([{
    sampleId: sample.sampleId,
    status: 'geometry-failure',
    boardDetected: true,
    geometry: { valid: false, code: 'NON_SQUARE_BOARD' },
    orientation: 'unknown'
  }], manifest);
  assert.equal(geometryFailure.geometry.failureCount, 1);
  assert.equal(geometryFailure.orientation.ambiguityRate, 1);
});

test('confidence metrics capture a low-confidence wrong square', async () => {
  const manifest = await loadFixtureManifest();
  const sample = manifest.samples[0];
  const output = perfectOutput(sample);
  output.squareLabels[0] = 'empty';
  delete output.candidateFenPlacement;
  output.confidenceBySquare = Array(64).fill(0.99);
  output.confidenceBySquare[0] = 0.4;
  output.probabilitiesBySquare = output.squareLabels.map((predicted, index) => Object.fromEntries(
    PIECE_CLASSES.map((label) => [label, label === predicted ? (index === 0 ? 0.4 : 0.99) : (index === 0 ? 0.6 / 12 : 0.01 / 12)])
  ));
  const report = await evaluate([output], manifest);
  assert.equal(report.confidence.lowConfidenceRecall, 1);
  assert.equal(report.confidence.errorCaptureRate, 1);
  assert.ok(report.confidence.brierScore > 0);
  assert.ok(report.confidence.expectedCalibrationError >= 0);
});

test('benchmark report serialization is byte-deterministic and contains no run timestamp', async () => {
  const manifest = await loadFixtureManifest();
  const reportA = await evaluate([perfectOutput(manifest.samples[0])], manifest);
  const reportB = await evaluate([perfectOutput(manifest.samples[0])], manifest);
  const jsonA = serializeBenchmarkReport(reportA);
  const jsonB = serializeBenchmarkReport(reportB);
  assert.equal(jsonA, jsonB);
  assert.doesNotMatch(jsonA, /generatedAt|timestamp/);
  assert.match(jsonA, /"exactBoardAccuracy": 1/);
});
