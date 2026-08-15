import { test, expect } from '@playwright/test';

const route = '/watch/live-tournaments';
const frameUrl = 'https://live.chessbase.com/frame/Esports-World-Cup-Chess-Playoff-2026';

for (const viewport of [{ width: 1440, height: 900 }, { width: 768, height: 1024 }, { width: 390, height: 844 }]) {
  test(`featured tournament gateway fits ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto(route);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Watch a Featured Live Chess Tournament');
    await expect(page.locator(`iframe[src="${frameUrl}"]`)).toBeVisible();
    await expect(page.locator('[data-live-tournaments-shell]')).toHaveClass(/is-ready/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await expect(page.getByText(/provided and operated by ChessBase/)).toBeVisible();
  });
}

test('blocked provider frame exposes an accessible fallback and retry', async ({ page }) => {
  await page.route(frameUrl, route => route.abort());
  await page.goto(route);
  const alert = page.getByRole('alert');
  await expect(alert).toBeVisible({ timeout: 17000 });
  await expect(alert).toContainText('could not be displayed');
  await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Open the official tournament page/ })).toHaveAttribute('rel', /noopener/);
});
