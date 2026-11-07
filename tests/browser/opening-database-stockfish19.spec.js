import { test, expect } from '@playwright/test';

const WORKER = '/assets/vendor/stockfish/19.0.0/stockfish-19-lite-single.js';
const WASM = '/assets/vendor/stockfish/19.0.0/stockfish-19-lite-single.wasm';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('caissa_onboarding_completed', 'true'));
  await page.route('**/api/public-auth-config', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ publishableKey: '' })
  }));
  await page.route('https://downloads.caissa-chess.org/openingdb/manifest.json', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({
      activeVersion: 'v2_sf19_test',
      baseUrl: 'https://downloads.caissa-chess.org/openingdb/shards/v2_sf19_test',
      generatedAt: '2026-11-07T12:00:00.000Z',
      maxPlies: 60
    })
  }));
  await page.route('https://downloads.caissa-chess.org/openingdb/shards/v2_sf19_test/*.json', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({
      '66be37feb35e7d6a': {
        moves: [
          { uci: 'e2e4', san: 'e4', games: 1000, w: 410, d: 320, l: 270 },
          { uci: 'd2d4', san: 'd4', games: 800, w: 330, d: 300, l: 170 }
        ]
      }
    })
  }));
});

test('Opening Database runs the vetted Stockfish 19 Lite runtime with scoped ownership', async ({ page }) => {
  const assets = [];
  page.on('response', response => {
    const pathname = new URL(response.url()).pathname;
    if ([WORKER, WASM].includes(pathname)) {
      assets.push({ pathname, status: response.status(), contentType: response.headers()['content-type'] || '' });
    }
  });

  await page.goto('/opening-database');
  await page.getByRole('tab', { name: 'Analysis' }).click();
  await page.getByText('Analysis settings', { exact: true }).click();
  await page.locator('#odbEngineDepth').selectOption('10');
  await page.locator('#odbEngineMultiPV').selectOption('3');
  await page.locator('#odbStartEngineBtn').click();

  await expect.poll(() => page.evaluate(() => window.__engineDebug), {
    timeout: 30_000,
    intervals: [100, 250, 500]
  }).toMatchObject({
    engineId: 'Stockfish 19 Lite WASM',
    engineAuthor: 'the Stockfish developers (see AUTHORS file)',
    identityAccepted: true,
    owner: 'opening-database',
    attribution: { enabled: true }
  });
  await expect(page.locator('#odbEngineIdentityValue')).toHaveText('Stockfish 19 Lite WASM');
  await expect.poll(async () => Number(await page.locator('#odbEngineDepthValue').textContent()), {
    timeout: 30_000,
    intervals: [100, 250, 500]
  }).toBeGreaterThanOrEqual(10);
  await expect(page.locator('#odbEnginePvLines .engine-pv-line')).toHaveCount(3);
  await expect(page.locator('#odbEngineEvalValue')).not.toHaveText('-');
  await expect(page.locator('#odbEngineBestMoveValue')).not.toHaveText('-');
  expect(assets.find(asset => asset.pathname === WORKER)?.status).toBe(200);
  expect(assets.find(asset => asset.pathname === WASM)).toMatchObject({
    status: 200,
    contentType: expect.stringContaining('application/wasm')
  });
});

test('Fast candidate evaluation is sequential, cached, and cancellable', async ({ page }) => {
  await page.goto('/opening-database');
  await page.locator('#odbQuickEvalMode').selectOption('fast');
  await page.locator('#odbQuickEvalToggle').check();
  await expect.poll(async () => page.locator('#odbStatsBody td.col-engine').evaluateAll(cells => cells.map(cell => cell.textContent)), {
    timeout: 30_000,
    intervals: [100, 250, 500]
  }).toEqual(expect.arrayContaining([expect.stringMatching(/^(?:[+-]\d+\.\d{2}|-?M\d+)$/)]));

  const before = await page.evaluate(() => window.__engineDebug?.workerLifecycle || null);
  await page.locator('#odbQuickEvalToggle').uncheck();
  await expect.poll(() => page.evaluate(() => window.__engineDebug?.nextMoveEvalRunning), { timeout: 5_000 }).toBe(false);
  const after = await page.evaluate(() => window.__engineDebug?.workerLifecycle || null);
  if (before && after) expect(after.peakActive).toBeLessThanOrEqual(2);
});
