import { test, expect } from '@playwright/test';

const viewports = [
  { width: 390, height: 844 },
  { width: 430, height: 932 }
];
const canonicalGateway = 'wss://fics-gateway.caissa-chess.org/ws';

async function prepareCommon(page) {
  await page.route('**/api/public-auth-config', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ publishableKey: '' })
  }));
  await page.addInitScript(() => {
    localStorage.setItem('caissa_onboarding_completed', 'true');
  });
}

async function prepareFailedFics(page) {
  await prepareCommon(page);
  await page.addInitScript((gateway) => {
    window.CAISSA_FICS_GATEWAY_URL = gateway;
    window.__ficsSocketAttempts = 0;
    window.WebSocket = class FicsUnavailableSocket {
      static CONNECTING = 0;
      static OPEN = 1;
      static CLOSING = 2;
      static CLOSED = 3;

      constructor() {
        window.__ficsSocketAttempts += 1;
        throw new Error('Test transport unavailable');
      }
    };
  }, canonicalGateway);
}

async function expectMobileHeader(page, title) {
  const header = page.locator('[data-caissa-mobile2-destination-header]');
  await expect(header).toBeVisible();
  await expect(header.locator('[data-caissa-mobile2-destination-title]')).toHaveText(title);
  await expect(header.locator('[data-caissa-mobile2-back]')).toHaveAttribute('href', '/play-hub');
  expect(await page.locator('#mobileNavToggle, .caissa-standalone-mobile-toggle')
    .evaluateAll(elements => elements.filter(element => element.getClientRects().length).length)).toBe(0);
}

for (const viewport of viewports) {
  test(`FICS fails gracefully on mobile at ${viewport.width}px`, async ({ page }) => {
    await prepareFailedFics(page);
    await page.setViewportSize(viewport);
    await page.goto('/fics');

    await expectMobileHeader(page, 'FICS');
    await expect.poll(() => page.evaluate(() => window.CaissaFICSClient?.connectionState)).toBe('error');
    expect(await page.evaluate(() => window.CaissaFICSClient.gatewayUrl)).toBe(canonicalGateway);
    expect(await page.evaluate(() => window.CaissaFICSClient.gatewayUrl.startsWith('wss://'))).toBe(true);

    const fallback = page.locator('[data-fics-mobile-connection-fallback]');
    await expect(fallback).toBeVisible();
    await expect(fallback.getByRole('heading')).toHaveText('Unable to connect to the FICS service.');
    await expect(fallback).not.toContainText('Test transport unavailable');
    const retry = fallback.getByRole('button', { name: 'Retry' });
    await expect(retry).toBeVisible();
    const attempts = await page.evaluate(() => window.__ficsSocketAttempts);
    await retry.click();
    await expect.poll(() => page.evaluate(() => window.__ficsSocketAttempts)).toBe(attempts + 1);

    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth))
      .toBeLessThanOrEqual(1);
  });

  test(`Playchess uses the mobile width and preserves iframe touch mapping at ${viewport.width}px`, async ({ page }) => {
    await prepareCommon(page);
    await page.setViewportSize(viewport);
    await page.goto('/play-online/playchess', { waitUntil: 'networkidle' });

    await expectMobileHeader(page, 'Playchess');
    const shell = page.locator('.playchess-embed-shell');
    const frameElement = page.locator('.playchess-embed-shell iframe');
    await expect(frameElement).toBeVisible();
    const geometry = await page.evaluate(() => {
      const shellRect = document.querySelector('.playchess-embed-shell').getBoundingClientRect();
      const frame = document.querySelector('.playchess-embed-shell iframe');
      const frameRect = frame.getBoundingClientRect();
      return {
        shellWidth: shellRect.width,
        frameWidth: frameRect.width,
        frameHeight: frameRect.height,
        transform: getComputedStyle(frame).transform,
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
      };
    });
    expect(geometry.shellWidth).toBeGreaterThanOrEqual(viewport.width - 10);
    expect(geometry.frameWidth).toBeGreaterThan(geometry.shellWidth * 1.14);
    expect(geometry.frameHeight).toBeGreaterThanOrEqual(895);
    expect(geometry.transform).toContain('1.15');
    expect(geometry.overflow).toBeLessThanOrEqual(1);

    const playchess = page.frames().find(frame => frame.url().toLowerCase().includes('play.chessbase.com'));
    expect(playchess).toBeTruthy();
    const more = playchess.getByRole('button', { name: 'More', exact: true });
    await expect(more).toBeVisible({ timeout: 15_000 });
    await more.click();
    await expect(playchess.getByText('Any Bullet', { exact: true })).toBeVisible();
    await expect(page.locator('.playchess-mobile-disclosure a')).toHaveAttribute('href', 'https://play.chessbase.com/en/Play');
  });
}

test('desktop FICS and Playchess layout remain unchanged', async ({ page }) => {
  await prepareFailedFics(page);
  await page.setViewportSize({ width: 1440, height: 900 });

  await page.goto('/fics');
  await expect.poll(() => page.evaluate(() => window.CaissaFICSClient?.connectionState)).toBe('error');
  await expect(page.locator('[data-fics-mobile-connection-fallback]')).toBeHidden();
  await expect(page.locator('.fics-rd3-tables')).toBeVisible();
  await expect(page.locator('[data-caissa-mobile2-destination-header]')).toBeHidden();

  await page.goto('/play-online/playchess', { waitUntil: 'domcontentloaded' });
  const desktopGeometry = await page.evaluate(() => {
    const shell = document.querySelector('.playchess-embed-shell').getBoundingClientRect();
    const frame = document.querySelector('.playchess-embed-shell iframe');
    const frameRect = frame.getBoundingClientRect();
    return { shellWidth: shell.width, frameWidth: frameRect.width, transform: getComputedStyle(frame).transform };
  });
  expect(Math.abs(desktopGeometry.frameWidth - desktopGeometry.shellWidth)).toBeLessThanOrEqual(2);
  expect(desktopGeometry.transform).toBe('none');
  await expect(page.locator('[data-caissa-mobile2-destination-header]')).toBeHidden();
});
