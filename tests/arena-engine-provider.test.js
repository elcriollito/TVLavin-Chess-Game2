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

function completeSf18Handshake(worker, suffix = '') {
    worker.emit(`id name Stockfish 18 Lite WASM${suffix}`);
    worker.emit(`id author the Stockfish developers (see AUTHORS file)${suffix}`);
    worker.emit('uciok');
    worker.emit('readyok');
}

function completeSf19Handshake(worker, suffix = '') {
    worker.emit(`id name Stockfish 19 Lite WASM${suffix}`);
    worker.emit(`id author the Stockfish developers (see AUTHORS file)${suffix}`);
    worker.emit('uciok');
    worker.emit('readyok');
}

test('one Arena provider registry owns Match and Tournament availability metadata', () => {
    const { registry } = fixture();
    const providers = registry.listArenaProviders();
    const available = providers.filter(provider => registry.isArenaProviderAvailable(provider.id));
    const unavailable = providers.filter(provider => !registry.isArenaProviderAvailable(provider.id));

    assert.deepEqual(Array.from(available, provider => provider.id), [
        'stockfish', 'stockfish-lite', 'stockfish-18-lite', 'stockfish-19-lite'
    ]);
    assert.deepEqual(Array.from(unavailable, provider => provider.id), [
        'fairy-stockfish', 'arasan', 'rodent3', 'texel'
    ]);
    assert.equal(registry.getArenaProviderAvailability('arasan').reason,
        registry.getArenaProvider('arasan').unavailableReason);
    assert.equal(registry.getArenaProvider('stockfish').runtimeId,
        registry.getArenaProvider('stockfish-lite').runtimeId);
    assert.notEqual(registry.getArenaProvider('stockfish').profile.id,
        registry.getArenaProvider('stockfish-lite').profile.id);
    const sf18 = registry.getArenaProvider('stockfish-18-lite');
    assert.equal(providers.filter(provider => provider.id === sf18.id).length, 1);
    assert.equal(sf18.displayName, 'Stockfish 18 Lite');
    assert.equal(sf18.family, 'Stockfish');
    assert.equal(sf18.version, '18.0.0');
    assert.equal(sf18.runtimeType, 'wasm');
    assert.equal(sf18.workerPath, '/assets/vendor/stockfish/18.0.0/stockfish-18-lite-single.js');
    assert.equal(sf18.wasmPath, '/assets/vendor/stockfish/18.0.0/stockfish-18-lite-single.wasm');
    assert.deepEqual({ ...sf18.defaultOptions }, { MultiPV: 1, Hash: 16, Threads: 1 });
    assert.deepEqual({ ...sf18.capabilities }, {
        supportsThreads: false,
        supportsNNUE: true,
        supportsMultiPV: true,
        supportsSyzygy: false,
        browserCompatible: true,
        mobileCompatible: true,
        requiresCrossOriginIsolation: false
    });
    const sf19 = registry.getArenaProvider('stockfish-19-lite');
    assert.equal(providers.filter(provider => provider.id === sf19.id).length, 1);
    assert.equal(sf19.displayName, 'Stockfish 19 Lite');
    assert.equal(sf19.family, 'Stockfish');
    assert.equal(sf19.version, '19.0.0');
    assert.equal(sf19.runtimeId, 'stockfish-19-lite-single-runtime');
    assert.equal(sf19.runtimeType, 'wasm');
    assert.equal(sf19.workerPath, '/assets/vendor/stockfish/19.0.0/stockfish-19-lite-single.js');
    assert.equal(sf19.wasmPath, '/assets/vendor/stockfish/19.0.0/stockfish-19-lite-single.wasm');
    assert.deepEqual({ ...sf19.defaultOptions }, { MultiPV: 1, Hash: 16, Threads: 1 });
    assert.deepEqual({ ...sf19.capabilities }, {
        supportsThreads: false,
        supportsNNUE: true,
        supportsMultiPV: true,
        supportsSyzygy: false,
        browserCompatible: true,
        mobileCompatible: true,
        requiresCrossOriginIsolation: false
    });
    assert.equal(registry.get('stockfish-19-lite'), null,
        'Arena registration must not broaden the unrelated legacy engine catalog');
    assert.equal(registry.get('stockfish-18-lite'), null,
        'Arena registration must not broaden the unrelated legacy engine catalog');
    assert.match(arenaSource, /EngineRegistry\.listArenaProviders\(\)/);
    assert.doesNotMatch(arenaSource, /Applying fallback list|const ArenaEngineRegistry|new StockfishEngine/);
});

test('matching Stockfish 19 identity reaches READY with bounded Lite configuration', async () => {
    const { registry, workers } = fixture();
    const engine = registry.createArenaEngine('stockfish-19-lite', { autoStart: false });
    const started = engine.start();
    completeSf19Handshake(workers[0], ' official');
    await started;

    assert.deepEqual(Array.from(workers[0].messages), [
        'uci',
        'setoption name MultiPV value 1',
        'setoption name MultiPV value 1',
        'setoption name Hash value 16',
        'setoption name Threads value 1',
        'isready'
    ]);
    const identity = engine.getRuntimeIdentity();
    assert.equal(identity.providerId, 'stockfish-19-lite');
    assert.equal(identity.requestedEngineId, 'stockfish-19-lite');
    assert.equal(identity.reportedUciName, 'Stockfish 19 Lite WASM official');
    assert.equal(identity.reportedAuthor,
        'the Stockfish developers (see AUTHORS file) official');
    assert.equal(identity.workerAsset,
        '/assets/vendor/stockfish/19.0.0/stockfish-19-lite-single.js');
    assert.equal(identity.identityValidated, true);
    assert.equal(identity.status, 'ready');
});

test('Stockfish 19 can own two independent competitor workers', async () => {
    const { registry, workers } = fixture();
    const white = registry.createArenaEngine('stockfish-19-lite', { autoStart: false });
    const black = registry.createArenaEngine('stockfish-19-lite', { autoStart: false });
    const starts = [white.start(), black.start()];
    completeSf19Handshake(workers[0]);
    completeSf19Handshake(workers[1]);
    await Promise.all(starts);

    assert.equal(workers.length, 2);
    assert.notEqual(workers[0], workers[1]);
    assert.notEqual(white.getRuntimeIdentity().runtimeInstanceId,
        black.getRuntimeIdentity().runtimeInstanceId);
});

test('Stockfish generation providers reject cross-version and legacy identities', async () => {
    const cases = [
        ['stockfish-19-lite', completeSf18Handshake],
        ['stockfish-19-lite', completeLegacyHandshake],
        ['stockfish-18-lite', completeSf19Handshake],
        ['stockfish', completeSf19Handshake]
    ];
    for (const [providerId, handshake] of cases) {
        const { registry, workers } = fixture();
        const engine = registry.createArenaEngine(providerId, { autoStart: false });
        const started = engine.start();
        handshake(workers[0]);
        await assert.rejects(started, error => error.code === 'ENGINE_IDENTITY_MISMATCH');
        assert.equal(workers[0].terminated, true);
        assert.equal(engine.getRuntimeIdentity().status, 'failed');
    }
});

test('Stockfish 19 startup failures fail closed without affecting certified providers', async () => {
    for (const missing of ['uciok', 'readyok']) {
        const f = fixture();
        const engine = f.registry.createArenaEngine('stockfish-19-lite', { autoStart: false });
        const started = engine.start();
        if (missing === 'readyok') {
            f.workers[0].emit('id name Stockfish 19 Lite WASM');
            f.workers[0].emit('id author the Stockfish developers (see AUTHORS file)');
            f.workers[0].emit('uciok');
        }
        f.expireTimers();
        await assert.rejects(started, error => error.code === 'ENGINE_HANDSHAKE_TIMEOUT');
        assert.equal(f.workers[0].terminated, true);
        assert.equal(f.registry.isArenaProviderAvailable('stockfish-19-lite'), false);
        assert.equal(f.registry.isArenaProviderAvailable('stockfish-18-lite'), true);
        assert.equal(f.registry.isArenaProviderAvailable('stockfish'), true);
    }

    const failed = fixture({ workerConstructionFails: true });
    const engine = failed.registry.createArenaEngine('stockfish-19-lite', { autoStart: false });
    await assert.rejects(engine.start(), error => error.code === 'ENGINE_CONSTRUCTION_FAILED');
    assert.equal(failed.workers.length, 0);
    assert.equal(failed.registry.isArenaProviderAvailable('stockfish-19-lite'), false);
    assert.equal(failed.registry.isArenaProviderAvailable('stockfish-18-lite'), true);
});

test('Stockfish 19 worker crash clears READY and remains isolated', async () => {
    const { registry, workers } = fixture();
    const engine = registry.createArenaEngine('stockfish-19-lite', { autoStart: false });
    const started = engine.start();
    completeSf19Handshake(workers[0]);
    await started;
    workers[0].onerror();

    assert.equal(engine.getRuntimeIdentity().status, 'failed');
    assert.equal(engine.isReady(), false);
    assert.equal(workers[0].terminated, true);
    assert.equal(registry.isArenaProviderAvailable('stockfish-19-lite'), false);
    assert.equal(registry.isArenaProviderAvailable('stockfish-18-lite'), true);
    assert.equal(registry.isArenaProviderAvailable('stockfish'), true);
});

test('matching Stockfish 18 identity reaches READY with bounded Lite configuration', async () => {
    const { registry, workers } = fixture();
    const engine = registry.createArenaEngine('stockfish-18-lite', { autoStart: false });
    const started = engine.start();
    completeSf18Handshake(workers[0], ' official');
    await started;

    assert.deepEqual(Array.from(workers[0].messages), [
        'uci',
        'setoption name MultiPV value 1',
        'setoption name MultiPV value 1',
        'setoption name Hash value 16',
        'setoption name Threads value 1',
        'isready'
    ]);
    assert.deepEqual({ ...engine.getRuntimeIdentity() }, {
        runtimeInstanceId: engine.getRuntimeIdentity().runtimeInstanceId,
        providerId: 'stockfish-18-lite',
        requestedEngineId: 'stockfish-18-lite',
        reportedUciName: 'Stockfish 18 Lite WASM official',
        reportedAuthor: 'the Stockfish developers (see AUTHORS file) official',
        workerAsset: '/assets/vendor/stockfish/18.0.0/stockfish-18-lite-single.js',
        createdAt: engine.getRuntimeIdentity().createdAt,
        identityValidated: true,
        status: 'ready'
    });
});

test('Stockfish 18 can own two independent competitor workers', async () => {
    const { registry, workers } = fixture();
    const white = registry.createArenaEngine('stockfish-18-lite', { autoStart: false });
    const black = registry.createArenaEngine('stockfish-18-lite', { autoStart: false });
    const starts = [white.start(), black.start()];
    completeSf18Handshake(workers[0]);
    completeSf18Handshake(workers[1]);
    await Promise.all(starts);

    assert.equal(workers.length, 2);
    assert.notEqual(workers[0], workers[1]);
    assert.notEqual(white.getRuntimeIdentity().runtimeInstanceId,
        black.getRuntimeIdentity().runtimeInstanceId);
    assert.equal(white.getRuntimeIdentity().providerId, 'stockfish-18-lite');
    assert.equal(black.getRuntimeIdentity().providerId, 'stockfish-18-lite');
});

test('Stockfish 18 wrong identity and WASM worker failure reject without legacy fallback', async () => {
    {
        const { registry, workers } = fixture();
        const engine = registry.createArenaEngine('stockfish-18-lite', { autoStart: false });
        const started = engine.start();
        completeLegacyHandshake(workers[0]);
        await assert.rejects(started, error => error.code === 'ENGINE_IDENTITY_MISMATCH');
        assert.equal(workers.length, 1);
        assert.equal(workers[0].terminated, true);
        assert.equal(registry.isArenaProviderAvailable('stockfish-18-lite'), false);
        assert.equal(registry.isArenaProviderAvailable('stockfish'), true);
        assert.equal(registry.isArenaProviderAvailable('stockfish-lite'), true);
    }
    {
        const { registry, workers } = fixture();
        const engine = registry.createArenaEngine('stockfish-18-lite', { autoStart: false });
        const started = engine.start();
        workers[0].onerror();
        await assert.rejects(started, error => error.code === 'ENGINE_WORKER_ERROR');
        assert.equal(workers[0].terminated, true);
        assert.equal(engine.getRuntimeIdentity().status, 'failed');
        assert.equal(registry.createArenaEngine('stockfish-18-lite'), null);
        assert.equal(workers.length, 1, 'no fallback worker may be constructed');
    }
});

test('Stockfish 18 construction failure stays isolated from existing competitors', async () => {
    const { registry, workers } = fixture({ workerConstructionFails: true });
    const engine = registry.createArenaEngine('stockfish-18-lite', { autoStart: false });
    await assert.rejects(engine.start(), error => error.code === 'ENGINE_CONSTRUCTION_FAILED');
    assert.equal(workers.length, 0);
    assert.equal(engine.getRuntimeIdentity().status, 'failed');
    assert.equal(registry.isArenaProviderAvailable('stockfish-18-lite'), false);
    assert.equal(registry.isArenaProviderAvailable('stockfish'), true);
    assert.equal(registry.isArenaProviderAvailable('stockfish-lite'), true);
});

test('Stockfish 18 UCI and ready timeouts terminate and remain isolated', async () => {
    for (const missing of ['uciok', 'readyok']) {
        const f = fixture();
        const engine = f.registry.createArenaEngine('stockfish-18-lite', { autoStart: false });
        const started = engine.start();
        if (missing === 'readyok') {
            f.workers[0].emit('id name Stockfish 18 Lite WASM');
            f.workers[0].emit('id author the Stockfish developers (see AUTHORS file)');
            f.workers[0].emit('uciok');
        }
        f.expireTimers();
        await assert.rejects(started, error => error.code === 'ENGINE_HANDSHAKE_TIMEOUT');
        assert.equal(f.workers[0].terminated, true);
        assert.equal(f.registry.isArenaProviderAvailable('stockfish-18-lite'), false);
        assert.equal(f.registry.isArenaProviderAvailable('stockfish'), true);
    }
});

test('unexpected Stockfish 18 termination after READY invalidates only that provider', async () => {
    const { registry, workers } = fixture();
    const engine = registry.createArenaEngine('stockfish-18-lite', { autoStart: false });
    const started = engine.start();
    completeSf18Handshake(workers[0]);
    await started;
    workers[0].onerror();

    assert.equal(engine.getRuntimeIdentity().status, 'failed');
    assert.equal(engine.isReady(), false);
    assert.equal(workers[0].terminated, true);
    assert.equal(registry.isArenaProviderAvailable('stockfish-18-lite'), false);
    assert.equal(registry.isArenaProviderAvailable('stockfish'), true);
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
