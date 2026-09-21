import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import { SessionBroker } from '../broker.mjs';

class Stream extends EventEmitter {
  constructor() { super(); this.frames = []; this.destroyed = false; this.writableEnded = false; }
  write(value) { this.frames.push(value); return true; }
  end() { if (this.writableEnded) return; this.writableEnded = true; this.emit('close'); }
  messages() { return this.frames.filter(frame => frame.startsWith('data: '))
    .map(frame => JSON.parse(frame.slice(6))); }
}

function fixture(limits = {}) {
  let time = 1_000;
  const broker = new SessionBroker({ now: () => time, limits });
  const created = broker.create({ userId: 'test-user-1', competitionId: 'cup-1', participantRole: 'white' });
  return { broker, created, now: () => time, advance: ms => { time += ms; broker.sweep(); } };
}

function claimed(f = fixture()) {
  const engine = f.broker.claim({ sessionId: f.created.sessionId, claimToken: f.created.claimToken });
  const arenaStream = new Stream();
  const engineStream = new Stream();
  f.broker.connect(f.created.sessionId, 'arena', f.created.arenaCredential, arenaStream);
  f.broker.connect(f.created.sessionId, 'engine', engine.engineCredential, engineStream);
  return { ...f, engine, arenaStream, engineStream,
    command: (seq, type, extra = {}) => f.broker.command(f.created.sessionId, f.created.arenaCredential,
      { seq, type, ...extra }),
    message: value => f.broker.engineMessage(f.created.sessionId, engine.engineCredential, value) };
}

function ready(f) {
  f.command(1, 'HELLO');
  f.message({ type: 'ACK', command: 'HELLO', seq: 1 });
  f.message({ type: 'READY' });
  f.command(2, 'POSITION', { fen: 'startpos' });
  f.message({ type: 'ACK', command: 'POSITION', seq: 2 });
}

function searching(f) {
  ready(f);
  f.command(3, 'GO');
  f.message({ type: 'ACK', command: 'GO', seq: 3 });
}

test('claim is high-entropy, single-use, session-bound and expires', () => {
  const f = fixture({ claimMs: 100 });
  assert.ok(f.created.claimToken.length >= 40);
  assert.notEqual(f.created.claimToken, f.created.arenaCredential);
  assert.throws(() => f.broker.claim({ sessionId: f.created.sessionId, claimToken: 'wrong' }),
    { code: 'CLAIM_INVALID' });
  assert.throws(() => f.broker.claim({ sessionId: 'wrong', claimToken: f.created.claimToken }),
    { code: 'SESSION_NOT_FOUND' });
  const engine = f.broker.claim({ sessionId: f.created.sessionId, claimToken: f.created.claimToken });
  assert.ok(engine.engineCredential.length >= 40);
  assert.throws(() => f.broker.claim({ sessionId: f.created.sessionId, claimToken: f.created.claimToken }),
    { code: 'CLAIM_ALREADY_USED' });
  const expired = fixture({ claimMs: 100 });
  expired.advance(101);
  assert.throws(() => expired.broker.claim({ sessionId: expired.created.sessionId,
    claimToken: expired.created.claimToken }), { code: 'CLAIM_EXPIRED' });
  assert.equal(expired.broker.activeCount(), 0);
});

test('exact sequence and engine ACK, not broker acceptance, open lifecycle gates', () => {
  const f = claimed();
  assert.throws(() => f.command(2, 'HELLO'), { code: 'SEQUENCE_INVALID' });
  const accepted = f.command(1, 'HELLO');
  assert.equal(accepted.delivered, false);
  assert.deepEqual(f.engineStream.messages().at(-1), { type: 'HELLO', seq: 1 });
  assert.throws(() => f.command(1, 'HELLO'), { code: 'SEQUENCE_INVALID' });
  assert.throws(() => f.command(3, 'POSITION', { fen: 'startpos' }), { code: 'SEQUENCE_INVALID' });
  assert.throws(() => f.command(2, 'POSITION', { fen: 'startpos' }), { code: 'COMMAND_STATE_INVALID' });
  f.message({ type: 'ACK', command: 'HELLO', seq: 1 });
  assert.deepEqual(f.arenaStream.messages().at(-1), { type: 'ACK', seq: 1, command: 'HELLO' });
  assert.throws(() => f.message({ type: 'ACK', command: 'HELLO', seq: 1 }), { code: 'ACK_INVALID' });
  f.message({ type: 'READY' });
  f.command(2, 'POSITION', { fen: 'startpos' });
  f.message({ type: 'ACK', command: 'POSITION', seq: 2 });
  f.command(3, 'GO');
  f.message({ type: 'ACK', command: 'GO', seq: 3 });
  assert.throws(() => f.broker.advance(f.created.sessionId, f.created.arenaCredential),
    { code: 'ADVANCE_GATE_CLOSED' });
  f.command(4, 'STOP');
  assert.throws(() => f.message({ type: 'BESTMOVE', move: 'e2e4' }), { code: 'BESTMOVE_STATE_INVALID' });
  f.message({ type: 'ACK', command: 'STOP', seq: 4 });
  f.message({ type: 'BESTMOVE', move: 'e2e4' });
  assert.throws(() => f.message({ type: 'BESTMOVE', move: 'e2e4' }), { code: 'BESTMOVE_STATE_INVALID' });
  f.message({ type: 'STOPPED' });
  f.command(5, 'QUIT');
  f.message({ type: 'ACK', command: 'QUIT', seq: 5 });
  assert.throws(() => f.broker.advance(f.created.sessionId, f.created.arenaCredential),
    { code: 'ADVANCE_GATE_CLOSED' });
  f.message({ type: 'CLEANUP' });
  assert.deepEqual(f.broker.advance(f.created.sessionId, f.created.arenaCredential),
    { advanceAllowed: true });
  assert.throws(() => f.message({ type: 'INFO', depth: 1, pv: 'e2e4', score: 1 }),
    { code: 'ENGINE_DETACHED' });
  assert.throws(() => f.message({ type: 'BESTMOVE', move: 'd2d4' }),
    { code: 'ENGINE_DETACHED' });
  f.broker.terminate(f.created.sessionId, f.created.arenaCredential);
  assert.equal(f.broker.activeCount(), 0);
});

test('INFO coalesces and rate-limits while STOP and terminal responses stay high priority', () => {
  const f = claimed(fixture({ maxInfoPerSecond: 20, infoIntervalMs: 1_000 }));
  searching(f);
  for (let depth = 1; depth <= 20; depth++)
    f.message({ type: 'INFO', depth, pv: `e2e4 depth${depth}`, score: depth });
  assert.throws(() => f.message({ type: 'INFO', depth: 21, pv: 'e2e4', score: 21 }),
    { code: 'INFO_RATE_LIMIT' });
  const before = f.arenaStream.messages().length;
  f.command(4, 'STOP');
  f.message({ type: 'ACK', command: 'STOP', seq: 4 });
  f.message({ type: 'BESTMOVE', move: 'e2e4' });
  f.message({ type: 'STOPPED' });
  const high = f.arenaStream.messages().slice(before);
  assert.deepEqual(high.map(message => message.type), ['ACK', 'BESTMOVE', 'STOPPED']);
  assert.ok(f.broker.metrics.coalescedInfo >= 18);
  assert.equal(f.broker.metrics.rejectedInfo, 1);
  assert.equal(f.broker.session(f.created.sessionId).channels.arena.low.depth, 20);
  assert.equal(f.broker.session(f.created.sessionId).channels.arena.low.score, 20);
  f.broker.terminate(f.created.sessionId, f.created.arenaCredential);
});

test('engine reconnect within lease succeeds; expiry and old credentials fail closed', () => {
  const f = claimed(fixture({ leaseMs: 100, idleMs: 1_000 }));
  f.engineStream.end();
  assert.equal(f.broker.session(f.created.sessionId).state, 'DISCONNECTED');
  f.advance(90);
  const reconnected = new Stream();
  f.broker.connect(f.created.sessionId, 'engine', f.engine.engineCredential, reconnected);
  assert.equal(f.broker.session(f.created.sessionId).state, 'CLAIMED');
  reconnected.end();
  f.advance(101);
  assert.equal(f.broker.activeCount(), 0);
  assert.throws(() => f.broker.connect(f.created.sessionId, 'engine', f.engine.engineCredential,
    new Stream()), { code: 'ENGINE_LEASE_EXPIRED' });
});

test('main disconnect, idle expiry, explicit termination and broker interruption revoke sessions', () => {
  const mainGone = claimed();
  mainGone.arenaStream.end();
  assert.equal(mainGone.broker.activeCount(), 0);
  assert.throws(() => mainGone.command(1, 'HELLO'), { code: 'ARENA_DISCONNECTED' });

  const idle = claimed(fixture({ idleMs: 100 }));
  idle.advance(101);
  assert.equal(idle.broker.activeCount(), 0);
  assert.throws(() => idle.command(1, 'HELLO'), { code: 'IDLE_EXPIRED' });

  const interrupted = claimed();
  interrupted.broker.interrupt();
  assert.equal(interrupted.broker.activeCount(), 0);
  assert.throws(() => interrupted.command(1, 'HELLO'), { code: 'BROKER_INTERRUPTED' });

  const terminated = claimed();
  terminated.broker.terminate(terminated.created.sessionId, terminated.created.arenaCredential);
  assert.equal(terminated.broker.activeCount(), 0);
  assert.throws(() => terminated.message({ type: 'READY' }), { code: 'ARENA_TERMINATED' });
});

test('STOP and QUIT timeouts close rather than silently advancing', () => {
  const stop = claimed(fixture({ ackMs: 100 }));
  searching(stop);
  stop.command(4, 'STOP');
  stop.advance(101);
  assert.equal(stop.broker.activeCount(), 0);
  assert.throws(() => stop.broker.advance(stop.created.sessionId, stop.created.arenaCredential),
    { code: 'STOP_TIMEOUT' });

  const quit = claimed(fixture({ ackMs: 100 }));
  searching(quit);
  quit.command(4, 'STOP');
  quit.message({ type: 'ACK', command: 'STOP', seq: 4 });
  quit.message({ type: 'BESTMOVE', move: 'e2e4' });
  quit.message({ type: 'STOPPED' });
  quit.command(5, 'QUIT');
  quit.advance(101);
  assert.equal(quit.broker.activeCount(), 0);
  assert.throws(() => quit.broker.advance(quit.created.sessionId, quit.created.arenaCredential),
    { code: 'QUIT_TIMEOUT' });
});

test('payload, command-rate, creation-rate and concurrent-session limits reject excess', () => {
  const f = claimed(fixture({ maxCommandBytes: 80, maxCommandsPerSecond: 1 }));
  assert.throws(() => f.command(1, 'HELLO', { extra: 'x'.repeat(100) }),
    { code: 'COMMAND_TOO_LARGE' });
  f.command(1, 'HELLO');
  f.message({ type: 'ACK', command: 'HELLO', seq: 1 });
  f.message({ type: 'READY' });
  assert.throws(() => f.command(2, 'POSITION', { fen: 'startpos' }),
    { code: 'COMMAND_RATE_LIMIT' });
  f.broker.terminate(f.created.sessionId, f.created.arenaCredential);

  const rate = new SessionBroker({ now: () => 1_000, limits: { maxCreatesPerMinute: 1 } });
  rate.create({ userId: 'test-user-1', competitionId: 'one', participantRole: 'white' });
  assert.throws(() => rate.create({ userId: 'test-user-1', competitionId: 'two', participantRole: 'white' }),
    { code: 'CREATE_RATE_LIMIT' });

  const concurrent = new SessionBroker({ now: () => 1_000, limits: { maxSessionsPerUser: 1 } });
  concurrent.create({ userId: 'test-user-1', competitionId: 'one', participantRole: 'white' });
  assert.throws(() => concurrent.create({ userId: 'test-user-1', competitionId: 'two', participantRole: 'white' }),
    { code: 'CONCURRENT_SESSION_LIMIT' });
});

test('INFO, PV, BESTMOVE and ERROR payload limits reject oversized frames', () => {
  const f = claimed(fixture({ maxInfoBytes: 100, maxPvBytes: 20,
    maxBestmoveBytes: 40, maxErrorBytes: 40 }));
  searching(f);
  assert.throws(() => f.message({ type: 'INFO', depth: 1, pv: 'x'.repeat(60), score: 0 }),
    { code: 'MESSAGE_TOO_LARGE' });
  assert.throws(() => f.message({ type: 'INFO', depth: 1, pv: 'x'.repeat(30), score: 0 }),
    { code: 'INFO_INVALID' });
  f.command(4, 'STOP');
  f.message({ type: 'ACK', command: 'STOP', seq: 4 });
  assert.throws(() => f.message({ type: 'BESTMOVE', move: 'e2e4', extra: 'x'.repeat(100) }),
    { code: 'MESSAGE_TOO_LARGE' });
  assert.throws(() => f.message({ type: 'ERROR', code: 'x'.repeat(100) }),
    { code: 'MESSAGE_TOO_LARGE' });
  f.broker.terminate(f.created.sessionId, f.created.arenaCredential);
});

test('ten concurrent sessions isolate messages and clean up to zero active state', () => {
  const broker = new SessionBroker();
  const sessions = [];
  for (let index = 0; index < 10; index++) {
    const created = broker.create({ userId: 'test-user-stress', competitionId: `cup-${index}`,
      participantRole: index % 2 ? 'black' : 'white' });
    const claimedEngine = broker.claim({ sessionId: created.sessionId, claimToken: created.claimToken });
    const arenaStream = new Stream();
    const engineStream = new Stream();
    broker.connect(created.sessionId, 'arena', created.arenaCredential, arenaStream);
    broker.connect(created.sessionId, 'engine', claimedEngine.engineCredential, engineStream);
    sessions.push({ created, claimedEngine, arenaStream, engineStream });
  }
  assert.equal(broker.activeCount(), 10);
  assert.throws(() => broker.create({ userId: 'test-user-stress', competitionId: 'extra',
    participantRole: 'white' }), { code: 'CONCURRENT_SESSION_LIMIT' });
  for (let index = 0; index < sessions.length; index++) {
    const own = sessions[index];
    broker.command(own.created.sessionId, own.created.arenaCredential, { seq: 1, type: 'HELLO' });
    assert.equal(own.engineStream.messages().filter(message => message.type === 'HELLO').length, 1);
    for (let other = 0; other < sessions.length; other++) if (other !== index) {
      assert.throws(() => broker.command(own.created.sessionId,
        sessions[other].created.arenaCredential, { seq: 2, type: 'HELLO' }),
      { code: 'CREDENTIAL_INVALID' });
    }
  }
  for (const session of sessions) {
    broker.terminate(session.created.sessionId, session.created.arenaCredential);
    assert.equal(session.arenaStream.writableEnded, true);
    assert.equal(session.engineStream.writableEnded, true);
  }
  assert.equal(broker.activeCount(), 0);
  assert.equal(broker.metrics.created, 10);
});
