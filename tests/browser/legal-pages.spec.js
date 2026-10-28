import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

for (const pageCase of [
  { route: '/privacy', heading: 'Privacy Policy' },
  { route: '/terms', heading: 'Terms of Service' }
]) {
  test(`${pageCase.route} is readable and navigable on desktop`, async ({ page }) => {
    await page.goto(pageCase.route);
    await expect(page.getByRole('heading', { level: 1, name: pageCase.heading })).toBeVisible();
    await expect(page.locator('.legal-toc')).toBeVisible();
    await expect(page.getByRole('contentinfo').getByRole('link', { name: 'Home' })).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'index, follow');
  });

  test(`${pageCase.route} remains readable on mobile`, async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(pageCase.route);
    await expect(page.getByRole('heading', { level: 1, name: pageCase.heading })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    const size = await page.locator('.legal-document').evaluate(element => Number.parseFloat(getComputedStyle(element).fontSize));
    expect(size).toBeGreaterThanOrEqual(16);
  });

  test(`${pageCase.route} has no serious or critical automated accessibility violations`, async ({ page }) => {
    await page.goto(pageCase.route);
    const result = await new AxeBuilder({ page }).include('#legal-content').analyze();
    expect(result.violations.filter(item => ['serious', 'critical'].includes(item.impact))).toEqual([]);
  });
}

test('homepage and auth entry points expose legal links', async ({ page }) => {
  for (const route of ['/', '/signin', '/signup']) {
    await page.goto(route);
    await expect(page.getByRole('link', { name: 'Privacy Policy' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Terms of Service' })).toBeVisible();
  }
});
