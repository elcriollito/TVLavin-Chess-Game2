// Opt-in live preview certification. Never prints tokens or credentials.
import assert from 'node:assert/strict';
import { createClerkClient } from '@clerk/backend';

if (process.env.EAE011_LIVE_PREVIEW !== '1') throw new Error('EAE011_LIVE_PREVIEW_REQUIRED');
const main = 'https://eae011-main-elcriollitos-projects.vercel.app';
const engine = 'https://eae011-engine-elcriollitos-projects.vercel.app';
const bypass = process.env.EAE011_BYPASS;
const secret = process.env.CLERK_SECRET_KEY;
if (!bypass || !secret?.startsWith('sk_test_')) throw new Error('PREVIEW_CREDENTIALS_REQUIRED');
const clerk = createClerkClient({ secretKey: secret });
const users = [];
const sessions = [];
const metrics = { create: [], claim: [], command: [], ack: [], info: [], terminal: [], cleanup: [] };
const started = Date.now();

async function call(origin, action, { method = 'GET', body, auth, sessionId,
  requestOrigin = origin, expected = [200, 201, 202], timeoutMs = 15000 } = {}) {
  const url = new URL('/api/eae011', origin);
  url.searchParams.set('action', action);
  if (sessionId) url.searchParams.set('sessionId', sessionId);
  const began = performance.now();
  const response = await fetch(url, { method, signal: AbortSignal.timeout(timeoutMs),
    headers: { Origin: requestOrigin, 'x-vercel-protection-bypass': bypass,
      ...(auth ? { Authorization: `Bearer ${auth}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}) });
  const data = await response.json().catch(() => ({}));
  assert.ok(expected.includes(response.status), `${action}: ${response.status} ${data.error || ''}`);
  return { status: response.status, data, ms: performance.now() - began };
}

async function identity() {
  const user = await clerk.users.createUser({
    emailAddress: [`eae011-${crypto.randomUUID()}@example.com`],
    skipPasswordRequirement: true
  });
  users.push(user.id);
  const session = await clerk.sessions.createSession({ userId: user.id });
  return { userId: user.id, sessionId: session.id,
    token: async () => (await clerk.sessions.getToken(session.id)).jwt };
}

async function runSession(owner, index) {
  const token = await owner.token();
  const created = await call(main, 'create', { method: 'POST', auth: token,
    body: { competitionId: `live-${index}-${Date.now()}`, participantRole: 'white' } });
  metrics.create.push(created.ms);
  const { sessionId, claimToken } = created.data;
  sessions.push({ sessionId, token, engineCredential: null });
  const claimed = await call(engine, 'claim', { method: 'POST',
    body: { sessionId, claimToken } });
  metrics.claim.push(claimed.ms);
  const engineCredential = claimed.data.engineCredential;
  sessions.at(-1).engineCredential = engineCredential;
  let commandSeq = 0, engineSeq = 0;
  const send = async (type, extra = {}) => {
    const response = await call(main, 'command', { method: 'POST', sessionId, auth: await owner.token(),
      body: { type, seq: ++commandSeq, ...extra } });
    metrics.command.push(response.ms);
    return performance.now();
  };
  const message = async (type, extra = {}) => call(engine, 'message', {
    method: 'POST', sessionId, auth: engineCredential,
    body: { type, seq: ++engineSeq, ...extra }
  });
  const ack = async (type, searchId, began) => {
    await message('ACK', { command: type, commandSeq, ...(searchId ? { searchId } : {}) });
    metrics.ack.push(performance.now() - began);
  };
  try {
    let began = await send('HELLO'); await ack('HELLO', null, began); await message('READY');
    began = await send('POSITION', { fen: 'startpos' }); await ack('POSITION', null, began);
    const searchId = `search_${crypto.randomUUID()}`;
    began = await send('GO', { searchId }); await ack('GO', searchId, began);
    const infoStart = performance.now();
    await message('INFO', { searchId, depth: 1, pv: 'e2e4 e7e5', score: 12,
      emittedAt: Date.now() });
    metrics.info.push(performance.now() - infoStart);
    const terminalStart = await send('STOP', { searchId });
    await ack('STOP', searchId, terminalStart);
    await message('BESTMOVE', { searchId, move: 'e2e4', emittedAt: Date.now() });
    await message('STOPPED', { searchId });
    metrics.terminal.push(performance.now() - terminalStart);
    const cleanupStart = await send('QUIT');
    await ack('QUIT', null, cleanupStart); await message('CLEANUP');
    metrics.cleanup.push(performance.now() - cleanupStart);
    const gate = await call(main, 'advance', { method: 'POST', sessionId,
      auth: await owner.token(), body: { mode: 'release', searchId } });
    assert.equal(gate.data.advanceAllowed, true);
    await call(main, 'terminate', { method: 'POST', sessionId,
      auth: await owner.token(), body: {} });
    return { sessionId, searchId };
  } catch (error) {
    error.message = `session ${index}: ${error.message}`;
    throw error;
  }
}

try {
  const [a, b] = await Promise.all([identity(), identity()]);
  const noAuth = await call(main, 'create', { method: 'POST', expected: [401],
    body: { competitionId: 'no-auth', participantRole: 'white' } });
  assert.equal(noAuth.status, 401);
  const wrongOrigin = await call(main, 'create', { method: 'POST', auth: await a.token(),
    requestOrigin: 'https://evil.example', expected: [403],
    body: { competitionId: 'bad-origin', participantRole: 'white' } });
  assert.equal(wrongOrigin.status, 403);
  const initial = await call(main, 'create', { method: 'POST', auth: await a.token(),
    body: { competitionId: 'owner-test', participantRole: 'white' } });
  const initialId = initial.data.sessionId;
  sessions.push({ sessionId: initialId, token: await a.token() });
  for (const action of ['inspect', 'terminate']) {
    const attempt = await call(main, action, { method: action === 'terminate' ? 'POST' : 'GET',
      sessionId: initialId, auth: await b.token(), expected: [404],
      ...(action === 'terminate' ? { body: {} } : {}) });
    assert.equal(attempt.status, 404);
  }
  const badClaim = await call(engine, 'claim', { method: 'POST', expected: [403],
    body: { sessionId: initialId, claimToken: 'stolen-wrong-token' } });
  assert.equal(badClaim.status, 403);
  const claimPair = await Promise.all([
    call(engine, 'claim', { method: 'POST', expected: [200, 409],
      body: { sessionId: initialId, claimToken: initial.data.claimToken } }),
    call(engine, 'claim', { method: 'POST', expected: [200, 409],
      body: { sessionId: initialId, claimToken: initial.data.claimToken } })
  ]);
  assert.deepEqual(claimPair.map(item => item.status).sort(), [200, 409]);
  const initialCredential = claimPair.find(item => item.status === 200).data.engineCredential;
  const replay = await call(engine, 'claim', { method: 'POST', expected: [409],
    body: { sessionId: initialId, claimToken: initial.data.claimToken } });
  assert.equal(replay.status, 409);
  const hijack = await call(main, 'command', { method: 'POST', sessionId: initialId,
    auth: await b.token(), expected: [404], body: { type: 'HELLO', seq: 1 } });
  assert.equal(hijack.status, 404);
  await call(main, 'terminate', { method: 'POST', sessionId: initialId,
    auth: await a.token(), body: {} });
  const ten = await Promise.all(Array.from({ length: 10 }, (_, i) => runSession(a, i)));
  assert.equal(new Set(ten.map(item => item.sessionId)).size, 10);
  console.log(JSON.stringify({ verdict: 'LIVE_PREVIEW_LIFECYCLE_PASS', sessions: ten.length,
    elapsedMs: Date.now() - started, metrics }, null, 2));
} finally {
  await Promise.allSettled(sessions.map(async item => {
    try { await call(main, 'terminate', { method: 'POST', sessionId: item.sessionId,
      auth: item.token, body: {}, expected: [200, 410] }); } catch { /* already gone */ }
  }));
  await Promise.allSettled(users.map(userId => clerk.users.deleteUser(userId)));
}
