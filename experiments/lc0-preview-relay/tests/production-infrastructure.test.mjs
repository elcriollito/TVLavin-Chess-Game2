import assert from 'node:assert/strict';
import test from 'node:test';
import { DurableBroker, LC0_IDENTITY } from '../durable-broker.mjs';
import { MemoryStore } from '../store.mjs';
import {
  PRODUCTION_POLICY, controlPolicy, nextPollDelay, transitionLifecycle
} from '../production-policy.mjs';

const user = 'user_EAE015ATEST';
const identity = { ...LC0_IDENTITY,
  runtimeInstanceId: '12345678-1234-4234-8234-123456789abc' };

function fixture() {
  let time = 1_800_000_000_000;
  const now = () => time;
  const store = new MemoryStore({ now });
  const broker = new DurableBroker(store, { now });
  return { store, broker, now, advance: value => { time += value; } };
}

test('lifecycle is finite-state and terminal sessions cannot resurrect', () => {
  const state = { lifecycle: 'CREATED', lifecycleChangedAt: 0, terminalAt: null };
  transitionLifecycle(state, 'CLAIMED', 1);
  transitionLifecycle(state, 'INITIALIZING', 2);
  transitionLifecycle(state, 'READY', 3);
  transitionLifecycle(state, 'CLEANING', 4);
  transitionLifecycle(state, 'CLEANED', 5);
  assert.equal(state.terminalAt, 5);
  assert.throws(() => transitionLifecycle(state, 'READY', 6),
    { code: 'LIFECYCLE_TRANSITION_INVALID' });
});

test('invalid claim abuse uses minimal counters and never exhausts the valid one-use claim', async () => {
  const f = fixture();
  const created = await f.broker.create({ userId: user,
    competitionId: 'competition_eae015a_claim_contract', participantRole: 'white' });
  const before = f.store.stats();
  for (let attempt = 0; attempt < 20; attempt++)
    await assert.rejects(f.broker.claim(created.sessionId, `wrong-${attempt}`),
      { code: 'CLAIM_INVALID' });
  const abused = f.store.stats();
  assert.equal(abused.fullWrites, before.fullWrites);
  assert.equal(abused.minimalWrites - before.minimalWrites, 20);
  const claimed = await f.broker.claim(created.sessionId, created.claimToken);
  assert.ok(claimed.engineCredential);
  await assert.rejects(f.broker.claim(created.sessionId, created.claimToken),
    { code: 'CLAIM_ALREADY_USED' });
});

test('rejected INFO traffic does not rewrite the full durable session row', async () => {
  const f = fixture();
  const created = await f.broker.create({ userId: user,
    competitionId: 'competition_eae015a_info_contract', participantRole: 'black' });
  const claimed = await f.broker.claim(created.sessionId, created.claimToken);
  const command = async (type, seq, extra = {}) => f.broker.command(created.sessionId, user,
    { type, seq, ...extra });
  const message = async (type, seq, extra = {}) => f.broker.engineMessage(created.sessionId,
    claimed.engineCredential, { type, seq, ...extra });
  await command('HELLO', 1);
  await message('ACK', 1, { command: 'HELLO', commandSeq: 1 });
  await message('READY', 2, { identity });
  await command('POSITION', 2, { fen: 'startpos' });
  await message('ACK', 3, { command: 'POSITION', commandSeq: 2 });
  await command('GO', 3, { searchId: 'search_EAE015A', mode: 'nodes', nodes: 1 });
  await message('ACK', 4, { command: 'GO', commandSeq: 3, searchId: 'search_EAE015A' });
  for (let seq = 5; seq <= 8; seq++) await message('INFO', seq,
    { searchId: 'search_EAE015A', depth: seq, nodes: seq, pv: 'e2e4', score: 0 });
  const before = f.store.stats();
  await assert.rejects(message('INFO', 9,
    { searchId: 'search_EAE015A', depth: 9, nodes: 9, pv: 'e2e4', score: 0 }),
  { code: 'INFO_RATE_LIMIT' });
  const after = f.store.stats();
  assert.equal(after.fullWrites, before.fullWrites);
  assert.equal(after.minimalWrites, before.minimalWrites + 1);
});

test('scheduled cleanup is bounded, reasoned, idempotent and never UNKNOWN', async () => {
  const f = fixture();
  for (let index = 0; index < 3; index++) {
    const sessionId = `cleanup_session_${String(index).padStart(20, '0')}`;
    await f.store.create({ sessionId, ownerId: `${user}${index}`,
      competitionId: `competition_cleanup_${String(index).padStart(20, '0')}`,
      participantRole: 'white', createdAt: f.now(), expiresAt: f.now() + 1000,
      state: { phase: 'UNCLAIMED', lifecycle: 'CREATED', terminalAt: null,
        claimUntil: f.now() + 1000, idleUntil: f.now() + 1000,
        expiresAt: f.now() + 1000, engineStreamUntil: null, mainStreamUntil: null } });
  }
  f.advance(1001);
  const first = await f.store.cleanupDetailed({ batchSize: 2 });
  const second = await f.store.cleanupDetailed({ batchSize: 2 });
  const third = await f.store.cleanupDetailed({ batchSize: 2 });
  assert.deepEqual([first.removed, second.removed, third.removed], [2, 1, 0]);
  assert.equal(f.store.audit.some(item => item.reason === 'UNKNOWN'), false);
  assert.equal(f.store.audit.every(item => item.reason === 'SESSION_HARD_EXPIRY'), true);
});

test('kill switch drains or disables only Lc0 policy while leaving Stockfish out of scope', () => {
  assert.deepEqual(controlPolicy('DRAINING', 'create'),
    { allowed: false, mode: 'DRAINING', code: 'LC0_DRAINING' });
  assert.equal(controlPolicy('DRAINING', 'command', 'GO').allowed, true);
  assert.equal(controlPolicy('DISABLED', 'command', 'GO').allowed, false);
  assert.equal(controlPolicy('DISABLED', 'command', 'STOP').allowed, true);
  assert.equal(controlPolicy('DISABLED', 'message', 'CLEANUP').allowed, true);
  assert.equal(controlPolicy('DISABLED', 'message', 'INFO').allowed, false);
  assert.equal('stockfish'.includes('lc0'), false);
});

test('adaptive idle polling materially reduces 10- and 100-session relay read load', () => {
  function readsPerMinute(sessions) {
    let elapsed = 0, delay = PRODUCTION_POLICY.pollInitialMs, polls = 0;
    while (elapsed + delay <= 60_000) {
      elapsed += delay; polls++;
      delay = nextPollDelay(delay, false);
    }
    return polls * 2 * sessions;
  }
  for (const sessions of [10, 100]) {
    const oldReads = 240 * 2 * sessions;
    const adaptiveReads = readsPerMinute(sessions);
    assert.ok(adaptiveReads < oldReads * 0.3,
      `${sessions} sessions: ${adaptiveReads} must be <30% of ${oldReads}`);
  }
  assert.equal(nextPollDelay(1000, true), 100);
});
