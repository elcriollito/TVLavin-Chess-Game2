import { test, expect } from '@playwright/test';

const route = '/watch/live-tournaments';
const frameUrl = 'https://live.chessbase.com/frame/Esports-World-Cup-Chess-Playoff-2026';
const viewports = [{ width: 1440, height: 1000 }, { width: 1024, height: 768 }, { width: 768, height: 1024 }, { width: 390, height: 844 }, { width: 320, height: 700 }];

for (const viewport of viewports) {
  test(`validated tournament fits ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto(route);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Watch a Featured Live Chess Tournament');
    await expect(page.getByRole('heading', { level: 2, name: 'Esports World Cup Chess Finals 2026' })).toBeVisible();
    await expect(page.locator('[data-live-tournaments-event-status]')).toHaveText('Live coverage window');
    await expect(page.getByText('Esports World Cup Foundation', { exact: true }).first()).toBeVisible();
    const frame = page.locator(`iframe[src="${frameUrl}"]`);
    await expect(frame).toHaveCount(1);
    await expect(frame).toHaveAttribute('sandbox', 'allow-scripts allow-same-origin');
    await expect(frame).toHaveAttribute('referrerpolicy', 'no-referrer');
    await expect(frame).not.toHaveAttribute('allow', /./);
    await expect(page.locator('[data-live-tournaments-shell]')).toHaveClass(/is-ready/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await expect(page.getByText(/independent credited gateway/)).toBeVisible();
  });
}

test('blocked provider frame exposes unavailable state and stable single-frame retry', async ({ page }) => {
  await page.goto(route);
  await page.locator('iframe').evaluate(frame => frame.dispatchEvent(new Event('error')));
  await expect(page.locator('[data-live-tournaments-event-status]')).toHaveText('Tournament viewer currently unavailable', { timeout: 17000 });
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.locator('iframe')).toHaveCount(1);
  await page.getByRole('button', { name: 'Retry' }).evaluate(button => { button.click(); button.click(); });
  await expect(page.locator('iframe')).toHaveCount(1);
  await expect(page.getByRole('link', { name: /Open the official ChessBase tournament viewer/ })).toHaveAttribute('rel', /noopener/);
  await expect(page.getByRole('navigation', { name: 'CAISSA main navigation' })).toBeVisible();
});

test('invalid configuration creates no iframe and preserves the safe fallback', async ({ page }) => {
  await page.route('**/js/live-tournaments-config.js', route => route.fulfill({
    contentType: 'text/javascript',
    body: `export const FEATURED_TOURNAMENT={schema:'invalid'};export const validateFeaturedTournament=()=>({ok:false,errors:['schema-invalid']});export const featuredTournamentStatus=()=> 'configuration-error';`
  }));
  await page.goto(route);
  await expect(page.locator('iframe')).toHaveCount(0);
  await expect(page.locator('[data-live-tournaments-event-status]')).toHaveText('Featured tournament information is temporarily unavailable');
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.locator('[data-live-tournaments-fallback]')).toHaveAttribute('href', 'https://live.chessbase.com');
});
