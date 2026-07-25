export const REVIEW_EXPLANATION_VERSION = '1.0.0';
export const REVIEW_DERIVATION_VERSION = '1.0.0';
export const REVIEW_TRIGGERS = Object.freeze([
  'misconception-evidence-present',
  'assessment-unsuccessful',
  'repeated-final-hint-dependence',
  'repeated-decision-process-hint-dependence',
  'guided-success-without-independent-success',
  'assessment-not-yet-attempted'
]);
export const REVIEW_STATUSES = Object.freeze(['none', 'suggested', 'dismissed', 'resolved', 'unavailable']);
export const REVIEW_RELATIONSHIPS = Object.freeze(['same-unit', 'remediation', 'prerequisite', 'contrast', 'related']);

const ID = /^[a-z0-9][a-z0-9:._-]{0,159}$/i;
const RELEASE_ID = /^rel-[a-f0-9]{64}$/;
const UNIT_ID = /^ku:endgames:[a-z0-9-]+:[a-z0-9-]+$/;
const clone = value => structuredClone(value);
const immutable = value => Object.freeze(clone(value));
const iso = value => {
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
};
const result = errors => Object.freeze({ ok: errors.length === 0, errors: Object.freeze([...new Set(errors)].sort()) });
const latest = records => [...records].sort((a, b) => a.createdAt.localeCompare(b.createdAt)).at(-1)?.createdAt ?? null;
const after = (record, time) => !time || record.createdAt > time;
const successful = evidence => ['independent-success', 'assessment-success', 'transfer-success'].includes(evidence.evidenceType);
const safeText = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 240 && !/[<>]/.test(value);
const explanationId = (releaseId, unitId, trigger, evidenceIds) =>
  `review:${releaseId.slice(4, 16)}:${unitId.split(':').slice(-2).join('-')}:${trigger}:${evidenceIds.join('|')}`
    .replace(/[^a-z0-9:._-]/gi, '-').slice(0, 160);

const TEMPLATES = Object.freeze({
  'misconception-evidence-present': {
    title: 'Review suggested',
    explanation: 'A validated misconception is still present in your saved local evidence.',
    observed: 'A specific concept response indicated a misconception.',
    why: 'Reviewing the released explanation and trying a new position may help you check the concept again.',
    action: 'Review now'
  },
  'assessment-unsuccessful': {
    title: 'Review suggested',
    explanation: 'Two recent assessment attempts indicate that this concept may benefit from review.',
    observed: 'Two assessment attempts were not successful.',
    why: 'Revisiting the decision process before another assessment may help.',
    action: 'Review now'
  },
  'repeated-final-hint-dependence': {
    title: 'Review suggested',
    explanation: 'You used the final hint in two recent attempts.',
    observed: 'Two qualifying attempts used the final-answer hint.',
    why: 'Reviewing the decision process may help you try the next position more independently.',
    action: 'Review now'
  },
  'repeated-decision-process-hint-dependence': {
    title: 'Review suggested',
    explanation: 'You used decision-process guidance in two recent attempts.',
    observed: 'Two qualifying attempts used decision-process guidance.',
    why: 'A focused review may help you apply the steps independently.',
    action: 'Review now'
  },
  'guided-success-without-independent-success': {
    title: 'Review suggested',
    explanation: 'Your recent success was guided.',
    observed: 'A correct response was recorded with guidance and no later independent success is saved.',
    why: 'Try one independent position before treating the concept as assessed.',
    action: 'Practice independently'
  },
  'assessment-not-yet-attempted': {
    title: 'Assessment available',
    explanation: 'You practiced this unit, but no assessment attempt is recorded yet.',
    observed: 'Saved practice or exploration evidence exists without an assessment event.',
    why: 'An authored assessment can provide stronger evidence than reading or exploration.',
    action: 'Try assessment'
  }
});

function directTarget(unit, trigger) {
  const relationships = Array.isArray(unit?.relationships) ? unit.relationships : [];
  const wanted = trigger === 'misconception-evidence-present' || trigger === 'assessment-unsuccessful'
    ? ['remediation'] : [];
  for (const type of wanted) {
    const relation = relationships.find(item => item.type === type && UNIT_ID.test(item.targetId ?? '') && safeText(item.reason));
    if (relation) return {
      unitId: relation.targetId, relationshipType: type, relationshipReason: relation.reason,
      targetKind: type
    };
  }
  return {
    unitId: unit.id, relationshipType: 'same-unit',
    relationshipReason: 'Review the released explanation and activities for this concept.',
    targetKind: 'same-unit'
  };
}

function triggerFor({ evidence, events, hasAssessment }) {
  const ordered = [...evidence].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const misconception = ordered.filter(item => item.evidenceType === 'misconception'
    && !ordered.some(candidate => successful(candidate)
      && item.masteryCriterionId && candidate.masteryCriterionId === item.masteryCriterionId
      && candidate.createdAt > item.createdAt));
  if (misconception.length) return { type: REVIEW_TRIGGERS[0], evidence: misconception };
  const lastSuccess = latest(ordered.filter(successful));
  const unresolved = ordered.filter(item => after(item, lastSuccess));
  const unsuccessful = unresolved.filter(item => item.evidenceType === 'remediation-needed');
  if (unsuccessful.length >= 2) return { type: REVIEW_TRIGGERS[1], evidence: unsuccessful.slice(-2) };
  const finalHint = unresolved.filter(item => item.evidenceType === 'guided-success' && item.hintDependence === 'final-answer');
  if (finalHint.length >= 2) return { type: REVIEW_TRIGGERS[2], evidence: finalHint.slice(-2) };
  const decisionHint = unresolved.filter(item => item.evidenceType === 'guided-success' && item.hintDependence === 'decision-process');
  if (decisionHint.length >= 2) return { type: REVIEW_TRIGGERS[3], evidence: decisionHint.slice(-2) };
  const guided = unresolved.filter(item => item.evidenceType === 'guided-success');
  if (guided.length) return { type: REVIEW_TRIGGERS[4], evidence: guided.slice(-1) };
  const assessmentEvents = events.filter(item => item.eventType === 'assessment-evaluated');
  const hintEventIds = new Set(events.filter(item => item.eventType === 'hint-requested').map(item => item.eventId));
  const practice = evidence.filter(item => item.evidenceType === 'participation'
    && item.sourceEventIds.some(id => !hintEventIds.has(id)));
  const positions = new Set(events.filter(item => item.eventType === 'position-selected').map(item => item.positionId));
  if (hasAssessment && !assessmentEvents.length && (practice.length > 0 || positions.size >= 2)) {
    const supporting = practice.length ? practice.slice(-2) : evidence.filter(item => item.evidenceType === 'exposure').slice(-2);
    if (supporting.length) return { type: REVIEW_TRIGGERS[5], evidence: supporting };
  }
  return null;
}

export function deriveUnitReviewExplanation({ unit, releaseId, evidence = [], events = [], dismissal = null } = {}) {
  if (!unit || unit.id === undefined || !UNIT_ID.test(unit.id) || !RELEASE_ID.test(releaseId ?? '')) return null;
  const unitEvidence = evidence.filter(item => item.unitId === unit.id && item.releaseId === releaseId);
  const unitEvents = events.filter(item => item.unitId === unit.id && item.releaseId === releaseId);
  const hasAssessment = Array.isArray(unit.learningObjects?.assessments) && unit.learningObjects.assessments.length > 0;
  const trigger = triggerFor({ evidence: unitEvidence, events: unitEvents, hasAssessment });
  if (!trigger) return null;
  const supportingEvidenceIds = trigger.evidence.map(item => item.evidenceId).sort();
  const supportingEventIds = [...new Set(trigger.evidence.flatMap(item => item.sourceEventIds))].sort();
  const mostRecentEvidenceAt = latest(trigger.evidence);
  const dismissed = dismissal?.triggerType === trigger.type
    && dismissal?.explanationId === explanationId(releaseId, unit.id, trigger.type, supportingEvidenceIds)
    && dismissal.dismissedAt >= mostRecentEvidenceAt;
  const template = TEMPLATES[trigger.type];
  const target = directTarget(unit, trigger.type);
  return immutable({
    explanationId: explanationId(releaseId, unit.id, trigger.type, supportingEvidenceIds),
    schemaVersion: REVIEW_EXPLANATION_VERSION,
    derivationVersion: REVIEW_DERIVATION_VERSION,
    createdAt: mostRecentEvidenceAt,
    releaseId,
    unitId: unit.id,
    triggerType: trigger.type,
    supportingEvidenceIds,
    supportingEventIds,
    evidenceCategories: [...new Set(trigger.evidence.map(item => item.evidenceType))].sort(),
    hintDependence: [...new Set(trigger.evidence.map(item => item.hintDependence))].sort(),
    attemptContext: trigger.evidence.map(item => item.attemptContext).filter(Number.isSafeInteger),
    mostRecentEvidenceAt,
    title: template.title,
    explanation: template.explanation,
    observed: template.observed,
    whyReviewMayHelp: template.why,
    primaryAction: template.action,
    secondaryAction: 'Dismiss for now',
    targetUnitId: target.unitId,
    targetRelationshipType: target.relationshipType,
    targetRelationshipReason: target.relationshipReason,
    targetKind: target.targetKind,
    dismissible: true,
    clearable: true,
    status: dismissed ? 'dismissed' : 'suggested',
    dismissedAt: dismissed ? dismissal.dismissedAt : null,
    reappearanceRule: 'new-qualifying-evidence-after-dismissal',
    resolutionState: 'unresolved',
    resolvedAt: null,
    localOnly: true,
    learnerNotice: 'This explanation uses only progress saved in this browser. This is not a Mastery result.'
  });
}

export function validateReviewExplanation(explanation, { evidence = [], unitIds = [] } = {}) {
  const errors = [];
  if (!explanation || typeof explanation !== 'object' || Array.isArray(explanation)) return result(['review-explanation-required']);
  if (!ID.test(explanation.explanationId ?? '')) errors.push('invalid-explanation-id');
  if (explanation.schemaVersion !== REVIEW_EXPLANATION_VERSION || explanation.derivationVersion !== REVIEW_DERIVATION_VERSION) errors.push('unsupported-explanation-version');
  if (!RELEASE_ID.test(explanation.releaseId ?? '') || !UNIT_ID.test(explanation.unitId ?? '')) errors.push('invalid-explanation-source');
  if (!REVIEW_TRIGGERS.includes(explanation.triggerType)) errors.push('invalid-review-trigger');
  if (!Array.isArray(explanation.supportingEvidenceIds) || !explanation.supportingEvidenceIds.length
    || explanation.supportingEvidenceIds.some(id => !evidence.some(item => item.evidenceId === id))) errors.push('missing-supporting-evidence');
  if (!UNIT_ID.test(explanation.targetUnitId ?? '') || !unitIds.includes(explanation.targetUnitId)) errors.push('invalid-review-target');
  if (!REVIEW_RELATIONSHIPS.includes(explanation.targetRelationshipType)) errors.push('unsupported-review-relationship');
  for (const field of ['title', 'explanation', 'observed', 'whyReviewMayHelp', 'primaryAction', 'targetRelationshipReason', 'learnerNotice']) {
    if (!safeText(explanation[field])) errors.push(`invalid-${field}`);
  }
  if (!REVIEW_STATUSES.includes(explanation.status) || !['unresolved', 'resolved'].includes(explanation.resolutionState)) errors.push('invalid-review-status');
  if (iso(explanation.createdAt) !== explanation.createdAt || iso(explanation.mostRecentEvidenceAt) !== explanation.mostRecentEvidenceAt) errors.push('invalid-review-time');
  if (explanation.localOnly !== true) errors.push('review-must-be-local');
  return result(errors);
}
