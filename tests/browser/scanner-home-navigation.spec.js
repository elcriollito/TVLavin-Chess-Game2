import { test, expect } from '@playwright/test';

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
  { width: 375, height: 812 }
]) {
  test(`Scanner Home link is visible and direct at ${viewport.width}px`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    await page.setViewportSize(viewport);
    await page.goto('/scanner');

    const home = page.getByRole('link', { name: 'Go to CAISSA Chess homepage' });
    await expect(home).toBeVisible();
    await expect(home).toHaveAttribute('href', '/');
    if (viewport.width <= 520) {
      await expect(page.locator('.public-beta-badge')).toBeHidden();
    }

    const layout = await page.evaluate(() => {
      const link = document.querySelector('.scanner-home-link').getBoundingClientRect();
      return {
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        link: { left: link.left, right: link.right, width: link.width, height: link.height }
      };
    });
    expect(layout.overflow).toBeLessThanOrEqual(0);
    expect(layout.link.left).toBeGreaterThanOrEqual(0);
    expect(layout.link.right).toBeLessThanOrEqual(viewport.width);
    expect(layout.link.width).toBeGreaterThanOrEqual(44);
    expect(layout.link.height).toBeGreaterThanOrEqual(44);
    if (viewport.width > 520) {
      const placement = await page.evaluate(() => {
        const badge = document.querySelector('.public-beta-badge').getBoundingClientRect();
        const link = document.querySelector('.scanner-home-link').getBoundingClientRect();
        return { gap: link.left - badge.right };
      });
      expect(placement.gap).toBeGreaterThanOrEqual(8);
      expect(placement.gap).toBeLessThanOrEqual(24);
    }

    await home.focus();
    await expect(home).toBeFocused();
    expect(await home.evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe('none');

    await home.click();
    await expect(page).toHaveURL(/\/$/);
    expect(errors).toEqual([]);
  });
}
