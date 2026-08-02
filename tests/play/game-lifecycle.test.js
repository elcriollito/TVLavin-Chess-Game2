import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
const source = fs.readFileSync(new URL('../../js/play/game-lifecycle.js', import.meta.url), 'utf8');
function fixture(options = {}) {
    const window = {};
    vm.runInNewContext(source, { window, Object, JSON, Date, Number });
    return window.CaissaGameLifecycle.createLifecycle(options);
}
const snapshot = (overrides = {}) => ({
    schemaVersion: '1.0.0', mounted: true, section: 'play', mode: 'engine',
    position: { turn: 'white', moveCount: 0 },
    game: { active: false, pendingPromotion: null, result: null, status: { state: 'Ready' } },
    clocks: { running: false }, evaluation: { available: false }, engine: { busy: false },
    ...overrides
});

test('contract is versioned, frozen, passive, and idempotently installed', () => {
    const window = {};
    vm.runInNewContext(source, { window, Object, JSON, Date, Number });
    const api = window.CaissaGameLifecycle;
    vm.runInNewContext(source, { window, Object, JSON, Date, Number });
    assert.equal(window.CaissaGameLifecycle, api);
    assert.equal(api.schemaVersion, '1.0.0');
    assert.equal(Object.isFrozen(api.states), true);
    assert.equal(Object.isFrozen(api.events), true);
});
test('derives idle, active, promotion, completed, analyzing, and unknown', () => {
    const api = (() => { const w = {}; vm.runInNewContext(source, { window: w, Object, JSON, Date, Number }); return w.CaissaGameLifecycle; })();
    assert.equal(api.deriveState(snapshot()), 'idle');
    assert.equal(api.deriveState(snapshot({ game: { active: true } })), 'active');
    assert.equal(api.deriveState(snapshot({ game: { active: true, pendingPromotion: {} } })), 'awaiting-promotion');
    assert.equal(api.deriveState(snapshot({ game: { active: false, result: '1-0' } })), 'completed');
    assert.equal(api.deriveState(snapshot({ section: 'analyze', game: { active: false } })), 'analyzing');
    assert.equal(api.deriveState(null), 'unknown');
});
test('explicit transition table accepts supported paths and rejects invalid/disposed paths', () => {
    const f = fixture();
    for (const [from, to] of [['idle', 'starting'], ['starting', 'active'], ['active', 'awaiting-promotion'],
        ['awaiting-promotion', 'completed'], ['idle', 'completed'], ['completed', 'analyzing'], ['analyzing', 'idle']])
        assert.equal(f.validateTransition(from, to), true);
    assert.equal(f.validateTransition('configuring', 'completed'), false);
    assert.equal(f.validateTransition('disposed', 'idle'), false);
});
test('sync is immutable, serializable, and idempotent', () => {
    const f = fixture({ now: () => 0, sessionIdFactory: () => 'life:1' });
    const first = f.sync(snapshot());
    assert.equal(first.ok, true);
    assert.equal(Object.isFrozen(first.snapshot), true);
    assert.doesNotThrow(() => JSON.stringify(first));
    assert.equal(f.sync(snapshot()).status, 'unchanged');
    assert.equal(f.getHistory().length, 1);
});
test('changed snapshots create one transition and preserve detached reads', () => {
    const f = fixture();
    f.sync(snapshot());
    f.sync(snapshot({ game: { active: true, pendingPromotion: null, result: null } }));
    assert.equal(f.getSnapshot().state, 'active');
    assert.equal(f.getHistory().length, 2);
    assert.equal(Object.isFrozen(f.getHistory()), true);
});
test('passively observes service-backed active color and timeout metadata', () => {
    const f = fixture();
    f.sync(snapshot({ clocks: { running: true, activeColor: 'black', timedOutColor: null } }));
    assert.equal(f.getSnapshot().clockActiveColor, 'black');
    f.sync(snapshot({ clocks: { running: false, activeColor: 'black', timedOutColor: 'black' } }));
    assert.equal(f.getSnapshot().timedOutColor, 'black');
});
test('session identity is deterministic, stable, and rotates explicitly', () => {
    let id = 0;
    const f = fixture({ sessionIdFactory: () => `life:${++id}` });
    f.sync(snapshot());
    assert.equal(f.inspect().lifecycleSessionId, 'life:1');
    f.sync(snapshot());
    assert.equal(f.inspect().lifecycleSessionId, 'life:1');
    assert.equal(f.rotateSession(), 'life:2');
});
test('history is bounded and oldest transitions are evicted', () => {
    const f = fixture({ historyLimit: 2 });
    f.sync(snapshot());
    f.sync(snapshot({ game: { active: true } }));
    f.sync(snapshot({ game: { active: true, pendingPromotion: {} } }));
    assert.equal(f.getHistory().length, 2);
    f.clearHistory();
    assert.equal(f.getHistory().length, 0);
});
test('disposal is terminal and idempotent', () => {
    const f = fixture();
    f.sync(snapshot());
    assert.equal(f.dispose().status, 'disposed');
    assert.equal(f.dispose().status, 'disposed');
    assert.equal(f.sync(snapshot()).status, 'disposed');
});
test('invalid snapshots return structured results without mutation', () => {
    const f = fixture();
    assert.equal(f.sync(null).status, 'invalid');
    assert.equal(f.getHistory().length, 0);
});
test('static guard forbids legacy writes and runtime resources', () => {
    for (const pattern of [/\bApp\b/, /new Worker/, /document\b/, /localStorage|sessionStorage/,
        /setTimeout|setInterval|requestAnimationFrame/, /CaissaEngineRequestIsolation/,
        /CaissaFairPlayPolicy/, /createElement|innerHTML|textContent/])
        assert.doesNotMatch(source, pattern);
});
