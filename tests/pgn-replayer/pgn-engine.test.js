import assert from 'node:assert/strict';
import test from 'node:test';

import { PgnAnalysisEngine, parseUciInfo, pvToSan } from '../../js/pgn-replayer/pgn-engine.js';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const AFTER_E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';

class FakeWorker {
  static instances = [];
  constructor(url, options) {
    this.url = url;
    this.options = options;
    this.commands = [];
    this.listeners = { message: new Set(), error: new Set() };
    this.terminateCalls = 0;
    FakeWorker.instances.push(this);
  }
  addEventListener(type, listener) { this.listeners[type]?.add(listener); }
  postMessage(command) { this.commands.push(command); }
  terminate() { this.terminateCalls += 1; }
  emit(message) { for (const listener of this.listeners.message) listener({ data: message }); }
}

function create(options = {}) {
  return new PgnAnalysisEngine({
    baseUrl: 'https://caissa.test/pgn-replayer',
    WorkerConstructor: FakeWorker,
    moveTimeMs: 250,
    ...options
  });
}

test.beforeEach(() => { FakeWorker.instances = []; });

test('parses MultiPV information and converts legal UCI moves to SAN', () => {
  const info = parseUciInfo('info depth 14 multipv 2 score cp -35 nodes 40 pv e2e4 e7e5 g1f3');
  assert.equal(info.depth, 14);
  assert.equal(info.multipv, 2);
  assert.deepEqual(info.score, { type: 'cp', value: -35 });
  assert.deepEqual(pvToSan(START_FEN, info.pv), ['e4', 'e5', 'Nf3']);
});

test('loads the existing same-origin Worker lazily with two analysis lines', async () => {
  const snapshots = [];
  const states = [];
  const engine = create({ onLines: lines => snapshots.push(lines), onState: state => states.push(state) });
  assert.equal(engine.initializationTimeoutMs, 60000);
  assert.equal(FakeWorker.instances.length, 0);
  const initialization = engine.enable(START_FEN);
  const worker = FakeWorker.instances[0];
  assert.equal(worker.url, 'https://caissa.test/engine/stockfish-working.js');
  assert.equal(worker.options.name, 'caissa-pgn-stockfish');
  assert.deepEqual(worker.commands, ['uci']);
  worker.emit('uciok');
  assert.deepEqual(worker.commands.slice(1, 5), [
    'setoption name MultiPV value 2',
    'setoption name Threads value 1',
    'setoption name Hash value 16',
    'isready'
  ]);
  worker.emit('readyok');
  await initialization;
  assert.match(worker.commands.at(-2), /^position fen /);
  assert.equal(worker.commands.at(-1), 'go movetime 250');
  worker.emit('info depth 10 multipv 1 score cp 42 pv e2e4 e7e5');
  worker.emit('info depth 10 multipv 2 score cp 18 pv d2d4 d7d5');
  const latest = snapshots.at(-1);
  assert.equal(latest.length, 2);
  assert.deepEqual(latest[0].san, ['e4', 'e5']);
  assert.deepEqual(latest[1].san, ['d4', 'd5']);
  worker.emit('bestmove e2e4');
  assert.equal(states.at(-1), 'ready');
});

test('stops an active search before analyzing the newest position', async () => {
  const engine = create();
  const initialization = engine.enable(START_FEN);
  const worker = FakeWorker.instances[0];
  worker.emit('uciok');
  worker.emit('readyok');
  await initialization;
  engine.analyze(AFTER_E4);
  assert.equal(worker.commands.at(-1), 'stop');
  worker.emit('bestmove e2e4');
  assert.equal(worker.commands.at(-2), `position fen ${AFTER_E4}`);
  assert.equal(worker.commands.at(-1), 'go movetime 250');
});

test('default off and disable terminate the Worker without persistence', async () => {
  const engine = create();
  assert.equal(engine.state, 'off');
  const initialization = engine.enable(START_FEN);
  const worker = FakeWorker.instances[0];
  worker.emit('uciok');
  worker.emit('readyok');
  await initialization;
  engine.disable();
  assert.equal(engine.state, 'off');
  assert.equal(worker.terminateCalls, 1);
});

test('rejects cross-origin engine assets', () => {
  assert.throws(() => create({ workerUrl: 'https://outside.test/stockfish.js' }), error => error.code === 'invalid-worker-url');
});

test('bounds a custom initialization timeout to a safe range', () => {
  assert.equal(create({ initializationTimeoutMs: 100 }).initializationTimeoutMs, 12000);
  assert.equal(create({ initializationTimeoutMs: 45000 }).initializationTimeoutMs, 45000);
  assert.equal(create({ initializationTimeoutMs: 240000 }).initializationTimeoutMs, 120000);
});
