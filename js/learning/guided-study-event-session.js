import {
  CONSENT_SCOPE,
  createConsentState,
  createInteractionEvent,
  deriveEducationalEvidence,
  deriveLearnerProgress
} from './learning-progress-contracts.js';

export function createGuidedStudyEventSession({
  releaseId, unitId, positionIds = [], learningObjectIds = [], assessmentItemIds = [],
  sessionId, now = Date.now, idFactory = () => crypto.randomUUID()
}) {
  const MAX_IN_MEMORY_EVENTS = 200;
  const context = Object.freeze({
    releaseId,
    unitIds: Object.freeze([unitId]),
    positionIds: Object.freeze([...positionIds]),
    learningObjectIds: Object.freeze([...learningObjectIds]),
    assessmentItemIds: Object.freeze([...assessmentItemIds])
  });
  let consent = createConsentState();
  let events = [];
  const emit = (eventType, detail = {}) => {
    const event = createInteractionEvent({
      eventId: `event:${idFactory()}`,
      eventType,
      occurredAt: now(),
      sessionId,
      releaseId,
      unitId,
      consentState: consent.state,
      persistenceEligible: consent.state === 'local-progress-enabled',
      ...detail
    }, context);
    events = [...events, event].slice(-MAX_IN_MEMORY_EVENTS);
    return event;
  };
  const snapshot = () => {
    const evidence = deriveEducationalEvidence(events, context);
    return Object.freeze({
      consent,
      events: Object.freeze([...events]),
      evidence,
      progress: deriveLearnerProgress({ unitId, releaseId, events, evidence, consent }),
      persisted: false,
      storageScope: CONSENT_SCOPE
    });
  };
  return Object.freeze({
    emit,
    applyConsent(value) { consent = value; return snapshot(); },
    enablePreview() { consent = createConsentState({ state: 'local-progress-enabled', occurredAt: now() }); return snapshot(); },
    decline() { consent = createConsentState({ state: 'declined', occurredAt: now() }); return snapshot(); },
    revokeAndClear() { consent = createConsentState({ state: 'declined', occurredAt: now(), clearData: true }); events = []; return snapshot(); },
    snapshot
  });
}
