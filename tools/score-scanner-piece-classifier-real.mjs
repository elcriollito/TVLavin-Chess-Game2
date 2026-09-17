import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CLASSES, sha256, stableJson } from '../scanner/recognition/datasets/pieces/dataset-core.js';
import { loadVerifiedRealEvaluation } from '../scanner/recognition/datasets/pieces/real-evaluation.js';
import { evaluateHistoricalBoards, truthLabels } from '../scanner/recognition/benchmark/historical-classifier-evaluation.js';
import { toVisualBenchmarkTruth } from './scanner-piece-label-annotator/piece-label-core.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name) => process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3);
if (!arg('model-dir') || !arg('real-dir')) throw new Error('provide --model-dir and --real-dir');
const modelDir = resolve(arg('model-dir')), realDir = resolve(arg('real-dir'));
const reportPath = join(root, 'artifacts/scanner-piece-classifier-v0.1/real-31-board-report.json');
const configBytes = await readFile(join(root, 'scanner/recognition/classifier-baseline/config-v0.1.json'));
const config = JSON.parse(configBytes);
const freeze = JSON.parse(await readFile(join(modelDir, 'freeze-manifest.json')));
const predictionBytes = await readFile(join(modelDir, 'real-predictions.json'));
const predictions = JSON.parse(predictionBytes);
const real = JSON.parse(await readFile(join(realDir, 'real-rgb64.json')));
if (freeze.configSha256 !== sha256(configBytes)
  || freeze.stateSha256 !== sha256(await readFile(join(modelDir, 'frozen-state.pt')))
  || predictions.stateSha256 !== freeze.stateSha256 || predictions.realPixelsSha256 !== real.pixelsSha256
  || real.frozenStateSha256 !== freeze.stateSha256 || predictions.truthReadByModel !== false
  || predictions.classOrder.join(',') !== CLASSES.join(',') || real.classOrder.join(',') !== CLASSES.join(',')
  || predictions.boardIds.join(',') !== real.boardIds.join(',')
  || predictions.predictedIndices.length !== 1984 || predictions.probabilities.length !== 1984)
  throw new Error('unfrozen or malformed real prediction bundle');

const corpusV01 = resolve(root, '..', 'caissa_scanner_real_localization_corpus_v0_1');
const corpusV03 = resolve(root, '..', 'caissa_scanner_real_localization_corpus_v0_3');
const truthPath = resolve(root, '..', 'caissa_scanner_piece_labels_v0_1', 'piece-labels-v0.1.json');
const verified = await loadVerifiedRealEvaluation({ truthPath, corpusV01, corpusV03, repoRoot: root });
const truth = JSON.parse(await readFile(truthPath));
const byTruthId = new Map(truth.samples.map((item) => [item.sampleId, item]));
const firstTile = new Map(predictions.boardIds.map((id) => [id, verified.tiles.find((item) => item.sourceImageId === id)]));
if (verified.truthManifestSha256 !== real.truthManifestSha256 || verified.sourceBoardCount !== 31
  || predictions.boardIds.length !== 31 || firstTile.size !== 31
  || predictions.boardIds.some((id) => !firstTile.get(id) || !byTruthId.has(id)))
  throw new Error('real truth or board identity changed');

const boards = predictions.boardIds.map((id, boardIndex) => {
  const truthRecord = toVisualBenchmarkTruth(byTruthId.get(id));
  truthLabels(truthRecord);
  const source = firstTile.get(id);
  return { sampleId: id, truth: truthRecord, sourceCategory: source.sourceCategory,
    difficultyTags: source.difficultyTags, pieceSetFamily: 'unknown', pieceSetStyle: 'unknown',
    sourcePlatform: source.sourcePlatform || null,
    predictions: Array.from({ length: 64 }, (_, visualIndex) => {
      const index = boardIndex * 64 + visualIndex;
      return { predictedClass: CLASSES[predictions.predictedIndices[index]],
        classProbabilities: predictions.probabilities[index] };
    }) };
});
const metrics = evaluateHistoricalBoards(boards);
if (metrics.boardCount !== 31 || metrics.squareCount !== 1984)
  throw new Error('real benchmark score count mismatch');
const occupiedMacroF1 = metrics.perClass.slice(1).reduce((sum, item) => sum + (item.f1 ?? 0), 0) / 12;
const annotatedSquares = boards.flatMap((board, index) => metrics.perBoard[index].squarePredictions.map((square) => ({
  ...square, sourceCategory: board.sourceCategory, difficultyTags: board.difficultyTags
})));
const subset = (name, predicate) => {
  const rows = annotatedSquares.filter(predicate), occupied = rows.filter((item) => item.truth !== 'empty');
  return { name, squares: rows.length,
    accuracy13: rows.length ? rows.filter((item) => item.correct).length / rows.length : null,
    pieceTypeAccuracyOnTrueOccupied: occupied.length
      ? occupied.filter((item) => item.top1 !== 'empty' && item.top1.toUpperCase() === item.truth.toUpperCase()).length / occupied.length : null,
    colorAccuracyOnTrueOccupied: occupied.length
      ? occupied.filter((item) => item.top1 !== 'empty' && (item.top1 === item.top1.toUpperCase())
        === (item.truth === item.truth.toUpperCase())).length / occupied.length : null };
};
const hardSubsets = [
  subset('bishop-knight-queen', (item) => ['B', 'N', 'Q'].includes(item.truth.toUpperCase())),
  subset('king-color', (item) => item.truth.toUpperCase() === 'K'),
  subset('low-contrast-tags', (item) => item.difficultyTags.some((tag) => /low-contrast|degraded|fading|old-newspaper/.test(tag))),
  subset('printed-source', (item) => /print/.test(item.sourceCategory)),
  subset('digital-photo-source', (item) => /digital|photo/.test(item.sourceCategory)),
  subset('livestream-source', (item) => item.sourceCategory === 'livestream'),
  subset('book-tag', (item) => item.difficultyTags.includes('printed-book'))
];
const offDiagonal = metrics.confusionMatrix.flatMap((row, actual) => row.flatMap((count, found) =>
  actual !== found && count ? [{ truth: CLASSES[actual], predicted: CLASSES[found], count }] : []))
  .sort((a, b) => b.count - a.count || a.truth.localeCompare(b.truth) || a.predicted.localeCompare(b.predicted));
const ranked = [...metrics.perBoard].sort((a, b) => a.wrongSquares - b.wrongSquares || a.sampleId.localeCompare(b.sampleId));
const confidence = metrics.confidence;
const compact = { schemaVersion: 'caissa-scanner-classifier-real-31/1', modelVersion: config.modelVersion,
  benchmarkPolicy: 'single post-freeze evaluation; human corners; exact 64 visual-order tiles; no detector corners or corrections',
  stateSha256: freeze.stateSha256, torchscriptSha256: freeze.torchscriptSha256,
  predictionBundleSha256: sha256(predictionBytes), realPixelsSha256: real.pixelsSha256,
  truthManifestSha256: verified.truthManifestSha256, boardCount: metrics.boardCount,
  squareCount: metrics.squareCount, classOrder: metrics.classOrder,
  accuracy13: metrics.accuracy13, occupiedMacroF1,
  occupiedVsEmptyAccuracy: metrics.occupiedVsEmptyAccuracy,
  pieceTypeAccuracyOnTrueOccupied: metrics.pieceTypeAccuracyOnTrueOccupied,
  colorAccuracyOnTrueOccupied: metrics.colorAccuracyOnTrueOccupied,
  whitePieceAccuracy: metrics.whitePieceAccuracy, blackPieceAccuracy: metrics.blackPieceAccuracy,
  occupiedTruthSquares: metrics.occupiedTruthSquares, whiteTruthSquares: metrics.whiteTruthSquares,
  blackTruthSquares: metrics.blackTruthSquares, perClass: metrics.perClass,
  confusionMatrix: metrics.confusionMatrix, confusionHighlights: offDiagonal.slice(0, 12),
  totalColorSwaps: metrics.totalColorSwaps, colorSwap: metrics.colorSwap,
  totalPieceTypeConfusions: metrics.totalPieceTypeConfusions, pieceTypeConfusion: metrics.pieceTypeConfusion,
  exactBoardAccuracy: metrics.exactBoardAccuracy, correctionBurden: metrics.correctionBurden,
  bestBoard: { sampleId: ranked[0].sampleId, wrongSquares: ranked[0].wrongSquares },
  worstBoard: { sampleId: ranked.at(-1).sampleId, wrongSquares: ranked.at(-1).wrongSquares },
  perBoard: metrics.perBoard.map((board) => ({ sampleId: board.sampleId, wrongSquares: board.wrongSquares,
    exact: board.exact, structuralWarnings: board.structuralWarnings })),
  groups: metrics.groups, hardSubsets,
  confidence: { meanTop1: confidence.meanTop1,
    meanTop2: annotatedSquares.reduce((sum, item) => sum + item.top2Confidence, 0) / annotatedSquares.length,
    meanTop1Correct: confidence.meanTop1Correct, meanTop1Incorrect: confidence.meanTop1Incorrect,
    meanMargin: confidence.meanMargin, brier13: confidence.brier13, ece10: confidence.ece10,
    bins: confidence.bins, wrongAtLeast090: confidence.highConfidenceErrors.length,
    highestConfidenceErrors: [...confidence.highConfidenceErrors].sort((a, b) => b.confidence - a.confidence).slice(0, 10) },
  chessAwareSignals: { ...metrics.chessAwareSignals,
    boardsWithAnyWarning: metrics.perBoard.filter((board) => board.structuralWarnings.length).length,
    warningBoardRate: metrics.perBoard.filter((board) => board.structuralWarnings.length).length / 31 },
  sourceCategoryPolicy: 'exploratory small groups; unidentified platform/style stays unknown',
  modelChangedAfterBenchmark: false, scannerRuntimeIntegrated: false };
await mkdir(dirname(reportPath), { recursive: true });
await writeFile(reportPath, stableJson(compact), { flag: 'wx' });
process.stdout.write(`${JSON.stringify({ reportPath, accuracy13: compact.accuracy13,
  occupiedMacroF1: compact.occupiedMacroF1, blackPieceAccuracy: compact.blackPieceAccuracy,
  exactBoardAccuracy: compact.exactBoardAccuracy, wrongAtLeast090: compact.confidence.wrongAtLeast090 }, null, 2)}\n`);
