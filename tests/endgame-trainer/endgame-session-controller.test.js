import test from 'node:test';
import assert from 'node:assert/strict';
import { ChessRulesFacade } from '../../js/endgame-trainer/chess-rules-facade.js';
import { EndgameSessionController } from '../../js/endgame-trainer/endgame-session-controller.js';

const FEN_A = '8/8/8/8/8/4k3/8/R3K3 w - - 0 1';
const FEN_B = '8/8/8/8/4k3/8/8/R3K3 b - - 0 1';
const PROMOTION_FEN = '4k3/P7/8/8/8/8/8/4K3 w - - 0 1';
const WHITE_MATE_FEN = '7k/8/5KQ1/8/8/8/8/8 w - - 0 1';
const BLACK_MATE_FEN = '8/8/8/8/8/5kq1/8/7K b - - 0 1';
const STALEMATE_FEN = 'k7/2Q5/2K5/8/8/8/8/8 w - - 0 1';
const ROOK_MATE_FEN = '7k/5K2/6R1/8/8/8/8/8 w - - 0 1';

function candidate(fen = FEN_A, type = 'basic-mate-practice', score = 90) {
    return { fen, positionKey: fen.split(' ').slice(0, 4).join(' '), classification: { type, labels: ['test'] }, scoring: { score }, metadata: { strongSide: 'white' } };
}

function legalLan(fen) {
    return ChessRulesFacade.fromFen(fen).legalMoves({ verbose: true })[0]?.lan;
}

class FakeEngine {
    constructor({ automatic = true, rejectStop = false } = {}) {
        this.automatic = automatic; this.rejectStop = rejectStop; this.pending = []; this.initializeCalls = 0;
        this.stopCalls = 0; this.disposeCalls = 0; this.searches = []; this.stopGate = null;
        this.metrics = { created: 0, resolved: 0, rejected: 0, pending: 0, doubleResolveAttempts: 0 };
    }
    async initialize() { this.initializeCalls += 1; }
    requestBestMove(options) { return this.#search('move', options); }
    analyzePosition(options) { return this.#search('hint', options); }
    #search(type, options) {
        this.searches.push({ type, options: structuredClone(options) });
        if (this.automatic) return Promise.resolve({ requestId: this.searches.length, fen: options.fen, bestMove: legalLan(options.fen), lines: [], completed: true });
        this.metrics.created += 1; this.metrics.pending += 1;
        return new Promise((resolve, reject) => this.pending.push({ type, options: structuredClone(options), resolve, reject, settled: false }));
    }
    resolveNext(overrides = {}) {
        const pending = this.pending.shift();
        assert.ok(pending, 'expected a pending engine request');
        if (pending.settled) { this.metrics.doubleResolveAttempts += 1; return pending; }
        pending.settled = true; this.metrics.resolved += 1; this.metrics.pending -= 1;
        pending.resolve({ requestId: 1, fen: pending.options.fen, bestMove: legalLan(pending.options.fen), lines: [], completed: true, ...overrides });
        return pending;
    }
    rejectNext(code = 'engine-search-timeout') {
        const pending = this.pending.shift(); assert.ok(pending);
        if (pending.settled) { this.metrics.doubleResolveAttempts += 1; return; }
        pending.settled = true; this.metrics.rejected += 1; this.metrics.pending -= 1;
        pending.reject(Object.assign(new Error(code), { code }));
    }
    delayStop() { this.stopGate = {}; this.stopGate.promise = new Promise((resolve) => { this.stopGate.resolve = resolve; }); }
    releaseStop() { this.stopGate?.resolve(); this.stopGate = null; }
    async stop() { this.stopCalls += 1; if (this.rejectStop) throw Object.assign(new Error('stop-failed'), { code: 'stop-failed' }); if (this.stopGate) await this.stopGate.promise; }
    dispose() { this.disposeCalls += 1; }
}

function setup({ fens = [FEN_A], automatic = true, rejectStop = false, selector, idPrefix = 'session', idFactory } = {}) {
    const engine = new FakeEngine({ automatic, rejectStop });
    let selectionIndex = 0;
    let id = 0;
    let engineCreations = 0;
    const selections = [];
    const controller = new EndgameSessionController({
        createEngineAdapter(options) { engineCreations += 1; engine.creationOptions = structuredClone(options); return engine; },
        candidateSelector: selector ?? ((options) => { selections.push(structuredClone(options)); return { ok: true, selected: candidate(fens[Math.min(selectionIndex++, fens.length - 1)]) }; }),
        idFactory: idFactory ?? (() => `${idPrefix}-${++id}`),
        now: () => 1234,
        defaultEngineOptions: { depth: 5 }
    });
    return { controller, engine, selections, get engineCreations() { return engineCreations; } };
}

async function prepared(context, options = {}) {
    await context.controller.prepareSession({ categoryId: 'KRK', userColor: 'white', seed: 'seed', ...options });
    return context;
}

async function started(context, options = {}) { await prepared(context, options); await context.controller.startSession(); return context; }
function rejectsCode(promise, code) { return assert.rejects(promise, (error) => error?.code === code); }

test('1 prepareSession builds a ready deterministic session', async () => {
    const context = await prepared(setup()); const state = context.controller.getState();
    assert.equal(state.status, 'ready'); assert.equal(state.initialFen, FEN_A); assert.equal(state.attemptNumber, 1); assert.equal(context.engine.initializeCalls, 1);
});
test('2 prepareSession rejects invalid options and selector failures', async () => {
    await rejectsCode(setup().controller.prepareSession({}), 'invalid-options');
    await rejectsCode(setup({ selector: () => ({ ok: false, error: { code: 'unknown-category' } }) }).controller.prepareSession({ categoryId: 'BAD' }), 'unknown-category');
});
test('3 userColor white is preserved', async () => { assert.equal((await prepared(setup())).controller.getState().userColor, 'white'); });
test('4 userColor black is preserved', async () => { assert.equal((await prepared(setup(), { userColor: 'black' })).controller.getState().userColor, 'black'); });
test('5 random userColor is reproducible from seed', async () => {
    const a = await prepared(setup(), { userColor: 'random', seed: 'same' }); const b = await prepared(setup(), { userColor: 'random', seed: 'same' });
    assert.equal(a.controller.getState().userColor, b.controller.getState().userColor);
});
test('6 start enters user-turn when the user moves', async () => { assert.equal((await started(setup())).controller.getState().status, 'user-turn'); });
test('7 start requests the engine when it moves', async () => {
    const context = await prepared(setup({ fens: [FEN_B], automatic: false })); const promise = context.controller.startSession();
    assert.equal(context.controller.getState().status, 'engine-thinking'); context.engine.resolveNext(); await promise; assert.equal(context.controller.getState().status, 'user-turn');
});
test('8 a legal user move and engine reply are recorded', async () => {
    const context = await started(setup()); await context.controller.playUserMove(legalLan(FEN_A)); assert.equal(context.controller.getState().moveHistory.length, 2);
});
test('9 illegal user move is rejected', async () => { const c = await started(setup()); await rejectsCode(c.controller.playUserMove('a1e1'), 'invalid-move'); });
test('10 missing promotion piece is reported', async () => {
    const c = await started(setup({ fens: [PROMOTION_FEN] })); await rejectsCode(c.controller.playUserMove('a7a8'), 'promotion-required');
});
test('11 engine move is independently applied', async () => { const c = await started(setup()); await c.controller.playUserMove(legalLan(FEN_A)); assert.equal(c.controller.getState().moveHistory[1].actor, 'engine'); });
test('12 illegal engine move produces structured error', async () => {
    const c = await started(setup({ automatic: false })); const promise = c.controller.playUserMove(legalLan(FEN_A)); c.engine.resolveNext({ bestMove: 'a1a8' }); await rejectsCode(promise, 'engine-move-failed'); assert.equal(c.controller.getState().status, 'error');
});
test('13 engine timeout produces structured error', async () => {
    const c = await started(setup({ automatic: false })); const promise = c.controller.playUserMove(legalLan(FEN_A)); c.engine.rejectNext(); await rejectsCode(promise, 'engine-move-failed');
});
test('14 hint does not alter FEN or history', async () => {
    const c = await started(setup()); const before = c.controller.getState(); await c.controller.requestHint(); const after = c.controller.getState(); assert.equal(after.currentFen, before.currentFen); assert.deepEqual(after.moveHistory, []);
});
test('15 hint increments its counter', async () => { const c = await started(setup()); await c.controller.requestHint(); assert.equal(c.controller.getState().hintsUsed, 1); });
test('16 stale hint is ignored after restart', async () => {
    const c = await started(setup({ automatic: false })); const hint = c.controller.requestHint(); await c.controller.restart(); c.engine.resolveNext(); await rejectsCode(hint, 'stale-operation'); assert.equal(c.controller.getState().hintsUsed, 0);
});
test('17 undo reverts a complete user-engine turn', async () => {
    const c = await started(setup()); await c.controller.playUserMove(legalLan(FEN_A)); await c.controller.undo(); assert.equal(c.controller.getState().currentFen, FEN_A); assert.equal(c.controller.getState().moveHistory.length, 0);
});
test('18 undo with one move cancels the pending reply', async () => {
    const c = await started(setup({ automatic: false })); const play = c.controller.playUserMove(legalLan(FEN_A)); await c.controller.undo(); c.engine.resolveNext(); await rejectsCode(play, 'stale-operation'); assert.equal(c.controller.getState().currentFen, FEN_A);
});
test('19 restart preserves the selected position', async () => { const c = await started(setup()); await c.controller.restart(); assert.equal(c.controller.getState().initialFen, FEN_A); });
test('20 restart increments attempt number', async () => { const c = await started(setup()); await c.controller.restart(); assert.equal(c.controller.getState().attemptNumber, 2); });
test('21 newPosition changes sessionId and resets counters', async () => {
    const c = await prepared(setup({ fens: [FEN_A, FEN_B] })); const old = c.controller.getState().sessionId; await c.controller.newPosition({ userColor: 'black' }); const state = c.controller.getState(); assert.notEqual(state.sessionId, old); assert.equal(state.attemptNumber, 1);
});
test('22 newPosition invalidates an old engine response', async () => {
    const c = await started(setup({ fens: [FEN_A, FEN_A], automatic: false })); const old = c.controller.playUserMove(legalLan(FEN_A)); await c.controller.newPosition(); const session = c.controller.getState().sessionId; c.engine.resolveNext(); await rejectsCode(old, 'stale-operation'); assert.equal(c.controller.getState().sessionId, session);
});
test('23 resign cancels an active engine operation', async () => {
    const c = await started(setup({ automatic: false })); const play = c.controller.playUserMove(legalLan(FEN_A)); await c.controller.resign(); c.engine.resolveNext(); await rejectsCode(play, 'stale-operation'); assert.equal(c.controller.getState().status, 'resigned'); assert.equal(c.engine.stopCalls, 1);
});
test('24 flipOrientation changes only orientation', async () => {
    const c = await prepared(setup()); const before = c.controller.getState(); c.controller.flipOrientation(); const after = c.controller.getState(); assert.equal(after.currentFen, before.currentFen); assert.equal(after.userColor, before.userColor); assert.notEqual(after.orientation, before.orientation);
});
test('25 dispose is idempotent', async () => { const c = await prepared(setup()); c.controller.dispose(); c.controller.dispose(); assert.equal(c.engine.disposeCalls, 1); });
test('26 public APIs reject use after dispose', async () => { const c = await prepared(setup()); c.controller.dispose(); await rejectsCode(c.controller.prepareSession({ categoryId: 'KRK' }), 'session-disposed'); assert.throws(() => c.controller.flipOrientation(), (e) => e.code === 'session-disposed'); });
test('27 double start is rejected', async () => { const c = await started(setup()); await rejectsCode(c.controller.startSession(), 'invalid-session-state'); });
test('28 double user move cannot overlap engine thinking', async () => {
    const c = await started(setup({ automatic: false })); const first = c.controller.playUserMove(legalLan(FEN_A)); await rejectsCode(c.controller.playUserMove('e1d1'), 'not-user-turn'); c.engine.resolveNext(); await first;
});
test('29 engine response after resign cannot mutate state', async () => {
    const c = await started(setup({ automatic: false })); const play = c.controller.playUserMove(legalLan(FEN_A)); await c.controller.resign(); const snapshot = c.controller.getState(); c.engine.resolveNext(); await rejectsCode(play, 'stale-operation'); assert.deepEqual(c.controller.getState(), snapshot);
});
test('30 engine response after dispose is ignored', async () => {
    const c = await started(setup({ automatic: false })); const play = c.controller.playUserMove(legalLan(FEN_A)); c.controller.dispose(); c.engine.resolveNext(); await rejectsCode(play, 'stale-operation'); assert.equal(c.controller.getState().status, 'disposed');
});
test('31 engine response with a different FEN is rejected', async () => {
    const c = await started(setup({ automatic: false })); const play = c.controller.playUserMove(legalLan(FEN_A)); c.engine.resolveNext({ fen: FEN_B }); await rejectsCode(play, 'engine-move-failed'); assert.equal(c.controller.getState().moveHistory.length, 1);
});
test('32 subscribers receive snapshots', async () => { const c = setup(); const states = []; c.controller.subscribe((state) => states.push(state.status)); await prepared(c); assert.ok(states.includes('preparing')); assert.ok(states.includes('ready')); });
test('33 throwing subscribers cannot break the controller', async () => { const c = setup(); c.controller.subscribe(() => { throw new Error('observer'); }); await prepared(c); assert.equal(c.controller.getState().status, 'ready'); });
test('34 unsubscribe is idempotent and effective', async () => { const c = setup(); let calls = 0; const off = c.controller.subscribe(() => calls++); off(); off(); await prepared(c); assert.equal(calls, 0); });
test('35 public snapshots share no mutable references', async () => {
    const c = await prepared(setup()); const snapshot = c.controller.getState(); snapshot.classification.labels.push('mutated'); snapshot.versions.controller = 'bad'; assert.equal(c.controller.getState().classification.labels.length, 1); assert.equal(c.controller.getState().versions.controller, '1.0.0');
});
test('36 two controllers remain independent', async () => { const a = await prepared(setup({ idPrefix: 'a' })); const b = await prepared(setup({ idPrefix: 'b' }), { userColor: 'black' }); a.controller.flipOrientation(); assert.notEqual(a.controller.getState().sessionId, b.controller.getState().sessionId); assert.equal(b.controller.getState().userColor, 'black'); });
test('37 one controller creates at most one engine adapter', async () => { const c = await started(setup()); await c.controller.requestHint(); await c.controller.restart(); assert.equal(c.engineCreations, 1); });
test('38 a user move cancels a pending hint before starting the engine move', async () => {
    const c = await started(setup({ automatic: false }));
    const hint = c.controller.requestHint();
    const move = c.controller.playUserMove(legalLan(FEN_A));
    c.engine.resolveNext();
    await rejectsCode(hint, 'stale-operation');
    await Promise.resolve();
    c.engine.resolveNext();
    await move;
    assert.equal(c.controller.getState().hintsUsed, 0);
    assert.equal(c.engine.searches.length, 2);
});
test('39 restart during engine-thinking invalidates the old operation', async () => {
    const c = await started(setup({ automatic: false })); const play = c.controller.playUserMove(legalLan(FEN_A)); await c.controller.restart(); c.engine.resolveNext(); await rejectsCode(play, 'stale-operation'); assert.equal(c.controller.getState().attemptNumber, 2);
});
test('40 principal race keeps session B isolated from session A', async () => {
    const c = await started(setup({ fens: [FEN_A, FEN_B], automatic: false }));
    const operationA = c.controller.playUserMove(legalLan(FEN_A));
    await c.controller.newPosition({ userColor: 'white' });
    const sessionB = c.controller.getState();
    c.engine.resolveNext({ bestMove: 'a1a2' });
    await rejectsCode(operationA, 'stale-operation');
    assert.equal(c.controller.getState().sessionId, sessionB.sessionId);
    assert.equal(c.controller.getState().currentFen, sessionB.currentFen);
    assert.deepEqual(c.controller.getState().moveHistory, []);
    const operationB = c.controller.startSession();
    c.engine.resolveNext();
    await operationB;
    assert.equal(c.controller.getState().sessionId, sessionB.sessionId);
    assert.equal(c.controller.getState().moveHistory.length, 1);
});

test('41 rapid double start creates only one initial engine search', async () => {
    const c = await prepared(setup({ fens: [FEN_B], automatic: false }));
    const first = c.controller.startSession();
    await rejectsCode(c.controller.startSession(), 'invalid-session-state');
    assert.equal(c.engine.searches.length, 1);
    c.engine.resolveNext(); await first;
});
test('42 restart during the initial engine move replaces ownership safely', async () => {
    const c = await prepared(setup({ fens: [FEN_B], automatic: false }));
    const initial = c.controller.startSession();
    const restart = c.controller.restart();
    await Promise.resolve();
    c.engine.resolveNext(); await rejectsCode(initial, 'stale-operation');
    await Promise.resolve(); c.engine.resolveNext(); await restart;
    assert.equal(c.controller.getState().attemptNumber, 2);
    assert.equal(c.controller.getState().moveHistory.length, 1);
});
test('43 newPosition during the initial engine move isolates the new session', async () => {
    const c = await prepared(setup({ fens: [FEN_B, FEN_A], automatic: false }));
    const initial = c.controller.startSession(); const oldId = c.controller.getState().sessionId;
    await c.controller.newPosition({ userColor: 'white' }); c.engine.resolveNext(); await rejectsCode(initial, 'stale-operation');
    assert.notEqual(c.controller.getState().sessionId, oldId); assert.equal(c.controller.getState().currentFen, FEN_A);
});
test('44 resign during the initial engine move remains resigned', async () => {
    const c = await prepared(setup({ fens: [FEN_B], automatic: false })); const initial = c.controller.startSession(); await c.controller.resign(); c.engine.resolveNext(); await rejectsCode(initial, 'stale-operation'); assert.equal(c.controller.getState().status, 'resigned');
});
test('45 dispose during the initial engine move remains disposed', async () => {
    const c = await prepared(setup({ fens: [FEN_B], automatic: false })); const initial = c.controller.startSession(); c.controller.dispose(); c.engine.resolveNext(); await rejectsCode(initial, 'stale-operation'); assert.equal(c.controller.getState().status, 'disposed');
});
test('46 initial engine timeout is recoverable through restart', async () => {
    const c = await prepared(setup({ fens: [FEN_B], automatic: false })); const initial = c.controller.startSession(); c.engine.rejectNext(); await rejectsCode(initial, 'engine-move-failed'); assert.equal(c.controller.getState().status, 'error'); const restart = c.controller.restart(); await Promise.resolve(); c.engine.resolveNext(); await restart; assert.equal(c.controller.getState().status, 'user-turn');
});
test('47 illegal first engine move is rejected without history', async () => {
    const c = await prepared(setup({ fens: [FEN_B], automatic: false })); const initial = c.controller.startSession(); c.engine.resolveNext({ bestMove: 'a1a8' }); await rejectsCode(initial, 'engine-move-failed'); assert.equal(c.controller.getState().moveHistory.length, 0);
});
test('48 concurrent hints are rejected without a second search', async () => {
    const c = await started(setup({ automatic: false })); const first = c.controller.requestHint(); await rejectsCode(c.controller.requestHint(), 'invalid-session-state'); assert.equal(c.engine.searches.length, 1); c.engine.resolveNext(); await first;
});
test('49 hint followed by newPosition is stale and counters reset', async () => {
    const c = await started(setup({ fens: [FEN_A, FEN_A], automatic: false })); const hint = c.controller.requestHint(); await c.controller.newPosition(); c.engine.resolveNext(); await rejectsCode(hint, 'stale-operation'); assert.equal(c.controller.getState().hintsUsed, 0);
});
test('50 hint followed by resign remains resigned', async () => {
    const c = await started(setup({ automatic: false })); const hint = c.controller.requestHint(); await c.controller.resign(); c.engine.resolveNext(); await rejectsCode(hint, 'stale-operation'); assert.equal(c.controller.getState().status, 'resigned');
});
test('51 hint followed by dispose remains disposed', async () => {
    const c = await started(setup({ automatic: false })); const hint = c.controller.requestHint(); c.controller.dispose(); c.engine.resolveNext(); await rejectsCode(hint, 'stale-operation'); assert.equal(c.controller.getState().status, 'disposed');
});
test('52 hint timeout, illegal move and wrong FEN are recoverable', async () => {
    const c = await started(setup({ automatic: false })); let hint = c.controller.requestHint(); c.engine.rejectNext(); await rejectsCode(hint, 'hint-failed'); assert.equal(c.controller.getState().status, 'user-turn'); hint = c.controller.requestHint(); c.engine.resolveNext({ bestMove: 'a1e1' }); await rejectsCode(hint, 'hint-failed'); hint = c.controller.requestHint(); c.engine.resolveNext({ fen: FEN_B }); await rejectsCode(hint, 'hint-failed'); assert.equal(c.controller.getState().error, null);
});
test('53 failed undo leaves counters and state unchanged', async () => {
    const c = await started(setup()); const before = c.controller.getState(); await rejectsCode(c.controller.undo(), 'invalid-session-state'); assert.deepEqual(c.controller.getState(), before);
});
test('54 undo during a hint cancels the hint and reverts the prior turn', async () => {
    const c = await started(setup()); await c.controller.playUserMove(legalLan(FEN_A)); c.engine.automatic = false; const hint = c.controller.requestHint(); await c.controller.undo(); c.engine.resolveNext(); await rejectsCode(hint, 'stale-operation'); assert.equal(c.controller.getState().currentFen, FEN_A); assert.equal(c.controller.getState().undosUsed, 1);
});
test('55 undo after an engine-first move restores ready at the original FEN', async () => {
    const c = await prepared(setup({ fens: [FEN_B] }), { userColor: 'white' }); await c.controller.startSession(); await c.controller.undo(); const state = c.controller.getState(); assert.equal(state.currentFen, FEN_B); assert.equal(state.status, 'ready');
});
test('56 delayed stop serializes newPosition while an old response becomes stale', async () => {
    const c = await started(setup({ fens: [FEN_A, FEN_A], automatic: false })); const old = c.controller.playUserMove(legalLan(FEN_A)); c.engine.delayStop(); const next = c.controller.newPosition(); await Promise.resolve(); c.engine.resolveNext(); await rejectsCode(old, 'stale-operation'); assert.equal(c.controller.getState().status, 'engine-thinking'); c.engine.releaseStop(); await next; assert.equal(c.controller.getState().status, 'ready');
});
test('57 rejected stop does not prevent restart recovery', async () => {
    const c = await started(setup({ automatic: false, rejectStop: true })); const old = c.controller.playUserMove(legalLan(FEN_A)); await c.controller.restart(); c.engine.resolveNext(); await rejectsCode(old, 'stale-operation'); assert.equal(c.controller.getState().status, 'user-turn');
});
test('58 failed prepare enters recoverable error state', async () => {
    let calls = 0; const c = setup({ selector: () => ++calls === 1 ? { ok: false, error: { code: 'no-candidate-available' } } : { ok: true, selected: candidate() } }); await rejectsCode(c.controller.prepareSession({ categoryId: 'KRK' }), 'candidate-selection-failed'); assert.equal(c.controller.getState().status, 'error'); await c.controller.prepareSession({ categoryId: 'KRK', userColor: 'white' }); assert.equal(c.controller.getState().status, 'ready');
});
test('59 newPosition merges defined options without mutating inputs', async () => {
    const c = setup({ fens: [FEN_A, FEN_A] }); const options = { categoryId: 'KRK', userColor: 'white', seed: 'one', candidateCount: 4, recentPositionKeys: ['x'], engineOptions: { depth: 4, multiPv: 2 } }; await c.controller.prepareSession(options); await c.controller.newPosition({ seed: undefined, engineOptions: { depth: 6 } }); assert.deepEqual(options.engineOptions, { depth: 4, multiPv: 2 }); assert.equal(c.selections[1].seed, 'one'); assert.equal(c.selections[1].candidateCount, 4); assert.deepEqual(c.engine.creationOptions, { depth: 4, multiPv: 2 });
});
test('60 listener order is stable and unsubscribe during emission affects later emissions', async () => {
    const c = setup(); const order = []; let offSecond; c.controller.subscribe(() => { order.push('first'); offSecond(); }); offSecond = c.controller.subscribe(() => order.push('second')); await prepared(c); const firstEmission = order.slice(); c.controller.flipOrientation(); assert.deepEqual(firstEmission, ['first', 'second', 'first']); assert.equal(order.at(-1), 'first');
});
test('61 reentrant flip from a subscriber is rejected without recursion', async () => {
    const c = setup(); let code; c.controller.subscribe(() => { try { c.controller.flipOrientation(); } catch (error) { code = error.code; } }); await prepared(c); assert.equal(code, 'invalid-session-state');
});
test('62 dispose from a subscriber stops further notifications and engine creation', async () => {
    const c = setup(); let second = 0; c.controller.subscribe(() => c.controller.dispose()); c.controller.subscribe(() => second++); await rejectsCode(c.controller.prepareSession({ categoryId: 'KRK', userColor: 'white' }), 'stale-operation'); assert.equal(second, 0); assert.equal(c.controller.getState().status, 'disposed'); assert.equal(c.engineCreations, 0);
});
test('63 duplicate session IDs remain isolated by generation', async () => {
    const c = await started(setup({ fens: [FEN_A, FEN_A], automatic: false, idFactory: () => 'duplicate' })); const old = c.controller.playUserMove(legalLan(FEN_A)); await c.controller.newPosition(); c.engine.resolveNext(); await rejectsCode(old, 'stale-operation'); assert.equal(c.controller.getState().sessionId, 'duplicate'); assert.deepEqual(c.controller.getState().moveHistory, []);
});
test('64 invalid session IDs fail prepare transactionally', async () => {
    const c = setup({ idFactory: () => '' }); await rejectsCode(c.controller.prepareSession({ categoryId: 'KRK' }), 'invalid-options'); assert.equal(c.controller.getState().status, 'error');
});
test('65 dispose during a slow prepare prevents late commit', async () => {
    let release; const selector = () => new Promise((resolve) => { release = () => resolve({ ok: true, selected: candidate() }); }); const c = setup({ selector }); const prepare = c.controller.prepareSession({ categoryId: 'KRK' }); c.controller.dispose(); release(); await rejectsCode(prepare, 'stale-operation'); assert.equal(c.controller.getState().status, 'disposed');
});
test('66 controlled promise metrics reach zero after settlement', async () => {
    const c = await started(setup({ automatic: false })); const hint = c.controller.requestHint(); c.engine.resolveNext(); await hint; assert.deepEqual(c.engine.metrics, { created: 1, resolved: 1, rejected: 0, pending: 0, doubleResolveAttempts: 0 });
});
test('67 white user checkmate in KQK is attributed as completed', async () => {
    const c = await started(setup({ fens: [WHITE_MATE_FEN] }), { categoryId: 'KQK', userColor: 'white' }); await c.controller.playUserMove('g6g7'); const result = c.controller.getState().result; assert.equal(result.gameResult, 'checkmate'); assert.equal(result.exerciseOutcome, 'completed'); assert.equal(c.controller.getState().moveHistory[0].actor, 'user');
});
test('68 black user checkmate in KQK is attributed as completed', async () => {
    const c = await started(setup({ fens: [BLACK_MATE_FEN] }), { categoryId: 'KQK', userColor: 'black' }); await c.controller.playUserMove('g3g2'); assert.equal(c.controller.getState().result.exerciseOutcome, 'completed');
});
test('69 engine checkmate is never attributed as completed', async () => {
    const c = await prepared(setup({ fens: [WHITE_MATE_FEN], automatic: false }), { categoryId: 'KQK', userColor: 'black' }); const start = c.controller.startSession(); c.engine.resolveNext({ bestMove: 'g6g7' }); await start; assert.equal(c.controller.getState().result.gameResult, 'checkmate'); assert.equal(c.controller.getState().result.exerciseOutcome, 'unknown'); assert.equal(c.controller.getState().moveHistory[0].actor, 'engine');
});
test('70 stalemate preserves its cause and never completes the exercise', async () => {
    const c = await started(setup({ fens: [STALEMATE_FEN] }), { categoryId: 'KQK', userColor: 'white' }); await c.controller.playUserMove('c7b6'); assert.equal(c.controller.getState().result.gameResult, 'stalemate'); assert.equal(c.controller.getState().result.exerciseOutcome, 'unknown');
});
test('71 user checkmate in KRK is attributed as completed', async () => {
    const c = await started(setup({ fens: [ROOK_MATE_FEN] }), { categoryId: 'KRK', userColor: 'white' }); await c.controller.playUserMove('g6h6'); assert.equal(c.controller.getState().result.gameResult, 'checkmate'); assert.equal(c.controller.getState().result.exerciseOutcome, 'completed');
});
test('72 engine stalemate preserves actor and remains unknown', async () => {
    const c = await prepared(setup({ fens: [STALEMATE_FEN], automatic: false }), { categoryId: 'KQK', userColor: 'black' }); const start = c.controller.startSession(); c.engine.resolveNext({ bestMove: 'c7b6' }); await start; assert.equal(c.controller.getState().result.gameResult, 'stalemate'); assert.equal(c.controller.getState().result.exerciseOutcome, 'unknown'); assert.equal(c.controller.getState().moveHistory[0].actor, 'engine');
});
test('73 two concurrent prepare calls allow only the first transaction', async () => {
    let release; const c = setup({ selector: () => new Promise((resolve) => { release = () => resolve({ ok: true, selected: candidate() }); }) }); const first = c.controller.prepareSession({ categoryId: 'KRK', userColor: 'white' }); await rejectsCode(c.controller.prepareSession({ categoryId: 'KRK' }), 'invalid-session-state'); release(); await first; assert.equal(c.controller.getState().status, 'ready'); assert.equal(c.engineCreations, 1);
});
test('74 restart during the first prepare is rejected without cancelling prepare', async () => {
    let release; const c = setup({ selector: () => new Promise((resolve) => { release = () => resolve({ ok: true, selected: candidate() }); }) }); const prepare = c.controller.prepareSession({ categoryId: 'KRK', userColor: 'white' }); await rejectsCode(c.controller.restart(), 'invalid-session-state'); release(); await prepare; assert.equal(c.controller.getState().attemptNumber, 1);
});
test('75 newPosition during the first prepare is rejected without cancelling prepare', async () => {
    let release; const c = setup({ selector: () => new Promise((resolve) => { release = () => resolve({ ok: true, selected: candidate() }); }) }); const prepare = c.controller.prepareSession({ categoryId: 'KRK', userColor: 'white' }); await rejectsCode(c.controller.newPosition(), 'invalid-session-state'); release(); await prepare; assert.equal(c.controller.getState().status, 'ready');
});
test('76 newPosition recovers from an engine error with a fresh session', async () => {
    const c = await started(setup({ fens: [FEN_A, FEN_A], automatic: false })); const play = c.controller.playUserMove(legalLan(FEN_A)); c.engine.rejectNext(); await rejectsCode(play, 'engine-move-failed'); const oldId = c.controller.getState().sessionId; await c.controller.newPosition(); assert.notEqual(c.controller.getState().sessionId, oldId); assert.equal(c.controller.getState().status, 'ready'); assert.equal(c.controller.getState().error, null);
});
