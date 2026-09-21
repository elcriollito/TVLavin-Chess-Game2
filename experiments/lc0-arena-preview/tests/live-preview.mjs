// Opt-in real EAE-013 Arena browser exercise. No credentials are stored here.
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createClerkClient } from '@clerk/backend';

if (process.env.EAE013_LIVE_PREVIEW !== '1' || !process.env.EAE013_BYPASS ||
    !process.env.CLERK_SECRET_KEY?.startsWith('sk_test_'))
  throw new Error('EAE013_PREVIEW_TEST_CREDENTIALS_REQUIRED');
const MAIN = 'https://eae013-main-elcriollitos-projects.vercel.app';
const ENGINE = 'https://eae013-engine-elcriollitos-projects.vercel.app';
const CYCLES = Number(process.env.EAE013_CYCLES || 1);
if (!Number.isSafeInteger(CYCLES) || CYCLES < 1 || CYCLES > 50)
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
  const response = await fetch(url, { headers: { Authorization: `Bearer ${await token()}`,
    Origin: MAIN, 'x-vercel-protection-bypass': process.env.EAE013_BYPASS } });
  return response.status;
};

try {
  user = await clerk.users.createUser({
    emailAddress: [`eae013-arena-${crypto.randomUUID()}@example.com`],
    skipPasswordRequirement: true
  });
  session = await clerk.sessions.createSession({ userId: user.id });
  context = await browser.newContext({ viewport: { width: 1440, height: 900 },
    acceptDownloads: false });
  await context.addInitScript(() => {
    if (location.origin === 'https://eae013-main-elcriollitos-projects.vercel.app')
      localStorage.setItem('caissa_onboarding_completed', 'true');
  });
  await context.exposeBinding('eae013TestOwnerToken', token);
  for (const origin of [MAIN, ENGINE]) {
    const seed = await context.request.get(`${origin}/api/eae011?action=health`, {
      headers: { 'x-vercel-protection-bypass': process.env.EAE013_BYPASS,
        'x-vercel-set-bypass-cookie': 'true' } });
    assert.equal(seed.status(), 200, `Preview protection cookie for ${origin}`);
  }
  await context.route(/^https:\/\/eae013-(main|engine)-elcriollitos-projects\.vercel\.app\//,
    route => route.continue({ headers: { ...route.request().headers(),
      'x-vercel-protection-bypass': process.env.EAE013_BYPASS } }));
  await context.route(/^https:\/\/eae013-main-elcriollitos-projects\.vercel\.app\/js\/caissa-auth\.js(?:\?|$)/,
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
      const [enginePage] = await Promise.all([
        context.waitForEvent('page', { timeout: 10_000 }),
        page.getByRole('button', { name: 'Start Lc0 Engine' }).click()
      ]);
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
      await page.click('#arenaPauseMatch');
      await page.waitForFunction(() => CaissaArena.state.matchState === 'paused' &&
        !CaissaArena._pausePending, null, { timeout: 15_000 });
      item.stage = 'resume';
      await page.click('#arenaPauseMatch');
      await page.waitForFunction(() => CaissaArena.game?.history().length >= 6,
        null, { timeout: 50_000 });
      item.moves = await page.evaluate(() => CaissaArena.game.history());
      item.stage = 'cleanup';
      await page.click('#arenaStopMatch');
      await page.waitForFunction(() => CaissaArena.runtimeManager
        .getResourceSnapshot().activeRuntimeRecords === 0 &&
        window.CaissaArenaPreview.adapter?.metrics?.cleanupEvidence,
        null, { timeout: 30_000 });
      item.metrics = await page.evaluate(() => window.CaissaArenaPreview.adapter.metrics);
      item.engine = await enginePage.evaluate(() => ({ isolated: crossOriginIsolated,
        snapshot: window.Eae012Engine.runtime.snapshot(),
        forced: window.Eae012Engine.metrics.forced }));
      assert.equal(item.engine.isolated, true);
      assert.equal(item.engine.snapshot.workers, 0);
      assert.equal(item.metrics.cleanupEvidence.parentWorkers, 0);
      assert.equal(item.metrics.cleanupEvidence.pthreadWorkers, 0);
      assert.equal(item.metrics.cleanupEvidence.forcedTerminations, 0);
      assert.equal(await inspectSession(item.sessionId), 404);
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
      break; // A failed cycle is never hidden by later retries.
    }
  }
  report.pageErrors = pageErrors;
  report.finishedAt = Date.now();
  console.log(`EAE013_ARENA_LIVE_REPORT ${JSON.stringify(report)}`);
  assert.equal(report.failures.length, 0);
  assert.equal(report.cycles.filter(item => item.stage === 'complete').length, CYCLES);
  assert.deepEqual(pageErrors, []);
} finally {
  await context?.close().catch(() => {});
  await browser.close();
  if (user) await clerk.users.deleteUser(user.id);
}
