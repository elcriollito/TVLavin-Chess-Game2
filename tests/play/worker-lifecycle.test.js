import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { createLifecycleTransport, SCENARIOS } from './fixtures/fake-worker-lifecycle.js';

async function load() {
    const context = vm.createContext({ globalThis: {}, setTimeout, clearTimeout, queueMicrotask });
    context.globalThis = context;
    for (const file of [
        'worker-lifecycle-contracts.js', 'worker-fallback-policy.js',
        'worker-registry.js', 'worker-lifecycle.js'
    ]) {
        const source = await readFile(new URL(`../../js/play/engine/${file}`, import.meta.url), 'utf8');
        new vm.Script(source, { filename: file }).runInContext(context);
    }
    return context;
}

test('contracts are versioned, immutable, hostile-key safe, and transitions fail closed', async () => {
    const { CaissaWorkerLifecycleContracts: c } = await load();
    assert.equal(c.VERSION, '1.0.0');
    assert.deepEqual([...c.OWNERS], ['play','analyze','arena','mentor-analysis','spectator','test','unknown']);
    assert.equal(c.STATES.length, 14);
    assert.equal(c.canTransition('created', 'loading'), true);
    assert.equal(c.canTransition('disposed', 'ready'), false);
    assert.equal(c.validId('__proto__'), false);
    assert.throws(() => c.normalizeContext({ contextId: 'Bad ID' }));
    assert.throws(() => c.normalizeContext({ schemaVersion: '2.0.0', contextId: 'play' }));
    const value = c.normalizeContext({ contextId: 'play-main', owner: 'play', purpose: 'move-generation' });
    assert.equal(Object.isFrozen(value), true);
    assert.equal(Object.isFrozen(value.diagnostics), true);
    assert.equal('worker' in value, false);
});

test('registry rejects duplicate IDs and returns immutable redacted inventory', async () => {
    const { CaissaWorkerRegistry: module } = await load();
    const registry = module.create();
    registry.register({ contextId: 'play-main', owner: 'play' });
    assert.throws(() => registry.register({ contextId: 'play-main', owner: 'analyze' }));
    assert.equal(registry.inspect().length, 1);
    assert.equal(Object.isFrozen(registry.inspect()), true);
});

test('initialization reuses one promise and requires uciok then readyok', async () => {
    const { CaissaWorkerLifecycle } = await load();
    const fixture = createLifecycleTransport({ autoUci: false, autoReady: false });
    const service = CaissaWorkerLifecycle.createService({ initTimeoutMs: 1000 });
    service.createContext({ contextId: 'play-main', owner: 'play', purpose: 'move-generation', source: 'bundled-stockfish', transportFactory: fixture.factory });
    const first = service.initialize('play-main');
    assert.equal(service.initialize('play-main'), first);
    assert.equal(service.getSnapshot('play-main').state, 'initializing');
    fixture.emit({ type: 'uciok' });
    assert.equal(service.getSnapshot('play-main').state, 'initializing');
    fixture.emit({ type: 'readyok' });
    assert.equal((await first).state, 'ready');
    assert.deepEqual(fixture.sent.map(x => x.type), ['uci', 'isready']);
});

test('one active search uses stop-before-new and rejects stale results', async () => {
    const { CaissaWorkerLifecycle } = await load();
    const fixture = createLifecycleTransport();
    const service = CaissaWorkerLifecycle.createService();
    service.createContext({ contextId: 'play-main', owner: 'play', purpose: 'move-generation', source: 'bundled-stockfish', transportFactory: fixture.factory });
    await service.initialize('play-main');
    const first = service.request('play-main', { type: 'move-generation' });
    const firstRejected = assert.rejects(first, /superseded/);
    const second = service.request('play-main', { type: 'move-generation' });
    await firstRejected;
    const searches = fixture.sent.filter(x => x.type === 'move-generation');
    assert.equal(fixture.sent.some(x => x.type === 'stop'), true);
    fixture.emit({ type: 'result', requestId: searches[0].requestId, searchId: searches[0].searchId, result: 'a2a3' });
    assert.equal(service.getSnapshot('play-main').diagnostics.staleResponses, 1);
    fixture.emit({ type: 'result', requestId: searches[1].requestId, searchId: searches[1].searchId, result: 'e2e4' });
    assert.equal(await second, 'e2e4');
});

test('stop, pause, resume, terminate, and disposal are bounded and idempotent', async () => {
    const { CaissaWorkerLifecycle } = await load();
    const fixture = createLifecycleTransport();
    const service = CaissaWorkerLifecycle.createService();
    service.createContext({ contextId: 'play-main', owner: 'play', source: 'bundled-stockfish', transportFactory: fixture.factory });
    await service.initialize('play-main');
    assert.equal(service.stop('play-main').state, 'stopped');
    assert.equal(service.stop('play-main').state, 'stopped');
    assert.equal(service.pause('play-main').state, 'paused');
    assert.equal(service.resume('play-main').state, 'ready');
    assert.equal(service.terminate('play-main').state, 'terminated');
    assert.equal(service.terminate('play-main').state, 'terminated');
    const disposed = service.dispose('play-main');
    assert.equal(disposed.state, 'disposed');
    assert.equal(disposed.diagnostics.listeners, 0);
    assert.equal(disposed.diagnostics.timers, 0);
    assert.equal(fixture.status().terminated, true);
});

test('restart is one-shot, old generation is terminated, and fallback is truthful', async () => {
    const { CaissaWorkerLifecycle } = await load();
    const fixtures = [createLifecycleTransport(), createLifecycleTransport()];
    let index = 0;
    const service = CaissaWorkerLifecycle.createService();
    service.createContext({ contextId: 'play-main', owner: 'play', source: 'bundled-stockfish', transportFactory: hooks => fixtures[index++].factory(hooks) });
    await service.initialize('play-main');
    await service.restart('play-main', 'worker-error');
    assert.equal(service.getSnapshot('play-main').workerGeneration, 2);
    assert.equal(service.getSnapshot('play-main').restartCount, 1);
    assert.equal(fixtures[0].status().terminated, true);
    const fallback = await service.restart('play-main', 'worker-error');
    assert.equal(fallback.fallbackState, 'unavailable');
    assert.equal(fallback.state, 'degraded');
});

test('owner-scoped disposal cannot cross-terminate Analyze, Arena, or Mentor', async () => {
    const { CaissaWorkerLifecycle } = await load();
    const service = CaissaWorkerLifecycle.createService();
    for (const owner of ['play','analyze','arena','mentor-analysis']) {
        const fixture = createLifecycleTransport();
        service.createContext({ contextId: `${owner}-main`, owner, source: 'bundled-stockfish', transportFactory: fixture.factory });
        await service.initialize(`${owner}-main`);
    }
    service.disposeAll('play');
    const states = Object.fromEntries(service.inspect().map(x => [x.owner, x.state]));
    assert.equal(states.play, 'disposed');
    assert.equal(states.analyze, 'ready');
    assert.equal(states.arena, 'ready');
    assert.equal(states['mentor-analysis'], 'ready');
    service.disposeAll();
    assert.equal(service.inspect().every(x => x.state === 'disposed'), true);
});

test('fixture catalog covers every deterministic lifecycle scenario and is production-isolated', async () => {
    assert.equal(SCENARIOS.length, 20);
    for (const page of ['index.html', 'yahoo-classic.html']) {
        const html = await readFile(new URL(`../../${page}`, import.meta.url), 'utf8');
        assert.doesNotMatch(html, /fake-worker-lifecycle/);
        for (const file of [
            'worker-lifecycle-contracts', 'worker-fallback-policy',
            'worker-registry', 'worker-lifecycle'
        ]) assert.equal((html.match(new RegExp(`${file}\\.js`, 'g')) || []).length, 1);
    }
});

test('static guards forbid raw Worker, arbitrary URLs/UCI, storage, and cross-owner imports', async () => {
    const source = await readFile(new URL('../../js/play/engine/worker-lifecycle.js', import.meta.url), 'utf8');
    assert.doesNotMatch(source, /\bnew\s+Worker\b|workerUrl|https?:|localStorage|sessionStorage|indexedDB/);
    assert.doesNotMatch(source, /EngineRegistry|AnalyzeSection|CaissaArena|Mentor|FICS/);
    assert.match(source, /Unsupported structured worker command/);
});
