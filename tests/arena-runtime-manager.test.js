import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../js/arena-runtime-manager.js', import.meta.url), 'utf8');

const PROVIDERS = Object.freeze({
    stockfish: Object.freeze({
        id: 'stockfish', enabled: true, workerPath: '/engine/stockfish-working.js', wasmPath: '',
        resource: Object.freeze({ workerBytes: 1579996, wasmBytes: 0, defaultHashMiB: null,
            threads: 1, crossOriginIsolationRequired: false, mobileCompatible: true,
            estimatedWeightClass: 'light' })
    }),
    'stockfish-18-lite': Object.freeze({
        id: 'stockfish-18-lite', enabled: true,
        workerPath: '/assets/vendor/stockfish/18.0.0/stockfish-18-lite-single.js',
        wasmPath: '/assets/vendor/stockfish/18.0.0/stockfish-18-lite-single.wasm',
        resource: Object.freeze({ workerBytes: 20680, wasmBytes: 7295411, defaultHashMiB: 16,
            threads: 1, crossOriginIsolationRequired: false, mobileCompatible: true,
            estimatedWeightClass: 'heavy' })
    }),
    'stockfish-19-lite': Object.freeze({
        id: 'stockfish-19-lite', enabled: true,
        workerPath: '/assets/vendor/stockfish/19.0.0/stockfish-19-lite-single.js',
        wasmPath: '/assets/vendor/stockfish/19.0.0/stockfish-19-lite-single.wasm',
        resource: Object.freeze({ workerBytes: 21415, wasmBytes: 1787571, defaultHashMiB: 16,
            threads: 1, crossOriginIsolationRequired: false, mobileCompatible: true,
            estimatedWeightClass: 'light' })
    })
});

function fixture(options = {}) {
    const instances = [];
    const controls = [];
    let runtimeSequence = 0;
    let clock = 0;

    class FakeEngine {
        constructor(provider, adapterOptions) {
            this.id = provider.id;
            this.providerId = provider.id;
            this.requestedEngineId = provider.id;
            this.workerPath = provider.workerPath;
            this.adapterOptions = adapterOptions;
            this.ready = false;
            this.analyzing = false;
            this.terminated = false;
            this.messages = [];
            this.onLine = null;
            this.identity = {
                runtimeInstanceId: `${provider.id}:fake:${++runtimeSequence}`,
                providerId: provider.id,
                requestedEngineId: provider.id,
                reportedUciName: `Fake ${provider.id}`,
                reportedAuthor: 'Fixture',
                workerAsset: provider.workerPath,
                identityValidated: false,
                status: 'created'
            };
            this.control = {};
            controls.push(this.control);
            instances.push(this);
        }

        completeStart() {
            this.onLine?.('uciok');
            this.identity = { ...this.identity, identityValidated: true, status: 'ready' };
            this.ready = true;
            this.onLine?.('readyok');
            this.control.resolve?.(this);
        }

        start() {
            if (options.rejectNextStart) {
                options.rejectNextStart = false;
                const error = Object.assign(new Error('fixture startup failure'), {
                    code: 'ENGINE_CONSTRUCTION_FAILED'
                });
                this.identity = { ...this.identity, status: 'failed' };
                this.adapterOptions.onRuntimeUnavailable?.(error);
                return Promise.reject(error);
            }
            if (options.deferStarts) {
                return new Promise((resolve, reject) => {
                    this.control.resolve = resolve;
                    this.control.reject = reject;
                });
            }
            this.completeStart();
            return Promise.resolve(this);
        }

        isReady() { return this.ready; }
        getRuntimeIdentity() { return Object.freeze({ ...this.identity }); }
        stop() {
            if (this.analyzing) this.messages.push('stop');
            this.analyzing = false;
        }
        go() { this.analyzing = true; this.messages.push('go'); }
        newGame() {
            this.stop();
            this.messages.push('ucinewgame', 'isready');
        }
        terminate(reason) {
            if (this.terminated) return;
            if (this.analyzing) this.messages.push('stop');
            this.messages.push('quit');
            this.analyzing = false;
            this.ready = false;
            this.terminated = true;
            this.terminationReason = reason;
            this.identity = { ...this.identity, status: 'terminated' };
            this.control.reject?.(Object.assign(new Error('ownership ended'), {
                code: 'ENGINE_OWNERSHIP_ENDED'
            }));
        }
        crash(code = 'ENGINE_WORKER_ERROR') {
            const error = Object.assign(new Error('fixture worker crash'), { code });
            this.identity = { ...this.identity, status: 'failed', identityValidated: false };
            this.adapterOptions.onRuntimeUnavailable?.(error);
        }
    }

    const registry = {
        getArenaProvider(id) { return PROVIDERS[id] || null; },
        createArenaEngine(id, adapterOptions) {
            if (options.throwOnCreate) throw new Error('fixture constructor exception');
            const provider = PROVIDERS[id];
            return provider ? new FakeEngine(provider, adapterOptions) : null;
        }
    };
    const window = {};
    vm.runInNewContext(source, { window, performance: { now: () => ++clock }, console }, {
        filename: 'js/arena-runtime-manager.js'
    });
    const failures = [];
    const manager = new window.ArenaRuntimeManager({
        registry,
        now: () => ++clock,
        onFailure: failure => failures.push(failure)
    });
    return { manager, instances, controls, failures, STATES: window.ArenaRuntimeManager.STATES };
}

test('three strict roles acquire independently with truthful resource accounting', async () => {
    const { manager, STATES } = fixture();
    const [white, black, evaluator] = await Promise.all([
        manager.acquire('white', 'stockfish-19-lite'),
        manager.acquire('black', 'stockfish-19-lite'),
        manager.acquire('evaluator', 'stockfish-18-lite')
    ]);

    assert.notEqual(white, black, 'self-play roles must never share an instance');
    assert.notEqual(white.getRuntimeIdentity().runtimeInstanceId,
        black.getRuntimeIdentity().runtimeInstanceId);
    const snapshot = manager.getResourceSnapshot();
    assert.equal(snapshot.activeWorkers, 3);
    assert.equal(snapshot.activeRuntimeRecords, 3);
    assert.equal(snapshot.roles.white.state, STATES.READY);
    assert.equal(snapshot.roles.white.providerId, 'stockfish-19-lite');
    assert.equal(snapshot.roles.black.providerId, 'stockfish-19-lite');
    assert.equal(snapshot.roles.evaluator.providerId, 'stockfish-18-lite');
    assert.equal(snapshot.estimatedHashMiB, 48);
    assert.equal(snapshot.hashEstimateComplete, true);
    assert.deepEqual(Array.from(snapshot.wasmAssets, asset => asset.bytes).sort((a, b) => a - b),
        [1787571, 7295411]);
    assert.equal(snapshot.diagnostics.peakActiveWorkers, 3);
    assert.equal(evaluator.providerId, 'stockfish-18-lite');
});

test('unknown provider Hash stays explicitly incomplete instead of being counted as zero', async () => {
    const { manager } = fixture();
    await Promise.all([
        manager.acquire('white', 'stockfish-19-lite'),
        manager.acquire('black', 'stockfish-18-lite'),
        manager.acquire('evaluator', 'stockfish')
    ]);
    const snapshot = manager.getResourceSnapshot();
    assert.equal(snapshot.estimatedHashMiB, 32);
    assert.equal(snapshot.hashEstimateComplete, false);
});

test('same-provider acquire reuses while replacement terminates before constructing', async () => {
    const { manager, instances } = fixture();
    const first = await manager.acquire('white', 'stockfish-19-lite');
    const reused = await manager.acquire('white', 'stockfish-19-lite');
    assert.equal(reused, first);
    assert.equal(instances.length, 1);

    const replacement = await manager.replace('white', 'stockfish-18-lite');
    assert.notEqual(replacement, first);
    assert.equal(first.terminated, true);
    assert.equal(first.terminationReason, 'provider-replaced');
    assert.deepEqual(first.messages, ['quit']);
    assert.equal(manager.getResourceSnapshot().roles.white.providerId, 'stockfish-18-lite');
    assert.equal(manager.getResourceSnapshot().diagnostics.replacements, 1);
});

test('STOP preserves a reusable record while release and TERMINATE destroy ownership', async () => {
    const { manager, STATES } = fixture();
    const engine = await manager.acquire('white', 'stockfish-19-lite');
    engine.go();
    manager.markThinking('white', engine);
    assert.equal(manager.getResourceSnapshot().roles.white.state, STATES.THINKING);

    assert.equal(manager.stop('white', engine), true);
    assert.equal(engine.terminated, false);
    assert.equal(manager.getResourceSnapshot().roles.white.state, STATES.IDLE);
    assert.deepEqual(engine.messages, ['go', 'stop']);

    manager.terminate('white', 'match-stopped');
    assert.equal(engine.terminated, true);
    assert.equal(manager.getInstance('white'), null);
    const terminated = manager.getResourceSnapshot();
    assert.equal(terminated.activeWorkers, 0);
    assert.equal(terminated.historicalTerminationCount, 1);
    assert.equal(terminated.latestTerminations[0].reason, 'match-stopped');
    assert.ok(terminated.latestTerminations[0].terminationMs >= 0);
    assert.deepEqual(engine.messages, ['go', 'stop', 'quit']);

    const released = await manager.acquire('black', 'stockfish-18-lite');
    assert.equal(manager.release('black', 'participant-released'), true);
    assert.equal(released.terminated, true);
    assert.equal(manager.getInstance('black'), null);
    assert.equal(manager.getResourceSnapshot().latestTerminations.at(-1).reason,
        'participant-released');
});

test('reused workers receive ucinewgame and readiness reset before the next game', async () => {
    const { manager, STATES } = fixture();
    const engine = await manager.acquire('black', 'stockfish-18-lite');
    assert.equal(manager.newGame('black'), true);
    assert.deepEqual(engine.messages, ['ucinewgame', 'isready']);
    assert.equal(manager.getResourceSnapshot().roles.black.state, STATES.INITIALIZING);
    assert.equal(manager.markReady('black'), true);
    assert.equal(manager.getResourceSnapshot().roles.black.state, STATES.READY);
});

test('provider and requested identity bindings cannot be relabeled after acquisition', async () => {
    const { manager } = fixture();
    const engine = await manager.acquire('white', 'stockfish-19-lite');
    assert.throws(() => { engine.providerId = 'stockfish-18-lite'; }, TypeError);
    assert.throws(() => { engine.requestedEngineId = 'stockfish'; }, TypeError);
    assert.equal(engine.providerId, 'stockfish-19-lite');
    assert.equal(engine.getRuntimeIdentity().providerId, 'stockfish-19-lite');
});

test('startup rejection and runtime crash clear live records without harming other roles', async () => {
    const startup = fixture({ rejectNextStart: true });
    await assert.rejects(startup.manager.acquire('white', 'stockfish-19-lite'),
        error => error.code === 'ENGINE_CONSTRUCTION_FAILED');
    assert.equal(startup.manager.getInstance('white'), null);
    assert.equal(startup.manager.getResourceSnapshot().activeRuntimeRecords, 0);
    assert.equal(startup.failures.length, 1);

    const runtime = fixture();
    const [white, black, evaluator] = await Promise.all([
        runtime.manager.acquire('white', 'stockfish-19-lite'),
        runtime.manager.acquire('black', 'stockfish-18-lite'),
        runtime.manager.acquire('evaluator', 'stockfish')
    ]);
    white.crash();
    const snapshot = runtime.manager.getResourceSnapshot();
    assert.equal(snapshot.roles.white, null);
    assert.equal(snapshot.roles.black.runtimeInstanceId,
        black.getRuntimeIdentity().runtimeInstanceId);
    assert.equal(snapshot.roles.evaluator.runtimeInstanceId,
        evaluator.getRuntimeIdentity().runtimeInstanceId);
    assert.equal(snapshot.activeWorkers, 2);
    assert.equal(white.terminated, true);
    assert.equal(runtime.failures.at(-1).role, 'white');
});

test('malformed providers and constructor exceptions leave no runtime record', async () => {
    const malformed = fixture();
    await assert.rejects(malformed.manager.acquire('white', 'not-a-provider'),
        error => error.code === 'ARENA_RUNTIME_PROVIDER_INVALID');
    assert.equal(malformed.manager.getResourceSnapshot().activeWorkers, 0);

    const construction = fixture({ throwOnCreate: true });
    await assert.rejects(construction.manager.acquire('white', 'stockfish-19-lite'),
        /fixture constructor exception/);
    assert.equal(construction.manager.getResourceSnapshot().activeRuntimeRecords, 0);
});

test('replacement during initialization rejects stale completion ownership', async () => {
    const { manager, instances } = fixture({ deferStarts: true });
    const oldAcquire = manager.acquire('white', 'stockfish-19-lite');
    const replacementAcquire = manager.replace('white', 'stockfish-18-lite');
    assert.equal(instances[0].terminated, true);
    instances[0].completeStart();
    instances[1].completeStart();
    assert.equal(await oldAcquire, null);
    const replacement = await replacementAcquire;
    assert.equal(replacement, instances[1]);
    assert.equal(manager.getInstance('white'), instances[1]);
    assert.equal(manager.getResourceSnapshot().roles.white.providerId, 'stockfish-18-lite');
    assert.equal(manager.getResourceSnapshot().diagnostics.staleAcquisitions, 1);
});

test('25-cycle replacement stress remains bounded and terminateAll reaches zero', async () => {
    const { manager } = fixture();
    let maximumRecords = 0;
    for (let cycle = 0; cycle < 25; cycle += 1) {
        await Promise.all([
            manager.acquire('white', cycle % 2 ? 'stockfish-19-lite' : 'stockfish-18-lite'),
            manager.acquire('black', cycle % 2 ? 'stockfish-18-lite' : 'stockfish'),
            manager.acquire('evaluator', 'stockfish')
        ]);
        manager.markThinking('white');
        manager.markThinking('black');
        maximumRecords = Math.max(maximumRecords,
            manager.getResourceSnapshot().activeRuntimeRecords);
        manager.stopAll();
    }
    assert.equal(maximumRecords, 3);
    assert.equal(manager.getResourceSnapshot().diagnostics.peakActiveWorkers, 3);
    manager.terminateAll('stress-complete');
    const final = manager.getResourceSnapshot();
    assert.equal(final.activeWorkers, 0);
    assert.equal(final.activeRuntimeRecords, 0);
    assert.deepEqual(Array.from(final.liveRuntimeIds), []);
});
