import {
  MODEL,
  PLATFORMS,
  analyzeStructuralPosition,
  createFeedbackRecord,
  createPredictionSnapshot,
  createScanFailureRecord
} from '../beta/scanner-beta-contract.js';

export const PUBLIC_FEEDBACK = Object.freeze({
  corpusVersion: 'caissa-scanner-public-feedback-v0.1',
  schemaVersion: 'caissa-scanner-public-feedback/1',
  failureSchemaVersion: 'caissa-scanner-public-scan-failure/1',
  sourceTrust: 'public_user',
  defaultCertificationStatus: 'raw-unverified',
  certificationVersion: 'caissa-scanner-owner-certification/1'
});

export const REVIEWER_ENTITLEMENT = 'scanner_feedback_reviewer';
export const REVIEW_ACTIONS = Object.freeze([
  'CERTIFY',
  'CERTIFY_CLASSIFIER_CORRECTION',
  'CERTIFY_LOCALIZATION_FAILURE',
  'NEEDS_FIX',
  'DUPLICATE',
  'HOLD',
  'EXCLUDE'
]);

export const TARGET_CORPORA = Object.freeze([
  'caissa-scanner-certified-classifier-corrections',
  'caissa-scanner-certified-localization-failures'
]);

function invariant(condition, code) {
  if (!condition) throw new Error(code);
}

function mutableClone(value) {
  return typeof structuredClone === 'function'
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}

function publicEnvelope(record, failure = false) {
  const value = mutableClone(record);
  delete value.trainingStatus;
  return Object.freeze({
    ...value,
    schemaVersion: failure ? PUBLIC_FEEDBACK.failureSchemaVersion : PUBLIC_FEEDBACK.schemaVersion,
    corpusVersion: PUBLIC_FEEDBACK.corpusVersion,
    sourceTrust: PUBLIC_FEEDBACK.sourceTrust,
    certificationStatus: PUBLIC_FEEDBACK.defaultCertificationStatus
  });
}

export function createPublicPredictionSnapshot(input) {
  return createPredictionSnapshot(input);
}

export function createPublicFeedbackRecord(input) {
  return publicEnvelope({ ...createFeedbackRecord(input), imageHash: input?.snapshot?.imageHash });
}

export function createPublicScanFailureRecord(input) {
  return publicEnvelope(createScanFailureRecord(input), true);
}

export function canReviewPublicFeedback(user) {
  if (!user?.authenticated) return false;
  if (['owner', 'admin'].includes(String(user.role || '').toLowerCase())) return true;
  return Array.isArray(user.entitlements) && user.entitlements.includes(REVIEWER_ENTITLEMENT);
}

export function certificationTarget(action) {
  if (action === 'CERTIFY_CLASSIFIER_CORRECTION') return TARGET_CORPORA[0];
  if (action === 'CERTIFY_LOCALIZATION_FAILURE') return TARGET_CORPORA[1];
  return null;
}

export function validateCertificationDecision(input, reviewer) {
  invariant(canReviewPublicFeedback(reviewer), 'REVIEWER_ACCESS_DENIED');
  invariant(input && REVIEW_ACTIONS.includes(input.action), 'CERTIFICATION_ACTION_INVALID');
  invariant(typeof input.feedbackId === 'string' && /^[0-9a-f-]{36}$/i.test(input.feedbackId), 'FEEDBACK_ID_INVALID');
  const notes = input.notes == null ? null : String(input.notes).trim();
  invariant(notes === null || notes.length <= 2_000, 'CERTIFICATION_NOTES_INVALID');
  const targetCorpus = certificationTarget(input.action);
  const routedCertification = targetCorpus !== null;
  const trainingEligible = input.trainingEligible === true;
  invariant(!trainingEligible || routedCertification, 'TRAINING_ELIGIBILITY_REQUIRES_ROUTED_CERTIFICATION');
  invariant(input.action !== 'DUPLICATE' || /^[0-9a-f-]{36}$/i.test(input.duplicateOf || ''), 'DUPLICATE_REFERENCE_REQUIRED');
  return Object.freeze({
    feedbackId: input.feedbackId,
    action: input.action,
    notes,
    targetCorpus,
    trainingEligible,
    duplicateOf: input.action === 'DUPLICATE' ? input.duplicateOf : null,
    reasonCodes: [...new Set((Array.isArray(input.reasonCodes) ? input.reasonCodes : [])
      .map(value => String(value).toUpperCase().replace(/[^A-Z0-9_-]/g, '_').slice(0, 80))
      .filter(Boolean))].slice(0, 20),
    certificationVersion: PUBLIC_FEEDBACK.certificationVersion,
    certifiedBy: reviewer.id
  });
}

export function feedbackPriority(record) {
  const feedback = record?.payload || record || {};
  const orientationCorrection = feedback.clientMetadata?.orientationCorrectionApplied === true;
  const warnings = feedback.warningCodes || feedback.clientMetadata?.warningCodes || [];
  const changes = feedback.changedSquares || [];
  const highConfidenceCorrection = changes.some(change => Number(change.originalConfidence) >= 0.9);
  const hardWarning = feedback.structuralStatus === 'REVIEW_REQUIRED' || warnings.some(code => /MISSING|MULTIPLE|BACK_RANK/.test(code));
  if (orientationCorrection || ['LOCALIZATION_FAILURE', 'SCAN_FAILURE'].includes(feedback.feedbackType)
    || highConfidenceCorrection || hardWarning || Number(feedback.changedSquareCount || 0) >= 6
    || feedback.clientMetadata?.rarePieceStyle === true || feedback.clientMetadata?.newPlatform === true) return 'high';
  if (feedback.feedbackType === 'PIECE_CORRECTION' || Number(feedback.changedSquareCount || 0) > 0) return 'medium';
  return record?.duplicateSuspected || feedback.duplicateSuspected ? 'low' : 'low';
}

export function latestCertification(history) {
  return [...(history || [])].sort((left, right) => Date.parse(right.certifiedAt || right.certified_at)
    - Date.parse(left.certifiedAt || left.certified_at))[0] || null;
}

export function eligiblePublicExport(record, history) {
  const decision = latestCertification(history);
  const feedback = record?.payload || record || {};
  if (feedback.clientMetadata?.orientationCorrectionApplied === true) return false;
  if ((history || []).some(item => ['DUPLICATE', 'EXCLUDE'].includes(item.action || item.status))) return false;
  if (!decision || !String(decision.action || decision.status || '').startsWith('CERTIFY')) return false;
  if (decision.trainingEligible !== true && decision.training_eligible !== true) return false;
  if (feedback.sourceTrust !== PUBLIC_FEEDBACK.sourceTrust || feedback.certificationStatus !== 'raw-unverified') return false;
  if (feedback.consent?.shareCorrectionForImprovement !== true || feedback.consent?.shareImageForImprovement !== true) return false;
  if (!record.imageStorageReference && !record.image_storage_reference) return false;
  if (record.duplicateSuspected === true || record.duplicate_suspected === true || decision.duplicateOf || decision.duplicate_of) return false;
  if (decision.action === 'CERTIFY_CLASSIFIER_CORRECTION') {
    return feedback.localizationValid === true && feedback.feedbackType === 'PIECE_CORRECTION'
      && (decision.targetCorpus || decision.target_corpus) === TARGET_CORPORA[0];
  }
  if (decision.action === 'CERTIFY_LOCALIZATION_FAILURE') {
    return feedback.localizationValid === false && ['LOCALIZATION_FAILURE', 'SCAN_FAILURE'].includes(feedback.feedbackType)
      && (decision.targetCorpus || decision.target_corpus) === TARGET_CORPORA[1];
  }
  return false;
}

export { MODEL, PLATFORMS, analyzeStructuralPosition };
