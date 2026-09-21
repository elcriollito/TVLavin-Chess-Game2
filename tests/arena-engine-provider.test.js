import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const adapterSource = fs.readFileSync(new URL('../js/engine-adapter.js', import.meta.url), 'utf8');
const registrySource = fs.readFileSync(new URL('../js/engine-registry.js', import.meta.url), 'utf8');
const arenaSource = fs.readFileSync(new URL('../js/caissa-arena.js', import.meta.url), 'utf8');

function fixture(options = {}) {
    const workers = [];
    const timers = new Map();
    let timerSequence = 0;
    class Worker {
        constructor(url) {
            if (options.workerConstructionFails) throw new Error('fixture construction failure');
            this.url = String(url);
            this.messages = [];
            this.terminated = false;
            workers.push(this);
        }
        postMessage(message) { this.messages.push(String(message)); }
        terminate() { this.terminated = true; }
        emit(line) { this.onmessage?.({ data: line }); }
    }
    class CustomEvent {
        constructor(type, init = {}) { this.type = type; this.detail = init.detail; }
    }
    const window = {
        location: { pathname: '/arena' },
        WebAssembly: {},
        dispatchEvent() {}
    };
    const context = {
        window,
        Worker,
        CustomEvent,
        WebAssembly: {},
        console,
        setTimeout(callback) {
            const id = ++timerSequence;
            timers.set(id, callback);
            return id;
        },
        clearTimeout(id) { timers.delete(id); }
    };
    vm.runInNewContext(adapterSource, context, { filename: 'js/engine-adapter.js' });
    vm.runInNewContext(registrySource, context, { filename: 'js/engine-registry.js' });
    return {
        registry: window.EngineRegistry,
        workers,
        expireTimers() {
            const callbacks = [...timers.values()];
            timers.clear();
            callbacks.forEach(callback => callback());
        }
    };
}

function completeLegacyHandshake(worker) {
    worker.emit('id name Stockfish 2019-08-15 Multi-Variant');
    worker.emit('id author D. Dugovic, F. Fichter et al.');
    worker.emit('uciok');
    worker.emit('readyok');
}

test('one Arena provider registry owns Match and Tournament availability metadata', () => {
    const { registry } = fixture();
    const providers = registry.listArenaProviders();
    const available = providers.filter(provider => registry.isArenaProviderAvailable(provider.id));
    const unavailable = providers.filter(provider => !registry.isArenaProviderAvailable(provider.id));

    assert.deepEqual(Array.from(available, provider => provider.id), ['stockfish', 'stockfish-lite']);
    assert.deepEqual(Array.from(unavailable, provider => provider.id), [
        'fairy-stockfish', 'arasan', 'rodent3', 'texel'
    ]);
    assert.equal(registry.getArenaProviderAvailability('arasan').reason,
        registry.getArenaProvider('arasan').unavailableReason);
    assert.equal(registry.getArenaProvider('stockfish').runtimeId,
        registry.getArenaProvider('stockfish-lite').runtimeId);
    assert.notEqual(registry.getArenaProvider('stockfish').profile.id,
        registry.getArenaProvider('stockfish-lite').profile.id);
    assert.match(arenaSource, /EngineRegistry\.listArenaProviders\(\)/);
    assert.doesNotMatch(arenaSource, /Applying fallback list|const ArenaEngineRegistry|new StockfishEngine/);
});

test('matching legacy provider identity is required before READY and recorded immutably', async () => {
    const { registry, workers } = fixture();
    const engine = registry.createArenaEngine('stockfish-lite', { autoStart: false });
    const started = engine.start();
    completeLegacyHandshake(workers[0]);
    await started;

    const runtime = engine.getRuntimeIdentity();
    assert.equal(Object.isFrozen(runtime), true);
    assert.equal(runtime.providerId, 'stockfish-lite');
    assert.equal(runtime.requestedEngineId, 'stockfish-lite');
    assert.equal(runtime.reportedUciName, 'Stockfish 2019-08-15 Multi-Variant');
    assert.equal(runtime.reportedAuthor, 'D. Dugovic, F. Fichter et al.');
    assert.equal(runtime.workerAsset, '/engine/stockfish-working.js');
    assert.equal(runtime.identityValidated, true);
    assert.equal(runtime.status, 'ready');
    assert.ok(runtime.runtimeInstanceId.startsWith('stockfish-lite:'));
    assert.ok(runtime.createdAt);
});

test('provider identity mismatch terminates and becomes unavailable without fallback', async () => {
    const { registry, workers } = fixture();
    const engine = registry.createArenaEngine('stockfish', { autoStart: false });
    const started = engine.start();
    workers[0].emit('id name Arasan 24.2');
    workers[0].emit('id author Jon Dart');
    workers[0].emit('uciok');

    await assert.rejects(started, error => error.code === 'ENGINE_IDENTITY_MISMATCH');
    assert.equal(workers.length, 1);
    assert.equal(workers[0].terminated, true);
    assert.equal(engine.getRuntimeIdentity().status, 'failed');
    assert.equal(registry.isArenaProviderAvailable('stockfish'), false);
    assert.equal(registry.createArenaEngine('stockfish'), null);
});

test('missing uciok and missing readyok both fail closed and terminate', async () => {
    for (const missing of ['uciok', 'readyok']) {
        const f = fixture();
        const engine = f.registry.createArenaEngine('stockfish', { autoStart: false });
        const started = engine.start();
        if (missing === 'readyok') {
            f.workers[0].emit('id name Stockfish 2019-08-15 Multi-Variant');
            f.workers[0].emit('id author D. Dugovic, F. Fichter et al.');
            f.workers[0].emit('uciok');
        }
        f.expireTimers();
        await assert.rejects(started, error => error.code === 'ENGINE_HANDSHAKE_TIMEOUT');
        assert.equal(f.workers[0].terminated, true, `${missing} timeout must terminate`);
        assert.equal(f.registry.isArenaProviderAvailable('stockfish'), false);
    }
});

test('worker startup failure marks the exact provider unavailable', async () => {
    const { registry, workers } = fixture({ workerConstructionFails: true });
    const engine = registry.createArenaEngine('stockfish-lite', { autoStart: false });
    await assert.rejects(engine.start(), error => error.code === 'ENGINE_CONSTRUCTION_FAILED');
    assert.equal(workers.length, 0);
    assert.equal(registry.isArenaProviderAvailable('stockfish-lite'), false);
    assert.equal(registry.isArenaProviderAvailable('stockfish'), false,
        'profiles sharing the failed runtime become unavailable together');
});

test('historical Arasan label with a prewarmed Stockfish worker is structurally impossible', async () => {
    const { registry, workers } = fixture();
    const stockfish = registry.createArenaEngine('stockfish', { autoStart: false });
    const prewarmed = stockfish.start();
    completeLegacyHandshake(workers[0]);
    await prewarmed;

    const requestedArasan = registry.createArenaEngine('arasan');
    assert.equal(requestedArasan, null);
    assert.equal(registry.createEngine('not-a-provider'), null);
    assert.equal(workers.length, 1, 'requesting Arasan must not create or reuse another worker');
    assert.equal(stockfish.getRuntimeIdentity().providerId, 'stockfish');
    assert.equal(stockfish.getRuntimeIdentity().reportedUciName,
        'Stockfish 2019-08-15 Multi-Variant');
    assert.equal(registry.getArenaProvider('arasan').displayName, 'Arasan');
    assert.equal(registry.isArenaProviderAvailable('arasan'), false);
});
