// Opt-in real EAE-013 Arena browser exercise. No credentials are stored here.
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createClerkClient } from '@clerk/backend';

if (process.env.EAE013_LIVE_PREVIEW !== '1' || !process.env.EAE013_BYPASS ||
    !process.env.CLERK_SECRET_KEY?.startsWith('sk_test_'))
  throw new Error('EAE013_PREVIEW_TEST_CREDENTIALS_REQUIRED');
const MAIN = process.env.EAE013_MAIN_ORIGIN ||
  'https://eae013-main-elcriollitos-projects.vercel.app';
const ENGINE = process.env.EAE013_ENGINE_ORIGIN ||
  'https://eae013-engine-elcriollitos-projects.vercel.app';
const CYCLES = Number(process.env.EAE013_CYCLES || 1);
const RECONNECT_EVERY = Number(process.env.EAE013_RECONNECT_EVERY || 0);
const PAUSE_REPEATS = Number(process.env.EAE013_PAUSE_REPEATS || 1);
const LEASE_EDGE_EVERY = Number(process.env.EAE013_LEASE_EDGE_EVERY || 0);
if (!Number.isSafeInteger(CYCLES) || CYCLES < 1 || CYCLES > 100 ||
    !Number.isSafeInteger(RECONNECT_EVERY) || RECONNECT_EVERY < 0 ||
    !Number.isSafeInteger(PAUSE_REPEATS) || PAUSE_REPEATS < 1 || PAUSE_REPEATS > 3 ||
    !Number.isSafeInteger(LEASE_EDGE_EVERY) || LEASE_EDGE_EVERY < 0)
  throw new Error('EAE013_CYCLES_INVALID');
const browser = await chromium.launch({ headless: true });
const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
const report = { cyclesRequested: CYCLES, cycles: [], failures: [], startedAt: Date.now() };
let user, session, context, page;
let lastToken, lastTokenAt = 0;
const token = async () => {
  if (!lastToken || Date.now() - lastTokenAt > 30_000) {
    lastToken = (await clerk.sessions.getToken(session.id)).jwt;
    lastTokenAt = Date.now();
  }
  return lastToken;
};
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const inspectSession = async sessionId => {
  const url = new URL('/api/eae011', MAIN);
  url.searchParams.set('action', 'inspect');
  url.searchParams.set('sessionId', sessionId);
  const response = await context.request.get(url.toString(), {
    headers: { Authorization: `Bearer ${await token()}`,
      Origin: MAIN, 'x-vercel-protection-bypass': process.env.EAE013_BYPASS }
  });
  return response.status();
};

try {
  user = await clerk.users.createUser({
    emailAddress: [`eae013-arena-${crypto.randomUUID()}@example.com`],
    skipPasswordRequirement: true
  });
  session = await clerk.sessions.createSession({ userId: user.id });
  context = await browser.newContext({ viewport: { width: 1440, height: 900 },
    acceptDownloads: false });
  await context.addInitScript(origin => {
    if (location.origin === origin)
      localStorage.setItem('caissa_onboarding_completed', 'true');
  }, MAIN);
  await context.exposeBinding('eae013TestOwnerToken', token);
  for (const origin of [MAIN, ENGINE]) {
    const seed = await context.request.get(`${origin}/api/eae011?action=health`, {
      headers: { 'x-vercel-protection-bypass': process.env.EAE013_BYPASS,
        'x-vercel-set-bypass-cookie': 'true' } });
    assert.equal(seed.status(), 200, `Preview protection cookie for ${origin}`);
  }
  await context.route(url => [MAIN, ENGINE].some(origin => url.href.startsWith(`${origin}/`)),
    route => route.continue({ headers: { ...route.request().headers(),
      'x-vercel-protection-bypass': process.env.EAE013_BYPASS } }));
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
  await page.waitForFunction(() => window.CaissaArenaPreview?.enabled === true &&
    document.getElementById('arenaSection')?.classList.contains('active') &&
    window.EngineRegistry?.getArenaProvider('lc0-maia-1100-preview')?.enabled === true,
    null, { timeout: 20_000 });
  if (await page.locator('#onboardingSkip').isVisible()) await page.click('#onboardingSkip');
  const axe = await new AxeBuilder({ page }).include('#arenaSection')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  report.axeSeriousOrCritical = axe.violations.filter(item =>
    ['serious', 'critical'].includes(item.impact)).map(item => item.id);
  assert.deepEqual(report.axeSeriousOrCritical, []);
  for (let i = 0; i < CYCLES; i++) {
    const began = performance.now();
    const color = i % 2 === 0 ? 'white' : 'black';
    const other = color === 'white' ? 'black' : 'white';
    const item = { cycle: i + 1, color, stage: 'selection' };
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
      item.sessionId = await page.evaluate(() => window.CaissaArenaPreview.adapter.sessionId);
      item.stage = 'ready';
      await page.waitForFunction(() => CaissaArena.state.matchState === 'running' &&
        window.CaissaArenaPreview.adapter?.identity?.runtimeInstanceId,
        null, { timeout: 60_000 });
      item.identity = await page.evaluate(() => window.CaissaArenaPreview.adapter.identity);
      item.readyMs = performance.now() - began;
      item.stage = 'moves';
      await page.waitForFunction(() => CaissaArena.game?.history().length >= 4,
        null, { timeout: 60_000 });
      item.movesBeforePause = await page.evaluate(() => CaissaArena.game.history());
      await page.click('#arenaTabGame');
      item.presentation = await page.evaluate(() => ({
        san: document.getElementById('arenaMoveHistory')?.textContent || '',
        evaluation: document.getElementById('arenaEvalScore')?.textContent || '',
        pvSan: document.getElementById('arenaEvalPV')?.textContent || '',
        evalPoints: CaissaArena.state.evalHistory.length,
        graph: Boolean(document.getElementById('arenaEvalGraph'))
      }));
      assert.ok(item.presentation.san.includes(item.movesBeforePause[0]), 'Game SAN missing');
      assert.equal(item.presentation.graph, true);
      await page.click('#arenaPauseMatch');
      await page.waitForFunction(() => CaissaArena.state.matchState === 'paused' &&
        !CaissaArena._pausePending, null, { timeout: 15_000 });
      if (LEASE_EDGE_EVERY && (i + 1) % LEASE_EDGE_EVERY === 0) {
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
      if (RECONNECT_EVERY && (i + 1) % RECONNECT_EVERY === 0) {
        const epoch = await page.evaluate(() => window.CaissaArenaPreview.adapter.mainLeaseEpoch);
        await page.evaluate(() => window.CaissaArenaPreview.adapter.streamController.abort());
        await page.waitForFunction(previous => window.CaissaArenaPreview.adapter.mainLeaseEpoch > previous,
          epoch, { timeout: 8_000 });
        await enginePage.evaluate(() => window.Eae012Engine.disconnect());
        await enginePage.evaluate(() => window.Eae012Engine.reconnect());
        item.reconnected = true;
      }
      item.stage = 'resume';
      const resumeBegan = performance.now();
      await page.click('#arenaPauseMatch');
      await page.waitForFunction(() => window.CaissaArenaPreview.adapter?.active?.started === true,
        null, { timeout: 50_000 });
      item.resumeToSearchMs = performance.now() - resumeBegan;
      await page.waitForFunction(() => CaissaArena.game?.history().length >= 6,
        null, { timeout: 50_000 });
      for (let repeat = 1; repeat < PAUSE_REPEATS; repeat++) {
        await page.click('#arenaPauseMatch');
        await page.waitForFunction(() => CaissaArena.state.matchState === 'paused' &&
          !CaissaArena._pausePending, null, { timeout: 15_000 });
        await page.click('#arenaPauseMatch');
        await page.waitForFunction(minimum => CaissaArena.game?.history().length >= minimum,
          6 + 2 * repeat, { timeout: 50_000 });
      }
      item.pauseRepeats = PAUSE_REPEATS;
      item.moves = await page.evaluate(() => CaissaArena.game.history());
      item.stage = 'cleanup';
      await page.click('#arenaStopMatch');
      await page.waitForFunction(() => CaissaArena.runtimeManager
        .getResourceSnapshot().activeRuntimeRecords === 0 &&
        window.CaissaArenaPreview.adapter?.metrics?.cleanupEvidence,
        null, { timeout: 30_000 });
      item.metrics = await page.evaluate(() => window.CaissaArenaPreview.adapter.metrics);
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
        }
      })).catch(() => null);
      report.failures.push({ cycle: i + 1, stage: item.stage, error: error.message, state });
      try {
        await page.evaluate(() => CaissaArena.stopMatch());
        await page.evaluate(() => CaissaArena._cleanupPromise);
      } catch { /* Failure evidence is kept; relay hard TTL is the final guard. */ }
      break; // A failed cycle is never hidden by later retries.
    }
  }
  report.pageErrors = pageErrors;
  report.finishedAt = Date.now();
  const completed = report.cycles.filter(item => item.stage === 'complete');
  const percentile = (values, fraction) => {
    const sorted = values.slice().sort((a, b) => a - b);
    return sorted.length ? sorted[Math.ceil(sorted.length * fraction) - 1] : null;
  };
  const compact = { cyclesRequested: CYCLES, completed: completed.length,
    failures: report.failures,
    startedAt: report.startedAt, finishedAt: report.finishedAt,
    sessionIds: completed.map(item => item.sessionId),
    reconnects: completed.filter(item => item.reconnected).length,
    leaseEdgeProbes: completed.filter(item => item.leaseEdge).length,
    colors: Object.fromEntries(['white', 'black'].map(color =>
      [color, completed.filter(item => item.color === color).length])),
    forcedKills: completed.reduce((sum, item) => sum + item.engine.forced, 0),
    orphanWorkers: completed.reduce((sum, item) => sum + item.engine.workers +
      item.engine.parentWorkers + item.engine.pthreadWorkers, 0),
    cleanupEvidenceFailures: completed.filter(item =>
      !item.metrics.cleanupEvidence?.cleanupAcknowledged).length,
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
  console.log(`EAE013_ARENA_LIVE_REPORT ${JSON.stringify(CYCLES <= 2 ? report : compact)}`);
  assert.equal(report.failures.length, 0);
  assert.equal(report.cycles.filter(item => item.stage === 'complete').length, CYCLES);
  assert.deepEqual(pageErrors, []);
} finally {
  await context?.close().catch(() => {});
  await browser.close();
  if (user) await clerk.users.deleteUser(user.id);
}
