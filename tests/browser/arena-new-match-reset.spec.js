import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const STANDARD = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const CUSTOM = '8/8/8/8/8/8/4K3/6k1 b - - 0 1';

async function openArena(page, viewport = { width: 1440, height: 960 }) {
  await page.setViewportSize(viewport);
  await page.addInitScript(() => localStorage.setItem('caissa_onboarding_completed', 'true'));
  await page.goto('/arena');
  await expect(page.locator('#arenaPanelMatch')).toBeVisible();
  await expect.poll(() => page.evaluate(() => Boolean(window.CaissaArena?.matchSeries))).toBe(true);
}

async function configureAndSeed(page, { gameCount = 1, state = 'running', move = 'e4' } = {}) {
  return page.evaluate(({ gameCount, state, move }) => {
    const arena = window.CaissaArena;
    arena.elements.matchTitleInput.value = 'Preserved reset configuration';
    arena.elements.matchGameCountSelect.value = String(gameCount);
    arena.elements.timeControlModeSelect.value = 'blitz';
    arena.elements.timeControlPresetSelect.value = '5+3';
    arena.elements.matchMoveLimitSelect.value = '40';
    arena.elements.savePgnInput.checked = true;
    const scheduled = arena.matchSeries.start(arena.createMatchSeriesConfig());
    arena.matchSeries.markRunning(scheduled.generation);
    arena.state.mode = 'match';
    arena.state.matchState = state === 'completed' ? 'finished' : 'running';
    arena.state.currentGame = {
      id: scheduled.gameId,
      generation: scheduled.generation,
      round: scheduled.round,
      white: arena.state.whiteEngine,
      black: arena.state.blackEngine,
      moves: [],
      startFen: arena.game.fen(),
      runtimeIdentities: { white: { runtimeInstanceId: 'stale-white' }, black: { runtimeInstanceId: 'stale-black' } }
    };
    if (move) {
      const applied = arena.game.move(move);
      arena.state.currentGame.moves.push({ move: applied.san, uci: `${applied.from}${applied.to}` });
      arena.matchSeries.recordMove(scheduled.generation, { move: applied.san, uci: `${applied.from}${applied.to}` });
    }
    arena.initializeMatchClock(arena.resolveMatchTimeControl({ mode: 'blitz', preset: '5+3' }));
    if (state === 'completed') {
      arena.matchSeries.complete(scheduled.generation, {
        result: '1/2-1/2', termination: 'test-complete', moves: arena.state.currentGame.moves
      });
    }
    arena.updateMatchControls();
    return scheduled.gameId;
  }, { gameCount, state, move });
}

test('running Match confirms, cleans runtime state, and preserves configuration/history', async ({ page }) => {
  await openArena(page);
  const gameId = await configureAndSeed(page, { gameCount: 4 });
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Start a new Arena match' }).click();
  await expect(page.locator('#arenaStatusText')).toHaveText('Ready');

  const result = await page.evaluate(id => {
    const arena = window.CaissaArena;
    return {
      state: arena.state.matchState,
      seriesState: arena.matchSeries.state,
      currentGame: arena.state.currentGame,
      fen: arena.game.fen(),
      title: arena.elements.matchTitleInput.value,
      gameCount: arena.elements.matchGameCountSelect.value,
      preset: arena.elements.timeControlPresetSelect.value,
      moveLimit: arena.elements.matchMoveLimitSelect.value,
      savePgn: arena.elements.savePgnInput.checked,
      historyRetained: arena.getHistoryEntries().some(entry => entry.game.gameId === id),
      clock: arena.matchClock?.snapshot(),
      startDisabled: arena.elements.startMatchBtn.disabled,
      error: arena.lastArenaError
    };
  }, gameId);
  expect(result).toMatchObject({
    state: 'idle', seriesState: 'IDLE', currentGame: null, fen: STANDARD,
    title: 'Preserved reset configuration', gameCount: '4', preset: '5+3',
    moveLimit: '40', savePgn: true, historyRetained: true, startDisabled: false, error: null
  });
  expect(result.clock.whiteRemainingMs).toBe(300_000);
  expect(result.clock.blackRemainingMs).toBe(300_000);
  expect(result.clock.running).toBe(false);
});

test('canceling the running confirmation leaves the live Match untouched', async ({ page }) => {
  await openArena(page);
  await configureAndSeed(page);
  const before = await page.evaluate(() => window.CaissaArena.game.fen());
  page.once('dialog', dialog => dialog.dismiss());
  await page.getByRole('button', { name: 'Start a new Arena match' }).click();
  const after = await page.evaluate(() => ({
    state: window.CaissaArena.state.matchState,
    fen: window.CaissaArena.game.fen(),
    currentGame: Boolean(window.CaissaArena.state.currentGame)
  }));
  expect(after).toEqual({ state: 'running', fen: before, currentGame: true });
});

test('completed Match and active series reset to Ready without deleting committed games', async ({ page }) => {
  await openArena(page);
  const gameId = await configureAndSeed(page, { gameCount: 1, state: 'completed' });
  await page.getByRole('button', { name: 'Start a new Arena match' }).click();
  await expect(page.locator('#arenaStatusText')).toHaveText('Ready');
  const result = await page.evaluate(id => ({
    summaryHidden: window.CaissaArena.elements.seriesSummary.hidden,
    currentGame: window.CaissaArena.state.currentGame,
    archived: window.CaissaArena.getHistoryEntries().some(entry => entry.game.gameId === id),
    moveRows: window.CaissaArena.elements.moveHistory.childElementCount
  }), gameId);
  expect(result).toEqual({ summaryHidden: true, currentGame: null, archived: true, moveRows: 0 });
});

test('SESSION_GONE cleanup failure cannot strand the local setup', async ({ page }) => {
  await openArena(page);
  const result = await page.evaluate(async () => {
    const arena = window.CaissaArena;
    const original = arena.runtimeManager.terminateAll.bind(arena.runtimeManager);
    arena.lastArenaError = Object.freeze({ reasonCode: 'SESSION_GONE', runtimeInstanceId: 'stale-session' });
    arena.state.matchState = 'idle';
    arena.state.currentGame = { id: 'stale-game', runtimeIdentities: { white: { runtimeInstanceId: 'stale-session' } } };
    arena.updateGameStatus({ result: 'Arena match stopped. Try starting a new match.' });
    arena.runtimeManager.terminateAll = () => Promise.reject(new Error('SESSION_GONE'));
    try {
      const reset = await arena.prepareNewMatch();
      return {
        reset,
        status: arena.elements.statusText.textContent,
        currentGame: arena.state.currentGame,
        error: arena.lastArenaError,
        startDisabled: arena.elements.startMatchBtn.disabled
      };
    } finally {
      arena.runtimeManager.terminateAll = original;
    }
  });
  expect(result).toEqual({ reset: true, status: 'Ready', currentGame: null, error: null, startDisabled: false });
});

test('ECO and custom FEN configurations restore their selected starting board', async ({ page }) => {
  await openArena(page);
  const eco = await page.evaluate(async () => {
    const arena = window.CaissaArena;
    const snapshot = window.CaissaArenaOpeningSnapshots.createEcoSnapshot({
      code: 'B90', name: 'Sicilian Defense: Najdorf', moves: 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6'
    });
    window.CaissaArenaMatchLabUI.config.opening = snapshot;
    arena.previewOpeningSnapshot(snapshot);
    const expected = snapshot.resultingFen;
    arena.game.move('Be3');
    await arena.prepareNewMatch();
    return { expected, actual: arena.game.fen() };
  });
  expect(eco.actual).toBe(eco.expected);

  const custom = await page.evaluate(async fen => {
    const arena = window.CaissaArena;
    arena.applyArenaPosition(fen, 'Custom position');
    const expected = arena.game.fen();
    await arena.prepareNewMatch();
    return { expected, actual: arena.game.fen(), configured: arena.state.customStartFen };
  }, CUSTOM);
  expect(custom.actual).toBe(custom.expected);
  expect(custom.configured).toBe(custom.expected);
});

test('button placement is accessible and desktop/mobile geometry is stable', async ({ page }) => {
  await openArena(page);
  const button = page.getByRole('button', { name: 'Start a new Arena match' });
  await expect(button).toBeVisible();
  const desktop = await page.evaluate(() => {
    const ids = [...document.querySelector('.arena-position-button-row').children].map(node => node.id);
    const board = document.querySelector('#arenaBoardMount').getBoundingClientRect();
    return { ids, boardWidth: board.width, overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth };
  });
  expect(desktop.ids).toEqual(['arenaNewMatch', 'arenaSetPositionBtn', 'arenaManualSetupBtn']);
  expect(desktop.overflow).toBe(false);
  await button.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#arenaStatusText')).toHaveText('Ready');
  const afterWidth = await page.locator('#arenaBoardMount').evaluate(el => el.getBoundingClientRect().width);
  expect(Math.abs(afterWidth - desktop.boardWidth)).toBeLessThanOrEqual(1);

  const accessibility = await new AxeBuilder({ page }).include('#arenaPanelMatch').analyze();
  expect(accessibility.violations).toEqual([]);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(button).toBeVisible();
  const mobile = await page.evaluate(() => {
    const row = document.querySelector('.arena-position-button-row').getBoundingClientRect();
    const buttons = [...document.querySelectorAll('.arena-position-button-row .btn')].map(node => node.getBoundingClientRect());
    return {
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      contained: buttons.every(rect => rect.left >= row.left - 1 && rect.right <= row.right + 1),
      newMatchAbove: buttons[0].bottom <= buttons[1].top + 1 && buttons[0].bottom <= buttons[2].top + 1
    };
  });
  expect(mobile).toEqual({ overflow: false, contained: true, newMatchAbove: true });
});

test('New Match does not mutate an active Tournament', async ({ page }) => {
  await openArena(page);
  const result = await page.evaluate(async () => {
    const arena = window.CaissaArena;
    arena.state.mode = 'tournament';
    arena.state.matchState = 'running';
    arena.state.tournament.currentRound = 2;
    arena.state.currentGame = { id: 'tournament-game' };
    const reset = await arena.prepareNewMatch();
    return {
      reset,
      mode: arena.state.mode,
      state: arena.state.matchState,
      round: arena.state.tournament.currentRound,
      gameId: arena.state.currentGame.id
    };
  });
  expect(result).toEqual({ reset: false, mode: 'tournament', state: 'running', round: 2, gameId: 'tournament-game' });
});
