export const LEARNING_CONSENT_VERSION = '1.0.0';
export const LEARNING_EVENT_VERSION = '1.0.0';
export const LEARNING_EVIDENCE_VERSION = '1.0.0';
export const LEARNING_PROGRESS_VERSION = '1.0.0';

export const CONSENT_STATES = Object.freeze(['unknown', 'declined', 'local-progress-enabled']);
export const CONSENT_SCOPE = 'knowledge-learning-progress';
export const EVENT_TYPES = Object.freeze({
  'study-session-started': 'administrative',
  'study-session-ended': 'administrative',
  'unit-opened': 'observational',
  'position-selected': 'observational',
  'explanation-viewed': 'observational',
  'coaching-prompt-advanced': 'practice',
  'hint-requested': 'practice',
  'answer-submitted': 'practice',
  'activity-evaluated': 'evaluative',
  'assessment-evaluated': 'evaluative',
  'return-to-library': 'administrative'
});
export const HINT_LEVELS = Object.freeze([
  'none', 'observation', 'concept', 'directional', 'decision-process', 'final-answer'
]);
export const EVIDENCE_TYPES = Object.freeze([
  'exposure', 'participation', 'guided-success', 'independent-success',
  'assessment-success', 'transfer-success', 'misconception', 'remediation-needed'
]);
export const PROGRESS_STATES = Object.freeze(['not-started', 'explored', 'practicing', 'assessed', 'review-suggested']);

const ID = /^[a-z0-9][a-z0-9:._-]{0,159}$/i;
const RELEASE_ID = /^rel-[a-f0-9]{64}$/;
const UNIT_ID = /^ku:endgames:[a-z0-9-]+:[a-z0-9-]+$/;
const clone = value => structuredClone(value);
const exactKeys = (value, allowed) => Object.keys(value).every(key => allowed.includes(key));
const toIsoTime = value => {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
};
const validTime = value => typeof value === 'string' && toIsoTime(value) === value;
const result = errors => Object.freeze({ ok: errors.length === 0, errors: Object.freeze([...errors]) });

export function createConsentState({
  state = 'unknown', occurredAt = null, clearData = false
} = {}) {
  const enabled = state === 'local-progress-enabled';
  const declined = state === 'declined';
  const timestamp = occurredAt === null ? null : toIsoTime(occurredAt);
  return Object.freeze({
    contractVersion: LEARNING_CONSENT_VERSION,
    state,
    scope: CONSENT_SCOPE,
    storageMode: 'local-device',
    dataCategories: enabled ? Object.freeze(['validated-events', 'evidence', 'progress-summary']) : Object.freeze([]),
    grantedAt: enabled ? timestamp : null,
    revokedAt: declined ? timestamp : null,
    retention: 'bounded-versioned-records',
    clearData: Boolean(clearData)
  });
}

export function validateConsentState(consent) {
  const errors = [];
  if (!consent || typeof consent !== 'object' || Array.isArray(consent)) return result(['consent-object-required']);
  if (consent.contractVersion !== LEARNING_CONSENT_VERSION) errors.push('unsupported-consent-version');
  if (!CONSENT_STATES.includes(consent.state)) errors.push('invalid-consent-state');
  if (consent.scope !== CONSENT_SCOPE) errors.push('invalid-consent-scope');
  if (consent.storageMode !== 'local-device') errors.push('invalid-storage-mode');
  if (!Array.isArray(consent.dataCategories)) errors.push('invalid-data-categories');
  if (consent.state === 'local-progress-enabled' && !validTime(consent.grantedAt)) errors.push('grant-timestamp-required');
  if (consent.state !== 'local-progress-enabled' && consent.grantedAt !== null) errors.push('unexpected-grant-timestamp');
  if (consent.state === 'declined' && !validTime(consent.revokedAt)) errors.push('revocation-timestamp-required');
  if (consent.state !== 'declined' && consent.revokedAt !== null) errors.push('unexpected-revocation-timestamp');
  return result(errors);
}

export function canPersistLearningCategory(consent, category) {
  return validateConsentState(consent).ok
    && consent.state === 'local-progress-enabled'
    && consent.dataCategories.includes(category);
}

const EVENT_KEYS = [
  'eventId', 'schemaVersion', 'eventType', 'classification', 'occurredAt', 'sessionId',
  'releaseId', 'unitId', 'learningObjectId', 'positionId', 'promptStage',
  'assessmentItemId', 'action', 'attemptNumber', 'hintLevel', 'responseType',
  'result', 'sourceSurface', 'persistenceEligible', 'consentState',
  'localOnly', 'dataMinimization'
];

export function createInteractionEvent(input, context) {
  const event = {
    eventId: input.eventId,
    schemaVersion: LEARNING_EVENT_VERSION,
    eventType: input.eventType,
    classification: EVENT_TYPES[input.eventType] ?? null,
    occurredAt: toIsoTime(input.occurredAt),
    sessionId: input.sessionId,
    releaseId: input.releaseId,
    unitId: input.unitId,
    learningObjectId: input.learningObjectId ?? null,
    positionId: input.positionId ?? null,
    promptStage: Number.isSafeInteger(input.promptStage) ? input.promptStage : null,
    assessmentItemId: input.assessmentItemId ?? null,
    action: input.action ?? input.eventType,
    attemptNumber: Number.isSafeInteger(input.attemptNumber) ? input.attemptNumber : null,
    hintLevel: input.hintLevel ?? 'none',
    responseType: input.responseType ?? null,
    result: input.result ?? null,
    sourceSurface: 'guided-study',
    persistenceEligible: Boolean(input.persistenceEligible),
    consentState: input.consentState,
    localOnly: true,
    dataMinimization: 'stable-references-only'
  };
  const validation = validateInteractionEvent(event, context);
  if (!validation.ok) throw new TypeError(validation.errors.join(','));
  return Object.freeze(event);
}

export function validateInteractionEvent(event, context = {}) {
  const errors = [];
  if (!event || typeof event !== 'object' || Array.isArray(event)) return result(['event-object-required']);
  if (!exactKeys(event, EVENT_KEYS)) errors.push('unknown-event-field');
  if (!ID.test(event.eventId ?? '')) errors.push('invalid-event-id');
  if (event.schemaVersion !== LEARNING_EVENT_VERSION) errors.push('unsupported-event-version');
  if (!EVENT_TYPES[event.eventType]) errors.push('invalid-event-type');
  if (event.classification !== EVENT_TYPES[event.eventType]) errors.push('invalid-event-classification');
  if (!validTime(event.occurredAt)) errors.push('invalid-event-time');
  if (!ID.test(event.sessionId ?? '')) errors.push('invalid-session-id');
  if (!RELEASE_ID.test(event.releaseId ?? '') || event.releaseId !== context.releaseId) errors.push('unsupported-release');
  if (!UNIT_ID.test(event.unitId ?? '') || !context.unitIds?.includes(event.unitId)) errors.push('unsupported-unit');
  if (event.positionId !== null && !context.positionIds?.includes(event.positionId)) errors.push('unsupported-position');
  if (event.learningObjectId !== null && !context.learningObjectIds?.includes(event.learningObjectId)) errors.push('unsupported-learning-object');
  if (event.assessmentItemId !== null && !context.assessmentItemIds?.includes(event.assessmentItemId)) errors.push('unsupported-assessment-item');
  if (!HINT_LEVELS.includes(event.hintLevel)) errors.push('invalid-hint-level');
  if (event.action !== event.eventType) errors.push('invalid-event-action');
  if (![null, 'choice', 'move', 'boolean'].includes(event.responseType)) errors.push('invalid-response-type');
  if (![null, 'correct', 'incorrect', 'partial', 'unobserved'].includes(event.result)) errors.push('invalid-event-result');
  if (!CONSENT_STATES.includes(event.consentState)) errors.push('invalid-event-consent');
  if (event.persistenceEligible && event.consentState !== 'local-progress-enabled') errors.push('persistence-without-consent');
  if (event.localOnly !== true || event.dataMinimization !== 'stable-references-only') errors.push('invalid-privacy-boundary');
  for (const value of Object.values(event)) {
    if (typeof value === 'function' || typeof value === 'symbol') errors.push('executable-event-value');
  }
  return result([...new Set(errors)].sort());
}

export function validateInteractionEvents(events, context = {}) {
  if (!Array.isArray(events)) return result(['event-list-required']);
  const errors = events.flatMap(event => validateInteractionEvent(event, context).errors);
  const ids = events.map(event => event?.eventId).filter(Boolean);
  if (new Set(ids).size !== ids.length) errors.push('duplicate-event-id');
  return result([...new Set(errors)].sort());
}

export function deriveEducationalEvidence(events, context = {}) {
  const valid = events.filter(event => validateInteractionEvent(event, context).ok);
  const evidence = [];
  for (const event of valid) {
    let evidenceType = null;
    let explanation = null;
    if (['unit-opened', 'explanation-viewed', 'position-selected'].includes(event.eventType)) {
      evidenceType = 'exposure';
      explanation = 'You explored released lesson material. This does not demonstrate mastery.';
    } else if (['coaching-prompt-advanced', 'hint-requested', 'answer-submitted'].includes(event.eventType)) {
      evidenceType = 'participation';
      explanation = event.eventType === 'hint-requested'
        ? 'You requested support. A hint is guidance, not a failure.'
        : 'You participated in guided study without an assessed mastery claim.';
    } else if (event.eventType === 'activity-evaluated' && event.result === 'correct') {
      evidenceType = event.hintLevel === 'none' ? 'independent-success' : 'guided-success';
      explanation = event.hintLevel === 'none'
        ? 'An authored practice move was correct without answer-revealing help.'
        : 'The authored practice move was correct after answer-revealing help, so it is guided success.';
    } else if (event.eventType === 'activity-evaluated' && event.result === 'incorrect') {
      const earlier = valid.filter(item => item.eventType === 'activity-evaluated'
        && item.learningObjectId === event.learningObjectId && item.result === 'incorrect'
        && item.occurredAt <= event.occurredAt);
      if (earlier.length >= 2) {
        evidenceType = 'remediation-needed';
        explanation = 'Two unsuccessful attempts on the same authored activity may benefit from review.';
      }
    } else if (event.eventType === 'assessment-evaluated' && event.result === 'correct') {
      evidenceType = event.hintLevel === 'none' ? 'assessment-success' : 'guided-success';
      explanation = event.hintLevel === 'final-answer'
        ? 'The response followed a final-answer hint, so it is guided success rather than independent success.'
        : event.hintLevel === 'none'
          ? 'A released assessment recorded a correct response without a hint.'
          : 'A released assessment recorded a correct response with guidance.';
    } else if (event.eventType === 'assessment-evaluated' && event.result === 'incorrect') {
      evidenceType = 'remediation-needed';
      explanation = 'The assessed response indicates a concept that may benefit from review.';
    }
    if (!evidenceType) continue;
    evidence.push(Object.freeze({
      evidenceId: `evidence:${event.eventId}`,
      schemaVersion: LEARNING_EVIDENCE_VERSION,
      releaseId: event.releaseId,
      unitId: event.unitId,
      masteryCriterionId: null,
      evidenceType,
      sourceEventIds: Object.freeze([event.eventId]),
      strength: evidenceType,
      verification: event.classification === 'evaluative' ? 'authored-assessment' : 'deterministic-rule',
      observedBehavior: event.eventType,
      hintDependence: event.hintLevel,
      attemptContext: event.attemptNumber,
      varietyContext: 'single-context',
      createdAt: event.occurredAt,
      evaluator: 'deterministic-rule',
      explanation
    }));
  }
  return Object.freeze(evidence);
}

export function validateEvidenceRecord(evidence, sourceEvents = []) {
  const errors = [];
  if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) return result(['evidence-object-required']);
  if (!ID.test(evidence.evidenceId ?? '')) errors.push('invalid-evidence-id');
  if (evidence.schemaVersion !== LEARNING_EVIDENCE_VERSION) errors.push('unsupported-evidence-version');
  if (!RELEASE_ID.test(evidence.releaseId ?? '')) errors.push('invalid-evidence-release');
  if (!UNIT_ID.test(evidence.unitId ?? '')) errors.push('invalid-evidence-unit');
  if (!EVIDENCE_TYPES.includes(evidence.evidenceType)) errors.push('invalid-evidence-type');
  if (!Array.isArray(evidence.sourceEventIds) || !evidence.sourceEventIds.length) errors.push('evidence-source-required');
  const sources = sourceEvents.filter(event => evidence.sourceEventIds?.includes(event.eventId));
  if (sources.length !== evidence.sourceEventIds?.length) errors.push('unknown-evidence-source');
  if (typeof evidence.explanation !== 'string' || !evidence.explanation.trim()) errors.push('evidence-explanation-required');
  const strong = ['independent-success', 'assessment-success', 'transfer-success'];
  if (strong.includes(evidence.evidenceType) && sources.some(event => event.classification !== 'evaluative')) errors.push('strong-evidence-from-non-evaluative-event');
  if (evidence.evidenceType === 'independent-success' && evidence.hintDependence !== 'none') errors.push('independent-success-with-hint');
  return result([...new Set(errors)].sort());
}

export function deriveLearnerProgress({ unitId, releaseId, events = [], evidence = [], consent }) {
  const types = new Set(evidence.map(item => item.evidenceType));
  const successRecords = evidence.filter(item => ['independent-success', 'assessment-success', 'transfer-success'].includes(item.evidenceType));
  const successfulAt = successRecords.map(item => item.createdAt).sort().at(-1) ?? null;
  const unresolvedMisconceptions = evidence.filter(item => item.evidenceType === 'misconception'
    && !successRecords.some(success => item.masteryCriterionId
      && success.masteryCriterionId === item.masteryCriterionId && success.createdAt > item.createdAt));
  const unresolvedRemediation = evidence.filter(item => item.evidenceType === 'remediation-needed'
    && (!successfulAt || item.createdAt > successfulAt));
  let state = 'not-started';
  if (unresolvedMisconceptions.length || unresolvedRemediation.length >= 2) state = 'review-suggested';
  else if (types.has('assessment-success')) state = 'assessed';
  else if (types.has('participation') || types.has('guided-success')) state = 'practicing';
  else if (types.has('exposure')) state = 'explored';
  const times = events.map(item => item.occurredAt).filter(validTime).sort();
  return Object.freeze({
    contractVersion: LEARNING_PROGRESS_VERSION,
    unitId,
    releaseId,
    state,
    firstActivityAt: times[0] ?? null,
    mostRecentActivityAt: times.at(-1) ?? null,
    sessionsCount: new Set(events.map(item => item.sessionId)).size,
    positionsExplored: new Set(events.map(item => item.positionId).filter(Boolean)).size,
    learningObjectsAttempted: new Set(events.map(item => item.learningObjectId).filter(Boolean)).size,
    assessmentEvidenceCount: evidence.filter(item => item.evidenceType === 'assessment-success').length,
    explanation: state === 'not-started'
      ? 'No learning activity has been interpreted.'
      : `${state[0].toUpperCase()}${state.slice(1)} reflects participation or assessment evidence, not mastery.`,
    localOnly: true,
    consentScope: consent?.scope ?? CONSENT_SCOPE,
    clearBehavior: 'clear-this-unit-or-all-local-learning-data'
  });
}

export function validateLearnerProgress(progress, consent) {
  const errors = [];
  if (!progress || typeof progress !== 'object' || Array.isArray(progress)) return result(['progress-object-required']);
  if (progress.contractVersion !== LEARNING_PROGRESS_VERSION) errors.push('unsupported-progress-version');
  if (!UNIT_ID.test(progress.unitId ?? '')) errors.push('invalid-progress-unit');
  if (!RELEASE_ID.test(progress.releaseId ?? '')) errors.push('invalid-progress-release');
  if (!PROGRESS_STATES.includes(progress.state)) errors.push('invalid-progress-state');
  if ('mastery' in progress || 'completed' in progress || 'mastered' in progress) errors.push('mastery-field-in-progress');
  if (progress.localOnly !== true) errors.push('progress-must-be-local');
  if (progress.persistenceEligible && !canPersistLearningCategory(consent, 'progress-summary')) errors.push('progress-persistence-without-consent');
  return result(errors);
}

export function createRecommendationSignal({ type, sourceEvidence, targetUnitId, relationship = null, explanation }) {
  const allowed = ['continue-current-unit', 'review-prerequisite', 'revisit-misconception', 'attempt-assessment', 'practice-transfer', 'study-related-unit'];
  const evidenceBacked = sourceEvidence?.schemaVersion === LEARNING_EVIDENCE_VERSION
    && EVIDENCE_TYPES.includes(sourceEvidence?.evidenceType)
    && ID.test(sourceEvidence?.evidenceId ?? '');
  const reasonBacked = type !== 'revisit-misconception'
    || ['misconception', 'remediation-needed'].includes(sourceEvidence?.evidenceType);
  const graphBacked = type !== 'review-prerequisite' || (typeof relationship === 'string' && relationship.trim());
  if (!allowed.includes(type) || !evidenceBacked || !reasonBacked || !graphBacked || !UNIT_ID.test(targetUnitId ?? '') || typeof explanation !== 'string' || !explanation.trim()) {
    throw new TypeError('invalid-recommendation-signal');
  }
  return Object.freeze({
    type,
    sourceEvidenceIds: Object.freeze([sourceEvidence.evidenceId]),
    targetUnitId,
    relationship,
    explanation: explanation.trim(),
    confidence: 'diagnostic',
    reevaluation: 'when-new-validated-evidence-arrives'
  });
}
