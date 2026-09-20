import { test, expect } from '@playwright/test';

async function openArena(page) {
  await page.addInitScript(() => localStorage.setItem('caissa_onboarding_completed', 'true'));
  await page.goto('/arena');
  await expect(page.locator('body')).toHaveAttribute('data-caissa-surface', 'arena');
  await expect(page.locator('#arenaBoardMount')).toBeVisible();
  await expect.poll(async () => page.locator('#arenaBoardMount').evaluate(el => el.getBoundingClientRect().width)).toBeGreaterThan(100);
}

test('desktop Arena is board-first with one stable three-tab panel', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await openArena(page);

  const tabs = page.getByRole('tab');
  await expect(tabs).toHaveCount(3);
  await expect(tabs).toHaveText(['Match', 'Tournament', 'Game']);
  await expect(page.getByRole('tab', { name: 'Game' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#arenaPanelGame')).toBeVisible();
  await expect(page.locator('#arenaEvalScore')).toBeVisible();
  await expect(page.locator('#arenaMoveHistory')).toBeVisible();
  await expect(page.locator('#arenaEvalGraph')).toBeVisible();

  const geometry = await page.evaluate(() => {
    const board = document.querySelector('#arenaBoardMount').getBoundingClientRect();
    const panel = document.querySelector('.arena-control-panel').getBoundingClientRect();
    const aFile = document.querySelector('#arenaBoardMount [data-square^="a"], #arenaBoardMount .square-a1')?.getBoundingClientRect();
    const hFile = document.querySelector('#arenaBoardMount [data-square^="h"], #arenaBoardMount .square-h1')?.getBoundingClientRect();
    return {
      board: { left: board.left, right: board.right, top: board.top, bottom: board.bottom, width: board.width, height: board.height },
      panel: { left: panel.left, right: panel.right },
      filesVisible: Boolean(aFile && hFile && aFile.width > 0 && hFile.width > 0 && aFile.left >= 0 && hFile.right <= innerWidth),
      pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
    };
  });

  expect(Math.abs(geometry.board.width - geometry.board.height)).toBeLessThanOrEqual(1);
  expect(geometry.board.right).toBeLessThan(geometry.panel.left);
  expect(geometry.board.left).toBeGreaterThanOrEqual(0);
  expect(geometry.board.right).toBeLessThanOrEqual(1920);
  expect(geometry.board.bottom).toBeLessThanOrEqual(1080);
  expect(geometry.filesVisible).toBe(true);
  expect(geometry.pageOverflow).toBe(false);

  const originalBoardWidth = geometry.board.width;
  await page.getByRole('tab', { name: 'Match' }).click();
  await expect(page.locator('#arenaPanelMatch')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start Match' })).toBeVisible();
  await page.getByRole('tab', { name: 'Tournament' }).click();
  await expect(page.locator('#arenaPanelTournament')).toBeVisible();
  await page.getByRole('tab', { name: 'Game' }).click();
  await expect(page.locator('#arenaPanelGame')).toBeVisible();
  const finalBoardWidth = await page.locator('#arenaBoardMount').evaluate(el => el.getBoundingClientRect().width);
  expect(Math.abs(finalBoardWidth - originalBoardWidth)).toBeLessThanOrEqual(1);
});

test('Arena tabs support arrow navigation', async ({ page }) => {
  await openArena(page);
  const game = page.getByRole('tab', { name: 'Game' });
  await game.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Match' })).toBeFocused();
  await expect(page.getByRole('tab', { name: 'Match' })).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('End');
  await expect(game).toBeFocused();
});

test('preserved Match controls work and tab changes keep active workers alive', async ({ page }) => {
  await openArena(page);
  await page.getByRole('tab', { name: 'Match' }).click();

  const white = page.locator('#arenaWhiteEngine');
  const black = page.locator('#arenaBlackEngine');
  await expect.poll(async () => white.locator('option').count()).toBeGreaterThanOrEqual(3);
  const beforeSwap = { white: await white.inputValue(), black: await black.inputValue() };
  await page.locator('#arenaSwapEngines').click();
  await expect(white).toHaveValue(beforeSwap.black);
  await expect(black).toHaveValue(beforeSwap.white);

  await page.locator('#arenaSetPositionBtn').click();
  await expect(page.locator('#arenaPositionPanel')).toBeVisible();
  await page.locator('#arenaFenInput').fill('8/8/8/8/8/8/4K3/7k w - - 0 1');
  await page.locator('#arenaApplyFen').click();
  await expect(page.locator('#arenaFenMessage')).toContainText('ready');

  await page.locator('#arenaManualSetupBtn').click();
  await expect(page.locator('#arenaSetupModal')).toHaveClass(/show/);
  await page.locator('#arenaSetupClose').click();
  await expect(page.locator('#arenaSetupModal')).not.toHaveClass(/show/);

  await page.locator('#arenaUseStartPosition').click();
  await page.locator('#arenaInfiniteAnalysis').click();
  await expect.poll(async () => page.evaluate(() => window.CaissaArena.state.analysisRunning)).toBe(true);
  await expect(page.locator('#arenaStatusText')).toContainText('Infinite analysis running');
  await page.getByRole('tab', { name: 'Game' }).click();
  await expect.poll(async () => page.locator('#arenaEvalPV').textContent()).not.toBe('--');
  const analysisContinuity = await page.evaluate(() => ({
    active: window.CaissaArena.state.analysisRunning,
    mode: window.CaissaArena.state.mode
  }));
  expect(analysisContinuity.active).toBe(true);
  expect(analysisContinuity.mode).toBe('match');

  await page.getByRole('tab', { name: 'Match' }).click();
  await page.locator('#arenaInfiniteAnalysis').click();
  await expect.poll(async () => page.evaluate(() => window.CaissaArena.state.analysisRunning)).toBe(false);

  await page.evaluate(() => {
    window.__arenaWorkerRefs = [window.CaissaArena.whiteEngineInstance, window.CaissaArena.blackEngineInstance, window.CaissaArena.evaluatorEngine];
  });
  await page.locator('#arenaStartMatch').click();
  await expect.poll(async () => page.evaluate(() => window.CaissaArena.game.history().length), { timeout: 15_000 }).toBeGreaterThan(0);
  await page.getByRole('tab', { name: 'Game' }).click();
  const running = await page.evaluate(() => ({
    state: window.CaissaArena.state.matchState,
    mode: window.CaissaArena.state.mode,
    sameWorkers: window.__arenaWorkerRefs.every((worker, index) => worker === [window.CaissaArena.whiteEngineInstance, window.CaissaArena.blackEngineInstance, window.CaissaArena.evaluatorEngine][index])
  }));
  expect(running).toEqual({ state: 'running', mode: 'match', sameWorkers: true });
  await expect(page.locator('.arena-move-row').first()).toBeVisible();

  await page.getByRole('tab', { name: 'Match' }).click();
  await page.locator('#arenaStopMatch').click();
  await expect.poll(async () => page.evaluate(() => window.CaissaArena.state.matchState)).toBe('idle');

  await page.getByRole('tab', { name: 'Tournament' }).click();
  await expect.poll(async () => page.locator('#arenaTournamentEngines input:checked').count()).toBeGreaterThanOrEqual(3);
  await expect(page.locator('#arenaStartTournament')).toBeVisible();
});

test('desktop browser-zoom viewport equivalents remain unclipped from 80% through 125%', async ({ page }) => {
  for (const zoom of [0.8, 0.9, 1, 1.1, 1.25]) {
    await page.setViewportSize({
      width: Math.floor(1440 / zoom),
      height: Math.floor(900 / zoom)
    });
    await openArena(page);
    const geometry = await page.evaluate(() => {
      const board = document.querySelector('#arenaBoardMount').getBoundingClientRect();
      const panel = document.querySelector('.arena-control-panel').getBoundingClientRect();
      return {
        square: Math.abs(board.width - board.height) <= 2,
        boardVisible: board.left >= 0 && board.right <= innerWidth && board.bottom <= innerHeight,
        separated: board.right < panel.left,
        horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
      };
    });
    expect(geometry, `zoom ${zoom * 100}%`).toEqual({
      square: true,
      boardVisible: true,
      separated: true,
      horizontalOverflow: false
    });
  }
});

for (const viewport of [
  { name: 'tablet', width: 820, height: 1180 },
  { name: 'mobile portrait', width: 390, height: 844 },
  { name: 'mobile landscape', width: 844, height: 390 }
]) {
  test(`${viewport.name} keeps the board unclipped above the unified panel`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await openArena(page);
    const result = await page.evaluate(() => {
      const board = document.querySelector('#arenaBoardMount').getBoundingClientRect();
      const bottomPlayer = document.querySelector('.arena-player-bar-bottom').getBoundingClientRect();
      const panel = document.querySelector('.arena-control-panel').getBoundingClientRect();
      return {
        square: Math.abs(board.width - board.height) <= 2,
        boardWithinViewport: board.left >= 0 && board.right <= innerWidth,
        panelBelowBoard: panel.top >= bottomPlayer.bottom - 1,
        horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
      };
    });
    expect(result).toEqual({
      square: true,
      boardWithinViewport: true,
      panelBelowBoard: true,
      horizontalOverflow: false
    });
  });
}
