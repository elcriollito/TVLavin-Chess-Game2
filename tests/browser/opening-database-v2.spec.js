import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const openingDbFixture = {
  '66be37feb35e7d6a': {
    moves: [
      { uci: 'e2e4', san: 'e4', games: 1000, w: 410, d: 320, l: 270 },
      { uci: 'd2d4', san: 'd4', games: 800, w: 330, d: 300, l: 170 }
    ]
  },
  'fa6f7503caab4032': {
    moves: [{ uci: 'c7c5', san: 'c5', games: 700, w: 280, d: 230, l: 190 }]
  }
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('caissa_onboarding_completed', 'true'));
  await page.route('**/api/public-auth-config', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ publishableKey: '' })
  }));
  await page.route('https://downloads.caissa-chess.org/openingdb/manifest.json', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({
      activeVersion: 'v2_test',
      baseUrl: 'https://downloads.caissa-chess.org/openingdb/shards/v2_test',
      generatedAt: '2026-11-07T12:00:00.000Z',
      maxPlies: 60
    })
  }));
  await page.route('https://downloads.caissa-chess.org/openingdb/shards/v2_test/*.json', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify(openingDbFixture)
  }));
});

test('Explorer is default, four-tab keyboard behavior works, and move activation updates the position', async ({ page }) => {
  await page.goto('/opening-database');
  await expect(page.locator('#openingDbBoard .piece-417db')).toHaveCount(32);
  const tabs = page.getByRole('tab');
  await expect(tabs).toHaveCount(4);
  await expect(tabs.nth(0)).toHaveText(/Explorer/);
  await expect(tabs.nth(1)).toHaveText(/Analysis/);
  await expect(tabs.nth(2)).toHaveText(/Games/);
  await expect(tabs.nth(3)).toHaveText(/Moves/);
  await expect(page.getByRole('tab', { name: 'Explorer' })).toHaveAttribute('aria-selected', 'true');

  await page.getByRole('tab', { name: 'Explorer' }).focus();
  await page.keyboard.press('Home');
  await expect(page.getByRole('tab', { name: 'Explorer' })).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Analysis' })).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Games' })).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Moves' })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('tab', { name: 'Explorer' }).click();

  const firstMove = page.locator('#odbStatsBody [data-move-index="0"]');
  await expect(firstMove).toBeVisible();
  await firstMove.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#odbCurrentLine')).toContainText('1.e4');
  await expect(page.locator('#odbTurnPly')).toContainText('Black to move');
});

test('all approved piece images load from the local route', async ({ page }) => {
  const failedPieces = [];
  page.on('response', response => {
    if (response.url().includes('/img/chesspieces/wikipedia/') && !response.ok()) failedPieces.push(response.url());
  });
  await page.goto('/opening-database');
  await expect(page.locator('#openingDbBoard .piece-417db')).toHaveCount(32);
  expect(failedPieces).toEqual([]);
  const imageState = await page.locator('#openingDbBoard .piece-417db').evaluateAll(pieces => pieces.map(piece => ({
    piece: piece.getAttribute('data-piece'),
    src: piece.getAttribute('src')
  })));
  expect(imageState.every(image => image.piece && image.src === `/img/chesspieces/wikipedia/${image.piece}.png`)).toBe(true);
  const originals = await page.evaluate(async () => {
    const pieces = ['wK', 'wQ', 'wR', 'wB', 'wN', 'wP', 'bK', 'bQ', 'bR', 'bB', 'bN', 'bP'];
    return Promise.all(pieces.map(piece => new Promise(resolve => {
      const image = new Image();
      image.onload = () => resolve({ piece, naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight });
      image.onerror = () => resolve({ piece, naturalWidth: 0, naturalHeight: 0 });
      image.src = `/img/chesspieces/wikipedia/${piece}.png`;
    })));
  });
  expect(originals.every(image => image.naturalWidth > 0 && image.naturalHeight > 0)).toBe(true);
});

test('Moves reviews the explored line without mutating it', async ({ page }) => {
  await page.goto('/opening-database');
  await page.locator('#odbStatsBody [data-move-index="0"]').click();
  const exploredLine = await page.locator('#odbCurrentLine').textContent();
  await page.getByRole('tab', { name: 'Moves' }).click();
  await expect(page.locator('#odbMovesNotation [data-review-ply="1"]')).toContainText('e4');
  await expect(page.locator('#odbMovesPlyLabel')).toContainText('Ply 1 of 1');
  await page.getByRole('button', { name: 'First position' }).click();
  await expect(page.locator('#odbMovesPlyLabel')).toContainText('Start position');
  await page.getByRole('button', { name: 'Last position' }).click();
  await page.getByRole('tab', { name: 'Explorer' }).click();
  await expect(page.locator('#odbCurrentLine')).toHaveText(exploredLine || '');
  await expect(page.locator('#openingDbBoard [data-square="e4"] .piece-417db')).toHaveAttribute('data-piece', 'wP');
});

test('Games reports line-order scope, escapes metadata, and separates indexed totals from sample results', async ({ page }) => {
  await page.route('**/gamesearch/manifest.json', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ version: 'v1', maxPlies: 10, topK: 100 })
  }));
  await page.route('**/gamesearch/line?*', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({
      ok: true,
      games: 250,
      top: [{ gameId: 'g1', white: '<img src=x onerror=alert(1)>', black: 'Safe Player', result: '1-0', event: '<script>bad()</script>', year: 2024, whiteElo: 2500, blackElo: 2450, eco: 'C20' }]
    })
  }));
  await page.goto('/opening-database');
  await page.locator('#odbStatsBody [data-move-index="0"]').click();
  await page.getByRole('tab', { name: 'Games' }).click();
  await expect(page.locator('#odbGamesScope')).toContainText('up to 10 plies');
  await expect(page.locator('#odbGamesScope')).toContainText('Transpositions');
  await page.getByRole('button', { name: 'Search this line', exact: true }).click();
  await expect(page.locator('#odbGamesSummary')).toContainText('Indexed matches: 250');
  await expect(page.locator('#odbGamesSummary')).toContainText('Shown sample: 1');
  await expect(page.locator('#odbGamesBody')).toContainText('<img src=x onerror=alert(1)>');
  await expect(page.locator('#odbGamesBody img')).toHaveCount(0);
  await expect(page.locator('#odbGamesBody script')).toHaveCount(0);
  await expect(page.locator('#odbGamesBody')).toContainText('Metadata only');
  await page.getByRole('button', { name: 'Review', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Moves' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#odbMovesStatus')).toContainText('metadata only');
  await expect(page.locator('#odbMovesNotation')).toContainText('Move notation is unavailable');
  await page.getByRole('button', { name: 'Return to Games' }).click();
  await expect(page.getByRole('tab', { name: 'Games' })).toHaveAttribute('aria-selected', 'true');
});

test('selected game PGN drives SAN navigation and restores the exploration board', async ({ page }) => {
  await page.route('**/gamesearch/manifest.json', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ version: 'v1', maxPlies: 10, topK: 100 })
  }));
  await page.route('**/gamesearch/line?*', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({
      ok: true,
      games: 1,
      top: [{ gameId: 'genuine-1', white: 'White Player', black: 'Black Player', result: '1-0', event: 'Test Event', year: 2026, whiteElo: 2500, blackElo: 2450, eco: 'C20' }]
    })
  }));
  await page.route('**/data/openingdb_games/v1/pgn/genuine-1.pgn', route => route.fulfill({
    contentType: 'application/x-chess-pgn',
    body: '[Event "Test Event"]\n[White "White Player"]\n[Black "Black Player"]\n[Result "1-0"]\n\n1. e4 e5 2. Nf3 Nc6 1-0'
  }));
  await page.goto('/opening-database');
  await page.locator('#odbStatsBody [data-move-index="0"]').click();
  await page.getByRole('tab', { name: 'Games' }).click();
  await page.getByRole('button', { name: 'Search this line', exact: true }).click();
  await page.getByRole('button', { name: 'Review', exact: true }).click();
  await expect(page.locator('#odbMovesStatus')).toContainText('Genuine PGN loaded');
  await expect(page.locator('#odbMovesNotation [data-review-ply]')).toHaveCount(4);
  await expect(page.locator('#odbMovesGameDetails')).toContainText('1-0');
  await expect(page.locator('#odbMovesGameDetails')).toContainText('Starting FEN');
  await page.getByRole('button', { name: 'Next move' }).click();
  await expect(page.locator('#odbMovesPlyLabel')).toContainText('e4');
  await page.getByRole('button', { name: 'Last position' }).click();
  await expect(page.locator('#odbMovesPlyLabel')).toContainText('Nc6');
  await page.getByRole('tab', { name: 'Explorer' }).click();
  await expect(page.locator('#odbCurrentLine')).toContainText('1.e4');
  await expect(page.locator('#openingDbBoard [data-square="e4"] .piece-417db')).toHaveAttribute('data-piece', 'wP');
  await expect(page.locator('#openingDbBoard [data-square="e5"] .piece-417db')).toHaveCount(0);
});

test('desktop and mobile preserve the board/workspace composition without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/opening-database');
  const desktop = await page.evaluate(() => {
    const board = document.querySelector('.openingdb-board-column').getBoundingClientRect();
    const workspace = document.querySelector('.openingdb-workspace').getBoundingClientRect();
    return { board, workspace, overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
  });
  expect(desktop.board.right).toBeLessThanOrEqual(desktop.workspace.left + 2);
  expect(desktop.overflow).toBeLessThanOrEqual(1);

  await page.setViewportSize({ width: 390, height: 844 });
  const mobile = await page.evaluate(() => {
    const board = document.querySelector('.openingdb-board-column').getBoundingClientRect();
    const workspace = document.querySelector('.openingdb-workspace').getBoundingClientRect();
    return { board, workspace, overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
  });
  expect(mobile.board.bottom).toBeLessThanOrEqual(mobile.workspace.top + 2);
  expect(mobile.overflow).toBeLessThanOrEqual(1);
});

test('Analyzer action stores an immutable handoff and navigates with an opaque token', async ({ page }) => {
  await page.goto('/opening-database');
  await page.locator('#odbStatsBody [data-move-index="0"]').click();
  await page.getByRole('button', { name: /Analyze in CAISSA/ }).click();
  await page.waitForURL(/\/analyze\?handoff=[A-Za-z0-9_-]+/);
  const handoff = await page.evaluate(() => {
    const token = new URLSearchParams(location.search).get('handoff');
    return JSON.parse(sessionStorage.getItem(`caissa:analyze:handoff:v1:${token}`));
  });
  expect(handoff.source).toBe('opening-database');
  expect(handoff.intent).toBe('analyze-game');
  expect(handoff.payload.selectedPly).toBe(1);
  expect(handoff.payload.finalFen).toContain(' b ');
});

test('default V2 surface has no serious or critical axe violations', async ({ page }) => {
  await page.goto('/opening-database');
  await expect(page.locator('#openingDbBoard .board-b72b1')).toBeVisible();
  const results = await new AxeBuilder({ page }).analyze();
  const severe = results.violations.filter(item => ['serious', 'critical'].includes(item.impact));
  expect(severe).toEqual([]);
});
