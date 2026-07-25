import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  activityFeedback, deriveReleasedActivities, evaluateReleasedMove, validateRuntimeActivity
} from '../js/learning/released-activity-runtime.js';
import {
  createConsentState, createInteractionEvent, deriveEducationalEvidence, deriveLearnerProgress
} from '../js/learning/learning-progress-contracts.js';
import { ChessRulesFacade } from '../js/endgame-trainer/chess-rules-facade.js';

const releaseId = 'rel-58b238dfdda8f295fdab023cead6bf069aceefbee74a64a5cd71af2202480a84';
const releaseDir = path.join('knowledge', 'releases', releaseId, 'units');
const units = fs.readdirSync(releaseDir).filter(file => file.endsWith('.json'))
  .map(file => JSON.parse(fs.readFileSync(path.join(releaseDir, file), 'utf8')).unit);
const activities = units.flatMap(unit => deriveReleasedActivities(unit, releaseId));
const moveActivities = activities.filter(item => item.responseType === 'exact-move');
const choiceActivities = activities.filter(item => ['single-choice', 'plan-choice'].includes(item.responseType));

test('audits all 17 units and exposes 34 objectively evaluable activities', () => {
  assert.equal(units.length, 17);
  assert.equal(activities.length, 34);
  assert.equal(activities.filter(item => item.activityType === 'independent-practice').length, 17);
  assert.equal(activities.filter(item => item.activityType === 'assessment').length, 17);
  assert.ok(activities.every(item => validateRuntimeActivity(item).ok));
  assert.ok(activities.filter(item => item.acceptedAlternatives.length).length >= 2);
  assert.ok(activities.filter(item => item.misconceptionMappings.length).length >= 12);
});

test('legacy learning objects remain readable beside item-level assessment contracts', () => {
  const square = units.find(unit => unit.id.endsWith(':rule-of-the-square'));
  assert.equal(deriveReleasedActivities(square, releaseId).length, 2);
  assert.equal(units.flatMap(unit => unit.learningObjects.assessments).length, 16);
  assert.ok(units.flatMap(unit => unit.learningObjects.assessments)
    .every(item => !('positionId' in item) && !('expectedAnswer' in item)));
});

test('correct authored SAN succeeds independently and deterministically', () => {
  const activity = moveActivities[0];
  const input = {
    attemptId: 'attempt:one', sessionId: 'session:one', attemptNumber: 1,
    response: activity.acceptedMoves[0], hintLevel: 'none',
    startedAt: '2026-07-25T12:00:00.000Z', submittedAt: '2026-07-25T12:01:00.000Z'
  };
  const first = evaluateReleasedMove(activity, input);
  const second = evaluateReleasedMove(activity, input);
  assert.deepEqual(first, second);
  assert.equal(first.status, 'successful');
  assert.equal(first.evidenceCategory, 'independent-success');
});

test('final answer reveal produces guided rather than independent success', () => {
  const activity = moveActivities[0];
  const result = evaluateReleasedMove(activity, {
    attemptId: 'attempt:guided', sessionId: 'session:one', attemptNumber: 1,
    response: activity.acceptedMoves[0], hintLevel: 'final-answer',
    startedAt: 1784995200000, submittedAt: 1784995260000
  });
  assert.equal(result.status, 'successful-with-guidance');
  assert.equal(result.evidenceCategory, 'guided-success');
  assert.match(activityFeedback(result), /guided practice/i);
});

test('illegal response is invalid and legal unauthored move is unsuccessful', () => {
  const activity = moveActivities[0];
  const base = {
    attemptId: 'attempt:wrong', sessionId: 'session:one', attemptNumber: 1,
    hintLevel: 'none', startedAt: 1784995200000, submittedAt: 1784995260000
  };
  assert.equal(evaluateReleasedMove(activity, { ...base, response: 'Qh9' }).status, 'invalid-response');
  const wrongMove = ChessRulesFacade.fromFen(activity.position.fen).legalMoves()
    .find(move => !activity.acceptedMoves.includes(move));
  const wrong = evaluateReleasedMove(activity, { ...base, response: wrongMove });
  assert.equal(wrong.status, 'unsuccessful');
  assert.equal(wrong.evidenceCategory, null);
});

test('activity contract rejects HTML and illegal alternatives', () => {
  const html = structuredClone(moveActivities[0]); html.prompt = '<img onerror=alert(1)>';
  assert.ok(validateRuntimeActivity(html).errors.includes('raw-html-rejected'));
  const alternatives = structuredClone(moveActivities[0]); alternatives.acceptedMoves.push('Qh9');
  assert.ok(validateRuntimeActivity(alternatives).errors.includes('invalid-authored-move'));
});

test('trusted evaluative event derives independent or guided evidence', () => {
  const activity = moveActivities[0];
  const context = {
    releaseId, unitIds: [activity.unitId], positionIds: [activity.position.id],
    learningObjectIds: [activity.sourceLearningObjectId], assessmentItemIds: []
  };
  const event = createInteractionEvent({
    eventId: 'event:activity', eventType: 'activity-evaluated', occurredAt: 1784995260000,
    sessionId: 'session:one', releaseId, unitId: activity.unitId,
    learningObjectId: activity.sourceLearningObjectId, positionId: activity.position.id,
    attemptNumber: 1, hintLevel: 'none', responseType: 'move', result: 'correct',
    consentState: 'local-progress-enabled', persistenceEligible: true
  }, context);
  const evidence = deriveEducationalEvidence([event], context);
  assert.equal(evidence[0].evidenceType, 'independent-success');
  assert.equal(createConsentState().state, 'unknown');
});

test('two ordinary unsuccessful attempts create remediation, never misconception', () => {
  const activity = moveActivities[0];
  const context = {
    releaseId, unitIds: [activity.unitId], positionIds: [activity.position.id],
    learningObjectIds: [activity.sourceLearningObjectId], assessmentItemIds: []
  };
  const events = [1, 2].map(number => createInteractionEvent({
    eventId: `event:wrong-${number}`, eventType: 'activity-evaluated',
    occurredAt: 1784995200000 + number * 1000, sessionId: 'session:one',
    releaseId, unitId: activity.unitId, learningObjectId: activity.sourceLearningObjectId,
    positionId: activity.position.id, attemptNumber: number, hintLevel: 'none',
    responseType: 'move', result: 'incorrect', consentState: 'unknown',
    persistenceEligible: false
  }, context));
  const evidence = deriveEducationalEvidence(events, context);
  assert.deepEqual(evidence.map(item => item.evidenceType), ['remediation-needed']);
  assert.ok(evidence.every(item => item.evidenceType !== 'misconception'));
});

test('transfer is never inferred from position difference', () => {
  assert.equal(activities.filter(activity => activity.transfer).length, 4);
  assert.ok(units.flatMap(unit => unit.positions).filter(position => position.role === 'transfer').length === 2);
});

test('choice assessment accepts stable ID and maps only explicit misconception choice', () => {
  const activity = choiceActivities.find(item => item.misconceptionMappings.length);
  const base = {
    attemptId: 'attempt:choice', sessionId: 'session:choice', attemptNumber: 1,
    hintLevel: 'none', startedAt: 1784995200000, submittedAt: 1784995260000
  };
  const success = evaluateReleasedMove(activity, { ...base, response: activity.expectedChoiceId });
  assert.equal(success.evidenceCategory, 'assessment-success');
  const mapping = activity.misconceptionMappings[0];
  const misconception = evaluateReleasedMove(activity, { ...base, response: mapping.responseId });
  assert.equal(misconception.evidenceCategory, 'misconception');
  assert.equal(misconception.misconceptionCategory, mapping.misconceptionId);
  assert.equal(evaluateReleasedMove(activity, { ...base, response: '__proto__' }).status, 'invalid-response');
});

test('assessment evidence resolves its explicitly mapped misconception', () => {
  const activity = choiceActivities.find(item => item.misconceptionMappings.length);
  const misconceptionId = activity.misconceptionMappings[0].misconceptionId;
  assert.ok(activity.resolutionMisconceptionIds.includes(misconceptionId));
  const context = {
    releaseId, unitIds: [activity.unitId], positionIds: [activity.position.id],
    learningObjectIds: [activity.sourceLearningObjectId],
    assessmentItemIds: [activity.sourceLearningObjectId]
  };
  const event = (eventId, occurredAt, result) => createInteractionEvent({
    eventId, eventType: 'assessment-evaluated', occurredAt, sessionId: 'session:resolution',
    releaseId, unitId: activity.unitId, learningObjectId: activity.sourceLearningObjectId,
    assessmentItemId: activity.sourceLearningObjectId, positionId: activity.position.id,
    attemptNumber: result === 'incorrect' ? 1 : 2, hintLevel: 'none', responseType: 'choice',
    result, misconceptionId, consentState: 'unknown', persistenceEligible: false
  }, context);
  const events = [
    event('event:misconception', 1784995200000, 'incorrect'),
    event('event:resolution', 1784995260000, 'correct')
  ];
  const evidence = deriveEducationalEvidence(events, context);
  assert.deepEqual(evidence.map(item => item.evidenceType), ['misconception', 'assessment-success']);
  assert.equal(deriveLearnerProgress({
    unitId: activity.unitId, releaseId, events, evidence, consent: createConsentState()
  }).state, 'assessed');
});

test('explicit transfer flag produces transfer evidence through the event pipeline', () => {
  const activity = activities.find(item => item.transfer && item.activityType === 'independent-practice');
  const context = {
    releaseId, unitIds: [activity.unitId], positionIds: [activity.position.id],
    learningObjectIds: [activity.sourceLearningObjectId], assessmentItemIds: []
  };
  const event = createInteractionEvent({
    eventId: 'event:transfer', eventType: 'activity-evaluated', occurredAt: 1784995260000,
    sessionId: 'session:transfer', releaseId, unitId: activity.unitId,
    learningObjectId: activity.sourceLearningObjectId, positionId: activity.position.id,
    attemptNumber: 1, hintLevel: 'none', responseType: activity.responseType === 'exact-move' ? 'move' : 'choice',
    result: 'correct', transfer: true, consentState: 'unknown', persistenceEligible: false
  }, context);
  assert.equal(deriveEducationalEvidence([event], context)[0].evidenceType, 'transfer-success');
});

test('accepted move alternatives are explicit and accepted without engine inference', () => {
  for (const activity of moveActivities.filter(item => item.acceptedAlternatives.length)) {
    for (const alternative of activity.acceptedAlternatives) {
      const result = evaluateReleasedMove(activity, {
        attemptId: `attempt:${activity.activityId.split(':').at(-1)}`,
        sessionId: 'session:alternative', attemptNumber: 1, response: alternative,
        hintLevel: 'none', startedAt: 1784995200000, submittedAt: 1784995260000
      });
      assert.equal(result.accepted, true);
    }
  }
});

test('learner-facing UI exposes practice and bounded unavailable assessment copy', () => {
  const html = fs.readFileSync('endgame-trainer.html', 'utf8');
  const page = fs.readFileSync('js/endgame-trainer/endgame-trainer-page.js', 'utf8');
  assert.match(html, /Independent Practice/);
  assert.match(html, /No assessment is shown unless released content/);
  assert.match(html, /Practice evidence is not Mastery/);
  assert.match(page, /activity-evaluated/);
  assert.doesNotMatch(page, /recommendationEngine|trainingMemory.*activity/i);
});
