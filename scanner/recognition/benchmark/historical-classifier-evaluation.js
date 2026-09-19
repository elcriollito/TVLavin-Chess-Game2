import { HISTORICAL_CLASSES } from './historical-tfjs-baseline.js';
import { fenPlacementToLabels } from './manifest.js';

const classes = new Set(HISTORICAL_CLASSES);
const occupied = (label) => label !== 'empty';
const color = (label) => !occupied(label) ? null : label === label.toUpperCase() ? 'white' : 'black';
const type = (label) => !occupied(label) ? null : label.toUpperCase();
const rate = (hits, count) => count ? hits / count : null;
const mean = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
const f1 = (precision, recall) => precision === null || recall === null ? null
  : precision + recall ? 2 * precision * recall / (precision + recall) : 0;
const squareName = (index, orientation) => {
  const canonical = orientation === 'black-at-bottom' ? 63 - index : index;
  return `${String.fromCharCode(97 + canonical % 8)}${8 - Math.floor(canonical / 8)}`;
};

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

export function knownHardCaseObservations(perBoard) {
  const partialCases = [
    { id: 'A', facts: { e1: 'R', c1: 'B', f1: 'B', e3: 'Q', e8: 'k', d8: 'q', d6: 'b', a6: 'b' }, minimumMatches: 7,
      referenceNote: 'bishop/queen confusion in Chessvision; source ID not certified' },
    { id: 'B', facts: { e7: 'b', c8: 'b', a5: 'n' }, minimumMatches: 3,
      referenceNote: 'black bishop/knight confusion in Chessvision; source ID not certified' },
    { id: 'C', facts: { e1: 'K' }, minimumMatches: 1,
      referenceNote: 'Chessvision called an e1 white king black; source ID not certified' }
  ];
  return partialCases.map(({ id, facts, minimumMatches, referenceNote }) => ({
    id, knownPartialTruth: facts, referenceNote,
    sourceMappingStatus: 'unconfirmed-partial-truth-match-only',
    candidates: perBoard.flatMap((board) => {
      const predictions = new Map(board.squarePredictions.map((item) => [item.square, item]));
      const observations = Object.entries(facts).map(([square, expectedTruth]) => {
        const prediction = predictions.get(square);
        return { square, expectedTruth, actualTruth: prediction?.truth || null,
          top1: prediction?.top1 || null, top1Confidence: prediction?.top1Confidence ?? null,
          top2: prediction?.top2 || null, top2Confidence: prediction?.top2Confidence ?? null };
      });
      const matchingFacts = observations.filter((item) => item.actualTruth === item.expectedTruth).length;
      return matchingFacts >= minimumMatches ? [{ sampleId: board.sampleId, matchingFacts,
        totalFacts: observations.length, observations,
        matchesPreviouslyObservedChessvisionError: null,
        comparisonReason: 'Reference source ID and per-square output were not certified; no cross-system ranking.' }] : [];
    })
  }));
}

export function evaluateHistoricalBoards(boards) {
  const matrix = HISTORICAL_CLASSES.map(() => Array(13).fill(0));
  const perBoard = [];
  const groups = { pieceSetFamily: {}, pieceSetStyle: {}, sourceCategory: {}, sourcePlatform: {}, difficultyTag: {} };
  const confidenceBins = Array.from({ length: 10 }, () => ({ count: 0, correct: 0, confidenceSum: 0 }));
  const confidence = [], correctConfidence = [], incorrectConfidence = [];
  const margins = [];
  const highConfidenceErrors = [];
  const colorSwap = Object.fromEntries(['P', 'N', 'B', 'R', 'Q', 'K'].map((piece) => [piece, { whiteToBlack: 0, blackToWhite: 0 }]));
  const pieceTypeConfusion = {};
  const chessAware = { duplicateWhiteKing: 0, duplicateBlackKing: 0, missingWhiteKing: 0, missingBlackKing: 0,
    moreThan16White: 0, moreThan16Black: 0, pawnOnBackRank: 0 };
  let squareCount = 0, correct = 0, occupiedHits = 0, typeHits = 0, colorHits = 0, occupiedTruth = 0,
    whiteTruth = 0, whiteHits = 0, blackTruth = 0, blackHits = 0, occupiedErrors = 0,
    totalColorSwaps = 0, totalPieceTypeConfusions = 0, brierSum = 0;
  for (const board of boards) {
    const labels = truthLabels(board.truth);
    if (!Array.isArray(board.predictions) || board.predictions.length !== 64) throw new Error(`${board.sampleId}: 64 predictions required`);
    let wrong = 0;
    let boardOccupiedTruth = 0, boardColorSwaps = 0, boardTypeConfusions = 0;
    const predictedLabels = [];
    const squarePredictions = [];
    for (let index = 0; index < 64; index += 1) {
      const truth = labels[index];
      const prediction = board.predictions[index];
      const probabilities = prediction.classProbabilities;
      if (!classes.has(prediction.predictedClass) || !Array.isArray(probabilities) || probabilities.length !== 13
          || probabilities.some((value) => !Number.isFinite(value) || value < 0 || value > 1)
          || Math.abs(probabilities.reduce((sum, value) => sum + value, 0) - 1) > 0.0001) throw new Error(`${board.sampleId}: invalid prediction ${index}`);
      const ranking = probabilities.map((value, classIndex) => [value, classIndex])
        .sort((a, b) => b[0] - a[0] || a[1] - b[1]);
      const predictedClassIndex = HISTORICAL_CLASSES.indexOf(prediction.predictedClass);
      const policyDecision = prediction.decisionBasis === 'occupancy-threshold';
      if (!policyDecision && predictedClassIndex !== ranking[0][1]) {
        throw new Error(`${board.sampleId}: predicted class does not match top probability at ${index}`);
      }
      if (prediction.decisionBasis && !policyDecision) {
        throw new Error(`${board.sampleId}: unsupported prediction decision basis at ${index}`);
      }
      const predicted = prediction.predictedClass;
      const isCorrect = truth === predicted;
      predictedLabels.push(predicted);
      matrix[HISTORICAL_CLASSES.indexOf(truth)][HISTORICAL_CLASSES.indexOf(predicted)]++;
      squareCount++;
      if (isCorrect) correct++;
      else wrong++;
      if (occupied(truth)) {
        occupiedTruth++; boardOccupiedTruth++;
        if (!isCorrect) occupiedErrors++;
        if (color(truth) === 'white') { whiteTruth++; if (isCorrect) whiteHits++; }
        else { blackTruth++; if (isCorrect) blackHits++; }
        if (type(truth) === type(predicted)) typeHits++;
        if (color(truth) === color(predicted)) colorHits++;
        if (occupied(predicted) && type(truth) === type(predicted) && color(truth) !== color(predicted)) {
          colorSwap[type(truth)][color(truth) === 'white' ? 'whiteToBlack' : 'blackToWhite']++;
          totalColorSwaps++; boardColorSwaps++;
        }
        if (occupied(predicted) && type(truth) !== type(predicted)) {
          const key = `${type(truth)}->${type(predicted)}`;
          pieceTypeConfusion[key] = (pieceTypeConfusion[key] || 0) + 1;
          totalPieceTypeConfusions++; boardTypeConfusions++;
        }
      }
      if (occupied(truth) === occupied(predicted)) occupiedHits++;
      brierSum += probabilities.reduce((sum, value, classIndex) => sum + (value - (HISTORICAL_CLASSES[classIndex] === truth ? 1 : 0)) ** 2, 0);
      const decisionRanking = policyDecision
        ? [[probabilities[predictedClassIndex], predictedClassIndex],
          ...ranking.filter(([, classIndex]) => classIndex !== predictedClassIndex)]
        : ranking;
      const topConfidence = decisionRanking[0][0];
      const topTwoMargin = decisionRanking[0][0] - decisionRanking[1][0];
      confidence.push(topConfidence);
      (isCorrect ? correctConfidence : incorrectConfidence).push(topConfidence);
      margins.push(topTwoMargin);
      squarePredictions.push({ visualSquareIndex: index, square: squareName(index, board.truth.orientation), truth,
        top1: predicted, top1Confidence: topConfidence, top2: HISTORICAL_CLASSES[decisionRanking[1][1]],
        top2Confidence: decisionRanking[1][0], margin: topTwoMargin, correct: isCorrect,
        classProbabilities: probabilities });
      const bin = confidenceBins[Math.min(9, Math.floor(topConfidence * 10))];
      bin.count++;
      bin.correct += Number(isCorrect);
      bin.confidenceSum += topConfidence;
      if (!isCorrect && topConfidence >= 0.9) highConfidenceErrors.push({ sampleId: board.sampleId,
        visualSquareIndex: index, square: squareName(index, board.truth.orientation), truth, predicted,
        confidence: topConfidence, top2: HISTORICAL_CLASSES[decisionRanking[1][1]], top2Confidence: decisionRanking[1][0] });
    }
    const counts = (label) => predictedLabels.filter((value) => value === label).length;
    const structuralWarnings = [];
    if (counts('K') > 1) { chessAware.duplicateWhiteKing++; structuralWarnings.push('multiple-white-kings'); }
    if (counts('k') > 1) { chessAware.duplicateBlackKing++; structuralWarnings.push('multiple-black-kings'); }
    if (!counts('K')) { chessAware.missingWhiteKing++; structuralWarnings.push('missing-white-king'); }
    if (!counts('k')) { chessAware.missingBlackKing++; structuralWarnings.push('missing-black-king'); }
    if (predictedLabels.filter((value) => color(value) === 'white').length > 16) {
      chessAware.moreThan16White++; structuralWarnings.push('more-than-16-white-pieces');
    }
    if (predictedLabels.filter((value) => color(value) === 'black').length > 16) {
      chessAware.moreThan16Black++; structuralWarnings.push('more-than-16-black-pieces');
    }
    if ([...predictedLabels.slice(0, 8), ...predictedLabels.slice(56)].some((label) => label === 'P' || label === 'p')) {
      chessAware.pawnOnBackRank++; structuralWarnings.push('pawn-on-back-rank');
    }
    perBoard.push({ sampleId: board.sampleId, wrongSquares: wrong, exact: wrong === 0,
      structuralWarnings, squarePredictions });
    for (const [dimension, values] of Object.entries({ pieceSetFamily: [board.pieceSetFamily || 'unknown'],
      pieceSetStyle: [board.pieceSetStyle || 'unknown'], sourceCategory: [board.sourceCategory || 'unknown'],
      sourcePlatform: [board.sourcePlatform || 'unrecorded'],
      difficultyTag: board.difficultyTags?.length ? board.difficultyTags : ['untagged'] })) {
      for (const value of values) {
        const item = groups[dimension][value] ||= { boards: 0, squares: 0, correctSquares: 0, exactBoards: 0,
          occupiedTruthSquares: 0, colorSwapErrors: 0, pieceTypeConfusionErrors: 0 };
        item.boards++;
        item.squares += 64;
        item.correctSquares += 64 - wrong;
        item.exactBoards += Number(wrong === 0);
        item.occupiedTruthSquares += boardOccupiedTruth;
        item.colorSwapErrors += boardColorSwaps;
        item.pieceTypeConfusionErrors += boardTypeConfusions;
      }
    }
  }
  const perClass = HISTORICAL_CLASSES.map((label, index) => {
    const support = matrix[index].reduce((sum, count) => sum + count, 0);
    const predicted = matrix.reduce((sum, row) => sum + row[index], 0);
    const precision = rate(matrix[index][index], predicted);
    const recall = rate(matrix[index][index], support);
    return { label, support, predicted, precision, recall, f1: f1(precision, recall) };
  });
  const calibratedBins = confidenceBins.map((bin, index) => ({ range: [index / 10, (index + 1) / 10], count: bin.count, accuracy: rate(bin.correct, bin.count), meanConfidence: rate(bin.confidenceSum, bin.count) }));
  const ece = squareCount >= 100 ? calibratedBins.reduce((sum, bin) => sum + bin.count / squareCount * Math.abs(bin.accuracy - bin.meanConfidence), 0) : null;
  for (const dimension of Object.values(groups)) for (const item of Object.values(dimension)) {
    item.squareAccuracy = rate(item.correctSquares, item.squares);
    item.exactBoardAccuracy = rate(item.exactBoards, item.boards);
    item.colorSwapRateOnTrueOccupied = rate(item.colorSwapErrors, item.occupiedTruthSquares);
    item.pieceTypeConfusionRateOnTrueOccupied = rate(item.pieceTypeConfusionErrors, item.occupiedTruthSquares);
  }
  const correctionCounts = perBoard.map((board) => board.wrongSquares).sort((a, b) => a - b);
  return {
    boardCount: boards.length, squareCount, accuracy13: rate(correct, squareCount), occupiedVsEmptyAccuracy: rate(occupiedHits, squareCount),
    pieceTypeAccuracyOnTrueOccupied: rate(typeHits, occupiedTruth), colorAccuracyOnTrueOccupied: rate(colorHits, occupiedTruth),
    whitePieceAccuracy: rate(whiteHits, whiteTruth), blackPieceAccuracy: rate(blackHits, blackTruth),
    occupiedTruthSquares: occupiedTruth, whiteTruthSquares: whiteTruth, blackTruthSquares: blackTruth,
    occupiedSquareErrors: occupiedErrors, totalColorSwaps, colorSwapsAsFractionOfOccupiedErrors: rate(totalColorSwaps, occupiedErrors),
    totalPieceTypeConfusions,
    confusionMatrix: matrix, classOrder: HISTORICAL_CLASSES, perClass, colorSwap, pieceTypeConfusion,
    groups, exactBoardAccuracy: rate(perBoard.filter((board) => board.exact).length, boards.length),
    correctionBurden: { mean: mean(correctionCounts), median: correctionCounts.length ? (correctionCounts[Math.floor((correctionCounts.length - 1) / 2)] + correctionCounts[Math.floor(correctionCounts.length / 2)]) / 2 : null,
      zero: correctionCounts.filter((count) => count === 0).length, one: correctionCounts.filter((count) => count === 1).length, two: correctionCounts.filter((count) => count === 2).length, threePlus: correctionCounts.filter((count) => count >= 3).length },
    confidence: { meanTop1: mean(confidence), meanTop1Correct: mean(correctConfidence),
      meanTop1Incorrect: mean(incorrectConfidence), meanMargin: mean(margins), brier13: rate(brierSum, squareCount),
      ece10: ece, bins: calibratedBins, highConfidenceErrors },
    chessAwareSignals: chessAware, perBoard
  };
}
