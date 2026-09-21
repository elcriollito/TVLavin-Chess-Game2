// Opt-in failure injection against the protected EAE-012 preview aliases.
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { createClerkClient } from '@clerk/backend';

const MODE = process.argv[2];
const MODES = ['wrong-network', 'worker-load', 'claim-expiry', 'worker-crash',
  'stop-timeout', 'quit-during-search'];
if (process.env.EAE012_LIVE_PREVIEW !== '1' || !process.env.EAE012_BYPASS ||
    !process.env.CLERK_SECRET_KEY?.startsWith('sk_test_') || !MODES.includes(MODE))
  throw new Error('EAE012_FAILURE_TEST_INPUT_REQUIRED');
const MAIN = 'https://eae012-main-elcriollitos-projects.vercel.app';
const ENGINE = 'https://eae012-engine-elcriollitos-projects.vercel.app';
const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
const browser = await chromium.launch({ headless: true });
let user = null, clerkSessionId = null, token = null, issuedAt = 0, sessionId = null, page = null;
const requests = [], report = { mode: MODE };

async function ownerToken() {
  if (!token || Date.now() - issuedAt > 30_000) {
    token = (await clerk.sessions.getToken(clerkSessionId)).jwt;
    issuedAt = Date.now();
  }
  return token;
}

async function call(action, { body, expected = [200, 201, 202], session = sessionId } = {}) {
  const url = new URL('/api/eae011', MAIN);
  url.searchParams.set('action', action);
  if (session) url.searchParams.set('sessionId', session);
  const response = await fetch(url, { method: body ? 'POST' : 'GET',
    signal: AbortSignal.timeout(12_000), headers: { Origin: MAIN,
      'x-vercel-protection-bypass': process.env.EAE012_BYPASS,
      Authorization: `Bearer ${await ownerToken()}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}) });
  const value = await response.json().catch(() => ({}));
  assert.ok(expected.includes(response.status), `${action}: ${response.status} ${value.error || ''}`);
  return { status: response.status, value };
}

async function phase(expected, timeoutMs = 10_000) {
  const began = performance.now();
  while (performance.now() - began < timeoutMs) {
    const state = (await call('inspect')).value.state;
    if (state.phase === expected) return state;
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  throw new Error(`PHASE_TIMEOUT_${expected}`);
}

async function snapshot() {
  return page.evaluate(() => ({ status: document.querySelector('#status')?.textContent,
    runtime: window.Eae012Engine?.runtime?.snapshot() || null,
    log: document.querySelector('#log')?.textContent.slice(-1000) }));
}

try {
  user = await clerk.users.createUser({ emailAddress: [`eae012-failure-${crypto.randomUUID()}@example.com`],
    skipPasswordRequirement: true });
  const clerkSession = await clerk.sessions.createSession({ userId: user.id });
  clerkSessionId = clerkSession.id; token = (await clerk.sessions.getToken(clerkSessionId)).jwt;
  issuedAt = Date.now();
  const created = await call('create', { body: {
    competitionId: `failure-${Date.now()}`, participantRole: 'white' }, session: null });
  sessionId = created.value.sessionId;
  const context = await browser.newContext();
  const cookie = await context.request.get(`${ENGINE}/api/eae011?action=health`, {
    headers: { 'x-vercel-protection-bypass': process.env.EAE012_BYPASS,
      'x-vercel-set-bypass-cookie': 'true' } });
  assert.equal(cookie.status(), 200);
  await context.route(/^https:\/\/eae012-engine-elcriollitos-projects\.vercel\.app\//,
    route => route.continue({ headers: { ...route.request().headers(),
      'x-vercel-protection-bypass': process.env.EAE012_BYPASS } }));
  if (MODE === 'wrong-network') await context.route('**/artifacts/network/maia-1100.pb.gz',
    route => route.fulfill({ status: 200, contentType: 'application/gzip', body: 'corrupt-network' }));
  if (MODE === 'worker-load') await context.route('**/engine/lc0-worker.js*',
    route => route.fulfill({ status: 503, contentType: 'text/javascript', body: 'worker unavailable' }));
  page = await context.newPage();
  page.on('request', request => requests.push(request.url()));
  const url = new URL('/experiments/lc0-preview-relay/engine/index.html', ENGINE);
  url.hash = new URLSearchParams({ sessionId, claimToken: created.value.claimToken }).toString();
  if (MODE === 'claim-expiry') await new Promise(resolve => setTimeout(resolve, 30_500));
  await page.goto(url.href, { waitUntil: 'domcontentloaded' });

  if (['wrong-network', 'worker-load', 'claim-expiry'].includes(MODE)) {
    await page.waitForFunction(() => document.querySelector('#status')?.textContent.startsWith('FAILED'),
      null, { timeout: 40_000 });
    const state = await snapshot();
    assert.equal(state.runtime?.workers || 0, 0);
    if (MODE === 'wrong-network') {
      assert.match(state.status, /ARTIFACT_HASH_MISMATCH_maia-1100\.pb\.gz/);
      assert.equal((await call('inspect')).value.state.phase, 'CLAIMED');
    }
    if (MODE === 'worker-load') assert.match(state.status, /Worker crash|ENGINE_RUNTIME_FAILURE|Timed out/);
    if (MODE === 'claim-expiry') {
      assert.match(state.status, /CLAIM_EXPIRED/);
      assert.equal(requests.some(request => request.includes('/artifacts/')), false);
    }
    report.state = state.status;
    report.workers = state.runtime?.workers || 0;
    report.forced = state.runtime?.forcedTerminations || 0;
  } else {
    await page.waitForFunction(() => document.querySelector('#status')?.textContent.startsWith('Lc0 initialized'),
      null, { timeout: 40_000 });
    let seq = 0;
    const command = (type, rest = {}, expected) => call('command', {
      body: { type, seq: seq + 1, ...rest }, ...(expected ? { expected } : {})
    }).then(result => { if (result.status === 202) seq += 1; return result; });
    await command('HELLO'); await phase('READY');
    if (MODE === 'worker-crash') {
      await page.evaluate(() => window.Eae012Engine.runtime.crash().catch(() => {}));
      await page.waitForFunction(() => document.querySelector('#status')?.textContent.startsWith('FAILED'),
        null, { timeout: 8_000 });
      const state = await snapshot();
      assert.equal(state.runtime.workers, 0);
      assert.ok(state.runtime.forcedTerminations >= 1);
      report.state = state.status; report.workers = state.runtime.workers;
      report.forced = state.runtime.forcedTerminations;
    } else {
      await command('POSITION', { fen: 'startpos', moves: [] }); await phase('POSITION_ACKED');
      const searchId = `search_${crypto.randomUUID()}`;
      await command('GO', { searchId, mode: 'infinite' }); await phase('SEARCHING');
      await page.waitForFunction(() => window.Eae012Engine.metrics.rawInfo > 0, null, { timeout: 10_000 });
      if (MODE === 'stop-timeout') {
        await page.evaluate(() => {
          const runtime = window.Eae012Engine.runtime, original = runtime.send.bind(runtime);
          runtime.send = command => command === 'stop' ? undefined : original(command);
        });
        await command('STOP', { searchId }); await phase('STOP_ACKED');
        await page.waitForFunction(() => document.querySelector('#status')?.textContent.startsWith('FAILED'),
          null, { timeout: 9_000 });
        await new Promise(resolve => setTimeout(resolve, 5_100));
        const expired = await call('inspect', { expected: [410] });
        assert.ok(['STOP_RESULT_TIMEOUT', 'SESSION_GONE'].includes(expired.value.error));
        const state = await snapshot();
        assert.equal(state.runtime.workers, 0);
        assert.doesNotMatch(state.log || '', /--> (?:BESTMOVE|STOPPED)/,
          'A timed-out STOP must not publish a fabricated terminal result');
        report.state = state.status; report.expired = expired.value.error;
        report.workers = state.runtime.workers; report.forced = state.runtime.forcedTerminations;
      } else {
        const rejected = await command('QUIT', {}, [409]);
        assert.equal(rejected.value.error, 'COMMAND_STATE_INVALID');
        await command('STOP', { searchId }); await phase('STOPPED');
        await command('QUIT'); const cleaned = await phase('CLEANED');
        assert.equal(cleaned.cleanupEvidence.parentWorkers, 0);
        assert.equal(cleaned.cleanupEvidence.pthreadWorkers, 0);
        assert.equal(cleaned.cleanupEvidence.forcedTerminations, 0);
        report.rejectedQuitStatus = rejected.status; report.workers = 0; report.forced = 0;
      }
    }
  }
  console.log(`EAE012_FAILURE_INJECTION ${JSON.stringify(report)}`);
} catch (error) {
  console.error(`EAE012_FAILURE_INJECTION_FAILED ${JSON.stringify({ mode: MODE,
    error: error.message, state: page ? await snapshot().catch(() => null) : null })}`);
  throw error;
} finally {
  if (sessionId && token) await call('terminate', { body: {}, expected: [200, 410] }).catch(() => {});
  await browser.close();
  if (user) await clerk.users.deleteUser(user.id);
}
