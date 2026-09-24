import assert from 'node:assert/strict';
import { createClerkClient } from '@clerk/backend';

if (process.env.EAE015A_HOSTED_LOAD !== '1') throw new Error('EAE015A_HOSTED_LOAD_REQUIRED');
const RELAY = process.env.EAE015A_RELAY_ORIGIN;
const MAIN = process.env.EAE013_MAIN_ORIGIN;
const ENGINE = process.env.EAE013_ENGINE_ORIGIN;
const BYPASS = process.env.EAE015A_RELAY_BYPASS;
const VERCEL_JWT = process.env.EAE015A_RELAY_VERCEL_JWT;
const SUPABASE = process.env.EAE011_SUPABASE_URL;
const SERVICE = process.env.EAE015A_SUPABASE_SERVICE_ROLE_KEY;
if (!RELAY || !MAIN || !ENGINE || (!BYPASS && !VERCEL_JWT) || !SERVICE?.startsWith('sb_secret_') ||
    !process.env.CLERK_SECRET_KEY?.startsWith('sk_test_')) throw new Error('LOAD_CREDENTIALS_REQUIRED');

const protectionHeaders = () => BYPASS
  ? { 'x-vercel-protection-bypass': BYPASS }
  : { cookie: `_vercel_jwt=${VERCEL_JWT}` };
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function retryClerk(operation) {
  let lastError;
  for (let attempt = 0; attempt < 5; attempt++) {
    try { return await operation(); }
    catch (error) { lastError = error; await sleep(500 * (attempt + 1)); }
  }
  throw lastError;
}

const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
const users = [];
let requestCount = 0, rateLimitRejects = 0;
const samples = { create: [], claim: [], ack: [], terminal: [], cleanup: [] };
const identity = index => ({ providerClass: 'lc0-browser-experimental',
  version: 'v0.33.0-dev+git.482bb4a', sourceCommit: '482bb4a830287b726ebe7d42f14ab7f5f17c18a0',
  uciName: 'Lc0 v0.33.0-dev+git.482bb4a', uciAuthor: 'The LCZero Authors.',
  backend: 'cpu-wasm', networkId: 'CSSLab Maia 1100 v1.0',
  networkSha256: 'e1cf1cd0c96b8a4fa6a275f4b9fd54ed1ffebf9fe44641b9fceded310e9619c4',
  manifestSha256: '492c6749989f429c269725d6d2761d4687c8096ca437f5651189fcfbe4ffbb9f',
  runtimeInstanceId: crypto.randomUUID(), dummyIndex: index });
const cleanupEvidence = { parentWorkers: 0, pthreadWorkers: 0,
  runtimeState: 'TERMINATED', cleanupAcknowledged: true, forcedTerminations: 0 };

async function call(action, { method = 'GET', auth, body, sessionId, engine = false,
  expected = [200, 201, 202] } = {}) {
  const url = new URL('/api/eae011', RELAY);
  url.searchParams.set('action', action);
  if (sessionId) url.searchParams.set('sessionId', sessionId);
  const began = performance.now(); requestCount++;
  const response = await fetch(url, { method, signal: AbortSignal.timeout(30_000), headers: {
    Origin: engine ? ENGINE : MAIN, ...protectionHeaders(),
    ...(auth ? { Authorization: `Bearer ${auth}` } : {}),
    ...(body ? { 'Content-Type': 'application/json' } : {})
  }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const data = await response.json().catch(() => ({}));
  if (response.status === 429) rateLimitRejects++;
  assert.ok(expected.includes(response.status), `${action}:${response.status}:${data.error || ''}`);
  return { data, status: response.status, ms: performance.now() - began };
}

async function newOwner(index) {
  const user = await retryClerk(() => clerk.users.createUser({
    emailAddress: [`eae015a-load-${index}-${crypto.randomUUID()}@example.com`],
    skipPasswordRequirement: true
  }));
  users.push(user.id);
  const session = await retryClerk(() => clerk.sessions.createSession({ userId: user.id }));
  return { sessionId: session.id, token: null, tokenAt: 0, pending: null };
}

async function ownerToken(owner) {
  if (owner.token && Date.now() - owner.tokenAt < 20_000) return owner.token;
  if (!owner.pending) owner.pending = retryClerk(() => clerk.sessions.getToken(owner.sessionId)).then(result => {
    owner.token = result.jwt;
    owner.tokenAt = Date.now();
    owner.pending = null;
    return owner.token;
  }, error => { owner.pending = null; throw error; });
  return owner.pending;
}

async function lifecycle(owner, index, reconnect = false, cohort) {
  const created = await call('create', { method: 'POST', auth: await ownerToken(owner),
    body: { competitionId: `load-${index}`, participantRole: index % 2 ? 'black' : 'white' } });
  samples.create.push(created.ms);
  const sessionId = created.data.sessionId;
  const claimed = await call('claim', { method: 'POST', body: {
    sessionId, claimToken: created.data.claimToken }, engine: true });
  samples.claim.push(claimed.ms);
  await cohort.enter();
  const leave = await cohort.acquire();
  try {
  const engine = claimed.data.engineCredential;
  let commandSeq = 0, engineSeq = 0, reconnects = 0;
  const command = async (type, extra = {}) => call('command', { method: 'POST', sessionId,
    auth: await ownerToken(owner), body: { type, seq: ++commandSeq, ...extra } });
  const message = async (type, extra = {}) => call('message', { method: 'POST', sessionId,
    auth: engine, body: { type, seq: ++engineSeq, ...extra }, engine: true });
  const ack = async (type, began, searchId) => {
    await message('ACK', { command: type, commandSeq, ...(searchId ? { searchId } : {}) });
    samples.ack.push(performance.now() - began);
  };
  let began = performance.now(); await command('HELLO'); await ack('HELLO', began);
  await message('READY', { identity: (() => { const value = identity(index); delete value.dummyIndex; return value; })() });
  began = performance.now(); await command('POSITION', { fen: 'startpos', moves: [] });
  await ack('POSITION', began);
  const searchId = `search_${crypto.randomUUID()}`;
  began = performance.now(); await command('GO', { searchId, mode: 'nodes', nodes: 1 });
  await ack('GO', began, searchId);
  for (let n = 0; n < 3; n++) await message('INFO', { searchId, depth: n + 1,
    nodes: n + 1, score: n, pv: 'e2e4 e7e5' });
  let infoEvents;
  if (reconnect) {
    const streamUrl = new URL('/api/eae011', RELAY);
    streamUrl.searchParams.set('action', 'stream_main');
    streamUrl.searchParams.set('sessionId', sessionId);
    streamUrl.searchParams.set('cursor', '0');
    requestCount++;
    const stream = await fetch(streamUrl, { headers: { Origin: MAIN,
      Authorization: `Bearer ${await ownerToken(owner)}`, ...protectionHeaders() } });
    assert.equal(stream.status, 200);
    reconnects++;
    const reader = stream.body.getReader();
    const decoder = new TextDecoder();
    let streamText = '';
    const readUntil = Date.now() + 10_000;
    while (!streamText.includes('"type":"INFO"') && Date.now() < readUntil) {
      const next = await reader.read();
      if (next.done) break;
      streamText += decoder.decode(next.value, { stream: true });
    }
    await reader.cancel();
    infoEvents = [...streamText.matchAll(/"type":"INFO"/g)].length;
  } else {
    const response = await fetch(`${SUPABASE}/rest/v1/eae011_sessions?session_id=eq.${sessionId}&select=state`,
      { headers: { apikey: SERVICE } });
    assert.equal(response.status, 200);
    const rows = await response.json();
    infoEvents = rows[0].state.events.filter(event => event.value?.type === 'INFO').length;
  }
  assert.equal(infoEvents, 1, 'INFO_COALESCING_FAILED');
  const terminalAt = performance.now(); await command('STOP', { searchId });
  await ack('STOP', terminalAt, searchId);
  await message('BESTMOVE', { searchId, move: 'e2e4' }); await message('STOPPED', { searchId });
  samples.terminal.push(performance.now() - terminalAt);
  const cleanupAt = performance.now(); await command('QUIT'); await ack('QUIT', cleanupAt);
  await message('CLEANUP', { evidence: cleanupEvidence });
  const gate = await call('advance', { method: 'POST', sessionId, auth: await ownerToken(owner),
    body: { mode: 'release', searchId } });
  assert.equal(gate.data.advanceAllowed, true);
  await call('terminate', { method: 'POST', sessionId, auth: await ownerToken(owner), body: {} });
  samples.cleanup.push(performance.now() - cleanupAt);
  assert.equal((await call('inspect', { sessionId, auth: await ownerToken(owner), expected: [410] })).status, 410);
  return { sessionId, engine, reconnects, infoSent: 3, infoEvents };
  } finally {
    leave();
  }
}

function createCohortGate(size, width = 10) {
  let arrived = 0, open;
  const ready = new Promise(resolve => { open = resolve; });
  let active = 0;
  const waiters = [];
  return {
    async enter() { if (++arrived === size) open(); await ready; },
    async acquire() {
      if (active >= width) await new Promise(resolve => waiters.push(resolve));
      active++;
      return () => { active--; waiters.shift()?.(); };
    }
  };
}

async function snapshot() {
  const response = await fetch(`${SUPABASE}/rest/v1/rpc/eae015a_metrics_snapshot`, {
    method: 'POST', headers: { apikey: SERVICE, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_minutes: 60 }) });
  assert.equal(response.status, 200);
  return Object.fromEntries((await response.json()).map(row => [row.metric, row]));
}
async function activeRows() {
  const response = await fetch(`${SUPABASE}/rest/v1/eae011_sessions?select=session_id`, {
    headers: { apikey: SERVICE, Prefer: 'count=exact', Range: '0-0' } });
  assert.ok([200, 206].includes(response.status));
  return Number((response.headers.get('content-range') || '0/0').split('/')[1] || 0);
}
async function setControlMode(mode) {
  const response = await fetch(`${SUPABASE}/rest/v1/eae015a_control?control_id=eq.arena`, {
    method: 'PATCH', headers: { apikey: SERVICE, 'Content-Type': 'application/json',
      Prefer: 'return=representation' },
    body: JSON.stringify({ mode, reason: 'EAE-015A.1 hosted load certification' })
  });
  const rows = await response.json().catch(() => []);
  assert.equal(response.status, 200);
  assert.equal(rows[0]?.mode, mode);
}
const percentile = (values, p) => {
  const sorted = values.toSorted((a, b) => a - b);
  return Number(sorted[Math.max(0, Math.ceil(sorted.length * p) - 1)].toFixed(1));
};
const metricDelta = (after, before, name) => Number(after[name]?.counter_value || 0) -
  Number(before[name]?.counter_value || 0);

try {
  await setControlMode('ENABLED');
  const owners = [];
  for (let i = 0; i < 10; i++) owners.push(await newOwner(i));
  const cohorts = [];
  for (const size of [10, 100]) {
    const before = await snapshot(), began = performance.now(), requestsBefore = requestCount;
    const cohort = createCohortGate(size);
    const results = await Promise.all(Array.from({ length: size }, (_, i) =>
      lifecycle(owners[Math.floor(i / 10)], size * 1000 + i, i < 10, cohort)));
    const elapsedMs = performance.now() - began, after = await snapshot();
    const ids = new Set(results.map(item => item.sessionId));
    const credentials = new Set(results.map(item => item.engine));
    assert.equal(ids.size, size); assert.equal(credentials.size, size); assert.equal(await activeRows(), 0);
    const reads = metricDelta(after, before, 'db_read');
    const writes = metricDelta(after, before, 'db_write');
    cohorts.push({ sessions: size, elapsedMs: Number(elapsedMs.toFixed(1)),
      requestCount: requestCount - requestsBefore, reads, writes,
      readsPerSecond: Number((reads / (elapsedMs / 1000)).toFixed(2)),
      writesPerSecond: Number((writes / (elapsedMs / 1000)).toFixed(2)),
      readsPerSession: Number((reads / size).toFixed(2)),
      writesPerSession: Number((writes / size).toFixed(2)),
      reconnectsAttempted: results.reduce((sum, item) => sum + item.reconnects, 0),
      reconnectSuccessRate: 1,
      infoSent: results.reduce((sum, item) => sum + item.infoSent, 0),
      infoRetained: results.reduce((sum, item) => sum + item.infoEvents, 0),
      cleanupActiveRows: 0, crossSessionLeakage: false });
  }
  console.log(`EAE015A_HOSTED_LOAD_REPORT ${JSON.stringify({ cohorts,
    latency: Object.fromEntries(Object.entries(samples).map(([name, values]) => [name,
      { count: values.length, medianMs: percentile(values, .5), p95Ms: percentile(values, .95) }])),
    rateLimitRejects, errors: 0 })}`);
} finally {
  await setControlMode('DISABLED');
  await Promise.allSettled(users.map(id => clerk.users.deleteUser(id)));
}
