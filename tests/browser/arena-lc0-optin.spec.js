import { test, expect } from '@playwright/test';

async function openArena(page, viewport = { width: 1440, height: 900 }) {
  await page.setViewportSize(viewport);
  await page.addInitScript(() => localStorage.setItem('caissa_onboarding_completed', 'true'));
  await page.goto('/arena');
  await expect(page.locator('#arenaPanelMatch')).toBeVisible();
  await expect.poll(() => page.locator('#arenaWhiteEngine option').count()).toBe(4);
}

function observeLc0Requests(page) {
  const requests = [];
  page.on('request', request => {
    if (/lc0|maia-1100|eae016|eae011|onnx|ort-wasm|isolated-browser-runtime/i.test(request.url())) {
      requests.push(request.url());
    }
  });
  return requests;
}

test('desktop Arena exposes only the four standard Stockfish providers', async ({ page }) => {
  const lc0Requests = observeLc0Requests(page);
  await openArena(page);

  await expect(page.getByText('Experimental Engines', { exact: true })).toHaveCount(0);
  await expect(page.locator('#arenaExperimentalEngines, #arenaLc0ConsentModal')).toHaveCount(0);
  await expect(page.locator('#arenaWhiteEngine option')).toHaveText([
    'Stockfish 2019 MV (Tier A)',
    'Stockfish 2019 MV (Lite profile) (Tier B)',
    'Stockfish 18 Lite (Tier B)',
    'Stockfish 19 Lite (Tier B)'
  ]);
  await expect(page.locator('#arenaBlackEngine option')).toHaveCount(4);
  await expect(page.locator('option[value="lc0-maia-1100-preview"]')).toHaveCount(0);

  await page.getByRole('tab', { name: 'Tournament' }).click();
  await expect(page.locator('#arenaTournamentEngines input')).toHaveCount(4);
  await expect(page.locator('#arenaTournamentEngines input[value="lc0-maia-1100-preview"]')).toHaveCount(0);
  expect(lc0Requests).toEqual([]);
});

test('mobile Arena has no experimental UI and makes no Lc0 requests', async ({ page }) => {
  const lc0Requests = observeLc0Requests(page);
  await openArena(page, { width: 390, height: 844 });
  await expect(page.getByText('Experimental Engines', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Lc0 — Maia 1100', { exact: true })).toHaveCount(0);
  await expect(page.locator('#arenaWhiteEngine option')).toHaveCount(4);
  expect(lc0Requests).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
});

test('dormant rollout source cannot register into Engine Arena even if loaded manually', async ({ page }) => {
  await openArena(page);
  const result = await page.evaluate(async () => {
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = '/js/arena-lc0-rollout.js';
      script.onload = resolve;
      script.onerror = reject;
      document.head.append(script);
    });
    const prepared = await window.CaissaArenaRollout.prepare();
    return {
      prepared,
      productStatus: window.CaissaArenaRollout.productStatus,
      enabled: window.CaissaArenaRollout.enabled,
      visible: window.CaissaArenaRollout.visible,
      providerIds: window.EngineRegistry.listArenaProviders().map(provider => provider.id)
    };
  });
  expect(result).toEqual({
    prepared: false,
    productStatus: 'LC0_ARENA_RETIRED_DORMANT',
    enabled: false,
    visible: false,
    providerIds: ['stockfish', 'stockfish-lite', 'stockfish-18-lite', 'stockfish-19-lite']
  });
});
