import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const files = ['play-analytics-contracts.js', 'play-analytics-privacy-policy.js',
    'play-analytics-dispatcher.js', 'play-mentor-engagement-analytics.js'];
function load() { const window = {}; files.forEach(file => vm.runInNewContext(
    fs.readFileSync(`js/play/analytics/${file}`, 'utf8'), { window, globalThis: window })); return window; }

test('Mentor engagement contracts publish exact frozen IDs, fields, and category dictionaries', () => {
    const C = load().CaissaPlayAnalyticsContracts;
    assert.deepEqual([...C.MENTOR_EVENT_IDS], ['play_mentor_review_requested', 'play_mentor_review_ready',
        'play_mentor_review_failed', 'play_mentor_critical_moments_opened', 'play_mentor_guided_replay_started',
        'play_mentor_replay_attempted', 'play_mentor_reference_revealed', 'play_mentor_knowledge_opened',
        'play_mentor_summary_requested', 'play_mentor_summary_ready', 'play_mentor_summary_failed', 'play_mentor_exited']);
    assert.deepEqual([...C.MENTOR_PAYLOAD_KEYS], ['engagement', 'stage', 'state', 'attemptCategory',
        'conceptCategory', 'source', 'failureReason', 'qaEligible', 'productionEligible',
        'completionSequence', 'engagementSequence', 'shellVersion']);
    for (const dictionary of [C.MENTOR_ENGAGEMENTS, C.MENTOR_STAGES, C.MENTOR_STATES,
        C.ATTEMPT_CATEGORIES, C.CONCEPT_CATEGORIES, C.MENTOR_SOURCES, C.MENTOR_FAILURE_REASONS])
        assert(Object.isFrozen(dictionary));
});

test('all twelve observer events emit exact categorical payloads without content', () => {
    const w = load(); const A = w.CaissaPlayMentorEngagementAnalytics;
    const calls = [['observeReviewRequested'], ['observeReviewReady'],
        ['observeReviewFailed', { failureReason: 'analysis-unavailable' }], ['observeCriticalMomentsOpened'],
        ['observeGuidedReplayStarted'], ['observeReplayAttempted', { attemptCategory: 'accepted' }],
        ['observeReferenceRevealed'], ['observeKnowledgeOpened', { conceptCategory: 'opposition' }],
        ['observeSummaryRequested'], ['observeSummaryReady'],
        ['observeSummaryFailed', { failureReason: 'summary-unavailable' }], ['observeExited']];
    calls.forEach(([method, extra], index) => assert.equal(A[method]({ completionSequence: 7,
        dedupKey: `case-${index}`, ...extra }), true));
    const events = w.CaissaPlayAnalytics.getSnapshot({ qa: true, includeEvents: true }).events;
    assert.equal(events.length, 12); assert(events.every(event => event.category === 'play-mentor'));
    assert(events.every(event => w.CaissaPlayAnalyticsContracts.validateMentorPayload(event.payload)));
    assert.equal(events[5].payload.attemptCategory, 'accepted');
    assert.equal(events[7].payload.conceptCategory, 'opposition');
    assert.doesNotMatch(JSON.stringify(events), /(?:fen|pgn|san|uci|square|prompt|explanation|summaryText|knowledgeUnitId|sessionId|mentorId)/i);
});

test('unknown concepts fail closed and duplicate, stale, bounded, and disposal paths are isolated', () => {
    const w = load(); const A = w.CaissaPlayMentorEngagementAnalytics;
    assert.equal(A.conceptCategory('opposition-v2'), 'unknown');
    assert(A.observeReviewRequested({ completionSequence: 1 }));
    assert.equal(A.observeReviewRequested({ completionSequence: 1 }), false);
    assert.equal(A.observeReviewReady({ completionSequence: 1, stale: true }), false);
    for (let index = 0; index < 14; index += 1) A.observeReplayAttempted({
        completionSequence: 1, attemptCategory: 'rejected', dedupKey: `attempt-${index}` });
    const snapshot = A.inspect(); assert.equal(snapshot.activeRecords, 12);
    assert.equal(snapshot.diagnostics.duplicatesSuppressed, 1);
    assert.equal(snapshot.diagnostics.staleOutcomesIgnored, 1);
    assert(snapshot.diagnostics.recordsEvicted > 0);
    assert.equal(A.dispose().disposed, true);
    assert.equal(A.observeExited({ completionSequence: 1 }), false);
});

test('Mentor privacy explicitly denies answer, prose, evidence, identity, and exact behavior fields', () => {
    const P = load().CaissaPlayAnalyticsPrivacyPolicy;
    for (const key of ['mentorId', 'reviewId', 'replaySessionId', 'criticalMomentId', 'knowledgeUnitId',
        'conceptId', 'prompt', 'attemptedMove', 'san', 'uci', 'fromSquare', 'toSquare', 'expectedMove',
        'referenceMove', 'explanation', 'feedback', 'summaryText', 'evidence', 'timeSpent',
        'exactAttemptCount', 'playerIdentity']) assert(P.prohibited.includes(key), key);
});
