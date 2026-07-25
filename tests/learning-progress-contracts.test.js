import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  canPersistLearningCategory,
  createConsentState,
  createInteractionEvent,
  createRecommendationSignal,
  deriveEducationalEvidence,
  deriveLearnerProgress,
  validateConsentState,
  validateEvidenceRecord,
  validateInteractionEvent,
  validateInteractionEvents,
  validateLearnerProgress
} from '../js/learning/learning-progress-contracts.js';
import { createGuidedStudyEventSession } from '../js/learning/guided-study-event-session.js';

const releaseId = 'rel-a26763c6382b7878595ed8ae0da603c4679bf906e4357fdb406952db5867e2e1';
const unitId = 'ku:endgames:pawn-exchanges:exchange-into-passer';
const positionId = 'pos:exchange-passer:create';
const assessmentItemId = 'assessment:exchange-passer:three-of-four';
const context = {
  releaseId,
  unitIds: [unitId],
  positionIds: [positionId],
  learningObjectIds: ['guided:exchange-passer:orders', assessmentItemId],
  assessmentItemIds: [assessmentItemId]
};
let sequence = 0;
const event = (eventType, detail = {}) => createInteractionEvent({
  eventId: `event:test-${++sequence}`,
  eventType,
  occurredAt: 1000 + sequence,
  sessionId: 'study-session-1',
  releaseId,
  unitId,
  consentState: 'unknown',
  persistenceEligible: false,
  ...detail
}, context);

test('consent states are explicit, versioned, scoped, and timestamp-consistent', () => {
  const unknown = createConsentState();
  const declined = createConsentState({ state: 'declined', occurredAt: 2000 });
  const enabled = createConsentState({ state: 'local-progress-enabled', occurredAt: 3000 });
  assert.equal(validateConsentState(unknown).ok, true);
  assert.equal(validateConsentState(declined).ok, true);
  assert.equal(validateConsentState(enabled).ok, true);
  assert.equal(canPersistLearningCategory(unknown, 'progress-summary'), false);
  assert.equal(canPersistLearningCategory(declined, 'progress-summary'), false);
  assert.equal(canPersistLearningCategory(enabled, 'progress-summary'), true);
  assert.equal(validateConsentState({ ...enabled, grantedAt: null }).ok, false);
});

test('revocation blocks future eligibility and carries explicit clear choice', () => {
  const session = createGuidedStudyEventSession({
    releaseId, unitId, positionIds: [positionId], sessionId: 'study-session-2',
    now: () => 4000, idFactory: (() => { let id = 0; return () => `revocation-${++id}`; })()
  });
  session.enablePreview();
  session.emit('unit-opened');
  const revoked = session.revokeAndClear();
  assert.equal(revoked.consent.state, 'declined');
  assert.equal(revoked.consent.clearData, true);
  assert.equal(revoked.events.length, 0);
  assert.equal(session.emit('unit-opened').persistenceEligible, false);
});

test('Guided Study use and sign-in-like data never imply consent', () => {
  const session = createGuidedStudyEventSession({
    releaseId, unitId, sessionId: 'study-session-3',
    now: () => 5000, idFactory: () => 'implicit-consent-check'
  });
  assert.equal(session.emit('unit-opened').consentState, 'unknown');
  assert.equal(session.snapshot().consent.state, 'unknown');
  assert.equal(session.snapshot().persisted, false);
});

test('valid events carry stable released context and privacy fields', () => {
  const value = event('position-selected', { positionId });
  assert.equal(validateInteractionEvent(value, context).ok, true);
  assert.equal(value.releaseId, releaseId);
  assert.equal(value.unitId, unitId);
  assert.equal(value.localOnly, true);
  assert.equal(value.dataMinimization, 'stable-references-only');
});

test('event validation rejects invalid vocabulary, release, unit, position and payload fields deterministically', () => {
  const valid = event('unit-opened');
  const mutations = [
    { ...valid, eventType: 'hovered' },
    { ...valid, releaseId: 'rel-wrong' },
    { ...valid, unitId: 'ku:endgames:unknown:unit' },
    { ...valid, positionId: 'pos:unknown' },
    { ...valid, arbitraryText: 'copied lesson prose' }
  ];
  for (const value of mutations) assert.equal(validateInteractionEvent(value, context).ok, false);
  assert.deepEqual(validateInteractionEvent(mutations[0], context), validateInteractionEvent(mutations[0], context));
});

test('event sets reject duplicate IDs', () => {
  const value = event('unit-opened');
  assert.deepEqual(validateInteractionEvents([value, value], context).errors, ['duplicate-event-id']);
});

test('exposure interactions never become strong mastery evidence', () => {
  for (const type of ['unit-opened', 'explanation-viewed', 'position-selected']) {
    const source = event(type, type === 'position-selected' ? { positionId } : {});
    const evidence = deriveEducationalEvidence([source], context);
    assert.equal(evidence[0].evidenceType, 'exposure');
    assert.equal(validateEvidenceRecord(evidence[0], [source]).ok, true);
    assert.match(evidence[0].explanation, /does not demonstrate mastery/i);
  }
});

test('requesting a hint creates participation, not negative evidence', () => {
  const source = event('hint-requested', { hintLevel: 'concept' });
  const evidence = deriveEducationalEvidence([source], context);
  assert.equal(evidence[0].evidenceType, 'participation');
  assert.match(evidence[0].explanation, /not a failure/i);
});

test('final-answer help prevents independent success while preserving traceability', () => {
  const source = event('assessment-evaluated', {
    assessmentItemId, hintLevel: 'final-answer', result: 'correct', attemptNumber: 2
  });
  const evidence = deriveEducationalEvidence([source], context);
  assert.equal(evidence[0].evidenceType, 'guided-success');
  assert.deepEqual(evidence[0].sourceEventIds, [source.eventId]);
  assert.match(evidence[0].explanation, /rather than independent/i);
});

test('authored assessment success can produce assessment evidence without marking mastery', () => {
  const source = event('assessment-evaluated', {
    assessmentItemId, hintLevel: 'none', result: 'correct', attemptNumber: 1
  });
  const evidence = deriveEducationalEvidence([source], context);
  assert.equal(evidence[0].evidenceType, 'assessment-success');
  assert.equal(validateEvidenceRecord(evidence[0], [source]).ok, true);
  assert.equal('mastered' in evidence[0], false);
});

test('progress transitions are deterministic and never contain mastery or completion', () => {
  const opened = event('unit-opened');
  const prompt = event('coaching-prompt-advanced', { promptStage: 1 });
  const assessed = event('assessment-evaluated', {
    assessmentItemId, hintLevel: 'none', result: 'correct', attemptNumber: 1
  });
  const consent = createConsentState();
  const derive = events => {
    const evidence = deriveEducationalEvidence(events, context);
    return deriveLearnerProgress({ unitId, releaseId, events, evidence, consent });
  };
  assert.equal(derive([]).state, 'not-started');
  assert.equal(derive([opened]).state, 'explored');
  assert.equal(derive([opened, prompt]).state, 'practicing');
  assert.equal(derive([opened, prompt, assessed]).state, 'assessed');
  const progress = derive([opened, prompt, assessed]);
  assert.equal('mastery' in progress, false);
  assert.equal('completed' in progress, false);
  assert.equal(validateLearnerProgress(progress, consent).ok, true);
});

test('recommendation signals require evidence and an explanation but do not rank', () => {
  const source = event('assessment-evaluated', { assessmentItemId, result: 'incorrect' });
  const evidence = deriveEducationalEvidence([source], context)[0];
  const signal = createRecommendationSignal({
    type: 'revisit-misconception', sourceEvidence: evidence, targetUnitId: unitId,
    explanation: 'Review the released capture-order concept before another assessment.'
  });
  assert.deepEqual(signal.sourceEvidenceIds, [evidence.evidenceId]);
  assert.equal('rank' in signal, false);
  assert.throws(() => createRecommendationSignal({ type: 'continue-current-unit', targetUnitId: unitId }), /invalid/);
  assert.throws(() => createRecommendationSignal({
    type: 'continue-current-unit', sourceEvidence: { evidenceId: 'raw-click' },
    targetUnitId: unitId, explanation: 'A raw click is not evidence.'
  }), /invalid/);
});

test('Guided Study session validates events in memory and never exposes persistence', () => {
  let id = 0;
  const session = createGuidedStudyEventSession({
    releaseId, unitId, positionIds: [positionId], sessionId: 'study-session-4',
    now: () => 6000 + id, idFactory: () => `memory-${++id}`
  });
  session.emit('study-session-started');
  session.emit('position-selected', { positionId });
  session.emit('coaching-prompt-advanced', { promptStage: 1 });
  session.emit('return-to-library');
  const snapshot = session.snapshot();
  assert.equal(snapshot.events.length, 4);
  assert.equal(snapshot.persisted, false);
  assert.equal(snapshot.progress.state, 'practicing');
});

test('production integration has no learning store, Training Memory write, AI call, or authored import', () => {
  const contracts = fs.readFileSync(new URL('../js/learning/learning-progress-contracts.js', import.meta.url), 'utf8');
  const session = fs.readFileSync(new URL('../js/learning/guided-study-event-session.js', import.meta.url), 'utf8');
  const page = fs.readFileSync(new URL('../js/endgame-trainer/endgame-trainer-page.js', import.meta.url), 'utf8');
  const guidedSlice = page.slice(page.indexOf('async function initializeLibraryStudy'), page.indexOf('function sessionEntry'));
  for (const source of [contracts, session]) {
    assert.doesNotMatch(source, /localStorage|indexedDB|fetch\(|knowledge\/domains|OpenAI|Anthropic|Together/);
  }
  assert.doesNotMatch(guidedSlice, /recordSession|recordTraining|recordCurriculum|masteryFor|getRecommendedLesson|localStorage/);
});

test('learner-facing controls are optional, transparent, and outside Play Game Options', () => {
  const html = fs.readFileSync(new URL('../endgame-trainer.html', import.meta.url), 'utf8');
  assert.match(html, /Enable progress preview/);
  assert.match(html, /Not now/);
  assert.match(html, /Learn more/);
  assert.match(html, /does not count as mastery/);
  assert.match(html, /does not persist these events/);
  assert.doesNotMatch(fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8'), /data-learning-consent/);
});
