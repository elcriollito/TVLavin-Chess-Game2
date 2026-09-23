// Opt-in real preview Tournament probe; secrets arrive only through environment.
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { createClerkClient } from '@clerk/backend';

if (process.env.EAE013_TOURNAMENT_PREVIEW !== '1' ||
    !process.env.CLERK_SECRET_KEY?.startsWith('sk_test_'))
  throw new Error('EAE013_TOURNAMENT_CREDENTIALS_REQUIRED');
const MAIN = process.env.EAE013_MAIN_ORIGIN || 'https://eae013-main-elcriollitos-projects.vercel.app';
const ENGINE = process.env.EAE013_ENGINE_ORIGIN || 'https://eae013-engine-elcriollitos-projects.vercel.app';
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
const FIELDS = ['stockfish-18-lite', 'stockfish-19-lite', 'lc0-maia-1100-preview'];
const CLOSE_TOURNAMENT = process.env.EAE013_TOURNAMENT_CLOSE === '1';
const internalEmail = String(process.env.EAE015B_INTERNAL_EMAIL || '').trim().toLowerCase();
const DISCOVER_INTERNAL_USER = process.env.EAE015B_DISCOVER_INTERNAL_USER === '1';
const report = { field: FIELDS, games: [], popups: [], errors: [] };
const browser = await chromium.launch({ headless: true,
  ...(process.env.EAE015B_BROWSER_CHANNEL ? { channel: process.env.EAE015B_BROWSER_CHANNEL } : {}) });
const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
let user, clerkSession, context, page, ownerToken, tokenAt = 0, temporaryUser = false;
async function token() {
  if (!ownerToken || Date.now() - tokenAt > 30_000) {
    ownerToken = (await clerk.sessions.getToken(clerkSession.id)).jwt;
    tokenAt = Date.now();
  }
  return ownerToken;
}
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const createWithBearer = async bearer => {
  const response = await fetch(new URL('/api/eae011?action=create', RELAY), {
    method: 'POST', headers: { Origin: MAIN, Authorization: `Bearer ${bearer}`,
      'Content-Type': 'application/json', ...protectionHeaders(RELAY) },
    body: JSON.stringify({ participantRole: 'white' })
  });
  return { status: response.status, body: await response.json().catch(() => ({})) };
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
      const url = new URL('/api/eae011', RELAY);
      url.searchParams.set('action', 'terminate');
      url.searchParams.set('sessionId', probe.body.sessionId);
      const cleanup = await fetch(url, { method: 'POST', headers: { Origin: MAIN,
        Authorization: `Bearer ${bearer}`, ...protectionHeaders(RELAY) } });
      assert.equal(cleanup.status, 200, 'Allowlist discovery probe cleanup failed');
      return { user: candidate, session: candidateSession, tested };
    }
  }
  throw new Error('INTERNAL_ALLOWLIST_IDENTITY_NOT_FOUND');
};
try {
  if (DISCOVER_INTERNAL_USER) {
    const discovered = await discoverInternalIdentity();
    user = discovered.user;
    clerkSession = discovered.session;
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
    clerkSession = sessions.sort((a, b) => b.lastActiveAt - a.lastActiveAt)[0];
  } else {
    user = await clerk.users.createUser({ emailAddress: [`eae013-tournament-${crypto.randomUUID()}@example.com`],
      skipPasswordRequirement: true });
    temporaryUser = true;
    clerkSession = await clerk.sessions.createSession({ userId: user.id });
  }
  context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  if ([...protectionCookies.values()].some(Boolean)) await context.addCookies([...protectionCookies]
    .filter(([, value]) => value).map(([url, value]) => ({ name: '_vercel_jwt', value, url })));
  await context.addInitScript(origin => {
    if (location.origin === origin)
      localStorage.setItem('caissa_onboarding_completed', 'true');
  }, MAIN);
  await context.exposeBinding('eae013TournamentToken', token);
  for (const [origin, path] of [[MAIN, '/api/eae013'], [ENGINE, '/health.json'],
    [RELAY, '/health']]) {
    const seed = await context.request.get(`${origin}${path}`, {
      headers: seedProtectionHeaders(origin) });
    assert.equal(seed.status(), 200);
  }
  for (const origin of [...protectionBypasses.keys()].filter(origin => !publicOrigins.has(origin))) assert.ok((await context.cookies(origin))
    .some(cookie => cookie.name === '_vercel_jwt'), `Bypass cookie for ${origin}`);
  await context.route(url => [MAIN, ENGINE, RELAY]
    .some(origin => url.href.startsWith(`${origin}/`)), route => {
      const origin = new URL(route.request().url()).origin;
      return route.continue({ headers: { ...route.request().headers(),
        ...protectionHeaders(origin) } });
    });
  await context.route(url => url.href.startsWith(`${MAIN}/js/caissa-auth.js`),
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
    if (!report.pauseResume && game.pairing.includes('lc0-maia-1100-preview')) {
      const lc0Role = game.pairing[0] === 'lc0-maia-1100-preview' ? 0 : 1;
      const movesBefore = game.moves.length;
      await page.click('#arenaTabGame');
      await page.click('#arenaPauseMatch');
      await page.waitForFunction(() => CaissaArena.state.matchState === 'paused' &&
        !CaissaArena._pausePending, null, { timeout: 15_000 });
      await page.click('#arenaPauseMatch');
      await page.waitForFunction(minimum => CaissaArena.state.matchState === 'running' &&
        CaissaArena.game?.history().length >= minimum, movesBefore + 2, { timeout: 50_000 });
      const after = await page.evaluate(() => ({
        identities: [CaissaArena.whiteEngineInstance.getRuntimeIdentity(),
          CaissaArena.blackEngineInstance.getRuntimeIdentity()],
        arenaError: CaissaArena.lastArenaError,
        reliability: structuredClone(CaissaArena.reliabilityMetrics)
      }));
      assert.equal(after.identities[lc0Role].runtimeInstanceId,
        game.identities[lc0Role].runtimeInstanceId);
      assert.equal(after.arenaError, null);
      assert.equal(Object.values(after.reliability.arenaErrorsByReason)
        .reduce((sum, value) => sum + value, 0), 0);
      report.pauseResume = { game: index + 1, role: lc0Role === 0 ? 'white' : 'black',
        runtimeInstancePreserved: true, movesBefore,
        movesAfter: await page.evaluate(() => CaissaArena.game.history().length) };
    }
    if (previous) {
      for (let role = 0; role < 2; role++) {
        if (previous.pairing[role] === game.pairing[role])
          assert.equal(previous.identities[role].runtimeInstanceId,
            game.identities[role].runtimeInstanceId);
      }
    }
    if (CLOSE_TOURNAMENT) {
      assert.equal(index, 0);
      const sessionId = await page.evaluate(() => CaissaArenaPreview.adapter.sessionId);
      await report.popups.at(-1).close();
      await page.waitForFunction(() => CaissaArena.state.matchState === 'idle' &&
        CaissaArena.runtimeManager.getResourceSnapshot().activeRuntimeRecords === 0,
      null, { timeout: 90_000 });
      const closed = await page.evaluate(() => ({
        completed: CaissaArena.state.tournament.games.filter(g => g.result !== null).length,
        records: CaissaArena.runtimeManager.getResourceSnapshot().activeRuntimeRecords,
        moves: CaissaArena.game.history(),
        failure: CaissaArena.runtimeManager.getResourceSnapshot().lastFailures
      }));
      const url = new URL('/api/eae011', RELAY);
      url.searchParams.set('action', 'inspect');
      url.searchParams.set('sessionId', sessionId);
      let deletedStatus;
      for (let attempt = 0; attempt < 40; attempt++) {
        const response = await context.request.get(url.toString(), { headers: {
          Authorization: `Bearer ${await token()}`, Origin: MAIN,
          ...protectionHeaders(RELAY) } });
        deletedStatus = response.status();
        if (deletedStatus === 410) break;
        await sleep(500);
      }
      assert.equal(closed.completed, 0);
      assert.equal(closed.records, 0);
      assert.equal(deletedStatus, 410);
      assert.deepEqual(report.errors, []);
      report.closed = { pairing: game.pairing, ...closed, deletedStatus };
      console.log(`EAE013_TOURNAMENT_CLOSE_REPORT ${JSON.stringify(report.closed)}`);
      break;
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
  if (!CLOSE_TOURNAMENT) {
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
  }
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
  if (temporaryUser && user) await clerk.users.deleteUser(user.id);
}
