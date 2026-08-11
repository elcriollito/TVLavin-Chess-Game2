import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../../js/play/engine-request-isolation.js', import.meta.url), 'utf8');
const FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const FEN_AFTER = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
const NOW = Date.parse('2026-07-27T12:00:00.000Z');
const plain = value => JSON.parse(JSON.stringify(value));

function fixture() {
    let current = NOW;
    let request = 0;
    let session = 0;
    const resourceCalls = [];
    const window = {
        Worker: function () { resourceCalls.push('worker'); },
        localStorage: { setItem: () => resourceCalls.push('storage') },
        document: { createElement: () => resourceCalls.push('dom') },
        requestAnimationFrame: () => resourceCalls.push('raf'),
        setInterval: () => resourceCalls.push('timer'),
        addEventListener: () => resourceCalls.push('listener')
    };
    vm.runInNewContext(source, {
        window, Date, Object, WeakSet, Number, Set, Map, JSON, Math, Error
    });
    const api = window.CaissaEngineRequestIsolation;
    const boundary = api.createBoundary({
        now: () => current,
        requestIdFactory: () => `request:${++request}`,
        sessionIdFactory: () => `session:${++session}`
    });
    return {
        window, api, boundary, resourceCalls,
        advance: milliseconds => { current += milliseconds; },
        now: () => current
    };
}

function createActive(f, purpose = 'opponent-move', overrides = {}) {
    if (!f.boundary.getCurrentSession()) f.boundary.createSession();
    const sessionId = f.boundary.getCurrentSession().sessionId;
    const fen = overrides.fen ?? FEN;
    const positionToken = f.api.createPositionToken({
        sessionId, fen, moveCount: overrides.moveCount ?? 0, turn: overrides.turn ?? 'w'
    });
    const created = f.boundary.createRequest({
        purpose,
        sessionId,
        positionToken,
        fen,
        moveCount: overrides.moveCount ?? 0,
        turn: overrides.turn ?? 'w',
        deadlineAt: overrides.deadlineAt,
        parameters: overrides.parameters
    });
    assert.equal(created.ok, true);
    assert.equal(f.boundary.submit(created.request).ok, true);
    return created.request;
}

function responseContext(f, request, message, overrides = {}) {
    return f.boundary.acceptResponse({
        requestId: overrides.requestId ?? request.requestId,
        sessionId: overrides.inputSessionId ?? request.sessionId,
        purpose: overrides.inputPurpose ?? request.purpose,
        positionToken: overrides.inputPositionToken ?? request.positionToken,
        message
    }, {
        sessionId: overrides.sessionId ?? request.sessionId,
        purpose: overrides.purpose ?? request.purpose,
        positionToken: overrides.positionToken ?? request.positionToken
    });
}

test('public API metadata is versioned, frozen, minimal, and idempotent', () => {
    const { api, window } = fixture();
    const before = api;
    vm.runInNewContext(source, { window, Date, Object, WeakSet, Number, Set, Map, JSON, Math, Error });
    assert.equal(window.CaissaEngineRequestIsolation, before);
    assert.equal(api.schemaVersion, '1.0.0');
    assert.equal(Object.isFrozen(api), true);
    assert.equal(Object.isFrozen(api.purposes), true);
    assert.deepEqual(plain(api.operationalPurposes), ['opponent-move', 'live-evaluation']);
    assert.ok(api.statuses.includes('stale'));
    assert.ok(api.responseStatuses.includes('stale-position'));
});

test('module load creates no worker, timer, RAF, listener, DOM, or storage use', () => {
    const { resourceCalls } = fixture();
    assert.deepEqual(resourceCalls, []);
});

test('session identity is stable until explicitly rotated and contains no PII', () => {
    const f = fixture();
    assert.equal(f.boundary.createSession().response.sessionId, 'session:1');
    assert.equal(f.boundary.getCurrentSession().sessionId, 'session:1');
    assert.equal(f.boundary.createSession().response.sessionId, 'session:2');
    assert.doesNotMatch(JSON.stringify(f.boundary.inspect()), /@|email|display.?name/i);
});

test('request shape is deterministic, immutable, serializable, and bounded', () => {
    const f = fixture();
    f.boundary.createSession();
    const sessionId = f.boundary.getCurrentSession().sessionId;
    const token = f.api.createPositionToken({ sessionId, fen: FEN, moveCount: 0, turn: 'w' });
    const result = f.boundary.createRequest({
        purpose: 'opponent-move', fen: FEN, positionToken: token,
        parameters: { moveTimeMs: 2000 }, metadata: { caller: 'play' }
    });
    assert.equal(result.ok, true);
    assert.equal(result.request.schemaVersion, '1.0.0');
    assert.equal(result.request.parameters.depth, null);
    assert.equal(result.request.parameters.moveTimeMs, 2000);
    assert.equal(Object.isFrozen(result.request), true);
    assert.equal(JSON.parse(JSON.stringify(result.request)).requestId, 'request:1');
});

test('hostile, malformed, oversized, and duplicate request inputs are rejected', () => {
    const f = fixture();
    f.boundary.createSession();
    assert.equal(f.boundary.createRequest(JSON.parse('{"__proto__":{"polluted":true}}')).status, 'malformed');
    assert.equal(f.boundary.createRequest({ purpose: 'opponent-move', fen: 'x'.repeat(201) }).status, 'malformed');
    const first = f.boundary.createRequest({ purpose: 'opponent-move', fen: FEN, requestId: 'same' });
    assert.equal(first.ok, true);
    assert.equal(f.boundary.createRequest({ purpose: 'opponent-move', fen: FEN, requestId: 'same' }).status, 'malformed');
    assert.equal({}.polluted, undefined);
});

test('position token is deterministic and changes with session, FEN, move count, or turn', () => {
    const { api } = fixture();
    const base = api.createPositionToken({ sessionId: 'session:1', fen: FEN, moveCount: 0, turn: 'w' });
    assert.equal(base, api.createPositionToken({ sessionId: 'session:1', fen: FEN, moveCount: 0, turn: 'w' }));
    assert.notEqual(base, api.createPositionToken({ sessionId: 'session:2', fen: FEN, moveCount: 0, turn: 'w' }));
    assert.notEqual(base, api.createPositionToken({ sessionId: 'session:1', fen: FEN_AFTER, moveCount: 1, turn: 'b' }));
    assert.notEqual(base, api.createPositionToken({ sessionId: 'session:1', fen: FEN, moveCount: 1, turn: 'w' }));
    assert.notEqual(base, api.createPositionToken({ sessionId: 'session:1', fen: FEN, moveCount: 0, turn: 'b' }));
});

test('valid status path is created to active to completed and terminal cannot reactivate', () => {
    const f = fixture();
    const request = createActive(f);
    assert.equal(f.boundary.getRequest(request.requestId).status, 'active');
    const accepted = responseContext(f, request, 'bestmove e2e4 ponder e7e5');
    assert.equal(accepted.status, 'accepted');
    assert.equal(accepted.request.status, 'completed');
    assert.equal(f.boundary.submit(request).status, 'completed');
    assert.equal(f.boundary.cancel(request.requestId).status, 'completed');
});

test('unsupported purposes remain in contract but cannot submit', () => {
    const f = fixture();
    f.boundary.createSession();
    const created = f.boundary.createRequest({ purpose: 'mentor-analysis', fen: FEN });
    assert.equal(created.ok, true);
    assert.equal(f.boundary.submit(created.request).status, 'unsupported');
    assert.equal(f.boundary.getRequest(created.request.requestId).status, 'unsupported');
});

test('same-purpose supersession makes only the newest request active', () => {
    const f = fixture();
    const old = createActive(f);
    const current = createActive(f, 'opponent-move', { fen: FEN_AFTER, moveCount: 1, turn: 'b' });
    assert.equal(f.boundary.getRequest(old.requestId).status, 'stale');
    assert.equal(f.boundary.getActiveRequest('opponent-move').requestId, current.requestId);
    assert.equal(responseContext(f, old, 'bestmove e2e4').status, 'stale-request');
});

test('opponent and evaluation purposes remain independently active', () => {
    const f = fixture();
    const opponent = createActive(f);
    const evaluation = createActive(f, 'live-evaluation');
    assert.equal(f.boundary.getActiveRequest('opponent-move').requestId, opponent.requestId);
    assert.equal(f.boundary.getActiveRequest('live-evaluation').requestId, evaluation.requestId);
});

test('new evaluation supersedes evaluation without canceling opponent', () => {
    const f = fixture();
    const opponent = createActive(f);
    const oldEvaluation = createActive(f, 'live-evaluation');
    const evaluation = createActive(f, 'live-evaluation', { fen: FEN_AFTER, moveCount: 1, turn: 'b' });
    assert.equal(f.boundary.getRequest(oldEvaluation.requestId).status, 'stale');
    assert.equal(f.boundary.getActiveRequest('live-evaluation').requestId, evaluation.requestId);
    assert.equal(f.boundary.getActiveRequest('opponent-move').requestId, opponent.requestId);
});

test('cancel by ID is idempotent and late response is rejected', () => {
    const f = fixture();
    const request = createActive(f);
    assert.equal(f.boundary.cancel(request.requestId).status, 'canceled');
    assert.equal(f.boundary.cancel(request.requestId).reason, 'already-canceled');
    assert.equal(responseContext(f, request, 'bestmove e2e4').status, 'canceled');
    assert.equal(f.boundary.cancel('unknown').reason, 'unknown-request-noop');
});

test('cancel by purpose leaves other purpose active', () => {
    const f = fixture();
    const opponent = createActive(f);
    const evaluation = createActive(f, 'live-evaluation');
    assert.equal(f.boundary.cancelPurpose('live-evaluation').status, 'canceled');
    assert.equal(f.boundary.getRequest(evaluation.requestId).status, 'canceled');
    assert.equal(f.boundary.getActiveRequest('opponent-move').requestId, opponent.requestId);
});

test('cancel session cancels every purpose in only that session', () => {
    const f = fixture();
    const opponent = createActive(f);
    const evaluation = createActive(f, 'live-evaluation');
    assert.equal(f.boundary.cancelSession().status, 'canceled');
    assert.equal(f.boundary.getRequest(opponent.requestId).status, 'canceled');
    assert.equal(f.boundary.getRequest(evaluation.requestId).status, 'canceled');
});

test('wrong request ID, session, purpose, and position are rejected distinctly', () => {
    const f = fixture();
    const request = createActive(f);
    assert.equal(responseContext(f, request, 'bestmove e2e4', { requestId: 'request:missing' }).status, 'unknown-request');
    assert.equal(responseContext(f, request, 'bestmove e2e4', { sessionId: 'session:other' }).status, 'stale-session');
    assert.equal(responseContext(f, request, 'bestmove e2e4', { purpose: 'live-evaluation' }).status, 'stale-request');
    assert.equal(responseContext(f, request, 'bestmove e2e4', { positionToken: 'position:other' }).status, 'stale-position');
});

test('deadline timeout is deterministic and late response remains rejected', () => {
    const f = fixture();
    const request = createActive(f, 'opponent-move', {
        deadlineAt: new Date(f.now() + 1_000).toISOString()
    });
    f.advance(1_001);
    assert.equal(responseContext(f, request, 'bestmove e2e4').status, 'timed-out');
    assert.equal(responseContext(f, request, 'bestmove e2e4').status, 'timed-out');
    assert.equal(f.boundary.getRequest(request.requestId).status, 'timed-out');
});

test('duplicate completion is rejected and counted without a second acceptance', () => {
    const f = fixture();
    const request = createActive(f);
    assert.equal(responseContext(f, request, 'bestmove e2e4').ok, true);
    assert.equal(responseContext(f, request, 'bestmove e2e4').ok, false);
    assert.equal(f.boundary.inspect().counters.completed, 1);
});

test('bestmove response is normalized and deeply frozen', () => {
    const f = fixture();
    const request = createActive(f);
    const accepted = responseContext(f, request, 'bestmove e2e4 ponder e7e5');
    assert.deepEqual(plain(accepted.response.data), {
        bestMove: 'e2e4', ponder: 'e7e5', scoreCp: null, mate: null,
        depth: null, pv: [], rawType: 'bestmove'
    });
    assert.equal(Object.isFrozen(accepted.response), true);
});

test('centipawn, mate, depth, and PV info are normalized without completing stream', () => {
    const f = fixture();
    const request = createActive(f, 'live-evaluation');
    const cp = responseContext(f, request, 'info depth 12 score cp -75 nodes 1 pv e2e4 e7e5');
    assert.equal(cp.response.data.scoreCp, -75);
    assert.equal(cp.response.data.depth, 12);
    assert.deepEqual(plain(cp.response.data.pv), ['e2e4', 'e7e5']);
    const mate = responseContext(f, request, 'info depth 20 score mate 3 pv e2e4');
    assert.equal(mate.response.data.mate, 3);
    assert.equal(f.boundary.getRequest(request.requestId).status, 'active');
});

test('malformed, unknown, wrong-type, and engine-error messages fail safely', () => {
    const f = fixture();
    const opponent = createActive(f);
    assert.equal(responseContext(f, opponent, null).status, 'malformed');
    assert.equal(responseContext(f, opponent, 'readyok').status, 'malformed');
    assert.equal(responseContext(f, opponent, 'info depth 1 score cp 1 pv e2e4').status, 'stale-request');
    assert.equal(responseContext(f, opponent, 'error engine failed').status, 'failed');
    assert.equal(f.boundary.getRequest(opponent.requestId).status, 'failed');
});

test('new session makes every old-session request stale', () => {
    const f = fixture();
    const request = createActive(f);
    f.boundary.createSession();
    assert.equal(f.boundary.getRequest(request.requestId).status, 'stale');
    assert.equal(responseContext(f, request, 'bestmove e2e4', {
        sessionId: f.boundary.getCurrentSession().sessionId
    }).status, 'stale-session');
});

test('diagnostics are bounded, detached, resettable, and contain no raw messages', () => {
    const f = fixture();
    const request = createActive(f);
    responseContext(f, request, 'readyok');
    const diagnostics = f.boundary.inspect();
    assert.equal(diagnostics.requestCount, 1);
    assert.equal(diagnostics.lastRequestId, request.requestId);
    assert.equal(JSON.stringify(diagnostics).includes('readyok'), false);
    assert.equal(Object.isFrozen(diagnostics), true);
    assert.equal(f.boundary.resetDiagnostics().ok, true);
    assert.equal(f.boundary.inspect().counters.malformed, 0);
});

test('dispose is idempotent, cancels and clears without touching legacy resources', () => {
    const f = fixture();
    createActive(f);
    assert.equal(f.boundary.dispose().ok, true);
    assert.equal(f.boundary.dispose().reason, 'already-disposed');
    assert.equal(f.boundary.inspect().requestCount, 0);
    assert.equal(f.resourceCalls.length, 0);
});

test('static guard forbids worker ownership, App writes, settings, UI, clocks, storage, and other domains', () => {
    for (const pattern of [
        /\bnew\s+Worker\b/, /\bApp\b/, /\brequestAnimationFrame\s*\(/, /\bsetInterval\s*\(/,
        /\bsetTimeout\s*\(/, /\.addEventListener\s*\(/, /\blocalStorage\b/, /\bsessionStorage\b/,
        /\bdocument\b/, /createElement|innerHTML|textContent/, /setSkillLevel|setMultiPV/,
        /\bgo\s*\(\s*\{/, /CaissaNavigation|AnalyzeSection|Mentor|Coach/
    ]) assert.doesNotMatch(source, pattern);
});

test('both SPA pages load isolation once before App', () => {
    for (const page of ['index.html', 'yahoo-classic.html']) {
        const html = fs.readFileSync(new URL(`../../${page}`, import.meta.url), 'utf8');
        assert.equal((html.match(/js\/play\/engine-request-isolation\.js/g) || []).length, 1);
        assert.ok(html.indexOf('engine-request-isolation.js?v=1.0.0') < html.search(/app\.js\?v=\d+\.\d+\.\d+/));
    }
});
