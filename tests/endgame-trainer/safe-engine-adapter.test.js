import assert from 'node:assert/strict';
import test from 'node:test';

import { ENGINE_STATES, SafeEngineAdapter, parseUciBestMove, parseUciInfo } from '../../js/endgame-trainer/safe-engine-adapter.js';

const FEN_A = '8/8/8/8/8/4k3/8/4K3 w - - 0 1';
const FEN_B = '8/8/8/8/4k3/8/8/4K3 b - - 0 1';

class FakeUciEngine {
    commands = [];
    terminated = false;
    terminateCalls = 0;
    removedListeners = 0;
    listeners = { message: new Set(), error: new Set() };

    postMessage(command) { this.commands.push(command); }
    addEventListener(type, listener) { this.listeners[type].add(listener); }
    removeEventListener(type, listener) { if (this.listeners[type].delete(listener)) this.removedListeners += 1; }
    emit(message) { for (const listener of this.listeners.message) listener({ data: message }); }
    emitError() { for (const listener of this.listeners.error) listener(new Error('private worker detail')); }
    terminate() { this.terminateCalls += 1; this.terminated = true; }
}

function factory() {
    const engines = [];
    return {
        engines,
        createEngine() {
            const engine = new FakeUciEngine();
            engines.push(engine);
            return engine;
        }
    };
}

async function initialized(configuration = {}) {
    const source = factory();
    const adapter = new SafeEngineAdapter({ createEngine: () => source.createEngine(), defaultTimeoutMs: 100, ...configuration });
    const promise = adapter.initialize();
    const engine = source.engines[0];
    engine.emit('option name MultiPV type spin default 1 min 1 max 5');
    engine.emit('option name Skill Level type spin default 20 min 0 max 20');
    engine.emit('option name UCI_LimitStrength type check default false');
    engine.emit('option name UCI_Elo type spin default 1320 min 1320 max 3190');
    engine.emit('uciok');
    engine.emit('readyok');
    await promise;
    return { adapter, engine, source };
}

function rejectionCode(code) {
    return (error) => error?.code === code && error.message === code;
}

function nextTurn() {
    return new Promise((resolve) => setImmediate(resolve));
}

async function handshake(engine, { multiPv = true } = {}) {
    if (multiPv) engine.emit('option name MultiPV type spin default 1 min 1 max 5');
    engine.emit('uciok');
    engine.emit('readyok');
    await nextTurn();
}

test('initialize follows uci handshake and applies declared controlled options', async () => {
    const source = factory();
    const adapter = new SafeEngineAdapter({ createEngine: () => source.createEngine(), options: { multiPv: 2 } });
    const promise = adapter.initialize();
    const engine = source.engines[0];
    assert.deepEqual(engine.commands, ['uci']);
    engine.emit('option name MultiPV type spin default 1 min 1 max 5');
    engine.emit('uciok');
    assert.deepEqual(engine.commands, ['uci', 'setoption name MultiPV value 2', 'isready']);
    engine.emit('readyok');
    await promise;
    assert.equal(adapter.isReady(), true);
    assert.equal(adapter.getState().state, ENGINE_STATES.READY);
});

test('initialize timeout is structured and terminates the failed engine', async () => {
    const source = factory();
    const adapter = new SafeEngineAdapter({ createEngine: () => source.createEngine(), defaultTimeoutMs: 5 });
    await assert.rejects(adapter.initialize(), rejectionCode('engine-initialization-timeout'));
    assert.equal(source.engines[0].terminated, true);
});

test('concurrent initialize calls share one promise and one engine', async () => {
    const source = factory();
    const adapter = new SafeEngineAdapter({ createEngine: () => source.createEngine() });
    const first = adapter.initialize();
    const second = adapter.initialize();
    assert.equal(first, second);
    assert.equal(source.engines.length, 1);
    source.engines[0].emit('uciok');
    source.engines[0].emit('readyok');
    await Promise.all([first, second]);
});

test('requestBestMove sends position/go and returns stable metadata', async () => {
    const { adapter, engine } = await initialized();
    const resultPromise = adapter.requestBestMove({ fen: FEN_A, depth: 12 });
    assert.match(engine.commands.at(-2), /^position fen /);
    assert.equal(engine.commands.at(-1), 'go depth 12');
    engine.emit('info depth 12 score cp 34 nodes 100 nps 200 time 5 pv e1e2');
    engine.emit('bestmove e1d1 ponder e3d3');
    const result = await resultPromise;
    assert.equal(result.bestMove, 'e1d1');
    assert.equal(result.ponder, 'e3d3');
    assert.equal(result.engineInfo.score.value, 34);
    assert.equal(result.completed, true);
});

test('analyzePosition receives normalized info and bestmove', async () => {
    const { adapter, engine } = await initialized();
    const snapshots = [];
    const resultPromise = adapter.analyzePosition({ fen: FEN_A, depth: 9, onInfo: (info) => snapshots.push(info) });
    engine.emit('info depth 9 seldepth 11 score mate -3 nodes 44 nps 88 time 2 pv e1e2 e3e2');
    engine.emit('bestmove e1d1');
    const result = await resultPromise;
    assert.deepEqual(snapshots[0].score, { type: 'mate', value: -3 });
    assert.deepEqual(result.lines[0].pv, ['e1e2', 'e3e2']);
});

test('MultiPV lines remain separate and ordered', async () => {
    const { adapter, engine } = await initialized();
    const resultPromise = adapter.analyzePosition({ fen: FEN_A, depth: 8, multiPv: 2 });
    assert.ok(engine.commands.includes('setoption name MultiPV value 2'));
    engine.emit('info depth 8 multipv 2 score cp 10 pv e1f1');
    engine.emit('info depth 8 multipv 1 score cp 20 pv e1e2');
    engine.emit('bestmove e1d1');
    const result = await resultPromise;
    assert.deepEqual(result.lines.map((line) => line.multipv), [1, 2]);
});

test('new request invalidates old request through a restarted transport', async () => {
    const { adapter, engine, source } = await initialized();
    const first = adapter.requestBestMove({ fen: FEN_A });
    const firstRejected = assert.rejects(first, rejectionCode('engine-search-cancelled'));
    const second = adapter.requestBestMove({ fen: FEN_B });
    assert.equal(engine.commands.at(-1), 'stop');
    assert.equal(engine.terminated, true);
    await firstRejected;
    const replacement = source.engines[1];
    assert.deepEqual(replacement.commands, ['uci']);
    replacement.emit('uciok');
    replacement.emit('readyok');
    await nextTurn();
    replacement.emit('bestmove e4e3');
    assert.equal((await second).fen, FEN_B);
});

test('principal race ignores stale messages from terminated transport after replacement readyok', async () => {
    const { adapter, engine, source } = await initialized();
    const infoB = [];
    const requestA = adapter.analyzePosition({ fen: FEN_A, onInfo: () => assert.fail('A callback should be detached') });
    const cancelledA = assert.rejects(requestA, rejectionCode('engine-search-cancelled'));
    const requestB = adapter.analyzePosition({ fen: FEN_B, onInfo: (info) => infoB.push(info) });
    const replacement = source.engines[1];
    replacement.emit('uciok');
    replacement.emit('readyok');
    engine.emit('bestmove e1d1');
    engine.emit('info depth 4 score cp 99 pv e1d1');
    assert.equal(infoB.length, 0);
    await nextTurn();
    replacement.emit('info depth 6 score cp 7 pv e4e3');
    replacement.emit('bestmove e4e3');
    await cancelledA;
    const resultB = await requestB;
    assert.equal(resultB.bestMove, 'e4e3');
    assert.equal(resultB.fen, FEN_B);
    assert.equal(infoB.length, 1);
    assert.equal(infoB[0].score.value, 7);
});

test('stop cancels active request and returns to ready after readyok', async () => {
    const { adapter, engine } = await initialized();
    const search = adapter.requestBestMove({ fen: FEN_A });
    const rejected = assert.rejects(search, rejectionCode('engine-search-cancelled'));
    const stopped = adapter.stop();
    engine.emit('bestmove e1d1');
    engine.emit('readyok');
    await Promise.all([rejected, stopped]);
    assert.equal(adapter.isReady(), true);
});

test('search timeout cancels only its owned request', async () => {
    const { adapter, engine } = await initialized();
    const timedOut = adapter.requestBestMove({ fen: FEN_A, timeoutMs: 5 });
    await assert.rejects(timedOut, rejectionCode('engine-search-timeout'));
    assert.deepEqual(engine.commands.slice(-2), ['stop', 'isready']);
    engine.emit('readyok');
});

test('AbortSignal cancels a running request', async () => {
    const { adapter, engine } = await initialized();
    const controller = new AbortController();
    const search = adapter.requestBestMove({ fen: FEN_A, signal: controller.signal });
    controller.abort();
    await assert.rejects(search, rejectionCode('engine-search-cancelled'));
    engine.emit('readyok');
});

test('pre-aborted signal rejects before engine commands and listener is cleaned', async () => {
    const { adapter, engine } = await initialized();
    const controller = new AbortController();
    controller.abort();
    const before = engine.commands.length;
    await assert.rejects(adapter.requestBestMove({ fen: FEN_A, signal: controller.signal }), rejectionCode('engine-search-cancelled'));
    assert.equal(engine.commands.length, before);

    const activeController = new AbortController();
    let adds = 0;
    let removes = 0;
    const add = activeController.signal.addEventListener.bind(activeController.signal);
    const remove = activeController.signal.removeEventListener.bind(activeController.signal);
    activeController.signal.addEventListener = (...args) => { adds += 1; return add(...args); };
    activeController.signal.removeEventListener = (...args) => { removes += 1; return remove(...args); };
    const search = adapter.requestBestMove({ fen: FEN_A, signal: activeController.signal });
    engine.emit('bestmove e1d1');
    await search;
    assert.equal(adds, 1);
    assert.equal(removes, 1);
});

test('dispose during search rejects, terminates and is idempotent', async () => {
    const { adapter, engine } = await initialized();
    const search = adapter.requestBestMove({ fen: FEN_A });
    adapter.dispose();
    adapter.dispose();
    await assert.rejects(search, rejectionCode('engine-disposed'));
    assert.equal(engine.terminated, true);
    assert.equal(adapter.getState().state, ENGINE_STATES.DISPOSED);
});

test('use after dispose fails for every active API', async () => {
    const { adapter } = await initialized();
    adapter.dispose();
    await assert.rejects(adapter.initialize(), rejectionCode('engine-disposed'));
    await assert.rejects(adapter.requestBestMove({ fen: FEN_A }), rejectionCode('engine-disposed'));
    await assert.rejects(adapter.stop(), rejectionCode('engine-disposed'));
});

test('invalid FEN fails before touching the engine', async () => {
    const { adapter, engine } = await initialized();
    const before = [...engine.commands];
    await assert.rejects(adapter.requestBestMove({ fen: 'invalid' }), rejectionCode('invalid-fen'));
    assert.deepEqual(engine.commands, before);
});

test('two adapter instances do not share engine or request state', async () => {
    const first = await initialized();
    const second = await initialized();
    const searchA = first.adapter.requestBestMove({ fen: FEN_A });
    const searchB = second.adapter.requestBestMove({ fen: FEN_B });
    first.engine.emit('bestmove e1d1');
    second.engine.emit('bestmove e4e3');
    assert.equal((await searchA).requestId, 1);
    assert.equal((await searchB).requestId, 1);
    assert.notEqual(first.engine, second.engine);
});

test('throwing info callback and logger cannot corrupt adapter', async () => {
    const logs = [];
    const { adapter, engine } = await initialized({ logger: (event) => { logs.push(event); throw new Error('observer'); } });
    const search = adapter.analyzePosition({ fen: FEN_A, onInfo: () => { throw new Error('consumer'); } });
    engine.emit('info depth 2 score cp 1 pv e1e2');
    engine.emit('bestmove e1d1');
    assert.equal((await search).completed, true);
    assert.deepEqual(logs, [{ event: 'info-callback-failed' }]);
});

test('worker error changes state and rejects request without leaking detail', async () => {
    const { adapter, engine } = await initialized();
    const search = adapter.requestBestMove({ fen: FEN_A });
    engine.emitError();
    await assert.rejects(search, rejectionCode('engine-protocol-error'));
    assert.equal(adapter.getState().state, ENGINE_STATES.ERROR);
});

test('readyok from failed engine cannot initialize a replacement engine', async () => {
    const source = factory();
    const adapter = new SafeEngineAdapter({ createEngine: () => source.createEngine(), defaultTimeoutMs: 5 });
    await assert.rejects(adapter.initialize(), rejectionCode('engine-initialization-timeout'));
    const oldEngine = source.engines[0];
    const retry = adapter.initialize();
    const newEngine = source.engines[1];
    oldEngine.emit('readyok');
    assert.equal(adapter.isReady(), false);
    newEngine.emit('uciok');
    newEngine.emit('readyok');
    await retry;
    assert.equal(adapter.isReady(), true);
});

test('bestmove 0000 and bestmove (none) normalize to no legal move', async () => {
    const { adapter, engine } = await initialized();
    const first = adapter.requestBestMove({ fen: FEN_A });
    engine.emit('bestmove 0000');
    assert.equal((await first).bestMove, null);
    const second = adapter.requestBestMove({ fen: FEN_B });
    engine.emit('bestmove (none)');
    assert.equal((await second).bestMove, null);
    assert.deepEqual(parseUciBestMove('bestmove (none)'), { bestMove: null, ponder: null });
});

test('stop without search is safe and sends no command', async () => {
    const { adapter, engine } = await initialized();
    const before = engine.commands.length;
    await adapter.stop();
    assert.equal(engine.commands.length, before);
    assert.equal(adapter.isReady(), true);
});

test('old timeout cannot cancel a newer request', async () => {
    const { adapter, engine, source } = await initialized();
    const first = adapter.requestBestMove({ fen: FEN_A, timeoutMs: 30 });
    const cancelled = assert.rejects(first, rejectionCode('engine-search-cancelled'));
    const second = adapter.requestBestMove({ fen: FEN_B, timeoutMs: 100 });
    const replacement = source.engines[1];
    replacement.emit('uciok');
    replacement.emit('readyok');
    await nextTurn();
    await new Promise((resolve) => setTimeout(resolve, 35));
    replacement.emit('bestmove e4e3');
    await cancelled;
    assert.equal((await second).bestMove, 'e4e3');
});

test('result arrays and MultiPV snapshots are independent across requests', async () => {
    const { adapter, engine } = await initialized();
    const first = adapter.analyzePosition({ fen: FEN_A });
    engine.emit('info depth 3 multipv 1 score cp 5 pv e1e2');
    engine.emit('bestmove e1d1');
    const firstResult = await first;
    firstResult.lines[0].pv.push('corruption');

    const second = adapter.analyzePosition({ fen: FEN_B });
    engine.emit('info depth 3 multipv 1 score cp 5 pv e4e3');
    engine.emit('bestmove e4e3');
    const secondResult = await second;
    assert.deepEqual(secondResult.lines[0].pv, ['e4e3']);
    assert.notEqual(firstResult.lines, secondResult.lines);
});

test('UCI parser normalizes only descriptive numeric fields and PV', () => {
    assert.deepEqual(parseUciInfo('info depth 10 seldepth 14 multipv 2 score cp -31 nodes 42 nps 84 time 5 pv e2e4 e7e5'), {
        depth: 10,
        seldepth: 14,
        multipv: 2,
        score: { type: 'cp', value: -31 },
        nodes: 42,
        nps: 84,
        time: 5,
        pv: ['e2e4', 'e7e5']
    });
});

test('unsupported options are not sent and invalid options are rejected', async () => {
    const source = factory();
    const original = { threads: 2 };
    const adapter = new SafeEngineAdapter({ createEngine: () => source.createEngine(), options: original });
    const initializing = adapter.initialize();
    source.engines[0].emit('uciok');
    source.engines[0].emit('readyok');
    await initializing;
    assert.equal(source.engines[0].commands.some((command) => command.includes('Threads')), false);
    assert.deepEqual(original, { threads: 2 });
    await assert.rejects(adapter.requestBestMove({ fen: FEN_A, depth: 0 }), rejectionCode('invalid-options'));
});

test('newGame uses a readiness barrier and remains ready', async () => {
    const { adapter, engine } = await initialized();
    const promise = adapter.newGame();
    assert.deepEqual(engine.commands.slice(-2), ['ucinewgame', 'isready']);
    engine.emit('readyok');
    await promise;
    assert.equal(adapter.isReady(), true);
});

test('replacement terminates the previous Worker exactly once', async () => {
    const { adapter, engine, source } = await initialized();
    const first = adapter.requestBestMove({ fen: FEN_A });
    const cancelled = assert.rejects(first, rejectionCode('engine-search-cancelled'));
    const second = adapter.requestBestMove({ fen: FEN_B });
    assert.equal(engine.terminateCalls, 1);
    await handshake(source.engines[1]);
    source.engines[1].emit('bestmove e4e3');
    await Promise.all([cancelled, second]);
    assert.equal(engine.terminateCalls, 1);
});

test('replacement creates exactly one new transport', async () => {
    const { adapter, source } = await initialized();
    const first = adapter.requestBestMove({ fen: FEN_A });
    const cancelled = assert.rejects(first, rejectionCode('engine-search-cancelled'));
    const second = adapter.requestBestMove({ fen: FEN_B });
    assert.equal(source.engines.length, 2);
    await handshake(source.engines[1]);
    source.engines[1].emit('bestmove e4e3');
    await Promise.all([cancelled, second]);
    assert.equal(source.engines.length, 2);
});

test('replacement performs a complete UCI handshake before position', async () => {
    const { adapter, source } = await initialized();
    const first = adapter.requestBestMove({ fen: FEN_A });
    void assert.rejects(first, rejectionCode('engine-search-cancelled'));
    const second = adapter.requestBestMove({ fen: FEN_B });
    const replacement = source.engines[1];
    assert.deepEqual(replacement.commands, ['uci']);
    replacement.emit('uciok');
    assert.equal(replacement.commands.at(-1), 'isready');
    assert.equal(replacement.commands.some((command) => command.startsWith('position ')), false);
    replacement.emit('readyok');
    await nextTurn();
    assert.match(replacement.commands.at(-2), /^position fen /);
    replacement.emit('bestmove e4e3');
    await second;
});

test('configured UCI options are rediscovered and reapplied on replacement', async () => {
    const { adapter, source } = await initialized({ options: { multiPv: 2 } });
    const first = adapter.requestBestMove({ fen: FEN_A });
    void assert.rejects(first, rejectionCode('engine-search-cancelled'));
    const second = adapter.requestBestMove({ fen: FEN_B });
    const replacement = source.engines[1];
    replacement.emit('option name MultiPV type spin default 1 min 1 max 5');
    replacement.emit('uciok');
    assert.ok(replacement.commands.includes('setoption name MultiPV value 2'));
    replacement.emit('readyok');
    await nextTurn();
    replacement.emit('bestmove e4e3');
    await second;
});

test('late message from the detached transport cannot settle replacement', async () => {
    const { adapter, engine, source } = await initialized();
    const first = adapter.requestBestMove({ fen: FEN_A });
    const cancelled = assert.rejects(first, rejectionCode('engine-search-cancelled'));
    const second = adapter.requestBestMove({ fen: FEN_B });
    await handshake(source.engines[1]);
    engine.emit('bestmove e1d1');
    let settled = false;
    second.then(() => { settled = true; });
    await nextTurn();
    assert.equal(settled, false);
    source.engines[1].emit('bestmove e4e3');
    assert.equal((await second).bestMove, 'e4e3');
    await cancelled;
});

test('illegal bestmove is ignored and a later legal move settles the request', async () => {
    const { adapter, engine } = await initialized();
    const search = adapter.requestBestMove({ fen: FEN_B });
    engine.emit('bestmove a1b1');
    assert.equal(adapter.getState().staleBestMoveCount, 1);
    engine.emit('bestmove e4e3');
    assert.equal((await search).bestMove, 'e4e3');
});

test('move from the wrong side is ignored', async () => {
    const { adapter, engine } = await initialized();
    const search = adapter.requestBestMove({ fen: FEN_B });
    engine.emit('bestmove e1d1');
    assert.equal(adapter.getState().staleBestMoveCount, 1);
    engine.emit('bestmove e4d4');
    assert.equal((await search).bestMove, 'e4d4');
});

test('legal UCI promotion is accepted', async () => {
    const { adapter, engine } = await initialized();
    const fen = 'k7/6P1/8/8/8/8/8/7K w - - 0 1';
    const search = adapter.requestBestMove({ fen });
    engine.emit('bestmove g7g8q');
    assert.equal((await search).bestMove, 'g7g8q');
});

test('illegal promotion is ignored before a legal promotion', async () => {
    const { adapter, engine } = await initialized();
    const fen = 'k7/6P1/8/8/8/8/8/7K w - - 0 1';
    const search = adapter.requestBestMove({ fen });
    engine.emit('bestmove g7g8k');
    assert.equal(adapter.getState().staleBestMoveCount, 1);
    engine.emit('bestmove g7g8r');
    assert.equal((await search).bestMove, 'g7g8r');
});

test('search timeout remains active while illegal bestmoves are ignored', async () => {
    const { adapter, engine } = await initialized();
    const search = adapter.requestBestMove({ fen: FEN_B, timeoutMs: 8 });
    engine.emit('bestmove a1b1');
    engine.emit('bestmove e1d1');
    await assert.rejects(search, rejectionCode('engine-search-timeout'));
    engine.emit('readyok');
    assert.equal(adapter.getState().staleBestMoveCount, 2);
});

test('createEngine failure during replacement rejects B and leaves error state', async () => {
    const source = factory();
    let calls = 0;
    const adapter = new SafeEngineAdapter({ createEngine: () => {
        calls += 1;
        if (calls === 2) throw new Error('private construction error');
        return source.createEngine();
    }, defaultTimeoutMs: 100 });
    const initialization = adapter.initialize();
    await handshake(source.engines[0]);
    await initialization;
    const first = adapter.requestBestMove({ fen: FEN_A });
    const cancelled = assert.rejects(first, rejectionCode('engine-search-cancelled'));
    await assert.rejects(adapter.requestBestMove({ fen: FEN_B }), rejectionCode('engine-load-failed'));
    await cancelled;
    assert.equal(adapter.getState().state, ENGINE_STATES.ERROR);
    assert.equal(source.engines[0].terminateCalls, 1);
    adapter.dispose();
});

test('abort during replacement initialization cancels B without starting search', async () => {
    const { adapter, source } = await initialized();
    const controller = new AbortController();
    const first = adapter.requestBestMove({ fen: FEN_A });
    const cancelled = assert.rejects(first, rejectionCode('engine-search-cancelled'));
    const second = adapter.requestBestMove({ fen: FEN_B, signal: controller.signal });
    const replacement = source.engines[1];
    controller.abort();
    await assert.rejects(second, rejectionCode('engine-search-cancelled'));
    await cancelled;
    assert.equal(replacement.terminateCalls, 1);
    assert.equal(replacement.commands.some((command) => command.startsWith('position ')), false);
    assert.equal(adapter.getState().state, ENGINE_STATES.ERROR);
});

test('dispose during replacement initialization terminates both transports', async () => {
    const { adapter, engine, source } = await initialized();
    const first = adapter.requestBestMove({ fen: FEN_A });
    const cancelled = assert.rejects(first, rejectionCode('engine-search-cancelled'));
    const second = adapter.requestBestMove({ fen: FEN_B });
    const replacement = source.engines[1];
    adapter.dispose();
    await assert.rejects(second, rejectionCode('engine-disposed'));
    await cancelled;
    assert.equal(engine.terminateCalls, 1);
    assert.equal(replacement.terminateCalls, 1);
    replacement.emit('uciok');
    replacement.emit('readyok');
    assert.equal(adapter.getState().state, ENGINE_STATES.DISPOSED);
});

test('timeout owned by A cannot terminate replacement Worker', async () => {
    const { adapter, source } = await initialized();
    const first = adapter.requestBestMove({ fen: FEN_A, timeoutMs: 20 });
    const cancelled = assert.rejects(first, rejectionCode('engine-search-cancelled'));
    const second = adapter.requestBestMove({ fen: FEN_B, timeoutMs: 100 });
    await handshake(source.engines[1]);
    await new Promise((resolve) => setTimeout(resolve, 25));
    assert.equal(source.engines[1].terminated, false);
    source.engines[1].emit('bestmove e4e3');
    await Promise.all([cancelled, second]);
});

test('replacement removes message and error listeners from old Worker', async () => {
    const { adapter, engine, source } = await initialized();
    const first = adapter.requestBestMove({ fen: FEN_A });
    void assert.rejects(first, rejectionCode('engine-search-cancelled'));
    const second = adapter.requestBestMove({ fen: FEN_B });
    assert.equal(engine.listeners.message.size, 0);
    assert.equal(engine.listeners.error.size, 0);
    assert.equal(engine.removedListeners, 2);
    await handshake(source.engines[1]);
    source.engines[1].emit('bestmove e4e3');
    await second;
});

test('two consecutive replacements use three isolated Workers', async () => {
    const { adapter, source } = await initialized();
    const requestA = adapter.requestBestMove({ fen: FEN_A });
    const cancelledA = assert.rejects(requestA, rejectionCode('engine-search-cancelled'));
    const requestB = adapter.requestBestMove({ fen: FEN_B });
    await handshake(source.engines[1]);
    const cancelledB = assert.rejects(requestB, rejectionCode('engine-search-cancelled'));
    const requestC = adapter.requestBestMove({ fen: FEN_A });
    await handshake(source.engines[2]);
    source.engines[2].emit('bestmove e1d1');
    assert.equal((await requestC).bestMove, 'e1d1');
    await Promise.all([cancelledA, cancelledB]);
    assert.equal(source.engines.length, 3);
    assert.equal(source.engines[0].terminateCalls, 1);
    assert.equal(source.engines[1].terminateCalls, 1);
});

test('search after explicit stop reuses the ready Worker', async () => {
    const { adapter, engine, source } = await initialized();
    const first = adapter.requestBestMove({ fen: FEN_A });
    const cancelled = assert.rejects(first, rejectionCode('engine-search-cancelled'));
    const stopping = adapter.stop();
    engine.emit('readyok');
    await Promise.all([cancelled, stopping]);
    const second = adapter.requestBestMove({ fen: FEN_B });
    engine.emit('bestmove e4e3');
    await second;
    assert.equal(source.engines.length, 1);
    assert.equal(engine.terminateCalls, 0);
});

test('two adapters keep independent transport generations', async () => {
    const first = await initialized();
    const second = await initialized();
    const beforeSecond = second.adapter.getState().transportGeneration;
    const requestA = first.adapter.requestBestMove({ fen: FEN_A });
    void assert.rejects(requestA, rejectionCode('engine-search-cancelled'));
    const requestB = first.adapter.requestBestMove({ fen: FEN_B });
    await handshake(first.source.engines[1]);
    first.source.engines[1].emit('bestmove e4e3');
    await requestB;
    assert.notEqual(first.adapter.getState().transportGeneration, beforeSecond);
    assert.equal(second.adapter.getState().transportGeneration, beforeSecond);
});

test('replacement timeout includes initialization time in B budget', async () => {
    const { adapter, source } = await initialized();
    const first = adapter.requestBestMove({ fen: FEN_A });
    void assert.rejects(first, rejectionCode('engine-search-cancelled'));
    await assert.rejects(adapter.requestBestMove({ fen: FEN_B, timeoutMs: 8 }), rejectionCode('engine-search-timeout'));
    assert.equal(source.engines[1].terminateCalls, 1);
    assert.equal(adapter.getState().state, ENGINE_STATES.ERROR);
});

test('replacement policy accepts only restart-worker', async () => {
    const source = factory();
    assert.throws(() => new SafeEngineAdapter({ createEngine: () => source.createEngine(), replacementPolicy: 'drain' }), rejectionCode('invalid-options'));
    const adapter = new SafeEngineAdapter({ createEngine: () => source.createEngine(), replacementPolicy: 'restart-worker' });
    assert.equal(adapter.getState().replacementPolicy, 'restart-worker');
});
