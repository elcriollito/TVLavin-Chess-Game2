import { test, expect } from '@playwright/test';

const enabled = process.env.CAISSA_FICS_MOBILE_HQA_SMOKE === '1';
test.skip(!enabled, 'Set CAISSA_FICS_MOBILE_HQA_SMOKE=1 for the local LAN HQA connectivity smoke.');

for (const viewport of [
  { width: 390, height: 844 },
  { width: 430, height: 932 }
]) {
  test(`Mobile HQA reaches a FICS Guest session at ${viewport.width}px`, async ({ page, browserName }) => {
    await page.setViewportSize(viewport);
    await page.addInitScript(() => localStorage.setItem('caissa_onboarding_completed', 'true'));
    const sockets = [];
    const sentFrames = [];
    const transportErrors = [];
    page.on('websocket', (socket) => {
      sockets.push(socket.url());
      socket.on('framesent', event => sentFrames.push(String(event.payload)));
      socket.on('socketerror', error => transportErrors.push(String(error)));
    });
    page.on('console', (message) => {
      const text = message.text();
      if (message.type() === 'error' && /websocket|mixed content|fics client.*error/i.test(text)) {
        transportErrors.push(text);
      }
    });

    const response = await page.goto('/fics', { waitUntil: 'domcontentloaded' });
    expect(response?.status()).toBe(200);
    expect((await response.headers())['cache-control']).toContain('no-store');
    await expect(page.locator('[data-caissa-mobile2-destination-header]')).toBeVisible();
    await expect(page.locator('[data-caissa-mobile2-destination-title]')).toHaveText('FICS');
    await expect(page.locator('[data-caissa-mobile2-back]')).toHaveAttribute('href', '/play-hub');
    expect(await page.locator('#mobileNavToggle, .caissa-standalone-mobile-toggle')
      .evaluateAll(elements => elements.filter(element => element.getClientRects().length).length)).toBe(0);

    const endpoint = await page.evaluate(() => window.CaissaFICSClient?.gatewayUrl);
    const expectedEndpoint = `${new URL(page.url()).origin.replace(/^http/, 'ws')}/__caissa_hqa/fics`;
    expect(endpoint).toBe(expectedEndpoint);
    expect(endpoint).not.toMatch(/localhost|127\.0\.0\.1/);
    await expect.poll(() => sockets, { timeout: 10_000 }).toContain(expectedEndpoint);
    await expect.poll(() => page.evaluate(() => ({
      authenticated: window.CaissaFICSClient?.authenticated,
      state: window.CaissaFICSClient?.connectionState,
      username: window.CaissaFICSClient?.ficsUsername
    })), { timeout: 20_000 }).toMatchObject({
      authenticated: true,
      state: 'connected',
      username: expect.stringMatching(/^Guest/i)
    });
    expect(sentFrames).toContain('guest');
    expect(transportErrors).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth))
      .toBeLessThanOrEqual(1);

    await page.evaluate(() => window.CaissaFICSClient.disconnect());
    await expect.poll(() => page.evaluate(() => window.CaissaFICSClient.connectionState)).toBe('disconnected');
    test.info().annotations.push({ type: 'engine', description: browserName });
  });
}
