const CLASSES = Object.freeze(['empty', 'P', 'N', 'B', 'R', 'Q', 'K', 'p', 'n', 'b', 'r', 'q', 'k']);
const CLASS_SET = new Set(CLASSES);
const FEEDBACK_TYPES = Object.freeze(['CONFIRMED_CORRECT', 'PIECE_CORRECTION', 'LOCALIZATION_FAILURE', 'SCAN_FAILURE']);
const FAILURE_STAGES = Object.freeze([
  'unsupported-input', 'decode', 'localization', 'classifier', 'network',
  'rate-limit', 'authorization', 'service', 'feedback'
]);
const GOVERNANCE_STATES = Object.freeze(['pending-review', 'human-confirmed', 'duplicate', 'held', 'excluded', 'eligible-for-training', 'consumed-in-dataset']);
const PLATFORMS = Object.freeze(['Chess.com', 'Lichess', 'ChessBase / Playchess', 'ICC', 'PlayOK', 'FIDE/event', 'Chessworld', 'CAISSA gateway', 'other']);
const MODEL = Object.freeze({
  version: 'caissa-piece-classifier-v0.5-occupancy-recovery',
  checksum: '90D06A3C1AAC934188CBA5EEB4B68D51AC64C815351BFE372F2215101DD7209E',
  occupancyThreshold: 0.99,
  classOrder: CLASSES,
  preprocessing: 'RGB64 uint8 / 255'
});
const CORPUS_VERSION = 'caissa-scanner-beta-feedback-v0.1';
const SCHEMA_VERSION = 'caissa-scanner-beta-feedback/1';
const HASH = /^[A-F0-9]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function invariant(condition, code) {
  if (!condition) throw new Error(code);
}

function placementOf(fen) {
  invariant(typeof fen === 'string' && fen.trim(), 'FEN_REQUIRED');
  return fen.trim().split(/\s+/)[0];
}

function expandPlacement(fen) {
  const ranks = placementOf(fen).split('/');
  invariant(ranks.length === 8, 'FEN_RANK_COUNT');
  const labels = [];
  for (const rank of ranks) {
    const row = [];
    for (const token of rank) {
      if (/^[1-8]$/.test(token)) row.push(...Array(Number(token)).fill('empty'));
      else {
        invariant(CLASS_SET.has(token) && token !== 'empty', 'FEN_PIECE_CLASS');
        row.push(token);
      }
    }
    invariant(row.length === 8, 'FEN_RANK_WIDTH');
    labels.push(...row);
  }
  invariant(labels.length === 64, 'FEN_SQUARE_COUNT');
  return labels;
}

function placementFromLabels(labels) {
  invariant(Array.isArray(labels) && labels.length === 64, 'LABEL_COUNT');
  invariant(labels.every((label) => CLASS_SET.has(label)), 'SQUARE_CLASS_INVALID');
  const ranks = [];
  for (let row = 0; row < 8; row += 1) {
    let rank = '', empty = 0;
    for (const label of labels.slice(row * 8, row * 8 + 8)) {
      if (label === 'empty') empty += 1;
      else {
        if (empty) rank += String(empty);
        empty = 0;
        rank += label;
      }
    }
    if (empty) rank += String(empty);
    ranks.push(rank);
  }
  return ranks.join('/');
}

function squareAt(index) {
  invariant(Number.isInteger(index) && index >= 0 && index < 64, 'SQUARE_INDEX_INVALID');
  return String.fromCharCode(97 + (index % 8)) + String(8 - Math.floor(index / 8));
}

function fenDiff(originalFen, correctedFen) {
  const original = expandPlacement(originalFen);
  const corrected = expandPlacement(correctedFen);
  return original.flatMap((predicted, index) => predicted === corrected[index] ? [] : [{
    square: squareAt(index), predicted, corrected: corrected[index]
  }]);
}

function clone(value) {
  return typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

function probability(value, code) {
  invariant(typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1, code);
  return value;
}

function validateSquarePrediction(item, index) {
  invariant(item && item.square === squareAt(index), 'PREDICTION_SQUARE_ORDER');
  invariant(CLASS_SET.has(item.predictedClass), 'PREDICTION_CLASS_INVALID');
  probability(item.confidence, 'PREDICTION_CONFIDENCE_INVALID');
  probability(item.occupancyProbability, 'OCCUPANCY_PROBABILITY_INVALID');
  invariant(Array.isArray(item.colorProbabilities) && item.colorProbabilities.length === 2, 'COLOR_PROBABILITIES_INVALID');
  invariant(Array.isArray(item.pieceTypeProbabilities) && item.pieceTypeProbabilities.length === 6, 'PIECE_PROBABILITIES_INVALID');
  item.colorProbabilities.forEach((value) => probability(value, 'COLOR_PROBABILITY_INVALID'));
  item.pieceTypeProbabilities.forEach((value) => probability(value, 'PIECE_PROBABILITY_INVALID'));
  if (item.kingAuxiliaryProbability !== null && item.kingAuxiliaryProbability !== undefined) {
    probability(item.kingAuxiliaryProbability, 'KING_PROBABILITY_INVALID');
  }
}

function createPredictionSnapshot(input) {
  invariant(input && UUID.test(input.scanId || ''), 'SCAN_ID_INVALID');
  invariant(!Number.isNaN(Date.parse(input.timestamp)), 'TIMESTAMP_INVALID');
  invariant(input.modelVersion === MODEL.version, 'MODEL_VERSION_MISMATCH');
  invariant(input.modelChecksum === MODEL.checksum, 'MODEL_CHECKSUM_MISMATCH');
  invariant(input.occupancyThreshold === MODEL.occupancyThreshold, 'OCCUPANCY_THRESHOLD_MISMATCH');
  invariant(HASH.test(input.imageHash || ''), 'IMAGE_HASH_INVALID');
  const labels = expandPlacement(input.predictedFEN);
  invariant(['white-at-bottom', 'black-at-bottom'].includes(input.orientation), 'ORIENTATION_INVALID');
  invariant(Array.isArray(input.detectedCorners) && input.detectedCorners.length === 4
    && input.detectedCorners.every((point) => Array.isArray(point) && point.length === 2
      && point.every((value) => typeof value === 'number' && Number.isFinite(value))), 'CORNERS_INVALID');
  invariant(Array.isArray(input.squarePredictions) && input.squarePredictions.length === 64, 'PREDICTION_COUNT');
  input.squarePredictions.forEach(validateSquarePrediction);
  invariant(input.squarePredictions.every((item, index) => item.predictedClass === labels[index]), 'PREDICTION_FEN_MISMATCH');
  return deepFreeze(clone({
    schemaVersion: 'caissa-scanner-beta-prediction-snapshot/1',
    corpusVersion: CORPUS_VERSION,
    ...input,
    classOrder: [...MODEL.classOrder],
    preprocessing: MODEL.preprocessing
  }));
}

function correctionRows(snapshot, diff) {
  return diff.map((item) => {
    const prediction = snapshot.squarePredictions.find((entry) => entry.square === item.square);
    return {
      ...item,
      originalConfidence: prediction.confidence,
      occupancyProbability: prediction.occupancyProbability,
      colorProbabilities: [...prediction.colorProbabilities],
      pieceTypeProbabilities: [...prediction.pieceTypeProbabilities],
      kingAuxiliaryProbability: prediction.kingAuxiliaryProbability ?? null
    };
  });
}

function createFeedbackRecord({ feedbackId, snapshot, feedbackType, correctedFEN = null,
  finalPositionConfirmed = false, localizationValid = true, consent, platform = null,
  captureType = null, clientMetadata = null, createdAt = new Date().toISOString() }) {
  invariant(UUID.test(feedbackId || ''), 'FEEDBACK_ID_INVALID');
  const original = createPredictionSnapshot(snapshot);
  invariant(FEEDBACK_TYPES.includes(feedbackType), 'FEEDBACK_TYPE_INVALID');
  invariant(platform === null || PLATFORMS.includes(platform), 'PLATFORM_INVALID');
  invariant(captureType === null || ['camera', 'gallery', 'screenshot', 'photo-of-screen'].includes(captureType), 'CAPTURE_TYPE_INVALID');
  invariant(consent && typeof consent.shareImageForImprovement === 'boolean'
    && typeof consent.shareCorrectionForImprovement === 'boolean', 'CONSENT_INVALID');
  let confirmed = correctedFEN || original.predictedFEN;
  let diff = [];
  if (feedbackType === 'CONFIRMED_CORRECT') {
    invariant(finalPositionConfirmed === true && localizationValid === true, 'CONFIRMATION_REQUIRED');
    invariant(placementOf(confirmed) === placementOf(original.predictedFEN), 'CONFIRMED_CORRECT_CHANGED');
  } else if (feedbackType === 'PIECE_CORRECTION') {
    invariant(finalPositionConfirmed === true && localizationValid === true, 'FINAL_POSITION_CONFIRMATION_REQUIRED');
    diff = fenDiff(original.predictedFEN, confirmed);
    invariant(diff.length > 0, 'CORRECTION_DIFF_REQUIRED');
  } else {
    invariant(finalPositionConfirmed === false, 'FAILURE_CANNOT_CONFIRM_POSITION');
    confirmed = null;
    if (feedbackType === 'LOCALIZATION_FAILURE') localizationValid = false;
  }
  return deepFreeze({
    schemaVersion: SCHEMA_VERSION,
    corpusVersion: CORPUS_VERSION,
    feedbackId,
    scanId: original.scanId,
    createdAt,
    feedbackType,
    trainingStatus: 'pending-review',
    modelVersion: original.modelVersion,
    modelChecksum: original.modelChecksum,
    originalFEN: original.predictedFEN,
    correctedFEN: confirmed,
    changedSquareCount: diff.length,
    changedSquares: correctionRows(original, diff),
    finalPositionConfirmed,
    localizationValid,
    consent: clone(consent),
    platform,
    captureType,
    clientMetadata: clientMetadata ? clone(clientMetadata) : null
  });
}

function createScanFailureRecord({ feedbackId, scanId, timestamp = null, createdAt = timestamp || new Date().toISOString(), imageHash,
  modelVersion, modelChecksum, occupancyThreshold, orientation, consent, platform = null,
  captureType = null, clientMetadata = null, failureStage, errorCode }) {
  invariant(UUID.test(feedbackId || ''), 'FEEDBACK_ID_INVALID');
  invariant(UUID.test(scanId || ''), 'SCAN_ID_INVALID');
  invariant(!Number.isNaN(Date.parse(createdAt)), 'TIMESTAMP_INVALID');
  invariant(HASH.test(imageHash || ''), 'IMAGE_HASH_INVALID');
  invariant(modelVersion === MODEL.version, 'MODEL_VERSION_MISMATCH');
  invariant(modelChecksum === MODEL.checksum, 'MODEL_CHECKSUM_MISMATCH');
  invariant(occupancyThreshold === MODEL.occupancyThreshold, 'OCCUPANCY_THRESHOLD_MISMATCH');
  invariant(['white-at-bottom', 'black-at-bottom'].includes(orientation), 'ORIENTATION_INVALID');
  invariant(FAILURE_STAGES.includes(failureStage), 'FAILURE_STAGE_INVALID');
  invariant(typeof errorCode === 'string' && /^[A-Z0-9_-]{1,80}$/.test(errorCode), 'FAILURE_CODE_INVALID');
  invariant(platform === null || PLATFORMS.includes(platform), 'PLATFORM_INVALID');
  invariant(captureType === null || ['camera', 'gallery', 'screenshot', 'photo-of-screen'].includes(captureType), 'CAPTURE_TYPE_INVALID');
  invariant(consent && typeof consent.shareImageForImprovement === 'boolean'
    && typeof consent.shareCorrectionForImprovement === 'boolean', 'CONSENT_INVALID');
  return deepFreeze({
    schemaVersion: 'caissa-scanner-beta-scan-failure/1',
    corpusVersion: CORPUS_VERSION,
    feedbackId,
    scanId,
    createdAt,
    feedbackType: 'SCAN_FAILURE',
    trainingStatus: 'pending-review',
    modelVersion,
    modelChecksum,
    occupancyThreshold,
    imageHash,
    orientation,
    originalFEN: null,
    correctedFEN: null,
    changedSquareCount: 0,
    changedSquares: [],
    finalPositionConfirmed: false,
    localizationValid: false,
    failureStage,
    errorCode,
    consent: clone(consent),
    platform,
    captureType,
    clientMetadata: clientMetadata ? clone(clientMetadata) : null
  });
}

function correctionBand(count) {
  if (count === 0) return '0';
  if (count === 1) return '1';
  if (count === 2) return '2';
  if (count <= 5) return '3-5';
  if (count <= 10) return '6-10';
  return '>10';
}

function aggregateFeedback(records) {
  const rows = Array.isArray(records) ? records : [];
  const successfulBoards = rows.filter((row) => ['CONFIRMED_CORRECT', 'PIECE_CORRECTION'].includes(row.feedbackType));
  const corrections = successfulBoards.map((row) => row.changedSquareCount);
  const ordered = [...corrections].sort((a, b) => a - b);
  const histogram = Object.fromEntries(['0', '1', '2', '3-5', '6-10', '>10'].map((band) => [band, 0]));
  successfulBoards.forEach((row) => { histogram[correctionBand(row.changedSquareCount || 0)] += 1; });
  const confusions = {};
  const pieceErrors = {
    'empty→piece': 0,
    'piece→empty': 0,
    'piece→wrong type': 0,
    'white→black': 0,
    'black→white': 0,
    falseK: 0,
    falsek: 0
  };
  rows.flatMap((row) => row.changedSquares || []).forEach((item) => {
    const key = `${item.predicted}→${item.corrected}`;
    confusions[key] = (confusions[key] || 0) + 1;
    const predictedPiece = item.predicted !== 'empty';
    const correctedPiece = item.corrected !== 'empty';
    if (!predictedPiece && correctedPiece) pieceErrors['empty→piece'] += 1;
    if (predictedPiece && !correctedPiece) pieceErrors['piece→empty'] += 1;
    if (predictedPiece && correctedPiece && item.predicted.toLowerCase() !== item.corrected.toLowerCase()) {
      pieceErrors['piece→wrong type'] += 1;
    }
    if (predictedPiece && correctedPiece && item.predicted === item.predicted.toUpperCase()
      && item.corrected === item.corrected.toLowerCase()) pieceErrors['white→black'] += 1;
    if (predictedPiece && correctedPiece && item.predicted === item.predicted.toLowerCase()
      && item.corrected === item.corrected.toUpperCase()) pieceErrors['black→white'] += 1;
    if (item.predicted === 'K' && item.corrected !== 'K') pieceErrors.falseK += 1;
    if (item.predicted === 'k' && item.corrected !== 'k') pieceErrors.falsek += 1;
  });
  const platform = {};
  rows.forEach((row) => {
    const key = row.platform || 'unspecified';
    const bucket = platform[key] ||= { scans: 0, successfulBoards: 0, exact: 0, corrections: 0, withinTwo: 0, localizationFailures: 0 };
    bucket.scans += 1;
    bucket.successfulBoards += Number(['CONFIRMED_CORRECT', 'PIECE_CORRECTION'].includes(row.feedbackType));
    bucket.exact += Number(row.feedbackType === 'CONFIRMED_CORRECT');
    bucket.corrections += row.changedSquareCount || 0;
    bucket.withinTwo += Number((row.changedSquareCount || 0) <= 2 && !['LOCALIZATION_FAILURE', 'SCAN_FAILURE'].includes(row.feedbackType));
    bucket.localizationFailures += Number(row.feedbackType === 'LOCALIZATION_FAILURE');
  });
  const platformBreakdown = Object.fromEntries(Object.entries(platform).map(([name, bucket]) => [name, {
    scans: bucket.scans,
    exactBoardRate: bucket.successfulBoards ? bucket.exact / bucket.successfulBoards : 0,
    meanCorrections: bucket.successfulBoards ? bucket.corrections / bucket.successfulBoards : 0,
    withinTwoCorrectionRate: bucket.successfulBoards ? bucket.withinTwo / bucket.successfulBoards : 0,
    localizationFailureRate: bucket.scans ? bucket.localizationFailures / bucket.scans : 0,
    smallSample: bucket.scans < 30
  }]));
  return {
    corpusVersion: CORPUS_VERSION,
    scans: new Set(rows.map((row) => row.scanId)).size,
    exact: rows.filter((row) => row.feedbackType === 'CONFIRMED_CORRECT').length,
    corrected: rows.filter((row) => row.feedbackType === 'PIECE_CORRECTION').length,
    localizationFailures: rows.filter((row) => row.feedbackType === 'LOCALIZATION_FAILURE').length,
    scanFailures: rows.filter((row) => row.feedbackType === 'SCAN_FAILURE').length,
    correctionHistogram: histogram,
    meanCorrections: corrections.length ? corrections.reduce((sum, value) => sum + value, 0) / corrections.length : 0,
    medianCorrections: ordered.length ? (ordered[Math.floor((ordered.length - 1) / 2)] + ordered[Math.floor(ordered.length / 2)]) / 2 : 0,
    pieceErrorMetrics: pieceErrors,
    pieceConfusions: Object.fromEntries(Object.entries(confusions).sort()),
    platform: platformBreakdown,
    model: Object.fromEntries([...new Set(rows.map((row) => row.modelVersion))].sort().map((model) => [model, rows.filter((row) => row.modelVersion === model).length]))
  };
}

function eligibleForTraining(record) {
  return record?.trainingStatus === 'eligible-for-training'
    && record.finalPositionConfirmed === true
    && record.localizationValid === true
    && record.consent?.shareCorrectionForImprovement === true
    && record.consent?.shareImageForImprovement === true
    && !['duplicate', 'held', 'excluded', 'consumed-in-dataset'].includes(record.trainingStatus);
}

export {
  CLASSES, CORPUS_VERSION, FAILURE_STAGES, FEEDBACK_TYPES, GOVERNANCE_STATES, MODEL, PLATFORMS, SCHEMA_VERSION,
  aggregateFeedback, createFeedbackRecord, createPredictionSnapshot, createScanFailureRecord, eligibleForTraining,
  expandPlacement, fenDiff, placementFromLabels, placementOf, squareAt
};
