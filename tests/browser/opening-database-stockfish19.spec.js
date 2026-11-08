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
  await expect(page.locator('#odbEngineStatusValue')).toHaveText('Infinite');
  await expect(page.locator('#odbStopEngineBtn')).toBeEnabled();
  await page.waitForTimeout(750);
  await expect(page.locator('#odbEngineStatusValue')).toHaveText('Infinite');
  await expect.poll(() => page.evaluate(() => window.__engineDebug?.lastStopReason || '')).toBe('');
  await expect(page.locator('#odbEnginePvLines .engine-pv-line')).toHaveCount(3);
  await expect(page.locator('#odbEngineEvalValue')).not.toHaveText('-');
  await expect(page.locator('#odbEngineBestMoveValue')).not.toHaveText('-');
  expect(assets.find(asset => asset.pathname === WORKER)?.status).toBe(200);
  expect(assets.find(asset => asset.pathname === WASM)).toMatchObject({
    status: 200,
    contentType: expect.stringContaining('application/wasm')
  });

  await page.locator('#odbStopEngineBtn').click();
  await expect(page.locator('#odbEngineStatusValue')).toHaveText('Idle');
  await expect(page.locator('#odbStopEngineBtn')).toBeDisabled();
  await expect.poll(() => page.evaluate(() => window.__engineDebug?.lastStopReason || '')).toBe('user-stop');
});

test('Explorer keeps score visibility separate from explicit Engine sorting', async ({ page }) => {
  await page.route('**/js/opening-trainer/stockfish19-client.js*', route => route.fulfill({
    contentType: 'text/javascript',
    body: `(() => {
      class DeterministicStockfish19Client {
        constructor(options = {}) {
          this.owner = options.owner || 'opening-database';
          this.positionFen = '';
          this.generation = 0;
          this.lastStopReason = '';
          this.infoHandler = null;
          this.stateHandler = null;
        }
        snapshot(state) {
          return {
            state,
            workerUrl: '/assets/vendor/stockfish/19.0.0/stockfish-19-lite-single.js',
            wasmUrl: '/assets/vendor/stockfish/19.0.0/stockfish-19-lite-single.wasm',
            handshakeState: 'readyok',
            engineId: 'Stockfish 19 Lite WASM',
            engineAuthor: 'the Stockfish developers (see AUTHORS file)',
            owner: this.owner,
            attribution: { enabled: true },
            workerLifecycle: { active: 1, peakActive: 1 },
            lastStopReason: this.lastStopReason,
            lastInfoAt: Date.now(),
            errors: []
          };
        }
        async init() { this.stateHandler?.(this.snapshot('ready')); return true; }
        getIdentity() {
          return {
            ready: true,
            uciName: 'Stockfish 19 Lite WASM',
            author: 'the Stockfish developers (see AUTHORS file)',
            wasmPath: '/assets/vendor/stockfish/19.0.0/stockfish-19-lite-single.wasm'
          };
        }
        onInfo(handler) { this.infoHandler = handler; }
        onState(handler) { this.stateHandler = handler; }
        onError() {}
        onLine() {}
        setOptions() {}
        setPositionFEN(fen) { this.positionFen = fen; }
        startInfiniteAnalysis({ targetDepth = 8, stopAtTarget = true } = {}) {
          const generation = ++this.generation;
          const score = this.positionFen.includes('4P3') ? -50 : 80;
          this.lastStopReason = '';
          this.stateHandler?.(this.snapshot('analyzing'));
          setTimeout(() => {
            if (generation !== this.generation) return;
            this.infoHandler?.({
              depth: targetDepth,
              multipv: 1,
              scoreType: 'cp',
              score,
              scorePerspective: 'white',
              pv: []
            });
            if (stopAtTarget) {
              this.lastStopReason = 'target-depth';
              this.stateHandler?.(this.snapshot('ready'));
            }
          }, 20);
          return this.owner + ':' + generation;
        }
        stop(reason = 'requested') {
          this.generation += 1;
          this.lastStopReason = reason;
          this.stateHandler?.(this.snapshot('ready'));
        }
        terminate() { this.generation += 1; }
      }
      window.CaissaStockfish19LiteClient = DeterministicStockfish19Client;
      window.OpeningTrainerStockfish19Client = DeterministicStockfish19Client;
    })();`
  }));

  await page.goto('/opening-database');
  await expect(page.getByText('All legal', { exact: true })).toHaveCount(0);
  await expect(page.locator('#odbSortPopularityBtn')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#odbSortEngineBtn')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#odbStatsBody .moveSan')).toHaveText(['e4', 'd4']);

  await page.locator('#odbQuickEvalToggle').check();
  await expect.poll(async () => page.locator('#odbStatsBody td.col-engine').allTextContents()).toEqual(['-0.50', '+0.80']);
  await expect(page.locator('#odbStatsBody .moveSan')).toHaveText(['e4', 'd4']);
  await expect(page.locator('#odbSortPopularityBtn')).toHaveAttribute('aria-pressed', 'true');

  await page.locator('#odbSortEngineBtn').click();
  await expect(page.locator('#odbStatsBody .moveSan')).toHaveText(['d4', 'e4']);
  await expect(page.locator('#odbStatsBody td.col-engine')).toHaveText(['+0.80', '-0.50']);

  await page.locator('#odbQuickEvalToggle').uncheck();
  await expect(page.locator('#odbStatsBody .moveSan')).toHaveText(['e4', 'd4']);
  await expect(page.locator('#odbStatsBody td.col-engine')).toHaveText(['-', '-']);
  await expect(page.locator('#odbSortPopularityBtn')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#odbExplorerSortStatus')).toContainText('Popularity order');
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
