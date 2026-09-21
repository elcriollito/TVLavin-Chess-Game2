import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { Chess } from 'chess.js';

const source = fs.readFileSync(new URL('../experiments/lc0-arena-preview/isolated-browser-runtime-adapter.js',
  import.meta.url), 'utf8');
function fixture() {
  const failures = [], statuses = [];
  const window = { EngineRegistry: { markArenaProviderUnavailable: (_id, reason) => failures.push(reason) } };
  vm.runInNewContext(source, { window, Chess, crypto, performance,
    setTimeout, clearTimeout, setInterval, clearInterval },
    { filename: 'isolated-browser-runtime-adapter.js' });
  const provider = { id: 'lc0-maia-1100-preview', workerPath: '/isolated-lc0' };
  const coordinator = { status: value => statuses.push(value), info() {} };
  const instance = new window.IsolatedBrowserRuntimeAdapter(provider,
    { owner: 'arena:white', onRuntimeUnavailable: error => failures.push(error.message) }, coordinator);
  const identity = { ...window.Eae013Identity,
    runtimeInstanceId: '12345678-1234-4234-8234-123456789abc' };
  return { instance, identity, failures, statuses };
}

test('Lc0 READY binds every pinned identity field and rejects old search traffic', () => {
  const { instance, identity, failures } = fixture();
  instance.dispatch({ type: 'READY', identity });
  assert.equal(instance.isReady(), true);
  assert.equal(instance.getRuntimeIdentity().runtimeInstanceId, identity.runtimeInstanceId);
  instance.active = { searchId: 'search_current', fen: new Chess().fen() };
  instance.dispatch({ type: 'INFO', searchId: 'search_old', depth: 4, nodes: 7,
    score: 10, pv: 'e2e4' });
  instance.dispatch({ type: 'BESTMOVE', searchId: 'search_old', move: 'e2e4' });
  assert.equal(instance.metrics.infoReceived, 0);
  assert.equal(instance.active.bestmove, undefined);
  instance.dispatch({ type: 'READY', identity: { ...identity, networkSha256: 'wrong' } });
  assert.equal(instance.isReady(), false);
  assert.ok(failures.some(message => message.includes('LC0_RUNTIME_IDENTITY_INVALID')));
});

test('Lc0 STOP validates legal BESTMOVE then QUIT waits for cooperative cleanup', async () => {
  const { instance, identity } = fixture();
  instance.dispatch({ type: 'READY', identity });
  instance.sessionId = 'test-session';
  const moves = [], calls = [];
  instance.active = { searchId: 'search_current', gameId: instance.gameId,
    fen: new Chess().fen(), callback: move => moves.push(move), started: true,
    stopRequested: false };
  instance.analyzing = true;
  instance.command = async type => {
    calls.push(type);
    if (type === 'STOP') {
      instance.dispatch({ type: 'BESTMOVE', searchId: 'search_current', move: 'e2e4' });
      instance.dispatch({ type: 'STOPPED', searchId: 'search_current' });
    }
    if (type === 'QUIT') instance.dispatch({ type: 'CLEANUP', evidence: {
      parentWorkers: 0, pthreadWorkers: 0, runtimeState: 'TERMINATED',
      forcedTerminations: 0, cleanupAcknowledged: true } });
  };
  instance.api = async action => {
    calls.push(action);
    if (action === 'inspect') return { state: { completedSearchId: 'search_current' } };
    if (action === 'advance') return { advanceAllowed: true };
    return { terminated: true };
  };
  await instance.stop();
  assert.deepEqual(moves, ['e2e4']);
  assert.equal(instance.lastPhase, 'STOPPED');
  await instance.terminate();
  assert.deepEqual(calls, ['STOP', 'QUIT', 'inspect', 'advance', 'terminate']);
  assert.equal(instance.metrics.cleanupEvidence.forcedTerminations, 0);
  assert.equal(instance.closed, true);
});

test('illegal relay BESTMOVE fails closed before the Arena callback', async () => {
  const { instance, identity } = fixture();
  instance.dispatch({ type: 'READY', identity });
  const moves = [];
  instance.active = { searchId: 'search_bad', gameId: instance.gameId,
    fen: new Chess().fen(), callback: move => moves.push(move), started: true };
  instance.command = async type => {
    assert.equal(type, 'STOP');
    instance.dispatch({ type: 'BESTMOVE', searchId: 'search_bad', move: 'e2e5' });
    instance.dispatch({ type: 'STOPPED', searchId: 'search_bad' });
  };
  await assert.rejects(instance.stop(), /LC0_BESTMOVE_ILLEGAL/);
  assert.deepEqual(moves, []);
});

test('reconnect ignores a not-yet-GO search but rejects a changed active generation', () => {
  const { instance, identity } = fixture();
  instance.dispatch({ type: 'READY', identity });
  instance.active = { searchId: 'search_new', started: false };
  instance.reconcile({ identity, activeSearchId: 'search_previous' });
  assert.equal(instance.active.transportUncertain, undefined);
  instance.active.started = true;
  assert.throws(() => instance.reconcile({ identity, activeSearchId: 'search_previous' }),
    /LC0_RECONNECT_SEARCH_MISMATCH/);
  instance.stop = () => Promise.resolve(true);
  instance.reconcile({ identity, activeSearchId: 'search_new' });
  assert.equal(instance.active.transportUncertain, true);
});
