import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../../js/engine-adapter.js', import.meta.url), 'utf8');

function fixture(config = {}) {
    const workers = []; const timers = new Map(); let timerId = 0;
    class Worker {
        constructor(url) { this.url = url; this.messages = []; this.terminated = false; workers.push(this); }
        postMessage(value) { this.messages.push(String(value)); }
        terminate() { this.terminated = true; }
        emit(value) { this.onmessage?.({ data: value }); }
    }
    const window = { location: { pathname: '/play/beta/bots', origin: 'https://caissa.test' }, WebAssembly: {} };
    vm.runInNewContext(source, { window, Worker, WebAssembly: {}, console,
        setTimeout: callback => { const id = ++timerId; timers.set(id, callback); return id; },
        clearTimeout: id => timers.delete(id) });
    const adapter = new window.EngineAdapter({ workerPath: '/engine/stockfish-working.js', autoStart: false, ...config });
    return { adapter, workers, expire: () => { const callbacks = [...timers.values()]; timers.clear(); callbacks.forEach(fn => fn()); } };
}

test('lazy adapter constructs no Worker until explicit start and requires ordered bounded handshakes', async () => {
    const f = fixture(); assert.equal(f.workers.length, 0);
    const started = f.adapter.start(); assert.equal(f.workers.length, 1);
    assert.equal(f.workers[0].url, '/engine/stockfish-working.js');
    assert.deepEqual(f.workers[0].messages, ['uci']);
    f.workers[0].emit('readyok'); assert.equal(f.adapter.ready, false);
    f.workers[0].emit('uciok'); assert.equal(f.workers[0].messages.at(-1), 'isready');
    f.workers[0].emit('readyok'); assert.equal(await started, f.adapter);
});

test('uciok and readyok deadlines terminate and reject with typed bounded failure', async () => {
    for (const phase of ['uciok', 'readyok']) {
        const f = fixture(); const pending = f.adapter.start();
        if (phase === 'readyok') f.workers[0].emit('uciok');
        f.expire(); await assert.rejects(pending, error => error.code === 'ENGINE_HANDSHAKE_TIMEOUT');
        assert.equal(f.workers[0].terminated, true); assert.equal(f.adapter.engine, null);
    }
});

test('terminated generation cannot satisfy replacement handshake', async () => {
    const f = fixture(); const first = f.adapter.start(); const old = f.workers[0];
    f.adapter.terminate(); await assert.rejects(first, /ownership ended/i);
    const replacement = f.adapter.start(); old.emit('uciok'); old.emit('readyok');
    assert.equal(f.adapter.ready, false);
    const current = f.workers[1]; current.emit('uciok'); current.emit('readyok'); await replacement;
    assert.equal(f.adapter.ready, true); assert.equal(old.terminated, true);
});

test('remote, route-relative, and query-controlled Worker URLs fail closed', async () => {
    for (const workerPath of ['engine/stockfish-working.js', 'https://evil.test/worker.js',
        '/engine/stockfish-working.js?worker=https://evil.test']) {
        const f = fixture({ workerPath });
        await assert.rejects(f.adapter.start(), error => error.code === 'ENGINE_CONSTRUCTION_FAILED');
        assert.equal(f.workers.length, 0);
    }
});

test('versioned Analyze SF18 route validates the exact UCI identity', async () => {
    const expectedUci = {
        name: 'Stockfish 18 Lite WASM',
        author: 'the Stockfish developers (see AUTHORS file)'
    };
    const f = fixture({
        workerPath: '/assets/vendor/stockfish/18.0.0/stockfish-18-lite-single.js',
        expectedUci
    });
    const started = f.adapter.start();
    const worker = f.workers[0];
    assert.equal(worker.url, '/assets/vendor/stockfish/18.0.0/stockfish-18-lite-single.js');
    worker.emit(`id name ${expectedUci.name}`);
    worker.emit(`id author ${expectedUci.author}`);
    worker.emit('uciok');
    worker.emit('readyok');
    await started;
    assert.deepEqual({ ...f.adapter.getUciIdentity() }, { ...expectedUci, validated: true });
});

test('Analyze SF18 route fails closed on a mismatched identity without legacy fallback', async () => {
    const f = fixture({
        workerPath: '/assets/vendor/stockfish/18.0.0/stockfish-18-lite-single.js',
        expectedUci: {
            name: 'Stockfish 18 Lite WASM',
            author: 'the Stockfish developers (see AUTHORS file)'
        }
    });
    const started = f.adapter.start();
    f.workers[0].emit('id name Stockfish 2019-08-15 Multi-Variant');
    f.workers[0].emit('id author D. Dugovic, F. Fichter et al.');
    f.workers[0].emit('uciok');
    await assert.rejects(started, error => error.code === 'ENGINE_IDENTITY_MISMATCH');
    assert.equal(f.workers.length, 1);
    assert.equal(f.workers[0].terminated, true);
});
