import { aggregateFeedback, expandPlacement, fenDiff, MODEL } from '../../scanner/beta/scanner-beta-contract.js';
import { sha256, stableJson } from '../../api/_lib/scanner-beta-policy.js';

export const FIELD_CORPUS_VERSION = 'caissa-scanner-beta-field-v0.1';
export const FIELD_CORPUS_MINIMUM = 30;

const COMPLETED_TYPES = new Set(['CONFIRMED_CORRECT', 'PIECE_CORRECTION', 'LOCALIZATION_FAILURE', 'SCAN_FAILURE']);
const CLASSIFIER_TYPES = new Set(['CONFIRMED_CORRECT', 'PIECE_CORRECTION']);
const PLATFORM_NAMES = ['Chess.com', 'Lichess', 'ChessBase / Playchess', 'ICC', 'PlayOK', 'FIDE/event', 'Chessworld', 'CAISSA gateway', 'other'];

function ratio(numerator, denominator) { return denominator ? numerator / denominator : 0; }
function mean(values) { return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0; }
function median(values) {
  if (!values.length) return 0;
  const ordered = [...values].sort((a, b) => a - b);
  return (ordered[Math.floor((ordered.length - 1) / 2)] + ordered[Math.floor(ordered.length / 2)]) / 2;
}
function percentile(values, percentileValue) {
  if (!values.length) return 0;
  const ordered = [...values].sort((a, b) => a - b);
  return ordered[Math.max(0, Math.ceil(percentileValue * ordered.length) - 1)];
}

function changedSquaresMatch(feedback, expected) {
  if (feedback.changedSquareCount !== expected.length || !Array.isArray(feedback.changedSquares)
      || feedback.changedSquares.length !== expected.length) return false;
  return expected.every((change, index) => {
    const actual = feedback.changedSquares[index];
    return actual?.square === change.square && actual.predicted === change.predicted && actual.corrected === change.corrected;
  });
}

function validatePair(scan, feedback, storedPayloadHash) {
  const errors = [];
  const snapshot = scan?.snapshot;
  if (!snapshot || scan.scanId !== snapshot.scanId || feedback.scanId !== scan.scanId) errors.push('SCAN_LINK_INVALID');
  if (snapshot && scan?.snapshotHash !== sha256(stableJson(snapshot))) errors.push('SNAPSHOT_HASH_MISMATCH');
  if (storedPayloadHash !== sha256(stableJson(feedback))) errors.push('FEEDBACK_HASH_MISMATCH');
  if (snapshot?.schemaVersion !== 'caissa-scanner-beta-prediction-snapshot/1') errors.push('SNAPSHOT_SCHEMA_INVALID');
  if (feedback.schemaVersion !== 'caissa-scanner-beta-feedback/1') errors.push('FEEDBACK_SCHEMA_INVALID');
  if (!COMPLETED_TYPES.has(feedback.feedbackType)) errors.push('DISPOSITION_INVALID');
  if (snapshot?.modelVersion !== MODEL.version || feedback.modelVersion !== MODEL.version) errors.push('MODEL_VERSION_MISMATCH');
  if (snapshot?.modelChecksum !== MODEL.checksum || feedback.modelChecksum !== MODEL.checksum) errors.push('MODEL_CHECKSUM_MISMATCH');
  if (snapshot?.occupancyThreshold !== MODEL.occupancyThreshold) errors.push('THRESHOLD_MISMATCH');
  let predicted = null;
  try {
    predicted = expandPlacement(snapshot?.predictedFEN);
    if (!Array.isArray(snapshot.squarePredictions) || snapshot.squarePredictions.length !== 64
        || snapshot.squarePredictions.some((item, index) => item.square !== `${String.fromCharCode(97 + index % 8)}${8 - Math.floor(index / 8)}`
          || item.predictedClass !== predicted[index])) errors.push('PREDICTION_SNAPSHOT_INVALID');
  } catch (_) { errors.push('PREDICTED_FEN_INVALID'); }
  if (feedback.originalFEN !== snapshot?.predictedFEN) errors.push('ORIGINAL_FEN_MISMATCH');
  if (CLASSIFIER_TYPES.has(feedback.feedbackType)) {
    if (feedback.finalPositionConfirmed !== true || feedback.localizationValid !== true) errors.push('TRUTH_CONFIRMATION_INVALID');
    try {
      const diff = fenDiff(snapshot.predictedFEN, feedback.correctedFEN);
      if (!changedSquaresMatch(feedback, diff)) errors.push('CORRECTION_DIFF_INVALID');
      if (feedback.feedbackType === 'CONFIRMED_CORRECT' && diff.length !== 0) errors.push('EXACT_DISPOSITION_INVALID');
      if (feedback.feedbackType === 'PIECE_CORRECTION' && diff.length === 0) errors.push('CORRECTION_DISPOSITION_INVALID');
    } catch (_) { errors.push('CORRECTED_FEN_INVALID'); }
  } else if (feedback.finalPositionConfirmed !== false) errors.push('FAILURE_CONFIRMATION_INVALID');
  if (feedback.feedbackType === 'LOCALIZATION_FAILURE' && feedback.localizationValid !== false) errors.push('LOCALIZATION_DISPOSITION_INVALID');
  return errors;
}

function validateFailure(feedback, storedPayloadHash) {
  const errors = [];
  if (storedPayloadHash !== sha256(stableJson(feedback))) errors.push('FEEDBACK_HASH_MISMATCH');
  if (feedback.schemaVersion !== 'caissa-scanner-beta-scan-failure/1') errors.push('FAILURE_SCHEMA_INVALID');
  if (feedback.feedbackType !== 'SCAN_FAILURE') errors.push('DISPOSITION_INVALID');
  if (feedback.modelVersion !== MODEL.version) errors.push('MODEL_VERSION_MISMATCH');
  if (feedback.modelChecksum !== MODEL.checksum) errors.push('MODEL_CHECKSUM_MISMATCH');
  if (feedback.occupancyThreshold !== MODEL.occupancyThreshold) errors.push('THRESHOLD_MISMATCH');
  if (!/^[A-F0-9]{64}$/.test(feedback.imageHash || '')) errors.push('IMAGE_HASH_INVALID');
  if (feedback.finalPositionConfirmed !== false || feedback.localizationValid !== false) errors.push('FAILURE_TRUTH_INVALID');
  if (!['unsupported-input', 'decode', 'localization', 'classifier', 'feedback'].includes(feedback.failureStage)) errors.push('FAILURE_STAGE_INVALID');
  return errors;
}

function deduplicate(state) {
  const scanIds = new Set(), feedbackIds = new Set(), payloadHashes = new Set();
  const scans = [], feedback = [];
  const payloadHashByFeedbackId = new Map();
  const audit = { duplicateScanIds: 0, duplicateFeedbackIds: 0, retryPayloads: 0, sameImageResubmissions: 0 };
  const images = new Map();
  for (const scan of state.scans || []) {
    if (scanIds.has(scan.scanId)) { audit.duplicateScanIds += 1; continue; }
    scanIds.add(scan.scanId); scans.push(scan);
    const imageHash = scan.snapshot?.imageHash;
    if (imageHash) images.set(imageHash, (images.get(imageHash) || 0) + 1);
  }
  for (const item of [...(state.feedback || []), ...(state.failures || [])]) {
    const record = item.feedback || item.failure || item;
    const feedbackId = item.feedbackId || record.feedbackId;
    const payloadHash = item.payloadHash || sha256(stableJson(record));
    if (feedbackIds.has(feedbackId)) { audit.duplicateFeedbackIds += 1; continue; }
    if (payloadHashes.has(payloadHash)) { audit.retryPayloads += 1; continue; }
    feedbackIds.add(feedbackId); payloadHashes.add(payloadHash); feedback.push(record);
    payloadHashByFeedbackId.set(feedbackId, payloadHash);
    if (record.schemaVersion === 'caissa-scanner-beta-scan-failure/1' && record.imageHash) {
      images.set(record.imageHash, (images.get(record.imageHash) || 0) + 1);
    }
  }
  audit.sameImageResubmissions = [...images.values()].reduce((sum, count) => sum + Math.max(0, count - 1), 0);
  return { scans, feedback, payloadHashByFeedbackId, audit };
}

function structuralWarnings(labels) {
  const warnings = [];
  const whiteKings = labels.filter((label) => label === 'K').length;
  const blackKings = labels.filter((label) => label === 'k').length;
  if (!whiteKings) warnings.push('missing-white-king');
  if (!blackKings) warnings.push('missing-black-king');
  if (whiteKings > 1) warnings.push('duplicate-white-king');
  if (blackKings > 1) warnings.push('duplicate-black-king');
  if (labels.filter((label) => label !== 'empty' && label.toLowerCase() !== 'k').length > 30) warnings.push('extreme-material');
  if (labels.slice(0, 8).some((label) => label.toLowerCase() === 'p')
      || labels.slice(56).some((label) => label.toLowerCase() === 'p')) warnings.push('back-rank-pawn');
  return warnings;
}

function groupMetrics(rows, keyOf) {
  const groups = {};
  for (const row of rows) {
    const key = keyOf(row) || 'unspecified';
    const bucket = groups[key] ||= { scans: 0, exact: 0, minimal: 0, corrections: [], localizationFailures: 0, scanFailures: 0 };
    bucket.scans += 1;
    bucket.exact += Number(row.feedback.feedbackType === 'CONFIRMED_CORRECT');
    bucket.minimal += Number(CLASSIFIER_TYPES.has(row.feedback.feedbackType) && row.feedback.changedSquareCount <= 2);
    if (CLASSIFIER_TYPES.has(row.feedback.feedbackType)) bucket.corrections.push(row.feedback.changedSquareCount);
    bucket.localizationFailures += Number(row.feedback.feedbackType === 'LOCALIZATION_FAILURE');
    bucket.scanFailures += Number(row.feedback.feedbackType === 'SCAN_FAILURE');
  }
  return Object.fromEntries(Object.entries(groups).sort(([a], [b]) => a.localeCompare(b)).map(([key, bucket]) => [key, {
    scans: bucket.scans,
    exactBoardRate: ratio(bucket.exact, bucket.scans),
    withinTwoErrorRate: ratio(bucket.minimal, bucket.scans),
    meanCorrections: mean(bucket.corrections),
    localizationFailures: bucket.localizationFailures,
    scanFailures: bucket.scanFailures,
    exploratory: bucket.scans < 10
  }]));
}

function classificationMetrics(rows) {
  let trueOccupied = 0, falseOccupied = 0, missedOccupied = 0, trueEmpty = 0;
  const confusions = {}, king = { falseK: 0, falsek: 0, 'empty→K': 0, 'empty→k': 0, 'other→K': 0, 'other→k': 0 };
  const pieceClasses = ['P', 'N', 'B', 'R', 'Q', 'K', 'p', 'n', 'b', 'r', 'q', 'k'];
  const matrix = Object.fromEntries(pieceClasses.map((predicted) => [predicted,
    Object.fromEntries(pieceClasses.map((corrected) => [corrected, 0]))]));
  const pieceErrors = { emptyToPiece: 0, pieceToEmpty: 0, wrongPieceType: 0 };
  let whiteToBlack = 0, blackToWhite = 0;
  const wrongConfidence = [], correctConfidence = [];
  for (const { scan, feedback } of rows) {
    const predicted = expandPlacement(scan.snapshot.predictedFEN);
    const truth = expandPlacement(feedback.correctedFEN);
    for (let index = 0; index < 64; index += 1) {
      const prediction = predicted[index], corrected = truth[index];
      const predictedOccupied = prediction !== 'empty', truthOccupied = corrected !== 'empty';
      if (predictedOccupied && truthOccupied) trueOccupied += 1;
      else if (predictedOccupied) falseOccupied += 1;
      else if (truthOccupied) missedOccupied += 1;
      else trueEmpty += 1;
      const confidence = scan.snapshot.squarePredictions[index].confidence;
      if (prediction === corrected) correctConfidence.push(confidence);
      else {
        wrongConfidence.push(confidence);
        const key = `${prediction}→${corrected}`;
        confusions[key] = (confusions[key] || 0) + 1;
        if (!predictedOccupied && truthOccupied) pieceErrors.emptyToPiece += 1;
        if (predictedOccupied && !truthOccupied) pieceErrors.pieceToEmpty += 1;
        if (predictedOccupied && truthOccupied) {
          matrix[prediction][corrected] += 1;
          if (prediction.toLowerCase() !== corrected.toLowerCase()) pieceErrors.wrongPieceType += 1;
        }
        if (prediction === 'K' && corrected !== 'K') king.falseK += 1;
        if (prediction === 'k' && corrected !== 'k') king.falsek += 1;
        if (corrected === 'K') king[prediction === 'empty' ? 'empty→K' : 'other→K'] += 1;
        if (corrected === 'k') king[prediction === 'empty' ? 'empty→k' : 'other→k'] += 1;
        if (predictedOccupied && truthOccupied && prediction === prediction.toUpperCase() && corrected === corrected.toLowerCase()) whiteToBlack += 1;
        if (predictedOccupied && truthOccupied && prediction === prediction.toLowerCase() && corrected === corrected.toUpperCase()) blackToWhite += 1;
      }
    }
  }
  const precision = ratio(trueOccupied, trueOccupied + falseOccupied);
  const recall = ratio(trueOccupied, trueOccupied + missedOccupied);
  return {
    occupancy: { precision, recall, f1: ratio(2 * precision * recall, precision + recall), emptyToOccupied: missedOccupied,
      occupiedToEmpty: falseOccupied, falseOccupancyPerBoard: ratio(falseOccupied, rows.length), trueEmpty },
    pieceErrors,
    pieceConfusions: Object.fromEntries(Object.entries(confusions).sort()),
    pieceConfusionMatrix: matrix,
    king,
    colorSwaps: { whiteToBlack, blackToWhite },
    confidence: { meanWrong: mean(wrongConfidence), wrongAtLeast090: wrongConfidence.filter((value) => value >= .9).length,
      wrongAtLeast095: wrongConfidence.filter((value) => value >= .95).length, meanCorrect: mean(correctConfidence) }
  };
}

function autoAcceptMetrics(rows) {
  const evaluated = rows.filter((row) => row.scan?.snapshot?.squarePredictions?.length === 64);
  const accepted = evaluated.filter(({ scan }) => {
    const labels = expandPlacement(scan.snapshot.predictedFEN);
    return scan.snapshot.squarePredictions.every((prediction) => prediction.confidence >= .99)
      && structuralWarnings(labels).length === 0;
  });
  const exact = accepted.filter(({ feedback }) => feedback.feedbackType === 'CONFIRMED_CORRECT').length;
  const withinOne = accepted.filter(({ feedback }) => CLASSIFIER_TYPES.has(feedback.feedbackType) && feedback.changedSquareCount <= 1).length;
  const withinTwo = accepted.filter(({ feedback }) => CLASSIFIER_TYPES.has(feedback.feedbackType) && feedback.changedSquareCount <= 2).length;
  const reviewed = evaluated.filter((row) => !accepted.includes(row));
  const totalErrors = evaluated.reduce((sum, row) => sum + (row.feedback.changedSquareCount || 0), 0);
  const reviewErrors = reviewed.reduce((sum, row) => sum + (row.feedback.changedSquareCount || 0), 0);
  const localizationFailures = evaluated.filter((row) => row.feedback.feedbackType === 'LOCALIZATION_FAILURE').length;
  const reviewedLocalizationFailures = reviewed.filter((row) => row.feedback.feedbackType === 'LOCALIZATION_FAILURE').length;
  return {
    policy: 'min-square-confidence>=0.99-and-no-structural-warning',
    coverage: ratio(accepted.length, evaluated.length),
    accepted: accepted.length,
    exactBoardPrecision: ratio(exact, accepted.length),
    withinOneCorrectionPrecision: ratio(withinOne, accepted.length),
    withinTwoCorrectionPrecision: ratio(withinTwo, accepted.length),
    falseAutoAcceptScanIds: accepted.filter(({ feedback }) => feedback.feedbackType !== 'CONFIRMED_CORRECT').map(({ scan }) => scan.scanId).sort(),
    reviewRequiredRate: ratio(reviewed.length, evaluated.length),
    errorFractionCapturedByReview: ratio(reviewErrors, totalErrors),
    localizationFailureFractionCapturedByReview: ratio(reviewedLocalizationFailures, localizationFailures)
  };
}

export function analyzeFieldCorpus(state, { minimum = FIELD_CORPUS_MINIMUM } = {}) {
  const { scans, feedback, payloadHashByFeedbackId, audit } = deduplicate(state || {});
  const scanById = new Map(scans.map((scan) => [scan.scanId, scan]));
  const invalid = [], eligible = [];
  for (const record of feedback) {
    const scan = scanById.get(record.scanId);
    const standaloneFailure = record.feedbackType === 'SCAN_FAILURE' && record.schemaVersion === 'caissa-scanner-beta-scan-failure/1';
    const storedPayloadHash = payloadHashByFeedbackId.get(record.feedbackId);
    const errors = standaloneFailure ? validateFailure(record, storedPayloadHash)
      : scan ? validatePair(scan, record, storedPayloadHash) : ['SCAN_NOT_FOUND'];
    if (errors.length) invalid.push({ scanId: record.scanId, feedbackId: record.feedbackId, errors });
    else eligible.push({ scan: scan || null, feedback: record });
  }
  const classifierTruth = eligible.filter(({ feedback: record }) => CLASSIFIER_TYPES.has(record.feedbackType)
    && record.finalPositionConfirmed === true && record.localizationValid === true);
  const correctionCounts = classifierTruth.map(({ feedback: record }) => record.changedSquareCount);
  const aggregate = aggregateFeedback(eligible.map((row) => row.feedback));
  const classification = classificationMetrics(classifierTruth);
  const exact = eligible.filter(({ feedback: record }) => record.feedbackType === 'CONFIRMED_CORRECT').length;
  const minimal = eligible.filter(({ feedback: record }) => CLASSIFIER_TYPES.has(record.feedbackType) && record.changedSquareCount <= 2).length;
  const localizationFailures = eligible.filter(({ feedback: record }) => record.feedbackType === 'LOCALIZATION_FAILURE').length;
  const scanFailures = eligible.filter(({ feedback: record }) => record.feedbackType === 'SCAN_FAILURE').length;
  const standaloneFailures = eligible.filter(({ feedback: record }) => record.feedbackType === 'SCAN_FAILURE');
  const successfulLocalizations = classifierTruth.length
    + standaloneFailures.filter(({ feedback: record }) => ['classifier', 'feedback'].includes(record.failureStage)).length;
  const allLocalizationFailures = localizationFailures
    + standaloneFailures.filter(({ feedback: record }) => record.failureStage === 'localization').length;
  const warningRows = classifierTruth.map((row) => ({ ...row, warnings: structuralWarnings(expandPlacement(row.feedback.correctedFEN)) }));
  const warned = warningRows.filter((row) => row.warnings.length);
  const canonicalRecords = eligible.map(({ scan, feedback: record }) => ({
    scanId: record.scanId, snapshotHash: scan?.snapshotHash || null, snapshot: scan?.snapshot || null,
    feedbackId: record.feedbackId, feedback: record
  })).sort((a, b) => a.scanId.localeCompare(b.scanId) || a.feedbackId.localeCompare(b.feedbackId));
  const corpusSha256 = sha256(stableJson(canonicalRecords));
  const report = {
    corpusVersion: FIELD_CORPUS_VERSION,
    sourceCorpusVersion: 'caissa-scanner-beta-feedback-v0.1',
    corpusSha256,
    minimumRequired: minimum,
    certificationReady: eligible.length >= minimum,
    decision: eligible.length >= minimum ? null : 'CONTINUE MOBILE BETA COLLECTION',
    totalScanRecords: scans.length,
    completedFeedbackRecords: feedback.length,
    eligibleCompletedScans: eligible.length,
    invalidRecords: invalid,
    deduplication: audit,
    outcomes: { confirmedCorrect: exact, corrected: aggregate.corrected, localizationFailures, scanFailures },
    exactBoardRate: ratio(exact, eligible.length),
    usableWithMinimalEditRate: ratio(minimal, eligible.length),
    correctionHistogram: aggregate.correctionHistogram,
    correctionBurden: { mean: mean(correctionCounts), median: median(correctionCounts), p90: percentile(correctionCounts, .9),
      worstCorrectedBoard: classifierTruth.reduce((worst, row) => !worst || row.feedback.changedSquareCount > worst.changedSquareCount
        || (row.feedback.changedSquareCount === worst.changedSquareCount && row.scan.scanId < worst.scanId)
        ? { scanId: row.scan.scanId, changedSquareCount: row.feedback.changedSquareCount } : worst, null) },
    ...classification,
    platform: groupMetrics(eligible, (row) => row.feedback.platform),
    captureType: groupMetrics(eligible, (row) => row.feedback.captureType),
    localization: { successful: successfulLocalizations, failures: allLocalizationFailures,
      successRate: ratio(successfulLocalizations, successfulLocalizations + allLocalizationFailures),
      byPlatform: groupMetrics(eligible, (row) => row.feedback.platform),
      byCaptureType: groupMetrics(eligible, (row) => row.feedback.captureType) },
    scanFailureBreakdown: eligible.filter((row) => row.feedback.feedbackType === 'SCAN_FAILURE').reduce((output, row) => {
      const stage = row.feedback.failureStage || 'unknown'; output[stage] = (output[stage] || 0) + 1; return output;
    }, {}),
    productTelemetry: {
      firstAttemptSuccessRate: null,
      repeatScanRate: ratio(audit.sameImageResubmissions, scans.length + standaloneFailures.length),
      feedbackSubmissionSuccessRate: null,
      pendingSyncEvents: null,
      retrySuccessRate: null,
      captureToReviewMs: null,
      reviewToConfirmMs: null,
      correctionInteractionCount: null,
      unavailableReason: 'No durable event/timing instrumentation exists in beta v0.1.'
    },
    autoAccept: autoAcceptMetrics(eligible),
    structuralWarnings: {
      warnedBoards: warned.length,
      rate: ratio(warned.length, classifierTruth.length),
      warningCounts: warned.flatMap((row) => row.warnings).reduce((output, warning) => {
        output[warning] = (output[warning] || 0) + 1; return output;
      }, {}),
      meanCorrectionsWarned: mean(warned.map((row) => row.feedback.changedSquareCount)),
      meanCorrectionsUnwarned: mean(warningRows.filter((row) => !row.warnings.length).map((row) => row.feedback.changedSquareCount))
    },
    dryRunTrainingCandidateCount: eligible.filter((row) => row.feedback.trainingStatus === 'eligible-for-training').length,
    model: { version: MODEL.version, checksum: MODEL.checksum, occupancyThreshold: MODEL.occupancyThreshold },
    sourceImagesEmbedded: false,
    platformNames: PLATFORM_NAMES
  };
  return { report, canonicalRecords, eligible, invalid };
}

export function createCertificationArtifacts(state, options = {}) {
  const analysis = analyzeFieldCorpus(state, options);
  if (!analysis.report.certificationReady) throw new Error('FIELD_CORPUS_MINIMUM_NOT_MET');
  const manifest = {
    schemaVersion: 'caissa-scanner-beta-field-manifest/1',
    corpusVersion: FIELD_CORPUS_VERSION,
    corpusSha256: analysis.report.corpusSha256,
    recordCount: analysis.canonicalRecords.length,
    sourceImagesEmbedded: false,
    records: analysis.canonicalRecords.map((record) => ({ scanId: record.scanId, snapshotHash: record.snapshotHash,
      feedbackId: record.feedbackId, payloadHash: sha256(stableJson(record.feedback)),
      imageHash: record.snapshot?.imageHash || record.feedback.imageHash }))
  };
  const corrections = analysis.eligible.filter((row) => row.feedback.feedbackType === 'PIECE_CORRECTION').map((row) => ({
    scanId: row.scan.scanId, feedbackId: row.feedback.feedbackId, originalFEN: row.feedback.originalFEN,
    correctedFEN: row.feedback.correctedFEN, changedSquareCount: row.feedback.changedSquareCount,
    changedSquares: row.feedback.changedSquares
  })).sort((a, b) => a.scanId.localeCompare(b.scanId) || a.feedbackId.localeCompare(b.feedbackId));
  return {
    'beta-field-v0.1-manifest.json': manifest,
    'beta-field-v0.1-report.json': analysis.report,
    'beta-field-v0.1-corrections.json': { corpusVersion: FIELD_CORPUS_VERSION, corpusSha256: analysis.report.corpusSha256, corrections },
    'beta-field-v0.1-platform-report.json': { corpusVersion: FIELD_CORPUS_VERSION, corpusSha256: analysis.report.corpusSha256,
      platform: analysis.report.platform, captureType: analysis.report.captureType }
  };
}
