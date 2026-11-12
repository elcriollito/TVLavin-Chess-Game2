import { test, expect } from '@playwright/test';

const START_HASH = '66be37feb35e7d6a';
const AFTER_E4_HASH = 'fa6f7503caab4032';

const openingDbFixture = {
  [START_HASH]: {
    moves: [
      { uci: 'd2d4', san: 'd4', games: 800, w: 330, d: 300, l: 170 },
      { uci: 'b2b3', san: 'b3', games: 500, w: 190, d: 190, l: 120 },
      { uci: 'e2e4', san: 'e4', games: 1000, w: 410, d: 320, l: 270 },
      { uci: 'c2c4', san: 'c4', games: 600, w: 240, d: 210, l: 150 },
      { uci: 'g1f3', san: 'Nf3', games: 700, w: 280, d: 250, l: 170 }
    ]
  },
  [AFTER_E4_HASH]: {
    moves: [
      { uci: 'c7c5', san: 'c5', games: 700, w: 280, d: 230, l: 190 }
    ]
  }
};

const defaultPlan = [
  { pattern: '/8/4P3/8/', scoreType: 'cp', score: -50, delay: 40 },
  { pattern: '/8/3P4/8/', scoreType: 'cp', score: 80, delay: 140 },
  { pattern: '/8/8/5N2/', scoreType: 'cp', score: 20, delay: 30 },
  { pattern: '/8/2P5/8/', scoreType: 'cp', score: 10, delay: 30 },
  { pattern: '/8/1P6/P1PPPPPP/', scoreType: 'cp', score: 5, delay: 30 },
  { pattern: '/8/4p3/8/8/', scoreType: 'cp', score: -80, delay: 15 },
  { pattern: '/8/3p4/8/8/', scoreType: 'cp', score: 50, delay: 15 }
];

async function installDeterministicEvalClient(page, { plan = defaultPlan, ignoreCancellation = false } = {}) {
  const body = `(() => {
    const plan = ${JSON.stringify(plan)};
    const ignoreCancellation = ${JSON.stringify(ignoreCancellation)};
    window.__sortEvalStarts = [];
    window.__sortEvalClientCount = 0;
    const resolvePlan = (fen) => plan.find(item => String(fen || '').includes(item.pattern)) || {
      scoreType: 'cp', score: 0, delay: 10
    };
    class DeterministicStockfish19Client {
      constructor(options = {}) {
        this.owner = options.owner || 'opening-database';
        this.positionFen = '';
        this.generation = 0;
        this.lastStopReason = '';
        this.infoHandler = null;
        this.stateHandler = null;
        window.__sortEvalClientCount += 1;
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
        const result = resolvePlan(this.positionFen);
        const infoHandler = this.infoHandler;
        const stateHandler = this.stateHandler;
        const analyzedFen = this.positionFen;
        this.lastStopReason = '';
        window.__sortEvalStarts.push({ fen: analyzedFen, targetDepth, stopAtTarget });
        stateHandler?.(this.snapshot('analyzing'));
        setTimeout(() => {
          if (!ignoreCancellation && generation !== this.generation) return;
          infoHandler?.({
            depth: targetDepth,
            multipv: 1,
            scoreType: result.scoreType,
            score: result.score,
            scorePerspective: 'white',
            whiteMate: result.scoreType === 'mate' ? result.score : undefined,
            whiteScorePawns: result.scoreType === 'cp' ? result.score / 100 : undefined,
            pv: []
          });
          if (stopAtTarget) {
            this.lastStopReason = 'target-depth';
            stateHandler?.(this.snapshot('ready'));
          }
        }, Number(result.delay) || 0);
        return this.owner + ':' + generation;
      }
      stop(reason = 'requested') {
        if (!ignoreCancellation) this.generation += 1;
        this.lastStopReason = reason;
        this.stateHandler?.(this.snapshot('ready'));
      }
      terminate() { this.generation += 1; }
    }
    window.CaissaStockfish19LiteClient = DeterministicStockfish19Client;
    window.OpeningTrainerStockfish19Client = DeterministicStockfish19Client;
  })();`;
  await page.route('**/js/opening-trainer/stockfish19-client.js*', route => route.fulfill({
    status: 200,
    contentType: 'text/javascript',
    body
  }));
}

async function waitForEvaluationQueue(page) {
  await expect.poll(() => page.evaluate(() => window.__engineDebug?.nextMoveEvalRunning), {
    timeout: 20_000,
    intervals: [50, 100, 250]
  }).toBe(false);
}

async function loadBlackStartingPosition(page) {
  await page.locator('#odbFenToggleBtn').click();
  await page.locator('#odbFenInput').fill('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1');
  await page.locator('#odbApplyFenBtn').click();
  await expect(page.locator('#odbTurnPly')).toContainText('Black to move');
  await expect(page.locator('#odbStatsBody .moveSan')).toHaveCount(20);
}

test.beforeEach(async ({ page }) => {
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
      activeVersion: 'v23_sort_test',
      baseUrl: 'https://downloads.caissa-chess.org/openingdb/shards/v23_sort_test',
      generatedAt: '2026-11-07T12:00:00.000Z',
      maxPlies: 60
    })
  }));
  await page.route('https://downloads.caissa-chess.org/openingdb/shards/v23_sort_test/*.json', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify(openingDbFixture)
  }));
});

test('Popularity and Engine selector is visible while Popularity stays database-first with scores enabled', async ({ page }) => {
  await installDeterministicEvalClient(page);
  await page.goto('/opening-database');

  const sortGroup = page.getByRole('group', { name: 'Explorer sort order' });
  await expect(sortGroup).toBeVisible();
  await expect(page.locator('#odbSortPopularityBtn')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#odbSortEngineBtn')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#odbQuickEvalToggle')).toBeVisible();
  await expect(page.locator('#odbQuickEvalMode')).toHaveValue('fast');
  await expect(page.getByText('All legal', { exact: true })).toHaveCount(0);
  await expect(page.locator('#odbStatsBody .moveSan')).toHaveText(['e4', 'd4', 'Nf3', 'c4', 'b3']);
  await expect(page.locator('#odbStatsBody .col-games')).toHaveText(['1,000', '800', '700', '600', '500']);
  await expect(page.locator('#odbStatsBody td.col-engine').first()).toHaveAttribute('aria-label', 'Not evaluated');

  await page.locator('#odbQuickEvalToggle').check();
  await waitForEvaluationQueue(page);
  await expect(page.locator('#odbStatsBody .moveSan')).toHaveText(['e4', 'd4', 'Nf3', 'c4', 'b3']);
  await expect(page.locator('#odbStatsBody td.col-engine')).toHaveText(['-0.50', '+0.80', '+0.20', '+0.10', '+0.05']);
  await expect(page.locator('#odbSortPopularityBtn')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#odbExplorerSortStatus')).toContainText('without changing database frequency order');
});

test('Engine mode reorders valid White evaluations as they arrive, preserves focus, and plays the reordered move', async ({ page }) => {
  await installDeterministicEvalClient(page);
  await page.goto('/opening-database');
  await page.locator('#odbSortEngineBtn').click();

  await expect(page.locator('#odbQuickEvalToggle')).toBeChecked();
  await expect(page.locator('#odbSortEngineBtn')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#odbExplorerSortStatus')).toContainText('incomplete');
  await expect(page.locator('#odbStatsBody td.col-engine').first()).toHaveAttribute('aria-label', /pending|Engine evaluation/);
  await expect.poll(async () => page.locator('tr:has([data-move-uci="e2e4"]) td.col-engine').textContent()).toBe('-0.50');
  await page.locator('[data-move-uci="e2e4"]').focus();

  await expect(page.locator('#odbStatsBody .moveSan').first()).toHaveText('d4');
  await expect(page.locator('[data-move-uci="e2e4"]')).toBeFocused();
  await waitForEvaluationQueue(page);
  await expect(page.locator('#odbStatsBody .moveSan')).toHaveText(['d4', 'Nf3', 'c4', 'b3', 'e4']);
  await page.locator('#odbStatsBody [data-move-index="0"]').click();
  await expect(page.locator('#odbCurrentLine')).toContainText('1.d4');
  await expect(page.locator('#openingDbBoard [data-square="d4"] .piece-417db')).toHaveAttribute('data-piece', 'wP');
});

test('Engine mode sorts lower White-perspective evaluations first for Black to move', async ({ page }) => {
  await installDeterministicEvalClient(page);
  await page.goto('/opening-database');
  await loadBlackStartingPosition(page);
  await page.locator('#odbSortEngineBtn').click();
  await waitForEvaluationQueue(page);

  await expect(page.locator('#odbStatsBody .moveSan').first()).toHaveText('e5');
  const e5Row = page.locator('tr:has([data-move-uci="e7e5"])');
  const d5Row = page.locator('tr:has([data-move-uci="d7d5"])');
  await expect(e5Row.locator('td.col-engine')).toHaveText('-0.80');
  await expect(d5Row.locator('td.col-engine')).toHaveText('+0.50');
  await expect(page.locator('#odbExplorerSortStatus')).toContainText('Fast 10-candidate coverage');
});

test('Engine mode ranks winning and losing mate scores by mate distance', async ({ page }) => {
  await installDeterministicEvalClient(page, {
    plan: [
      { pattern: '/8/4P3/8/', scoreType: 'mate', score: 3, delay: 10 },
      { pattern: '/8/3P4/8/', scoreType: 'mate', score: 5, delay: 10 },
      { pattern: '/8/8/5N2/', scoreType: 'mate', score: -3, delay: 10 },
      { pattern: '/8/2P5/8/', scoreType: 'cp', score: 9000, delay: 10 },
      { pattern: '/8/1P6/P1PPPPPP/', scoreType: 'mate', score: -5, delay: 10 }
    ]
  });
  await page.goto('/opening-database');
  await page.locator('#odbSortEngineBtn').click();
  await waitForEvaluationQueue(page);

  await expect(page.locator('#odbStatsBody .moveSan')).toHaveText(['e4', 'd4', 'c4', 'b3', 'Nf3']);
  await expect(page.locator('#odbStatsBody td.col-engine')).toHaveText(['M3', 'M5', '+90.00', '-M5', '-M3']);
});

test('position changes invalidate stale evaluation results', async ({ page }) => {
  await installDeterministicEvalClient(page, {
    ignoreCancellation: true,
    plan: [
      { pattern: '/8/4P3/8/', scoreType: 'cp', score: -50, delay: 450 },
      { pattern: '/8/3P4/8/', scoreType: 'cp', score: 80, delay: 450 },
      { pattern: '/8/2p5/8/4P3/', scoreType: 'cp', score: 10, delay: 20 }
    ]
  });
  await page.goto('/opening-database');
  await page.locator('#odbSortEngineBtn').click();
  await expect(page.locator('[data-move-uci="e2e4"]')).toBeVisible();
  await page.locator('[data-move-uci="e2e4"]').click();
  await expect(page.locator('#odbCurrentLine')).toContainText('1.e4');
  await expect(page.locator('#odbStatsBody .moveSan')).toHaveText(['c5']);
  await page.waitForTimeout(650);

  await expect(page.locator('#odbStatsBody .moveSan')).toHaveText(['c5']);
  await expect(page.locator('#odbStatsBody td.col-engine')).not.toHaveText('-0.50');
  await expect(page.locator('[data-move-uci="e2e4"]')).toHaveCount(0);
});

test('Fast and Pro retain 10 and 20 candidate coverage with one reusable evaluation client', async ({ page }) => {
  await page.route('https://downloads.caissa-chess.org/openingdb/shards/v23_sort_test/*.json', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({})
  }));
  await installDeterministicEvalClient(page, { plan: [] });
  await page.goto('/opening-database');
  await expect(page.locator('#odbStatsBody .moveSan')).toHaveCount(20);
  await page.locator('#odbSortEngineBtn').click();
  await waitForEvaluationQueue(page);
  await expect.poll(() => page.evaluate(() => window.__sortEvalStarts.length)).toBe(10);

  await page.evaluate(() => { window.__sortEvalStarts.length = 0; });
  await page.locator('#odbQuickEvalMode').selectOption('pro');
  await waitForEvaluationQueue(page);
  await expect.poll(() => page.evaluate(() => window.__sortEvalStarts.length)).toBe(20);
  await expect.poll(() => page.evaluate(() => window.__sortEvalClientCount)).toBe(1);
});

test('sorting toolbar remains operable and within the viewport on desktop and mobile', async ({ page }) => {
  await installDeterministicEvalClient(page);
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await page.goto('/opening-database');
    await expect(page.getByRole('group', { name: 'Explorer sort order' })).toBeVisible();
    await expect(page.locator('#odbSortPopularityBtn')).toBeEnabled();
    await expect(page.locator('#odbSortEngineBtn')).toBeEnabled();
    await expect(page.locator('#odbQuickEvalToggle')).toBeEnabled();
    await expect(page.locator('#odbQuickEvalMode')).toBeEnabled();
    const layout = await page.locator('.openingdb-moves-toolbar').evaluate((toolbar) => {
      const rect = toolbar.getBoundingClientRect();
      const controls = Array.from(toolbar.querySelectorAll('button, input, select')).map((control) => {
        const controlRect = control.getBoundingClientRect();
        return { left: controlRect.left, right: controlRect.right, width: controlRect.width, height: controlRect.height };
      }).filter(control => control.width > 0 && control.height > 0);
      return {
        toolbar: { left: rect.left, right: rect.right },
        controls,
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
      };
    });
    expect(layout.overflow).toBeLessThanOrEqual(1);
    expect(layout.controls.every(control => control.left >= layout.toolbar.left - 1 && control.right <= layout.toolbar.right + 1)).toBe(true);
    await page.locator('#odbSortPopularityBtn').focus();
    await expect(page.locator('#odbSortPopularityBtn')).toBeFocused();
    await page.locator('#odbSortEngineBtn').focus();
    await expect(page.locator('#odbSortEngineBtn')).toBeFocused();
  }
});
