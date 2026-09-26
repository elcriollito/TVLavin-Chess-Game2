import { test, expect } from '@playwright/test';

async function openArena(page, viewport = { width: 1440, height: 900 }) {
  await page.setViewportSize(viewport);
  await page.addInitScript(() => localStorage.setItem('caissa_onboarding_completed', 'true'));
  await page.goto('/arena');
  await page.locator('#arenaTabMatch').click();
  await expect(page.locator('#arenaPanelMatch')).toBeVisible();
  await expect.poll(() => page.evaluate(() => Boolean(
    window.CaissaArena?.matchSeries && window.CaissaArenaMatchClock && window.CaissaArenaMatchLabUI
  ))).toBe(true);
}

async function installQaClock(page, config = { initialMs: 2000, incrementMs: 0 }) {
  return page.evaluate(input => {
    const arena = window.CaissaArena;
    arena.setQaMatchTimeControlForTest(input);
    arena.state.mode = 'match';
    arena.state.currentGame = { id: 'qa-game', generation: 1, moves: [] };
    arena.initializeMatchClock(arena.resolveMatchTimeControl({ mode: 'blitz', preset: '3+2' }));
    return arena.matchClock.snapshot();
  }, config);
}

test('A. Bullet clock is authoritative, visibly counts down, and marks the active side', async ({ page }) => {
  await openArena(page);
  await page.locator('#arenaTimeControlMode').selectOption('bullet', { force: true });
  await page.locator('#arenaTimeControlPreset').selectOption('1+0', { force: true });
  await page.locator('#arenaStartMatch').click();
  await expect.poll(() => page.evaluate(() => window.CaissaArena.matchClock?.snapshot().running), { timeout: 20_000 }).toBe(true);
  const activeColor = await page.evaluate(() => window.CaissaArena.matchClock.snapshot().activeColor);
  const activeClock = page.locator(activeColor === 'white' ? '#arenaWhiteClock' : '#arenaBlackClock');
  await expect(activeClock).toHaveAttribute('data-authoritative', 'true');
  await expect(activeClock).toHaveAttribute('data-active', 'true');
  await expect(activeClock).toHaveAttribute('aria-label', new RegExp(`${activeColor === 'white' ? 'White' : 'Black'} engine time, active`));
  await expect.poll(() => page.evaluate(() => window.CaissaArena.game.history().length), { timeout: 25_000 }).toBeGreaterThanOrEqual(2);
  const state = await page.evaluate(() => window.CaissaArena.matchClock.snapshot());
  expect(Math.min(state.whiteRemainingMs, state.blackRemainingMs)).toBeLessThan(60000);
  await page.evaluate(() => window.CaissaArena.stopMatch());
});

test('B. Blitz 3+2 applies increment only after the accepted legal move point', async ({ page }) => {
  await openArena(page);
  const result = await page.evaluate(() => {
    const C = window.CaissaArenaMatchClock;
    const clock = new C.MatchClockController({ timeControl: C.createTimeControl({ mode: 'blitz', preset: '3+2' }) });
    const search = clock.beginSearch('white', { gameId: 'b', gameGeneration: 1, searchGeneration: 1 });
    const before = clock.snapshot().whiteRemainingMs;
    const settled = clock.settleBestMove(search.token);
    const afterThink = clock.snapshot().whiteRemainingMs;
    clock.commitLegalMove(search.token);
    return { before, afterThink, afterMove: clock.snapshot().whiteRemainingMs, accepted: settled.accepted };
  });
  expect(result.accepted).toBe(true);
  expect(result.afterThink).toBeLessThanOrEqual(result.before);
  expect(result.afterMove - result.afterThink).toBe(2000);
});

test('C. forced flag records time-forfeit and rejects the late BESTMOVE', async ({ page }) => {
  await openArena(page);
  const token = await page.evaluate(() => {
    const arena = window.CaissaArena;
    arena.initializeMatchSeries();
    const scheduled = arena.matchSeries.currentGame;
    arena.applySeriesGameAssignment(scheduled);
    arena.state.mode = 'match';
    arena.state.matchState = 'running';
    arena.state.loopActive = true;
    arena.state.currentGame = { id: scheduled.gameId, generation: scheduled.generation, round: 1, moves: [] };
    arena.matchSeries.markRunning(scheduled.generation);
    arena.setQaMatchTimeControlForTest({ initialMs: 80, incrementMs: 0 });
    arena.initializeMatchClock(arena.resolveMatchTimeControl(arena.matchSeries.config.timeControl));
    const search = arena.beginMatchClockSearch('white', 7, scheduled.generation);
    return search.token;
  });
  await expect.poll(() => page.evaluate(() => window.CaissaArena.matchSeries.state)).toBe('COMPLETED');
  const proof = await page.evaluate(searchToken => {
    const arena = window.CaissaArena;
    return {
      result: arena.matchSeries.games[0].result,
      termination: arena.matchSeries.games[0].termination,
      status: arena.elements.statusText.textContent,
      lateAccepted: arena.matchClock.settleBestMove(searchToken).accepted,
      moves: arena.game.history().length
    };
  }, token);
  expect(proof).toMatchObject({ result: '0-1', termination: 'time-forfeit', lateAccepted: false, moves: 0 });
  expect(proof.status).toContain('White lost on time');
});

test('D. Pause freezes immediately and Resume uses a fresh search start', async ({ page }) => {
  await openArena(page);
  await installQaClock(page, { initialMs: 1500, incrementMs: 0 });
  const proof = await page.evaluate(async () => {
    const arena = window.CaissaArena;
    const first = arena.beginMatchClockSearch('white', 1, 1);
    await new Promise(resolve => setTimeout(resolve, 100));
    arena.matchClock.pause();
    const paused = arena.matchClock.snapshot().whiteRemainingMs;
    await new Promise(resolve => setTimeout(resolve, 150));
    const frozen = arena.matchClock.snapshot().whiteRemainingMs;
    const resumed = arena.beginMatchClockSearch('white', 2, 1);
    await new Promise(resolve => setTimeout(resolve, 80));
    arena.matchClock.pause();
    return { first: first.token.searchGeneration, resumed: resumed.token.searchGeneration, paused, frozen,
      afterResume: arena.matchClock.snapshot().whiteRemainingMs };
  });
  expect(proof.frozen).toBe(proof.paused);
  expect(proof.resumed).toBe(2);
  expect(proof.afterResume).toBeLessThan(proof.paused);
});

test('E. two-game series reverses colors and each game receives fresh clocks', async ({ page }) => {
  await openArena(page);
  const proof = await page.evaluate(() => {
    const S = window.CaissaArenaMatchSeries;
    const C = window.CaissaArenaMatchClock;
    const series = new S.MatchSeriesController();
    const game1 = series.start({ participantA: { id: 'a', name: 'A' }, participantB: { id: 'b', name: 'B' }, gameCount: 2,
      timeControl: { mode: 'blitz', preset: '3+2' } });
    const firstClock = new C.MatchClockController({ timeControl: C.createTimeControl(series.config.timeControl) });
    const search = firstClock.beginSearch('white', { gameId: game1.gameId, gameGeneration: game1.generation, searchGeneration: 1 });
    firstClock.settleBestMove(search.token);
    firstClock.commitLegalMove(search.token);
    series.markRunning(game1.generation);
    series.complete(game1.generation, { result: '1/2-1/2', termination: 'qa', moves: [] });
    const game2 = series.advance();
    const secondClock = new C.MatchClockController({ timeControl: C.createTimeControl(series.config.timeControl) });
    return { game1, game2, firstWhite: firstClock.snapshot().whiteRemainingMs,
      secondWhite: secondClock.snapshot().whiteRemainingMs, secondBlack: secondClock.snapshot().blackRemainingMs };
  });
  expect(proof.game2.white.id).toBe(proof.game1.black.id);
  expect(proof.game2.black.id).toBe(proof.game1.white.id);
  expect(proof.secondWhite).toBe(180000);
  expect(proof.secondBlack).toBe(180000);
});

test('F. accelerated six-game series leaves no stale clock deadlines', async ({ page }) => {
  await openArena(page);
  const proof = await page.evaluate(() => {
    const S = window.CaissaArenaMatchSeries;
    const C = window.CaissaArenaMatchClock;
    const series = new S.MatchSeriesController();
    let game = series.start({ participantA: { id: 'a' }, participantB: { id: 'b' }, gameCount: 6,
      timeControl: { mode: 'bullet', preset: '1+0' } });
    const snapshots = [];
    for (let index = 0; index < 6; index += 1) {
      const clock = new C.MatchClockController({ timeControl: C.createTimeControl(series.config.timeControl) });
      series.markRunning(game.generation);
      snapshots.push(clock.snapshot());
      clock.stop();
      series.complete(game.generation, { result: '1/2-1/2', termination: 'qa', moves: [] });
      if (index < 5) game = series.advance();
    }
    return { state: series.state, completed: series.score.completed,
      fresh: snapshots.every(item => item.whiteRemainingMs === 60000 && item.blackRemainingMs === 60000),
      generations: series.games.map(item => item.generation) };
  });
  expect(proof).toMatchObject({ state: 'COMPLETED', completed: 6, fresh: true });
  expect(new Set(proof.generations).size).toBe(6);
});

test('G. Fixed Depth 12 has no countdown and emits go depth 12', async ({ page }) => {
  await openArena(page);
  const proof = await page.evaluate(() => {
    const arena = window.CaissaArena;
    arena.qaTimeControlOverride = null;
    arena.state.mode = 'match';
    arena.state.currentGame = { id: 'depth', generation: 1, moves: [] };
    arena.initializeMatchClock(window.CaissaArenaMatchClock.createTimeControl({ mode: 'fixed-depth', preset: '12' }));
    const search = arena.beginMatchClockSearch('white', 1, 1);
    return { options: search.options, command: arena.formatArenaGoCommand(search.options), snapshot: arena.matchClock.snapshot() };
  });
  expect(proof.options).toEqual({ depth: 12 });
  expect(proof.command).toBe('go depth 12');
  expect(proof.snapshot.deadlineAt).toBeNull();
  await expect(page.locator('#arenaWhiteClock')).toHaveText('Depth 12');
});

test('H. background tab return reconciles from monotonic elapsed', async ({ page, context }) => {
  await openArena(page);
  await installQaClock(page, { initialMs: 3000, incrementMs: 0 });
  const before = await page.evaluate(() => {
    window.CaissaArena.beginMatchClockSearch('black', 1, 1);
    return window.CaissaArena.matchClock.snapshot().blackRemainingMs;
  });
  const cdp = await context.newCDPSession(page);
  await cdp.send('Page.setWebLifecycleState', { state: 'frozen' });
  await new Promise(resolve => setTimeout(resolve, 350));
  await cdp.send('Page.setWebLifecycleState', { state: 'active' });
  const after = await page.evaluate(() => {
    const remaining = window.CaissaArena.matchClock.snapshot().blackRemainingMs;
    window.CaissaArena.matchClock.pause();
    return remaining;
  });
  await cdp.detach();
  expect(before - after).toBeGreaterThanOrEqual(300);
  expect(after).toBeGreaterThan(0);
});

test('I. Stop Series cancels its deadline and cannot flag later on mobile', async ({ page }) => {
  await openArena(page, { width: 390, height: 844 });
  await installQaClock(page, { initialMs: 100, incrementMs: 0 });
  await page.evaluate(() => {
    const arena = window.CaissaArena;
    arena.beginMatchClockSearch('black', 1, 1);
    arena.stopMatchClock();
  });
  await page.waitForTimeout(180);
  const proof = await page.evaluate(() => ({ clock: window.CaissaArena.matchClock, interval: window.CaissaArena.clockRenderInterval }));
  expect(proof).toEqual({ clock: null, interval: null });
  await expect(page.locator('#arenaBlackClock')).toBeVisible();
  await expect(page.locator('#arenaWhiteClock')).toBeVisible();
});

test('J. Lc0 capability intersection disables Bullet and keeps Blitz available', async ({ page }) => {
  await openArena(page);
  await page.locator('#arenaTimeControlMode').selectOption('bullet', { force: true });
  await page.evaluate(() => {
    const rollout = window.CaissaArenaRollout;
    rollout.enabled = true;
    rollout.config = { enginePath: '/', engineOrigin: location.origin };
    window.EngineRegistry.registerArenaPreviewProvider(rollout.provider(), () => ({}));
    window.CaissaArena.ensureEngineRegistry();
    window.CaissaArena.renderEngineSelectors();
    window.CaissaArena.selectEngine('white', 'lc0-maia-1100-preview');
  });
  await expect(page.locator('#arenaTimeControlMode option[value="bullet"]')).toBeDisabled();
  await expect(page.locator('#arenaTimeControlMode option[value="blitz"]')).toBeEnabled();
  await expect(page.locator('#arenaTimeControlMode')).toHaveValue('blitz');
  await expect(page.locator('#arenaTimeControlSummary')).toHaveText(
    'Lc0 Experimental does not currently support Bullet Match time control.');
  const enforcement = await page.evaluate(() => {
    try {
      window.CaissaArena.validateMatchTimeControlCapabilities(
        window.CaissaArenaMatchClock.createTimeControl({ mode: 'bullet', preset: '1+0' }));
      return null;
    } catch (error) { return error.message; }
  });
  expect(enforcement).toBe('Lc0 Experimental does not currently support Bullet Match time control.');
});
