import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const route = '/endgame-practice';
const desktopViewports = [
  [1024, 768], [1280, 720], [1366, 768], [1440, 900], [1920, 1080]
];
const mobileViewports = [
  [320, 568], [360, 800], [390, 844], [412, 915], [768, 1024]
];

test('desktop sidebar restores the canonical visual contract', async ({ page }, testInfo) => {
  const badResponses = [];
  const consoleErrors = [];
  page.on('response', response => {
    if (response.status() >= 400) badResponses.push(`${response.status()} ${response.url()}`);
  });
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(route, { waitUntil: 'networkidle' });

  const host = page.locator('[data-caissa-standalone-sidebar]');
  const links = page.locator('#mainNav .nav-item');
  const boxes = await links.evaluateAll(elements => elements.map(element => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, display: style.display };
  }));
  const sidebar = await host.evaluate(element => element.getBoundingClientRect().toJSON());
  const content = await page.locator('.caissa-standalone-content')
    .evaluate(element => element.getBoundingClientRect().toJSON());

  expect(sidebar.width).toBeGreaterThanOrEqual(232);
  expect(sidebar.width).toBeLessThanOrEqual(280);
  expect(content.x).toBeGreaterThanOrEqual(sidebar.width - 1);
  expect(boxes.length).toBeGreaterThan(20);
  expect(new Set(boxes.map(box => box.y)).size).toBe(boxes.length);
  expect(boxes.every(box => box.display === 'flex' && box.height >= 44 && box.width > 180)).toBe(true);
  await expect(page.locator('#mainNav .nav-group-heading')).toHaveText([
    'Learning', 'Play & Watch', 'Tools & Databases', 'Community', 'Support'
  ]);
  await expect(page.locator('#mainNav [aria-current="page"]')).toHaveCount(1);
  await expect(page.locator('#mainNav [aria-current="page"]')).toHaveText('Endgame Practice');
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth))
    .toBeLessThanOrEqual(1);
  expect(badResponses).toEqual([]);
  expect(consoleErrors).toEqual([]);

  await page.screenshot({ path: testInfo.outputPath('desktop-1440.png'), fullPage: true });
});

test('mobile drawer is modal-like, keyboard-safe and leaves content full width', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(route, { waitUntil: 'networkidle' });
  const toggle = page.locator('.caissa-standalone-mobile-toggle');
  const nav = page.locator('#mainNav');

  await expect(toggle).toBeVisible();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  expect(await nav.evaluate(element => element.getBoundingClientRect().right)).toBeLessThanOrEqual(0);
  expect(await page.locator('.caissa-standalone-content')
    .evaluate(element => element.getBoundingClientRect().width)).toBeGreaterThanOrEqual(389);

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-label', 'Close navigation menu');
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(nav).toBeInViewport();
  await expect(page.locator('.caissa-standalone-backdrop')).toBeVisible();
  await expect(page.locator('body')).toHaveClass(/caissa-standalone-nav-open/);
  await expect(page.locator('#mainNav [aria-current="page"]')).toHaveText('Endgame Practice');
  await expect(page.locator('#mainNav [aria-current="page"] .nav-label')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('mobile-390-open.png'), fullPage: true });

  await page.keyboard.press('Escape');
  await expect(toggle).toBeFocused();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('.caissa-standalone-backdrop')).toBeHidden();
});

test('responsive matrix has no overlap or horizontal overflow', async ({ page }, testInfo) => {
  await page.goto(route);
  for (const [width, height] of [...mobileViewports, [820, 1180], ...desktopViewports]) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(350);
    const mobile = width <= 768;
    const sidebarWidth = await page.locator('[data-caissa-standalone-sidebar]')
      .evaluate(element => element.getBoundingClientRect().width);
    expect(mobile ? sidebarWidth : Math.round(sidebarWidth)).toBe(mobile ? 0 : 240);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth))
      .toBeLessThanOrEqual(1);
    await expect(page.getByRole('heading', { level: 1, name: 'CAISSA Endgame Practice' })).toBeVisible();
    if (!mobile) await expect(page.locator('#mainNav [aria-current="page"] .nav-label')).toBeVisible();
  }
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.evaluate(() => { document.documentElement.style.zoom = '2'; });
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth))
    .toBeLessThanOrEqual(1);
  await page.screenshot({ path: testInfo.outputPath('zoom-200.png'), fullPage: true });
});

test('no-JS fallback keeps navigation links separated and content accessible', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  await page.goto(route);
  const fallback = page.locator('.caissa-standalone-fallback');
  await expect(fallback).toBeVisible();
  const boxes = await fallback.locator('a').evaluateAll(elements => elements.map(element => {
    const rect = element.getBoundingClientRect();
    return { y: rect.y, display: getComputedStyle(element).display };
  }));
  expect(new Set(boxes.map(box => box.y)).size).toBe(boxes.length);
  expect(boxes.every(box => box.display === 'block')).toBe(true);
  await expect(page.getByRole('heading', { level: 1, name: 'CAISSA Endgame Practice' })).toBeVisible();
  await context.close();
});

test('sidebar remains accessible under text spacing and reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(route);
  await page.addStyleTag({ content: `
    * { line-height: 1.5 !important; letter-spacing: .12em !important;
        word-spacing: .16em !important; }
    p { margin-bottom: 2em !important; }
  ` });
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth))
    .toBeLessThanOrEqual(1);
  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations.filter(violation => ['critical', 'serious'].includes(violation.impact))).toEqual([]);
});
