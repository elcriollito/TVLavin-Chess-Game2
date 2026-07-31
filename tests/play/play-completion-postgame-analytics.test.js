import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const files = ['play-analytics-contracts.js', 'play-analytics-privacy-policy.js', 'play-analytics-dispatcher.js',
    'play-completion-analytics.js', 'play-postgame-analytics.js'];
function load(extra = {}) { const window = { ...extra }; files.forEach(file => vm.runInNewContext(
    fs.readFileSync(`js/play/analytics/${file}`, 'utf8'), { window, globalThis: window })); return window; }
const record = (value = '1-0', termination = 'checkmate', overrides = {}) => ({ status: 'completed',
    result: { value, termination, complete: true }, timing: { durationMs: null, timeControlSeconds: 600 },
    opponent: { type: 'engine', id: null }, ...overrides });

test('completion and PostGame contracts expose exact frozen categorical vocabularies', () => {
    const C = load().CaissaPlayAnalyticsContracts;
    assert.deepEqual([...C.COMPLETION_EVENT_IDS], ['play_game_completed', 'play_game_aborted', 'play_game_completion_failed']);
    assert.deepEqual([...C.POSTGAME_EVENT_IDS], ['play_postgame_shown', 'play_postgame_action_selected',
        'play_postgame_action_succeeded', 'play_postgame_action_failed', 'play_postgame_action_blocked']);
    assert.deepEqual([...C.RESULT_CATEGORIES], ['white-win', 'black-win', 'draw', 'no-result', 'unknown']);
    assert(C.TERMINATION_CATEGORIES.includes('fifty-move')); assert(C.POSTGAME_ACTIONS.includes('pgn-download'));
    assert(Object.isFrozen(C.COMPLETION_STATES)); assert.doesNotThrow(() => JSON.stringify(C.POSTGAME_ACTIONS));
});

test('authoritative normalized results and durations map only to broad categories', () => {
    const A = load().CaissaPlayCompletionAnalytics;
    assert.equal(A.resultCategory('1-0'), 'white-win'); assert.equal(A.resultCategory('0-1'), 'black-win');
    assert.equal(A.resultCategory('1/2-1/2'), 'draw'); assert.equal(A.terminationCategory('fifty-move-rule'), 'fifty-move');
    assert.equal(A.terminationCategory('engine-failure'), 'technical-failure');
    assert.deepEqual([59000, 60000, 180000, 600000, 1800000].map(value => A.durationBucket(value)),
        ['under-1-minute', '1-to-3-minutes', '3-to-10-minutes', '10-to-30-minutes', 'over-30-minutes']);
    assert.equal(A.durationBucket(null), 'unavailable');
});

test('completion, abort, failure, stale handling, and bounded records are observational', () => {
    const w = load(); const A = w.CaissaPlayCompletionAnalytics;
    const completed = A.observeCompleted({ record: record() }); assert.equal(completed.status, 'completed');
    assert.equal(A.observeAborted({ record: record('*', 'aborted') }).status, 'aborted');
    assert.equal(A.observeFailed({ record: record(null, null) }).status, 'failed');
    assert.equal(A.observeCompleted({ stale: true, record: record() }).status, 'stale');
    for (let i = 0; i < 10; i += 1) A.observeCompleted({ record: record('1/2-1/2', 'stalemate') });
    assert.equal(A.inspect().recordCount, 8); assert(A.inspect().diagnostics.recordsEvicted > 0);
    const events = w.CaissaPlayAnalytics.getSnapshot({ qa: true, includeEvents: true }).events;
    assert.equal(events[0].payload.resultCategory, 'white-win'); assert.equal(events[0].payload.durationBucket, 'unavailable');
});

test('PostGame shown and action selection have one correlated terminal outcome', () => {
    const w = load(); const completion = w.CaissaPlayCompletionAnalytics.observeCompleted({ record: record() });
    const context = { completionSequence: completion.completionSequence, ...completion.categories };
    const P = w.CaissaPlayPostGameAnalytics;
    assert.equal(P.observeShown(context), true); assert.equal(P.observeShown(context), false);
    for (const action of ['rematch', 'analyze', 'mentor-review', 'guided-replay', 'mentor-summary', 'copy-pgn', 'download-pgn', 'new-game']) {
        const selected = P.observeActionSelected({ ...context, action });
        assert(P.observeActionSucceeded(selected)); assert.equal(P.observeActionSucceeded(selected), false);
    }
    const failed = P.observeActionSelected({ ...context, action: 'analyze' });
    assert(P.observeActionFailed({ ...failed, failureReason: 'analyze-unavailable' }));
    const blocked = P.observeActionSelected({ ...context, action: 'mentor-review' });
    assert(P.observeActionBlocked({ ...blocked, failureReason: 'mentor-unavailable' }));
    assert.equal(P.inspect().diagnostics.staleOutcomesIgnored, 8);
});

test('exact schemas reject hostile, content-bearing, malformed, and arbitrary fields', () => {
    const C = load().CaissaPlayAnalyticsContracts;
    const completion = { mode: 'games', completionState: 'completed', resultCategory: 'draw', terminationCategory: 'stalemate',
        durationBucket: 'unavailable', opponentType: 'engine', assistanceCategory: 'engine-opponent', qaEligible: true,
        productionEligible: false, completionSequence: 1, startAttemptSequence: 0, shellVersion: 'SimplifiedPlayShell@1.7.0' };
    assert(C.validateCompletionPayload(completion));
    for (const bad of [{ ...completion, score: 'private' }, { ...completion, exactDuration: 1 }, { ...completion, moves: [] }])
        assert.equal(C.validateCompletionPayload(bad), false);
    const hostile = Object.create(null); Object.assign(hostile, completion); Object.defineProperty(hostile, '__proto__', { value: 1, enumerable: true });
    assert.equal(C.validateCompletionPayload(hostile), false);
});

test('privacy prohibits completion text, timing, chess, handoff, clipboard, Mentor, and provider content', () => {
    const P = load().CaissaPlayAnalyticsPrivacyPolicy;
    for (const key of ['resultText', 'score', 'winnerName', 'loserName', 'exactDuration', 'startedAt', 'endedAt',
        'clockRemaining', 'moveCount', 'moves', 'pgn', 'fen', 'position', 'evaluation', 'mate', 'pv', 'handoffToken',
        'downloadFilename', 'clipboardContent', 'mentorContent', 'summaryContent', 'knowledgeConcept', 'providerResult', 'rawTermination'])
        assert(P.prohibited.includes(key), key);
});
