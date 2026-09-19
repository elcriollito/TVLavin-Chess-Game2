import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CLASSES, sha256, stableJson } from '../scanner/recognition/datasets/pieces/dataset-core.js';
import { loadVerifiedRealEvaluation } from '../scanner/recognition/datasets/pieces/real-evaluation.js';
import { evaluateHistoricalBoards, truthLabels } from '../scanner/recognition/benchmark/historical-classifier-evaluation.js';
import { toVisualBenchmarkTruth } from './scanner-piece-label-annotator/piece-label-core.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name) => process.argv.find((item) => item.startsWith(`--${name}=`))?.slice(name.length + 3);
if (!arg('model-dir') || !arg('real-dir')) throw new Error('provide frozen --model-dir and --real-dir');
const modelDir = resolve(arg('model-dir')), realDir = resolve(arg('real-dir'));
const reportPath = resolve(arg('report-out') || join(root, 'artifacts/scanner-piece-classifier-v0.2/real-31-board-report.json'));
const configPath = resolve(arg('config') || join(root, 'scanner/recognition/classifier-revision/config-v0.2.json'));
const configBytes = await readFile(configPath);
const config = JSON.parse(configBytes);
const freeze = JSON.parse(await readFile(join(modelDir, 'freeze-manifest.json')));
const predictionBytes = await readFile(join(modelDir, 'real-predictions.json'));
const predictions = JSON.parse(predictionBytes);
const real = JSON.parse(await readFile(join(realDir, 'real-rgb64.json')));
if (freeze.configSha256 !== sha256(configBytes)
  || freeze.stateSha256 !== sha256(await readFile(join(modelDir, 'frozen-state.pt')))
  || freeze.torchscriptSha256 !== sha256(await readFile(join(modelDir, 'frozen-torchscript.pt')))
  || predictions.stateSha256 !== freeze.stateSha256 || predictions.realPixelsSha256 !== real.pixelsSha256
  || predictions.truthManifestSha256 !== real.truthManifestSha256 || predictions.truthReadByModel !== false
  || predictions.classOrder.join(',') !== CLASSES.join(',') || real.classOrder.join(',') !== CLASSES.join(',')
  || predictions.boardIds.join(',') !== real.boardIds.join(',')
  || predictions.rawProbabilities.length !== 1984 || predictions.calibratedProbabilities.length !== 1984
  || predictions.rawPredictedIndices.length !== 1984 || predictions.calibratedPredictedIndices.length !== 1984)
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

const boardsFor = (key) => predictions.boardIds.map((id, boardIndex) => {
  const truthRecord = toVisualBenchmarkTruth(byTruthId.get(id));
  truthLabels(truthRecord);
  const source = firstTile.get(id);
  return { sampleId: id, truth: truthRecord, sourceCategory: source.sourceCategory,
    difficultyTags: source.difficultyTags, pieceSetFamily: 'unknown', pieceSetStyle: 'unknown',
    sourcePlatform: source.sourcePlatform || null,
    predictions: Array.from({ length: 64 }, (_, visualIndex) => {
      const index = boardIndex * 64 + visualIndex;
      return { predictedClass: CLASSES[predictions[`${key}PredictedIndices`][index]],
        ...(key === 'calibrated' ? { decisionBasis: 'occupancy-threshold' } : {}),
        classProbabilities: predictions[`${key}Probabilities`][index] };
    }) };
});
const precisionRecall = (tp, fp, fn) => {
  const precision = tp + fp ? tp / (tp + fp) : 0;
  const recall = tp + fn ? tp / (tp + fn) : 0;
  return { precision, recall, f1: precision + recall ? 2 * precision * recall / (precision + recall) : 0 };
};
const compact = (metrics, key, boards) => {
  const matrix = metrics.confusionMatrix;
  const trueEmptyPredictedOccupied = matrix[0].slice(1).reduce((sum, count) => sum + count, 0);
  const trueOccupiedPredictedEmpty = matrix.slice(1).reduce((sum, row) => sum + row[0], 0);
  const trueOccupiedPredictedOccupied = metrics.occupiedTruthSquares - trueOccupiedPredictedEmpty;
  const headProb = predictions.diagnostics[key].occupancyProbability;
  const headTruth = boards.flatMap((board) => truthLabels(board.truth).map((label) => label !== 'empty'));
  const headFalsePositive = headTruth.filter((occupied, index) => !occupied && headProb[index] >= .5).length;
  const headFalseNegative = headTruth.filter((occupied, index) => occupied && headProb[index] < .5).length;
  const sorted = [...metrics.perBoard].sort((a, b) => a.wrongSquares - b.wrongSquares || a.sampleId.localeCompare(b.sampleId));
  const allSquares = metrics.perBoard.flatMap((board, boardIndex) => board.squarePredictions.map((item) => ({
    ...item, sourceCategory: boards[boardIndex].sourceCategory, difficultyTags: boards[boardIndex].difficultyTags
  })));
  const subset = (name, filter) => {
    const rows = allSquares.filter(filter);
    return { name, squares: rows.length, accuracy13: rows.length ? rows.filter((item) => item.correct).length / rows.length : null };
  };
  const topWrong = [...metrics.confidence.highConfidenceErrors]
    .sort((a, b) => b.confidence - a.confidence || a.sampleId.localeCompare(b.sampleId)).slice(0, 10);
  const top = allSquares.map((item) => item.top1Confidence);
  const uncertainty = { lowOccupancyProbability: 0, lowColorMargin: 0, lowTypeMargin: 0,
    lowCanonicalTop1: 0, anySignal: 0, errorsWithAnySignal: 0 };
  for (let index = 0; index < allSquares.length; index++) {
    const flags = [allSquares[index].top1 !== 'empty' && headProb[index] < config.uncertainty.lowOccupancyProbability,
      predictions.diagnostics[key].colorMargin[index] < config.uncertainty.lowColorMargin,
      predictions.diagnostics[key].typeMargin[index] < config.uncertainty.lowTypeMargin,
      top[index] < config.uncertainty.lowCanonicalTop1];
    if (allSquares[index].top1 === 'empty') { flags[1] = false; flags[2] = false; }
    ['lowOccupancyProbability', 'lowColorMargin', 'lowTypeMargin', 'lowCanonicalTop1']
      .forEach((label, i) => { uncertainty[label] += Number(flags[i]); });
    uncertainty.anySignal += Number(flags.some(Boolean));
    uncertainty.errorsWithAnySignal += Number(!allSquares[index].correct && flags.some(Boolean));
  }
  return {
    accuracy13: metrics.accuracy13, occupiedVsEmptyAccuracy: metrics.occupiedVsEmptyAccuracy,
    occupiedMacroF1: metrics.perClass.slice(1).reduce((sum, row) => sum + (row.f1 ?? 0), 0) / 12,
    pieceTypeAccuracy: metrics.pieceTypeAccuracyOnTrueOccupied,
    colorAccuracy: metrics.colorAccuracyOnTrueOccupied,
    whiteExactAccuracy: metrics.whitePieceAccuracy, blackExactAccuracy: metrics.blackPieceAccuracy,
    occupancy: { ...precisionRecall(trueOccupiedPredictedOccupied, trueEmptyPredictedOccupied, trueOccupiedPredictedEmpty),
      trueEmptyPredictedOccupied, trueOccupiedPredictedEmpty,
      headFalsePositive, headFalseNegative, headAccuracy: 1 - (headFalsePositive + headFalseNegative) / 1984 },
    kingSink: { predictedK: matrix.reduce((sum, row) => sum + row[6], 0), trueK: matrix[6].reduce((sum, value) => sum + value, 0),
      predictedk: matrix.reduce((sum, row) => sum + row[12], 0), truek: matrix[12].reduce((sum, value) => sum + value, 0),
      emptyToK: matrix[0][6], emptyTok: matrix[0][12] },
    perClass: metrics.perClass, confusionMatrix: matrix, colorSwap: metrics.colorSwap,
    totalColorSwaps: metrics.totalColorSwaps, pieceTypeConfusion: metrics.pieceTypeConfusion,
    exactBoardAccuracy: metrics.exactBoardAccuracy, correctionBurden: metrics.correctionBurden,
    bestBoard: { sampleId: sorted[0].sampleId, wrongSquares: sorted[0].wrongSquares },
    worstBoard: { sampleId: sorted.at(-1).sampleId, wrongSquares: sorted.at(-1).wrongSquares },
    perBoard: metrics.perBoard.map((board) => ({ sampleId: board.sampleId, wrongSquares: board.wrongSquares,
      exact: board.exact, structuralWarnings: board.structuralWarnings })),
    chessAwareSignals: { ...metrics.chessAwareSignals,
      boardsWithAnyWarning: metrics.perBoard.filter((board) => board.structuralWarnings.length).length },
    sourceGroups: metrics.groups.sourceCategory,
    hardSubsets: [subset('bishop-knight-queen', (item) => ['B', 'N', 'Q'].includes(item.truth.toUpperCase())),
      subset('king-color', (item) => item.truth.toUpperCase() === 'K'),
      subset('low-contrast-tags', (item) => item.difficultyTags.some((tag) => /low-contrast|degraded|fading|old-newspaper/.test(tag))),
      subset('printed-source', (item) => /print/.test(item.sourceCategory)),
      subset('digital-photo-source', (item) => /digital|photo/.test(item.sourceCategory)),
      subset('livestream-source', (item) => item.sourceCategory === 'livestream'),
      subset('book-tag', (item) => item.difficultyTags.includes('printed-book'))],
    confidence: { meanTop1: metrics.confidence.meanTop1,
      meanTop2: allSquares.reduce((sum, item) => sum + item.top2Confidence, 0) / 1984,
      meanMargin: metrics.confidence.meanMargin, meanCorrect: metrics.confidence.meanTop1Correct,
      meanWrong: metrics.confidence.meanTop1Incorrect, brier13: metrics.confidence.brier13,
      ece10: metrics.confidence.ece10, wrongAtLeast090: metrics.confidence.highConfidenceErrors.length,
      wrongAtLeast095: metrics.confidence.highConfidenceErrors.filter((item) => item.confidence >= .95).length,
      highestConfidenceErrors: topWrong }, uncertainty
  };
};

const rawBoards = boardsFor('raw'), calibratedBoards = boardsFor('calibrated');
const raw = compact(evaluateHistoricalBoards(rawBoards), 'raw', rawBoards);
const calibrated = compact(evaluateHistoricalBoards(calibratedBoards), 'calibrated', calibratedBoards);
const report = { schemaVersion: 'caissa-scanner-classifier-revision-real-31/1', modelVersion: config.modelVersion,
  benchmarkPolicy: 'single post-freeze model pass; human corners; unchanged certified RGB64 cache; no detector corners or chess correction',
  stateSha256: freeze.stateSha256, torchscriptSha256: freeze.torchscriptSha256,
  predictionBundleSha256: sha256(predictionBytes), realPixelsSha256: real.pixelsSha256,
  truthManifestSha256: verified.truthManifestSha256, boardCount: 31, squareCount: 1984,
  classOrder: CLASSES, temperature: freeze.temperature, raw, calibrated,
  sourceCategoryPolicy: 'small exploratory groups; unidentified platform/style remains unknown',
  modelChangedAfterBenchmark: false, scannerRuntimeIntegrated: false };
await mkdir(dirname(reportPath), { recursive: true });
await writeFile(reportPath, stableJson(report), { flag: 'wx' });
process.stdout.write(`${JSON.stringify({ reportPath, rawAccuracy13: raw.accuracy13,
  calibratedAccuracy13: calibrated.accuracy13, calibratedOccupiedMacroF1: calibrated.occupiedMacroF1,
  calibratedEmptyFalsePositive: calibrated.occupancy.trueEmptyPredictedOccupied,
  calibratedEmptyTok: calibrated.kingSink.emptyTok,
  calibratedHighConfidenceWrong: calibrated.confidence.wrongAtLeast090 }, null, 2)}\n`);
