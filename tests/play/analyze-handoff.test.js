import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
const source = fs.readFileSync(new URL('../../js/play/analyze-handoff.js', import.meta.url), 'utf8');
function memoryStorage() {
    const data = new Map();
    return {
        get length() { return data.size; },
        key: index => [...data.keys()][index] ?? null,
        getItem: key => data.get(key) ?? null,
        setItem: (key, value) => data.set(key, String(value)),
        removeItem: key => data.delete(key),
        data
    };
}
function fixture() {
    const window = { sessionStorage: memoryStorage(), crypto: { randomUUID: () => '12345678-1234-1234-1234-123456789012' } };
    vm.runInNewContext(source, { window, Object, JSON, Date, Number, Math });
    return window;
}
test('contract is versioned, frozen, bounded, and contains no payload in token', () => {
    const w = fixture();
    assert.equal(w.CaissaAnalyzeHandoff.schemaVersion, '1.0.0');
    assert.equal(w.CaissaAnalyzeHandoff.ttlMs, 1_800_000);
    assert.equal(Object.isFrozen(w.CaissaAnalyzeHandoff.intents), true);
    assert.equal(w.CaissaAnalyzeHandoff.keys.prefix, 'caissa:analyze:handoff:v1:');
});
test('deterministic transport stores and resolves immutable handoff repeatedly within TTL', () => {
    const w = fixture();
    const storage = memoryStorage();
    const transport = w.CaissaAnalyzeHandoff.createTransport({
        storage, now: () => 1000, tokenFactory: () => 'deterministic_token_1'
    });
    const created = transport.create({ intent: 'analyze-game', payload: { pgn: '1. e4 e5', finalFen: null } });
    assert.equal(created.ok, true);
    assert.equal(Object.isFrozen(created.value), true);
    assert.equal(transport.store(created.value).status, 'stored');
    assert.equal(transport.resolve().value.payload.pgn, '1. e4 e5');
    assert.equal(transport.resolve().value.handoffId, created.value.handoffId);
    assert.doesNotThrow(() => JSON.stringify(created.value));
});
test('expiration, unknown token, corruption, unsupported versions, and storage failure are safe', () => {
    const w = fixture();
    const storage = memoryStorage();
    let now = 0;
    const transport = w.CaissaAnalyzeHandoff.createTransport({
        storage, now: () => now, tokenFactory: () => 'deterministic_token_2'
    });
    const handoff = transport.create({ intent: 'analyze-position', payload: { finalFen: '8/8/8/8/8/8/8/K6k w - - 0 1' } }).value;
    transport.store(handoff);
    now = 1_800_001;
    assert.equal(transport.resolve().status, 'expired');
    assert.equal(transport.resolve('unknown_token_123').status, 'not-found');
    storage.setItem(`${w.CaissaAnalyzeHandoff.keys.prefix}corrupt_token_12`, '{');
    assert.equal(transport.resolve('corrupt_token_12').status, 'corrupt');
    const unsupported = { ...handoff, schemaVersion: '9.0.0' };
    assert.equal(w.CaissaAnalyzeHandoff.validate(unsupported, 0).status, 'unsupported');
    assert.equal(w.CaissaAnalyzeHandoff.createTransport({ storage: null }).resolve().status, 'unavailable');
});
test('cleanup is bounded and leaves unrelated session storage untouched', () => {
    const w = fixture();
    const storage = memoryStorage();
    storage.setItem('unrelated', 'safe');
    let id = 0;
    const transport = w.CaissaAnalyzeHandoff.createTransport({
        storage, now: () => id, tokenFactory: () => `bounded_token_${String(++id).padStart(3, '0')}`
    });
    for (let i = 0; i < 7; i += 1) {
        const created = transport.create({ intent: 'analyze-game', payload: {} });
        transport.store(created.value);
    }
    transport.cleanup();
    const owned = [...storage.data.keys()].filter(key => key.startsWith(w.CaissaAnalyzeHandoff.keys.prefix));
    assert.ok(owned.length <= 5);
    assert.equal(storage.getItem('unrelated'), 'safe');
});
test('static guard excludes App, DOM, workers, timers, localStorage, engines, and lifecycle commands', () => {
    assert.doesNotMatch(source, /\bApp\b|document|new\s+Worker|setTimeout|setInterval|requestAnimationFrame|localStorage/);
    assert.doesNotMatch(source, /postMessage|EngineAdapter|FairPlayPolicy\.(?:allow|evaluate)|CaissaGameLifecycle\.(?:sync|rotate)/);
});
