import { analyzeStructuralPosition } from '../../scanner/beta/scanner-structural-guardrails.js';
import { expandPlacement, fenDiff, MODEL } from '../../scanner/beta/scanner-beta-contract.js';
import { sha256, stableJson } from '../../api/_lib/scanner-beta-policy.js';

export const CORPUS_VERSION = 'caissa-scanner-beta-field-v0.1';
export const CAPTURE_LIFECYCLE_CUTOFF = '2026-09-19T21:09:39.631Z';
export const GALLERY_HOTFIX_CUTOFF = '2026-09-20T02:28:26.827Z';
export const CURRENT_RUNTIME_CUTOFF = '2026-09-20T03:08:45.822Z';
export const RUNTIME_RELEASE = Object.freeze({
  captureLifecycle: {
    sha: '4cc4b5b830ecaeacc36c8b51e296c3ed4426c146',
    deployment: 'dpl_EmdgfXowPQjp1W6RVaXTzTcsXWkT',
    timestamp: CAPTURE_LIFECYCLE_CUTOFF
  },
  galleryHotfix: {
    sha: 'b0937d2e7e35064fffc51e059acf8fd4cd15138b',
    deployment: 'dpl_3fetoLnDWWoRqmFu1UBELphk8gRF',
    timestamp: GALLERY_HOTFIX_CUTOFF
  },
  structuralGuardrail: {
    sha: 'b5226e0848f874db849d1271baab9d6b484b9508',
    deployment: 'dpl_BTb1RQ4tYtMt3tmB9YwfSTxyM5HN',
    timestamp: CURRENT_RUNTIME_CUTOFF
  }
});

const CLASSES = ['empty', 'P', 'N', 'B', 'R', 'Q', 'K', 'p', 'n', 'b', 'r', 'q', 'k'];
const PIECES = CLASSES.slice(1);
const PLATFORMS = ['Chess.com', 'Lichess', 'ChessBase / Playchess', 'ICC', 'PlayOK', 'FIDE/event', 'Chessworld', 'CAISSA gateway', 'other', 'unknown/not specified'];
const CAPTURE_TYPES = ['camera', 'gallery', 'screenshot', 'photo-of-screen', 'unknown/not specified'];
const CLASSIFIER_TYPES = new Set(['CONFIRMED_CORRECT', 'PIECE_CORRECTION']);

const ratio = (n, d) => d ? n / d : 0;
const mean = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
function median(values) {
  if (!values.length) return 0;
  const ordered = [...values].sort((a, b) => a - b);
  return (ordered[Math.floor((ordered.length - 1) / 2)] + ordered[Math.floor(ordered.length / 2)]) / 2;
}
function percentile(values, value) {
  if (!values.length) return 0;
  const ordered = [...values].sort((a, b) => a - b);
  return ordered[Math.max(0, Math.ceil(value * ordered.length) - 1)];
}
const countBy = (rows, keyOf) => Object.fromEntries([...rows.reduce((map, row) => {
  const key = keyOf(row) || 'unknown';
  map.set(key, (map.get(key) || 0) + 1);
  return map;
}, new Map())].sort(([a], [b]) => String(a).localeCompare(String(b))));
const iso = (value) => new Date(value).toISOString();
const atOrAfter = (row, cutoff) => Date.parse(row.submitted_at) >= Date.parse(cutoff);
const pseudonym = (kind, id) => sha256(`${CORPUS_VERSION}:${kind}:${id}`).slice(0, 16);
const normalizeGroup = (value) => value || 'unknown/not specified';

function uniqueRows(rows, identity, payload, audit, label) {
  const ids = new Set(), hashes = new Set(), output = [];
  for (const row of rows) {
    const id = identity(row);
    if (ids.has(id)) { audit[`duplicate${label}Ids`] += 1; continue; }
    const hash = payload(row);
    if (hash && hashes.has(hash)) audit.retryPayloads += 1;
    ids.add(id);
    if (hash) hashes.add(hash);
    output.push(row);
  }
  return output;
}

function reconcile(snapshot) {
  const audit = {
    duplicateScanIds: 0,
    duplicateFeedbackIds: 0,
    duplicateFailureIds: 0,
    retryPayloads: 0,
    repeatedFinalDispositions: 0,
    overlapScanFailures: 0,
    orphanFeedback: 0,
    orphanPredictions: 0,
    orphanCorrections: 0
  };
  const scans = uniqueRows(snapshot.scans || [], (row) => row.scan_id, (row) => row.snapshot_hash, audit, 'Scan');
  const feedback = uniqueRows(snapshot.feedback || [], (row) => row.feedback_id, (row) => row.payload_hash, audit, 'Feedback');
  const failures = uniqueRows(snapshot.failures || [], (row) => row.feedback_id, (row) => row.payload_hash, audit, 'Failure');
  const scanById = new Map(scans.map((row) => [row.scan_id, row]));
  const dispositionByScan = new Map();
  for (const row of feedback) {
    if (!scanById.has(row.scan_id)) audit.orphanFeedback += 1;
    if (dispositionByScan.has(row.scan_id)) audit.repeatedFinalDispositions += 1;
    else dispositionByScan.set(row.scan_id, row);
  }
  for (const row of failures) {
    if (scanById.has(row.scan_id)) audit.overlapScanFailures += 1;
    if (dispositionByScan.has(row.scan_id)) audit.repeatedFinalDispositions += 1;
    else dispositionByScan.set(row.scan_id, row);
  }
  const predictionScanIds = new Set((snapshot.squarePredictions || []).map((row) => row.scan_id));
  audit.orphanPredictions = [...predictionScanIds].filter((id) => !scanById.has(id)).length;
  const feedbackIds = new Set(feedback.map((row) => row.feedback_id));
  audit.orphanCorrections = (snapshot.squareCorrections || []).filter((row) => !feedbackIds.has(row.feedback_id)).length;

  const attempts = scans.map((scan) => ({
    kind: dispositionByScan.has(scan.scan_id) ? 'SCAN_WITH_DISPOSITION' : 'PENDING_SCAN',
    scan,
    disposition: dispositionByScan.get(scan.scan_id) || null,
    timestamp: dispositionByScan.get(scan.scan_id)?.submitted_at || scan.submitted_at
  }));
  for (const failure of failures.filter((row) => !scanById.has(row.scan_id))) {
    attempts.push({ kind: 'STANDALONE_SCAN_FAILURE', scan: null, disposition: failure, timestamp: failure.submitted_at });
  }
  attempts.sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp)
    || (a.disposition?.scan_id || a.scan.scan_id).localeCompare(b.disposition?.scan_id || b.scan.scan_id));
  return { scans, feedback, failures, attempts, scanById, dispositionByScan, audit };
}

function correctionHistogram(values) {
  return {
    '0': values.filter((value) => value === 0).length,
    '1': values.filter((value) => value === 1).length,
    '2': values.filter((value) => value === 2).length,
    '3-5': values.filter((value) => value >= 3 && value <= 5).length,
    '6-10': values.filter((value) => value >= 6 && value <= 10).length,
    '>10': values.filter((value) => value > 10).length
  };
}

function classifierRows(reconciled) {
  return reconciled.feedback.filter((row) => CLASSIFIER_TYPES.has(row.feedback_type)
    && row.final_position_confirmed === true && row.localization_valid === true)
    .map((feedback) => ({ feedback, scan: reconciled.scanById.get(feedback.scan_id) }))
    .filter((row) => row.scan);
}

function classifierMetrics(rows) {
  const matrix = Object.fromEntries(CLASSES.map((truth) => [truth, Object.fromEntries(CLASSES.map((predicted) => [predicted, 0]))]));
  let correct = 0, occupiedTp = 0, occupiedFp = 0, occupiedFn = 0;
  let pieceTypeCorrect = 0, colorCorrect = 0, trueOccupied = 0;
  let trueWhite = 0, correctWhite = 0, trueBlack = 0, correctBlack = 0;
  const wrongConfidence = [], correctConfidence = [], falseOccupancyConfidence = [];
  const king = { trueK: 0, predictedK: 0, trueBlackK: 0, predictedBlackK: 0, falseK: 0, falseBlackK: 0,
    emptyToK: 0, emptyToBlackK: 0, otherToK: 0, otherToBlackK: 0 };
  const swaps = Object.fromEntries(['P', 'N', 'B', 'R', 'Q', 'K'].map((piece) => [`${piece}<->${piece.toLowerCase()}`, 0]));
  for (const { scan, feedback } of rows) {
    const predicted = expandPlacement(scan.snapshot.predictedFEN);
    const truth = expandPlacement(feedback.corrected_fen || feedback.original_fen);
    for (let index = 0; index < 64; index += 1) {
      const predictedClass = predicted[index], truthClass = truth[index];
      matrix[truthClass][predictedClass] += 1;
      const confidence = Number(scan.snapshot.squarePredictions[index]?.confidence ?? 0);
      if (predictedClass === truthClass) { correct += 1; correctConfidence.push(confidence); }
      else wrongConfidence.push(confidence);
      const predictedOccupied = predictedClass !== 'empty', truthOccupiedSquare = truthClass !== 'empty';
      if (truthOccupiedSquare) {
        trueOccupied += 1;
        if (predictedOccupied) occupiedTp += 1;
        else occupiedFn += 1;
        if (predictedOccupied && predictedClass.toLowerCase() === truthClass.toLowerCase()) pieceTypeCorrect += 1;
        if (predictedOccupied && (predictedClass === predictedClass.toUpperCase()) === (truthClass === truthClass.toUpperCase())) colorCorrect += 1;
        if (truthClass === truthClass.toUpperCase()) { trueWhite += 1; if (predictedClass === truthClass) correctWhite += 1; }
        else { trueBlack += 1; if (predictedClass === truthClass) correctBlack += 1; }
      } else if (predictedOccupied) {
        occupiedFp += 1;
        falseOccupancyConfidence.push(confidence);
      }
      if (truthClass === 'K') king.trueK += 1;
      if (predictedClass === 'K') {
        king.predictedK += 1;
        if (truthClass !== 'K') king.falseK += 1;
        if (truthClass === 'empty') king.emptyToK += 1;
        else if (truthClass !== 'K') king.otherToK += 1;
      }
      if (truthClass === 'k') king.trueBlackK += 1;
      if (predictedClass === 'k') {
        king.predictedBlackK += 1;
        if (truthClass !== 'k') king.falseBlackK += 1;
        if (truthClass === 'empty') king.emptyToBlackK += 1;
        else if (truthClass !== 'k') king.otherToBlackK += 1;
      }
      if (truthOccupiedSquare && predictedOccupied && predictedClass.toLowerCase() === truthClass.toLowerCase()
          && predictedClass !== truthClass) swaps[`${truthClass.toUpperCase()}<->${truthClass.toLowerCase()}`] += 1;
    }
  }
  const totalSquares = rows.length * 64;
  const precision = ratio(occupiedTp, occupiedTp + occupiedFp);
  const recall = ratio(occupiedTp, occupiedTp + occupiedFn);
  const perClass = Object.fromEntries(PIECES.map((piece) => {
    const tp = matrix[piece][piece];
    const fp = CLASSES.reduce((sum, truth) => sum + (truth === piece ? 0 : matrix[truth][piece]), 0);
    const fn = CLASSES.reduce((sum, predicted) => sum + (predicted === piece ? 0 : matrix[piece][predicted]), 0);
    const p = ratio(tp, tp + fp), r = ratio(tp, tp + fn);
    return [piece, { precision: p, recall: r, f1: ratio(2 * p * r, p + r), support: CLASSES.reduce((sum, predicted) => sum + matrix[piece][predicted], 0) }];
  }));
  const confusions = [];
  for (const truth of CLASSES) for (const predicted of CLASSES) {
    if (truth !== predicted && matrix[truth][predicted]) confusions.push({ truth, predicted, count: matrix[truth][predicted] });
  }
  confusions.sort((a, b) => b.count - a.count || a.truth.localeCompare(b.truth) || a.predicted.localeCompare(b.predicted));
  return {
    eligibleBoards: rows.length,
    evaluatedSquares: totalSquares,
    accuracy13Class: ratio(correct, totalSquares),
    occupancy: {
      precision,
      recall,
      f1: ratio(2 * precision * recall, precision + recall),
      emptyToOccupied: occupiedFp,
      occupiedToEmpty: occupiedFn,
      falseOccupancyPerBoard: ratio(occupiedFp, rows.length),
      highConfidenceFalseOccupancy: falseOccupancyConfidence.filter((value) => value >= .9).length
    },
    pieceTypeAccuracy: ratio(pieceTypeCorrect, trueOccupied),
    colorAccuracy: ratio(colorCorrect, trueOccupied),
    whiteExactAccuracy: ratio(correctWhite, trueWhite),
    blackExactAccuracy: ratio(correctBlack, trueBlack),
    occupiedMacroF1: mean(Object.values(perClass).map((item) => item.f1)),
    perOccupiedClass: perClass,
    confusionMatrix: matrix,
    confusionHighlights: confusions,
    kings: king,
    colorSwaps: { byType: swaps, total: Object.values(swaps).reduce((sum, value) => sum + value, 0) },
    confidence: {
      meanWrong: mean(wrongConfidence),
      medianWrong: median(wrongConfidence),
      wrongAtLeast090: wrongConfidence.filter((value) => value >= .9).length,
      wrongAtLeast095: wrongConfidence.filter((value) => value >= .95).length,
      meanCorrect: mean(correctConfidence),
      medianCorrect: median(correctConfidence)
    },
    definitions: {
      pieceTypeAccuracy: 'correct piece family among all truth-occupied squares; occupancy misses count incorrect',
      colorAccuracy: 'correct side among all truth-occupied squares; occupancy misses count incorrect',
      whiteExactAccuracy: 'exact 13-class correctness restricted to truth-white occupied squares',
      blackExactAccuracy: 'exact 13-class correctness restricted to truth-black occupied squares',
      occupiedMacroF1: 'unweighted one-vs-rest F1 mean across P,N,B,R,Q,K,p,n,b,r,q,k over all evaluated squares'
    }
  };
}

function productView(attempts) {
  const completed = attempts.filter((row) => row.disposition);
  const classifier = completed.filter((row) => CLASSIFIER_TYPES.has(row.disposition.feedback_type));
  const exact = classifier.filter((row) => row.disposition.feedback_type === 'CONFIRMED_CORRECT').length;
  const minimal = classifier.filter((row) => Number(row.disposition.changed_square_count) <= 2).length;
  const localizationFeedback = completed.filter((row) => row.disposition.feedback_type === 'LOCALIZATION_FAILURE').length;
  const failures = completed.filter((row) => row.disposition.feedback_type === 'SCAN_FAILURE');
  const localizationStageFailures = failures.filter((row) => row.disposition.failure_stage === 'localization').length;
  const localizedBeforeLaterFailure = failures.filter((row) => ['classifier', 'feedback'].includes(row.disposition.failure_stage)).length;
  const knownLocalizationOutcomes = classifier.length + localizationFeedback + localizationStageFailures + localizedBeforeLaterFailure;
  const knownLocalizationSuccess = classifier.length + localizedBeforeLaterFailure;
  return {
    logicalAttempts: attempts.length,
    completedSubmissions: completed.length,
    pending: attempts.length - completed.length,
    confirmedCorrect: exact,
    corrected: classifier.length - exact,
    localizationFailures: localizationFeedback,
    scanFailures: failures.length,
    completionRate: ratio(completed.length, attempts.length),
    canonicalScanPersistenceRate: ratio(attempts.filter((row) => row.scan).length, attempts.length),
    successfulLocalizedBoardRate: ratio(classifier.length, completed.length),
    localizationSuccessRate: ratio(knownLocalizationSuccess, knownLocalizationOutcomes),
    scanFailureRate: ratio(failures.length, completed.length),
    localizationFailureRate: ratio(localizationFeedback + localizationStageFailures, completed.length),
    confirmedCorrectRate: ratio(exact, completed.length),
    exactBoardRate: ratio(exact, classifier.length),
    usableWithinTwoRate: ratio(minimal, classifier.length),
    exactBoardCount: exact,
    usableWithinTwoCount: minimal,
    eligibleClassifierBoards: classifier.length
  };
}

function groupReport(attempts, values, keyOf) {
  const output = {};
  for (const value of values) {
    const rows = attempts.filter((row) => normalizeGroup(keyOf(row)) === value);
    const view = productView(rows);
    const corrections = rows.filter((row) => CLASSIFIER_TYPES.has(row.disposition?.feedback_type))
      .map((row) => Number(row.disposition.changed_square_count));
    output[value] = {
      ...view,
      meanCorrections: mean(corrections),
      coverage: rows.length >= 10 ? 'ENOUGH INITIAL DATA' : rows.length ? 'NEEDS MORE FIELD DATA' : 'NOT TESTED',
      exploratory: rows.length < 10
    };
  }
  return output;
}

function guardrailReport(reconciled) {
  const withPrediction = reconciled.feedback.map((feedback) => ({ feedback, scan: reconciled.scanById.get(feedback.scan_id) })).filter((row) => row.scan);
  const rows = withPrediction.map((row) => {
    const replay = analyzeStructuralPosition(row.scan.snapshot.predictedFEN);
    const persisted = row.feedback.client_metadata?.structuralStatus || null;
    return { ...row, replay, persisted };
  });
  const statuses = countBy(rows, (row) => row.replay.status);
  const warningFrequencies = countBy(rows.flatMap((row) => row.replay.warnings), (warning) => warning.code);
  const hardWarningFrequencies = countBy(rows.flatMap((row) => row.replay.warnings.filter((warning) => warning.severity === 'HARD')), (warning) => warning.code);
  const softWarningFrequencies = countBy(rows.flatMap((row) => row.replay.warnings.filter((warning) => warning.severity === 'SOFT')), (warning) => warning.code);
  const problematic = (row) => ['PIECE_CORRECTION', 'LOCALIZATION_FAILURE'].includes(row.feedback.feedback_type);
  const required = rows.filter((row) => row.replay.status === 'REVIEW_REQUIRED');
  const severe = rows.filter((row) => row.feedback.feedback_type === 'LOCALIZATION_FAILURE'
    || Number(row.feedback.changed_square_count) > 2);
  const postDeployment = rows.filter((row) => atOrAfter(row.feedback, CURRENT_RUNTIME_CUTOFF));
  const persistedMismatches = postDeployment.filter((row) => row.persisted !== row.replay.status);
  return {
    evaluationMode: 'offline deterministic replay of the frozen structural guardrail over persisted predicted FEN; persisted status is separately checked post-deployment',
    statusCounts: {
      NORMAL: statuses.NORMAL || 0,
      REVIEW_RECOMMENDED: statuses.REVIEW_RECOMMENDED || 0,
      REVIEW_REQUIRED: statuses.REVIEW_REQUIRED || 0
    },
    warningFrequencies,
    hardWarningFrequencies,
    softWarningFrequencies,
    overlapByDisposition: Object.fromEntries(['CONFIRMED_CORRECT', 'PIECE_CORRECTION', 'LOCALIZATION_FAILURE'].map((type) => [type,
      countBy(rows.filter((row) => row.feedback.feedback_type === type), (row) => row.replay.status)])),
    reviewRequiredProblemPrecision: ratio(required.filter(problematic).length, required.length),
    severeOrLocalizationFlaggedFraction: ratio(severe.filter((row) => row.replay.status === 'REVIEW_REQUIRED').length, severe.length),
    falseHardWarningsOnConfirmedCorrect: required.filter((row) => row.feedback.feedback_type === 'CONFIRMED_CORRECT').length,
    postDeploymentPersistedRecords: postDeployment.length,
    postDeploymentPersistedMissing: postDeployment.filter((row) => !row.persisted).length,
    postDeploymentReplayMismatches: persistedMismatches.length,
    scanFailuresApplicable: 0,
    scanFailuresNotApplicable: reconciled.failures.length
  };
}

function duplicateReport(attempts, classifier) {
  const imageGroups = new Map();
  for (const row of attempts) {
    const hash = row.scan?.image_hash || row.disposition?.image_hash;
    if (!hash) continue;
    const group = imageGroups.get(hash) || [];
    group.push(row);
    imageGroups.set(hash, group);
  }
  const duplicateGroups = [...imageGroups.values()].filter((rows) => rows.length > 1);
  const failureThenScan = duplicateGroups.filter((rows) => rows.some((row) => row.kind === 'STANDALONE_SCAN_FAILURE') && rows.some((row) => row.scan)).length;
  const classifierImageCounts = countBy(classifier, (row) => row.scan.image_hash);
  return {
    attemptsWithImageHash: [...imageGroups.values()].reduce((sum, rows) => sum + rows.length, 0),
    uniqueImages: imageGroups.size,
    duplicateImageGroups: duplicateGroups.length,
    duplicateImageScansBeyondFirst: duplicateGroups.reduce((sum, rows) => sum + rows.length - 1, 0),
    sameImageRepeatedScans: duplicateGroups.reduce((sum, rows) => sum + rows.filter((row) => row.scan).length - 1, 0),
    abortedOrFailedThenRetriedImageGroups: failureThenScan,
    classifierDuplicateImagesBeyondFirst: Object.values(classifierImageCounts).reduce((sum, count) => sum + Math.max(0, count - 1), 0),
    treatment: 'reported separately; unique record and payload identities are retained in product metrics unless proven technical retries'
  };
}

function trainingPreview(classifier, duplicate) {
  const seenImages = new Set();
  let duplicates = 0;
  const candidates = [];
  for (const row of [...classifier].sort((a, b) => Date.parse(a.feedback.submitted_at) - Date.parse(b.feedback.submitted_at))) {
    if (seenImages.has(row.scan.image_hash)) { duplicates += 1; continue; }
    seenImages.add(row.scan.image_hash);
    if (row.feedback.share_image_for_improvement && row.feedback.share_correction_for_improvement) candidates.push(row);
  }
  return {
    mode: 'dry-run recommendation only',
    technicalCandidates: candidates.length,
    criteria: ['human-confirmed', 'localization-valid', 'image-consent', 'correction-consent', 'nonduplicate-image'],
    classifierBoardsReviewed: classifier.length,
    duplicateClassifierImagesExcluded: duplicates || duplicate.classifierDuplicateImagesBeyondFirst,
    requireGovernanceReview: candidates.length,
    automaticallyAdmitted: 0,
    exportedToTraining: 0,
    currentEligibleForTrainingStatus: classifier.filter((row) => row.feedback.training_status === 'eligible-for-training').length,
    sourceImagesIncluded: false
  };
}

function failureAnalysis(reconciled, attempts, classifier, guardrail) {
  const scanFailureStages = countBy(reconciled.failures, (row) => row.failure_stage);
  const scanFailureCodes = countBy(reconciled.failures, (row) => row.error_code);
  const localFeedback = reconciled.feedback.filter((row) => row.feedback_type === 'LOCALIZATION_FAILURE');
  const catastrophic = classifier.filter((row) => Number(row.feedback.changed_square_count) > 10).map((row) => ({
    caseId: pseudonym('scan', row.feedback.scan_id),
    reason: '>10 corrected squares',
    changedSquares: Number(row.feedback.changed_square_count),
    platform: normalizeGroup(row.feedback.platform),
    captureType: normalizeGroup(row.feedback.capture_type)
  }));
  const severeGuardrail = reconciled.feedback.map((feedback) => ({ feedback, scan: reconciled.scanById.get(feedback.scan_id) }))
    .filter((row) => row.scan && analyzeStructuralPosition(row.scan.snapshot.predictedFEN).status === 'REVIEW_REQUIRED')
    .map((row) => ({ caseId: pseudonym('scan', row.feedback.scan_id), reason: 'severe structural warning',
      disposition: row.feedback.feedback_type, warningCodes: analyzeStructuralPosition(row.scan.snapshot.predictedFEN).warningCodes }));
  return {
    productFailureCount: localFeedback.length + reconciled.failures.length,
    finalLocalizationFailureDispositions: localFeedback.length,
    standaloneScanFailureStages: scanFailureStages,
    standaloneScanFailureCodes: scanFailureCodes,
    combinedStageBreakdown: {
      localization: localFeedback.length + (scanFailureStages.localization || 0),
      unsupportedInput: scanFailureStages['unsupported-input'] || 0,
      decode: scanFailureStages.decode || 0,
      classifier: scanFailureStages.classifier || 0,
      feedback: scanFailureStages.feedback || 0
    },
    clusters: [
      { name: 'board detection / localization', count: localFeedback.length + (scanFailureStages.localization || 0), evidence: 'explicit final disposition or failure_stage=localization' },
      { name: 'classifier unavailable', count: scanFailureCodes.CLASSIFIER_UNAVAILABLE || 0, evidence: 'explicit error_code' },
      { name: 'multiple board candidates', count: scanFailureCodes['MULTIPLE-BOARD-CANDIDATES'] || 0, evidence: 'explicit error_code' }
    ].filter((item) => item.count),
    unsupportedCauseClaims: ['screen glare', 'photo perspective', 'unusual piece set', 'network/session', 'rate limit'],
    catastrophicCases: [...catastrophic, ...severeGuardrail],
    catastrophicCorrectionCount: catastrophic.length,
    severeGuardrailCaseCount: severeGuardrail.length,
    guardrailReviewRequired: guardrail.statusCounts.REVIEW_REQUIRED,
    eras: {
      preCaptureLifecycle: productView(attempts.filter((row) => Date.parse(row.timestamp) < Date.parse(CAPTURE_LIFECYCLE_CUTOFF))),
      postCaptureLifecycle: productView(attempts.filter((row) => Date.parse(row.timestamp) >= Date.parse(CAPTURE_LIFECYCLE_CUTOFF))),
      preGalleryHotfix: productView(attempts.filter((row) => Date.parse(row.timestamp) < Date.parse(GALLERY_HOTFIX_CUTOFF))),
      postGalleryHotfix: productView(attempts.filter((row) => Date.parse(row.timestamp) >= Date.parse(GALLERY_HOTFIX_CUTOFF))),
      preStructuralGuardrail: productView(attempts.filter((row) => Date.parse(row.timestamp) < Date.parse(CURRENT_RUNTIME_CUTOFF))),
      currentRuntime: productView(attempts.filter((row) => Date.parse(row.timestamp) >= Date.parse(CURRENT_RUNTIME_CUTOFF)))
    }
  };
}

function canonicalManifest(snapshot, reconciled) {
  const records = [];
  for (const scan of reconciled.scans) records.push({
    recordType: 'scan', recordKey: pseudonym('scan', scan.scan_id), submittedAt: iso(scan.submitted_at),
    snapshotHash: scan.snapshot_hash, imageHash: scan.image_hash, modelVersion: scan.model_version,
    modelChecksum: scan.model_checksum, occupancyThreshold: Number(scan.occupancy_threshold)
  });
  for (const feedback of reconciled.feedback) records.push({
    recordType: 'feedback', recordKey: pseudonym('feedback', feedback.feedback_id),
    scanKey: pseudonym('scan', feedback.scan_id), submittedAt: iso(feedback.submitted_at),
    payloadHash: feedback.payload_hash, disposition: feedback.feedback_type
  });
  for (const failure of reconciled.failures) records.push({
    recordType: 'scan-failure', recordKey: pseudonym('failure', failure.feedback_id),
    scanKey: pseudonym('scan', failure.scan_id), submittedAt: iso(failure.submitted_at),
    payloadHash: failure.payload_hash, disposition: 'SCAN_FAILURE'
  });
  records.sort((a, b) => a.recordType.localeCompare(b.recordType) || a.recordKey.localeCompare(b.recordKey));
  const checksumInput = {
    schemaVersion: 'caissa-scanner-beta-field-certified-record-list/1',
    corpusVersion: CORPUS_VERSION,
    cutoff: iso(snapshot.cutoff),
    accountScopeRule: snapshot.accountScope.rule,
    records
  };
  return {
    schemaVersion: 'caissa-scanner-beta-field-manifest/2',
    corpusVersion: CORPUS_VERSION,
    cutoff: iso(snapshot.cutoff),
    accountScopeRule: snapshot.accountScope.rule,
    sourceTables: ['scanner_beta_scans', 'scanner_beta_square_predictions', 'scanner_beta_feedback', 'scanner_beta_square_corrections', 'scanner_beta_scan_failures'],
    sourceImagesIncluded: false,
    sourceImageReferencesIncluded: false,
    canonicalRecordCount: records.length,
    logicalAttemptCount: reconciled.attempts.length,
    records,
    corpusSha256: sha256(stableJson(checksumInput))
  };
}

function validateSnapshot(snapshot, reconciled) {
  const errors = [];
  if (snapshot.schemaVersion !== 'caissa-scanner-beta-field-source-snapshot/1') errors.push('SOURCE_SCHEMA_INVALID');
  if (!snapshot.cutoff || Number.isNaN(Date.parse(snapshot.cutoff))) errors.push('CUTOFF_INVALID');
  for (const row of [...reconciled.scans, ...reconciled.feedback, ...reconciled.failures]) {
    if (Date.parse(row.submitted_at) > Date.parse(snapshot.cutoff)) errors.push('ROW_AFTER_CUTOFF');
  }
  for (const scan of reconciled.scans) {
    if (scan.model_version !== MODEL.version) errors.push('MODEL_VERSION_MISMATCH');
    if (scan.model_checksum !== MODEL.checksum) errors.push('MODEL_CHECKSUM_MISMATCH');
    if (Number(scan.occupancy_threshold) !== MODEL.occupancyThreshold) errors.push('THRESHOLD_MISMATCH');
    if (sha256(stableJson(scan.snapshot)) !== scan.snapshot_hash) errors.push('SNAPSHOT_HASH_MISMATCH');
    const predictions = (snapshot.squarePredictions || []).filter((row) => row.scan_id === scan.scan_id);
    if (predictions.length !== 64 || scan.snapshot.squarePredictions?.length !== 64) errors.push('PREDICTION_COUNT_INVALID');
  }
  for (const failure of reconciled.failures) {
    if (failure.model_version !== MODEL.version) errors.push('MODEL_VERSION_MISMATCH');
    if (failure.model_checksum !== MODEL.checksum) errors.push('MODEL_CHECKSUM_MISMATCH');
    if (Number(failure.occupancy_threshold) !== MODEL.occupancyThreshold) errors.push('THRESHOLD_MISMATCH');
  }
  for (const feedback of reconciled.feedback.filter((row) => row.feedback_type === 'PIECE_CORRECTION')) {
    const corrections = (snapshot.squareCorrections || []).filter((row) => row.feedback_id === feedback.feedback_id);
    if (corrections.length !== Number(feedback.changed_square_count)) errors.push('CORRECTION_COUNT_MISMATCH');
    try {
      if (fenDiff(feedback.original_fen, feedback.corrected_fen).length !== Number(feedback.changed_square_count)) errors.push('FEN_DIFF_MISMATCH');
    } catch (_) { errors.push('CORRECTED_FEN_INVALID'); }
  }
  if (Object.values(reconciled.audit).some((value) => value)) errors.push('RECONCILIATION_ANOMALY');
  return [...new Set(errors)].sort();
}

function chooseDecision(allTime, current, classifier, platform, capture, failures) {
  const classifierWeak = classifier.accuracy13Class < .99 || allTime.usableWithinTwoRate < .95
    || failures.catastrophicCorrectionCount >= 2;
  const productWeak = current.scanFailureRate > .1 || current.localizationFailureRate > .1;
  const namedPlatforms = Object.entries(platform).filter(([name, value]) => name !== 'unknown/not specified' && value.logicalAttempts).length;
  const testedCaptures = Object.values(capture).filter((value) => value.logicalAttempts).length;
  if (productWeak) return 'LOCALIZATION / PRODUCT HARDENING REQUIRED';
  if (classifierWeak) return 'CLASSIFIER HARDENING REQUIRED';
  if (namedPlatforms < 3 || testedCaptures < 2) return 'CONTINUE FIELD COLLECTION';
  return 'BETA EVIDENCE STRONG - PREPARE NEXT RUNTIME PILOT PHASE';
}

export function certifyProductionFieldSnapshot(snapshot) {
  const reconciled = reconcile(snapshot);
  const validationErrors = validateSnapshot(snapshot, reconciled);
  const classifier = classifierRows(reconciled);
  const metrics = classifierMetrics(classifier);
  const allTime = productView(reconciled.attempts);
  const currentAttempts = reconciled.attempts.filter((row) => Date.parse(row.timestamp) >= Date.parse(CURRENT_RUNTIME_CUTOFF));
  const currentRuntime = productView(currentAttempts);
  const platform = groupReport(reconciled.attempts, PLATFORMS, (row) => row.disposition?.platform ?? row.scan?.platform);
  const captureType = groupReport(reconciled.attempts, CAPTURE_TYPES, (row) => row.disposition?.capture_type ?? row.scan?.capture_type);
  const orientationValues = ['white-at-bottom', 'black-at-bottom', 'unknown/not specified'];
  const orientation = groupReport(reconciled.attempts, orientationValues, (row) => row.scan?.snapshot?.orientation ?? row.disposition?.orientation);
  const guardrail = guardrailReport(reconciled);
  const duplicates = duplicateReport(reconciled.attempts, classifier);
  const training = trainingPreview(classifier, duplicates);
  const failures = failureAnalysis(reconciled, reconciled.attempts, classifier, guardrail);
  const manifest = canonicalManifest(snapshot, reconciled);
  const corrections = classifier.map((row) => Number(row.feedback.changed_square_count));
  const imageConsent = reconciled.feedback.filter((row) => row.share_image_for_improvement).length
    + reconciled.failures.filter((row) => row.share_image_for_improvement).length;
  const correctionConsent = reconciled.feedback.filter((row) => row.share_correction_for_improvement).length
    + reconciled.failures.filter((row) => row.share_correction_for_improvement).length;
  const decision = chooseDecision(allTime, currentRuntime, metrics, platform, captureType, failures);
  const cutoffDate = new Date(snapshot.cutoff);
  const dayStart = Date.UTC(cutoffDate.getUTCFullYear(), cutoffDate.getUTCMonth(), cutoffDate.getUTCDate());
  const weekStart = dayStart - ((cutoffDate.getUTCDay() + 6) % 7) * 86_400_000;
  const completedRows = [...reconciled.feedback, ...reconciled.failures];
  const completedToday = completedRows.filter((row) => Date.parse(row.submitted_at) >= dayStart).length;
  const completedThisWeek = completedRows.filter((row) => Date.parse(row.submitted_at) >= weekStart).length;
  const certificationReady = validationErrors.length === 0
    && allTime.completedSubmissions === 111
    && allTime.confirmedCorrect + allTime.corrected + allTime.localizationFailures + allTime.scanFailures === 111;

  const productMetrics = {
    corpusVersion: CORPUS_VERSION,
    corpusSha256: manifest.corpusSha256,
    allTime,
    currentRuntime,
    currentRuntimeBoundary: RUNTIME_RELEASE.structuralGuardrail,
    hotfixBoundaries: RUNTIME_RELEASE,
    correctionHistogram: correctionHistogram(corrections),
    correctionBurden: { mean: mean(corrections), median: median(corrections), p90: percentile(corrections, .9), maximum: Math.max(0, ...corrections) },
    orientation,
    consent: {
      completedSubmissions: reconciled.feedback.length + reconciled.failures.length,
      imageConsentTrue: imageConsent,
      imageConsentFalse: reconciled.feedback.length + reconciled.failures.length - imageConsent,
      correctionConsentTrue: correctionConsent,
      correctionConsentFalse: reconciled.feedback.length + reconciled.failures.length - correctionConsent
    },
    imageUniqueness: duplicates
  };
  const classifierArtifact = { corpusVersion: CORPUS_VERSION, corpusSha256: manifest.corpusSha256, model: MODEL, ...metrics };
  const platformArtifact = { corpusVersion: CORPUS_VERSION, corpusSha256: manifest.corpusSha256, cohorts: platform,
    coverageRule: '>=10 logical attempts: ENOUGH INITIAL DATA; 1-9: NEEDS MORE FIELD DATA; 0: NOT TESTED' };
  const captureArtifact = { corpusVersion: CORPUS_VERSION, corpusSha256: manifest.corpusSha256, cohorts: captureType };
  const guardrailArtifact = { corpusVersion: CORPUS_VERSION, corpusSha256: manifest.corpusSha256, ...guardrail };
  const failureArtifact = { corpusVersion: CORPUS_VERSION, corpusSha256: manifest.corpusSha256, ...failures };
  const trainingArtifact = { corpusVersion: CORPUS_VERSION, corpusSha256: manifest.corpusSha256, ...training };
  const summary = {
    schemaVersion: 'caissa-scanner-beta-field-certification-summary/1',
    corpusVersion: CORPUS_VERSION,
    corpusSha256: manifest.corpusSha256,
    cutoff: manifest.cutoff,
    certificationReady,
    validationErrors,
    accountScopeRule: manifest.accountScopeRule,
    reconciliation: {
      canonicalScans: reconciled.scans.length,
      finalFeedbackDispositions: reconciled.feedback.length,
      standaloneScanFailures: reconciled.failures.length,
      logicalAttempts: reconciled.attempts.length,
      overlap: reconciled.audit.overlapScanFailures,
      pending: allTime.pending,
      identity: `${reconciled.scans.length} canonical scans + ${reconciled.failures.length} standalone failures = ${reconciled.attempts.length} logical attempts; ${allTime.completedSubmissions} completed + ${allTime.pending} pending = ${reconciled.attempts.length}`,
      completedIdentity: `${allTime.confirmedCorrect} + ${allTime.corrected} + ${allTime.localizationFailures} + ${allTime.scanFailures} = ${allTime.completedSubmissions}`,
      audit: reconciled.audit
    },
    allTime,
    currentRuntime,
    model: MODEL,
    decision,
    dashboardAccounting: {
      milestone: '111 / 100',
      result: certificationReady ? 'PASS' : 'HOLD',
      completedToday,
      completedThisWeek,
      dayStart: new Date(dayStart).toISOString(),
      weekStart: new Date(weekStart).toISOString(),
      wordingRecommendation: 'Rename "Scans attempted" to "Persisted board scans" and add "Total logical attempts" so standalone pre-scan failures are visible.'
    },
    immutableSnapshot: true,
    sourceImagesIncluded: false,
    modelTraining: 'NONE',
    modelChanges: 'NONE',
    thresholdChanges: 'NONE',
    runtimeChanges: 'NONE',
    publicScannerUiChanges: 'NONE',
    visualFreeze: 'PRESERVED'
  };
  return {
    summary,
    artifacts: {
      'manifest.json': manifest,
      'certification-summary.json': summary,
      'product-metrics.json': productMetrics,
      'classifier-metrics.json': classifierArtifact,
      'platform-report.json': platformArtifact,
      'capture-type-report.json': captureArtifact,
      'guardrail-report.json': guardrailArtifact,
      'failure-analysis.json': failureArtifact,
      'training-candidate-preview.json': trainingArtifact
    }
  };
}
