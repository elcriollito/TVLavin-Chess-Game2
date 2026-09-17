import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CLASSES, sha256, stableJson } from '../scanner/recognition/datasets/pieces/dataset-core.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const artifact = join(root, 'artifacts/scanner-piece-classifier-v0.1');
const historicalPath = join(root, 'artifacts/scanner-classifier-baseline/historical-tfjs-verified-real-benchmark.json');
const historicalPerformancePath = join(root, 'artifacts/scanner-classifier-baseline/historical-tfjs-verified-real-performance.json');

export function buildComparison({ historical, current, freeze, performance, historicalPerformance, hashes }) {
  const old = historical.realMetrics;
  if (old.boardCount !== 31 || current.boardCount !== 31 || old.squareCount !== 1984
    || current.squareCount !== 1984 || historical.truthManifestSha256 !== current.truthManifestSha256
    || JSON.stringify(current.classOrder) !== JSON.stringify(CLASSES)
    || JSON.stringify(old.classOrder) !== JSON.stringify(CLASSES)
    || freeze.stateSha256 !== current.stateSha256 || performance.stateSha256 !== current.stateSha256)
    throw new Error('historical and frozen new reports do not describe the same 31-board benchmark');
  const macroF1 = old.perClass.slice(1).reduce((sum, item) => sum + (item.f1 ?? 0), 0) / 12;
  const row = (name, before, after, unit = 'fraction') => ({ name, historical: before, newBaseline: after,
    delta: before === null || after === null ? null : after - before, unit });
  return {
    schemaVersion: 'caissa-scanner-classifier-historical-comparison/1',
    modelVersion: current.modelVersion, truthManifestSha256: current.truthManifestSha256,
    stateSha256: current.stateSha256, sourceReportSha256: hashes,
    comparisonCaveats: [
      'Both accuracy reports score the same 31 human-verified boards using human corners and exact 64 visual-order tiles.',
      'Historical 32x32 grayscale/Sharp 0.34.5 and new 64x64 RGB/Sharp 0.35.3 preprocessing differ; this is a system-level model-plus-preprocessing comparison.',
      'Historical native TFJS timing includes real-board processing on a separate Node environment; new PyTorch CPU timing uses pre-extracted synthetic tiles and excludes warp/crop. Timings are not apples-to-apples.',
      'Historical model binary byte count was not captured in the certified report; parameter count alone does not establish artifact size.'
    ],
    rows: [
      row('13-class square accuracy', old.accuracy13, current.accuracy13),
      row('occupied macro-F1 (12 classes; missing-class F1=0)', macroF1, current.occupiedMacroF1),
      row('occupied/empty accuracy', old.occupiedVsEmptyAccuracy, current.occupiedVsEmptyAccuracy),
      row('piece-type accuracy on occupied truth', old.pieceTypeAccuracyOnTrueOccupied, current.pieceTypeAccuracyOnTrueOccupied),
      row('color accuracy on occupied truth', old.colorAccuracyOnTrueOccupied, current.colorAccuracyOnTrueOccupied),
      row('white exact-class accuracy', old.whitePieceAccuracy, current.whitePieceAccuracy),
      row('black exact-class accuracy', old.blackPieceAccuracy, current.blackPieceAccuracy),
      row('exact-board accuracy', old.exactBoardAccuracy, current.exactBoardAccuracy),
      row('mean corrections per board', old.correctionBurden.mean, current.correctionBurden.mean, 'squares'),
      row('color swaps', old.totalColorSwaps, current.totalColorSwaps, 'errors'),
      row('high-confidence wrong >=0.90', old.confidence.highConfidenceErrors.length, current.confidence.wrongAtLeast090, 'errors'),
      row('Brier score', old.confidence.brier13, current.confidence.brier13, 'score'),
      row('ECE 10-bin', old.confidence.ece10, current.confidence.ece10, 'score'),
      row('native model bytes', null, performance.nativeModelBytes, 'bytes'),
      row('desktop model-load milliseconds', historicalPerformance.modelLoadMs, performance.modelLoadMilliseconds, 'milliseconds'),
      row('desktop inference milliseconds per board', historicalPerformance.meanInferenceMs, performance.inferenceMillisecondsPerBoard, 'milliseconds')
    ],
    failureComparison: {
      bishopKnightQueenTypeConfusions: {
        historical: Object.entries(old.pieceTypeConfusion).filter(([key]) => /^[BNQ]->[BNQ]$/.test(key)).reduce((sum, [, count]) => sum + count, 0),
        newBaseline: Object.entries(current.pieceTypeConfusion).filter(([key]) => /^[BNQ]->[BNQ]$/.test(key)).reduce((sum, [, count]) => sum + count, 0)
      },
      pawnBishopTypeConfusions: { historical: (old.pieceTypeConfusion['P->B'] || 0) + (old.pieceTypeConfusion['B->P'] || 0),
        newBaseline: (current.pieceTypeConfusion['P->B'] || 0) + (current.pieceTypeConfusion['B->P'] || 0) },
      kingIdentity: { historical: { missingWhiteKing: old.chessAwareSignals.missingWhiteKing,
        missingBlackKing: old.chessAwareSignals.missingBlackKing, duplicateWhiteKing: old.chessAwareSignals.duplicateWhiteKing,
        duplicateBlackKing: old.chessAwareSignals.duplicateBlackKing },
      newBaseline: { missingWhiteKing: current.chessAwareSignals.missingWhiteKing,
        missingBlackKing: current.chessAwareSignals.missingBlackKing, duplicateWhiteKing: current.chessAwareSignals.duplicateWhiteKing,
        duplicateBlackKing: current.chessAwareSignals.duplicateBlackKing } }
    },
    decision: 'DATASET / ARCHITECTURE NEEDS REVISION',
    decisionRationale: 'Occupied macro-F1, piece-type and black exact accuracy improve, but total 13-class accuracy, occupancy, mean correction burden, color swaps and high-confidence errors worsen; no runtime integration or post-test tuning is justified.'
  };
}

export async function writeComparison({ check = false } = {}) {
  const files = {
    historical: await readFile(historicalPath), historicalPerformance: await readFile(historicalPerformancePath),
    current: await readFile(join(artifact, 'real-31-board-report.json')),
    freeze: await readFile(join(artifact, 'freeze-manifest.json')),
    performance: await readFile(join(artifact, 'performance-report.json'))
  };
  const { historical, current, freeze, performance, historicalPerformance } = Object.fromEntries(
    Object.entries(files).map(([key, bytes]) => [key, JSON.parse(bytes)]));
  const hashes = Object.fromEntries(Object.entries(files).map(([key, bytes]) => [key, sha256(bytes)]));
  const output = stableJson(buildComparison({ historical, current, freeze, performance, historicalPerformance, hashes }));
  const path = join(artifact, 'historical-comparison.json');
  if (check) {
    if ((await readFile(path, 'utf8')) !== output) throw new Error('historical comparison report is stale');
  } else await writeFile(path, output, { flag: 'wx' });
  return { path, sha256: sha256(Buffer.from(output)) };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.stdout.write(`${JSON.stringify(await writeComparison({ check: process.argv.includes('--check') }), null, 2)}\n`);
}
