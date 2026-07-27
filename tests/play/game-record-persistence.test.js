import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { Chess } from 'chess.js';

const recordSource = fs.readFileSync(new URL('../../js/play/game-record.js', import.meta.url), 'utf8');
const persistenceSource = fs.readFileSync(new URL('../../js/play/game-record-persistence.js', import.meta.url), 'utf8');
const STANDARD_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const FINAL_FEN = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2';
const NOW = Date.parse('2026-07-27T12:00:00.000Z');
const plain = value => JSON.parse(JSON.stringify(value));

function memoryStorage(initial = {}, behavior = {}) {
    const values = new Map(Object.entries(initial));
    const calls = [];
    return {
        getItem(key) {
            calls.push(['get', key]);
            if (behavior.readThrows) throw new Error('read failed');
            return values.get(key) ?? null;
        },
        setItem(key, value) {
            calls.push(['set', key]);
            if (behavior.quota) {
                const error = new Error('quota');
                error.name = 'QuotaExceededError';
                throw error;
            }
            if (behavior.partialCanonicalOnce && !key.endsWith(':tmp') && !behavior.partialTriggered) {
                behavior.partialTriggered = true;
                values.set(key, String(value));
                throw new Error('partial promotion');
            }
            if (behavior.writeThrows || behavior.failCanonical && !key.endsWith(':tmp'))
                throw new Error('write failed');
            values.set(key, String(value));
        },
        removeItem(key) {
            calls.push(['remove', key]);
            if (behavior.removeThrows) throw new Error('remove failed');
            values.delete(key);
        },
        values,
        calls
    };
}

function snapshot(status = 'completed', overrides = {}) {
    const completed = status === 'completed';
    return {
        schemaVersion: '1.0.0',
        capturedAt: '2026-07-27T12:00:00.000Z',
        section: 'play',
        mode: 'analysis',
        playerColor: 'white',
        selectedOpponent: null,
        position: {
            fen: completed ? FINAL_FEN : STANDARD_FEN,
            pgn: completed ? '1. e4 e5 1-0' : status === 'in-progress' ? '1. e4 *' : '',
            moveCount: completed ? 2 : status === 'in-progress' ? 1 : 0,
            moveHistory: completed
                ? [{ color: 'w', from: 'e2', to: 'e4', san: 'e4', flags: 'b' },
                    { color: 'b', from: 'e7', to: 'e5', san: 'e5', flags: 'b' }]
                : status === 'in-progress'
                    ? [{ color: 'w', from: 'e2', to: 'e4', san: 'e4', flags: 'b' }] : []
        },
        game: {
            active: status === 'in-progress',
            result: completed ? '1-0' : '',
            status: { state: completed ? 'checkmate' : 'In Progress', result: completed ? '1-0' : '', message: '' },
            pendingPromotion: null
        },
        clocks: {
            whiteMilliseconds: 0, blackMilliseconds: 0, timeControlSeconds: 0,
            activeColor: null, running: false
        },
        evaluation: { available: false },
        ...overrides
    };
}

function fixture({ storage = memoryStorage(), now = () => NOW } = {}) {
    const window = { Chess, localStorage: storage };
    const context = { window, Date, Object, WeakSet, Number, Set, JSON, Math, TypeError, Error, TextEncoder };
    vm.runInNewContext(recordSource, context);
    vm.runInNewContext(persistenceSource, context);
    const records = window.CaissaGameRecord;
    const api = window.CaissaGameRecordPersistence;
    return {
        window, api, storage, records,
        store: api.createStore({ storage, now }),
        make(status = 'completed', options = {}) {
            return records.buildFromSnapshot(snapshot(status), {
                capturedAt: options.capturedAt ?? '2026-07-27T12:00:00.000Z',
                recordId: options.recordId,
                pgn: options.pgn
            });
        },
        makeAborted(options = {}) {
            return records.buildFromSnapshot(snapshot('idle', {
                game: {
                    active: false,
                    result: '',
                    status: { state: 'aborted', result: '', message: '' },
                    pendingPromotion: null
                }
            }), {
                capturedAt: options.capturedAt ?? '2026-07-27T12:00:00.000Z',
                recordId: options.recordId ?? 'local:aborted'
            });
        }
    };
}

test('public contract is versioned, frozen, idempotent, and load-write-free', () => {
    const storage = memoryStorage();
    const { api, window } = fixture({ storage });
    const before = api;
    vm.runInNewContext(persistenceSource, {
        window, Date, Object, WeakSet, Number, Set, JSON, Math, TypeError, Error, TextEncoder
    });
    assert.equal(window.CaissaGameRecordPersistence, before);
    assert.equal(api.schemaVersion, '1.0.0');
    assert.equal(api.consentVersion, '1.0.0');
    assert.equal(api.scope, 'guest-local');
    assert.equal(Object.isFrozen(api), true);
    assert.equal(Object.isFrozen(api.limits), true);
    assert.equal(storage.calls.length, 0);
});

test('keys are centralized, versioned, guest-scoped, and non-sensitive', () => {
    const { api } = fixture();
    assert.deepEqual(plain(api.keys), {
        history: 'caissa:play:game-records:v1:guest-local',
        recovery: 'caissa:play:game-recovery:v1:guest-local',
        consent: 'caissa:play:game-record-consent:v1:guest-local',
        historyTemporary: 'caissa:play:game-records:v1:guest-local:tmp',
        recoveryTemporary: 'caissa:play:game-recovery:v1:guest-local:tmp',
        consentTemporary: 'caissa:play:game-record-consent:v1:guest-local:tmp'
    });
    assert.doesNotMatch(JSON.stringify(api.keys), /@|email|display.?name/i);
});

test('default consent is unknown and reading it writes nothing', () => {
    const { store, storage } = fixture();
    const consent = store.getConsent();
    assert.equal(consent.ok, true);
    assert.equal(consent.value.state, 'unknown');
    assert.equal(storage.calls.filter(([operation]) => operation === 'set').length, 0);
});

test('grant and deny are explicit, versioned atomic writes', () => {
    const { store, storage, api } = fixture();
    assert.equal(store.setConsent('granted').status, 'stored');
    assert.equal(store.getConsent().value.state, 'granted');
    assert.equal(store.setConsent('denied').status, 'stored');
    assert.equal(store.getConsent().value.state, 'denied');
    assert.equal(storage.values.has(api.keys.consentTemporary), false);
});

test('invalid and unknown consent cannot be persisted', () => {
    const { store, storage } = fixture();
    assert.equal(store.setConsent('unknown').status, 'invalid-consent');
    assert.equal(store.setConsent('yes').status, 'invalid-consent');
    assert.equal(storage.values.size, 0);
});

test('completed save requires granted consent and denied remains distinct', () => {
    const { store, make } = fixture();
    assert.equal(store.saveCompleted(make()).status, 'consent-required');
    store.setConsent('denied');
    assert.equal(store.saveCompleted(make()).status, 'consent-denied');
});

test('valid completed and aborted records save only after consent', () => {
    const { store, make, makeAborted } = fixture();
    store.setConsent('granted');
    assert.equal(store.saveCompleted(make()).status, 'stored');
    assert.equal(makeAborted().status, 'aborted');
    assert.equal(store.saveCompleted(makeAborted()).status, 'stored');
    assert.equal(store.listCompleted().value.length, 2);
});

test('completed history rejects mutable, invalid, in-progress, and idle records', () => {
    const { store, make } = fixture();
    store.setConsent('granted');
    assert.equal(store.saveCompleted(plain(make())).status, 'invalid-record');
    assert.equal(store.saveCompleted(make('in-progress')).status, 'invalid-record');
    assert.equal(store.saveCompleted(make('idle')).status, 'invalid-record');
    assert.equal(store.saveCompleted(Object.freeze({ schemaVersion: '9.0.0' })).status, 'invalid-record');
});

test('list, get, remove, and clear return detached data', () => {
    const { store, make, storage, api } = fixture();
    store.setConsent('granted');
    const first = make('completed', { recordId: 'local:first' });
    store.saveCompleted(first);
    const listed = store.listCompleted();
    assert.equal(Object.isFrozen(listed.value), true);
    assert.notEqual(listed.value[0], first);
    assert.equal(store.getCompleted('local:first').value.recordId, 'local:first');
    assert.equal(store.removeCompleted('local:first').status, 'removed');
    assert.equal(store.getCompleted('local:first').status, 'not-found');
    storage.values.set('unrelated:key', 'keep');
    assert.equal(store.clearCompleted().status, 'cleared');
    assert.equal(storage.values.get('unrelated:key'), 'keep');
    assert.equal(storage.values.has(api.keys.history), false);
});

test('duplicate record ID replaces deterministically without merging', () => {
    let current = NOW;
    const { store, make } = fixture({ now: () => current });
    store.setConsent('granted');
    store.saveCompleted(make('completed', { recordId: 'local:same' }));
    current += 1_000;
    store.saveCompleted(make('completed', {
        recordId: 'local:same',
        capturedAt: '2026-07-27T13:00:00.000Z'
    }));
    const listed = store.listCompleted().value;
    assert.equal(listed.length, 1);
    assert.equal(listed[0].capturedAt, '2026-07-27T13:00:00.000Z');
});

test('completed ordering is newest persisted first with stable ID tie-breaker', () => {
    let current = NOW;
    const { store, make } = fixture({ now: () => current });
    store.setConsent('granted');
    store.saveCompleted(make('completed', { recordId: 'local:b' }));
    store.saveCompleted(make('completed', { recordId: 'local:a' }));
    current += 1_000;
    store.saveCompleted(make('completed', { recordId: 'local:c' }));
    assert.deepEqual(plain(store.listCompleted().value.map(item => item.recordId)),
        ['local:c', 'local:a', 'local:b']);
});

test('count retention evicts oldest records and never exceeds frozen limit', () => {
    let current = NOW;
    const { store, make, api } = fixture({ now: () => current });
    store.setConsent('granted');
    for (let index = 0; index < api.limits.completedRecords + 2; index += 1) {
        current += 1_000;
        assert.equal(store.saveCompleted(make('completed', { recordId: `local:${index}` })).ok, true);
    }
    const records = store.listCompleted().value;
    assert.equal(records.length, api.limits.completedRecords);
    assert.equal(records.some(record => record.recordId === 'local:0'), false);
    assert.equal(records[0].recordId, `local:${api.limits.completedRecords + 1}`);
});

test('individual record size is rejected before storage write', () => {
    const { store, make, storage } = fixture();
    store.setConsent('granted');
    const before = storage.calls.length;
    const record = make('completed', { recordId: 'local:large', pgn: `1. e4 ${'x'.repeat(270_000)} 1-0` });
    assert.equal(store.saveCompleted(record).status, 'invalid-record');
    assert.equal(storage.calls.slice(before).some(([operation]) => operation === 'set'), false);
});

test('total payload size evicts oldest records independently of count', () => {
    let current = NOW;
    const { store, make, api } = fixture({ now: () => current });
    store.setConsent('granted');
    let sizeEvicted = false;
    for (let index = 0; index < 12; index += 1) {
        current += 1_000;
        const saved = store.saveCompleted(make('completed', {
            recordId: `local:payload-${index}`,
            pgn: `1. e4 ${'x'.repeat(190_000)} 1-0`
        }));
        assert.equal(saved.ok, true);
        sizeEvicted ||= saved.warnings.some(item => item.code === 'size-eviction');
    }
    const listed = store.listCompleted().value;
    assert.equal(sizeEvicted, true);
    assert.ok(listed.length < 12);
    const raw = store.inspect();
    assert.equal(raw.ok, true);
    assert.ok(listed.every(record => JSON.stringify(record).length < api.limits.individualRecordBytes));
});

test('recovery explicitly saves, loads, overwrites, and remains one record', () => {
    let current = NOW;
    const { store, make } = fixture({ now: () => current });
    assert.equal(store.saveRecovery(make('in-progress', { recordId: 'local:r1' })).status, 'stored');
    assert.equal(store.loadRecovery().value.record.recordId, 'local:r1');
    current += 1_000;
    assert.equal(store.saveRecovery(make('in-progress', { recordId: 'local:r2' })).status, 'stored');
    assert.equal(store.loadRecovery().value.record.recordId, 'local:r2');
});

test('recovery rejects completed, idle, mutable, and invalid TTL records', () => {
    const { store, make } = fixture();
    assert.equal(store.saveRecovery(make()).status, 'invalid-record');
    assert.equal(store.saveRecovery(make('idle')).status, 'invalid-record');
    assert.equal(store.saveRecovery(plain(make('in-progress'))).status, 'invalid-record');
    assert.equal(store.saveRecovery(make('in-progress'), { ttlMs: 1 }).status, 'invalid-record');
});

test('expired recovery is not returned and does not affect history', () => {
    let current = NOW;
    const { store, make } = fixture({ now: () => current });
    store.setConsent('granted');
    store.saveCompleted(make());
    store.saveRecovery(make('in-progress'), { ttlMs: 60_000 });
    current += 60_001;
    assert.equal(store.loadRecovery().status, 'expired');
    assert.equal(store.listCompleted().value.length, 1);
});

test('recovery clear removes only recovery-owned keys', () => {
    const { store, make, storage, api } = fixture();
    store.saveRecovery(make('in-progress'));
    storage.values.set('unrelated:key', 'keep');
    assert.equal(store.clearRecovery().status, 'cleared');
    assert.equal(storage.values.has(api.keys.recovery), false);
    assert.equal(storage.values.get('unrelated:key'), 'keep');
});

test('revocation clears completed history, persists denial, and retains recovery', () => {
    const { store, make } = fixture();
    store.setConsent('granted');
    store.saveCompleted(make());
    store.saveRecovery(make('in-progress'));
    assert.equal(store.revokeConsent().status, 'cleared');
    assert.equal(store.getConsent().value.state, 'denied');
    assert.equal(store.listCompleted().value.length, 0);
    assert.equal(store.loadRecovery().ok, true);
});

test('clearAll removes exactly owned canonical and temporary keys', () => {
    const { store, make, storage, api } = fixture();
    store.setConsent('granted');
    store.saveCompleted(make());
    store.saveRecovery(make('in-progress'));
    storage.values.set(api.keys.historyTemporary, 'stale');
    storage.values.set('caissa:unrelated:v1', 'keep');
    assert.equal(store.clearAll().status, 'cleared');
    assert.equal(storage.values.get('caissa:unrelated:v1'), 'keep');
    assert.equal(Object.values(api.keys).some(key => storage.values.has(key)), false);
});

test('malformed JSON, invalid envelope, duplicates, and dangerous keys are isolated', () => {
    const base = fixture();
    const key = base.api.keys.history;
    for (const raw of [
        '{',
        '{}',
        '{"schemaVersion":"9.0.0","storeType":"completed-history"}',
        '{"schemaVersion":"1.0.0","storeType":"completed-history","__proto__":{"polluted":true}}'
    ]) {
        const storage = memoryStorage({ [key]: raw });
        const { store } = fixture({ storage });
        assert.ok(['corrupted', 'unsupported-schema'].includes(store.listCompleted().status));
        assert.equal({}.polluted, undefined);
    }
});

test('unsupported envelope migration is pure and non-destructive', () => {
    const { api, storage } = fixture();
    const before = storage.calls.length;
    const migrated = api.migrateEnvelope({ schemaVersion: '2.0.0' }, 'completed-history');
    assert.equal(migrated.status, 'unsupported-schema');
    assert.equal(storage.calls.length, before);
});

test('unavailable and read-throwing storage return structured failures', () => {
    assert.equal(fixture({ storage: null }).store.getConsent().status, 'unavailable');
    assert.equal(fixture({ storage: memoryStorage({}, { readThrows: true }) }).store.listCompleted().status, 'unavailable');
});

test('write and quota failures preserve the prior canonical envelope', () => {
    for (const behavior of [{ failCanonical: true }, { quota: true }]) {
        const initial = memoryStorage();
        const seeded = fixture({ storage: initial });
        seeded.store.setConsent('granted');
        const original = initial.values.get(seeded.api.keys.consent);
        const failing = memoryStorage(Object.fromEntries(initial.values), behavior);
        const { store, api } = fixture({ storage: failing });
        const response = store.setConsent('denied');
        assert.equal(response.status, behavior.quota ? 'quota-exceeded' : 'failed');
        assert.equal(failing.values.get(api.keys.consent), original);
        assert.equal(failing.values.has(api.keys.consentTemporary), false);
    }
});

test('partial promotion failure rolls back the last valid canonical envelope', () => {
    const initial = memoryStorage();
    const seeded = fixture({ storage: initial });
    seeded.store.setConsent('granted');
    const original = initial.values.get(seeded.api.keys.consent);
    const storage = memoryStorage(Object.fromEntries(initial.values), { partialCanonicalOnce: true });
    const { store, api } = fixture({ storage });
    assert.equal(store.setConsent('denied').status, 'failed');
    assert.equal(storage.values.get(api.keys.consent), original);
    assert.equal(storage.values.has(api.keys.consentTemporary), false);
});

test('stale temporary keys are reported but never promoted during reads', () => {
    const seed = fixture();
    const storage = memoryStorage({ [seed.api.keys.historyTemporary]: '{"partial":true}' });
    const { store, api } = fixture({ storage });
    assert.deepEqual(plain(store.inspect().value.staleTemporaryKeys), [api.keys.historyTemporary]);
    assert.equal(storage.values.has(api.keys.history), false);
});

test('returned records and arrays cannot mutate stored envelopes or inputs', () => {
    const { store, make } = fixture();
    store.setConsent('granted');
    const input = make();
    const before = JSON.stringify(input);
    store.saveCompleted(input);
    const first = store.listCompleted();
    assert.equal(Object.isFrozen(first.value[0]), true);
    assert.throws(() => first.value.push(input), TypeError);
    assert.equal(JSON.stringify(input), before);
    assert.equal(store.listCompleted().value.length, 1);
});

test('unsupported signed-in scope fails without creating keys', () => {
    const { api, storage } = fixture();
    const store = api.createStore({ storage, now: () => NOW, scope: 'user:123' });
    assert.equal(store.getConsent().status, 'unavailable');
    assert.equal(storage.calls.length, 0);
});

test('static guards prohibit Play, resources, DOM, lifecycle wiring, engine, navigation, and Analyze', () => {
    for (const pattern of [
        /\bApp\b/, /\bnew\s+Worker\b/, /\brequestAnimationFrame\s*\(/, /\bsetInterval\s*\(/,
        /\bsetTimeout\s*\(/, /\.addEventListener\s*\(/, /\bdocument\b/, /createElement|appendChild|innerHTML/,
        /EngineAdapter|postMessage\s*\(/, /CaissaNavigation|AnalyzeSection/, /beforeunload|visibilitychange/,
        /CaissaPlayCompatibility/, /CaissaGameRecord\.buildFromPlay/
    ]) assert.doesNotMatch(persistenceSource, pattern);
});

test('both SPA pages register persistence once after GameRecord', () => {
    for (const page of ['index.html', 'yahoo-classic.html']) {
        const html = fs.readFileSync(new URL(`../../${page}`, import.meta.url), 'utf8');
        assert.equal((html.match(/js\/play\/game-record-persistence\.js/g) || []).length, 1);
        assert.ok(html.indexOf('game-record.js?v=1.0.0') < html.indexOf('game-record-persistence.js?v=1.0.0'));
    }
});
