import { ChessRulesFacade } from '../endgame-trainer/chess-rules-facade.js';

export const ACTIVITY_SCHEMA_VERSION = '1.0.0';
export const ATTEMPT_SCHEMA_VERSION = '1.0.0';
export const EVALUATION_SCHEMA_VERSION = '1.0.0';
export const ACTIVITY_TYPES = Object.freeze(['independent-practice']);
export const EVALUATION_STATUSES = Object.freeze([
  'not-submitted', 'invalid-response', 'unsuccessful', 'successful',
  'successful-with-guidance', 'unavailable'
]);

const clone = value => structuredClone(value);
const immutable = value => Object.freeze(clone(value));
const stableId = value => typeof value === 'string' && /^[a-z0-9][a-z0-9:._-]{0,159}$/i.test(value);
const hasHtml = value => typeof value === 'string' && /<[^>]+>/.test(value);

function eligibleExercise(unit, exercise) {
  const position = unit.positions?.find(item => item.id === exercise.positionId);
  const principal = position?.principalIdeas?.[0];
  return position?.validation?.structural === 'valid'
    && position.validation.educational === 'verified'
    && typeof exercise.task === 'string'
    && /\bchoose\b/i.test(exercise.task)
    && Array.isArray(principal?.moves)
    && principal.moves.length === 1
    && typeof principal.moves[0] === 'string';
}

export function deriveReleasedActivities(unit, releaseId) {
  if (!unit || unit.status !== 'published' || unit.schemaVersion !== '1.0.0') return Object.freeze([]);
  const activities = [];
  for (const exercise of unit.learningObjects?.exercises ?? []) {
    if (!eligibleExercise(unit, exercise)) continue;
    const position = unit.positions.find(item => item.id === exercise.positionId);
    const principal = position.principalIdeas[0];
    activities.push(immutable({
      activityId: `activity:${exercise.id}`,
      schemaVersion: ACTIVITY_SCHEMA_VERSION,
      releaseId,
      unitId: unit.id,
      sourceLearningObjectId: exercise.id,
      activityType: 'independent-practice',
      objective: unit.education.learningObjectives[0],
      masteryCriterionIds: [],
      expectedConcepts: [...position.expectedConcepts],
      transfer: position.role === 'transfer',
      remediation: false,
      position: {
        id: position.id,
        fen: position.fen,
        sideToMove: position.sideToMove,
        orientation: position.sideToMove,
        purpose: principal.purpose
      },
      prompt: exercise.task,
      responseType: 'move',
      allowedAttempts: 3,
      hintPolicy: 'answer-reveal-on-request',
      retryPolicy: 'reset-position',
      evaluatorType: 'authored-san-exact-v1',
      acceptedMoves: [...principal.moves],
      acceptedAlternatives: [],
      misconceptionMappings: [],
      feedbackTemplateIds: [
        'move-correct-independent', 'move-correct-guided', 'move-legal-unsuccessful',
        'move-invalid', 'retry-original-position'
      ],
      evidenceMapping: {
        independent: 'independent-success',
        guided: 'guided-success',
        transfer: position.role === 'transfer' ? 'transfer-success' : null,
        misconception: null,
        remediation: 'remediation-needed-after-two-unsuccessful'
      }
    }));
  }
  return Object.freeze(activities.sort((a, b) => a.activityId.localeCompare(b.activityId)));
}

export function validateRuntimeActivity(activity) {
  const errors = [];
  if (!activity || typeof activity !== 'object' || Array.isArray(activity)) return Object.freeze({ ok: false, errors: ['activity-required'] });
  if (!stableId(activity.activityId) || !stableId(activity.sourceLearningObjectId)) errors.push('invalid-activity-id');
  if (activity.schemaVersion !== ACTIVITY_SCHEMA_VERSION) errors.push('unsupported-activity-version');
  if (!ACTIVITY_TYPES.includes(activity.activityType)) errors.push('unsupported-activity-type');
  if (activity.responseType !== 'move' || activity.evaluatorType !== 'authored-san-exact-v1') errors.push('unsupported-evaluator');
  if (!Array.isArray(activity.acceptedMoves) || activity.acceptedMoves.length !== 1) errors.push('accepted-move-required');
  if (activity.acceptedAlternatives?.length) errors.push('unauthored-alternative');
  if (activity.misconceptionMappings?.length) errors.push('unauthored-misconception');
  if (hasHtml(activity.prompt) || hasHtml(activity.objective) || hasHtml(activity.position?.purpose)) errors.push('raw-html-rejected');
  try {
    const rules = ChessRulesFacade.fromFen(activity.position?.fen);
    if (rules.sideToMove() !== activity.position?.sideToMove) errors.push('side-to-move-mismatch');
    rules.move(activity.acceptedMoves?.[0]);
  } catch {
    errors.push('invalid-authored-move');
  }
  return Object.freeze({ ok: errors.length === 0, errors: Object.freeze([...new Set(errors)].sort()) });
}

export function evaluateReleasedMove(activity, {
  attemptId, sessionId, attemptNumber, response, hintLevel = 'none',
  startedAt, submittedAt, reviewContext = null
}) {
  const contract = validateRuntimeActivity(activity);
  if (!contract.ok) return immutable({ schemaVersion: EVALUATION_SCHEMA_VERSION, status: 'unavailable', accepted: false, errors: contract.errors });
  const baseAttempt = {
    schemaVersion: ATTEMPT_SCHEMA_VERSION,
    attemptId,
    sessionId,
    releaseId: activity.releaseId,
    unitId: activity.unitId,
    activityId: activity.activityId,
    attemptNumber,
    startedAt: new Date(startedAt).toISOString(),
    submittedAt: new Date(submittedAt).toISOString(),
    responseType: 'move',
    response: String(response ?? '').trim().slice(0, 16),
    hintLevel,
    reviewContext
  };
  if (!stableId(attemptId) || !stableId(sessionId) || !Number.isSafeInteger(attemptNumber) || attemptNumber < 1
    || !baseAttempt.response || !Number.isFinite(Date.parse(baseAttempt.startedAt))
    || !Number.isFinite(Date.parse(baseAttempt.submittedAt))) {
    return immutable({
      schemaVersion: EVALUATION_SCHEMA_VERSION, status: 'invalid-response', accepted: false,
      evaluatorType: activity.evaluatorType, feedbackTemplateId: 'move-invalid',
      evidenceCategory: null, retryAllowed: true, attempt: baseAttempt
    });
  }
  let played;
  try {
    const rules = ChessRulesFacade.fromFen(activity.position.fen);
    played = rules.move(baseAttempt.response);
  } catch {
    return immutable({
      schemaVersion: EVALUATION_SCHEMA_VERSION, status: 'invalid-response', accepted: false,
      evaluatorType: activity.evaluatorType, feedbackTemplateId: 'move-invalid',
      evidenceCategory: null, retryAllowed: true, attempt: baseAttempt
    });
  }
  const authored = ChessRulesFacade.fromFen(activity.position.fen).move(activity.acceptedMoves[0]);
  const accepted = played.from === authored.from && played.to === authored.to
    && (played.promotion ?? null) === (authored.promotion ?? null);
  const guided = hintLevel === 'final-answer';
  return immutable({
    schemaVersion: EVALUATION_SCHEMA_VERSION,
    status: accepted ? (guided ? 'successful-with-guidance' : 'successful') : 'unsuccessful',
    accepted,
    evaluatorType: activity.evaluatorType,
    feedbackTemplateId: accepted
      ? (guided ? 'move-correct-guided' : 'move-correct-independent')
      : 'move-legal-unsuccessful',
    evidenceCategory: accepted ? (guided ? 'guided-success' : activity.evidenceMapping.independent) : null,
    misconceptionCategory: null,
    remediationTarget: null,
    retryAllowed: !accepted && attemptNumber < activity.allowedAttempts,
    explanationAvailable: true,
    attempt: baseAttempt
  });
}

export function activityFeedback(result) {
  const messages = {
    'move-correct-independent': 'You found the authored move without answer-revealing help.',
    'move-correct-guided': 'You found the authored move after revealing help, so this counts as guided practice.',
    'move-legal-unsuccessful': 'That move is legal, but it does not match the authored move for this activity. Try again from the original position.',
    'move-invalid': 'That response is not a legal move from the original position.',
    'retry-original-position': 'Try again from the original position.'
  };
  return messages[result?.feedbackTemplateId] ?? 'This activity is unavailable.';
}
