// Opt-in real preview Tournament probe; secrets arrive only through environment.
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { createClerkClient } from '@clerk/backend';

if (process.env.EAE013_TOURNAMENT_PREVIEW !== '1' || !process.env.EAE013_BYPASS ||
    !process.env.CLERK_SECRET_KEY?.startsWith('sk_test_'))
  throw new Error('EAE013_TOURNAMENT_CREDENTIALS_REQUIRED');
const MAIN = 'https://eae013-main-elcriollitos-projects.vercel.app';
const ENGINE = 'https://eae013-engine-elcriollitos-projects.vercel.app';
const FIELDS = ['stockfish-18-lite', 'stockfish-19-lite', 'lc0-maia-1100-preview'];
const report = { field: FIELDS, games: [], popups: [], errors: [] };
const browser = await chromium.launch({ headless: true });
const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
let user, clerkSession, context, page, ownerToken, tokenAt = 0;
async function token() {
  if (!ownerToken || Date.now() - tokenAt > 30_000) {
    ownerToken = (await clerk.sessions.getToken(clerkSession.id)).jwt;
    tokenAt = Date.now();
  }
  return ownerToken;
}
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
try {
  user = await clerk.users.createUser({ emailAddress: [`eae013-tournament-${crypto.randomUUID()}@example.com`],
    skipPasswordRequirement: true });
  clerkSession = await clerk.sessions.createSession({ userId: user.id });
  context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addInitScript(() => {
    if (location.origin === 'https://eae013-main-elcriollitos-projects.vercel.app')
      localStorage.setItem('caissa_onboarding_completed', 'true');
  });
  await context.exposeBinding('eae013TournamentToken', token);
  for (const origin of [MAIN, ENGINE]) {
    const seed = await context.request.get(`${origin}/api/eae011?action=health`, {
      headers: { 'x-vercel-protection-bypass': process.env.EAE013_BYPASS,
        'x-vercel-set-bypass-cookie': 'true' } });
    assert.equal(seed.status(), 200);
  }
  await context.route(/^https:\/\/eae013-(main|engine)-elcriollitos-projects\.vercel\.app\//,
    route => route.continue({ headers: { ...route.request().headers(),
      'x-vercel-protection-bypass': process.env.EAE013_BYPASS } }));
  await context.route(/^https:\/\/eae013-main-elcriollitos-projects\.vercel\.app\/js\/caissa-auth\.js(?:\?|$)/,
    route => route.fulfill({ status: 200, contentType: 'text/javascript',
      body: `window.CAISSA_AUTH={isSignedIn:true,userId:${JSON.stringify(user.id)},` +
        'whenReady:async()=>{},getToken:()=>window.eae013TournamentToken()};' }));
  page = await context.newPage();
  page.on('pageerror', error => report.errors.push(error.message));
  assert.equal((await page.goto(`${MAIN}/arena-preview`, { waitUntil: 'domcontentloaded' })).status(), 200);
  await page.waitForFunction(() => window.CaissaArenaPreview?.enabled &&
    window.CaissaArena?.state?.boardMounted, null, { timeout: 20_000 });
  await page.click('#arenaTabTournament');
  for (const input of await page.locator('#arenaTournamentEngines input[type=checkbox]').all()) {
    const id = await input.inputValue();
    if (FIELDS.includes(id)) await input.check();
    else await input.uncheck({ force: true }).catch(() => {});
  }
  assert.deepEqual(await page.evaluate(() => CaissaArena.getSelectedTournamentEngines().map(e => e.id)), FIELDS);
  await page.selectOption('#arenaTournamentRounds', '5');
  await page.click('#arenaStartTournament');
  let previous = null;
  for (let index = 0; index < 5; index++) {
    const deadline = Date.now() + 70_000;
    while (Date.now() < deadline) {
      const state = await page.evaluate(() => ({
        running: CaissaArena.state.matchState === 'running',
        popup: Boolean(window.CaissaArenaPreview.pendingPopup),
        completed: CaissaArena.state.tournament.games.filter(g => g.result !== null).length
      }));
      if (state.running && state.completed === index) break;
      if (state.popup) {
        await page.click('#arenaTabTournament');
        const before = context.pages().length;
        await page.locator('#arenaPanelTournament .arena-lc0-preview-control button').click();
        assert.ok(context.pages().length > before, 'Tournament Lc0 popup blocked');
        report.popups.push(context.pages().at(-1));
      }
      await sleep(200);
    }
    await page.waitForFunction(expected => CaissaArena.state.matchState === 'running' &&
      CaissaArena.state.tournament.games.filter(g => g.result !== null).length === expected &&
      CaissaArena.game?.history().length >= 2, index, { timeout: 35_000 });
    const game = await page.evaluate(() => ({
      pairing: [CaissaArena.state.whiteEngine.id, CaissaArena.state.blackEngine.id],
      identities: [CaissaArena.whiteEngineInstance.getRuntimeIdentity(),
        CaissaArena.blackEngineInstance.getRuntimeIdentity()],
      moves: CaissaArena.game.history(),
      records: CaissaArena.runtimeManager.getResourceSnapshot().activeRuntimeRecords
    }));
    assert.equal(game.records, 3);
    assert.ok(game.pairing.filter(id => id === 'lc0-maia-1100-preview').length <= 1);
    assert.ok(game.identities.every(identity => identity.identityValidated));
    if (previous) {
      for (let role = 0; role < 2; role++) {
        if (previous.pairing[role] === game.pairing[role])
          assert.equal(previous.identities[role].runtimeInstanceId,
            game.identities[role].runtimeInstanceId);
      }
    }
    await page.click('#arenaTabGame');
    await page.click('#arenaDeclareDraw');
    await page.click('#arenaDrawConfirm');
    await page.waitForFunction(expected => CaissaArena.state.tournament.games
      .filter(g => g.result !== null).length === expected, index + 1, { timeout: 20_000 });
    const draw = await page.evaluate(() => ({
      last: CaissaArena.state.tournament.games.filter(g => g.result !== null).at(-1).result,
      standings: CaissaArena.state.tournament.standings.map(s => ({ id: s.engine.id,
        points: s.points, games: s.games })),
      crosstable: document.getElementById('arenaTournamentStandings')?.textContent || ''
    }));
    assert.equal(draw.last, '1/2-1/2');
    assert.match(draw.crosstable, /½/);
    report.games.push({ ...game, draw });
    previous = game;
    await page.click('#arenaTabTournament');
    console.log(`EAE013_TOURNAMENT_GAME ${JSON.stringify({ index: index + 1,
      pairing: game.pairing, moves: game.moves.length, result: draw.last })}`);
  }
  await page.waitForFunction(() => CaissaArena.state.tournament.currentRound === 5,
    null, { timeout: 10_000 });
  const final = await page.evaluate(() => ({
    round: CaissaArena.state.tournament.currentRound,
    results: CaissaArena.state.tournament.games.map(g => g.result),
    standings: CaissaArena.state.tournament.standings.map(s => ({ id: s.engine.id,
      points: s.points, games: s.games }))
  }));
  assert.equal(final.round, 5);
  assert.deepEqual(final.results, Array(5).fill('1/2-1/2'));
  assert.ok(report.games.some(g => g.pairing[0] === 'lc0-maia-1100-preview'));
  assert.ok(report.games.some(g => g.pairing[1] === 'lc0-maia-1100-preview'));
  await page.click('#arenaTabGame');
  await page.click('#arenaStopMatch');
  await page.waitForFunction(() => CaissaArena.runtimeManager.getResourceSnapshot()
    .activeRuntimeRecords === 0, null, { timeout: 30_000 });
  const enginePages = await Promise.all(report.popups.map(async popup => {
    const snapshot = await popup.evaluate(() => window.Eae012Engine.runtime.snapshot());
    await popup.close();
    return { state: snapshot.state, workers: snapshot.workers,
      parentWorkers: snapshot.parentWorkers, pthreadWorkers: snapshot.pthreadWorkers,
      forcedTerminations: snapshot.forcedTerminations };
  }));
  assert.ok(enginePages.every(item => item.state === 'TERMINATED' && !item.workers &&
    !item.parentWorkers && !item.pthreadWorkers && !item.forcedTerminations));
  assert.deepEqual(report.errors, []);
  console.log(`EAE013_TOURNAMENT_REPORT ${JSON.stringify({ final, games: report.games.map(g => ({
    pairing: g.pairing, moves: g.moves.length, result: g.draw.last })),
    enginePages, errors: report.errors })}`);
} catch (error) {
  const state = await page?.evaluate(() => ({
    match: CaissaArena?.state?.matchState,
    mode: CaissaArena?.state?.mode,
    completed: CaissaArena?.state?.tournament?.games?.filter(g => g.result !== null).length,
    roles: CaissaArena?.runtimeManager?.getResourceSnapshot(),
    relay: window.CaissaArenaPreview?.adapter && {
      phase: window.CaissaArenaPreview.adapter.lastPhase,
      metrics: window.CaissaArenaPreview.adapter.metrics
    }
  })).catch(() => null);
  console.error(`EAE013_TOURNAMENT_FAILURE ${JSON.stringify({ error: error.message, state,
    games: report.games.map(g => ({ pairing: g.pairing, result: g.draw.last })) })}`);
  try { await page?.evaluate(() => CaissaArena.stopMatch());
    await page?.evaluate(() => CaissaArena._cleanupPromise); } catch {}
  throw error;
} finally {
  await context?.close().catch(() => {});
  await browser.close();
  if (user) await clerk.users.deleteUser(user.id);
}
