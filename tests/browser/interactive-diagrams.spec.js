import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const viewports = [{ width: 1440, height: 1000 }, { width: 1024, height: 768 }, { width: 768, height: 1024 }, { width: 390, height: 844 }, { width: 320, height: 700 }];

test('button-free diagrams render with one CSP-blocked attempt, zero engine bytes, and no overflow', async ({ page, context }) => {
  const workers = [];
  const requests = [];
  const responses = [];
  page.on('worker', worker => workers.push(worker.url()));
  page.on('request', request => requests.push(request.url()));
  page.on('response', response => responses.push(response.url()));
  await page.goto('/learn/interactive-diagrams');
  const shell = page.locator('[data-interactive-diagrams-shell]');
  const frame = page.frameLocator('iframe[title="Four CAISSA educational chess diagrams powered by ChessBase"]');
  await expect(shell).toHaveClass(/is-ready/, { timeout: 20_000 });
  await expect(frame.locator('.cbdiagram')).toHaveCount(4);
  await expect(frame.locator('button')).toHaveCount(0);
  await expect(frame.locator('[data-play]')).toHaveCount(0);
  expect(workers.length).toBeLessThanOrEqual(1);
  expect(workers.every(url => /\/Common\/Chess\/Engine\/Enginemin\.js$/i.test(url))).toBe(true);
  expect(requests.filter(url => /Enginemin\.js$/i.test(url)).length).toBeLessThanOrEqual(1);
  expect(responses.filter(url => /Enginemin\.js$/i.test(url))).toEqual([]);
  const containment = await frame.locator('html').evaluate(() => window.CaissaInteractiveDiagramContainment);
  expect(containment.engineMessages).toBe(0);
  expect(containment.violations.length).toBeGreaterThanOrEqual(1);
  expect(containment.violations.every(item => /Enginemin\.js$/i.test(item.blockedURI) && ['worker-src', 'child-src'].includes(item.effectiveDirective) && item.disposition === 'enforce')).toBe(true);
  await page.waitForTimeout(2000);
  expect(workers.length).toBeLessThanOrEqual(1);
  const other = await context.newPage(); await other.goto('/about'); await other.bringToFront(); await page.bringToFront(); await other.close(); await page.waitForTimeout(500);
  expect(workers.length).toBeLessThanOrEqual(1);
  expect(requests.filter(url => /jquery-3\.0\.0\.min\.js/.test(url))).toHaveLength(1);
  expect(requests.filter(url => /cbreplay\.js/.test(url))).toHaveLength(1);
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    const inner = await frame.locator('html').evaluate(element => ({ client: element.clientWidth, scroll: element.scrollWidth }));
    expect(inner.scroll).toBeLessThanOrEqual(inner.client + 1);
  }
  await page.goto('/about'); await page.waitForTimeout(500);
  expect(workers.length).toBeLessThanOrEqual(1);
});

test('text fallback, shared drawer, and CAISSA-owned accessibility remain usable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/learn/interactive-diagrams', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.interactive-diagram-summary')).toHaveCount(4);
  const toggle = page.locator('.caissa-standalone-mobile-toggle');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Escape');
  await expect(toggle).toBeFocused();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  const axe = await new AxeBuilder({ page }).exclude('iframe').analyze();
  expect(axe.violations.filter(item => ['critical', 'serious'].includes(item.impact))).toEqual([]);
});

test('blocked provider retains text and Retry creates one fresh contained wrapper', async ({ page }) => {
  const workers = [];
  const engineResponses = [];
  page.on('worker', worker => workers.push(worker.url()));
  page.on('response', response => { if (/Enginemin\.js$/i.test(response.url())) engineResponses.push(response.url()); });
  await page.route('https://pgn.chessbase.com/cbreplay.js', route => route.abort());
  await page.goto('/learn/interactive-diagrams');
  const error = page.locator('[data-interactive-diagrams-error]');
  await expect(error).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.interactive-diagram-summary')).toHaveCount(4);
  const frame = page.locator('iframe[title="Four CAISSA educational chess diagrams powered by ChessBase"]');
  const before = await frame.getAttribute('src');
  await page.unroute('https://pgn.chessbase.com/cbreplay.js');
  await page.locator('[data-interactive-diagrams-retry]').click();
  await expect(frame).not.toHaveAttribute('src', before);
  await expect(page.locator('[data-interactive-diagrams-shell]')).toHaveClass(/is-ready/, { timeout: 20_000 });
  await expect(page.locator('iframe')).toHaveCount(1);
  expect(workers.length).toBeLessThanOrEqual(1);
  expect(workers.every(url => /\/Common\/Chess\/Engine\/Enginemin\.js$/i.test(url))).toBe(true);
  expect(engineResponses).toEqual([]);
  await page.waitForTimeout(2000);
  expect(workers.length).toBeLessThanOrEqual(1);
});

test('engine path is a real not-found and never an HTML fallback', async ({ request }) => {
  const response = await request.get('/Common/Chess/Engine/Enginemin.js');
  expect(response.status()).toBe(404);
  const body = await response.text();
  expect(body).toBe('<h1>404 - File Not Found</h1>');
  expect(body).not.toMatch(/CAISSA|interactive-diagrams|<script|<iframe/i);
});
