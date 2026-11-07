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

test('Explore is default, tab keyboard behavior works, and move activation updates the position', async ({ page }) => {
  await page.goto('/opening-database');
  await expect(page.locator('#openingDbBoard .piece-417db')).toHaveCount(32);
  const tabs = page.getByRole('tab');
  await expect(tabs).toHaveCount(3);
  await expect(tabs.nth(0)).toHaveText(/Analysis/);
  await expect(tabs.nth(1)).toHaveText(/Games/);
  await expect(tabs.nth(2)).toHaveText(/Explore/);
  await expect(page.getByRole('tab', { name: 'Explore' })).toHaveAttribute('aria-selected', 'true');

  await page.getByRole('tab', { name: 'Explore' }).focus();
  await page.keyboard.press('Home');
  await expect(page.getByRole('tab', { name: 'Analysis' })).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Games' })).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Explore' })).toHaveAttribute('aria-selected', 'true');

  const firstMove = page.locator('#odbStatsBody [data-move-index="0"]');
  await expect(firstMove).toBeVisible();
  await firstMove.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#odbCurrentLine')).toContainText('1.e4');
  await expect(page.locator('#odbTurnPly')).toContainText('Black to move');
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
