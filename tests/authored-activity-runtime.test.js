import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  activityFeedback, deriveReleasedActivities, evaluateReleasedMove, validateRuntimeActivity
} from '../js/learning/released-activity-runtime.js';
import {
  createConsentState, createInteractionEvent, deriveEducationalEvidence
} from '../js/learning/learning-progress-contracts.js';

const releaseId = 'rel-a26763c6382b7878595ed8ae0da603c4679bf906e4357fdb406952db5867e2e1';
const releaseDir = path.join('knowledge', 'releases', releaseId, 'units');
const units = fs.readdirSync(releaseDir).filter(file => file.endsWith('.json'))
  .map(file => JSON.parse(fs.readFileSync(path.join(releaseDir, file), 'utf8')).unit);
const activities = units.flatMap(unit => deriveReleasedActivities(unit, releaseId));

test('audits all 17 units and exposes only three objectively evaluable activities', () => {
  assert.equal(units.length, 17);
  assert.equal(activities.length, 3);
  assert.deepEqual(activities.map(item => item.unitId).sort(), [
    'ku:endgames:pawn-foundations:convert-with-king-support',
    'ku:endgames:pawn-foundations:key-squares',
    'ku:endgames:pawn-weaknesses:fix-pawn-weakness'
  ]);
  assert.ok(activities.every(item => validateRuntimeActivity(item).ok));
  assert.ok(activities.every(item => item.acceptedAlternatives.length === 0 && item.misconceptionMappings.length === 0));
});

test('unsupported textual and assessment objects remain read-only', () => {
  const square = units.find(unit => unit.id.endsWith(':rule-of-the-square'));
  assert.deepEqual(deriveReleasedActivities(square, releaseId), []);
  assert.equal(units.flatMap(unit => unit.learningObjects.assessments).length, 16);
  assert.ok(units.flatMap(unit => unit.learningObjects.assessments)
    .every(item => !('positionId' in item) && !('expectedAnswer' in item)));
});

test('correct authored SAN succeeds independently and deterministically', () => {
  const activity = activities[0];
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
  const activity = activities[0];
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
  const activity = activities[0];
  const base = {
    attemptId: 'attempt:wrong', sessionId: 'session:one', attemptNumber: 1,
    hintLevel: 'none', startedAt: 1784995200000, submittedAt: 1784995260000
  };
  assert.equal(evaluateReleasedMove(activity, { ...base, response: 'Qh9' }).status, 'invalid-response');
  const wrong = evaluateReleasedMove(activity, { ...base, response: 'e5' });
  assert.equal(wrong.status, 'unsuccessful');
  assert.equal(wrong.evidenceCategory, null);
});

test('activity contract rejects HTML and unauthored alternatives', () => {
  const html = structuredClone(activities[0]); html.prompt = '<img onerror=alert(1)>';
  assert.ok(validateRuntimeActivity(html).errors.includes('raw-html-rejected'));
  const alternatives = structuredClone(activities[0]); alternatives.acceptedAlternatives = ['e5'];
  assert.ok(validateRuntimeActivity(alternatives).errors.includes('unauthored-alternative'));
});

test('trusted evaluative event derives independent or guided evidence', () => {
  const activity = activities[0];
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
  const activity = activities[0];
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
  assert.ok(activities.every(activity => activity.transfer === false));
  assert.ok(units.flatMap(unit => unit.positions).filter(position => position.role === 'transfer').length === 2);
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
