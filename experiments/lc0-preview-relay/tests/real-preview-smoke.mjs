// Opt-in live EAE-012 smoke. Secrets arrive through environment variables only.
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { createClerkClient } from '@clerk/backend';
import { Chess } from 'chess.js';

if (process.env.EAE012_LIVE_PREVIEW !== '1' || !process.env.EAE012_BYPASS ||
    !process.env.CLERK_SECRET_KEY?.startsWith('sk_test_'))
  throw new Error('EAE012_PREVIEW_TEST_CREDENTIALS_REQUIRED');
const MAIN = 'https://eae012-main-elcriollitos-projects.vercel.app';
const ENGINE = 'https://eae012-engine-elcriollitos-projects.vercel.app';
const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
const browser = await chromium.launch({ headless: true });
let user = null, ownerToken = null, sessionId = null, page = null;
const report = { start: Date.now(), timings: {} };
const networkErrors = [];

async function api(action, { origin = MAIN, auth = ownerToken, body, session = sessionId } = {}) {
  const url = new URL('/api/eae011', origin);
  url.searchParams.set('action', action);
  if (session) url.searchParams.set('sessionId', session);
  const started = performance.now();
  const response = await fetch(url, { method: body ? 'POST' : 'GET',
    signal: AbortSignal.timeout(20_000),
    headers: { Origin: origin, 'x-vercel-protection-bypass': process.env.EAE012_BYPASS,
      ...(auth ? { Authorization: `Bearer ${auth}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}) });
  const value = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${action}: ${response.status} ${value.error || ''}`);
  return { value, ms: performance.now() - started };
}

async function phase(expected, timeoutMs = 20_000) {
  const began = performance.now();
  while (performance.now() - began < timeoutMs) {
    const { value } = await api('inspect');
    if (value.state.phase === expected) return value.state;
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  throw new Error(`PHASE_TIMEOUT_${expected}`);
}

try {
  user = await clerk.users.createUser({ emailAddress: [`eae012-smoke-${crypto.randomUUID()}@example.com`],
    skipPasswordRequirement: true });
  const clerkSession = await clerk.sessions.createSession({ userId: user.id });
  ownerToken = (await clerk.sessions.getToken(clerkSession.id)).jwt;
  const created = await api('create', { body: { competitionId: `eae012-${Date.now()}`,
    participantRole: 'white' }, session: null });
  sessionId = created.value.sessionId; report.timings.createMs = created.ms;
  const context = await browser.newContext();
  const cookieResponse = await context.request.get(`${ENGINE}/api/eae011?action=health`, {
    headers: { 'x-vercel-protection-bypass': process.env.EAE012_BYPASS,
      'x-vercel-set-bypass-cookie': 'true' } });
  assert.equal(cookieResponse.status(), 200);
  const cookieNames = (await context.cookies()).map(cookie => `${cookie.name}@${cookie.domain}`);
  assert.ok(cookieNames.length > 0,
    `Vercel worker requests require a protected-preview cookie; found ${cookieNames.join(',')}`);
  await context.route(/^https:\/\/eae012-engine-elcriollitos-projects\.vercel\.app\//,
    route => route.continue({ headers: { ...route.request().headers(),
      'x-vercel-protection-bypass': process.env.EAE012_BYPASS } }));
  page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') pageErrors.push(message.text()); });
  page.on('requestfailed', request => networkErrors.push({ url: request.url(), failure: request.failure() }));
  page.on('response', response => { if (response.status() >= 400) networkErrors.push({
    url: response.url(), status: response.status() }); });
  const engineUrl = new URL('/experiments/lc0-preview-relay/engine/index.html', ENGINE);
  engineUrl.hash = new URLSearchParams({ sessionId, claimToken: created.value.claimToken }).toString();
  const initializeAt = performance.now();
  const response = await page.goto(engineUrl.href, { waitUntil: 'domcontentloaded' });
  assert.equal(response.status(), 200);
  await page.waitForFunction(() => document.querySelector('#status')?.textContent.startsWith('Lc0 initialized'),
    null, { timeout: 40_000 });
  report.timings.engineInitializeMs = performance.now() - initializeAt;
  const initial = await page.evaluate(() => ({ isolated: crossOriginIsolated,
    sab: typeof SharedArrayBuffer === 'function', runtime: window.Eae012Engine.runtime.snapshot(),
    identity: window.Eae012Engine.identity }));
  assert.equal(initial.isolated, true); assert.equal(initial.sab, true);
  assert.equal(initial.runtime.identity.networkSha256,
    'e1cf1cd0c96b8a4fa6a275f4b9fd54ed1ffebf9fe44641b9fceded310e9619c4');
  let seq = 0;
  const command = async (type, extra = {}) => {
    const result = await api('command', { body: { type, seq: ++seq, ...extra } });
    report.timings[`${type.toLowerCase()}AcceptanceMs`] = result.ms;
  };
  await command('HELLO');
  const ready = await phase('READY');
  assert.equal(ready.identity.runtimeInstanceId, initial.identity.runtimeInstanceId);
  await command('POSITION', { fen: 'startpos', moves: [] });
  await phase('POSITION_ACKED');
  const searchId = `search_${crypto.randomUUID()}`;
  await command('GO', { searchId, mode: 'infinite' });
  await phase('SEARCHING');
  await page.waitForFunction(() => window.Eae012Engine.metrics.rawInfo > 0, null, { timeout: 10_000 });
  const stopAt = performance.now();
  await command('STOP', { searchId });
  const stopped = await phase('STOPPED');
  report.timings.stopToStoppedMs = performance.now() - stopAt;
  const move = /^([a-h][1-8])([a-h][1-8])([qrbn])?$/.exec(stopped.bestmove || '');
  assert.ok(move); assert.ok(new Chess().move({ from: move[1], to: move[2], promotion: move[3] || 'q' }));
  const quitAt = performance.now();
  await command('QUIT');
  const cleaned = await phase('CLEANED');
  report.timings.quitToCleanupMs = performance.now() - quitAt;
  assert.equal(cleaned.cleanupEvidence.parentWorkers, 0);
  assert.equal(cleaned.cleanupEvidence.pthreadWorkers, 0);
  assert.equal(cleaned.cleanupEvidence.forcedTerminations, 0);
  await api('advance', { body: { mode: 'release', searchId } });
  const engineState = await page.evaluate(() => ({ snapshot: window.Eae012Engine.runtime.snapshot(),
    metrics: window.Eae012Engine.metrics, status: document.querySelector('#status')?.textContent }));
  await api('terminate', { body: {} }); sessionId = null;
  report.runtime = { name: initial.runtime.identity.name, author: initial.runtime.identity.author,
    networkSha256: initial.runtime.identity.networkSha256, runtimeInstanceId: initial.identity.runtimeInstanceId };
  report.bestmove = stopped.bestmove;
  report.cleanup = cleaned.cleanupEvidence;
  report.engine = { state: engineState.snapshot.state, workers: engineState.snapshot.workers,
    maxWorkers: engineState.snapshot.maxWorkers, metrics: engineState.metrics };
  report.pageErrors = pageErrors;
  assert.deepEqual(pageErrors, []);
  console.log(`EAE012_REAL_PREVIEW_SMOKE ${JSON.stringify(report)}`);
} catch (error) {
  const state = page && !page.isClosed() ? await page.evaluate(() => ({
    status: document.querySelector('#status')?.textContent,
    log: document.querySelector('#log')?.textContent.slice(-2000),
    runtime: window.Eae012Engine?.runtime?.snapshot()?.state,
    lines: window.Eae012Engine?.runtime?.lines?.slice(-15),
    stderr: window.Eae012Engine?.runtime?.stderr?.slice(-15)
  })).catch(() => null) : null;
  console.error(`EAE012_REAL_PREVIEW_FAILURE ${JSON.stringify({ error: error.message, state, networkErrors })}`);
  throw error;
} finally {
  if (sessionId && ownerToken) await api('terminate', { body: {} }).catch(() => {});
  await browser.close();
  if (user) await clerk.users.deleteUser(user.id);
}
