import { ChessRulesFacade } from '../endgame-trainer/chess-rules-facade.js';

export const ACTIVITY_SCHEMA_VERSION = '1.0.0';
export const ATTEMPT_SCHEMA_VERSION = '1.0.0';
export const EVALUATION_SCHEMA_VERSION = '1.0.0';
export const ACTIVITY_TYPES = Object.freeze(['independent-practice', 'assessment']);
export const RESPONSE_TYPES = Object.freeze(['exact-move', 'single-choice', 'plan-choice']);
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
  if (!unit || unit.status !== 'published' || !['1.0.0', '1.1.0'].includes(unit.schemaVersion)) return Object.freeze([]);
  if (unit.schemaVersion === '1.1.0' && Array.isArray(unit.activityItems)) {
    return Object.freeze(unit.activityItems.map(item => {
      const position = unit.positions.find(candidate => candidate.id === item.positionId);
      return immutable({
        activityId: item.id,
        schemaVersion: ACTIVITY_SCHEMA_VERSION,
        releaseId,
        unitId: unit.id,
        sourceLearningObjectId: item.sourceLearningObjectId,
        activityType: item.activityType,
        objective: item.objective,
        masteryCriterionIds: [],
        expectedConcepts: [...(position?.expectedConcepts ?? [])],
        transfer: Boolean(item.transfer),
        remediation: false,
        position: {
          id: position.id, fen: position.fen, sideToMove: position.sideToMove,
          orientation: position.sideToMove, purpose: position.principalIdeas?.[0]?.purpose ?? item.objective
        },
        title: item.title,
        prompt: item.instruction,
        responseType: item.responseType,
        allowedAttempts: item.attemptPolicy.maximumAttempts,
        hintPolicy: item.hintPolicy,
        retryPolicy: item.retryPolicy,
        evaluatorType: item.answer.evaluatorType,
        acceptedMoves: item.responseType === 'exact-move'
          ? [item.answer.expected, ...item.answer.acceptedAlternatives] : [],
        acceptedAlternatives: [...item.answer.acceptedAlternatives],
        choices: clone(item.answer.choices ?? []),
        expectedChoiceId: item.responseType === 'exact-move' ? null : item.answer.expected,
        misconceptionMappings: clone(item.answer.misconceptionMappings),
        resolutionMisconceptionIds: item.answer.misconceptionMappings
          .filter(mapping => mapping.resolutionActivityId === item.id)
          .map(mapping => mapping.misconceptionId),
        feedback: clone(item.feedback),
        evidenceMapping: clone(item.evidence)
      });
    }).sort((a, b) => a.activityId.localeCompare(b.activityId)));
  }
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
      responseType: 'exact-move',
      allowedAttempts: 3,
      hintPolicy: 'answer-reveal-on-request',
      retryPolicy: 'reset-position',
      evaluatorType: 'authored-san-exact-v1',
      acceptedMoves: [...principal.moves],
      acceptedAlternatives: [],
      misconceptionMappings: [],
      resolutionMisconceptionIds: [],
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
  if (!RESPONSE_TYPES.includes(activity.responseType)) errors.push('unsupported-response-type');
  if (activity.responseType === 'exact-move' && (!Array.isArray(activity.acceptedMoves) || !activity.acceptedMoves.length)) errors.push('accepted-move-required');
  if (['single-choice', 'plan-choice'].includes(activity.responseType)
    && (!Array.isArray(activity.choices) || activity.choices.length < 2
      || !activity.choices.some(choice => choice.id === activity.expectedChoiceId))) errors.push('choice-contract-required');
  const authoredText = [
    activity.title, activity.prompt, activity.objective, activity.position?.purpose,
    ...(activity.choices ?? []).map(choice => choice?.label),
    ...Object.values(activity.feedback ?? {}).filter(value => typeof value === 'string')
  ];
  if (authoredText.some(hasHtml)) errors.push('raw-html-rejected');
  try {
    const rules = ChessRulesFacade.fromFen(activity.position?.fen);
    if (rules.sideToMove() !== activity.position?.sideToMove) errors.push('side-to-move-mismatch');
    if (activity.responseType === 'exact-move') {
      for (const move of activity.acceptedMoves) {
        const candidate = ChessRulesFacade.fromFen(activity.position.fen);
        candidate.move(move);
      }
    }
  } catch {
    errors.push('invalid-authored-move');
  }
  return Object.freeze({ ok: errors.length === 0, errors: Object.freeze([...new Set(errors)].sort()) });
}

export function evaluateReleasedResponse(activity, {
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
    responseType: activity.responseType,
    response: String(response ?? '').trim().slice(0, activity.responseType === 'exact-move' ? 16 : 160),
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
  if (['single-choice', 'plan-choice'].includes(activity.responseType)) {
    const choice = activity.choices.find(item => item.id === baseAttempt.response);
    if (!choice) {
      return immutable({
        schemaVersion: EVALUATION_SCHEMA_VERSION, status: 'invalid-response', accepted: false,
        evaluatorType: activity.evaluatorType, feedbackTemplateId: 'choice-invalid',
        feedback: activity.feedback.invalid, evidenceCategory: null, retryAllowed: true, attempt: baseAttempt
      });
    }
    const accepted = choice.id === activity.expectedChoiceId;
    const mapping = activity.misconceptionMappings.find(item => item.responseId === choice.id) ?? null;
    const guided = hintLevel === 'final-answer';
    return immutable({
      schemaVersion: EVALUATION_SCHEMA_VERSION,
      status: accepted ? (guided ? 'successful-with-guidance' : 'successful') : 'unsuccessful',
      accepted, evaluatorType: activity.evaluatorType,
      feedbackTemplateId: accepted ? (guided ? 'choice-correct-guided' : 'choice-correct') : mapping ? 'choice-misconception' : 'choice-unsuccessful',
      feedback: accepted ? (guided ? activity.feedback.guided : activity.feedback.correct)
        : mapping ? activity.feedback.misconception : activity.feedback.unsuccessful,
      evidenceCategory: accepted
        ? (guided ? 'guided-success' : activity.evidenceMapping.independentSuccess) : mapping ? 'misconception' : null,
      misconceptionCategory: mapping?.misconceptionId ?? null,
      remediationTarget: null,
      retryAllowed: !accepted && attemptNumber < activity.allowedAttempts,
      explanationAvailable: true, attempt: baseAttempt
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
  const accepted = activity.acceptedMoves.some(move => {
    const authored = ChessRulesFacade.fromFen(activity.position.fen).move(move);
    return played.from === authored.from && played.to === authored.to
      && (played.promotion ?? null) === (authored.promotion ?? null);
  });
  const guided = hintLevel === 'final-answer';
  return immutable({
    schemaVersion: EVALUATION_SCHEMA_VERSION,
    status: accepted ? (guided ? 'successful-with-guidance' : 'successful') : 'unsuccessful',
    accepted,
    evaluatorType: activity.evaluatorType,
    feedbackTemplateId: accepted
      ? (guided ? 'move-correct-guided' : 'move-correct-independent')
      : 'move-legal-unsuccessful',
    feedback: accepted ? (guided ? activity.feedback?.guided : activity.feedback?.correct)
      : activity.feedback?.unsuccessful,
    evidenceCategory: accepted ? (guided ? 'guided-success'
      : activity.transfer ? 'transfer-success' : activity.activityType === 'assessment'
        ? 'assessment-success' : 'independent-success') : null,
    misconceptionCategory: null,
    remediationTarget: null,
    retryAllowed: !accepted && attemptNumber < activity.allowedAttempts,
    explanationAvailable: true,
    attempt: baseAttempt
  });
}

export const evaluateReleasedMove = evaluateReleasedResponse;

export function activityFeedback(result) {
  const messages = {
    'move-correct-independent': 'You found the authored move without answer-revealing help.',
    'move-correct-guided': 'You found the authored move after revealing help, so this counts as guided practice.',
    'move-legal-unsuccessful': 'That move is legal, but it does not match the authored move for this activity. Try again from the original position.',
    'move-invalid': 'That response is not a legal move from the original position.',
    'retry-original-position': 'Try again from the original position.'
  };
  return result?.feedback ?? messages[result?.feedbackTemplateId] ?? 'This activity is unavailable.';
}
