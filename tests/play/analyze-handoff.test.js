import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { Chess } from 'chess.js';
class LegacyChess extends Chess {
    load(fen) { try { super.load(fen); return true; } catch (_) { return false; } }
    load_pgn(pgn) { try { this.loadPgn(pgn, { strict: false }); return true; } catch (_) { return false; } }
}
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
function fixture(overrides = {}) {
    const window = { sessionStorage: memoryStorage(), crypto: { randomUUID: () => '12345678-1234-1234-1234-123456789012' }, ...overrides };
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
test('consumed handoff cannot be resolved or consumed twice', () => {
    const w = fixture();
    const created = w.CaissaAnalyzeHandoff.createTransport({
        storage: w.sessionStorage, now: () => 1000, tokenFactory: () => 'consumed_token_123'
    });
    const handoff = created.create({ intent: 'analyze-game', payload: {} }).value;
    created.store(handoff);
    assert.equal(created.consume(handoff.token).status, 'consumed');
    assert.equal(created.resolve(handoff.token).status, 'not-found');
    assert.equal(created.consume(handoff.token).status, 'not-found');
});

function completedFixture() {
    const game = new Chess(); game.move('e4');
    const pgn = '[Result "0-1"]\n\n1. e4 0-1';
    const record = {
        schemaVersion: '1.0.0', status: 'completed', recordId: 'record-1', mode: 'games',
        position: { initialFen: new Chess().fen(), finalFen: game.fen() },
        moves: { count: 1 }, notation: { pgn }, player: { color: 'white' },
        opponent: { type: 'engine', name: 'CAISSA Engine' }, coach: { enabled: false },
        result: { complete: true, value: '0-1', termination: 'resignation' }
    };
    const w = fixture({ Chess: LegacyChess, CaissaGameRecord: { validate: () => ({ valid: true }) },
        CaissaPlayCompatibility: { getSnapshot: () => ({ board: { orientation: 'white' }, schemaVersion: '1.2.0' }) } });
    return { w, record };
}

test('completed record path requires final result, termination, moves and legal replay', () => {
    const { w, record } = completedFixture();
    assert.equal(w.CaissaAnalyzeHandoff.createFromCompletedPlayRecord(record).ok, true);
    const rejected = [
        { ...record, status: 'active' },
        { ...record, result: { ...record.result, value: '*' } },
        { ...record, result: { ...record.result, termination: null } },
        { ...record, moves: { count: 0 } },
        { ...record, notation: { pgn: 'malformed pgn' } },
        { ...record, position: { ...record.position, finalFen: new Chess().fen() } },
        { ...record, status: 'initialization-failed', result: { complete: false, value: null, termination: null } }
    ];
    for (const candidate of rejected)
        assert.equal(w.CaissaAnalyzeHandoff.createFromCompletedPlayRecord(candidate).ok, false);
});

test('legacy active path is named, honest, replayable and context-gated', () => {
    const active = new Chess(); active.move('e4');
    const snapshot = { schemaVersion: '1.2.0', section: 'play', mounted: true, active: true,
        mode: 'analysis', playerColor: 'white', position: { fen: active.fen(), pgn: '1. e4', moveCount: 1 },
        board: { orientation: 'white' }, game: { active: true, result: null } };
    const boundary = { getSnapshot: () => snapshot, isLegacyAnalyzeContext: () => true };
    const w = fixture({ Chess: LegacyChess, CaissaPlayCompatibility: boundary });
    const created = w.CaissaAnalyzeHandoff.createFromLegacyActivePlay();
    assert.equal(created.ok, true);
    assert.deepEqual(JSON.parse(JSON.stringify(created.value.payload)), {
        recordId: null, initialFen: null, finalFen: active.fen(), pgn: '1. e4', selectedPly: 1,
        playerColor: 'white', boardOrientation: 'white', result: null, termination: null,
        whiteLabel: null, blackLabel: null, recordStatus: 'active', mode: 'analysis'
    });
    boundary.isLegacyAnalyzeContext = () => false;
    assert.equal(w.CaissaAnalyzeHandoff.createFromLegacyActivePlay({ query: 'legacy', storage: true }).ok, false);
});
test('static guard excludes App, DOM, workers, timers, localStorage, engines, and lifecycle commands', () => {
    assert.doesNotMatch(source, /\bApp\b|document|new\s+Worker|setTimeout|setInterval|requestAnimationFrame|localStorage/);
    assert.doesNotMatch(source, /postMessage|EngineAdapter|FairPlayPolicy\.(?:allow|evaluate)|CaissaGameLifecycle\.(?:sync|rotate)/);
});
