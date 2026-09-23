import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../js/arena-runtime-manager.js', import.meta.url), 'utf8');
const provider = { id: 'lc0-maia-1100-preview', enabled: true, workerPath: '/isolated-lc0' };
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

function arenaFixture() {
  const window = { addEventListener() {}, dispatchEvent() {} };
  const document = { readyState: 'loading', addEventListener() {} };
  class CustomEvent { constructor(type, options = {}) { this.type = type; this.detail = options.detail; } }
  vm.runInNewContext(fs.readFileSync(new URL('../js/caissa-arena.js', import.meta.url), 'utf8'), {
    window, document, location: { pathname: '/arena' }, CustomEvent, console,
    performance, crypto, setTimeout: callback => { queueMicrotask(callback); return 1; },
    clearTimeout() {}
  }, { filename: 'caissa-arena.js' });
  return window.CaissaArena;
}

test('relay STOP and TERMINATE remain owned until acknowledgements resolve', async () => {
  const stopGate = deferred(), cleanupGate = deferred();
  const instance = {
    id: provider.id, providerId: provider.id, requestedEngineId: provider.id,
    asyncLifecycle: true, analyzing: false,
    start: async () => { instance.onLine?.('uciok'); instance.onLine?.('readyok'); return instance; },
    isReady: () => true,
    getRuntimeIdentity: () => ({ providerId: provider.id, requestedEngineId: provider.id,
      workerAsset: provider.workerPath, identityValidated: true, status: 'ready',
      runtimeInstanceId: 'relay-1' }),
    stop: () => stopGate.promise,
    terminate: () => cleanupGate.promise
  };
  const window = {};
  vm.runInNewContext(source, { window, performance, console }, { filename: 'arena-runtime-manager.js' });
  const manager = new window.ArenaRuntimeManager({ registry: {
    getArenaProvider: id => id === provider.id ? provider : null,
    createArenaEngine: () => instance
  } });
  await manager.acquire('white', provider.id);
  manager.markThinking('white', instance);
  const stopped = manager.stop('white', instance);
  assert.equal(manager.getResourceSnapshot().roles.white.state, 'STOPPING');
  assert.equal(manager.records.get('white').state, 'STOPPING');
  stopGate.resolve(true);
  await stopped;
  assert.equal(manager.records.get('white').state, 'IDLE');
  const terminated = manager.terminate('white', 'test');
  assert.equal(manager.getActiveInstances().length, 1);
  cleanupGate.resolve(true);
  await terminated;
  assert.equal(manager.getActiveInstances().length, 0);
  assert.equal(manager.getResourceSnapshot().activeRuntimeRecords, 0);
});

test('Pause blocks Resume until the asynchronous relay STOP reaches IDLE', async () => {
  const arena = arenaFixture();
  const stopGate = deferred();
  let loopStarts = 0;
  arena.state.matchState = 'running';
  arena.state.loopActive = true;
  arena.state.loopRunning = true;
  arena.state.currentGame = { id: 'game-pause-barrier' };
  arena.game = { turn: () => 'w', history: () => [] };
  arena.runtimeManager = {
    stopAll: () => stopGate.promise,
    getResourceSnapshot: () => ({ roles: { white: { state: 'STOPPING' } } })
  };
  arena.updateMatchControls = () => {};
  arena.updateGameStatus = () => {};
  arena.runEngineLoop = () => { loopStarts += 1; };

  const pausing = arena.togglePause();
  assert.equal(arena.state.matchState, 'paused');
  const resuming = arena.togglePause();
  assert.equal(arena.state.matchState, 'paused');
  assert.equal(loopStarts, 0);

  stopGate.resolve(true);
  await pausing;
  assert.equal(await resuming, true);
  await Promise.resolve();
  assert.equal(arena.state.matchState, 'running');
  assert.equal(loopStarts, 1);
  assert.deepEqual(Array.from(arena.lifecycleTrace, item => item.event), [
    'PAUSE_REQUESTED', 'RESUME_REQUESTED', 'PAUSE_STOPPED', 'RESUME_STARTED'
  ]);
});
