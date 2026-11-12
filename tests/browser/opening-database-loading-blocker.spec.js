import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '@playwright/test';

const capture = process.env.CAISSA_CAPTURE_EXPLORER_DB_BLOCKER === '1';
const evidenceDir = path.join('docs', 'mobile-home-season-001', 'hotfix', 'screenshots');

const positions = {
  '66be37feb35e7d6a': {
    moves: [
      { uci: 'e2e4', san: 'e4', games: '1200000', w: '456000', d: '396000', l: '348000' },
      { uci: 'd2d4', san: 'd4', games: 950000, w: 361000, d: 323000, l: 266000 },
      { uci: 'g1f3', san: 'Nf3', games: 320000, w: 121600, d: 108800, l: 89600 },
      { uci: 'c2c4', san: 'c4', games: 210000, w: 79800, d: 71400, l: 58800 },
      { uci: 'b1c3', san: 'Nc3', games: 95000, w: 36100, d: 32300, l: 26600 },
      { uci: 'a2a3', san: 'a3', games: 0, w: 0, d: 0, l: 0 },
      { uci: 'a2a4', san: 'a4', games: '0', w: 0, d: 0, l: 0 }
    ]
  },
  'fa6f7503caab4032': {
    moves: [
      { uci: 'c7c5', san: 'c5', games: 900000, w: 342000, d: 306000, l: 252000 },
      { uci: 'e7e5', san: 'e5', games: 800000, w: 304000, d: 272000, l: 224000 },
      { uci: 'e7e6', san: 'e6', games: 700000, w: 266000, d: 238000, l: 196000 },
      { uci: 'g7g6', san: 'g6', games: 0, w: 0, d: 0, l: 0 }
    ]
  },
  '4394ecc28e33cfb8': {
    moves: [
      { uci: 'd7d5', san: 'd5', games: 880000, w: 334400, d: 299200, l: 246400 },
      { uci: 'g8f6', san: 'Nf6', games: 610000, w: 231800, d: 207400, l: 170800 }
    ]
  },
  '5c0963cd1e6934cc': {
    moves: [
      { uci: 'd7d5', san: 'd5', games: 520000, w: 197600, d: 176800, l: 145600 },
      { uci: 'g8f6', san: 'Nf6', games: 410000, w: 155800, d: 139400, l: 114800 }
    ]
  },
  '5e840a1fc6b40a8d': {
    moves: [
      { uci: 'g1f3', san: 'Nf3', games: 640000, w: 243200, d: 217600, l: 179200 },
      { uci: 'f1c4', san: 'Bc4', games: 210000, w: 79800, d: 71400, l: 58800 }
    ]
  },
  '9d7e79c348ea1b8d': {
    moves: [
      { uci: 'b8c6', san: 'Nc6', games: 570000, w: 216600, d: 193800, l: 159600 },
      { uci: 'g8f6', san: 'Nf6', games: 190000, w: 72200, d: 64600, l: 53200 }
    ]
  },
  '2ae4d5322abb0348': {
    moves: [
      { uci: 'f1b5', san: 'Bb5', games: 430000, w: 163400, d: 146200, l: 120400 },
      { uci: 'f1c4', san: 'Bc4', games: 170000, w: 64600, d: 57800, l: 47600 }
    ]
  }
};

async function preparePage(page) {
  await page.addInitScript(() => {
    localStorage.setItem('caissa_onboarding_completed', 'true');
    localStorage.removeItem('odb_eval_next_moves_fast');
    localStorage.removeItem('odb_eval_next_moves_mode');
  });
  await page.route('**/api/public-auth-config', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ publishableKey: '' })
  }));
}

async function installEngineStub(page) {
  const client = `(() => {
    class BlockerStockfishClient {
      constructor(options = {}) { this.owner = options.owner || 'opening-database'; this.generation = 0; }
      async init() { return true; }
      getIdentity() { return { ready: true, uciName: 'Stockfish 19 Lite WASM', author: 'the Stockfish developers (see AUTHORS file)' }; }
      onInfo(handler) { this.infoHandler = handler; }
      onState(handler) { this.stateHandler = handler; }
      onError(handler) { this.errorHandler = handler; }
      onLine() {}
      setOptions() {}
      setPositionFEN(fen) { this.fen = fen; }
      startInfiniteAnalysis({ targetDepth = 8 } = {}) {
        const generation = ++this.generation;
        setTimeout(() => {
          if (generation !== this.generation) return;
          this.infoHandler?.({ depth: targetDepth, multipv: 1, scoreType: 'cp', score: 35, scorePerspective: 'white', whiteScorePawns: .35, pv: [] });
          this.stateHandler?.({ state: 'ready', lastStopReason: 'target-depth' });
        }, 5);
        return 'blocker:' + generation;
      }
      stop() { this.generation += 1; }
      terminate() { this.generation += 1; }
    }
    window.CaissaStockfish19LiteClient = BlockerStockfishClient;
    window.OpeningTrainerStockfish19Client = BlockerStockfishClient;
  })();`;
  await page.route('**/js/opening-trainer/stockfish19-client.js*', route => route.fulfill({
    status: 200,
    contentType: 'text/javascript',
    body: client
  }));
}

async function installDatabaseFixture(page, { fail = false, delayMs = 0 } = {}) {
  await page.route('**/openingdb/manifest.json', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      activeVersion: 'loading_blocker_test',
      baseUrl: '/openingdb/shards/loading_blocker_test',
      generatedAt: '2026-11-11T22:00:00.000Z'
    })
  }));
  await page.route('**/openingdb/shards/loading_blocker_test/*.json', async route => {
    if (delayMs > 0) await new Promise(resolve => setTimeout(resolve, delayMs));
    await route.fulfill(fail ? {
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'fixture unavailable' })
    } : {
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(positions)
    });
  });
}

function numericGames(values) {
  return values.map(value => Number(String(value).replaceAll(',', '')));
}

test('live LAN route loads canonical Popular Moves at 390px and 430px', async ({ page }, testInfo) => {
  await preparePage(page);
  await page.setViewportSize({ width: 390, height: 844 });
  const manifestResponse = page.waitForResponse(response => response.url().includes('/openingdb/manifest.json'));
  const shardResponse = page.waitForResponse(response => /\/openingdb\/shards\/v3_p60\/66\.json$/.test(response.url()));
  await page.goto('/opening-database');
  const [manifest, shard] = await Promise.all([manifestResponse, shardResponse]);
  expect(manifest.status()).toBe(200);
  expect(shard.status()).toBe(200);
  expect((await manifest.allHeaders())['x-caissa-local-proxy']).toBe('openingdb');
  await expect(page.locator('#odbLookupStatus')).toContainText('match', { timeout: 30_000 });
  await expect(page.locator('#odbStatsBody tr')).toHaveCount(5);
  const games = numericGames(await page.locator('#odbStatsBody .col-games').allTextContents());
  expect(games.every(value => value > 0)).toBe(true);
  expect(games).toEqual(games.slice().sort((a, b) => b - a));
  await expect(page.locator('#odbDatasetFreshness')).toContainText('v3_p60');

  const verifyLayout = async () => {
    const layout = await page.evaluate(() => {
      const rect = selector => {
        const { top, bottom } = document.querySelector(selector).getBoundingClientRect();
        return { top, bottom };
      };
      return {
        board: rect('.openingdb-board-shell'),
        metadata: rect('.openingdb-board-context'),
        results: rect('.openingdb-table-wrap'),
        controls: rect('.openingdb-sort-selector'),
        context: rect('.openingdb-opening-context'),
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
      };
    });
    expect(layout.board.bottom).toBeLessThanOrEqual(layout.metadata.top + 1);
    expect(layout.metadata.bottom).toBeLessThan(layout.results.top);
    expect(layout.results.bottom).toBeLessThan(layout.controls.top);
    expect(layout.controls.bottom).toBeLessThan(layout.context.top);
    expect(layout.overflow).toBeLessThanOrEqual(1);
  };
  await verifyLayout();

  if (capture && testInfo.project.name === 'webkit') {
    fs.mkdirSync(evidenceDir, { recursive: true });
    await page.screenshot({ path: path.join(evidenceDir, 'opening-explorer-results-first-390.png'), fullPage: true });
  }

  await page.setViewportSize({ width: 430, height: 932 });
  await verifyLayout();
  if (capture && testInfo.project.name === 'webkit') {
    await page.screenshot({ path: path.join(evidenceDir, 'opening-explorer-results-first-430.png'), fullPage: true });
  }
});

test('FEN changes recalculate normalized Top 5 without stale or zero-game rows', async ({ page }) => {
  await preparePage(page);
  await installDatabaseFixture(page, { delayMs: 250 });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/opening-database');
  await expect(page.locator('#odbStatsBody tr')).toHaveCount(5);
  expect(numericGames(await page.locator('#odbStatsBody .col-games').allTextContents())).toEqual([1200000, 950000, 320000, 210000, 95000]);
  await expect(page.locator('[data-move-uci="a2a3"], [data-move-uci="a2a4"]')).toHaveCount(0);

  const start = async () => {
    await page.locator('#odbStartBtn').click();
    await expect(page.locator('[data-move-uci="e2e4"]')).toBeVisible();
  };
  const play = async (uci, expectedFirst) => {
    await page.locator(`[data-move-uci="${uci}"]`).click();
    await expect(page.locator('#odbStatsBody [data-move-uci]').first()).toHaveAttribute('data-move-uci', expectedFirst);
    await expect(page.locator('#odbStatsBody')).not.toContainText('Loading continuation data');
    const counts = numericGames(await page.locator('#odbStatsBody .col-games').allTextContents());
    expect(counts.every(value => value > 0)).toBe(true);
    expect(counts).toEqual(counts.slice().sort((a, b) => b - a));
  };

  await page.locator('[data-move-uci="e2e4"]').click();
  await expect(page.locator('#odbStatsBody')).toContainText('Loading continuation data');
  await expect(page.locator('[data-move-uci="d2d4"]')).toHaveCount(0);
  await expect(page.locator('#odbStatsBody [data-move-uci]').first()).toHaveAttribute('data-move-uci', 'c7c5');
  await start();
  await play('d2d4', 'd7d5');
  await start();
  await play('g1f3', 'd7d5');
  await start();
  await play('e2e4', 'c7c5');
  await page.locator('[data-move-uci="e7e5"]').click();
  await expect(page.locator('#odbStatsBody [data-move-uci]').first()).toHaveAttribute('data-move-uci', 'g1f3');
  await play('g1f3', 'b8c6');
  await play('b8c6', 'f1b5');
});

test('failed requests terminate loading and Engine remains independently usable', async ({ page }) => {
  await preparePage(page);
  await installEngineStub(page);
  await installDatabaseFixture(page, { fail: true });
  await page.setViewportSize({ width: 430, height: 932 });
  await page.goto('/opening-database');

  await expect(page.locator('#odbLookupStatus')).toContainText('Database unavailable');
  await expect(page.locator('#odbStatsBody')).toContainText('Database unavailable');
  await expect(page.locator('#odbStatsBody')).not.toContainText('Loading continuation data');
  await expect(page.locator('#odbStatsBody [data-move-uci]')).toHaveCount(0);

  await page.locator('#odbSortEngineBtn').click();
  await expect.poll(() => page.evaluate(() => window.__engineDebug?.nextMoveEvalRunning), { timeout: 20_000 }).toBe(false);
  await expect(page.locator('#odbMoveArrows [data-move-uci]')).toHaveCount(3);
  await page.locator('#odbSortPopularityBtn').click();
  await expect(page.locator('#odbStatsBody')).toContainText('Database unavailable');
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
});

test('desktop keeps its two-column composition and canonical data behavior', async ({ page }) => {
  await preparePage(page);
  await installDatabaseFixture(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/opening-database');
  await expect(page.locator('#odbStatsBody tr')).toHaveCount(5);
  await expect(page.locator('#odbMobileDataRegion')).toBeHidden();
  const layout = await page.evaluate(() => {
    const board = document.querySelector('.openingdb-board-shell').getBoundingClientRect();
    const workspace = document.querySelector('.openingdb-workspace').getBoundingClientRect();
    return {
      boardRight: board.right,
      workspaceLeft: workspace.left,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
    };
  });
  expect(layout.boardRight).toBeLessThan(layout.workspaceLeft);
  expect(layout.overflow).toBeLessThanOrEqual(1);
});
