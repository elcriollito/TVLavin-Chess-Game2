import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const gateways = [
  ['/play-online/playchess', 'Playchess'],
  ['/play-online/fritz', 'Fritz'],
  ['/puzzles/chessbase-tactics', 'Tactics'],
  ['/watch/live-blitz', 'Live Blitz']
];

for (const [route, label] of gateways) {
  test(`${label} preserves the modern shared sidebar contract`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(route, { waitUntil: 'domcontentloaded' });

    const nav = page.getByRole('navigation', { name: 'CAISSA main navigation' });
    await expect(nav).toHaveCount(1);
    await expect(nav.locator('.nav-group-heading')).toHaveText([
      'Play & Compete', 'Learn & Improve', 'Analyze & Watch', 'Tools', 'Support'
    ]);
    await expect(nav.locator('[aria-current="page"]')).toHaveCount(1);
    await expect(nav.locator('[aria-current="page"]')).toHaveText(label);
    await expect(page.getByRole('link', { name: 'CAISSA Chess — return to Play', exact: true })).toBeVisible();
    await expect(page.locator('#sidebarSignIn')).toHaveAttribute('href', '/signin');
    await expect(page.locator('.nav-premium-btn')).toHaveText(/Premium/);
    expect(await nav.evaluate(element => Math.round(element.getBoundingClientRect().width))).toBe(240);
    const contentBox = await page.locator('.caissa-standalone-content').evaluate(element => {
      const rect = element.getBoundingClientRect();
      return { x: Math.round(rect.x), width: Math.round(rect.width) };
    });
    expect(contentBox).toEqual({ x: 240, width: 1200 });
    const frameBox = await page.locator('iframe').evaluate(element => {
      const rect = element.getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    });
    expect(frameBox.width).toBeGreaterThan(700);
    expect(frameBox.height).toBeGreaterThan(500);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth))
      .toBeLessThanOrEqual(1);
  });
}

test('shared mobile drawer is inert when closed and returns focus after Escape and backdrop close', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/play-online/fritz', { waitUntil: 'domcontentloaded' });

  const toggle = page.locator('.caissa-standalone-mobile-toggle');
  await expect(toggle).toHaveAccessibleName('Open navigation menu');
  const nav = page.getByRole('navigation', { name: 'CAISSA main navigation', includeHidden: true });
  await expect(toggle).toHaveAttribute('aria-controls', 'mainNav');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(nav).toHaveAttribute('inert', '');
  await expect(nav).toHaveAttribute('aria-hidden', 'true');
  expect(await page.locator('#mainNav a').first().evaluate(element => {
    element.focus();
    return document.activeElement === element;
  })).toBe(false);

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(nav).not.toHaveAttribute('inert', '');
  await expect(nav).not.toHaveAttribute('aria-hidden', 'true');
  await expect(page.getByRole('link', { name: 'CAISSA Chess — return to Play', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(toggle).toBeFocused();
  await expect(nav).toHaveAttribute('inert', '');

  await toggle.click();
  await page.locator('.caissa-standalone-backdrop').click({ position: { x: 380, y: 400 } });
  await expect(toggle).toBeFocused();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
});

test('desktop and mobile expose only one focusable navigation surface', async ({ page }) => {
  await page.goto('/puzzles/chessbase-tactics', { waitUntil: 'domcontentloaded' });
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 768, height: 1024 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await page.waitForTimeout(50);
    const result = await page.evaluate(() => ({
      landmarks: document.querySelectorAll('nav[aria-label="CAISSA main navigation"]').length,
      hiddenFocusable: [...document.querySelectorAll('nav[aria-hidden="true"]')]
        .filter(element => !element.inert).length,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
    }));
    expect(result.landmarks).toBe(1);
    expect(result.hiddenFocusable).toBe(0);
    expect(result.overflow).toBeLessThanOrEqual(1);
  }
  const axe = await new AxeBuilder({ page }).exclude('iframe').analyze();
  expect(axe.violations.filter(violation => ['critical', 'serious'].includes(violation.impact))).toEqual([]);
});
