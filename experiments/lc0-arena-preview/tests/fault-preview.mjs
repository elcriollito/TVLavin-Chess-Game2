// Opt-in, real protected-preview failure probe; credentials stay in process env.
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { createClerkClient } from '@clerk/backend';

const MODE = process.env.EAE013_FAULT_MODE;
if (!['close-ready', 'close-match', 'network-match'].includes(MODE) ||
    !process.env.EAE013_BYPASS || !process.env.CLERK_SECRET_KEY?.startsWith('sk_test_'))
  throw new Error('EAE013_FAULT_PROBE_CONFIG_REQUIRED');
const MAIN = 'https://eae013-main-elcriollitos-projects.vercel.app';
const ENGINE = 'https://eae013-engine-elcriollitos-projects.vercel.app';
const browser = await chromium.launch({ headless: true });
const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
let user, session, context, page, lastToken, lastTokenAt = 0;
const report = { mode: MODE, errors: [] };
const token = async () => {
  if (!lastToken || Date.now() - lastTokenAt > 30_000) {
    lastToken = (await clerk.sessions.getToken(session.id)).jwt;
    lastTokenAt = Date.now();
  }
  return lastToken;
};
const inspect = async sessionId => {
  const url = new URL('/api/eae011', MAIN);
  url.searchParams.set('action', 'inspect');
  url.searchParams.set('sessionId', sessionId);
  const response = await context.request.get(url.toString(), {
    headers: { Authorization: `Bearer ${await token()}`, Origin: MAIN,
      'x-vercel-protection-bypass': process.env.EAE013_BYPASS }
  });
  return response.status();
};
try {
  user = await clerk.users.createUser({
    emailAddress: [`eae013-fault-${crypto.randomUUID()}@example.com`],
    skipPasswordRequirement: true
  });
  session = await clerk.sessions.createSession({ userId: user.id });
  context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addInitScript(() => {
    if (location.origin === 'https://eae013-main-elcriollitos-projects.vercel.app')
      localStorage.setItem('caissa_onboarding_completed', 'true');
  });
  await context.exposeBinding('eae013FaultToken', token);
  for (const origin of [MAIN, ENGINE]) {
    const seed = await context.request.get(`${origin}/api/eae011?action=health`, {
      headers: { 'x-vercel-protection-bypass': process.env.EAE013_BYPASS,
        'x-vercel-set-bypass-cookie': 'true' }
    });
    assert.equal(seed.status(), 200);
  }
  await context.route(/^https:\/\/eae013-(main|engine)-elcriollitos-projects\.vercel\.app\//,
    route => route.continue({ headers: { ...route.request().headers(),
      'x-vercel-protection-bypass': process.env.EAE013_BYPASS } }));
  await context.route(/^https:\/\/eae013-main-elcriollitos-projects\.vercel\.app\/js\/caissa-auth\.js(?:\?|$)/,
    route => route.fulfill({ status: 200, contentType: 'text/javascript',
      body: `window.CAISSA_AUTH={isSignedIn:true,userId:${JSON.stringify(user.id)},` +
        'whenReady:async()=>{},getToken:()=>window.eae013FaultToken()};' }));
  page = await context.newPage();
  page.on('pageerror', error => report.errors.push(error.message));
  assert.equal((await page.goto(`${MAIN}/arena-preview`, { waitUntil: 'domcontentloaded' })).status(), 200);
  await page.waitForFunction(() => window.CaissaArenaPreview?.enabled &&
    CaissaArena?.state?.boardMounted, null, { timeout: 20_000 });
  await page.click('#arenaTabMatch');
  await page.selectOption('#arenaWhiteEngine', 'lc0-maia-1100-preview');
  await page.selectOption('#arenaBlackEngine', 'stockfish-19-lite');
  await page.click('#arenaStartMatch');
  await page.waitForFunction(() => window.CaissaArenaPreview?.pendingPopup?.adapter?.sessionId,
    null, { timeout: 15_000 });
  report.sessionId = await page.evaluate(() => CaissaArenaPreview.adapter.sessionId);
  await page.locator('#arenaPanelMatch .arena-lc0-preview-control button').click();
  const enginePage = context.pages().at(-1);
  assert.notEqual(enginePage, page);
  await enginePage.waitForURL(/\/experiments\/lc0-preview-relay\/engine\/index\.html/,
    { timeout: 15_000 });
  if (MODE === 'close-ready') {
    report.before = await page.evaluate(() => ({ match: CaissaArena.state.matchState,
      phase: CaissaArenaPreview.adapter?.lastPhase }));
    await enginePage.close();
  } else {
    await page.waitForFunction(() => CaissaArena.state.matchState === 'running' &&
      CaissaArena.game?.history().length >= 4, null, { timeout: 60_000 });
    report.before = await page.evaluate(() => ({ moves: CaissaArena.game.history(),
      match: CaissaArena.state.matchState, phase: CaissaArenaPreview.adapter?.lastPhase }));
    if (MODE === 'close-match') await enginePage.close();
    else {
      await context.setOffline(true);
      await new Promise(resolve => setTimeout(resolve, 2_000));
      await context.setOffline(false);
    }
  }
  await page.waitForFunction(mode => {
    const records = CaissaArena.runtimeManager.getResourceSnapshot().activeRuntimeRecords;
    return mode === 'network-match'
      ? CaissaArena.state.matchState === 'idle' || CaissaArena.game?.history().length >= 6
      : CaissaArena.state.matchState === 'idle' && records === 0;
  }, MODE, { timeout: 90_000 });
  report.after = await page.evaluate(() => ({
    match: CaissaArena.state.matchState,
    moves: CaissaArena.game?.history(),
    resources: CaissaArena.runtimeManager.getResourceSnapshot(),
    status: document.querySelector('#arenaPanelMatch [role=status]')?.textContent,
    phase: CaissaArenaPreview.adapter?.lastPhase,
    cleanupEvidence: CaissaArenaPreview.adapter?.metrics?.cleanupEvidence
  }));
  if (MODE === 'network-match' && report.after.match !== 'idle') {
    await page.click('#arenaTabGame');
    await page.click('#arenaStopMatch');
    await page.waitForFunction(() => CaissaArena.runtimeManager.getResourceSnapshot()
      .activeRuntimeRecords === 0, null, { timeout: 30_000 });
  }
  report.deletedStatus = await inspect(report.sessionId);
  report.finalRecords = await page.evaluate(() => CaissaArena.runtimeManager
    .getResourceSnapshot().activeRuntimeRecords);
  console.log(`EAE013_FAULT_REPORT ${JSON.stringify(report)}`);
  assert.equal(report.finalRecords, 0);
  assert.equal(report.deletedStatus, 410);
  assert.deepEqual(report.errors, []);
} catch (error) {
  console.error(`EAE013_FAULT_FAILURE ${JSON.stringify({ error: error.message, report })}`);
  throw error;
} finally {
  try { await page?.evaluate(() => CaissaArena.stopMatch());
    await page?.evaluate(() => CaissaArena._cleanupPromise); } catch {}
  await context?.close().catch(() => {});
  await browser.close();
  if (user) await clerk.users.deleteUser(user.id);
}
