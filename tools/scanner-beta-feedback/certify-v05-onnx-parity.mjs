import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inferFrozenV05Onnx, RECOGNITION_PROTOCOL } from '../../api/_lib/scanner-beta-inference.js';
import { inferFrozenV05 } from './inference-adapter.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const DEFAULT_DATASET = resolve(ROOT, '..', 'caissa', '_scanner', '_dataset_v05_007cb_session_isolated');
const GOLDEN_PATH = resolve(ROOT, 'scanner', 'recognition', 'production-inference', 'golden-fixtures-v01.json');
const TILE_BYTES = 64 * 64 * 3;
const CLASSES = ['empty', 'P', 'N', 'B', 'R', 'Q', 'K', 'p', 'n', 'b', 'r', 'q', 'k'];
// The first independent 256-tile conversion run measured 7.22e-7 maximum
// absolute probability drift. Five micro-units preserves a strict margin for
// supported CPU kernels without permitting a threshold or class change.
const MAX_DELTA_TOLERANCE = 5e-6;

function sha256(value) {
  return createHash('sha256').update(value).digest('hex').toUpperCase();
}

function valueAfter(flag, fallback) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function selectMixedBoard(records) {
  const selected = [];
  const used = new Set();
  const add = (record) => {
    if (record && !used.has(record.index) && selected.length < 64) {
      used.add(record.index); selected.push(record);
    }
  };
  const synthetic = records.filter(row => row.dataRole.startsWith('synthetic-'));
  for (let round = 0; round < 2; round += 1) {
    for (const label of CLASSES) {
      const choices = synthetic.filter(row => row.classLabel === label && !used.has(row.index));
      add(choices[(round * 7 + CLASSES.indexOf(label)) % Math.max(1, choices.length)]);
    }
  }
  for (const family of [...new Set(synthetic.map(row => row.pieceSetId).filter(Boolean))].sort()) {
    add(synthetic.find(row => row.pieceSetId === family && !used.has(row.index)));
  }
  for (const tone of ['light', 'dark']) add(synthetic.find(row => row.squareTone === tone && !used.has(row.index)));
  for (const role of ['real-development-validation', 'real-development-train']) {
    for (const label of CLASSES) add(records.find(row => row.dataRole === role && row.classLabel === label && !used.has(row.index)));
  }
  for (const row of records) {
    if (row.hardNegative && !used.has(row.index)) add(row);
    if (selected.length === 64) break;
  }
  for (const row of synthetic) {
    add(row);
    if (selected.length === 64) break;
  }
  if (selected.length !== 64 || !CLASSES.every(label => selected.some(row => row.classLabel === label))) {
    throw new Error('GOLDEN_SELECTION_INCOMPLETE');
  }
  return selected;
}

function realBoards(records) {
  const grouped = new Map();
  for (const record of records.filter(row => row.dataRole.startsWith('real-development-'))) {
    if (!grouped.has(record.boardSampleId)) grouped.set(record.boardSampleId, []);
    grouped.get(record.boardSampleId).push(record);
  }
  const complete = [...grouped.entries()].filter(([, rows]) => rows.length === 64)
    .map(([id, rows]) => ({ id, rows: rows.sort((a, b) => a.canonicalSquareIndex - b.canonicalSquareIndex) }));
  const validation = complete.filter(item => item.rows[0].dataRole === 'real-development-validation');
  const training = complete.filter(item => item.rows[0].dataRole === 'real-development-train');
  if (validation.length < 2 || training.length < 1) throw new Error('REAL_BOARD_FIXTURES_UNAVAILABLE');
  return [validation[0], validation[1], training[0]];
}

function assembleBoard(rows, pixels, orientation) {
  const board = Buffer.alloc(512 * 512 * 4, 255);
  for (let visualIndex = 0; visualIndex < 64; visualIndex += 1) {
    const canonicalIndex = orientation === 'black-at-bottom' ? 63 - visualIndex : visualIndex;
    const record = rows[canonicalIndex];
    const tile = pixels.subarray(record.index * TILE_BYTES, (record.index + 1) * TILE_BYTES);
    const tileRow = Math.floor(visualIndex / 8);
    const tileColumn = visualIndex % 8;
    for (let y = 0; y < 64; y += 1) {
      for (let x = 0; x < 64; x += 1) {
        const source = (y * 64 + x) * 3;
        const target = ((tileRow * 64 + y) * 512 + tileColumn * 64 + x) * 4;
        board[target] = tile[source]; board[target + 1] = tile[source + 1]; board[target + 2] = tile[source + 2];
      }
    }
  }
  return board;
}

function probabilityValues(row) {
  return [row.occupancyProbability, ...row.colorProbabilities, ...row.pieceTypeProbabilities, row.kingAuxiliaryProbability];
}

function compare(reference, production, aggregate) {
  if (reference.predictedFEN !== production.predictedFEN) aggregate.fullBoardAgreement = false;
  for (let index = 0; index < 64; index += 1) {
    const expected = reference.squarePredictions[index];
    const actual = production.squarePredictions[index];
    aggregate.classTotal += 1;
    if (expected.predictedClass === actual.predictedClass) aggregate.classMatches += 1;
    const expectedOccupied = expected.occupancyProbability >= 0.99;
    const actualOccupied = actual.occupancyProbability >= 0.99;
    if (expectedOccupied === actualOccupied) aggregate.thresholdMatches += 1;
    const left = probabilityValues(expected);
    const right = probabilityValues(actual);
    for (let valueIndex = 0; valueIndex < left.length; valueIndex += 1) {
      const delta = Math.abs(left[valueIndex] - right[valueIndex]);
      aggregate.maximumDelta = Math.max(aggregate.maximumDelta, delta);
      aggregate.deltaTotal += delta;
      aggregate.deltaCount += 1;
    }
  }
}

async function main() {
  const datasetDirectory = resolve(valueAfter('--dataset', process.env.CAISSA_SCANNER_V05_DATASET_DIR || DEFAULT_DATASET));
  const metadataPath = resolve(datasetDirectory, 'piece-rgb64-v05.json');
  const pixelsPath = resolve(datasetDirectory, 'piece-rgb64-v05.bin');
  const [metadataBytes, pixels] = await Promise.all([readFile(metadataPath), readFile(pixelsPath)]);
  const metadata = JSON.parse(metadataBytes.toString('utf8'));
  const boards = realBoards(metadata.records).map((item, index) => ({
    id: item.id, rows: item.rows, orientation: index === 1 ? 'black-at-bottom' : 'white-at-bottom'
  }));
  boards.push({ id: 'mixed-golden-v01', rows: selectMixedBoard(metadata.records), orientation: 'black-at-bottom' });

  const aggregate = { classMatches: 0, classTotal: 0, thresholdMatches: 0, maximumDelta: 0,
    deltaTotal: 0, deltaCount: 0, fullBoardAgreement: true };
  const goldenBoards = [];
  const timings = [];
  for (const board of boards) {
    const rgba = assembleBoard(board.rows, pixels, board.orientation);
    const request = {
      schemaVersion: RECOGNITION_PROTOCOL.request,
      boardEncoding: RECOGNITION_PROTOCOL.boardEncoding,
      boardWidth: 512,
      boardHeight: 512,
      sourceImageType: 'image/png',
      orientation: board.orientation,
      boardRgbaBase64: rgba.toString('base64')
    };
    const referenceStarted = performance.now();
    const reference = await inferFrozenV05(request);
    const referenceMs = performance.now() - referenceStarted;
    const productionStarted = performance.now();
    const productionResult = await inferFrozenV05Onnx(request);
    const productionMs = performance.now() - productionStarted;
    compare(reference, productionResult.response, aggregate);
    timings.push({ id: board.id, referenceMs, productionMs, ...productionResult.metrics });
    goldenBoards.push({
      id: board.id,
      orientation: board.orientation,
      boardRgbaSha256: sha256(rgba),
      tileReferences: board.rows.map(row => ({ index: row.index, sampleId: row.sampleId,
        classLabel: row.classLabel, dataRole: row.dataRole, pieceSetId: row.pieceSetId || null,
        squareTone: row.squareTone || null, hardNegative: row.hardNegative === true,
        tileRgbSha256: sha256(pixels.subarray(row.index * TILE_BYTES, (row.index + 1) * TILE_BYTES)) })),
      reference: {
        predictedFEN: reference.predictedFEN,
        squarePredictions: reference.squarePredictions
      }
    });
  }

  const roles = [...new Set(goldenBoards.flatMap(board => board.tileReferences.map(row => row.dataRole)))].sort();
  const families = [...new Set(goldenBoards.flatMap(board => board.tileReferences.map(row => row.pieceSetId)).filter(Boolean))].sort();
  const labels = [...new Set(goldenBoards.flatMap(board => board.tileReferences.map(row => row.classLabel)))].sort();
  const result = {
    schemaVersion: 'caissa-scanner-v05-onnx-parity/1',
    datasetVersion: metadata.datasetVersion,
    datasetMetadataSha256: sha256(metadataBytes),
    datasetPixelsSha256: sha256(pixels),
    boardCount: boards.length,
    fixtureCount: boards.length * 64,
    coverage: { labels, roles, families, lightAndDark: goldenBoards.flatMap(board => board.tileReferences).some(row => row.squareTone === 'light')
      && goldenBoards.flatMap(board => board.tileReferences).some(row => row.squareTone === 'dark'),
    hardNegativeCount: goldenBoards.flatMap(board => board.tileReferences).filter(row => row.hardNegative).length,
    kingCount: goldenBoards.flatMap(board => board.tileReferences).filter(row => ['K', 'k'].includes(row.classLabel)).length },
    canonicalClassAgreement: aggregate.classMatches / aggregate.classTotal,
    thresholdDecisionAgreement: aggregate.thresholdMatches / aggregate.classTotal,
    fullBoardAgreement: aggregate.fullBoardAgreement,
    maximumNumericalDelta: aggregate.maximumDelta,
    meanNumericalDelta: aggregate.deltaTotal / aggregate.deltaCount,
    tolerance: MAX_DELTA_TOLERANCE,
    timings
  };
  if (process.argv.includes('--write-golden')) {
    await mkdir(dirname(GOLDEN_PATH), { recursive: true });
    const { timings: _timings, ...deterministic } = result;
    await writeFile(GOLDEN_PATH, `${JSON.stringify({ ...deterministic, boards: goldenBoards }, null, 2)}\n`, { encoding: 'utf8', flag: 'w' });
  }
  console.log(JSON.stringify(result, null, 2));
  if (result.canonicalClassAgreement !== 1 || result.thresholdDecisionAgreement !== 1
    || !result.fullBoardAgreement || result.maximumNumericalDelta > MAX_DELTA_TOLERANCE) {
    throw new Error('FROZEN_V05_PARITY_FAILED');
  }
}

await main();
