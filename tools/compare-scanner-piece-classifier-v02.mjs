import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CLASSES, sha256, stableJson } from '../scanner/recognition/datasets/pieces/dataset-core.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const v02 = join(root, 'artifacts/scanner-piece-classifier-v0.2');
const readJson = async (path) => { const bytes = await readFile(path); return { value: JSON.parse(bytes), hash: sha256(bytes) }; };
const occupiedMacro = (rows) => rows.slice(1).reduce((sum, item) => sum + (item.f1 ?? 0), 0) / 12;
const occupancy = (matrix) => {
  const fp = matrix[0].slice(1).reduce((sum, count) => sum + count, 0);
  const fn = matrix.slice(1).reduce((sum, row) => sum + row[0], 0);
  const tp = matrix.slice(1).reduce((sum, row) => sum + row.slice(1).reduce((a, b) => a + b, 0), 0);
  const precision = tp / (tp + fp), recall = tp / (tp + fn);
  return { precision, recall, f1: 2 * precision * recall / (precision + recall), fp, fn };
};
const king = (matrix) => ({ predictedK: matrix.reduce((sum, row) => sum + row[6], 0), trueK: matrix[6].reduce((a, b) => a + b, 0),
  predictedk: matrix.reduce((sum, row) => sum + row[12], 0), truek: matrix[12].reduce((a, b) => a + b, 0),
  emptyToK: matrix[0][6], emptyTok: matrix[0][12] });
const row = (name, historical, v01, raw, calibrated, unit = 'fraction') => ({ name, historical, v01, v02Raw: raw,
  v02Calibrated: calibrated, rawDeltaVsV01: raw - v01, calibratedDeltaVsV01: calibrated - v01, unit });

export function buildComparison({ historical, v01, current, freeze, performance, hashes }) {
  const old = historical.realMetrics, raw = current.raw, calibrated = current.calibrated;
  if (old.boardCount !== 31 || v01.boardCount !== 31 || current.boardCount !== 31
    || old.squareCount !== 1984 || v01.squareCount !== 1984 || current.squareCount !== 1984
    || historical.truthManifestSha256 !== v01.truthManifestSha256
    || historical.truthManifestSha256 !== current.truthManifestSha256
    || JSON.stringify(current.classOrder) !== JSON.stringify(CLASSES)
    || freeze.stateSha256 !== current.stateSha256 || performance.stateSha256 !== current.stateSha256
    || current.modelChangedAfterBenchmark !== false || current.scannerRuntimeIntegrated !== false)
    throw new Error('comparison cohort or frozen artifact mismatch');
  const oldOcc = occupancy(old.confusionMatrix), priorOcc = occupancy(v01.confusionMatrix);
  const rows = [
    row('13-class accuracy', old.accuracy13, v01.accuracy13, raw.accuracy13, calibrated.accuracy13),
    row('occupied macro-F1', occupiedMacro(old.perClass), v01.occupiedMacroF1, raw.occupiedMacroF1, calibrated.occupiedMacroF1),
    row('occupancy precision', oldOcc.precision, priorOcc.precision, raw.occupancy.precision, calibrated.occupancy.precision),
    row('occupancy recall', oldOcc.recall, priorOcc.recall, raw.occupancy.recall, calibrated.occupancy.recall),
    row('occupancy F1', oldOcc.f1, priorOcc.f1, raw.occupancy.f1, calibrated.occupancy.f1),
    row('empty to occupied', oldOcc.fp, priorOcc.fp, raw.occupancy.trueEmptyPredictedOccupied, calibrated.occupancy.trueEmptyPredictedOccupied, 'squares'),
    row('occupied to empty', oldOcc.fn, priorOcc.fn, raw.occupancy.trueOccupiedPredictedEmpty, calibrated.occupancy.trueOccupiedPredictedEmpty, 'squares'),
    row('piece-type accuracy', old.pieceTypeAccuracyOnTrueOccupied, v01.pieceTypeAccuracyOnTrueOccupied, raw.pieceTypeAccuracy, calibrated.pieceTypeAccuracy),
    row('color accuracy', old.colorAccuracyOnTrueOccupied, v01.colorAccuracyOnTrueOccupied, raw.colorAccuracy, calibrated.colorAccuracy),
    row('white exact accuracy', old.whitePieceAccuracy, v01.whitePieceAccuracy, raw.whiteExactAccuracy, calibrated.whiteExactAccuracy),
    row('black exact accuracy', old.blackPieceAccuracy, v01.blackPieceAccuracy, raw.blackExactAccuracy, calibrated.blackExactAccuracy),
    row('predicted black kings', king(old.confusionMatrix).predictedk, king(v01.confusionMatrix).predictedk, raw.kingSink.predictedk, calibrated.kingSink.predictedk, 'squares'),
    row('empty to black king', king(old.confusionMatrix).emptyTok, king(v01.confusionMatrix).emptyTok, raw.kingSink.emptyTok, calibrated.kingSink.emptyTok, 'squares'),
    row('color swaps', old.totalColorSwaps, v01.totalColorSwaps, raw.totalColorSwaps, calibrated.totalColorSwaps, 'errors'),
    row('exact-board accuracy', old.exactBoardAccuracy, v01.exactBoardAccuracy, raw.exactBoardAccuracy, calibrated.exactBoardAccuracy),
    row('mean corrections per board', old.correctionBurden.mean, v01.correctionBurden.mean, raw.correctionBurden.mean, calibrated.correctionBurden.mean, 'squares'),
    row('median corrections per board', old.correctionBurden.median, v01.correctionBurden.median, raw.correctionBurden.median, calibrated.correctionBurden.median, 'squares'),
    row('wrong confidence >=0.90', old.confidence.highConfidenceErrors.length, v01.confidence.wrongAtLeast090, raw.confidence.wrongAtLeast090, calibrated.confidence.wrongAtLeast090, 'errors'),
    row('Brier 13-class', old.confidence.brier13, v01.confidence.brier13, raw.confidence.brier13, calibrated.confidence.brier13, 'score'),
    row('ECE 10-bin', old.confidence.ece10, v01.confidence.ece10, raw.confidence.ece10, calibrated.confidence.ece10, 'score')
  ];
  return { schemaVersion: 'caissa-scanner-classifier-revision-comparison/1', modelVersion: current.modelVersion,
    truthManifestSha256: current.truthManifestSha256, stateSha256: freeze.stateSha256, sourceReportSha256: hashes,
    rows, kingSink: { historical: king(old.confusionMatrix), v01: king(v01.confusionMatrix),
      v02Raw: raw.kingSink, v02Calibrated: calibrated.kingSink },
    modelSizeBytes: { historical: null, v01: 2489733, v02Native: performance.nativeModelBytes,
      v02Gzip: performance.nativeModelGzipBytes },
    performanceCaveat: 'Different backends/workloads; v0.2 synthetic CPU batch timing excludes board decode/warp and cannot establish mobile latency.',
    decision: 'MORE DATA / ARCHITECTURE WORK REQUIRED',
    decisionRationale: 'Raw v0.2 improves occupancy, occupied macro-F1, color/type, corrections and king sink versus v0.1, but still has 172 empty false positives, 135 predicted black kings for 31 true, zero exact boards, and 183 high-confidence wrong errors; validation temperature scaling further worsens real calibration (266 high-confidence errors). No post-real tuning or runtime integration.' };
}

export async function writeComparison({ check = false } = {}) {
  const paths = { historical: join(root, 'artifacts/scanner-classifier-baseline/historical-tfjs-verified-real-benchmark.json'),
    v01: join(root, 'artifacts/scanner-piece-classifier-v0.1/real-31-board-report.json'),
    current: join(v02, 'real-31-board-report.json'), freeze: join(v02, 'freeze-manifest.json'),
    performance: join(v02, 'performance-report.json') };
  const files = Object.fromEntries(await Promise.all(Object.entries(paths).map(async ([name, path]) => [name, await readJson(path)])));
  const hashes = Object.fromEntries(Object.entries(files).map(([name, entry]) => [name, entry.hash]));
  const input = Object.fromEntries(Object.entries(files).map(([name, entry]) => [name, entry.value]));
  const output = stableJson(buildComparison({ ...input, hashes }));
  const path = join(v02, 'historical-comparison.json');
  if (check) {
    if ((await readFile(path, 'utf8')) !== output) throw new Error('comparison report is stale');
  } else await writeFile(path, output, { flag: 'wx' });
  return { path, sha256: sha256(Buffer.from(output)) };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.stdout.write(`${JSON.stringify(await writeComparison({ check: process.argv.includes('--check') }), null, 2)}\n`);
}
