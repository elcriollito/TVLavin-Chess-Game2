import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = path => fs.readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
function load(overrides = {}) {
    const window = { ...overrides }; new vm.Script(read('js/play/play-v2-post-game-exit-policy.js'))
        .runInContext(vm.createContext({ window, globalThis: window, Object, Set })); return window.CaissaPlayV2PostGameExitPolicy;
}
const record = Object.freeze({ status: 'completed', result: Object.freeze({ complete: true }), recordId: 'record-1' });

test('PlayV2PostGameExitPolicy@1.0.0 freezes every required declaration', () => {
    const policy = load();
    assert.equal(policy.contractId, 'PlayV2PostGameExitPolicy@1.0.0'); assert.equal(Object.isFrozen(policy), true);
    assert.deepEqual(JSON.parse(JSON.stringify({ source: policy.source, automaticNavigation: policy.automaticNavigation,
        silentFallback: policy.silentFallback, legacyPlayFallback: policy.legacyPlayFallback, ficsFallback: policy.ficsFallback,
        rematch: policy.rematch, newGame: policy.newGame, analyze: policy.analyze, mentorReview: policy.mentorReview,
        completedRecordMutation: policy.completedRecordMutation, pgnInUrl: policy.pgnInUrl, fenInUrl: policy.fenInUrl,
        analyticsTransport: policy.analyticsTransport, returnToPostGame: policy.returnToPostGame })), {
        source: 'finalized-PostGame', automaticNavigation: 'prohibited', silentFallback: 'prohibited',
        legacyPlayFallback: 'prohibited', ficsFallback: 'prohibited', rematch: 'internal-new-lifecycle',
        newGame: 'internal-clean-setup', analyze: 'explicit-external-continuation', mentorReview: 'explicit-optional-review',
        completedRecordMutation: 'prohibited', pgnInUrl: 'prohibited', fenInUrl: 'prohibited', analyticsTransport: 'disabled',
        returnToPostGame: 'deterministic-where-supported'
    });
    for (const key of ['academyRecommendation', 'puzzleRecommendation', 'endgameTrainerRecommendation',
        'endgameLibraryRecommendation', 'courseRecommendation']) assert.equal(policy[key], 'prohibited');
});

test('complete inventory owns allowed, fail-closed, non-exit, and prohibited paths', () => {
    const policy = load(); const keys = Object.keys(policy.inventory);
    for (const required of ['rematch', 'new-game', 'analyze', 'mentor-review', 'copy-pgn', 'download-pgn', 'save-game',
        'browser-back', 'browser-forward', 'refresh', 'route-exit', 'gate-disable', 'invalid-handoff', 'legacy-play', 'fics', 'education'])
        assert(keys.includes(required), required);
    for (const entry of Object.values(policy.inventory)) for (const field of ['owner', 'destination', 'completedRecordRequired',
        'handoff', 'back', 'runtimeCleanup', 'failureBehavior', 'privacyBehavior', 'classification']) assert(Object.hasOwn(entry, field), field);
    assert.equal(policy.authorize('fics', record).reasonCode, 'EXIT_PROHIBITED');
    assert.equal(policy.authorize('academy', record).reasonCode, 'EXIT_PROHIBITED');
    assert.equal(policy.authorize('analyze', { status: 'active', result: { complete: false } }).reasonCode, 'FINALIZED_RECORD_REQUIRED');
});

test('transition preparation stops owned runtime without mutating the record', () => {
    const calls = []; const policy = load({
        CaissaClockService: { stop: reason => calls.push(['clock', reason]) },
        CaissaEngineRequestIsolation: { cancelSession: () => calls.push(['engine']) },
        CaissaPlayV2BotWorkerReadiness: { getSnapshot: () => ({ state: 'playing' }), teardown: reason => calls.push(['worker', reason]) }
    });
    const before = JSON.stringify(record); const result = policy.prepare('analyze', record);
    assert.equal(result.reasonCode, 'EXIT_PREPARED'); assert.deepEqual(calls, [['clock', 'postgame-exit:analyze'], ['engine'], ['worker', 'route-exit']]);
    assert.equal(JSON.stringify(record), before); assert.equal(result.value.completedRecordMutations, 0);
});

test('policy and PostGame sources contain no automatic, education, FICS, legacy, URL, upload, identity, or analytics fallback', () => {
    const policy = read('js/play/play-v2-post-game-exit-policy.js'); const core = read('js/play/post-game-core.js');
    assert.doesNotMatch(policy, /location\.(?:assign|replace)|window\.open|fetch\s*\(|WebSocket|XMLHttpRequest|sendBeacon|document\.cookie|localStorage/i);
    assert.doesNotMatch(core, /academy|puzzle|endgame|course|legacy play|navigateToSection\(['"]fics|sendBeacon|fetch\s*\(/i);
    assert.match(core, /#busyAction/); assert.match(core, /ACTION_BUSY/); assert.match(core, /PlayV2PostGameExitPolicy/);
});
