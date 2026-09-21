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
const CYCLES = Number(process.env.EAE012_CYCLES || 1);
const SEARCH_MODE = process.env.EAE012_SEARCH_MODE || 'infinite';
const RECONNECT = process.env.EAE012_RECONNECT || 'none';
const SECURITY = process.env.EAE012_SECURITY === '1';
const MAIN_RECONNECT = process.env.EAE012_MAIN_RECONNECT === '1';
const MAIN_UI_RELOAD = process.env.EAE012_MAIN_UI_RELOAD === '1';
if (!Number.isSafeInteger(CYCLES) || CYCLES < 1 || CYCLES > 20 ||
    !['infinite', 'nodes'].includes(SEARCH_MODE) ||
    !['none', 'idle', 'search'].includes(RECONNECT)) throw new Error('TEST_MODE_INVALID');
const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
const browser = await chromium.launch({ headless: true });
let user = null, userB = null, ownerToken = null, clerkSessionId = null, tokenIssuedAt = 0;
let sessionId = null, page = null, mainStream = null, uiPage = null;
let sessionBId = null, tokenB = null;
const report = { start: Date.now(), timings: {} };
const networkErrors = [];

async function freshOwnerToken() {
  if (!ownerToken || Date.now() - tokenIssuedAt > 30_000) {
    ownerToken = (await clerk.sessions.getToken(clerkSessionId)).jwt;
    tokenIssuedAt = Date.now();
  }
  return ownerToken;
}

async function api(action, { origin = MAIN, auth, body, session = sessionId } = {}) {
  const url = new URL('/api/eae011', origin);
  url.searchParams.set('action', action);
  if (session) url.searchParams.set('sessionId', session);
  const started = performance.now();
  const credential = auth === undefined && origin === MAIN ? await freshOwnerToken() : auth;
  const response = await fetch(url, { method: body ? 'POST' : 'GET',
    signal: AbortSignal.timeout(20_000),
    headers: { Origin: origin, 'x-vercel-protection-bypass': process.env.EAE012_BYPASS,
      ...(credential ? { Authorization: `Bearer ${credential}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}) });
  const value = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${action}: ${response.status} ${value.error || ''}`);
  return { value, ms: performance.now() - started };
}

async function rawRequest(origin, action, { auth, body, session = sessionId,
  requestOrigin = origin } = {}) {
  const url = new URL('/api/eae011', origin);
  url.searchParams.set('action', action);
  if (session) url.searchParams.set('sessionId', session);
  const response = await fetch(url, { method: body ? 'POST' : 'GET',
    signal: AbortSignal.timeout(10_000),
    headers: { Origin: requestOrigin, 'x-vercel-protection-bypass': process.env.EAE012_BYPASS,
      ...(auth ? { Authorization: `Bearer ${auth}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, cors: response.headers.get('access-control-allow-origin'),
    value: await response.json().catch(() => ({})) };
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

function openMainStream(initialCursor = 0) {
  const stream = { cursor: initialCursor, events: [], stopped: false, controller: null, errors: [] };
  stream.task = (async () => {
    while (!stream.stopped) {
      const controller = new AbortController(); stream.controller = controller;
      const url = new URL('/api/eae011', MAIN);
      url.searchParams.set('action', 'stream_main');
      url.searchParams.set('sessionId', sessionId);
      url.searchParams.set('cursor', String(stream.cursor));
      try {
        const response = await fetch(url, { signal: controller.signal,
          headers: { Origin: MAIN, Authorization: `Bearer ${await freshOwnerToken()}`,
            'x-vercel-protection-bypass': process.env.EAE012_BYPASS } });
        if (!response.ok) throw new Error(`MAIN_STREAM_${response.status}`);
        const reader = response.body.getReader(), decoder = new TextDecoder();
        let buffer = '', heartbeatTimer = null;
        try {
          while (!stream.stopped) {
            const { done, value } = await reader.read(); if (done) break;
            buffer += decoder.decode(value, { stream: true });
            let boundary;
            while ((boundary = buffer.indexOf('\n\n')) >= 0) {
              const frame = buffer.slice(0, boundary); buffer = buffer.slice(boundary + 2);
              const line = frame.split('\n').find(part => part.startsWith('data: '));
              const id = frame.split('\n').find(part => part.startsWith('id: '));
              if (frame.startsWith('event: lease') && line) {
                const epoch = JSON.parse(line.slice(6)).epoch;
                clearInterval(heartbeatTimer);
                heartbeatTimer = setInterval(() => api('heartbeat_main', {
                  body: { epoch, cursor: stream.cursor }
                }).catch(error => stream.errors.push(error.message)), 1500);
              } else if (line && id) {
                stream.cursor = Math.max(stream.cursor, Number(id.slice(4)));
                stream.events.push({ ...JSON.parse(line.slice(6)), receivedAt: Date.now() });
              }
            }
          }
        } finally { clearInterval(heartbeatTimer); }
      } catch (error) {
        if (!stream.stopped && error.name !== 'AbortError') stream.errors.push(error.message);
      }
      if (!stream.stopped) await new Promise(resolve => setTimeout(resolve, 200));
    }
  })();
  stream.close = async () => { stream.stopped = true; stream.controller?.abort(); await stream.task; };
  return stream;
}

try {
  user = await clerk.users.createUser({ emailAddress: [`eae012-smoke-${crypto.randomUUID()}@example.com`],
    skipPasswordRequirement: true });
  const clerkSession = await clerk.sessions.createSession({ userId: user.id });
  clerkSessionId = clerkSession.id;
  ownerToken = (await clerk.sessions.getToken(clerkSessionId)).jwt;
  tokenIssuedAt = Date.now();
  const created = await api('create', { body: { competitionId: `eae012-${Date.now()}`,
    participantRole: 'white' }, session: null });
  sessionId = created.value.sessionId; report.timings.createMs = created.ms;
  mainStream = openMainStream();
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
  const readyAt = performance.now();
  await command('HELLO');
  const ready = await phase('READY');
  report.timings.helloToReadyMs = performance.now() - readyAt;
  assert.equal(ready.identity.runtimeInstanceId, initial.identity.runtimeInstanceId);
  if (MAIN_UI_RELOAD) {
    // The UI uses a real, short-lived Clerk session JWT. Only the interactive sign-in
    // widget is replaced, because this test owner was created through Clerk's Backend API.
    await context.exposeBinding('eae012TestOwnerToken', () => freshOwnerToken());
    await context.addInitScript(savedSession => {
      if (location.origin !== 'https://eae012-main-elcriollitos-projects.vercel.app') return;
      if (!sessionStorage.getItem('eae012-main-session'))
        sessionStorage.setItem('eae012-main-session', savedSession);
    }, sessionId);
    await context.route(`${MAIN}/js/caissa-auth.js`, route => route.fulfill({
      status: 200, contentType: 'text/javascript', body:
        `window.CAISSA_AUTH={isSignedIn:true,userId:${JSON.stringify(user.id)},` +
        `whenReady:async()=>{},getToken:()=>window.eae012TestOwnerToken()};`
    }));
    uiPage = await context.newPage();
    const uiResponse = await uiPage.goto(`${MAIN}/experiments/lc0-preview-relay/main/index.html`,
      { waitUntil: 'domcontentloaded' });
    assert.equal(uiResponse.status(), 200);
    await uiPage.waitForFunction(() => window.Eae012Main?.identity?.runtimeInstanceId &&
      document.querySelector('#identity')?.textContent.includes(window.Eae012Main.identity.runtimeInstanceId),
    null, { timeout: 10_000 });
    const savedCursor = await uiPage.evaluate(() => window.Eae012Main.cursor);
    assert.ok(savedCursor > 0);
    await uiPage.reload({ waitUntil: 'domcontentloaded' });
    await uiPage.waitForFunction(expected => window.Eae012Main?.sessionId === expected.session &&
      window.Eae012Main?.cursor >= expected.cursor &&
      window.Eae012Main?.identity?.runtimeInstanceId === expected.instance &&
      document.querySelector('#identity')?.textContent.includes(expected.instance),
    { session: sessionId, cursor: savedCursor, instance: initial.identity.runtimeInstanceId },
    { timeout: 10_000 });
    report.mainUiReload = { savedCursor, recovered: true, verifiedIdentity: true };
  }
  if (MAIN_RECONNECT) {
    const began = performance.now();
    while (!mainStream.events.some(item => item.type === 'READY') && performance.now() - began < 5_000)
      await new Promise(resolve => setTimeout(resolve, 100));
    assert.ok(mainStream.events.some(item => item.type === 'READY'));
    const savedCursor = mainStream.cursor;
    await mainStream.close();
    mainStream = openMainStream(savedCursor);
    report.mainReconnect = { savedCursor, recovered: true,
      identity: ready.identity.runtimeInstanceId };
  }
  if (SECURITY) {
    userB = await clerk.users.createUser({
      emailAddress: [`eae012-cross-user-${crypto.randomUUID()}@example.com`],
      skipPasswordRequirement: true });
    const clerkB = await clerk.sessions.createSession({ userId: userB.id });
    tokenB = (await clerk.sessions.getToken(clerkB.id)).jwt;
    const rejected = [];
    for (const [action, body] of [['inspect', null], ['stream_main', null],
      ...['POSITION', 'GO', 'STOP', 'QUIT'].map(type => ['command', { type, seq: 2 }]),
      ['terminate', {}]]) {
      const result = await rawRequest(MAIN, action, { auth: tokenB, body });
      assert.equal(result.status, 404, `${action}: ${result.status}`);
      rejected.push(action);
    }
    const other = await api('create', { auth: tokenB, session: null,
      body: { competitionId: `cross-${Date.now()}`, participantRole: 'black' } });
    sessionBId = other.value.sessionId;
    const otherClaim = await api('claim', { origin: ENGINE, auth: null,
      body: { sessionId: sessionBId, claimToken: other.value.claimToken }, session: null });
    const wrongEngine = await rawRequest(ENGINE, 'engine_state', {
      auth: otherClaim.value.engineCredential });
    assert.equal(wrongEngine.status, 403);
    const thirdOrigin = await rawRequest(MAIN, 'command', { auth: await freshOwnerToken(),
      requestOrigin: 'https://third-origin.example', body: { type: 'POSITION', seq: 2 } });
    assert.equal(thirdOrigin.status, 403);
    const health = await rawRequest(MAIN, 'health');
    assert.equal(health.status, 200);
    assert.notEqual(health.cors, '*');
    const isolatedAuth = await page.evaluate(() => Boolean(window.CAISSA_AUTH));
    assert.equal(isolatedAuth, false);
    await api('terminate', { auth: tokenB, body: {}, session: sessionBId });
    sessionBId = null;
    report.security = { rejected, wrongEngineStatus: wrongEngine.status,
      thirdOriginStatus: thirdOrigin.status, apiWildcardCors: health.cors === '*',
      isolatedAuth };
  }
  if (RECONNECT === 'idle') {
    await page.evaluate(() => window.Eae012Engine.disconnect());
    await new Promise(resolve => setTimeout(resolve, 350));
    await page.evaluate(() => window.Eae012Engine.reconnect());
    assert.equal((await page.evaluate(() => window.Eae012Engine.identity.runtimeInstanceId)),
      initial.identity.runtimeInstanceId);
    report.reconnect = { mode: 'idle', sameRuntime: true };
  }
  const chess = new Chess(), searches = [];
  report.timings.positionAckMs = []; report.timings.goAckMs = [];
  let searchId;
  for (let cycle = 0; cycle < CYCLES; cycle += 1) {
    if (chess.isGameOver()) chess.reset();
    const fen = cycle === 0 ? 'startpos' : chess.fen();
    const positionAt = performance.now();
    await command('POSITION', { fen, moves: [] });
    await phase('POSITION_ACKED');
    report.timings.positionAckMs.push(performance.now() - positionAt);
    searchId = `search_${crypto.randomUUID()}`;
    const rawBefore = await page.evaluate(() => window.Eae012Engine.metrics.rawInfo);
    const goAt = performance.now();
    await command('GO', { searchId, mode: SEARCH_MODE,
      ...(SEARCH_MODE === 'nodes' ? { nodes: 1 } : {}) });
    await phase('SEARCHING');
    report.timings.goAckMs.push(performance.now() - goAt);
    if (SEARCH_MODE === 'infinite')
      await page.waitForFunction(before => window.Eae012Engine.metrics.rawInfo > before,
        rawBefore, { timeout: 10_000 });
    else await new Promise(resolve => setTimeout(resolve, 200));
    if (RECONNECT === 'search' && cycle === 0) {
      await page.evaluate(() => window.Eae012Engine.disconnect());
      await new Promise(resolve => setTimeout(resolve, 350));
      await page.evaluate(() => window.Eae012Engine.reconnect());
      assert.equal((await page.evaluate(() => window.Eae012Engine.identity.runtimeInstanceId)),
        initial.identity.runtimeInstanceId);
      report.reconnect = { mode: 'search', sameRuntime: true,
        policy: 'local stop, then await matching relay STOP' };
    }
    const stopAt = performance.now();
    await command('STOP', { searchId });
    const stopped = await phase('STOPPED');
    const stopToStoppedMs = performance.now() - stopAt;
    const parts = /^([a-h][1-8])([a-h][1-8])([qrbn])?$/.exec(stopped.bestmove || '');
    assert.ok(parts);
    const move = chess.move({ from: parts[1], to: parts[2], promotion: parts[3] || 'q' });
    assert.ok(move, `Illegal bestmove for cycle ${cycle + 1}`);
    searches.push({ cycle: cycle + 1, searchId, fen, move: stopped.bestmove,
      san: move.san, stopToStoppedMs });
    if (cycle + 1 < CYCLES) {
      await command('RESET', { searchId });
      const reused = await phase('REUSE_READY');
      assert.equal(reused.identity.runtimeInstanceId, initial.identity.runtimeInstanceId);
      const gate = await api('advance', { body: { mode: 'reuse', searchId } });
      assert.equal(gate.value.advanceAllowed, true);
      if (chess.isGameOver()) chess.reset();
      else {
        const reply = chess.moves({ verbose: true })
          .map(candidate => ({ candidate, uci: `${candidate.from}${candidate.to}${candidate.promotion || ''}` }))
          .sort((a, b) => a.uci.localeCompare(b.uci))[0];
        assert.ok(reply);
        chess.move({ from: reply.candidate.from, to: reply.candidate.to,
          promotion: reply.candidate.promotion });
      }
    }
  }
  report.searches = searches;
  report.timings.stopToStoppedMs = searches.map(item => item.stopToStoppedMs);
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
  if (MAIN_UI_RELOAD) {
    await uiPage.waitForFunction(expected => window.Eae012Main?.events?.filter(item =>
      item.type === 'BESTMOVE').length >= expected, CYCLES, { timeout: 8_000 });
    report.mainUiReload.bestmovesAfterReload = await uiPage.evaluate(() =>
      window.Eae012Main.events.filter(item => item.type === 'BESTMOVE').length);
    report.mainUiReload.finalCursor = await uiPage.evaluate(() => window.Eae012Main.cursor);
    assert.ok(report.mainUiReload.finalCursor > report.mainUiReload.savedCursor);
    await uiPage.close(); uiPage = null;
  }
  const streamWait = performance.now();
  while (mainStream.events.filter(item => item.type === 'BESTMOVE').length < CYCLES &&
      performance.now() - streamWait < 5_000)
    await new Promise(resolve => setTimeout(resolve, 100));
  await mainStream.close();
  await api('terminate', { body: {} }); sessionId = null;
  report.runtime = { name: initial.runtime.identity.name, author: initial.runtime.identity.author,
    networkSha256: initial.runtime.identity.networkSha256, runtimeInstanceId: initial.identity.runtimeInstanceId };
  report.bestmove = searches.at(-1).move;
  report.cleanup = cleaned.cleanupEvidence;
  report.engine = { state: engineState.snapshot.state, workers: engineState.snapshot.workers,
    maxWorkers: engineState.snapshot.maxWorkers, metrics: engineState.metrics };
  report.pageErrors = pageErrors;
  report.mainStream = { events: mainStream.events.length, errors: mainStream.errors,
    ready: mainStream.events.some(item => item.type === 'READY') || Boolean(report.mainReconnect),
    bestmoves: mainStream.events.filter(item => item.type === 'BESTMOVE').length };
  report.timings.infoPropagationMs = mainStream.events
    .filter(item => item.type === 'INFO' && item.emittedAt)
    .map(item => item.receivedAt - item.emittedAt);
  report.timings.bestmovePropagationMs = mainStream.events
    .filter(item => item.type === 'BESTMOVE' && item.emittedAt)
    .map(item => item.receivedAt - item.emittedAt);
  assert.deepEqual(pageErrors, []);
  assert.deepEqual(mainStream.errors, []);
  assert.equal(report.mainStream.bestmoves, CYCLES,
    `Main SSE events: ${mainStream.events.map(item => item.type).join(',')}`);
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
  if (mainStream) await mainStream.close();
  if (uiPage && !uiPage.isClosed()) await uiPage.close();
  if (sessionId && ownerToken) await api('terminate', { body: {} }).catch(() => {});
  if (sessionBId && tokenB) await api('terminate', { auth: tokenB, body: {}, session: sessionBId }).catch(() => {});
  await browser.close();
  if (user) await clerk.users.deleteUser(user.id);
  if (userB) await clerk.users.deleteUser(userB.id);
}
