import assert from 'node:assert/strict';
import test from 'node:test';

import { SafeEngineAdapter } from '../../js/endgame-trainer/safe-engine-adapter.js';
import { createStockfishWorker, resolveStockfishWorkerUrl } from '../../js/endgame-trainer/stockfish-worker-factory.js';

const BASE_URL = 'https://caissa.test/tools/harness.html';

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
    postMessage(command) { this.commands.push(command); }
    addEventListener(type, listener) { this.listeners[type]?.add(listener); }
    removeEventListener(type, listener) { this.listeners[type]?.delete(listener); }
    terminate() { this.terminateCalls += 1; }
    emit(message) { for (const listener of this.listeners.message) listener({ data: message }); }
}

function create(options = {}) {
    return createStockfishWorker({ baseUrl: BASE_URL, WorkerConstructor: FakeWorker, ...options });
}

function rejectsCode(code) {
    return (error) => error?.code === code && error.message === code;
}

test.beforeEach(() => { FakeWorker.instances = []; });

test('default URL resolves to confirmed raw engine asset', () => {
    assert.equal(resolveStockfishWorkerUrl({ baseUrl: BASE_URL }).href, 'https://caissa.test/engine/stockfish-working.js');
});

test('relative URL resolves against explicit base URL', () => {
    assert.equal(resolveStockfishWorkerUrl({ baseUrl: BASE_URL, workerUrl: '../engine/custom.js' }).href, 'https://caissa.test/engine/custom.js');
});

test('absolute same-origin URL is accepted', () => {
    assert.equal(resolveStockfishWorkerUrl({ baseUrl: BASE_URL, workerUrl: 'https://caissa.test/engine/stockfish-working.js' }).origin, 'https://caissa.test');
});

test('cross-origin URL is rejected by default', () => {
    assert.throws(() => resolveStockfishWorkerUrl({ baseUrl: BASE_URL, workerUrl: 'https://engine.test/stockfish.js' }), rejectsCode('cross-origin-worker-not-allowed'));
});

test('cross-origin URL requires explicit diagnostic override', () => {
    assert.equal(resolveStockfishWorkerUrl({ baseUrl: BASE_URL, workerUrl: 'https://engine.test/stockfish.js', allowCrossOrigin: true }).origin, 'https://engine.test');
});

test('empty URL is rejected', () => {
    assert.throws(() => resolveStockfishWorkerUrl({ baseUrl: BASE_URL, workerUrl: '  ' }), rejectsCode('invalid-worker-url'));
});

test('malformed URL is rejected', () => {
    assert.throws(() => resolveStockfishWorkerUrl({ baseUrl: BASE_URL, workerUrl: 'http://[invalid' }), rejectsCode('invalid-worker-url'));
});

test('script protocol URL is rejected', () => {
    assert.throws(() => resolveStockfishWorkerUrl({ baseUrl: BASE_URL, workerUrl: 'javascript:alert(1)' }), rejectsCode('invalid-worker-url'));
});

test('inline data URL is rejected', () => {
    assert.throws(() => resolveStockfishWorkerUrl({ baseUrl: BASE_URL, workerUrl: 'data:text/javascript,postMessage(1)' }), rejectsCode('invalid-worker-url'));
});

test('blob URL is rejected', () => {
    assert.throws(() => resolveStockfishWorkerUrl({ baseUrl: BASE_URL, workerUrl: 'blob:https://caissa.test/id' }), rejectsCode('invalid-worker-url'));
});

test('missing Worker constructor returns stable unsupported error', () => {
    assert.throws(() => createStockfishWorker({ baseUrl: BASE_URL }), rejectsCode('worker-unsupported'));
});

test('constructor failure is normalized', () => {
    class ThrowingWorker { constructor() { throw new Error('private browser error'); } }
    assert.throws(() => createStockfishWorker({ baseUrl: BASE_URL, WorkerConstructor: ThrowingWorker }), rejectsCode('worker-construction-failed'));
});

test('one factory call creates exactly one classic Worker', () => {
    const worker = create();
    assert.equal(FakeWorker.instances.length, 1);
    assert.equal(worker.options.name, 'caissa-endgame-stockfish');
    assert.equal('type' in worker.options, false);
});

test('two calls create isolated Worker instances', () => {
    assert.notEqual(create(), create());
    assert.equal(FakeWorker.instances.length, 2);
});

test('postMessage transport is preserved', () => {
    const worker = create();
    worker.postMessage('uci');
    assert.deepEqual(worker.commands, ['uci']);
});

test('event listener transport is preserved', () => {
    const worker = create();
    const messages = [];
    const listener = (event) => messages.push(event.data);
    worker.addEventListener('message', listener);
    worker.emit('uciok');
    worker.removeEventListener('message', listener);
    worker.emit('readyok');
    assert.deepEqual(messages, ['uciok']);
});

test('terminate delegates exactly once when called once', () => {
    const worker = create();
    worker.terminate();
    assert.equal(worker.terminateCalls, 1);
});

test('factory does not mutate caller options', () => {
    const options = Object.freeze({ baseUrl: BASE_URL, workerUrl: '/engine/stockfish-working.js', name: 'diagnostic', WorkerConstructor: FakeWorker });
    createStockfishWorker(options);
    assert.deepEqual(Object.keys(options), ['baseUrl', 'workerUrl', 'name', 'WorkerConstructor']);
});

test('result is compatible with SafeEngineAdapter', async () => {
    const adapter = new SafeEngineAdapter({ createEngine: () => create(), defaultTimeoutMs: 100 });
    const initialization = adapter.initialize();
    const worker = FakeWorker.instances[0];
    worker.emit('uciok');
    worker.emit('readyok');
    await initialization;
    assert.equal(adapter.isReady(), true);
    adapter.dispose();
    assert.equal(worker.terminateCalls, 1);
});

test('unknown and invalid options are rejected', () => {
    assert.throws(() => resolveStockfishWorkerUrl({ baseUrl: BASE_URL, unknown: true }), rejectsCode('invalid-options'));
    assert.throws(() => resolveStockfishWorkerUrl({ baseUrl: BASE_URL, allowCrossOrigin: 'yes' }), rejectsCode('invalid-options'));
});
