import { expect, test } from '@playwright/test';

const liveSmokeEnabled = process.env.CAISSA_FICS_LIVE_PREVIEW_SMOKE === '1';
const expectedGateway = process.env.CAISSA_FICS_EXPECTED_GATEWAY_URL || '';
const expectedPreviewOrigin = process.env.CAISSA_FICS_EXPECTED_PREVIEW_ORIGIN || '';
const vercelBypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET || '';

test.skip(!liveSmokeEnabled, 'Set CAISSA_FICS_LIVE_PREVIEW_SMOKE=1 only for an approved live Guest smoke.');

test('approved preview performs a read-only Guest, Players, Tables, and observation smoke', async ({ page }) => {
  expect(expectedGateway).toMatch(/^wss:\/\/[^*]+\/ws$/);
  expect(expectedPreviewOrigin).toMatch(/^https:\/\/[^/*]+$/);

  const browserErrors = [];
  const sockets = [];
  const sentFrames = [];
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(`console: ${message.text()}`);
  });
  page.on('pageerror', (error) => browserErrors.push(`pageerror: ${error.message}`));
  page.on('websocket', (socket) => {
    sockets.push(socket.url());
    socket.on('framesent', (event) => sentFrames.push(String(event.payload)));
  });

  if (vercelBypassSecret) {
    await page.route(`${expectedPreviewOrigin}/**`, (route) => route.continue({
      headers: {
        ...route.request().headers(),
        'x-vercel-protection-bypass': vercelBypassSecret,
        'x-vercel-set-bypass-cookie': 'true'
      }
    }));
  }

  const response = await page.goto('/fics');
  expect(response?.ok()).toBe(true);
  expect(new URL(page.url()).origin).toBe(expectedPreviewOrigin);
  const headerCsp = (await response.headers())['content-security-policy'] || '';
  const expectedConnectSrc = new URL(expectedGateway).origin;
  expect(headerCsp).toContain(expectedConnectSrc);
  expect(headerCsp).not.toContain('wss://fics-gateway.caissa-chess.org');
  expect(headerCsp).not.toMatch(/connect-src[^;]*(?:\*\.workers\.dev|\*\.vercel\.app|\swss:\s)/);

  await page.waitForFunction(() => window.CaissaFICSShell?.getSnapshot().mounted === true);
  await expect.poll(() => page.evaluate(() => window.CaissaFICSClient.gatewayUrl)).toBe(expectedGateway);
  await expect.poll(() => sockets).toContain(expectedGateway);
  await expect.poll(() => page.evaluate(() => ({
    authenticated: window.CaissaFICSClient.authenticated,
    username: window.CaissaFICSClient.ficsUsername
  })), { timeout: 20_000 }).toMatchObject({ authenticated: true, username: expect.stringMatching(/^Guest/i) });
  await expect(page.locator('.fics-rd7-session-identity')).toContainText(/Guest/i);

  await page.getByRole('tab', { name: 'Players' }).click();
  await expect.poll(() => page.evaluate(() => window.CaissaFICSClient.playersDirectory.count), {
    timeout: 20_000
  }).toBeGreaterThan(0);
  await expect(page.locator('.fics-rd10-table tbody tr').first()).toBeVisible();

  await page.getByRole('tab', { name: 'Tables' }).click();
  await page.getByRole('button', { name: 'Refresh' }).click();
  await expect.poll(() => page.evaluate(() => window.CaissaFICSClient.activeTables.length), {
    timeout: 20_000
  }).toBeGreaterThan(0);
  const observe = page.getByRole('button', { name: /^Observe table/ }).filter({ visible: true }).first();
  await expect(observe).toBeEnabled();
  await observe.click();
  await expect.poll(() => page.evaluate(() => window.CaissaFICSClient.liveGame.observedGame), {
    timeout: 20_000
  }).toBe(true);
  await expect(page.getByRole('tab', { name: 'Game' })).toBeVisible();
  await expect(page.locator('[data-fics-body-view="game"]')).toBeVisible();

  await page.getByRole('button', { name: 'Leave Observation' }).click();
  await expect.poll(() => page.evaluate(() => window.CaissaFICSClient.liveGame.observedGame), {
    timeout: 10_000
  }).toBe(false);

  const forbidden = sentFrames.filter((frame) => /^(?:seek|match|tell|xtell|shout|kibitz|whisper|challenge|accept|resign|draw)\b/i.test(frame.trim()));
  expect(forbidden).toEqual([]);
  expect(browserErrors).toEqual([]);
  await page.evaluate(() => window.CaissaFICSClient.disconnect());
});
