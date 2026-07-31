import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const files = ['play-analytics-contracts.js', 'play-analytics-privacy-policy.js',
    'play-analytics-dispatcher.js', 'play-game-start-analytics.js'];
function load(extra = {}) {
    const window = { ...extra };
    files.forEach(file => vm.runInNewContext(fs.readFileSync(`js/play/analytics/${file}`, 'utf8'), { window, globalThis: window }));
    return window;
}
const context = (overrides = {}) => ({ mode: 'games', startSource: 'primary-cta', timeControlSeconds: 600,
    color: 'white', opponentType: 'engine', assistanceCategory: 'engine-opponent', qaEligible: true,
    productionEligible: true, actionKey: 'games', ...overrides });

test('game-start contract has exact fixed taxonomy and rejects hostile or identifying payloads', () => {
    const { CaissaPlayAnalyticsContracts: C } = load();
    assert.deepEqual([...C.GAME_START_EVENT_IDS], ['play_game_start_requested', 'play_game_start_succeeded',
        'play_game_start_failed', 'play_game_start_blocked', 'play_game_start_deduplicated']);
    assert.deepEqual([...C.START_FAILURE_REASONS], ['invalid-configuration', 'dependency-unavailable',
        'engine-unavailable', 'lifecycle-rejected', 'fairplay-denied', 'provider-unavailable',
        'production-blocked', 'stale-action', 'duplicate-action', 'disposed', 'unknown']);
    const valid = { mode: 'games', startSource: 'primary-cta', timeControlCategory: 'rapid', colorCategory: 'random',
        opponentType: 'engine', assistanceCategory: 'engine-opponent', startState: 'requested', failureReason: 'unknown',
        qaEligible: true, productionEligible: true, attemptSequence: 1, shellVersion: 'SimplifiedPlayShell@1.7.0' };
    const event = C.createEvent('play_game_start_requested', valid, 1);
    assert(C.validateEvent(event)); assert(Object.isFrozen(event.payload)); assert.doesNotThrow(() => JSON.stringify(event));
    for (const invalid of [{ ...valid, exactMinutes: 10 }, { ...valid, botName: 'private' },
        { ...valid, startSource: '/play?token=x' }, { ...valid, attemptSequence: 0 }])
        assert.equal(C.createEvent('play_game_start_requested', invalid, 1), null);
});

test('mapping emits broad categories only for Games, Bots, Coach, provider, and blocked Players', () => {
    const w = load(); const A = w.CaissaPlayGameStartAnalytics;
    const attempts = [
        A.observeRequest(context()),
        A.observeRequest(context({ mode: 'bots', actionKey: 'bots', timeControlSeconds: 300, color: 'random', opponentType: 'bot-catalog' })),
        A.observeRequest(context({ mode: 'coach', actionKey: 'coach', timeControlSeconds: 0, opponentType: 'coach-engine', assistanceCategory: 'coach-assisted' })),
        A.observeRequest(context({ mode: 'players', actionKey: 'provider', startSource: 'provider-entry',
            timeControlCategory: 'provider-owned', colorCategory: 'provider-assigned', opponentType: 'human-provider', assistanceCategory: 'provider-owned' }))
    ];
    A.observeBlocked(context({ mode: 'players', actionKey: 'blocked', opponentType: 'human-unavailable',
        assistanceCategory: 'blocked', productionEligible: false, failureReason: 'production-blocked' }));
    attempts.forEach(item => A.observeFailure({ attemptSequence: item.attemptSequence, failureReason: 'dependency-unavailable' }));
    const events = w.CaissaPlayAnalytics.getSnapshot({ qa: true, includeEvents: true }).events;
    assert.deepEqual(Array.from(events.filter(e => e.eventId === 'play_game_start_requested'), e => e.payload.timeControlCategory),
        ['rapid', 'blitz', 'untimed', 'provider-owned']);
    const blocked = events.find(e => e.eventId === 'play_game_start_blocked');
    assert.equal(blocked.payload.failureReason, 'production-blocked'); assert.equal(blocked.payload.productionEligible, false);
    assert(!JSON.stringify(events).includes('exactMinutes')); assert(!JSON.stringify(events).includes('botName'));
});

test('request has one terminal outcome; duplicates, stale outcomes, failures, and disposal are bounded', () => {
    const w = load(); const A = w.CaissaPlayGameStartAnalytics;
    const first = A.observeRequest(context());
    assert.equal(A.observeRequest(context()).status, 'deduplicated');
    assert.equal(A.observeSuccess({ attemptSequence: first.attemptSequence, ready: true }).status, 'succeeded');
    assert.equal(A.observeSuccess({ attemptSequence: first.attemptSequence, ready: true }).status, 'stale');
    const second = A.observeRequest(context({ actionKey: 'new-game', startSource: 'new-game' }));
    assert.equal(A.observeSuccess({ attemptSequence: second.attemptSequence, ready: false }).status, 'failed');
    const snapshot = A.inspect(); assert.equal(snapshot.pendingAttempts, 0);
    assert.equal(snapshot.diagnostics.duplicateRequestsSuppressed, 1); assert.equal(snapshot.diagnostics.staleOutcomesIgnored, 1);
    assert.equal(A.dispose().disposed, true); assert.equal(A.observeRequest(context()).status, 'disposed');
});

test('observer cannot start games and isolates command errors without retry or product mutation', () => {
    const lifecycle = { state: 'idle' }; let actions = 0;
    const w = load({ CaissaGameLifecycle: { getSnapshot: () => lifecycle } });
    const A = w.CaissaPlayGameStartAnalytics;
    A.observeRequest(context()); assert.equal(actions, 0); assert.equal(lifecycle.state, 'idle');
    assert.throws(() => A.observePanelStart(context({ actionKey: 'throw' }), () => { actions += 1; throw new Error('private'); }));
    assert.equal(actions, 1); assert.equal(A.inspect().diagnostics.failures, 1);
});

test('privacy extension prohibits start identifiers, exact settings, chess content, and completion data', () => {
    const P = load().CaissaPlayAnalyticsPrivacyPolicy;
    for (const key of ['gameId', 'sessionId', 'lifecycleId', 'workerId', 'opponentName', 'opponentRating',
        'botName', 'coachName', 'exactMinutes', 'incrementSeconds', 'exactTimeControl', 'selectedSquare',
        'orientation', 'move', 'moves', 'pgn', 'fen', 'result', 'termination', 'duration', 'evaluation', 'pv'])
        assert(P.prohibited.includes(key), key);
});
