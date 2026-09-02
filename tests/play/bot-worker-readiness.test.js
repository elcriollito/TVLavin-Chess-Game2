import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../../js/play/bots/bot-worker-readiness.js', import.meta.url), 'utf8');

function fixture({ strengthOnly = false } = {}) {
    const listeners = new Map(); const routeListeners = [];
    let resolveStart; let rejectStart; let starts = 0; let terminations = 0; let session = 0;
    const engine = {
        engine: null,
        start() { starts += 1; this.engine = {}; return new Promise((resolve, reject) => {
            resolveStart = () => { resolve(this); }; rejectStart = reject;
        }); },
        terminate() { terminations += 1; this.engine = null;
            rejectStart?.(Object.assign(new Error('ended'), { code: 'ENGINE_OWNERSHIP_ENDED' })); rejectStart = null; }
    };
    let route = { section: 'play', mode: 'bots', query: { simplified: '1' }, metadata: {} };
    const selectedProfile = strengthOnly ? null : { id: 'casual' };
    const selectedStrengthProfile = strengthOnly ? { id: 'strength-1500', targetStrength: 1500 } : null;
    const global = {
        App: { engine },
        CaissaBotSession: {
            getSnapshot: () => ({ selectedProfile, selectedStrengthProfile, sessionId: session ? `bot-session-${session}` : null }),
            beginGame: () => ({ ok: true, value: { sessionId: `bot-session-${++session}` } })
        },
        CaissaPlayRouteController: {
            getCurrent: () => route, subscribe: callback => { routeListeners.push(callback); return () => {}; }
        },
        addEventListener: (type, callback) => listeners.set(type, callback)
    };
    vm.runInNewContext(source, { window: global, globalThis: global, console });
    return { api: global.CaissaPlayV2BotWorkerReadiness, engine,
        resolve: () => resolveStart?.(), reject: error => rejectStart?.(error),
        counts: () => ({ starts, terminations }),
        event: type => listeners.get(type)?.({}),
        route(next) { route = next; routeListeners.forEach(callback => callback(next)); }
    };
}

test('publishes the frozen PlayV2BotWorkerReadiness@1.0.0 contract', () => {
    const { api } = fixture();
    assert.equal(api.contractId, 'PlayV2BotWorkerReadiness@1.0.0');
    assert.equal(api.workerOwner, 'EngineAdapter');
    assert.equal(api.lifecycleOwner, 'Native Bots session');
    assert.equal(api.maximumActiveWorkers, 1);
    assert.equal(api.canonicalWorkerUrl, '/engine/stockfish-working.js');
    assert.equal(api.bootstrapCreatesWorker, false);
    assert.equal(api.profileSelectionCreatesWorker, false);
    assert.equal(api.publicReady, false);
    assert.equal(Object.isFrozen(api), true);
    assert.equal(Object.isFrozen(api.deadlines), true);
});

test('passive state owns zero Workers and one valid Play creates one only after commit', async () => {
    const f = fixture();
    assert.equal(f.api.getSnapshot().activeWorkerCount, 0);
    const pending = f.api.begin({ color: 'white', timeControl: 300 });
    assert.equal(f.api.getSnapshot().state, 'initializing');
    assert.equal(f.api.getSnapshot().activeWorkerCount, 1);
    const duplicate = await f.api.begin({ color: 'white', timeControl: 300 });
    assert.equal(duplicate.reasonCode, 'START_IN_PROGRESS');
    f.resolve(); assert.equal((await pending).ok, true);
    assert.equal(f.api.markPlaying(), true);
    assert.equal(f.api.getSnapshot().diagnostics.maximumActiveWorkers, 1);
});

test('v3 strength-profile bots pass readiness and create one Worker', async () => {
    const f = fixture({ strengthOnly: true });
    const pending = f.api.begin({ color: 'white', timeControl: 180 });
    assert.equal(f.api.getSnapshot().state, 'initializing');
    f.resolve();
    assert.equal((await pending).ok, true);
    assert.equal(f.api.getSnapshot().activeWorkerCount, 1);
});

test('route, game-end, and pagehide exits terminate ownership and leave zero Workers', async () => {
    for (const exit of ['route', 'game-end', 'pagehide']) {
        const f = fixture(); const pending = f.api.begin({ color: 'black', timeControl: 0 });
        f.resolve(); await pending; f.api.markPlaying();
        if (exit === 'route') f.route({ section: 'play', mode: 'games', query: {}, metadata: {} });
        else f.event(exit === 'game-end' ? 'caissa-game-end' : exit);
        assert.equal(f.api.getSnapshot().activeWorkerCount, 0, exit);
        assert.equal(f.counts().terminations, 1, exit);
    }
});

test('initialization failure permits exactly one explicit Retry after cleanup', async () => {
    const f = fixture();
    const first = f.api.begin({ color: 'white', timeControl: 600 });
    f.reject(Object.assign(new Error('timeout'), { code: 'ENGINE_HANDSHAKE_TIMEOUT' }));
    assert.equal((await first).status, 'recoverable-error');
    assert.equal(f.api.getSnapshot().activeWorkerCount, 0);
    const retry = f.api.retry({ color: 'white', timeControl: 600 });
    f.resolve(); assert.equal((await retry).ok, true);
    const repeated = await f.api.retry({ color: 'white', timeControl: 600 });
    assert.equal(repeated.reasonCode, 'RETRY_UNAVAILABLE');
    assert.equal(f.api.getSnapshot().diagnostics.retries, 1);
});

test('route exit during initialization rejects stale completion and clears ownership', async () => {
    const f = fixture(); const pending = f.api.begin({ color: 'white', timeControl: 0 });
    f.route({ section: 'play', mode: 'games', query: {}, metadata: {} });
    assert.equal((await pending).ok, false);
    f.resolve(); await Promise.resolve();
    assert.equal(f.api.getSnapshot().activeWorkerCount, 0);
});
