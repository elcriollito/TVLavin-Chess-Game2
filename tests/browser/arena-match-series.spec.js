import { test, expect } from '@playwright/test';

const TERMINAL_KINGS_FEN = '8/8/8/8/8/8/2k5/K7 w - - 0 1';

async function openArena(page, viewport = { width: 1600, height: 1000 }) {
  await page.setViewportSize(viewport);
  await page.addInitScript(() => {
    localStorage.setItem('caissa_onboarding_completed', 'true');
    localStorage.removeItem('caissa_arena_match_lab_advanced_panel');
  });
  await page.goto('/arena');
  await expect(page.locator('#arenaPanelMatch')).toBeVisible();
  await expect.poll(() => page.evaluate(() => Boolean(
    window.CaissaArena?.matchSeries && window.CaissaArenaMatchLabUI
  ))).toBe(true);
}

async function configureGameCount(page, count) {
  await page.locator('#arenaAdvancedMatchOptions summary').click();
  const select = page.locator('#arenaMatchGameCount');
  const standard = ['1', '2', '4', '6', '10', '20'];
  if (standard.includes(String(count))) {
    await select.selectOption(String(count));
  } else {
    await select.selectOption('custom');
    await page.locator('#arenaMatchCustomGameCount').fill(String(count));
  }
}

async function runTerminalSeries(page, gameCount) {
  await configureGameCount(page, gameCount);
  await page.evaluate(fen => window.CaissaArena.applyArenaPosition(fen, 'Series test position'), TERMINAL_KINGS_FEN);
  await page.locator('#arenaStartMatch').click();
  await expect.poll(() => page.evaluate(() => window.CaissaArena.matchSeries?.state), { timeout: 40_000 })
    .toBe('COMPLETED');
  return page.evaluate(() => {
    const arena = window.CaissaArena;
    const snapshot = arena.matchSeries.snapshot();
    return {
      snapshot,
      status: arena.elements.statusText.textContent,
      resources: arena.runtimeManager.getResourceSnapshot(),
      timer: arena._seriesAdvanceTimer,
      loopActive: arena.state.loopActive,
      loopRunning: arena.state.loopRunning
    };
  });
}

async function installSyntheticSeries(page, gameCount, moveLimit = null) {
  await configureGameCount(page, gameCount);
  if (moveLimit !== null) {
    await page.locator('#arenaMatchMoveLimit').selectOption('custom');
    await page.locator('#arenaMatchCustomMoveLimit').fill(String(moveLimit));
  }
  await page.evaluate(() => {
    const arena = window.CaissaArena;
    arena.initializeMatchSeries();
    arena.state.mode = 'match';
    arena.__activateSyntheticSeriesGame = () => {
      const scheduled = arena.matchSeries.currentGame;
      arena.applySeriesGameAssignment(scheduled);
      arena.state.matchState = 'running';
      arena.state.loopActive = true;
      arena.state.loopRunning = false;
      arena.state.currentGame = {
        id: scheduled.gameId,
        generation: scheduled.generation,
        round: scheduled.round,
        white: arena.state.whiteEngine,
        black: arena.state.blackEngine,
        moves: [],
        startFen: arena.game.fen(),
        startTime: Date.now()
      };
      arena.matchSeries.markRunning(scheduled.generation);
      arena.updateMatchControls();
      arena.updateGameStatus({ moveCount: arena.game.history().length });
      return scheduled.generation;
    };
    arena.startMatch = async options => {
      if (!options?.seriesContinuation) throw new Error('Synthetic harness accepts continuations only.');
      arena.__activateSyntheticSeriesGame();
      return true;
    };
    arena.__activateSyntheticSeriesGame();
  });
}

test('single Match remains uncluttered while a real 2-game series swaps colors and scores correctly', async ({ page }) => {
  await openArena(page);
  await configureGameCount(page, 1);
  await expect(page.locator('#arenaStartMatch')).toContainText('Start Match');
  await expect(page.locator('#arenaStartMatch')).not.toContainText('Series');
  await expect(page.locator('#arenaSeriesSummary')).toBeHidden();

  await page.locator('#arenaMatchGameCount').selectOption('2');
  await expect(page.locator('#arenaStartMatch')).toContainText('Start Match Series');
  await page.evaluate(fen => window.CaissaArena.applyArenaPosition(fen, 'Series test position'), TERMINAL_KINGS_FEN);
  await page.locator('#arenaStartMatch').click();
  await expect.poll(() => page.evaluate(() => window.CaissaArena.matchSeries?.state), { timeout: 30_000 })
    .toBe('COMPLETED');

  const result = await page.evaluate(() => {
    const series = window.CaissaArena.matchSeries;
    return {
      games: series.games.map(game => ({ white: game.white.id, black: game.black.id, result: game.result })),
      scores: [
        series.score[series.config.participantA.id].points,
        series.score[series.config.participantB.id].points
      ],
      status: window.CaissaArena.elements.statusText.textContent
    };
  });
  expect(result.games[1].white).toBe(result.games[0].black);
  expect(result.games[1].black).toBe(result.games[0].white);
  expect(result.games.map(game => game.result)).toEqual(['1/2-1/2', '1/2-1/2']);
  expect(result.scores).toEqual([1, 1]);
  expect(result.status).toBe('Series complete · 2 / 2');
});

test('real 6-game scheduler alternates every color, advances automatically, and leaves idle runtimes', async ({ page }) => {
  await openArena(page);
  const result = await runTerminalSeries(page, 6);
  const games = result.snapshot.games;
  expect(games).toHaveLength(6);
  for (let index = 1; index < games.length; index += 1) {
    expect(games[index].white.id).toBe(games[index - 1].black.id);
    expect(games[index].black.id).toBe(games[index - 1].white.id);
    expect(games[index].generation).toBeGreaterThan(games[index - 1].generation);
  }
  expect(result.snapshot.score.completed).toBe(6);
  expect(result.snapshot.score.remaining).toBe(0);
  expect(result.status).toBe('Series complete · 6 / 6');
  expect(result.timer).toBeNull();
  expect(result.loopActive).toBe(false);
  expect(result.loopRunning).toBe(false);
  expect(Object.values(result.resources.roles).every(role => role === null || role.state === 'IDLE')).toBe(true);
});

test('move limit draws at exact full-move boundary and advances without accepting the prior generation', async ({ page }) => {
  await openArena(page);
  await installSyntheticSeries(page, 2, 1);
  const firstGeneration = await page.evaluate(() => window.CaissaArena.state.currentGame.generation);
  await page.evaluate(() => {
    const arena = window.CaissaArena;
    arena.evaluatorReady = false;
    arena.playUciMove('e2e4', true, 'qa', arena.state.currentGame.generation);
    arena.playUciMove('e7e5', false, 'qa', arena.state.currentGame.generation);
  });
  await expect.poll(() => page.evaluate(() => window.CaissaArena.state.currentGame?.round)).toBe(2);
  const staleRejected = await page.evaluate(generation =>
    window.CaissaArena.matchSeries.recordMove(generation, { uci: 'a2a4' }), firstGeneration);
  expect(staleRejected).toBe(false);
  await page.evaluate(() => {
    const arena = window.CaissaArena;
    arena.game.reset();
    arena.playUciMove('d2d4', true, 'qa', arena.state.currentGame.generation);
    arena.playUciMove('d7d5', false, 'qa', arena.state.currentGame.generation);
  });
  await expect.poll(() => page.evaluate(() => window.CaissaArena.matchSeries.state)).toBe('COMPLETED');
  const terminations = await page.evaluate(() => window.CaissaArena.matchSeries.games.map(game => game.termination));
  expect(terminations).toEqual(['move-limit', 'move-limit']);
});

test('pause and resume preserve the same game, score, and schedule position', async ({ page }) => {
  await openArena(page);
  await installSyntheticSeries(page, 2);
  await page.evaluate(() => {
    const arena = window.CaissaArena;
    arena.runtimeManager.stopAll = () => Promise.resolve(true);
    arena.runEngineLoop = () => {};
    arena.togglePause();
  });
  await expect(page.locator('#arenaStatusText')).toContainText('Paused · Game 1 / 2');
  const paused = await page.evaluate(() => ({
    generation: window.CaissaArena.state.currentGame.generation,
    completed: window.CaissaArena.matchSeries.score.completed,
    state: window.CaissaArena.matchSeries.state
  }));
  await page.evaluate(() => window.CaissaArena.togglePause());
  await expect.poll(() => page.evaluate(() => window.CaissaArena.matchSeries.state)).toBe('RUNNING_GAME');
  const resumed = await page.evaluate(() => ({
    generation: window.CaissaArena.state.currentGame.generation,
    completed: window.CaissaArena.matchSeries.score.completed
  }));
  expect(resumed).toEqual({ generation: paused.generation, completed: paused.completed });
});

test('Stop Series during game 3 retains two results, starts no game 4, and clears series work', async ({ page }) => {
  await openArena(page);
  await installSyntheticSeries(page, 6);
  for (let completed = 0; completed < 2; completed += 1) {
    await page.evaluate(() => window.CaissaArena.completeMatchSeriesGame({
      result: '1/2-1/2', resultText: 'QA draw', termination: 'manual-draw'
    }));
    await expect.poll(() => page.evaluate(() => window.CaissaArena.state.currentGame?.round)).toBe(completed + 2);
  }
  await page.evaluate(async () => {
    const arena = window.CaissaArena;
    arena.destroyEngines = () => Promise.resolve();
    arena.stopMatch();
    await arena._cleanupPromise;
  });
  await page.waitForTimeout(150);
  const stopped = await page.evaluate(() => ({
    state: window.CaissaArena.matchSeries.state,
    completed: window.CaissaArena.matchSeries.score.completed,
    games: window.CaissaArena.matchSeries.games.map(game => ({ round: game.round, result: game.result, termination: game.termination })),
    timer: window.CaissaArena._seriesAdvanceTimer,
    loopActive: window.CaissaArena.state.loopActive,
    pendingSearch: window.CaissaArena.state.cancelPendingSearch
  }));
  expect(stopped.state).toBe('STOPPED');
  expect(stopped.completed).toBe(2);
  expect(stopped.games).toHaveLength(3);
  expect(stopped.games[2]).toEqual({ round: 3, result: '*', termination: 'stopped' });
  expect(stopped.timer).toBeNull();
  expect(stopped.loopActive).toBe(false);
  expect(stopped.pendingSearch).toBeNull();
});

test('active series locks configuration, keeps board flip visual-only, and remains board-first on mobile', async ({ page }) => {
  await openArena(page, { width: 390, height: 844 });
  await installSyntheticSeries(page, 2);
  for (const id of [
    'arenaWhiteEngine', 'arenaBlackEngine', 'arenaMatchTitle', 'arenaMatchGameCount',
    'arenaMatchMoveLimit', 'arenaTimeControlMode', 'arenaTimeControlPreset',
    'arenaOpeningMode', 'arenaSavePgn', 'arenaSwapEngines', 'arenaSetPositionBtn', 'arenaManualSetupBtn'
  ]) await expect(page.locator(`#${id}`)).toBeDisabled();
  await expect(page.locator('#arenaFlipBoard')).toBeEnabled();
  const before = await page.evaluate(() => ({
    fen: window.CaissaArena.game.fen(),
    generation: window.CaissaArena.state.currentGame.generation,
    boardWidth: document.querySelector('#arenaBoardMount').getBoundingClientRect().width
  }));
  await page.locator('#arenaFlipBoard').evaluate(input => {
    input.checked = true;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  const after = await page.evaluate(() => ({
    fen: window.CaissaArena.game.fen(),
    generation: window.CaissaArena.state.currentGame.generation,
    orientation: window.CaissaArena.board.orientation(),
    boardWidth: document.querySelector('#arenaBoardMount').getBoundingClientRect().width,
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
  }));
  expect(after.fen).toBe(before.fen);
  expect(after.generation).toBe(before.generation);
  expect(after.orientation).toBe('black');
  expect(Math.abs(after.boardWidth - before.boardWidth)).toBeLessThanOrEqual(1);
  expect(after.overflow).toBe(false);
  await expect(page.locator('#arenaSeriesSummary')).toBeVisible();
});
