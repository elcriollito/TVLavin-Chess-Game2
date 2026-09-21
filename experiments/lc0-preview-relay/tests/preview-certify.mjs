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
const metrics = { create: [], claim: [], command: [], ack: [], infoPost: [],
  infoPropagation: [], terminal: [], cleanup: [] };
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
  const record = { sessionId, token, engineCredential: null };
  sessions.push(record);
  const claimed = await call(engine, 'claim', { method: 'POST',
    body: { sessionId, claimToken } });
  metrics.claim.push(claimed.ms);
  const engineCredential = claimed.data.engineCredential;
  record.engineCredential = engineCredential;
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
    metrics.infoPost.push(performance.now() - infoStart);
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

async function openStream(origin, role, sessionId, auth, cursor = 0) {
  const url = new URL('/api/eae011', origin);
  url.searchParams.set('action', role === 'main' ? 'stream_main' : 'stream_engine');
  url.searchParams.set('sessionId', sessionId);
  url.searchParams.set('cursor', String(cursor));
  const controller = new AbortController();
  const response = await fetch(url, { signal: controller.signal,
    headers: { Origin: origin, Authorization: `Bearer ${auth}`,
      'x-vercel-protection-bypass': bypass } });
  assert.equal(response.status, 200, `stream_${role}: ${response.status}`);
  const stream = { controller, events: [], cursor, error: null, epoch: null,
    heartbeatTimer: null };
  controller.signal.addEventListener('abort', () => clearInterval(stream.heartbeatTimer));
  const reader = response.body.getReader(), decoder = new TextDecoder();
  stream.task = (async () => {
    let buffer = '';
    try {
      while (true) {
        const next = await reader.read();
        if (next.done) break;
        buffer += decoder.decode(next.value, { stream: true });
        let boundary;
        while ((boundary = buffer.indexOf('\n\n')) >= 0) {
          const frame = buffer.slice(0, boundary); buffer = buffer.slice(boundary + 2);
          const data = frame.split('\n').find(line => line.startsWith('data: '));
          const id = frame.split('\n').find(line => line.startsWith('id: '));
          if (frame.startsWith('event: lease') && data) {
            stream.epoch = JSON.parse(data.slice(6)).epoch;
            stream.heartbeatTimer = setInterval(() => call(origin,
              role === 'main' ? 'heartbeat_main' : 'heartbeat_engine', {
                method: 'POST', sessionId, auth, body: { epoch: stream.epoch },
                expected: [200, 409, 410]
              }).catch(error => { stream.error = error; }), 1500);
            continue;
          }
          if (!data || !id) continue;
          stream.cursor = Math.max(stream.cursor, Number(id.slice(4)));
          stream.events.push(JSON.parse(data.slice(6)));
        }
      }
    } catch (error) { if (error.name !== 'AbortError') stream.error = error; }
    finally { clearInterval(stream.heartbeatTimer); }
  })();
  stream.waitFor = async (predicate, timeoutMs = 6000) => {
    const until = Date.now() + timeoutMs;
    while (Date.now() < until) {
      const item = stream.events.find(predicate);
      if (item) return item;
      if (stream.error) throw stream.error;
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    throw new Error(`STREAM_EVENT_TIMEOUT_${role}`);
  };
  return stream;
}

async function streamTrial(owner) {
  const ownerToken = await owner.token();
  const created = await call(main, 'create', { method: 'POST', auth: ownerToken,
    body: { competitionId: `stream-${Date.now()}`, participantRole: 'white' } });
  const sessionId = created.data.sessionId;
  const record = { sessionId, token: ownerToken };
  sessions.push(record);
  const claimed = await call(engine, 'claim', { method: 'POST',
    body: { sessionId, claimToken: created.data.claimToken } });
  const credential = claimed.data.engineCredential;
  let mainStream, engineStream, engineSeq = 0;
  const message = (type, extra = {}) => call(engine, 'message', { method: 'POST',
    sessionId, auth: credential, body: { type, seq: ++engineSeq, ...extra } });
  const command = (type, seq, extra = {}) => call(main, 'command', { method: 'POST',
    sessionId, auth: ownerToken, body: { type, seq, ...extra } });
  try {
    mainStream = await openStream(main, 'main', sessionId, ownerToken);
    engineStream = await openStream(engine, 'engine', sessionId, credential);
    await command('HELLO', 1);
    await engineStream.waitFor(item => item.type === 'HELLO');
    const firstCursor = engineStream.cursor;
    engineStream.controller.abort(); await engineStream.task;
    engineStream = await openStream(engine, 'engine', sessionId, credential, firstCursor);
    assert.equal(engineStream.events.length, 0);
    await message('ACK', { command: 'HELLO', commandSeq: 1 });
    await message('READY');
    await mainStream.waitFor(item => item.type === 'READY');
    const mainCursor = mainStream.cursor;
    mainStream.controller.abort(); await mainStream.task;
    mainStream = await openStream(main, 'main', sessionId, ownerToken, mainCursor);
    await command('POSITION', 2, { fen: 'startpos' });
    await engineStream.waitFor(item => item.type === 'POSITION');
    await message('ACK', { command: 'POSITION', commandSeq: 2 });
    const searchId = `search_${crypto.randomUUID()}`;
    await command('GO', 3, { searchId });
    await engineStream.waitFor(item => item.type === 'GO');
    await message('ACK', { command: 'GO', commandSeq: 3, searchId });
    const at = performance.now();
    await message('INFO', { searchId, depth: 1, pv: 'e2e4', score: 4, emittedAt: Date.now() });
    await mainStream.waitFor(item => item.type === 'INFO' && item.searchId === searchId);
    metrics.infoPropagation.push(performance.now() - at);
    await command('STOP', 4, { searchId });
    await message('ACK', { command: 'STOP', commandSeq: 4, searchId });
    await message('BESTMOVE', { searchId, move: 'e2e4', emittedAt: Date.now() });
    await message('STOPPED', { searchId });
    await mainStream.waitFor(item => item.type === 'STOPPED' && item.searchId === searchId);
    await command('QUIT', 5);
    await message('ACK', { command: 'QUIT', commandSeq: 5 });
    await message('CLEANUP');
    await mainStream.waitFor(item => item.type === 'CLEANUP');
    const gate = await call(main, 'advance', { method: 'POST', sessionId, auth: ownerToken,
      body: { mode: 'release', searchId } });
    assert.equal(gate.data.advanceAllowed, true);
    await call(main, 'terminate', { method: 'POST', sessionId, auth: ownerToken, body: {} });
    return { engineReconnected: true, mainReconnected: true,
      replayCursor: true, cleanupAfterReconnect: true };
  } finally {
    mainStream?.controller.abort(); engineStream?.controller.abort();
  }
}

async function expiryTrial(owner) {
  const auth = await owner.token();
  const create = async label => {
    const response = await call(main, 'create', { method: 'POST', auth,
      body: { competitionId: `expiry-${label}-${Date.now()}`, participantRole: 'white' } });
    sessions.push({ sessionId: response.data.sessionId, token: auth });
    return response.data;
  };
  const [unclaimed, idle, lease] = await Promise.all([
    create('unclaimed'), create('idle'), create('lease')
  ]);
  const idleClaim = await call(engine, 'claim', { method: 'POST',
    body: { sessionId: idle.sessionId, claimToken: idle.claimToken } });
  const leaseClaim = await call(engine, 'claim', { method: 'POST',
    body: { sessionId: lease.sessionId, claimToken: lease.claimToken } });
  const liveStream = await openStream(engine, 'engine', lease.sessionId,
    leaseClaim.data.engineCredential);
  liveStream.controller.abort(); await liveStream.task;
  await new Promise(resolve => setTimeout(resolve, 9000));
  const disconnected = await call(engine, 'stream_engine', { sessionId: lease.sessionId,
    auth: leaseClaim.data.engineCredential, expected: [410] });
  assert.equal(disconnected.status, 410);
  await new Promise(resolve => setTimeout(resolve, 22500));
  const expiredClaim = await call(engine, 'claim', { method: 'POST', expected: [410],
    body: { sessionId: unclaimed.sessionId, claimToken: unclaimed.claimToken } });
  assert.equal(expiredClaim.status, 410);
  const expiredIdle = await call(main, 'command', { method: 'POST',
    sessionId: idle.sessionId, auth: await owner.token(), expected: [410],
    body: { type: 'HELLO', seq: 1 } });
  assert.equal(expiredIdle.status, 410);
  return { unclaimed: expiredClaim.data.error, idle: expiredIdle.data.error,
    disconnectedLease: disconnected.data.error, staleCredentialRevoked: true,
    idleClaimSucceeded: Boolean(idleClaim.data.engineCredential) };
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
  const stream = await streamTrial(a);
  const expiry = await expiryTrial(a);
  const summary = Object.fromEntries(Object.entries(metrics).map(([name, samples]) => {
    const sorted = samples.toSorted((x, y) => x - y);
    return [name, { count: sorted.length,
      medianMs: Number(sorted[Math.floor((sorted.length - 1) / 2)].toFixed(1)),
      p95Ms: Number(sorted[Math.ceil(sorted.length * 0.95) - 1].toFixed(1)) }];
  }));
  console.log(JSON.stringify({ verdict: 'LIVE_PREVIEW_LIFECYCLE_PASS', sessions: ten.length,
    elapsedMs: Date.now() - started, stream, expiry, summary }, null, 2));
} finally {
  await Promise.allSettled(sessions.map(async item => {
    try { await call(main, 'terminate', { method: 'POST', sessionId: item.sessionId,
      auth: item.token, body: {}, expected: [200, 410] }); } catch { /* already gone */ }
  }));
  await Promise.allSettled(users.map(userId => clerk.users.deleteUser(userId)));
}
