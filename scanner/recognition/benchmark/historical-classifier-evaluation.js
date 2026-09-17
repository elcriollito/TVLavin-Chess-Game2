import { HISTORICAL_CLASSES } from './historical-tfjs-baseline.js';
import { fenPlacementToLabels } from './manifest.js';

const classes = new Set(HISTORICAL_CLASSES);
const occupied = (label) => label !== 'empty';
const color = (label) => !occupied(label) ? null : label === label.toUpperCase() ? 'white' : 'black';
const type = (label) => !occupied(label) ? null : label.toUpperCase();
const rate = (hits, count) => count ? hits / count : null;
const mean = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;

export function truthLabels(entry) {
  if (!entry || typeof entry !== 'object' || !entry.verifiedBy
      || !(entry.verifiedAt || entry.reviewedAgainstRectifiedBoard === true)) {
    throw new Error('human verifier and verification evidence required');
  }
  if (!/^[A-F0-9]{64}$/.test(entry.sourceSha256 || '')) throw new Error('source SHA-256 required');
  let labels = entry.squareLabels;
  if (entry.fenPlacement) {
    if (!['white-at-bottom', 'black-at-bottom'].includes(entry.orientation)) throw new Error('verified orientation required for FEN');
    const fen = fenPlacementToLabels(entry.fenPlacement);
    const visualOrder = entry.orientation === 'black-at-bottom' ? fen.reverse() : fen;
    if (labels && JSON.stringify(labels) !== JSON.stringify(visualOrder)) throw new Error('FEN and visual square labels disagree');
    labels = visualOrder;
  }
  if (!Array.isArray(labels) || labels.length !== 64 || labels.some((label) => !classes.has(label))) throw new Error('exactly 64 valid square labels required');
  return labels;
}

export function selectUniqueSources(entries) {
  const seen = new Set();
  const selected = [];
  const duplicates = [];
  for (const entry of entries) {
    if (seen.has(entry.sourceSha256)) duplicates.push(entry.sampleId);
    else { seen.add(entry.sourceSha256); selected.push(entry); }
  }
  return { selected, duplicates };
}

export function evaluateHistoricalBoards(boards) {
  const matrix = HISTORICAL_CLASSES.map(() => Array(13).fill(0));
  const perBoard = [];
  const groups = { pieceSetFamily: {}, sourceCategory: {}, difficultyTag: {} };
  const confidenceBins = Array.from({ length: 10 }, () => ({ count: 0, correct: 0, confidenceSum: 0 }));
  const confidence = [];
  const margins = [];
  const highConfidenceErrors = [];
  const colorSwap = Object.fromEntries(['P', 'N', 'B', 'R', 'Q', 'K'].map((piece) => [piece, { whiteToBlack: 0, blackToWhite: 0 }]));
  const pieceTypeConfusion = {};
  const chessAware = { duplicateWhiteKing: 0, duplicateBlackKing: 0, missingWhiteKing: 0, missingBlackKing: 0, moreThan16White: 0, moreThan16Black: 0 };
  let squareCount = 0, correct = 0, occupiedHits = 0, typeHits = 0, colorHits = 0, occupiedTruth = 0, brierSum = 0;
  for (const board of boards) {
    const labels = truthLabels(board.truth);
    if (!Array.isArray(board.predictions) || board.predictions.length !== 64) throw new Error(`${board.sampleId}: 64 predictions required`);
    let wrong = 0;
    const predictedLabels = [];
    for (let index = 0; index < 64; index += 1) {
      const truth = labels[index];
      const prediction = board.predictions[index];
      const probabilities = prediction.classProbabilities;
      if (!classes.has(prediction.predictedClass) || !Array.isArray(probabilities) || probabilities.length !== 13
          || probabilities.some((value) => !Number.isFinite(value) || value < 0 || value > 1)
          || Math.abs(probabilities.reduce((sum, value) => sum + value, 0) - 1) > 0.0001) throw new Error(`${board.sampleId}: invalid prediction ${index}`);
      if (HISTORICAL_CLASSES.indexOf(prediction.predictedClass) !== probabilities.indexOf(Math.max(...probabilities))) {
        throw new Error(`${board.sampleId}: predicted class does not match top probability at ${index}`);
      }
      const predicted = prediction.predictedClass;
      const isCorrect = truth === predicted;
      predictedLabels.push(predicted);
      matrix[HISTORICAL_CLASSES.indexOf(truth)][HISTORICAL_CLASSES.indexOf(predicted)]++;
      squareCount++;
      if (isCorrect) correct++;
      else wrong++;
      if (occupied(truth)) {
        occupiedTruth++;
        if (type(truth) === type(predicted)) typeHits++;
        if (color(truth) === color(predicted)) colorHits++;
        if (occupied(predicted) && type(truth) === type(predicted) && color(truth) !== color(predicted)) {
          colorSwap[type(truth)][color(truth) === 'white' ? 'whiteToBlack' : 'blackToWhite']++;
        }
        if (occupied(predicted) && type(truth) !== type(predicted)) {
          const key = `${type(truth)}->${type(predicted)}`;
          pieceTypeConfusion[key] = (pieceTypeConfusion[key] || 0) + 1;
        }
      }
      if (occupied(truth) === occupied(predicted)) occupiedHits++;
      brierSum += probabilities.reduce((sum, value, classIndex) => sum + (value - (HISTORICAL_CLASSES[classIndex] === truth ? 1 : 0)) ** 2, 0);
      const topConfidence = Math.max(...probabilities);
      const sorted = [...probabilities].sort((a, b) => b - a);
      confidence.push(topConfidence);
      margins.push(sorted[0] - sorted[1]);
      const bin = confidenceBins[Math.min(9, Math.floor(topConfidence * 10))];
      bin.count++;
      bin.correct += Number(isCorrect);
      bin.confidenceSum += topConfidence;
      if (!isCorrect && topConfidence >= 0.9) highConfidenceErrors.push({ sampleId: board.sampleId, visualSquareIndex: index, truth, predicted, confidence: topConfidence });
    }
    const counts = (label) => predictedLabels.filter((value) => value === label).length;
    if (counts('K') > 1) chessAware.duplicateWhiteKing++;
    if (counts('k') > 1) chessAware.duplicateBlackKing++;
    if (!counts('K')) chessAware.missingWhiteKing++;
    if (!counts('k')) chessAware.missingBlackKing++;
    if (predictedLabels.filter((value) => color(value) === 'white').length > 16) chessAware.moreThan16White++;
    if (predictedLabels.filter((value) => color(value) === 'black').length > 16) chessAware.moreThan16Black++;
    perBoard.push({ sampleId: board.sampleId, wrongSquares: wrong, exact: wrong === 0 });
    for (const [dimension, values] of Object.entries({ pieceSetFamily: [board.pieceSetFamily || 'unknown'], sourceCategory: [board.sourceCategory || 'unknown'], difficultyTag: board.difficultyTags?.length ? board.difficultyTags : ['untagged'] })) {
      for (const value of values) {
        const item = groups[dimension][value] ||= { boards: 0, squares: 0, correctSquares: 0, exactBoards: 0 };
        item.boards++;
        item.squares += 64;
        item.correctSquares += 64 - wrong;
        item.exactBoards += Number(wrong === 0);
      }
    }
  }
  const perClass = HISTORICAL_CLASSES.map((label, index) => {
    const support = matrix[index].reduce((sum, count) => sum + count, 0);
    const predicted = matrix.reduce((sum, row) => sum + row[index], 0);
    return { label, support, predicted, precision: rate(matrix[index][index], predicted), recall: rate(matrix[index][index], support) };
  });
  const calibratedBins = confidenceBins.map((bin, index) => ({ range: [index / 10, (index + 1) / 10], count: bin.count, accuracy: rate(bin.correct, bin.count), meanConfidence: rate(bin.confidenceSum, bin.count) }));
  const ece = squareCount >= 100 ? calibratedBins.reduce((sum, bin) => sum + bin.count / squareCount * Math.abs(bin.accuracy - bin.meanConfidence), 0) : null;
  for (const dimension of Object.values(groups)) for (const item of Object.values(dimension)) {
    item.squareAccuracy = rate(item.correctSquares, item.squares);
    item.exactBoardAccuracy = rate(item.exactBoards, item.boards);
  }
  const correctionCounts = perBoard.map((board) => board.wrongSquares).sort((a, b) => a - b);
  return {
    boardCount: boards.length, squareCount, accuracy13: rate(correct, squareCount), occupiedVsEmptyAccuracy: rate(occupiedHits, squareCount),
    pieceTypeAccuracyOnTrueOccupied: rate(typeHits, occupiedTruth), colorAccuracyOnTrueOccupied: rate(colorHits, occupiedTruth),
    confusionMatrix: matrix, classOrder: HISTORICAL_CLASSES, perClass, colorSwap, pieceTypeConfusion,
    groups, exactBoardAccuracy: rate(perBoard.filter((board) => board.exact).length, boards.length),
    correctionBurden: { mean: mean(correctionCounts), median: correctionCounts.length ? (correctionCounts[Math.floor((correctionCounts.length - 1) / 2)] + correctionCounts[Math.floor(correctionCounts.length / 2)]) / 2 : null,
      zero: correctionCounts.filter((count) => count === 0).length, one: correctionCounts.filter((count) => count === 1).length, two: correctionCounts.filter((count) => count === 2).length, threePlus: correctionCounts.filter((count) => count >= 3).length },
    confidence: { meanTop1: mean(confidence), meanMargin: mean(margins), brier13: rate(brierSum, squareCount), ece10: ece, bins: calibratedBins, highConfidenceErrors },
    chessAwareSignals: chessAware, perBoard
  };
}
