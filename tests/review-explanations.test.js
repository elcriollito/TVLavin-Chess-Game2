import test from 'node:test';
import assert from 'node:assert/strict';
import {
  REVIEW_EXPLANATION_VERSION,
  deriveUnitReviewExplanation,
  validateReviewExplanation
} from '../js/learning/review-explanations.js';

const releaseId = `rel-${'a'.repeat(64)}`;
const unitId = 'ku:endgames:test:unit';
const remediationId = 'ku:endgames:test:foundation';
const at = index => new Date(Date.parse('2026-07-25T12:00:00.000Z') + index * 1000).toISOString();
const unit = {
  id: unitId,
  relationships: [{ type: 'remediation', targetId: remediationId, reason: 'Review the direct foundation first.' }],
  learningObjects: { assessments: [{ id: 'assessment:a' }] }
};
const event = (id, index, overrides = {}) => ({
  eventId: `event:${id}`, eventType: 'assessment-evaluated', occurredAt: at(index),
  releaseId, unitId, hintLevel: 'final-answer', ...overrides
});
const evidence = (id, index, overrides = {}) => ({
  evidenceId: `evidence:${id}`, releaseId, unitId, evidenceType: 'guided-success',
  sourceEventIds: [`event:${id}`], hintDependence: 'final-answer', attemptContext: index,
  createdAt: at(index), ...overrides
});
const derive = ({ evidence: records = [], events = [], dismissal = null, sourceUnit = unit } = {}) =>
  deriveUnitReviewExplanation({ unit: sourceUnit, releaseId, evidence: records, events, dismissal });

test('one opening or one hint request never creates a review', () => {
  assert.equal(derive({
    evidence: [evidence('open', 1, { evidenceType: 'exposure', hintDependence: 'none' })],
    events: [event('open', 1, { eventType: 'unit-opened', hintLevel: 'none' })]
  }), null);
  assert.equal(derive({
    evidence: [evidence('hint', 1, { evidenceType: 'participation', hintDependence: 'final-answer' })],
    events: [event('hint', 1, { eventType: 'hint-requested' })]
  }), null);
});

test('repeated final-hint dependence derives a deterministic, traceable explanation', () => {
  const records = [evidence('one', 1), evidence('two', 2)];
  const events = [event('one', 1), event('two', 2)];
  const first = derive({ evidence: records, events });
  const second = derive({ evidence: [...records].reverse(), events: [...events].reverse() });
  assert.equal(first.triggerType, 'repeated-final-hint-dependence');
  assert.equal(first.explanationId, second.explanationId);
  assert.deepEqual(first.supportingEvidenceIds, ['evidence:one', 'evidence:two']);
  assert.equal(first.schemaVersion, REVIEW_EXPLANATION_VERSION);
  assert.equal(first.status, 'suggested');
});

test('later independent assessment success resolves final-hint review', () => {
  const records = [
    evidence('one', 1), evidence('two', 2),
    evidence('success', 3, { evidenceType: 'assessment-success', hintDependence: 'none' })
  ];
  assert.equal(derive({ evidence: records, events: [
    event('one', 1), event('two', 2), event('success', 3, { hintLevel: 'none' })
  ] }), null);
});

test('guided success without independent success creates a bounded action', () => {
  const review = derive({ evidence: [evidence('one', 1)], events: [event('one', 1)] });
  assert.equal(review.triggerType, 'guided-success-without-independent-success');
  assert.equal(review.primaryAction, 'Practice independently');
});

test('assessment not attempted requires practice or two explored positions', () => {
  const practice = evidence('practice', 1, { evidenceType: 'participation', hintDependence: 'none' });
  const review = derive({
    evidence: [practice],
    events: [event('practice', 1, { eventType: 'coaching-prompt-advanced', hintLevel: 'none' })]
  });
  assert.equal(review.triggerType, 'assessment-not-yet-attempted');
  assert.equal(review.primaryAction, 'Try assessment');
});

test('one unsuccessful assessment is insufficient and two create review', () => {
  const one = evidence('one', 1, { evidenceType: 'remediation-needed', hintDependence: 'none' });
  const two = evidence('two', 2, { evidenceType: 'remediation-needed', hintDependence: 'none' });
  assert.equal(derive({ evidence: [one], events: [event('one', 1)] }), null);
  assert.equal(derive({ evidence: [one, two], events: [event('one', 1), event('two', 2)] }).triggerType, 'assessment-unsuccessful');
});

test('explicit misconception has highest priority', () => {
  const misconception = evidence('m', 3, { evidenceType: 'misconception', hintDependence: 'none' });
  const review = derive({
    evidence: [evidence('one', 1), evidence('two', 2), misconception],
    events: [event('one', 1), event('two', 2), event('m', 3)]
  });
  assert.equal(review.triggerType, 'misconception-evidence-present');
});

test('authored remediation target and reason are used without transitive inference', () => {
  const review = derive({
    evidence: [
      evidence('one', 1, { evidenceType: 'remediation-needed' }),
      evidence('two', 2, { evidenceType: 'remediation-needed' })
    ],
    events: [event('one', 1), event('two', 2)]
  });
  assert.equal(review.targetUnitId, remediationId);
  assert.equal(review.targetRelationshipType, 'remediation');
  assert.equal(review.targetRelationshipReason, 'Review the direct foundation first.');
});

test('same-unit fallback is used when no matching authored relationship exists', () => {
  const sourceUnit = { ...unit, relationships: [] };
  const review = derive({ sourceUnit, evidence: [evidence('one', 1)], events: [event('one', 1)] });
  assert.equal(review.targetUnitId, unitId);
  assert.equal(review.targetRelationshipType, 'same-unit');
});

test('dismissal hides the matching explanation but new evidence reopens it', () => {
  const records = [evidence('one', 1), evidence('two', 2)];
  const events = [event('one', 1), event('two', 2)];
  const initial = derive({ evidence: records, events });
  const dismissal = {
    explanationId: initial.explanationId, triggerType: initial.triggerType,
    unitId, releaseId, dismissedAt: at(3)
  };
  assert.equal(derive({ evidence: records, events, dismissal }).status, 'dismissed');
  const reopened = derive({
    evidence: [...records, evidence('three', 4)], events: [...events, event('three', 4)], dismissal
  });
  assert.equal(reopened.status, 'suggested');
});

test('validator accepts valid explanation and rejects missing evidence, HTML, target, and relationship', () => {
  const records = [evidence('one', 1), evidence('two', 2)];
  const review = derive({ evidence: records, events: [event('one', 1), event('two', 2)] });
  assert.equal(validateReviewExplanation(review, { evidence: records, unitIds: [unitId, remediationId] }).ok, true);
  assert.ok(validateReviewExplanation({ ...review, supportingEvidenceIds: ['evidence:missing'] }, { evidence: records, unitIds: [unitId, remediationId] }).errors.includes('missing-supporting-evidence'));
  assert.ok(validateReviewExplanation({ ...review, explanation: '<b>bad</b>' }, { evidence: records, unitIds: [unitId, remediationId] }).errors.includes('invalid-explanation'));
  assert.ok(validateReviewExplanation({ ...review, targetUnitId: 'ku:endgames:test:unknown' }, { evidence: records, unitIds: [unitId, remediationId] }).errors.includes('invalid-review-target'));
  assert.ok(validateReviewExplanation({ ...review, targetRelationshipType: 'ranking' }, { evidence: records, unitIds: [unitId, remediationId] }).errors.includes('unsupported-review-relationship'));
});

test('language is factual and excludes judgment, ranking, and mastery claims', () => {
  const review = derive({ evidence: [evidence('one', 1), evidence('two', 2)], events: [event('one', 1), event('two', 2)] });
  const learnerText = [review.title, review.explanation, review.observed, review.whyReviewMayHelp].join(' ');
  assert.doesNotMatch(learnerText, /\b(weak|bad|poor|rating|score|probability|mastered|completed|intelligence|talent)\b/i);
  assert.match(review.learnerNotice, /not a Mastery result/);
});

test('Guided Study UI exposes bounded learner controls without recommendation, Trainer, or AI writes', async () => {
  const { readFile } = await import('node:fs/promises');
  const html = await readFile(new URL('../endgame-trainer.html', import.meta.url), 'utf8');
  const page = await readFile(new URL('../js/endgame-trainer/endgame-trainer-page.js', import.meta.url), 'utf8');
  const store = await readFile(new URL('../js/learning/local-learning-store.js', import.meta.url), 'utf8');
  for (const copy of ['Review suggested', 'Review now', 'Dismiss for now', 'Restore review',
    'Clear evidence for this review', 'Why am I seeing this?', 'not a Mastery result']) assert.match(html, new RegExp(copy));
  assert.match(page, /deriveUnitReviewExplanation/);
  assert.match(page, /studyUnit=.*targetUnitId[\s\S]*release=.*model\.releaseId/);
  assert.match(page, /confirm\?\.\('Clear only the local evidence supporting this review\?'\)/);
  const reviewSlice = page.slice(page.indexOf('const renderReview'), page.indexOf('const renderLearningPreview'));
  assert.doesNotMatch(reviewSlice, /emitLearningEvent|recordTraining|getRecommendedLesson|createRecommendationSignal/);
  assert.doesNotMatch(store, /recordTraining|createEndgameProgressStore|rankRecommendation|OpenAI|Anthropic|Together/);
});
