import { expect, test } from '@playwright/test';

const desktopSizes = [
  { width: 1920, height: 1080 },
  { width: 1440, height: 900 },
  { width: 1366, height: 768 },
  { width: 1024, height: 768 }
];

const localFixture = `[Event "Original Reader Regression"]
[Site "CAISSA QA"]
[Date "2026.10.04"]
[Round "1"]
[White "Reader White"]
[Black "Reader Black"]
[Result "1-0"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 1-0

[Event "Original Reader Regression"]
[Site "CAISSA QA"]
[Date "2026.10.04"]
[Round "2"]
[White "Second White"]
[Black "Second Black"]
[Result "1/2-1/2"]

1. d4 d5 2. c4 e6 1/2-1/2`;

test('original PGN Reader ignores Champions parameters and preserves its complete surface', async ({ page }) => {
  const gatewayRequests = [];
  page.on('request', request => {
    if (request.url().includes('/api/pgn/pgnmentor')) gatewayRequests.push(request.url());
  });

  await page.goto('/pgn-replayer?collection=world-championship-worldchamp2024&game=0&returnTo=%2Fgame-library%2Fchampions');
  await expect(page.getByRole('heading', { level: 1, name: 'PGN Reader' })).toBeVisible();
  await expect(page.getByRole('tab')).toHaveText(['Albums', 'Games', 'Notation', 'Analysis']);
  await expect(page.getByRole('tab', { name: 'Albums' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('[data-pgn-title]')).toHaveText('No game loaded');
  await expect(page.locator('[data-pgn-library-family]')).toHaveText([
    /Players/,
    /World Championships/,
    /Candidates & World Cups/,
    /Tournaments/,
    /Openings/
  ]);
  await expect(page.getByText('Open PGN', { exact: true }).first()).toBeVisible();
  await expect(page.locator('[data-pgn-language]')).toBeVisible();
  await expect(page.locator('[data-pgn-options]')).toBeVisible();
  await expect(page.locator('[data-pgn-engine]')).toBeVisible();
  await expect(page.getByText(/Return to Champions|Return to World Champions/)).toHaveCount(0);
  await expect(page.locator('[data-pgn-return], [data-pgn-fallback]')).toHaveCount(0);
  expect(gatewayRequests).toEqual([]);

  await page.locator('[data-pgn-library-family="world-championships"]').click();
  await expect(page.locator('[data-pgn-library-title]')).toHaveText('World Championships');
  await expect(page.locator('[data-library-family="world-championships"]')).not.toHaveCount(0);
  await page.locator('[data-pgn-library-family="players"]').click();
  await expect(page.locator('[data-pgn-library-title]')).toHaveText('Players');
  await expect(page.locator('[data-library-family="players"]')).not.toHaveCount(0);

  for (const size of desktopSizes) {
    await page.setViewportSize(size);
    await expect.poll(() => page.evaluate(() => ({
      client: document.documentElement.clientWidth,
      scroll: document.documentElement.scrollWidth
    }))).toEqual({ client: size.width, scroll: size.width });
  }
});

test('original PGN Reader still opens local PGN and exposes Games, Notation, Analysis, language, and options', async ({ page }) => {
  await page.goto('/pgn-replayer');
  await page.locator('[data-pgn-file]').setInputFiles({
    name: 'reader-regression.pgn',
    mimeType: 'application/x-chess-pgn',
    buffer: Buffer.from(localFixture)
  });

  await expect(page.locator('[data-pgn-title]')).toContainText('Reader White', { timeout: 20_000 });
  await expect(page.getByRole('tab', { name: /Games/ })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('[data-pgn-games] [data-game-index]')).toHaveCount(2);
  await expect(page.locator('#pgn-chessboard .caissa-board')).toBeVisible();

  await page.getByRole('tab', { name: 'Notation' }).click();
  await expect(page.locator('[data-pgn-game-info-shell]')).toBeVisible();
  await expect(page.locator('[data-pgn-game-info]')).toContainText('Original Reader Regression');
  await expect(page.locator('[data-pgn-notation] [data-node-id]')).not.toHaveCount(0);

  await page.getByRole('tab', { name: 'Analysis' }).click();
  await expect(page.locator('[data-pgn-engine-panel]')).toBeVisible();
  await expect(page.getByText('Stockfish analysis', { exact: true })).toBeVisible();
  await expect(page.locator('[data-pgn-engine]')).toBeEnabled();

  await page.locator('[data-pgn-options]').click();
  await expect(page.locator('[data-pgn-options-dialog]')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Options & About' })).toBeVisible();
  await page.locator('[data-pgn-options-dialog] button[value="close"]').first().click();

  await page.locator('[data-pgn-language]').click();
  await expect(page.locator('[data-pgn-language-label]')).toHaveText('English');
  await expect(page.getByRole('tab', { name: 'Partidas' })).toBeVisible();
});
