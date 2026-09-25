import { test, expect } from '@playwright/test';

async function openArena(page, viewport = { width: 1600, height: 1000 }) {
  await page.setViewportSize(viewport);
  await page.addInitScript(() => localStorage.setItem('caissa_onboarding_completed', 'true'));
  await page.goto('/arena');
  await expect(page.locator('#arenaPanelMatch')).toBeVisible();
  await expect.poll(() => page.evaluate(() => Boolean(
    window.CaissaArenaMatchLabUI && window.CaissaArenaOpeningSnapshots
  ))).toBe(true);
  if (!await page.locator('#arenaAdvancedMatchOptions').getAttribute('open')) {
    await page.locator('#arenaAdvancedMatchOptions summary').click();
  }
}

async function selectEco(page, query, code) {
  await page.locator('#arenaOpeningMode').selectOption('eco');
  await page.locator('#arenaEcoSelect').click();
  await expect(page.locator('#arenaOpeningModal')).toBeVisible();
  await page.locator('#arenaOpeningSearch').fill(query);
  const result = page.locator('.arena-opening-result').filter({ hasText: code }).first();
  await expect(result).toBeVisible();
  await result.click();
  await expect(page.locator('#arenaOpeningModal')).toBeHidden();
}

test('ECO selector lazily searches by code and name, resolves B90, and previews the real FEN without board jitter', async ({ page }) => {
  await openArena(page);
  const before = await page.locator('#arenaBoardMount').boundingBox();
  const requestsBefore = await page.evaluate(() => performance.getEntriesByName('/data/eco/eco_codes.json').length);
  expect(requestsBefore).toBe(0);
  await selectEco(page, 'B90', 'B90');
  await expect(page.locator('#arenaOpeningSummary')).toContainText('B90 — Sicilian Defense');
  await expect(page.locator('#arenaOpeningDescription')).toContainText('Najdorf');
  await expect(page.locator('#arenaOpeningFenPreview')).toHaveText('rnbqkb1r/1p2pppp/p2p1n2/8/3NP3/2N5/PPP2PPP/R1BQKB1R w KQkq - 0 6');
  await expect(page.locator('.arena-opening-mini-square')).toHaveCount(64);
  expect(await page.evaluate(() => window.CaissaArena.game.fen())).toBe('rnbqkb1r/1p2pppp/p2p1n2/8/3NP3/2N5/PPP2PPP/R1BQKB1R w KQkq - 0 6');
  const after = await page.locator('#arenaBoardMount').boundingBox();
  expect(Math.abs(after.width - before.width)).toBeLessThanOrEqual(1);
  expect(Math.abs(after.height - before.height)).toBeLessThanOrEqual(1);

  await page.locator('#arenaEcoSelect').click();
  await page.locator('#arenaOpeningSearch').fill('Najdorf');
  await expect(page.locator('.arena-opening-result').first()).toContainText('B90');
  await page.keyboard.press('Escape');
});

test('same-opening schedule keeps exact FEN and side to move while swapping only engine assignment', async ({ page }) => {
  await openArena(page);
  await selectEco(page, 'Najdorf', 'B90');
  await page.locator('#arenaMatchGameCount').selectOption('2');
  const schedule = await page.evaluate(() => {
    const arena = window.CaissaArena;
    arena.initializeMatchSeries();
    return arena.matchSeries.schedule.map(game => ({
      white: game.white.id,
      black: game.black.id,
      fen: game.startingFen,
      turn: game.startingFen.split(' ')[1],
      eco: game.startingPositionSnapshot.eco
    }));
  });
  expect(schedule).toHaveLength(2);
  expect(schedule[0].fen).toBe(schedule[1].fen);
  expect(schedule.map(game => game.turn)).toEqual(['w', 'w']);
  expect(schedule.map(game => game.eco)).toEqual(['B90', 'B90']);
  expect(schedule[0].white).toBe(schedule[1].black);
  expect(schedule[0].black).toBe(schedule[1].white);
});

test('single ECO Match starts from the resolved position and produces legal play', async ({ page }) => {
  await openArena(page);
  await selectEco(page, 'B90', 'B90');
  await page.locator('#arenaTimeControlMode').selectOption('fixed-depth');
  await page.locator('#arenaTimeControlPreset').selectOption('8');
  const selectedFen = await page.locator('#arenaOpeningFenPreview').textContent();
  await page.locator('#arenaStartMatch').click();
  await expect.poll(() => page.evaluate(() => window.CaissaArena.game.history().length), { timeout: 30_000 })
    .toBeGreaterThan(0);
  const result = await page.evaluate(() => ({
    startFen: window.CaissaArena.state.currentGame.startFen,
    opening: window.CaissaArena.state.currentGame.opening,
    firstMove: window.CaissaArena.game.history({ verbose: true })[0],
    state: window.CaissaArena.state.matchState
  }));
  expect(result.startFen).toBe(selectedFen);
  expect(result.opening.eco).toBe('B90');
  expect(result.firstMove).toMatchObject({ color: 'w' });
  expect(result.state).toBe('running');
  await page.evaluate(() => window.CaissaArena.stopMatch());
});

test('Black-to-move ECO snapshot loads Black as first clock/search owner', async ({ page }) => {
  await openArena(page);
  await selectEco(page, 'A00', 'A00');
  const result = await page.evaluate(() => {
    const arena = window.CaissaArena;
    const game = arena.initializeMatchSeries();
    arena.state.mode = 'match';
    arena.state.currentGame = { id: game.gameId, generation: game.generation };
    arena.matchSeries.markRunning(game.generation);
    const timeControl = arena.resolveMatchTimeControl({ mode: 'blitz', preset: '3+2' });
    arena.initializeMatchClock(timeControl);
    const search = arena.beginMatchClockSearch('black', 1, game.generation);
    const snapshot = arena.matchClock.snapshot();
    arena.stopMatchClock();
    return { turn: arena.game.turn(), active: snapshot.activeColor, command: arena.formatArenaGoCommand(search.options) };
  });
  expect(result.turn).toBe('b');
  expect(result.active).toBe('black');
  expect(result.command).toMatch(/^go wtime 180000 btime 180000 winc 2000 binc 2000$/);
});

test('Balanced Opening Set editor creates three deterministic positions and derives six games', async ({ page }) => {
  await openArena(page);
  await page.locator('#arenaOpeningMode').selectOption('set');
  await page.locator('#arenaEcoSelect').click();
  for (const code of ['B20', 'C60', 'D85']) {
    await page.locator('#arenaOpeningSearch').fill(code);
    await page.locator('.arena-opening-result').filter({ hasText: code }).first().click();
  }
  await expect(page.locator('#arenaOpeningSetPositions > li')).toHaveCount(3);
  await expect(page.locator('#arenaOpeningSetCount')).toHaveText('6 games from 3 positions × both colors');
  await page.locator('#arenaOpeningSetDone').click();
  await expect(page.locator('#arenaMatchGameCount')).toHaveValue('6');
  await expect(page.locator('#arenaMatchGameCount')).toBeDisabled();
  const result = await page.evaluate(() => {
    const arena = window.CaissaArena;
    arena.initializeMatchSeries();
    return {
      count: arena.matchSeries.config.gameCount,
      games: arena.matchSeries.schedule.map(game => ({
        fen: game.startingFen,
        white: game.white.id,
        black: game.black.id,
        eco: game.startingPositionSnapshot.eco
      }))
    };
  });
  expect(result.count).toBe(6);
  expect(result.games.map(game => game.eco)).toEqual(['B20', 'B20', 'C60', 'C60', 'D85', 'D85']);
  for (let index = 0; index < result.games.length; index += 2) {
    expect(result.games[index].fen).toBe(result.games[index + 1].fen);
    expect(result.games[index].white).toBe(result.games[index + 1].black);
  }
});

test('Custom FEN stays authoritative and mobile selector remains board-first and keyboard closable', async ({ page }) => {
  await openArena(page, { width: 390, height: 844 });
  const fen = '8/8/8/8/8/8/2k5/K7 b - - 17 42';
  expect(await page.evaluate(value => window.CaissaArena.applyArenaPosition(value, 'Custom test'), fen)).toBe(true);
  await expect(page.locator('#arenaOpeningMode')).toHaveValue('fen');
  expect(await page.evaluate(() => window.CaissaArenaMatchLabUI.getOpeningSnapshot().resultingFen)).toBe(fen);
  const boardTop = (await page.locator('#arenaBoardMount').boundingBox()).y;
  const panelTop = (await page.locator('.arena-control-panel').boundingBox()).y;
  expect(boardTop).toBeLessThan(panelTop);
  await page.locator('#arenaOpeningMode').selectOption('eco');
  await page.locator('#arenaEcoSelect').click();
  await expect(page.locator('#arenaOpeningModal')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#arenaOpeningModal')).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
});
