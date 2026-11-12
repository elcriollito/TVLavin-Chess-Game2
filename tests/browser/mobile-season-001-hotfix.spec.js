import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import { instrumentPlay } from '../play/playwright-helpers.js';

const START_HASH = '66be37feb35e7d6a';
const AFTER_E4_HASH = 'fa6f7503caab4032';
const fixture = {
  [START_HASH]: {
    moves: [
      { uci: 'g1f3', san: 'Nf3', games: 800, w: 300, d: 280, l: 220 },
      { uci: 'a2a3', san: 'a3', games: 0, w: 0, d: 0, l: 0 },
      { uci: 'a2a4', san: 'a4', games: 0, w: 0, d: 0, l: 0 },
      { uci: 'e2e4', san: 'e4', games: 1000, w: 400, d: 340, l: 260 },
      { uci: 'g2g3', san: 'g3', games: 500, w: 190, d: 170, l: 140 },
      { uci: 'd2d4', san: 'd4', games: 900, w: 360, d: 300, l: 240 },
      { uci: 'b2b3', san: 'b3', games: 600, w: 230, d: 210, l: 160 },
      { uci: 'c2c4', san: 'c4', games: 700, w: 270, d: 240, l: 190 }
    ]
  },
  [AFTER_E4_HASH]: {
    moves: [
      { uci: 'e7e6', san: 'e6', games: 700, w: 270, d: 240, l: 190 },
      { uci: 'c7c5', san: 'c5', games: 900, w: 350, d: 300, l: 250 },
      { uci: 'g7g6', san: 'g6', games: 0, w: 0, d: 0, l: 0 },
      { uci: 'e7e5', san: 'e5', games: 800, w: 310, d: 270, l: 220 },
      { uci: 'd7d6', san: 'd6', games: 0, w: 0, d: 0, l: 0 },
      { uci: 'c7c6', san: 'c6', games: 0, w: 0, d: 0, l: 0 }
    ]
  }
};
const capture = process.env.CAISSA_CAPTURE_MOBILE_HOME_S001_HOTFIX === '1';
const evidenceDir = path.join('docs', 'mobile-home-season-001', 'hotfix', 'screenshots');

async function installOpeningFixture(page) {
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
  await page.route('https://downloads.caissa-chess.org/openingdb/manifest.json', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({
      activeVersion: 's001_hotfix_test',
      baseUrl: 'https://downloads.caissa-chess.org/openingdb/shards/s001_hotfix_test',
      generatedAt: '2026-11-11T12:00:00.000Z',
      maxPlies: 60
    })
  }));
  await page.route('https://downloads.caissa-chess.org/openingdb/shards/s001_hotfix_test/*.json', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify(fixture)
  }));
  const client = `(() => {
    class HotfixStockfishClient {
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
        const score = this.fen.includes('3P4') ? 80 : this.fen.includes('4P3') ? -50 : this.fen.includes('5N2') ? 20 : 10;
        setTimeout(() => {
          if (generation !== this.generation) return;
          this.infoHandler?.({ depth: targetDepth, multipv: 1, scoreType: 'cp', score, scorePerspective: 'white', whiteScorePawns: score / 100, pv: [] });
          this.stateHandler?.({ state: 'ready', lastStopReason: 'target-depth' });
        }, 8);
        return 'hotfix:' + generation;
      }
      stop() { this.generation += 1; }
      terminate() { this.generation += 1; }
    }
    window.CaissaStockfish19LiteClient = HotfixStockfishClient;
    window.OpeningTrainerStockfish19Client = HotfixStockfishClient;
  })();`;
  await page.route('**/js/opening-trainer/stockfish19-client.js*', route => route.fulfill({
    status: 200,
    contentType: 'text/javascript',
    body: client
  }));
}

function expectDescending(values) {
  const numbers = values.map(value => Number(String(value).replaceAll(',', '')));
  expect(numbers).toEqual(numbers.slice().sort((a, b) => b - a));
}

for (const viewport of [{ width: 390, height: 844 }, { width: 430, height: 932 }]) {
  test(`Opening Explorer is board-first and top-five at ${viewport.width}px`, async ({ page }) => {
    await installOpeningFixture(page);
    await page.setViewportSize(viewport);
    await page.goto('/opening-database');

    await expect(page.locator('.openingdb-page-intro')).toBeHidden();
    await expect(page.locator('.caissa-standalone-mobile-toggle')).toBeHidden();
    await expect(page.locator('#odbSortPopularityBtn')).toHaveText('Popular Moves');
    await expect(page.locator('#odbStatsBody tr')).toHaveCount(5);
    await expect(page.locator('#odbStatsBody [data-move-uci="a2a3"], #odbStatsBody [data-move-uci="a2a4"]')).toHaveCount(0);
    expectDescending(await page.locator('#odbStatsBody .col-games').allTextContents());
    const mobileHeaderBottom = (await page.locator('[data-caissa-mobile2-destination-header]').boundingBox()).y
      + (await page.locator('[data-caissa-mobile2-destination-header]').boundingBox()).height;
    const openingBoardTop = (await page.locator('.openingdb-board-shell').boundingBox()).y;
    expect(openingBoardTop).toBeGreaterThanOrEqual(mobileHeaderBottom);
    expect(openingBoardTop).toBeLessThan(mobileHeaderBottom + 20);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);

    const hierarchy = await page.evaluate(() => {
      const rect = (selector) => {
        const box = document.querySelector(selector).getBoundingClientRect();
        return { top: box.top, bottom: box.bottom };
      };
      return {
        board: rect('.openingdb-board-shell'),
        metadata: rect('.openingdb-board-context'),
        selector: rect('.openingdb-sort-selector'),
        firstRow: rect('#odbStatsBody tr'),
        table: rect('.openingdb-table-wrap'),
        opening: rect('.openingdb-opening-context'),
        tabs: rect('.openingdb-tabs'),
        analyze: rect('#odbAnalyzeInCaissaBtn')
      };
    });
    expect(hierarchy.board.bottom).toBeLessThanOrEqual(hierarchy.metadata.top + 1);
    expect(hierarchy.selector.top).toBeGreaterThanOrEqual(hierarchy.metadata.bottom - 1);
    expect(hierarchy.selector.top - hierarchy.metadata.bottom).toBeLessThanOrEqual(24);
    expect(hierarchy.selector.bottom).toBeLessThan(hierarchy.firstRow.top);
    expect(hierarchy.firstRow.bottom).toBeLessThan(viewport.height);
    expect(hierarchy.table.bottom).toBeLessThan(hierarchy.opening.top);
    expect(hierarchy.opening.bottom).toBeLessThanOrEqual(hierarchy.tabs.top + 1);
    expect(hierarchy.tabs.bottom).toBeLessThan(hierarchy.analyze.top);

    if (capture) {
      fs.mkdirSync(evidenceDir, { recursive: true });
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: path.join(evidenceDir, `opening-explorer-${viewport.width}.png`), fullPage: true });
    }

    await page.locator('[data-move-uci="e2e4"]').click();
    await expect(page.locator('#odbCurrentLine')).toContainText('1.e4');
    await expect(page.locator('#odbStatsBody tr')).toHaveCount(3);
    const afterMoveGameCounts = await page.locator('#odbStatsBody .col-games').allTextContents();
    expect(afterMoveGameCounts.map(value => Number(value.replaceAll(',', ''))).every(value => value > 0)).toBe(true);
    expectDescending(afterMoveGameCounts);

    const boardTop = (await page.locator('.openingdb-board-shell').boundingBox()).y;
    await page.locator('#odbSortEngineBtn').click();
    await expect.poll(() => page.evaluate(() => window.__engineDebug?.nextMoveEvalRunning), { timeout: 20_000 }).toBe(false);
    const arrows = page.locator('#odbMoveArrows [data-move-uci]');
    await expect(arrows).toHaveCount(3);
    await expect(page.locator('#odbMoveArrows .is-primary')).toHaveCount(1);
    const primaryMove = await page.locator('#odbMoveArrows .is-primary').getAttribute('data-move-uci');
    const firstMove = await page.locator('#odbStatsBody [data-move-uci]').first().getAttribute('data-move-uci');
    expect(primaryMove).toBe(firstMove);
    await expect(page.locator('#odbQuickEvalToggle')).toBeHidden();
    expect(Math.abs((await page.locator('.openingdb-board-shell').boundingBox()).y - boardTop)).toBeLessThanOrEqual(1);

    if (capture) {
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: path.join(evidenceDir, `opening-explorer-engine-${viewport.width}.png`), fullPage: true });
    }
  });
}

test('Opening Explorer restores the unchanged desktop composition after a mobile viewport', async ({ page }) => {
  await installOpeningFixture(page);
  await page.setViewportSize({ width: 430, height: 932 });
  await page.goto('/opening-database');
  await expect(page.locator('#odbMobileDataRegion .openingdb-sort-selector')).toBeVisible();
  await expect(page.locator('#odbMobileDataRegion .openingdb-table-wrap')).toBeVisible();

  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.locator('#odbMobileDataRegion')).toBeHidden();
  await expect(page.locator('#odbExplorerPanel .openingdb-moves-toolbar .openingdb-sort-selector')).toBeVisible();
  await expect(page.locator('#odbExplorerPanel > .openingdb-table-wrap')).toBeVisible();
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

for (const viewport of [{ width: 390, height: 844 }, { width: 430, height: 932 }]) {
  test(`Analyzer keeps its board anchor and canonical identity at ${viewport.width}px`, async ({ page }) => {
    await instrumentPlay(page, {
      bestMove: 'e2e4',
      candidateMoves: ['e2e4 e7e5 g1f3', 'd2d4 d7d5 c2c4', 'g1f3 d7d5 d2d4'],
      cp: 48,
      depth: 10,
      delayMs: 5,
      continuousDepths: [4, 8, 12],
      continuousDepthDelayMs: 40
    });
    await page.setViewportSize(viewport);
    await page.goto('/analyze');
    const board = page.locator('#analyzeChessboard');
    await expect(board).toBeVisible();
    await expect(page).toHaveTitle('Analyze | CAISSA Chess');
    await expect(page.locator('body')).toHaveAttribute('data-caissa-section', 'analyze');
    await expect(page.locator('#mobileNavToggle')).toBeHidden();
    await expect(page.locator('#mobileActionMenu')).toBeHidden();
    await expect(page.getByRole('button', { name: 'Menu' })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    const initialTop = (await board.boundingBox()).y;

    expect(await page.evaluate(() => window.AnalyzeSection.playStudyMove('e2', 'e4'))).toBe(true);
    await expect(page.locator('#analyzeMoveList')).toContainText('e4');
    const afterMoveTop = (await board.boundingBox()).y;
    expect(Math.abs(afterMoveTop - initialTop)).toBeLessThanOrEqual(1);

    await page.locator('#analyzeEngineToggle').click();
    await expect(page.locator('.caissa-analyze-v2__engine-line--primary')).toBeVisible();
    const afterEngineTop = (await board.boundingBox()).y;
    expect(Math.abs(afterEngineTop - initialTop)).toBeLessThanOrEqual(1);

    if (capture) {
      fs.mkdirSync(evidenceDir, { recursive: true });
      await page.screenshot({ path: path.join(evidenceDir, `analyzer-${viewport.width}.png`), fullPage: true });
    }
  });
}

for (const viewport of [{ width: 390, height: 844 }, { width: 430, height: 932 }]) {
  test(`Lichess TV compact evidence at ${viewport.width}px`, async ({ page }) => {
    await page.route('https://lichess.org/tv/frame?theme=brown&bg=dark', route => route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: '<!doctype html><html><body style="margin:0"><div style="width:100%;aspect-ratio:1;background:#b98b62"></div></body></html>'
    }));
    await page.setViewportSize(viewport);
    await page.goto('/watch/lichess-tv');
    await expect(page.locator('[data-lichess-tv-shell]')).toHaveClass(/is-document-loaded/);
    await expect(page.locator('.lichess-tv-disclosure-copy')).toBeHidden();
    const mobileHeader = await page.locator('[data-caissa-mobile2-destination-header]').boundingBox();
    expect((await page.locator('[data-lichess-tv-shell]').boundingBox()).y)
      .toBeLessThan(mobileHeader.y + mobileHeader.height + 70);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    if (capture) {
      fs.mkdirSync(evidenceDir, { recursive: true });
      await page.screenshot({ path: path.join(evidenceDir, `lichess-tv-${viewport.width}.png`), fullPage: true });
    }
  });
}
