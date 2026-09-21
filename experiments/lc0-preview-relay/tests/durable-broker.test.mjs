import assert from 'node:assert/strict';
import test from 'node:test';
import { DurableBroker, LC0_IDENTITY, internals } from '../durable-broker.mjs';
import { MemoryStore } from '../store.mjs';

const userA = 'user_AAAAAAAAAAAA';
const userB = 'user_BBBBBBBBBBBB';
const searchA = 'search_AAAAAAAA';
const searchB = 'search_BBBBBBBB';
const identity = { ...LC0_IDENTITY, runtimeInstanceId: '12345678-1234-4234-8234-123456789abc' };
const cleanupEvidence = { parentWorkers: 0, pthreadWorkers: 0,
  runtimeState: 'TERMINATED', cleanupAcknowledged: true, forcedTerminations: 0 };

function fixture() {
  let time = Date.now();
  const now = () => time;
  const store = new MemoryStore({ now });
  const first = new DurableBroker(store, { now });
  const second = new DurableBroker(store, { now });
  return { store, first, second, now, advance: ms => { time += ms; } };
}

async function open(f, userId = userA, competitionId = 'cup') {
  const created = await f.first.create({ userId, competitionId, participantRole: 'white' });
  const claimed = await f.second.claim(created.sessionId, created.claimToken);
  return { ...created, ...claimed, userId, engineSeq: 0, commandSeq: 0 };
}

async function command(broker, session, type, extra = {}) {
  return broker.command(session.sessionId, session.userId,
    { type, seq: ++session.commandSeq, ...extra });
}

async function message(broker, session, type, extra = {}) {
  return broker.engineMessage(session.sessionId, session.engineCredential,
    { type, seq: ++session.engineSeq, ...extra });
}

async function ack(broker, session, commandType, searchId = null) {
  return message(broker, session, 'ACK', { command: commandType,
    commandSeq: session.commandSeq, ...(searchId ? { searchId } : {}) });
}

async function readySearch(f, session, searchId = searchA) {
  await command(f.first, session, 'HELLO');
  await ack(f.second, session, 'HELLO');
  await message(f.second, session, 'READY', { identity });
  await command(f.second, session, 'POSITION', { fen: 'startpos' });
  await ack(f.first, session, 'POSITION');
  await command(f.first, session, 'GO', { searchId, mode: 'nodes', nodes: 1 });
  await ack(f.second, session, 'GO', searchId);
}

async function stop(f, session, searchId = searchA) {
  await command(f.second, session, 'STOP', { searchId });
  await ack(f.first, session, 'STOP', searchId);
  await message(f.second, session, 'BESTMOVE', { searchId, move: 'e2e4' });
  await message(f.first, session, 'STOPPED', { searchId });
}

test('cross-instance claim is one-use and stores only token verifiers', async () => {
  const f = fixture();
  const created = await f.first.create({ userId: userA, competitionId: 'one', participantRole: 'black' });
  const raw = JSON.stringify(await f.store.get(created.sessionId));
  assert.equal(raw.includes(created.claimToken), false);
  assert.equal(raw.includes(internals.hash(created.sessionId, created.claimToken)), true);
  const attempts = await Promise.allSettled([
    f.first.claim(created.sessionId, created.claimToken),
    f.second.claim(created.sessionId, created.claimToken)
  ]);
  assert.equal(attempts.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(attempts.filter(result => result.status === 'rejected').length, 1);
  const engineCredential = attempts.find(result => result.status === 'fulfilled').value.engineCredential;
  const stored = JSON.stringify(await f.store.get(created.sessionId));
  assert.equal(stored.includes(created.claimToken), false);
  assert.equal(stored.includes(engineCredential), false);
});

test('Clerk-subject owner binding blocks another user on inspect, command, terminate and reconnect', async () => {
  const f = fixture(), session = await open(f);
  await assert.rejects(f.second.inspect(session.sessionId, userB), { code: 'SESSION_GONE' });
  await assert.rejects(f.second.command(session.sessionId, userB, { type: 'HELLO', seq: 1 }),
    { code: 'SESSION_GONE' });
  await assert.rejects(f.second.terminate(session.sessionId, userB), { code: 'SESSION_GONE' });
  await assert.rejects(f.second.connect(session.sessionId, 'main', userB), { code: 'SESSION_GONE' });
  await assert.rejects(f.second.claim(session.sessionId, session.claimToken), { code: 'CLAIM_ALREADY_USED' });
  await assert.rejects(f.second.connect(session.sessionId, 'engine', 'wrong'),
    { code: 'ENGINE_CREDENTIAL_INVALID' });
  assert.equal((await f.first.inspect(session.sessionId, userA)).competitionId, 'cup');
});

test('ordered ACK gate, INFO coalescing and release cleanup survive broker reconstruction', async () => {
  const f = fixture(), session = await open(f);
  await assert.rejects(f.first.command(session.sessionId, userA, { type: 'POSITION', seq: 2, fen: 'startpos' }),
    { code: 'SEQUENCE_INVALID' });
  await readySearch(f, session);
  await assert.rejects(f.first.command(session.sessionId, userA, { type: 'GO', seq: 3, searchId: searchA }),
    { code: 'SEQUENCE_INVALID' });
  for (let depth = 1; depth <= 30; depth++) await message(f.first, session, 'INFO',
    { searchId: searchA, depth, nodes: depth, pv: 'e2e4', score: depth });
  const state = (await f.store.get(session.sessionId)).state;
  assert.equal(state.events.filter(item => item.value.type === 'INFO').length, 1);
  assert.equal(state.events.find(item => item.value.type === 'INFO').value.depth, 30);
  const restarted = new DurableBroker(f.store, { now: f.now });
  await assert.rejects(restarted.advance(session.sessionId, userA, 'release', searchA),
    { code: 'ADVANCE_GATE_CLOSED' });
  await stop({ ...f, first: restarted }, session);
  await command(restarted, session, 'QUIT');
  await ack(f.second, session, 'QUIT');
  await assert.rejects(restarted.advance(session.sessionId, userA, 'release', searchA),
    { code: 'ADVANCE_GATE_CLOSED' });
  await message(f.second, session, 'CLEANUP', { evidence: cleanupEvidence });
  assert.deepEqual(await restarted.advance(session.sessionId, userA, 'release', searchA),
    { advanceAllowed: true, mode: 'release', searchId: searchA });
  await assert.rejects(message(f.second, session, 'BESTMOVE', { searchId: searchA, move: 'd2d4' }),
    { code: 'ENGINE_CREDENTIAL_INVALID' });
  await restarted.terminate(session.sessionId, userA);
  assert.equal(await f.store.countLive(), 0);
});

test('reused participant requires reset READY and rejects late BESTMOVE from prior search', async () => {
  const f = fixture(), session = await open(f);
  await readySearch(f, session);
  await stop(f, session);
  await command(f.first, session, 'RESET', { searchId: searchA });
  await ack(f.second, session, 'RESET', searchA);
  await assert.rejects(f.first.advance(session.sessionId, userA, 'reuse', searchA),
    { code: 'ADVANCE_GATE_CLOSED' });
  await message(f.second, session, 'READY', { identity });
  assert.equal((await f.first.advance(session.sessionId, userA, 'reuse', searchA)).advanceAllowed, true);
  await command(f.first, session, 'POSITION', { fen: 'startpos' });
  await ack(f.second, session, 'POSITION');
  await command(f.first, session, 'GO', { searchId: searchB, mode: 'nodes', nodes: 1 });
  await ack(f.second, session, 'GO', searchB);
  await assert.rejects(f.first.engineMessage(session.sessionId, session.engineCredential,
    { type: 'BESTMOVE', seq: session.engineSeq + 1, searchId: searchA, move: 'd2d4' }),
  { code: 'BESTMOVE_STATE_INVALID' });
  await command(f.first, session, 'STOP', { searchId: searchB });
  await ack(f.second, session, 'STOP', searchB);
  await message(f.second, session, 'BESTMOVE', { searchId: searchB, move: 'e2e4' });
  await message(f.second, session, 'STOPPED', { searchId: searchB });
  assert.equal((await f.store.get(session.sessionId)).state.completedSearchId, searchB);
});

test('separate streams reconnect by cursor after turnover and old epochs stop polling', async () => {
  const f = fixture(), session = await open(f);
  const main = await f.first.connect(session.sessionId, 'main', userA);
  const engine = await f.second.connect(session.sessionId, 'engine', session.engineCredential);
  await command(f.first, session, 'HELLO');
  const firstEngine = await f.second.poll(session.sessionId, 'engine', session.engineCredential,
    engine.epoch, 0);
  assert.deepEqual(firstEngine.events.map(item => item.value.type), ['HELLO']);
  await f.second.close(session.sessionId, 'engine', session.engineCredential, engine.epoch);
  f.advance(1_000);
  const restart = new DurableBroker(f.store, { now: f.now });
  const reconnected = await restart.connect(session.sessionId, 'engine', session.engineCredential,
    firstEngine.cursor);
  assert.equal((await restart.poll(session.sessionId, 'engine', session.engineCredential,
    reconnected.epoch, firstEngine.cursor)).events.length, 0);
  await assert.rejects(f.second.poll(session.sessionId, 'engine', session.engineCredential,
    engine.epoch, firstEngine.cursor), { code: 'STREAM_REPLACED' });
  await ack(restart, session, 'HELLO');
  const firstMain = await f.first.poll(session.sessionId, 'main', userA, main.epoch, 0);
  assert.deepEqual(firstMain.events.map(item => item.value.type), ['ACK']);
  await f.first.close(session.sessionId, 'main', userA, main.epoch);
  const mainReload = await restart.connect(session.sessionId, 'main', userA, firstMain.cursor);
  assert.equal((await restart.poll(session.sessionId, 'main', userA,
    mainReload.epoch, firstMain.cursor)).events.length, 0);
});

test('duplicate command delivery is claimed once across broker instances', async () => {
  const f = fixture(), session = await open(f);
  await command(f.first, session, 'HELLO');
  const [a, b] = await Promise.all([
    f.first.claimCommand(session.sessionId, session.engineCredential, 1),
    f.second.claimCommand(session.sessionId, session.engineCredential, 1)
  ]);
  assert.deepEqual([a.execute, b.execute].sort(), [false, true]);
  await assert.rejects(f.second.claimCommand(session.sessionId, session.engineCredential, 2),
    { code: 'COMMAND_DELIVERY_INVALID' });
  const restarted = new DurableBroker(f.store, { now: f.now });
  assert.equal((await restarted.claimCommand(session.sessionId,
    session.engineCredential, 1)).execute, false);
});

test('store interruption fails closed and a retried POST commits only one command', async () => {
  const f = fixture(), session = await open(f);
  const original = f.store.compareSwap.bind(f.store);
  let fault = true;
  f.store.compareSwap = async (...args) => {
    if (fault) { fault = false; throw new Error('TEMPORARY_STORE_ERROR'); }
    return original(...args);
  };
  await assert.rejects(f.first.command(session.sessionId, userA,
    { type: 'HELLO', seq: 1 }), /TEMPORARY_STORE_ERROR/);
  assert.equal((await f.second.inspect(session.sessionId, userA)).state.lastCommandSeq, 0);
  await f.second.command(session.sessionId, userA, { type: 'HELLO', seq: 1 });
  await assert.rejects(f.first.command(session.sessionId, userA,
    { type: 'HELLO', seq: 1 }), { code: 'SEQUENCE_INVALID' });
  assert.equal((await f.store.get(session.sessionId)).state.events
    .filter(item => item.value.type === 'HELLO').length, 1);
});

test('an abandoned server response cannot renew a lease without a client heartbeat', async () => {
  const f = fixture(), session = await open(f);
  const connection = await f.first.connect(session.sessionId, 'engine', session.engineCredential);
  f.advance(2_000);
  await f.first.poll(session.sessionId, 'engine', session.engineCredential,
    connection.epoch, 0);
  await f.second.heartbeat(session.sessionId, 'engine', session.engineCredential,
    connection.epoch);
  f.advance(7_999);
  await f.second.poll(session.sessionId, 'engine', session.engineCredential,
    connection.epoch, 0);
  f.advance(2);
  await assert.rejects(f.first.poll(session.sessionId, 'engine', session.engineCredential,
    connection.epoch, 0), { code: 'ENGINE_LEASE_EXPIRED' });
  await assert.rejects(f.first.connect(session.sessionId, 'engine', session.engineCredential),
    { code: 'ENGINE_LEASE_EXPIRED' });
  assert.equal(await f.store.countLive(), 0);
});

test('unknown fields, oversized payloads and replayed engine sequences are rejected', async () => {
  const f = fixture(), session = await open(f);
  await assert.rejects(f.first.command(session.sessionId, userA,
    { type: 'HELLO', seq: 1, arbitrary: true }), { code: 'SCHEMA_INVALID' });
  await assert.rejects(f.first.command(session.sessionId, userA,
    { type: 'HELLO', seq: 1, fen: 'x'.repeat(3000) }), { code: 'COMMAND_TOO_LARGE' });
  await f.first.command(session.sessionId, userA, { type: 'HELLO', seq: 1 });
  await f.second.engineMessage(session.sessionId, session.engineCredential,
    { type: 'ACK', seq: 1, command: 'HELLO', commandSeq: 1 });
  await assert.rejects(f.second.engineMessage(session.sessionId, session.engineCredential,
    { type: 'ACK', seq: 1, command: 'HELLO', commandSeq: 1 }),
  { code: 'ENGINE_SEQUENCE_INVALID' });
});

test('READY refuses generic or mismatched Lc0 identity and binds the runtime instance', async () => {
  const f = fixture(), session = await open(f);
  await command(f.first, session, 'HELLO'); await ack(f.second, session, 'HELLO');
  await assert.rejects(message(f.second, session, 'READY'), { code: 'SCHEMA_INVALID' });
  session.engineSeq -= 1;
  await assert.rejects(message(f.second, session, 'READY', {
    identity: { ...identity, networkSha256: '0'.repeat(64) }
  }), { code: 'ENGINE_IDENTITY_INVALID' });
  session.engineSeq -= 1;
  await message(f.second, session, 'READY', { identity });
  assert.deepEqual((await f.first.inspect(session.sessionId, userA)).state.identity, identity);
  await command(f.first, session, 'POSITION', { fen: 'startpos', moves: ['e2e4'] });
  await ack(f.second, session, 'POSITION');
  await command(f.first, session, 'GO', { searchId: searchA, mode: 'infinite' });
  await ack(f.second, session, 'GO', searchA);
  await stop(f, session);
  await command(f.first, session, 'RESET', { searchId: searchA });
  await ack(f.second, session, 'RESET', searchA);
  await assert.rejects(message(f.second, session, 'READY', {
    identity: { ...identity, runtimeInstanceId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }
  }), { code: 'ENGINE_IDENTITY_CHANGED' });
});

test('normalized command bounds and cooperative cleanup evidence fail closed', async () => {
  const f = fixture(), session = await open(f);
  await readySearch(f, session);
  await assert.rejects(f.first.command(session.sessionId, userA,
    { type: 'STOP', seq: session.commandSeq + 1, searchId: searchA, rawUci: 'quit' }),
  { code: 'SCHEMA_INVALID' });
  await stop(f, session);
  await command(f.first, session, 'QUIT'); await ack(f.second, session, 'QUIT');
  await assert.rejects(message(f.second, session, 'CLEANUP', { evidence: {
    ...cleanupEvidence, pthreadWorkers: 1
  } }), { code: 'CLEANUP_EVIDENCE_INVALID' });
  session.engineSeq -= 1;
  await message(f.second, session, 'CLEANUP', { evidence: cleanupEvidence });
  assert.deepEqual((await f.first.inspect(session.sessionId, userA)).state.cleanupEvidence,
    cleanupEvidence);
});

test('acknowledged role cursors prune only delivered events across twenty searches', async () => {
  const f = fixture(), session = await open(f);
  const main = await f.first.connect(session.sessionId, 'main', userA);
  const engine = await f.second.connect(session.sessionId, 'engine', session.engineCredential);
  let mainCursor = 0, engineCursor = 0;
  await command(f.first, session, 'HELLO'); await ack(f.second, session, 'HELLO');
  await message(f.second, session, 'READY', { identity });
  for (let cycle = 0; cycle < 20; cycle += 1) {
    f.advance(1_000);
    const searchId = `search_${String(cycle).padStart(8, '0')}`;
    await command(f.first, session, 'POSITION', { fen: 'startpos', moves: [] });
    await ack(f.second, session, 'POSITION');
    await command(f.first, session, 'GO', { searchId, mode: 'nodes', nodes: 1 });
    await ack(f.second, session, 'GO', searchId);
    await stop(f, session, searchId);
    if (cycle < 19) {
      await command(f.first, session, 'RESET', { searchId });
      await ack(f.second, session, 'RESET', searchId);
      await message(f.second, session, 'READY', { identity });
    }
    const mainPoll = await f.first.poll(session.sessionId, 'main', userA, main.epoch, mainCursor);
    const enginePoll = await f.second.poll(session.sessionId, 'engine', session.engineCredential,
      engine.epoch, engineCursor);
    mainCursor = mainPoll.cursor; engineCursor = enginePoll.cursor;
    await f.first.heartbeat(session.sessionId, 'main', userA, main.epoch, mainCursor);
    await f.second.heartbeat(session.sessionId, 'engine', session.engineCredential,
      engine.epoch, engineCursor);
    assert.equal((await f.store.get(session.sessionId)).state.events.length, 0);
  }
  const state = (await f.store.get(session.sessionId)).state;
  assert.equal(state.completedSearchId, 'search_00000019');
  assert.ok(state.nextEventId > 128);
  await assert.rejects(f.first.connect(session.sessionId, 'main', userA, 0),
    { code: 'STREAM_CURSOR_STALE' });
});

test('claim, idle, lease and hard expiry work from durable timestamps without timers', async () => {
  const claim = fixture();
  const unclaimed = await claim.first.create({ userId: userA, competitionId: 'expiry', participantRole: 'white' });
  claim.advance(30_001);
  await assert.rejects(claim.second.claim(unclaimed.sessionId, unclaimed.claimToken),
    { code: 'CLAIM_EXPIRED' });
  assert.equal(await claim.store.countLive(), 0);

  const idle = fixture(), idleSession = await open(idle);
  idle.advance(30_001);
  await assert.rejects(idle.second.command(idleSession.sessionId, userA, { type: 'HELLO', seq: 1 }),
    { code: 'IDLE_EXPIRED' });
  assert.equal(await idle.store.countLive(), 0);

  const lease = fixture(), leaseSession = await open(lease);
  const connection = await lease.first.connect(leaseSession.sessionId, 'engine', leaseSession.engineCredential);
  await lease.first.close(leaseSession.sessionId, 'engine', leaseSession.engineCredential, connection.epoch);
  lease.advance(5_001);
  await assert.rejects(lease.second.connect(leaseSession.sessionId, 'engine', leaseSession.engineCredential),
    { code: 'ENGINE_LEASE_EXPIRED' });
  assert.equal(await lease.store.countLive(), 0);

  const hard = fixture(), hardSession = await open(hard);
  hard.advance(120_001);
  await assert.rejects(hard.second.command(hardSession.sessionId, userA,
    { type: 'HELLO', seq: 1 }), { code: 'SESSION_EXPIRED' });
  assert.equal(await hard.store.countLive(), 0);
});

test('ten concurrent sessions isolate credentials, lifecycle and durable cleanup', async () => {
  const f = fixture();
  const sessions = await Promise.all(Array.from({ length: 10 }, (_, index) =>
    open(f, userA, `cup-${index}`)));
  assert.equal(await f.store.countLive(), 10);
  await assert.rejects(f.first.create({ userId: userA, competitionId: 'extra', participantRole: 'white' }),
    { code: 'CONCURRENT_SESSION_LIMIT' });
  for (let index = 0; index < sessions.length; index++) {
    const own = sessions[index], other = sessions[(index + 1) % sessions.length];
    await assert.rejects(f.first.engineMessage(own.sessionId, other.engineCredential,
      { type: 'READY', seq: 1 }), { code: 'ENGINE_CREDENTIAL_INVALID' });
    await command(f.first, own, 'HELLO');
    const ownRow = await f.store.get(own.sessionId), otherRow = await f.store.get(other.sessionId);
    assert.equal(ownRow.state.events.filter(item => item.value.type === 'HELLO').length, 1);
    assert.equal(otherRow.state.events.filter(item => item.value.type === 'HELLO').length,
      other.commandSeq ? 1 : 0);
  }
  for (const session of sessions) await f.second.terminate(session.sessionId, userA);
  assert.equal(await f.store.countLive(), 0);
  assert.equal(f.store.rows.size, 0);
});
