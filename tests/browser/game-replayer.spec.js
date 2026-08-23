import { expect, test } from '@playwright/test';

const sizes = [
  { width: 1440, height: 1000 },
  { width: 1024, height: 768 },
  { width: 768, height: 1024 },
  { width: 390, height: 844 },
  { width: 320, height: 700 }
];

test('Game Replayer stays contained and usable across the release matrix', async ({ page }) => {
  await page.goto('/watch/game-replayer');
  const shell = page.locator('[data-game-replayer-shell]');
  const frame = page.frameLocator('iframe[title="Chess game replayer for the World Championship collection"]');
  await expect(shell).toHaveClass(/is-ready/, { timeout: 20_000 });
  await expect(frame.getByRole('button', { name: 'Games', exact: true })).toBeVisible();
  await expect(frame.getByRole('button', { name: 'Notation', exact: true })).toBeVisible();
  await expect(frame.getByRole('button', { name: 'Next Game', exact: true })).toBeVisible();

  for (const size of sizes) {
    await page.setViewportSize(size);
    await expect.poll(() => page.evaluate(() => ({
      client: document.documentElement.clientWidth,
      scroll: document.documentElement.scrollWidth
    }))).toEqual({ client: size.width, scroll: size.width });
    const inner = await frame.locator('html').evaluate(element => ({
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
      scrollHeight: element.scrollHeight,
      hostWidth: document.querySelector('.cbreplay')?.getBoundingClientRect().width || 0
    }));
    expect(inner.hostWidth).toBeGreaterThanOrEqual(Math.min(size.width, 320));
    expect(inner.scrollWidth).toBeLessThanOrEqual(Math.max(size.width, 760));
    expect(inner.scrollHeight).toBeGreaterThan(500);
  }

  await page.setViewportSize({ width: 390, height: 844 });
  const horizontalReach = await frame.locator('html').evaluate(element => {
    element.scrollLeft = element.scrollWidth;
    return { scrollLeft: element.scrollLeft, max: element.scrollWidth - element.clientWidth };
  });
  expect(horizontalReach.scrollLeft).toBe(horizontalReach.max);
  await frame.getByRole('button', { name: 'Games', exact: true }).click();
  await frame.getByRole('button', { name: 'Notation', exact: true }).click();
  await frame.getByRole('button', { name: 'Next Game', exact: true }).click();
  await expect(frame.locator('.cbreplay')).toContainText(/World Championship|Steinitz|Carlsen|Gukesh/i);

  const toggle = page.locator('.caissa-standalone-mobile-toggle');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Escape');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
});

test('blocked provider runtime resolves to a stable retry/download fallback', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'one browser is sufficient for deterministic network-failure behavior');
  await page.route('https://pgn.chessbase.com/cbreplay.js', route => route.abort());
  await page.goto('/watch/game-replayer');
  const error = page.locator('[data-game-replayer-error]');
  await expect(error).toBeVisible({ timeout: 18_000 });
  await expect(error).toContainText(/could not be loaded|blocked|unavailable/i);
  await expect(error.getByRole('button', { name: 'Retry' })).toBeVisible();
  await expect(error.getByRole('link', { name: 'Download the World Championship PGN collection' })).toHaveAttribute('href', '/data/pgn/free/world-championship.pgn');
});
