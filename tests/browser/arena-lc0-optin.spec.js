import { test, expect } from '@playwright/test';

const config = origin => ({
  enabled: true,
  eligible: true,
  authenticated: true,
  reason: null,
  mode: 'ENABLED',
  releaseStage: 'INTERNAL_ONLY',
  providerId: 'lc0-maia-1100-preview',
  mainOrigin: origin,
  engineOrigin: 'https://caissa-lc0-runtime-eae015a.vercel.app',
  relayOrigin: 'https://caissa-lc0-relay-eae015a.vercel.app',
  enginePath: '/',
  sourceManifestSha256: '492c6749989f429c269725d6d2761d4687c8096ca437f5651189fcfbe4ffbb9f',
  manifestSha256: 'a38862ac2113cf4e5962aa35e30a315046bafe650fedb24471b9feab954b4ed3',
  runtimeHealthy: true,
  relayHealthy: true
});

async function browserIdentity(page, mobile = false) {
  await page.addInitScript(({ mobile }) => {
    localStorage.setItem('caissa_onboarding_completed', 'true');
    Object.defineProperty(navigator, 'userAgentData', { configurable: true,
      value: { brands: [{ brand: 'Google Chrome', version: '140' }], mobile } });
  }, { mobile });
}

test('DISABLED rollout leaves normal Arena unchanged and loads no Lc0 assets', async ({ page }) => {
  const lc0Requests = [];
  page.on('request', request => {
    if (/lc0|maia-1100|eae015a-lc0/i.test(request.url())) lc0Requests.push(request.url());
  });
  await browserIdentity(page);
  await page.route('**/api/eae016', route => route.fulfill({ status: 200,
    contentType: 'application/json', body: JSON.stringify({ ...config(new URL(route.request().url()).origin),
      enabled: false, eligible: false, mode: 'DISABLED', releaseStage: 'DISABLED',
      reason: 'RELEASE_DISABLED', runtimeHealthy: null, relayHealthy: null }) }));
  await page.goto('/arena');
  await expect(page.locator('#arenaExperimentalEngines')).toBeHidden();
  await expect(page.locator('#arenaWhiteEngine option[value="lc0-maia-1100-preview"]')).toHaveCount(0);
  expect(lc0Requests.filter(url => /adapter|\.wasm|maia-1100\.pb/i.test(url))).toEqual([]);
});

test('eligible desktop user receives consent, truthful identity, and reversible opt-in', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await browserIdentity(page);
  await page.route('**/api/eae016', async route => {
    if (route.request().method() === 'POST') return route.fulfill({ status: 202,
      contentType: 'application/json', body: '{"accepted":true}' });
    return route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify(config(new URL(route.request().url()).origin)) });
  });
  await page.goto('/arena');
  const shell = page.locator('#arenaExperimentalEngines');
  await expect(shell).toBeVisible();
  await page.locator('#arenaExperimentalToggle').click();
  await expect(page.locator('#arenaExperimentalPanel')).toContainText('Lc0 — Maia 1100');
  await expect(page.locator('#arenaExperimentalPanel')).toContainText('Experimental');
  await page.locator('#arenaLc0Enable').click();
  await expect(page.locator('#arenaLc0ConsentModal')).toBeVisible();
  await expect(page.locator('#arenaLc0ConsentModal')).toContainText('desktop Chrome and Edge');
  await page.locator('#arenaLc0ConsentConfirm').click();
  await expect.poll(() => page.locator('#arenaWhiteEngine option[value="lc0-maia-1100-preview"]').count()).toBe(1);
  await expect(page.locator('#arenaWhiteEngine option[value="lc0-maia-1100-preview"]'))
    .toContainText('Lc0 — Maia 1100');
  await page.locator('#arenaLc0Disable').click();
  await expect.poll(() => page.locator('#arenaWhiteEngine option[value="lc0-maia-1100-preview"]').count()).toBe(0);
});

test('unsupported/mobile clients never load the adapter or expose the control', async ({ page }) => {
  const adapterRequests = [];
  page.on('request', request => {
    if (request.url().includes('isolated-browser-runtime-adapter')) adapterRequests.push(request.url());
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await browserIdentity(page, true);
  await page.route('**/api/eae016', route => route.fulfill({ status: 200,
    contentType: 'application/json', body: JSON.stringify(config(new URL(route.request().url()).origin)) }));
  await page.goto('/arena');
  await expect(page.locator('#arenaExperimentalEngines')).toBeHidden();
  expect(adapterRequests).toEqual([]);
});
