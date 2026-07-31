import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const files = ['play-analytics-contracts.js', 'play-analytics-privacy-policy.js', 'play-analytics-dispatcher.js'];
function load() {
    const window = {};
    for (const file of files) vm.runInNewContext(fs.readFileSync(`js/play/analytics/${file}`, 'utf8'), { window, globalThis: window });
    return window;
}
const payload = (overrides = {}) => ({ mode: 'games', previousMode: 'none', routeSource: 'direct',
    qaEligible: false, productionEligible: true, accessState: 'allowed', loadState: 'eager',
    failureReason: 'none', routeNormalized: false, shellVersion: 'SimplifiedPlayShell@1.7.0',
    selectionSequence: 1, ...overrides });

test('contracts publish exact frozen versions, IDs, enums, and JSON-safe events', () => {
    const { CaissaPlayAnalyticsContracts: C } = load();
    assert.equal(C.VERSION, 'PlayAnalyticsEvent@1.0.0');
    assert.equal(C.PAYLOAD_VERSION, 'PlayModeSelectionPayload@1.0.0');
    assert.deepEqual([...C.MODE_EVENT_IDS], ['play_mode_selected', 'play_mode_load_started', 'play_mode_load_succeeded',
        'play_mode_load_failed', 'play_mode_selection_blocked', 'play_mode_route_normalized']);
    const event = C.createEvent('play_mode_selected', payload(), 1);
    assert(C.validateEvent(event)); assert(Object.isFrozen(event)); assert(Object.isFrozen(event.payload));
    assert.doesNotThrow(() => JSON.stringify(event));
});

test('malformed, unknown, dangerous, executable, and arbitrary payload shapes fail closed', () => {
    const { CaissaPlayAnalyticsContracts: C } = load();
    for (const invalid of [payload({ mode: 'arena' }), payload({ routeSource: '/play?secret=1' }),
        payload({ shellVersion: 'x' }), { ...payload(), extra: 'x' }, null])
        assert.equal(C.createEvent('play_mode_selected', invalid, 1), null);
    assert.equal(C.createEvent('game_started', payload(), 1), null);
    const hostile = Object.create(null); Object.assign(hostile, payload()); Object.defineProperty(hostile, '__proto__', { value: 'x', enumerable: true });
    assert.equal(C.validatePayload(hostile), false);
});

test('privacy policy explicitly denies identity, chess content, URLs, persistence, and transport', () => {
    const { CaissaPlayAnalyticsPrivacyPolicy: P } = load();
    assert.equal(P.VERSION, 'PlayAnalyticsPrivacyPolicy@1.1.0');
    assert.equal(P.transport, 'none'); assert.equal(P.persistence, 'none'); assert.equal(P.preciseTime, false);
    for (const key of ['email', 'accountId', 'ip', 'url', 'query', 'referrer', 'moves', 'pgn', 'fen',
        'evaluation', 'pv', 'mentorContent', 'providerPayload', 'fingerprint', 'sessionId']) assert(P.prohibited.includes(key));
});

test('dispatcher emits once, bounds its buffer, evicts oldest, and exposes redacted diagnostics by default', () => {
    const { CaissaPlayAnalytics: A } = load();
    for (let index = 1; index <= 55; index += 1) {
        const event = A.createEvent('play_mode_selected', payload({ selectionSequence: index }));
        assert.equal(A.emit(event).status, 'emitted');
    }
    const snapshot = A.getSnapshot();
    assert.equal(snapshot.bufferSize, 50); assert.equal(snapshot.diagnostics.bufferEvictions, 5);
    assert.equal('events' in snapshot, false);
    const qa = A.getSnapshot({ qa: true, includeEvents: true });
    assert.equal(qa.events.length, 50); assert.equal(qa.events[0].payload.selectionSequence, 6);
});

test('deduplication and trusted sink failure isolation cannot affect delivery', () => {
    const { CaissaPlayAnalytics: A } = load();
    const event = A.createEvent('play_mode_selected', payload());
    assert.equal(A.emit(event).status, 'emitted'); assert.equal(A.emit(event).status, 'duplicate');
    assert.equal(A.registerSink({ sinkId: 'evil', version: 'PlayAnalyticsSink@1.0.0', emit() {} }).ok, false);
    assert.equal(A.registerSink({ sinkId: 'qa-test', version: 'PlayAnalyticsSink@1.0.0', emit() { throw new Error('sink'); } }).ok, true);
    const next = A.createEvent('play_mode_selected', payload({ mode: 'bots', previousMode: 'games',
        qaEligible: true, productionEligible: false, accessState: 'qa-only', loadState: 'unknown', selectionSequence: 2 }));
    assert.equal(A.emit(next).ok, true); assert.equal(A.inspect().diagnostics.sinkFailures, 1);
});

test('dispose is terminal, clears local state, and performs no persistence', () => {
    const { CaissaPlayAnalytics: A } = load();
    A.emit(A.createEvent('play_mode_selected', payload()));
    const disposed = A.dispose(); assert.equal(disposed.disposed, true); assert.equal(disposed.bufferSize, 0);
    assert.equal(A.emit({}).ok, false); assert.equal(A.createEvent('play_mode_selected', payload()), null);
});
