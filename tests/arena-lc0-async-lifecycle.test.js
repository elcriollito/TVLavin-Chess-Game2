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
