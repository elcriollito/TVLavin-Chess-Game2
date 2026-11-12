import { test, expect } from '@playwright/test';

const route = '/watch/lichess-tv';
const frameUrl = 'https://lichess.org/tv/frame?theme=brown&bg=dark';
const fixture = '<!doctype html><html><body><div data-audit-board style="width:100%;aspect-ratio:1;background:#b98b62">Lichess fixture board</div></body></html>';

test('exact frame reaches truthful document-loaded state with responsive containment', async ({ page }) => {
  await page.route(frameUrl, request => request.fulfill({ status: 200, contentType: 'text/html', body: fixture }));
  await page.goto(route, { waitUntil: 'domcontentloaded' });
  const shell = page.locator('[data-lichess-tv-shell]');
  const frame = page.locator('[data-lichess-tv-frame]');
  await expect(frame).toHaveCount(1);
  await expect(frame).toHaveAttribute('src', frameUrl);
  await expect(frame).toHaveAttribute('title', 'Lichess TV Top Rated live chess game');
  await expect(frame).toHaveAttribute('sandbox', 'allow-scripts allow-same-origin');
  await expect(frame).toHaveAttribute('referrerpolicy', 'no-referrer');
  await expect(frame).not.toHaveAttribute('allow', /.+/);
  await expect(frame).not.toHaveAttribute('allowfullscreen', /.+/);
  await expect(shell).toHaveClass(/is-document-loaded/);
  await expect(page.locator('[data-lichess-tv-status]')).toHaveText(/viewer loaded.*availability is controlled by Lichess/i);
  await expect(page.getByRole('link', { name: 'Open the official Lichess TV service' }).first()).toHaveAttribute('href', 'https://lichess.org/tv');

  for (const viewport of [{width:1920,height:1080},{width:1440,height:1000},{width:1024,height:768},{width:768,height:1024},{width:390,height:844},{width:320,height:700}]) {
    await page.setViewportSize(viewport);
    const geometry = await shell.evaluate(element => {
      const rect = element.getBoundingClientRect();
      return { width: rect.width, height: rect.height, documentWidth: document.documentElement.scrollWidth, viewportWidth: document.documentElement.clientWidth };
    });
    expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.viewportWidth);
    expect(Math.abs(geometry.width / geometry.height - 10 / 11)).toBeLessThan(0.02);
    expect(geometry.height).toBeLessThanOrEqual(Math.max(viewport.height, 700));
  }
});

test('timeout and Retry replace one frame without duplicate attempts', async ({ page }) => {
  await page.addInitScript(() => {
    const nativeSetTimeout = window.setTimeout.bind(window);
    window.setTimeout = (callback, delay, ...args) => nativeSetTimeout(callback, delay === 15000 ? 80 : delay, ...args);
  });
  let attempts = 0;
  await page.route(frameUrl, async request => {
    attempts += 1;
    if (attempts === 1) {
      await new Promise(resolve => setTimeout(resolve, 500));
      return request.abort();
    }
    return request.fulfill({ status: 200, contentType: 'text/html', body: fixture });
  });
  await page.goto(route, { waitUntil: 'commit' });
  const error = page.locator('[data-lichess-tv-error]');
  await expect(error).toBeVisible();
  await expect(page.locator('[data-lichess-tv-frame]')).toHaveCount(1);
  const retry = page.locator('[data-lichess-tv-retry]');
  await retry.focus();
  await retry.press('Enter');
  await expect(page.locator('[data-lichess-tv-shell]')).toHaveClass(/is-document-loaded/);
  await expect(page.locator('[data-lichess-tv-frame]')).toHaveCount(1);
  expect(attempts).toBe(2);
  await expect(page.locator('[data-lichess-tv-provider-link]')).toBeFocused();
});

test('mobile viewer is board-first with compact progressive attribution and no duplicated drawer', async ({ page }) => {
  await page.route(frameUrl, request => request.fulfill({ status: 200, contentType: 'text/html', body: fixture }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(route, { waitUntil: 'domcontentloaded' });
  const toggle = page.locator('.caissa-standalone-mobile-toggle');
  await expect(toggle).toBeHidden();
  await expect(page.locator('.lichess-tv-banner')).toBeHidden();
  await expect(page.locator('.lichess-tv-intro')).toBeHidden();
  await expect(page.locator('.lichess-tv-footer')).toBeHidden();
  const heading = page.locator('.lichess-tv-heading');
  const shell = page.locator('[data-lichess-tv-shell]');
  const geometry = await page.evaluate(() => ({
    headerBottom: document.querySelector('[data-caissa-mobile2-destination-header]').getBoundingClientRect().bottom,
    headingTop: document.querySelector('.lichess-tv-heading').getBoundingClientRect().top,
    shellTop: document.querySelector('[data-lichess-tv-shell]').getBoundingClientRect().top
  }));
  expect(geometry.headingTop).toBeGreaterThanOrEqual(geometry.headerBottom);
  expect(geometry.shellTop).toBeLessThan(geometry.headerBottom + 80);
  await expect(heading).toContainText('Lichess TV');
  const attribution = page.locator('.lichess-tv-disclosure');
  await expect(attribution.locator('.lichess-tv-disclosure-copy')).toBeHidden();
  await attribution.locator('summary').click();
  await expect(attribution.locator('.lichess-tv-disclosure-copy')).toBeVisible();
  await expect(shell).toBeVisible();
});
