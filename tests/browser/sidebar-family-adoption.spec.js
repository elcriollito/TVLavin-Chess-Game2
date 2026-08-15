import { test, expect } from '@playwright/test';

const surfaces = [
  ['/play', '#mainNav', 'Play'],
  ['/yahoo-classic', '#mainNav', 'CAISSA Classic'],
  ['/academy', '#mainNav', 'Academy'],
  ['/endgame-trainer', '#endgame-nav', 'Endgame Trainer']
];

for (const [route, selector, activeLabel] of surfaces) {
  test(`${route} exposes the adopted sidebar at desktop and mobile widths`, async ({ page }) => {
    await page.goto(route, { waitUntil: 'domcontentloaded' });
    for (const viewport of [{ width: 1440, height: 900 }, { width: 1024, height: 768 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport);
      const nav = page.locator(selector);
      await expect(nav).toHaveCount(1);
      expect((await nav.locator('.nav-group-heading').allTextContents()).slice(0, 4)).toEqual([
        'Play & Compete', 'Learn & Improve', 'Analyze & Watch', 'Tools'
      ]);
      await expect(nav.locator('[aria-current="page"]')).toHaveText(activeLabel);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    }
  });
}

for (const [route, selector] of [['/play', '#mainNav'], ['/endgame-trainer', '#endgame-nav']]) {
  test(`${route} mobile drawer is inert and restores focus`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(route, { waitUntil: 'domcontentloaded' });
    const nav = page.locator(selector);
    const toggle = page.locator('[data-mobile-nav-toggle], #mobileNavToggle').first();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(nav).toHaveAttribute('inert', '');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(nav).not.toHaveAttribute('inert', '');
    await page.keyboard.press('Escape');
    await expect(toggle).toBeFocused();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });
}

test('sign-in remains outside the sidebar family', async ({ page }) => {
  await page.goto('/signin', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.caissa-shared-sidebar, [data-caissa-primary-groups]')).toHaveCount(0);
});
