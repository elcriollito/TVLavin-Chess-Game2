import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { Chess } from 'chess.js';

const source = fs.readFileSync(new URL('../../js/play/game-record.js', import.meta.url), 'utf8');
const STANDARD_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const FINAL_FEN = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2';
const NOW = '2026-07-27T12:00:00.000Z';

function baseSnapshot(overrides = {}) {
    const snapshot = {
        schemaVersion: '1.0.0',
        capturedAt: NOW,
        section: 'play',
        mounted: true,
        active: true,
        mode: 'analysis',
        playerColor: 'white',
        selectedOpponent: null,
        position: {
            fen: STANDARD_FEN,
            pgn: '',
            turn: 'white',
            moveCount: 0,
            moveHistory: []
        },
        board: { available: true, orientation: 'white' },
        game: {
            active: false,
            status: { state: 'In Progress', result: '', message: '' },
            result: '',
            termination: null,
            pendingPromotion: null
        },
        clocks: {
            whiteMilliseconds: 0,
            blackMilliseconds: 0,
            whiteSeconds: 0,
            blackSeconds: 0,
            timeControlSeconds: 0,
            activeColor: null,
            running: false
        },
        evaluation: { available: false, scorePawns: null, mate: null, perspective: null },
        engine: { available: true, busy: false, purpose: null },
        storageVersion: null
    };
    return {
        ...snapshot,
        ...overrides,
        position: { ...snapshot.position, ...(overrides.position || {}) },
        game: {
            ...snapshot.game,
            ...(overrides.game || {}),
            status: { ...snapshot.game.status, ...(overrides.game?.status || {}) }
        },
        clocks: { ...snapshot.clocks, ...(overrides.clocks || {}) },
        evaluation: { ...snapshot.evaluation, ...(overrides.evaluation || {}) }
    };
}

function fixture(snapshot = baseSnapshot()) {
    const storageCalls = [];
    const window = {
        Chess,
        CaissaPlayCompatibility: {
            getSnapshot: () => snapshot
        },
        localStorage: { setItem: (...args) => storageCalls.push(['local', ...args]) },
        sessionStorage: { setItem: (...args) => storageCalls.push(['session', ...args]) },
        indexedDB: { open: (...args) => storageCalls.push(['indexed', ...args]) }
    };
    vm.runInNewContext(source, { window, Date, Object, WeakSet, Number, Set, JSON, Math, TypeError, Error });
    return { api: window.CaissaGameRecord, window, snapshot, storageCalls };
}

const plain = value => JSON.parse(JSON.stringify(value));

test('public API is versioned, frozen, minimal, and idempotent', () => {
    const { api, window } = fixture();
    const before = api;
    vm.runInNewContext(source, { window, Date, Object, WeakSet, Number, Set, JSON, Math, TypeError, Error });
    assert.equal(window.CaissaGameRecord, before);
    assert.equal(api.schemaVersion, '1.0.0');
    assert.equal(Object.isFrozen(api), true);
    assert.deepEqual(Object.keys(api).sort(), [
        'buildFromPlay', 'buildFromSnapshot', 'diagnosticCodes', 'getPgnResultToken',
        'parse', 'schemaVersion', 'serialize', 'statuses', 'validate'
    ].sort());
});

test('idle record has deterministic complete shape and honest placeholders', () => {
    const record = fixture().api.buildFromSnapshot(baseSnapshot(), { capturedAt: NOW });
    assert.equal(record.status, 'idle');
    assert.equal(record.recordId, fixture().api.buildFromSnapshot(baseSnapshot(), { capturedAt: NOW }).recordId);
    assert.equal(record.position.initialFen, STANDARD_FEN);
    assert.equal(record.timing.startedAt, null);
    assert.equal(record.timing.endedAt, null);
    assert.equal(record.timing.durationMs, null);
    assert.deepEqual(plain(record.coach), { enabled: false, profileId: null, assistanceLevel: null });
    assert.deepEqual(plain(record.mentor), { requested: false, mentorId: null });
});

test('in-progress record normalizes verbose moves, clocks, mode, and opponent', () => {
    const record = fixture().api.buildFromSnapshot(baseSnapshot({
        mode: 'engine',
        selectedOpponent: 'stockfish',
        position: {
            fen: FINAL_FEN,
            pgn: '1. e4 e5 *',
            moveCount: 2,
            moveHistory: [
                { color: 'w', from: 'e2', to: 'e4', san: 'e4', promotion: null, flags: 'b' },
                { color: 'b', from: 'e7', to: 'e5', san: 'e5', promotion: null, flags: 'b' }
            ]
        },
        game: { active: true, result: '', status: { state: 'In Progress' } },
        clocks: { whiteMilliseconds: 299000, blackMilliseconds: 298000, timeControlSeconds: 300, activeColor: 'white', running: true }
    }), { capturedAt: NOW });
    assert.equal(record.status, 'in-progress');
    assert.equal(record.mode, 'human-vs-engine');
    assert.deepEqual(plain(record.opponent), { type: 'engine', id: 'stockfish', name: null, rating: null });
    assert.deepEqual(record.moves.history.map(move => move.ply), [1, 2]);
    assert.equal(record.timing.finalClocks.whiteMilliseconds, 299000);
});

test('completed checkmate derives only observable result, winner, and termination', () => {
    const record = fixture().api.buildFromSnapshot(baseSnapshot({
        position: { pgn: '1. Qg7# 1-0', moveCount: 1, moveHistory: [{ color: 'w', from: 'f7', to: 'g7', san: 'Qg7#', flags: 'n' }] },
        game: { active: false, result: '1-0', status: { state: 'Checkmate', result: '1-0' } }
    }), { capturedAt: NOW });
    assert.equal(record.status, 'completed');
    assert.deepEqual(plain(record.result), {
        value: '1-0', termination: 'checkmate', winner: 'white', complete: true, source: 'legacy-game-status'
    });
});

test('completed quick-play PGN separates headers from movetext and remains replayable', () => {
    const record = fixture().api.buildFromSnapshot(baseSnapshot({
        mode: 'engine', playerColor: 'white', selectedOpponent: 'stockfish',
        position: { pgn: '1. e4', fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
            moveCount: 1, moveHistory: [{ color:'w',from:'e2',to:'e4',san:'e4',flags:'b' }] },
        game: { active:false,result:'0-1',status:{state:'White Resigned',result:'0-1'} },
        clocks: { timeControlSeconds:60,incrementSeconds:0,whiteMilliseconds:50000,blackMilliseconds:60000 }
    }), { capturedAt: NOW });
    assert.match(record.notation.pgn, /\[Termination "resignation"\]\n\n1\. e4 0-1$/);
    const replay = new Chess(); replay.loadPgn(record.notation.pgn);
    assert.deepEqual(replay.history(), ['e4']);
});

test('stalemate and resignation normalize from explicit legacy state', () => {
    const api = fixture().api;
    const stalemate = api.buildFromSnapshot(baseSnapshot({
        position: { pgn: '1/2-1/2' },
        game: { active: false, result: '½-½', status: { state: 'Stalemate', result: '½-½' } }
    }), { capturedAt: NOW });
    const resignation = api.buildFromSnapshot(baseSnapshot({
        position: { pgn: '1. e4 0-1', moveCount: 1, moveHistory: ['e4'] },
        game: { active: false, result: '0-1', status: { state: 'White resigned', result: '0-1' } }
    }), { capturedAt: NOW });
    assert.equal(stalemate.result.termination, 'stalemate');
    assert.equal(stalemate.result.value, '1/2-1/2');
    assert.equal(resignation.result.termination, 'resignation');
    assert.equal(resignation.result.winner, 'black');
});

test('unknown termination remains null and receives a warning', () => {
    const record = fixture().api.buildFromSnapshot(baseSnapshot({
        position: { pgn: '1. e4 1-0', moveCount: 1, moveHistory: ['e4'] },
        game: { active: false, result: '1-0', status: { state: 'Game Over', result: '1-0' } }
    }), { capturedAt: NOW });
    assert.equal(record.result.termination, null);
    assert.ok(record.diagnostics.some(item => item.code === 'TERMINATION_UNKNOWN'));
});

test('custom FEN comes from PGN headers without normalizing notation', () => {
    const custom = '7k/5Q2/6K1/8/8/8/8/8 w - - 0 1';
    const pgn = `[SetUp "1"]\n[FEN "${custom}"]\n\n1. Qg7#`;
    const record = fixture().api.buildFromSnapshot(baseSnapshot({
        position: { fen: '6Qk/8/6K1/8/8/8/8/8 b - - 1 1', pgn, moveCount: 1, moveHistory: ['Qg7#'] },
        game: { active: false, result: '1-0', status: { state: 'Checkmate', result: '1-0' } }
    }), { capturedAt: NOW });
    assert.equal(record.position.initialFen, custom);
    assert.equal(record.notation.pgn, pgn);
    assert.equal(record.notation.pgnResultToken, null);
    assert.equal(record.notation.hasResultMismatch, true);
    assert.ok(record.diagnostics.some(item => item.code === 'PGN_RESULT_MISMATCH'));
});

test('malformed and missing FEN create diagnostics without throwing', () => {
    const api = fixture().api;
    const missing = api.buildFromSnapshot(baseSnapshot({ position: { fen: null } }), { capturedAt: NOW });
    const invalid = api.buildFromSnapshot(baseSnapshot({ position: { fen: '<script>' } }), { capturedAt: NOW });
    assert.ok(missing.diagnostics.some(item => item.code === 'MISSING_FEN'));
    assert.ok(invalid.diagnostics.some(item => item.code === 'INVALID_FEN'));
});

test('PGN result inspection handles body tokens, header tokens, missing, and bounded malformed input', () => {
    const api = fixture().api;
    assert.equal(api.getPgnResultToken('1. e4 e5 1-0'), '1-0');
    assert.equal(api.getPgnResultToken('[Result "0-1"]\n\n1. e4'), '0-1');
    assert.equal(api.getPgnResultToken(''), null);
    assert.equal(api.getPgnResultToken(`1. e4 ${'x'.repeat(1_000_001)}`), null);
});

test('basic PGN remains unchanged and missing PGN is diagnosed', () => {
    const api = fixture().api;
    const pgn = '1. e4 e5 2. Nf3 *';
    assert.equal(api.buildFromSnapshot(baseSnapshot({ position: { pgn } }), { capturedAt: NOW }).notation.pgn, pgn);
    assert.ok(api.buildFromSnapshot(baseSnapshot({ position: { pgn: null } }), { capturedAt: NOW })
        .diagnostics.some(item => item.code === 'MISSING_PGN'));
});

test('move normalization accepts SAN strings and reports count mismatch', () => {
    const record = fixture().api.buildFromSnapshot(baseSnapshot({
        position: { moveCount: 3, moveHistory: ['e4', 'e5'] }
    }), { capturedAt: NOW });
    assert.deepEqual(plain(record.moves.history), [
        { ply: 1, color: null, from: null, to: null, san: 'e4', promotion: null, flags: null },
        { ply: 2, color: null, from: null, to: null, san: 'e5', promotion: null, flags: null }
    ]);
    assert.ok(record.diagnostics.some(item => item.code === 'MOVE_COUNT_MISMATCH'));
});

test('unknown mode and opponent remain honest', () => {
    const record = fixture().api.buildFromSnapshot(baseSnapshot({ mode: 'online', selectedOpponent: null }), { capturedAt: NOW });
    assert.equal(record.mode, 'unknown');
    assert.deepEqual(plain(record.opponent), { type: null, id: null, name: null, rating: null });
    assert.ok(record.diagnostics.some(item => item.code === 'UNSUPPORTED_MODE'));
});

test('incomplete clocks are preserved as null with a warning', () => {
    const record = fixture().api.buildFromSnapshot(baseSnapshot({
        clocks: { whiteMilliseconds: null, blackMilliseconds: null }
    }), { capturedAt: NOW });
    assert.equal(record.timing.finalClocks.whiteMilliseconds, null);
    assert.ok(record.diagnostics.some(item => item.code === 'CLOCK_DATA_INCOMPLETE'));
});

test('evaluation policy stores availability metadata without engine analysis', () => {
    const record = fixture().api.buildFromSnapshot(baseSnapshot({
        evaluation: { available: true, scorePawns: 2.4, mate: null, perspective: 'white' }
    }), { capturedAt: NOW });
    assert.deepEqual(plain(record.evaluationPolicy), { mode: 'legacy', available: true });
    assert.equal(JSON.stringify(record).includes('scorePawns'), false);
});

test('record and all nested values are deeply frozen and detached from input', () => {
    const input = baseSnapshot({ position: { moveCount: 1, moveHistory: ['e4'] } });
    const record = fixture(input).api.buildFromSnapshot(input, { capturedAt: NOW });
    const verify = value => {
        if (!value || typeof value !== 'object') return;
        assert.equal(Object.isFrozen(value), true);
        Object.values(value).forEach(verify);
    };
    verify(record);
    assert.notEqual(record.moves.history, input.position.moveHistory);
    assert.throws(() => record.moves.history.push({ san: 'h4' }), TypeError);
    assert.deepEqual(input.position.moveHistory, ['e4']);
});

test('records from identical deterministic inputs are independent and stable', () => {
    const api = fixture().api;
    const first = api.buildFromSnapshot(baseSnapshot(), { capturedAt: NOW });
    const second = api.buildFromSnapshot(baseSnapshot(), { capturedAt: NOW });
    assert.deepEqual(plain(first), plain(second));
    assert.notEqual(first, second);
});

test('buildFromPlay reads only the approved compatibility boundary', () => {
    const { api, snapshot } = fixture();
    assert.deepEqual(plain(api.buildFromPlay({ capturedAt: NOW })),
        plain(api.buildFromSnapshot(snapshot, { capturedAt: NOW })));
});

test('validator returns structured errors and propagates builder warnings', () => {
    const api = fixture().api;
    const valid = api.validate(api.buildFromSnapshot(baseSnapshot(), { capturedAt: NOW }));
    const invalid = api.validate({ schemaVersion: '9.0.0' });
    assert.equal(valid.valid, true);
    assert.ok(valid.warnings.some(item => item.code === 'MISSING_PGN'));
    assert.equal(invalid.valid, false);
    assert.ok(invalid.errors.some(item => item.code === 'INVALID_RECORD_SHAPE'));
});

test('validator rejects unsupported schema version and invalid record fields', () => {
    const api = fixture().api;
    const record = plain(api.buildFromSnapshot(baseSnapshot(), { capturedAt: NOW }));
    record.schemaVersion = '2.0.0';
    record.recordId = '<bad>';
    record.capturedAt = 'today';
    record.status = 'saved';
    const validation = api.validate(record);
    assert.equal(validation.valid, false);
    assert.deepEqual(Array.from(validation.errors, item => item.code).sort(), [
        'INVALID_CAPTURED_AT', 'INVALID_RECORD_ID', 'INVALID_STATUS', 'UNSUPPORTED_SCHEMA_VERSION'
    ]);
});

test('serialize and parse round trip without mutation or storage writes', () => {
    const { api, storageCalls } = fixture();
    const record = api.buildFromSnapshot(baseSnapshot(), { capturedAt: NOW });
    const serialized = api.serialize(record);
    const parsed = api.parse(serialized.value);
    assert.equal(serialized.ok, true);
    assert.equal(parsed.ok, true);
    assert.deepEqual(plain(parsed.record), plain(record));
    assert.equal(Object.isFrozen(parsed.record), true);
    assert.deepEqual(storageCalls, []);
});

test('parse rejects malformed JSON, malformed record, and unsupported schema', () => {
    const api = fixture().api;
    assert.equal(api.parse('{').status, 'invalid-json');
    assert.equal(api.parse('{}').status, 'invalid-record');
    const record = plain(api.buildFromSnapshot(baseSnapshot(), { capturedAt: NOW }));
    record.schemaVersion = '2.0.0';
    assert.equal(api.parse(JSON.stringify(record)).status, 'unsupported-schema-version');
});

test('hostile shapes do not pollute prototypes or execute input', () => {
    const api = fixture().api;
    const hostile = JSON.parse('{"schemaVersion":"1.0.0","__proto__":{"polluted":true}}');
    assert.equal(api.validate(hostile).valid, false);
    assert.equal({}.polluted, undefined);
    const nested = plain(api.buildFromSnapshot(baseSnapshot(), { capturedAt: NOW }));
    nested.opponent = JSON.parse('{"type":"engine","id":null,"name":null,"rating":null,"__proto__":{"polluted":true}}');
    assert.equal(api.validate(nested).valid, false);
    const snapshot = baseSnapshot({ mode: '<img src=x onerror=alert(1)>' });
    assert.doesNotThrow(() => api.buildFromSnapshot(snapshot, { capturedAt: NOW }));
    assert.equal({}.polluted, undefined);
});

test('custom record ID is bounded and invalid IDs fall back deterministically', () => {
    const api = fixture().api;
    assert.equal(api.buildFromSnapshot(baseSnapshot(), { capturedAt: NOW, recordId: 'local:test-1' }).recordId, 'local:test-1');
    assert.match(api.buildFromSnapshot(baseSnapshot(), { capturedAt: NOW, recordId: '<bad>' }).recordId, /^local-play:fnv1a32-/);
});

test('static guard forbids legacy access, resources, storage, DOM, Analyze, and navigation', () => {
    for (const pattern of [
        /\bApp\b/, /\bnew\s+Worker\b/, /\brequestAnimationFrame\s*\(/, /\bsetInterval\s*\(/, /\bsetTimeout\s*\(/,
        /\blocalStorage\b/, /\bsessionStorage\b/, /\bindexedDB\b/, /\.addEventListener\s*\(/,
        /createElement|appendChild|innerHTML|textContent/, /AnalyzeSection|CaissaNavigation/,
        /\bhistory\.(?:pushState|replaceState)\s*\(/, /\bdispatchEvent\s*\(/,
        /CaissaPlayCompatibility\.(?!getSnapshot)/
    ]) assert.doesNotMatch(source, pattern);
});

test('both SPA pages load GameRecord exactly once after compatibility', () => {
    for (const page of ['index.html', 'yahoo-classic.html']) {
        const html = fs.readFileSync(new URL(`../../${page}`, import.meta.url), 'utf8');
        assert.equal((html.match(/js\/play\/game-record\.js/g) || []).length, 1);
        assert.ok(html.indexOf('legacy-play-compatibility.js?v=1.3.0') < html.indexOf('game-record.js?v=1.2.0'));
    }
});
