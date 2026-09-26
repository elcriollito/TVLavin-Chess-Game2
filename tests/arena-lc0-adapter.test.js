import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { Chess } from 'chess.js';

const source = fs.readFileSync(new URL('../experiments/lc0-arena-preview/isolated-browser-runtime-adapter.js',
  import.meta.url), 'utf8');
function fixture(manifestSha256 = null) {
  const failures = [], statuses = [];
  const window = { EngineRegistry: { markArenaProviderUnavailable: (_id, reason) => failures.push(reason) } };
  vm.runInNewContext(source, { window, Chess, crypto, performance,
    setTimeout, clearTimeout, setInterval, clearInterval },
    { filename: 'isolated-browser-runtime-adapter.js' });
  const provider = { id: 'lc0-maia-1100-preview', workerPath: '/isolated-lc0' };
  const coordinator = { status: value => statuses.push(value), info() {},
    ...(manifestSha256 ? { config: { manifestSha256 } } : {}) };
  const instance = new window.IsolatedBrowserRuntimeAdapter(provider,
    { owner: 'arena:white', onRuntimeUnavailable: error => failures.push(error.message) }, coordinator);
  const identity = { ...window.Eae013Identity,
    runtimeInstanceId: '12345678-1234-4234-8234-123456789abc' };
  return { instance, identity, failures, statuses };
}

test('Lc0 identity pin follows the server-authoritative preview manifest digest', () => {
  const manifestSha256 = '4'.repeat(64);
  const { instance, identity } = fixture(manifestSha256);
  instance.dispatch({ type: 'READY', identity: { ...identity, manifestSha256 } });
  assert.equal(instance.isReady(), true);
  instance.dispatch({ type: 'READY', identity });
  assert.equal(instance.isReady(), false);
});

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

test('a late heartbeat failure from a replaced stream cannot terminate Resume', async () => {
  const { instance, failures } = fixture();
  const old = { aborted: false, abort() { this.aborted = true; } };
  const current = { aborted: false, abort() { this.aborted = true; } };
  const actions = [];
  instance.sessionId = 'session-current';
  instance.api = async action => { actions.push(action); };
  instance.streamController = current;
  instance.mainLeaseEpoch = 2;
  instance.heartbeatError(Object.assign(new Error('STREAM_REPLACED'), { status: 409 }), 1, old);
  assert.equal(instance.closed, false);
  assert.equal(current.aborted, false);
  assert.deepEqual(actions, []);
  instance.heartbeatError(Object.assign(new Error('network timeout'), { status: 503 }), 2, current);
  assert.equal(current.aborted, true);
  assert.equal(instance.closed, false);
  assert.deepEqual(actions, []);
  instance.heartbeatError(Object.assign(new Error('MAIN_LEASE_EXPIRED'), { status: 410 }), 2, current);
  assert.equal(instance.closed, true);
  assert.ok(failures.includes('MAIN_LEASE_EXPIRED'));
  await Promise.resolve();
  assert.deepEqual(actions, ['terminate']);
});

test('failed startup revokes the relay without claiming local CLEANUP evidence', async () => {
  const { instance } = fixture();
  instance.sessionId = 'startup-session';
  instance.startFailed = true;
  const actions = [];
  instance.api = async action => { actions.push(action); return { terminated: true }; };
  await assert.rejects(instance.terminate(), /LC0_CLEANUP_UNVERIFIED_STARTUP_ABORTED/);
  assert.deepEqual(actions, ['terminate']);
  assert.equal(instance.closed, true);
  assert.equal(instance.metrics.cleanupEvidence, null);
  assert.equal(instance.metrics.cleanupFailureClassification,
    'STARTUP_ABORTED_NO_LOCAL_CLEANUP_EVIDENCE');
});

test('transport suspension queues a new search until reconnect without replacing the runtime', async () => {
  const { instance, identity } = fixture();
  instance.dispatch({ type: 'READY', identity });
  instance.transportState = 'TRANSPORT_SUSPENDED';
  const commands = [];
  instance.reuse = async () => { commands.push('RESET_READY'); };
  instance.command = async type => { commands.push(type); };
  instance.stop = async () => { instance.active = null; return true; };
  instance.getBestMove(new Chess().fen(), () => assert.fail('mock stop has no BESTMOVE'));
  await new Promise(resolve => setTimeout(resolve, 5));
  assert.deepEqual(commands, []);
  instance.transportState = 'CONNECTED';
  await instance.searchPromise;
  assert.deepEqual(commands, ['RESET_READY', 'POSITION', 'GO']);
  assert.equal(instance.active, null);
  assert.equal(instance.getRuntimeIdentity().runtimeInstanceId, identity.runtimeInstanceId);
});

test('transport suspension between RESET and POSITION queues the next command', async () => {
  const { instance } = fixture();
  instance.transportState = 'TRANSPORT_SUSPENDED';
  const actions = [];
  instance.waitForTransportConnected = async () => {
    actions.push('wait-connected');
    instance.transportState = 'CONNECTED';
  };
  instance.api = async (action, options) => {
    actions.push(`${action}:${options?.body?.type || ''}`);
    if (action === 'command') return { accepted: true };
    if (action === 'inspect') return { state: {
      lastAck: { command: 'POSITION', seq: 1, searchId: null }
    } };
    throw new Error(`unexpected ${action}`);
  };
  await instance.command('POSITION', { fen: 'startpos', moves: [] });
  assert.deepEqual(actions, ['wait-connected', 'command:POSITION', 'inspect:']);
  assert.equal(instance.seq, 1);
});

test('transport exhaustion preserves truthful local-vs-broker cleanup accounting', async () => {
  const { instance, identity } = fixture();
  instance.dispatch({ type: 'READY', identity });
  instance.sessionId = 'transport-failed-session';
  instance.transportState = 'TRANSPORT_FAILED';
  const actions = [];
  instance.api = async action => { actions.push(action); return {}; };
  assert.equal(await instance.terminate('transport-failed'), true);
  assert.deepEqual(actions, []);
  assert.equal(instance.metrics.localCleanupObserved, false);
  assert.equal(instance.metrics.brokerCleanupAcknowledged, false);
  assert.equal(instance.metrics.brokerCleanupAckMissing, 1);
  assert.equal(instance.metrics.cleanupFailureClassification,
    'LOCAL_CLEANUP_DELEGATED_BROKER_ACK_MISSING');
});

test('a skipped SSE ACK is recovered from durable broker truth without replaying a command', async () => {
  const { instance } = fixture();
  instance.sessionId = 'durable-ack-session';
  const actions = [];
  instance.api = async (action, options) => {
    actions.push({ action, body: options?.body });
    if (action === 'command') return { accepted: true };
    if (action === 'inspect') return { state: {
      phase: 'SEARCHING', lastAck: { command: 'GO', seq: 1, searchId: 'search_durable' }
    } };
    throw new Error(`unexpected ${action}`);
  };
  await instance.command('GO', { searchId: 'search_durable', mode: 'infinite' });
  assert.deepEqual(actions.map(item => item.action), ['command', 'inspect']);
  assert.equal(instance.seq, 1);
  assert.equal(instance.metrics.durableEventRecoveries.ACK_GO, 1);
  assert.equal(instance.transportTrace.at(-1).event, 'DURABLE_EVENT_RECOVERED');
});

test('a suspended command fetch retries only after durable state proves it was not accepted', async () => {
  const { instance } = fixture();
  instance.sessionId = 'command-retry-session';
  let commandAttempts = 0;
  instance.api = async (action, options) => {
    if (action === 'command' && ++commandAttempts === 1) throw new TypeError('Failed to fetch');
    if (action === 'command') return { accepted: true };
    if (action === 'inspect' && commandAttempts === 1)
      return { state: { lastCommandSeq: 0, pending: null } };
    if (action === 'inspect') return { state: {
      lastCommandSeq: 1, pending: null,
      lastAck: { command: 'POSITION', seq: 1, searchId: null }
    } };
    throw new Error(`unexpected ${action}:${JSON.stringify(options)}`);
  };
  await instance.command('POSITION', { fen: 'startpos', moves: [] });
  assert.equal(commandAttempts, 2);
  assert.equal(instance.metrics.transportSuspended, 1);
  assert.equal(instance.metrics.reconnectSuccess, 1);
  assert.equal(instance.metrics.reconnectFailure, 0);
  assert.equal(instance.transportState, 'CONNECTED');
});

test('a lost command response reconciles the accepted sequence without replay', async () => {
  const { instance } = fixture();
  instance.sessionId = 'command-response-lost-session';
  let commandAttempts = 0;
  instance.api = async action => {
    if (action === 'command') {
      commandAttempts += 1;
      throw new TypeError('Failed to fetch');
    }
    if (action === 'inspect') return { state: {
      lastCommandSeq: 1, pending: null,
      lastAck: { command: 'GO', seq: 1, searchId: 'search_response_lost' }
    } };
    throw new Error(`unexpected ${action}`);
  };
  await instance.command('GO', { searchId: 'search_response_lost', mode: 'infinite' });
  assert.equal(commandAttempts, 1);
  assert.equal(instance.metrics.reconnectSuccess, 1);
  assert.equal(instance.metrics.durableEventRecoveries.ACK_GO, 1);
});

test('adapter source keeps bounded reconnect and reason-coded transport evidence', () => {
  assert.match(source, /TRANSPORT_RECONNECT_MS = 20_000/);
  assert.match(source, /LC0_TRANSPORT_RECONNECT_EXHAUSTED/);
  assert.match(source, /transportSuspended/);
  assert.match(source, /brokerCleanupAcknowledged/);
  assert.match(source, /durableEventRecoveries/);
  assert.match(source, /correlationId/);
});

for (const scenario of [
  { name: 'Blitz', options: { wtime: 180000, btime: 179250, winc: 2000, binc: 2000 },
    expected: { mode: 'clock', wtime: 180000, btime: 179250, winc: 2000, binc: 2000 } },
  { name: 'Rapid', options: { wtime: 600000, btime: 600000, winc: 5000, binc: 5000 },
    expected: { mode: 'clock', wtime: 600000, btime: 600000, winc: 5000, binc: 5000 } },
  { name: 'Long', options: { wtime: 1800000, btime: 1800000, winc: 20000, binc: 20000 },
    expected: { mode: 'clock', wtime: 1800000, btime: 1800000, winc: 20000, binc: 20000 } },
  { name: 'Fixed Depth 12', options: { depth: 12 }, expected: { mode: 'depth', depth: 12 } },
  { name: 'Fixed Depth 20', options: { depth: 20 }, expected: { mode: 'depth', depth: 20 } }
]) test(`Lc0 adapter forwards exact ${scenario.name} UCI search fields`, async () => {
  const { instance, identity } = fixture();
  instance.dispatch({ type: 'READY', identity });
  const commands = [], moves = [];
  instance.waitForTransportConnected = async () => true;
  instance.reuse = async () => true;
  instance.command = async (type, payload = {}) => { commands.push({ type, payload }); };
  instance.getBestMove(new Chess().fen(), move => moves.push(move), scenario.options);
  await new Promise(resolve => setTimeout(resolve, 0));
  const operation = instance.active;
  assert.deepEqual(commands.map(item => item.type), ['POSITION', 'GO']);
  assert.deepEqual(JSON.parse(JSON.stringify(commands[1].payload)),
    { searchId: operation.searchId, ...scenario.expected });
  instance.dispatch({ type: 'BESTMOVE', searchId: operation.searchId, move: 'e2e4' });
  instance.dispatch({ type: 'STOPPED', searchId: operation.searchId });
  await instance.searchPromise;
  assert.deepEqual(moves, ['e2e4']);
  assert.equal(instance.active, null);
});

test('Lc0 adapter rejects unapproved fixed depth and incomplete clock fields', () => {
  const { instance, identity } = fixture();
  instance.dispatch({ type: 'READY', identity });
  assert.throws(() => instance.getBestMove(new Chess().fen(), () => {}, { depth: 10 }),
    /LC0_FIXED_DEPTH_INVALID/);
  assert.throws(() => instance.getBestMove(new Chess().fen(), () => {},
    { wtime: 1000, btime: 1000, winc: 0 }), /LC0_CLOCK_TIME_CONTROL_INVALID/);
});
