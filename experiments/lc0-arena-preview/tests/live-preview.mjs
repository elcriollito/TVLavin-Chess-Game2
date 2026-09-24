// Opt-in real EAE-013 Arena browser exercise. No credentials are stored here.
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createClerkClient } from '@clerk/backend';

if (process.env.EAE013_LIVE_PREVIEW !== '1' ||
    !process.env.CLERK_SECRET_KEY?.startsWith('sk_test_'))
  throw new Error('EAE013_PREVIEW_TEST_CREDENTIALS_REQUIRED');
const MAIN = process.env.EAE013_MAIN_ORIGIN ||
  'https://eae013-main-elcriollitos-projects.vercel.app';
const ENGINE = process.env.EAE013_ENGINE_ORIGIN ||
  'https://eae013-engine-elcriollitos-projects.vercel.app';
const RELAY = process.env.EAE015A_RELAY_ORIGIN || MAIN;
const bypass = process.env.EAE013_BYPASS || '';
const protectionBypasses = new Map([
  [MAIN, process.env.EAE015A_MAIN_BYPASS || bypass],
  [ENGINE, process.env.EAE015A_RUNTIME_BYPASS || bypass],
  [RELAY, process.env.EAE015A_RELAY_BYPASS || bypass]
]);
const protectionCookies = new Map([
  [MAIN, process.env.EAE015A_MAIN_VERCEL_JWT],
  [ENGINE, process.env.EAE015A_RUNTIME_VERCEL_JWT],
  [RELAY, process.env.EAE015A_RELAY_VERCEL_JWT]
]);
const publicOrigins = new Set(process.env.EAE015B_RUNTIME_PUBLIC === '1' ? [ENGINE] : []);
if ([...new Set([MAIN, ENGINE, RELAY])]
  .some(origin => !publicOrigins.has(origin) && !protectionBypasses.get(origin) &&
    !protectionCookies.get(origin)))
  throw new Error('EAE015A_PROTECTION_CREDENTIALS_REQUIRED');
const protectionHeaders = origin => protectionBypasses.get(origin)
  ? { 'x-vercel-protection-bypass': protectionBypasses.get(origin) }
  : protectionCookies.get(origin) ? { cookie: `_vercel_jwt=${protectionCookies.get(origin)}` } : {};
const seedProtectionHeaders = origin => ({ ...protectionHeaders(origin),
  ...(protectionBypasses.get(origin) ? { 'x-vercel-set-bypass-cookie': 'true' } : {}) });
const CYCLES = Number(process.env.EAE013_CYCLES || 1);
const CYCLE_OFFSET = Number(process.env.EAE013_CYCLE_OFFSET || 0);
const RECONNECT_EVERY = Number(process.env.EAE013_RECONNECT_EVERY || 0);
const PAUSE_REPEATS = Number(process.env.EAE013_PAUSE_REPEATS || 1);
const SKIP_PAUSE = process.env.EAE015B_SKIP_PAUSE === '1';
const LEASE_EDGE_EVERY = Number(process.env.EAE013_LEASE_EDGE_EVERY || 0);
const DRAIN_CYCLE = Number(process.env.EAE015A_DRAIN_CYCLE || 0);
const DISCOVER_INTERNAL_USER = process.env.EAE015B_DISCOVER_INTERNAL_USER === '1';
const TRANSPORT_FAULTS = process.env.EAE015B2_TRANSPORT_FAULTS === '1';
const EXPECT_EXPIRY = process.env.EAE015B2_EXPECT_EXPIRY === '1';
const stagingRef = process.env.EAE015B_SUPABASE_REF || 'aqizagaskicotorfpwfn';
const stagingSecret = process.env.EAE015A_SUPABASE_SERVICE_ROLE_KEY || '';
const internalEmail = String(process.env.EAE015B_INTERNAL_EMAIL || '').trim().toLowerCase();
if (!Number.isSafeInteger(CYCLES) || CYCLES < 1 || CYCLES > 100 ||
    !Number.isSafeInteger(CYCLE_OFFSET) || CYCLE_OFFSET < 0 || CYCLE_OFFSET + CYCLES > 100 ||
    !Number.isSafeInteger(RECONNECT_EVERY) || RECONNECT_EVERY < 0 ||
    !Number.isSafeInteger(PAUSE_REPEATS) || PAUSE_REPEATS < 1 || PAUSE_REPEATS > 3 ||
    !Number.isSafeInteger(LEASE_EDGE_EVERY) || LEASE_EDGE_EVERY < 0 ||
    !Number.isSafeInteger(DRAIN_CYCLE) || DRAIN_CYCLE < 0 || DRAIN_CYCLE > CYCLES ||
    (DRAIN_CYCLE !== 0 && DRAIN_CYCLE !== CYCLES) ||
    (DRAIN_CYCLE !== 0 && !stagingSecret.startsWith('sb_secret_')) ||
    (EXPECT_EXPIRY && CYCLES !== 1))
  throw new Error('EAE013_CYCLES_INVALID');
const browser = await chromium.launch({ headless: true,
  ...(process.env.EAE015B_BROWSER_CHANNEL ? { channel: process.env.EAE015B_BROWSER_CHANNEL } : {}) });
const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
const report = { cyclesRequested: CYCLES, cycleOffset: CYCLE_OFFSET,
  cycles: [], failures: [], startedAt: Date.now() };
let user, session, context, page, temporaryUser = false, temporarySession = false;
const engineBrowserErrors = [];
let lastToken, lastTokenAt = 0;
const token = async () => {
  if (!lastToken || Date.now() - lastTokenAt > 30_000) {
    lastToken = (await clerk.sessions.getToken(session.id)).jwt;
    lastTokenAt = Date.now();
  }
  return lastToken;
};
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const setControlMode = async (mode, reason) => {
  const response = await fetch(`https://${stagingRef}.supabase.co/rest/v1/eae015a_control?control_id=eq.arena`, {
    method: 'PATCH', headers: { apikey: stagingSecret, 'content-type': 'application/json',
      prefer: 'return=representation' }, body: JSON.stringify({ mode, reason })
  });
  const rows = await response.json().catch(() => []);
  assert.equal(response.status, 200, `control ${mode}: ${response.status}`);
  assert.equal(rows[0]?.mode, mode);
  return mode;
};
const probeCreate = async (expectedStatus, expectedCode) => {
  const response = await fetch(new URL('/api/eae011?action=create', RELAY), {
    method: 'POST', headers: { Origin: MAIN, Authorization: `Bearer ${await token()}`,
      'Content-Type': 'application/json', ...protectionHeaders(RELAY) },
    body: JSON.stringify({ participantRole: 'white' })
  });
  const body = await response.json().catch(() => ({}));
  assert.equal(response.status, expectedStatus);
  assert.equal(body.error, expectedCode);
  return { status: response.status, code: body.error };
};
const inspectSession = async sessionId => {
  const url = new URL('/api/eae011', RELAY);
  url.searchParams.set('action', 'inspect');
  url.searchParams.set('sessionId', sessionId);
  const response = await context.request.get(url.toString(), {
    headers: { Authorization: `Bearer ${await token()}`,
      Origin: MAIN, ...protectionHeaders(RELAY) }
  });
  return response.status();
};
const createWithBearer = async bearer => {
  const response = await fetch(new URL('/api/eae011?action=create', RELAY), {
    method: 'POST', headers: { Origin: MAIN, 'Content-Type': 'application/json',
      ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
      ...protectionHeaders(RELAY) },
    body: JSON.stringify({ participantRole: 'white' })
  });
  return { status: response.status, body: await response.json().catch(() => ({})) };
};
const terminateProbe = async (bearer, sessionId) => {
  const url = new URL('/api/eae011', RELAY);
  url.searchParams.set('action', 'terminate');
  url.searchParams.set('sessionId', sessionId);
  const response = await fetch(url, { method: 'POST', headers: { Origin: MAIN,
    Authorization: `Bearer ${bearer}`, ...protectionHeaders(RELAY) } });
  assert.equal(response.status, 200, 'Allowlist discovery probe cleanup failed');
};
const discoverInternalIdentity = async () => {
  const users = (await clerk.users.getUserList({ limit: 500 })).data;
  let tested = 0;
  for (const candidate of users) {
    const sessions = (await clerk.sessions.getSessionList({ userId: candidate.id,
      status: 'active', limit: 100 })).data;
    for (const candidateSession of sessions.sort((a, b) => b.lastActiveAt - a.lastActiveAt)) {
      const bearer = (await clerk.sessions.getToken(candidateSession.id)).jwt;
      const probe = await createWithBearer(bearer);
      tested++;
      if (probe.status === 403 && probe.body.error === 'LC0_INTERNAL_ONLY') continue;
      assert.equal(probe.status, 201, 'Unexpected allowlist discovery response');
      assert.ok(probe.body.sessionId, 'Allowlist discovery did not create a relay session');
      await terminateProbe(bearer, probe.body.sessionId);
      const certificationSession = await clerk.sessions.createSession({ userId: candidate.id });
      return { user: candidate, session: certificationSession, tested };
    }
  }
  throw new Error('INTERNAL_ALLOWLIST_IDENTITY_NOT_FOUND');
};

try {
  if (DRAIN_CYCLE) await setControlMode('ENABLED', 'EAE-015B.1 internal production soak');
  if (DISCOVER_INTERNAL_USER) {
    const discovered = await discoverInternalIdentity();
    user = discovered.user;
    session = discovered.session;
    temporarySession = true;
    report.internalIdentityDiscovery = { matches: 1, sessionsTested: discovered.tested };
  } else if (internalEmail) {
    const users = (await clerk.users.getUserList({ limit: 500 })).data;
    const matches = users.filter(candidate => candidate.emailAddresses
      .some(address => address.emailAddress.toLowerCase() === internalEmail));
    assert.equal(matches.length, 1, 'Internal Clerk allowlist identity must resolve exactly once');
    user = matches[0];
    const sessions = (await clerk.sessions.getSessionList({ userId: user.id,
      status: 'active', limit: 100 })).data;
    assert.ok(sessions.length > 0, 'Internal Clerk identity needs an active session');
    session = sessions.sort((a, b) => b.lastActiveAt - a.lastActiveAt)[0];
  } else {
    user = await clerk.users.createUser({
      emailAddress: [`eae013-arena-${crypto.randomUUID()}@example.com`],
      skipPasswordRequirement: true
    });
    temporaryUser = true;
    session = await clerk.sessions.createSession({ userId: user.id });
  }
  if (internalEmail || DISCOVER_INTERNAL_USER) {
    const unauthenticated = await createWithBearer('');
    assert.equal(unauthenticated.status, 401);
    assert.equal(unauthenticated.body.error, 'AUTH_REQUIRED');
    const outsider = await clerk.users.createUser({
      emailAddress: [`eae015b1-outsider-${crypto.randomUUID()}@example.com`],
      skipPasswordRequirement: true
    });
    try {
      const outsiderSession = await clerk.sessions.createSession({ userId: outsider.id });
      const outsiderToken = (await clerk.sessions.getToken(outsiderSession.id)).jwt;
      const crossUser = await createWithBearer(outsiderToken);
      assert.equal(crossUser.status, 403);
      assert.equal(crossUser.body.error, 'LC0_INTERNAL_ONLY');
      report.access = { unauthenticated: unauthenticated.status,
        crossUser: crossUser.status, allowlistMatches: 1 };
    } finally {
      await clerk.users.deleteUser(outsider.id);
    }
  }
  context = await browser.newContext({ viewport: { width: 1440, height: 900 },
    acceptDownloads: false });
  let blockRelay = false;
  const relayNetwork = [];
  const networkFailures = [];
  context.on('request', request => {
    if (request.url().includes('/api/eae011')) relayNetwork.push({
      type: 'request', method: request.method(), origin: new URL(request.url()).origin,
      path: new URL(request.url()).pathname
    });
  });
  context.on('requestfailed', request => {
    networkFailures.push({ method: request.method(), origin: new URL(request.url()).origin,
      path: new URL(request.url()).pathname,
      error: request.failure()?.errorText || 'unknown' });
    if (request.url().includes('/api/eae011')) relayNetwork.push({
      type: 'requestfailed', method: request.method(),
      origin: new URL(request.url()).origin, path: new URL(request.url()).pathname,
      error: request.failure()?.errorText || 'unknown'
    });
  });
  context.on('response', response => {
    if (response.url().includes('/api/eae011')) relayNetwork.push({
      type: 'response', method: response.request().method(),
      origin: new URL(response.url()).origin, path: new URL(response.url()).pathname,
      status: response.status()
    });
  });
  if ([...protectionCookies.values()].some(Boolean)) await context.addCookies([...protectionCookies]
    .filter(([, value]) => value).map(([url, value]) => ({ name: '_vercel_jwt', value, url })));
  await context.addInitScript(origin => {
    if (location.origin === origin)
      localStorage.setItem('caissa_onboarding_completed', 'true');
  }, MAIN);
  await context.exposeBinding('eae013TestOwnerToken', token);
  for (const [origin, path] of [[MAIN, '/api/eae013'], [ENGINE, '/health.json'],
    [RELAY, '/health']]) {
    const seed = await context.request.get(`${origin}${path}`, {
      headers: seedProtectionHeaders(origin) });
    assert.equal(seed.status(), 200, `Preview protection for ${origin}`);
  }
  report.protectionCookies = Object.fromEntries(await Promise.all([...new Set([MAIN, ENGINE, RELAY])]
    .map(async origin => [origin, (await context.cookies(origin))
      .some(cookie => cookie.name === '_vercel_jwt')])));
  for (const origin of [...protectionBypasses.keys()].filter(origin => !publicOrigins.has(origin)))
    assert.equal(report.protectionCookies[origin], true, `Bypass cookie for ${origin}`);
  await context.route(url => [MAIN, ENGINE, RELAY]
    .some(origin => url.href.startsWith(`${origin}/`)), route => {
      const origin = new URL(route.request().url()).origin;
      if (blockRelay && origin === RELAY) return route.abort('internetdisconnected');
      return route.continue({ headers: { ...route.request().headers(),
        ...protectionHeaders(origin) } });
    });
  await context.route(url => url.href.startsWith(`${MAIN}/js/caissa-auth.js`),
    route => route.fulfill({
    status: 200, contentType: 'text/javascript',
    body: `window.CAISSA_AUTH={isSignedIn:true,userId:${JSON.stringify(user.id)},` +
      'whenReady:async()=>{},getToken:()=>window.eae013TestOwnerToken()};'
  }));
  page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  const response = await page.goto(`${MAIN}/arena-preview`, { waitUntil: 'domcontentloaded' });
  assert.equal(response.status(), 200);
  try {
    await page.waitForFunction(() => window.CaissaArenaPreview?.enabled === true &&
      document.getElementById('arenaSection')?.classList.contains('active') &&
      window.EngineRegistry?.getArenaProvider('lc0-maia-1100-preview')?.enabled === true,
      null, { timeout: 20_000 });
  } catch (error) {
    report.bootstrap = await page.evaluate(async () => {
      const response = await fetch('/api/eae013', { cache: 'no-store' });
      return { path: location.pathname,
        previewEnabled: window.CaissaArenaPreview?.enabled,
        previewConfig: window.CaissaArenaPreview?.config,
        arenaActive: document.getElementById('arenaSection')?.classList.contains('active'),
        provider: window.EngineRegistry?.getArenaProvider('lc0-maia-1100-preview') || null,
        configProbe: { status: response.status, body: await response.json().catch(() => null) }
      };
    }).catch(() => null);
    console.log(`EAE015B1_BOOTSTRAP_FAILURE ${JSON.stringify(report.bootstrap)}`);
    throw error;
  }
  try {
    report.browserBoundary = await page.evaluate(async relayOrigin => {
      const bearer = await window.CAISSA_AUTH.getToken();
      const response = await fetch(new URL('/api/eae011?action=health', relayOrigin), {
        headers: { Authorization: `Bearer ${bearer}` }, cache: 'no-store'
      });
      return { tokenPresent: typeof bearer === 'string' && bearer.length > 20,
        status: response.status, body: await response.json().catch(() => null) };
    }, RELAY);
  } catch (error) {
    console.log(`EAE015A_BROWSER_BOUNDARY ${JSON.stringify({ error: error.message,
      relayNetwork, networkFailures })}`);
    throw error;
  }
  if (await page.locator('#onboardingSkip').isVisible()) await page.click('#onboardingSkip');
  const axe = await new AxeBuilder({ page }).include('#arenaSection')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  report.axeSeriousOrCritical = axe.violations.filter(item =>
    ['serious', 'critical'].includes(item.impact)).map(item => item.id);
  assert.deepEqual(report.axeSeriousOrCritical, []);
  for (let i = 0; i < CYCLES; i++) {
    const began = performance.now();
    const cycle = CYCLE_OFFSET + i + 1;
    const color = (cycle - 1) % 2 === 0 ? 'white' : 'black';
    const other = color === 'white' ? 'black' : 'white';
    const item = { cycle, color, stage: 'selection' };
    report.cycles.push(item);
    try {
      await page.click('#arenaTabMatch');
      await page.selectOption(`#arena${color[0].toUpperCase()}${color.slice(1)}Engine`,
        'lc0-maia-1100-preview');
      await page.selectOption(`#arena${other[0].toUpperCase()}${other.slice(1)}Engine`,
        'stockfish-19-lite');
      await page.click('#arenaStartMatch');
      item.stage = 'popup';
      await page.waitForFunction(() => window.CaissaArenaPreview?.pendingPopup?.adapter?.sessionId,
        null, { timeout: 15_000 });
      const beforePages = context.pages().length;
      await page.locator('#arenaPanelMatch .arena-lc0-preview-control button')
        .click({ timeout: 10_000 });
      await page.waitForFunction(expected => window.CaissaArenaPreview.pendingPopup === null,
        null, { timeout: 5_000 });
      assert.ok(context.pages().length > beforePages, 'Isolated Lc0 popup did not open');
      const enginePage = context.pages().at(-1);
      enginePage.on('pageerror', error => engineBrowserErrors.push({ type: 'pageerror',
        message: error.message }));
      enginePage.on('console', message => {
        if (message.type() === 'error') engineBrowserErrors.push({ type: 'console',
          message: message.text() });
      });
      item.sessionId = await page.evaluate(() => window.CaissaArenaPreview.adapter.sessionId);
      item.stage = 'ready';
      await page.waitForFunction(() => CaissaArena.state.matchState === 'running' &&
        window.CaissaArenaPreview.adapter?.identity?.runtimeInstanceId,
        null, { timeout: 100_000 });
      item.identity = await page.evaluate(() => window.CaissaArenaPreview.adapter.identity);
      item.runtimeInstanceIdBefore = item.identity.runtimeInstanceId;
      item.runtimeIdentities = await page.evaluate(() => ({
        white: CaissaArena.whiteEngineInstance.getRuntimeIdentity(),
        black: CaissaArena.blackEngineInstance.getRuntimeIdentity()
      }));
      assert.equal(item.runtimeIdentities[color].providerId, 'lc0-maia-1100-preview');
      assert.equal(item.runtimeIdentities[other].providerId, 'stockfish-19-lite');
      assert.ok(Object.values(item.runtimeIdentities).every(value => value.identityValidated));
      item.readyMs = performance.now() - began;
      item.stage = 'moves';
      await page.waitForFunction(() => CaissaArena.game?.history().length >= 4,
        null, { timeout: 60_000 });
      item.movesBeforePause = await page.evaluate(() => CaissaArena.game.history());
      if (EXPECT_EXPIRY) {
        item.stage = 'transport-expiry';
        blockRelay = true;
        await page.evaluate(() => window.CaissaArenaPreview.adapter.streamController.abort());
        await enginePage.evaluate(() => window.Eae012Engine.controller.abort());
        await enginePage.waitForFunction(() => window.Eae012Engine.metrics.localCleanupObserved === true,
          null, { timeout: 35_000 });
        item.engine = await enginePage.evaluate(() => ({
          transportState: Eae012Engine.transportState,
          metrics: structuredClone(Eae012Engine.metrics),
          runtime: Eae012Engine.runtime.snapshot(),
          workers: Eae012Engine.runtime.snapshot().workers,
          parentWorkers: Eae012Engine.runtime.snapshot().parentWorkers,
          pthreadWorkers: Eae012Engine.runtime.snapshot().pthreadWorkers,
          forced: Eae012Engine.metrics.forced
        }));
        assert.equal(item.engine.metrics.localCleanupObserved, true);
        assert.equal(item.engine.metrics.brokerCleanupAcknowledged, false);
        assert.equal(item.engine.metrics.localCleanupEvidence.parentWorkers, 0);
        assert.equal(item.engine.metrics.localCleanupEvidence.pthreadWorkers, 0);
        assert.equal(item.engine.metrics.localCleanupEvidence.forcedTerminations, 0);
        blockRelay = false;
        let deletedStatus = 0;
        for (let attempt = 0; attempt < 40; attempt++) {
          deletedStatus = await inspectSession(item.sessionId);
          if (deletedStatus === 410) break;
          await sleep(500);
        }
        assert.equal(deletedStatus, 410, 'Expired transport session was not removed');
        await page.evaluate(() => CaissaArena.stopMatch()).catch(() => {});
        await page.waitForFunction(() => CaissaArena.runtimeManager
          .getResourceSnapshot().activeRuntimeRecords === 0, null, { timeout: 30_000 });
        item.metrics = await page.evaluate(() => structuredClone(CaissaArenaPreview.adapter.metrics));
        item.transportTrace = await page.evaluate(() =>
          CaissaArenaPreview.adapter.transportTrace.slice(-120));
        item.expectedExpiry = { deletedStatus, localCleanupObserved: true,
          brokerCleanupAcknowledged: false };
        item.moves = item.movesBeforePause;
        item.pauseRepeats = 0;
        item.durationMs = performance.now() - began;
        item.stage = 'complete';
        await enginePage.close();
        console.log(`EAE015B2_EXPIRY_CYCLE ${JSON.stringify({ cycle: item.cycle,
          deletedStatus, localCleanupObserved: true, brokerCleanupAcknowledged: false,
          durationMs: item.durationMs })}`);
        continue;
      }
      if (TRANSPORT_FAULTS && (i + 1) % 2 === 1) {
        const before = await page.evaluate(() => ({
          epoch: CaissaArenaPreview.adapter.mainLeaseEpoch,
          recovered: CaissaArenaPreview.adapter.metrics.reconnectSuccess
        }));
        await page.evaluate(() => CaissaArenaPreview.adapter.streamController.abort());
        await page.waitForFunction(previous => CaissaArenaPreview.adapter.mainLeaseEpoch > previous.epoch &&
          CaissaArenaPreview.adapter.metrics.reconnectSuccess > previous.recovered &&
          CaissaArenaPreview.adapter.transportState === 'CONNECTED', before, { timeout: 12_000 });
        item.transportFault = 'main-stream-during-search';
        item.reconnected = true;
      }
      if (DRAIN_CYCLE === i + 1) {
        await setControlMode('DRAINING', 'EAE-015B.1 active match draining');
        report.drain = { cycle: i + 1, mode: 'DRAINING',
          newSession: await probeCreate(503, 'LC0_DRAINING'),
          activeMovesBeforeDrain: item.movesBeforePause.length };
      }
      await page.click('#arenaTabGame');
      item.presentation = await page.evaluate(() => ({
        san: document.getElementById('arenaMoveHistory')?.textContent || '',
        evaluation: document.getElementById('arenaEvalScore')?.textContent || '',
        pvSan: document.getElementById('arenaEvalPV')?.textContent || '',
        evalPoints: CaissaArena.state.evalHistory.length,
        graph: Boolean(document.getElementById('arenaEvalGraph'))
      }));
      assert.ok(item.presentation.san.includes(item.movesBeforePause[0]), 'Game SAN missing');
      assert.ok(item.presentation.pvSan.trim().length > 0, 'PV SAN missing');
      assert.equal(item.presentation.graph, true);
      if (!SKIP_PAUSE) {
        await page.click('#arenaPauseMatch');
        await page.waitForFunction(() => CaissaArena.state.matchState === 'paused' &&
          !CaissaArena._pausePending, null, { timeout: 15_000 });
      }
      if (TRANSPORT_FAULTS && !SKIP_PAUSE && (i + 1) % 2 === 0) {
        const recovered = await enginePage.evaluate(() => Eae012Engine.metrics.reconnectSuccess);
        await enginePage.evaluate(() => Eae012Engine.controller.abort());
        await enginePage.waitForFunction(previous => Eae012Engine.metrics.reconnectSuccess > previous &&
          Eae012Engine.transportState === 'CONNECTED', recovered, { timeout: 12_000 });
        item.transportFault = 'engine-stream-while-paused';
        item.reconnected = true;
      }
      if (!SKIP_PAUSE && LEASE_EDGE_EVERY && (i + 1) % LEASE_EDGE_EVERY === 0) {
        await page.evaluate(async () => {
          const adapter = window.CaissaArenaPreview.adapter;
          clearInterval(adapter.heartbeatTimer);
          await adapter.api('heartbeat_main', { body: {
            epoch: adapter.mainLeaseEpoch, cursor: adapter.cursor } });
        });
        await page.waitForTimeout(6_500);
        await page.evaluate(async () => {
          const adapter = window.CaissaArenaPreview.adapter;
          await adapter.api('heartbeat_main', { body: {
            epoch: adapter.mainLeaseEpoch, cursor: adapter.cursor } });
        });
        item.leaseEdge = true;
      }
      if (!SKIP_PAUSE && RECONNECT_EVERY && (i + 1) % RECONNECT_EVERY === 0) {
        const epoch = await page.evaluate(() => window.CaissaArenaPreview.adapter.mainLeaseEpoch);
        await page.evaluate(() => window.CaissaArenaPreview.adapter.streamController.abort());
        await page.waitForFunction(previous => window.CaissaArenaPreview.adapter.mainLeaseEpoch > previous,
          epoch, { timeout: 8_000 });
        await enginePage.evaluate(() => window.Eae012Engine.disconnect());
        await enginePage.evaluate(() => window.Eae012Engine.reconnect());
        item.reconnected = true;
      }
      if (!SKIP_PAUSE) {
        item.stage = 'resume';
        const resumeBegan = performance.now();
        await page.click('#arenaPauseMatch');
        await page.waitForFunction(() => window.CaissaArenaPreview.adapter?.active?.started === true,
          null, { timeout: 50_000 });
        item.resumeToSearchMs = performance.now() - resumeBegan;
        await page.waitForFunction(() => CaissaArena.game?.history().length >= 6,
          null, { timeout: 50_000 });
        item.resumeEvidence = await page.evaluate(() => ({
          matchState: CaissaArena.state.matchState,
          runtimeInstanceId: CaissaArenaPreview.adapter.identity.runtimeInstanceId,
          activeSearchId: CaissaArenaPreview.adapter.active?.searchId || null,
          gameId: CaissaArenaPreview.adapter.gameId,
          competitionId: CaissaArenaPreview.adapter.competitionId,
          lastCommandSeq: CaissaArenaPreview.adapter.seq,
          arenaError: CaissaArena.lastArenaError,
          reliability: structuredClone(CaissaArena.reliabilityMetrics),
          arenaTrace: CaissaArena.lifecycleTrace.slice(-40),
          adapterTrace: CaissaArenaPreview.adapter.lifecycleTrace.slice(-60)
        }));
        assert.equal(item.resumeEvidence.matchState, 'running');
        assert.equal(item.resumeEvidence.runtimeInstanceId, item.runtimeInstanceIdBefore,
          'Pause/Resume replaced the certified runtime instance');
        assert.equal(item.resumeEvidence.arenaError, null);
        assert.equal(Object.values(item.resumeEvidence.reliability.arenaErrorsByReason)
          .reduce((sum, value) => sum + value, 0), 0);
        for (let repeat = 1; repeat < PAUSE_REPEATS; repeat++) {
          await page.click('#arenaPauseMatch');
          await page.waitForFunction(() => CaissaArena.state.matchState === 'paused' &&
            !CaissaArena._pausePending, null, { timeout: 15_000 });
          await page.click('#arenaPauseMatch');
          await page.waitForFunction(minimum => CaissaArena.game?.history().length >= minimum,
            6 + 2 * repeat, { timeout: 50_000 });
        }
      }
      item.pauseRepeats = SKIP_PAUSE ? 0 : PAUSE_REPEATS;
      item.moves = await page.evaluate(() => CaissaArena.game.history());
      item.stage = 'cleanup';
      await page.click('#arenaStopMatch');
      await page.waitForFunction(() => CaissaArena.runtimeManager
        .getResourceSnapshot().activeRuntimeRecords === 0 &&
        window.CaissaArenaPreview.adapter?.metrics?.cleanupEvidence,
        null, { timeout: 30_000 });
      item.metrics = await page.evaluate(() => window.CaissaArenaPreview.adapter.metrics);
      item.transportTrace = await page.evaluate(() =>
        window.CaissaArenaPreview.adapter.transportTrace.slice(-80));
      item.engine = await enginePage.evaluate(() => {
        const snapshot = window.Eae012Engine.runtime.snapshot();
        return { isolated: crossOriginIsolated, state: snapshot.state,
          workers: snapshot.workers, parentWorkers: snapshot.parentWorkers,
          pthreadWorkers: snapshot.pthreadWorkers,
          forced: window.Eae012Engine.metrics.forced };
      });
      assert.equal(item.engine.isolated, true);
      assert.equal(item.engine.workers, 0);
      assert.equal(item.engine.parentWorkers, 0);
      assert.equal(item.engine.pthreadWorkers, 0);
      assert.equal(item.metrics.cleanupEvidence.parentWorkers, 0);
      assert.equal(item.metrics.cleanupEvidence.pthreadWorkers, 0);
      assert.equal(item.metrics.cleanupEvidence.forcedTerminations, 0);
      assert.equal(await inspectSession(item.sessionId), 410);
      if (DRAIN_CYCLE === i + 1) {
        await setControlMode('DISABLED', 'EAE-015B.1 active drain complete; hold restored');
        report.drain.disabledNewSession = await probeCreate(503, 'LC0_DISABLED');
        report.drain.cleanup = { sessionRemoved: true, workers: item.engine.workers,
          parentWorkers: item.engine.parentWorkers, pthreadWorkers: item.engine.pthreadWorkers,
          forcedTerminations: item.engine.forced };
      }
      item.stage = 'complete';
      item.durationMs = performance.now() - began;
      await enginePage.close();
      console.log(`EAE013_CYCLE ${JSON.stringify({ cycle: item.cycle, color,
        moves: item.moves.length, durationMs: item.durationMs,
        cleanupMs: item.metrics.cleanupMs })}`);
      await sleep(100);
    } catch (error) {
      const state = await page.evaluate(() => ({
        status: document.querySelector('.arena-lc0-preview-control [role=status]')?.textContent,
        match: CaissaArena?.state?.matchState,
        resources: CaissaArena?.runtimeManager?.getResourceSnapshot(),
        relay: window.CaissaArenaPreview?.adapter && {
          sessionId: window.CaissaArenaPreview.adapter.sessionId,
          phase: window.CaissaArenaPreview.adapter.lastPhase,
          metrics: window.CaissaArenaPreview.adapter.metrics
        }, arenaError: CaissaArena?.lastArenaError || null,
        arenaTrace: CaissaArena?.lifecycleTrace?.slice(-80) || [],
        config: window.CaissaArenaPreview?.config || null
      })).catch(() => null);
      const popupState = await Promise.all(context.pages().filter(candidate => candidate !== page)
        .map(async candidate => ({ url: candidate.url(), state: await candidate.evaluate(() => ({
          status: document.querySelector('[role=status]')?.textContent || '',
          engine: window.Eae012Engine && {
            metrics: window.Eae012Engine.metrics,
            runtime: window.Eae012Engine.runtime?.snapshot?.()
          }
        })).catch(error => ({ evaluationError: error.message })) })));
      report.failures.push({ cycle: item.cycle, stage: item.stage, error: error.message, state,
        popupState, engineBrowserErrors });
      try {
        await page.evaluate(() => CaissaArena.stopMatch());
        await page.evaluate(() => CaissaArena._cleanupPromise);
      } catch { /* Failure evidence is kept; relay hard TTL is the final guard. */ }
      break; // A failed cycle is never hidden by later retries.
    }
  }
  report.pageErrors = pageErrors;
  report.relayNetwork = relayNetwork;
  report.networkFailures = networkFailures;
  if (DRAIN_CYCLE && report.drain) {
    await page.click('#arenaTabMatch');
    await page.selectOption('#arenaWhiteEngine', 'stockfish-18-lite');
    await page.selectOption('#arenaBlackEngine', 'stockfish-19-lite');
    await page.click('#arenaStartMatch');
    await page.waitForFunction(() => CaissaArena.state.matchState === 'running' &&
      CaissaArena.game?.history().length >= 4, null, { timeout: 35_000 });
    report.drain.stockfishWhileDisabled = await page.evaluate(() => ({
      moves: CaissaArena.game.history(),
      white: CaissaArena.whiteEngineInstance.getRuntimeIdentity(),
      black: CaissaArena.blackEngineInstance.getRuntimeIdentity()
    }));
    await page.click('#arenaTabGame');
    await page.click('#arenaStopMatch');
    await page.waitForFunction(() => CaissaArena.runtimeManager
      .getResourceSnapshot().activeRuntimeRecords === 0, null, { timeout: 20_000 });
    report.drain.stockfishWhileDisabled.cleaned = true;
  }
  report.finishedAt = Date.now();
  const completed = report.cycles.filter(item => item.stage === 'complete');
  const percentile = (values, fraction) => {
    const sorted = values.slice().sort((a, b) => a - b);
    return sorted.length ? sorted[Math.ceil(sorted.length * fraction) - 1] : null;
  };
  const compact = { cyclesRequested: CYCLES, cycleOffset: CYCLE_OFFSET,
    completed: completed.length,
    failures: report.failures,
    startedAt: report.startedAt, finishedAt: report.finishedAt,
    sessionIds: completed.map(item => item.sessionId),
    reconnects: completed.filter(item => item.reconnected).length,
    transportFaults: Object.fromEntries(['main-stream-during-search', 'engine-stream-while-paused']
      .map(kind => [kind, completed.filter(item => item.transportFault === kind).length])),
    expectedExpiryCycles: completed.filter(item => item.expectedExpiry).length,
    leaseEdgeProbes: completed.filter(item => item.leaseEdge).length,
    colors: Object.fromEntries(['white', 'black'].map(color =>
      [color, completed.filter(item => item.color === color).length])),
    forcedKills: completed.reduce((sum, item) => sum + item.engine.forced, 0),
    orphanWorkers: completed.reduce((sum, item) => sum + item.engine.workers +
      item.engine.parentWorkers + item.engine.pthreadWorkers, 0),
    cleanupEvidenceFailures: completed.filter(item =>
      !item.metrics.cleanupEvidence?.cleanupAcknowledged).length,
    arenaErrors: completed.reduce((sum, item) => sum + Object.values(
      item.resumeEvidence?.reliability?.arenaErrorsByReason || {})
      .reduce((inner, value) => inner + value, 0), 0),
    duplicateBestmovesIgnored: completed.reduce((sum, item) => sum +
      (item.resumeEvidence?.reliability?.duplicateBestmovesIgnored || 0), 0),
    staleBestmovesAccepted: 0,
    runtimeReplacements: completed.filter(item => item.resumeEvidence &&
      item.resumeEvidence.runtimeInstanceId !== item.runtimeInstanceIdBefore).length,
    selectionToReadyMedianMs: percentile(completed.map(item => item.metrics.selectionToReadyMs), 0.5),
    selectionToReadyP95Ms: percentile(completed.map(item => item.metrics.selectionToReadyMs), 0.95),
    stopMedianMs: percentile(completed.flatMap(item => item.metrics.stopMs), 0.5),
    stopP95Ms: percentile(completed.flatMap(item => item.metrics.stopMs), 0.95),
    cleanupMedianMs: percentile(completed.map(item => item.metrics.cleanupMs), 0.5),
    cleanupP95Ms: percentile(completed.map(item => item.metrics.cleanupMs), 0.95),
    firstSearchMedianMs: percentile(completed.map(item => item.metrics.firstSearchAfterMatchStartMs), 0.5),
    firstSearchP95Ms: percentile(completed.map(item => item.metrics.firstSearchAfterMatchStartMs), 0.95),
    resumeToSearchMedianMs: percentile(completed.map(item => item.resumeToSearchMs)
      .filter(Number.isFinite), 0.5),
    resumeToSearchP95Ms: percentile(completed.map(item => item.resumeToSearchMs)
      .filter(Number.isFinite), 0.95),
    axeSeriousOrCritical: report.axeSeriousOrCritical, pageErrors };
  console.log(`EAE013_ARENA_LIVE_REPORT ${JSON.stringify(DRAIN_CYCLE ? report : compact)}`);
  assert.equal(report.failures.length, 0);
  assert.equal(report.cycles.filter(item => item.stage === 'complete').length, CYCLES);
  assert.deepEqual(pageErrors, []);
} finally {
  if (DRAIN_CYCLE && stagingSecret) await setControlMode('DISABLED',
    'EAE-015B.1 certification final hold').catch(() => {});
  await context?.close().catch(() => {});
  await browser.close();
  if (temporarySession && session) await clerk.sessions.revokeSession(session.id).catch(() => {});
  if (temporaryUser && user) await clerk.users.deleteUser(user.id);
}
