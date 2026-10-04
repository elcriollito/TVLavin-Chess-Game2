import { test, expect } from '@playwright/test';

const openingDbFixture = {
  '66be37feb35e7d6a': {
    moves: [{ uci: 'e2e4', san: 'e4', games: 100, w: 40, d: 30, l: 30 }]
  },
  'fa6f7503caab4032': {
    moves: [{ uci: 'c7c5', san: 'c5', games: 90, w: 40, d: 30, l: 30 }]
  }
};

async function installOpeningDbFixture(page) {
  await page.route('https://downloads.caissa-chess.org/openingdb/manifest.json', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({
      activeVersion: 'browser_test',
      baseUrl: 'https://downloads.caissa-chess.org/openingdb/shards/browser_test',
      maxPlies: 60
    })
  }));
  await page.route('https://downloads.caissa-chess.org/openingdb/shards/browser_test/*.json', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify(openingDbFixture)
  }));
}

async function openLab(page) {
  await installOpeningDbFixture(page);
  await page.addInitScript(() => localStorage.setItem('caissa_onboarding_completed', 'true'));
  await page.goto('/opening-database?quiet-drag-lab=1');
  await expect(page.locator('#openingDbBoard .board-b72b1')).toHaveAttribute(
    'data-caissa-legacy-quiet-drag-enabled', 'true');
  await expect(page.locator('#openingDbBoard .piece-417db')).toHaveCount(32);
}

async function point(page, square) {
  const target = page.locator(`#openingDbBoard .square-${square}`);
  await target.scrollIntoViewIfNeeded();
  return target.evaluate((node) => {
    const rect = node.getBoundingClientRect();
    return { x: rect.left + rect.width * 0.37, y: rect.top + rect.height * 0.41 };
  });
}

async function chromiumMetrics(session) {
  const result = await session.send('Performance.getMetrics');
  return Object.fromEntries(result.metrics.map((metric) => [metric.name, metric.value]));
}

async function runGesture(page, session, mode) {
  await page.locator('.caissa-legacy-drag-qa').getByRole('button', {
    name: mode === 'quiet' ? 'Quiet Drag' : 'Legacy Drag'
  }).click();
  await page.getByRole('button', { name: 'Start Position' }).click();
  const source = await point(page, 'e2');
  const target = await point(page, 'e4');
  const before = await page.evaluate(() => window.__openingDbQuietDrag.getSnapshot());

  await page.evaluate(({ selectedMode, sourcePoint }) => {
    window.__openingDbBench = {
      pointerEvents: 0,
      geometryReads: 0,
      positionWrites: 0,
      animateCalls: 0,
      movementActive: false,
      frameTimes: [],
      running: false,
      longTasks: []
    };
    const bench = window.__openingDbBench;
    bench.inputEventType = selectedMode === 'legacy' ? 'mousemove' : 'pointermove';
    bench.pointerHandler = () => {
      if (bench.movementActive) bench.pointerEvents += 1;
    };
    window.addEventListener(bench.inputEventType, bench.pointerHandler, { capture: true });
    bench.restorePointer = () => window.removeEventListener(
      bench.inputEventType, bench.pointerHandler, { capture: true });
    const originalRect = Element.prototype.getBoundingClientRect;
    bench.restoreRect = () => { Element.prototype.getBoundingClientRect = originalRect; };
    Element.prototype.getBoundingClientRect = function (...args) {
      if (bench.movementActive) bench.geometryReads += 1;
      return originalRect.apply(this, args);
    };
    const jquery = window.jQuery;
    const animate = jquery.fn.animate;
    const css = jquery.fn.css;
    bench.restoreJquery = () => { jquery.fn.animate = animate; jquery.fn.css = css; };
    jquery.fn.animate = function (...args) {
      bench.animateCalls += 1;
      return animate.apply(this, args);
    };
    jquery.fn.css = function (name) {
      const keys = name && typeof name === 'object' ? Object.keys(name) : [name];
      const write = (name && typeof name === 'object') || arguments.length > 1;
      if (write && keys.some((key) => key === 'left' || key === 'top')) bench.positionWrites += 1;
      return css.apply(this, arguments);
    };
    bench.observer = typeof PerformanceObserver === 'function'
      ? new PerformanceObserver((list) => bench.longTasks.push(...list.getEntries().map((entry) => ({
        startTime: entry.startTime,
        duration: entry.duration
      }))))
      : null;
    try { bench.observer?.observe({ type: 'longtask' }); } catch (_) {}
    const piece = document.querySelector('#openingDbBoard .square-e2 .piece-417db').getBoundingClientRect();
    bench.grab = { x: sourcePoint.x - piece.left, y: sourcePoint.y - piece.top };
  }, { selectedMode: mode, sourcePoint: source });

  await page.mouse.move(source.x, source.y);
  await page.mouse.down();
  const performanceBefore = await chromiumMetrics(session);
  await page.evaluate(() => {
    const bench = window.__openingDbBench;
    bench.movementActive = true;
    bench.startTime = performance.now();
    bench.running = true;
    const frame = (time) => {
      if (!bench.running) return;
      bench.frameTimes.push(time);
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });
  for (let index = 1; index <= 24; index += 1) {
    const ratio = index / 24;
    await page.mouse.move(
      source.x + (target.x - source.x) * ratio,
      source.y + (target.y - source.y) * ratio
    );
    await page.waitForTimeout(5);
  }
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const during = await page.evaluate(() => window.__openingDbQuietDrag.getSnapshot());
  const performanceAfter = await chromiumMetrics(session);
  await page.evaluate(() => {
    const bench = window.__openingDbBench;
    bench.movementActive = false;
    bench.running = false;
    bench.movementEnd = performance.now();
  });
  await page.evaluate(({ selectedMode, targetPoint }) => {
    const bench = window.__openingDbBench;
    const mover = selectedMode === 'quiet'
      ? document.querySelector('#openingDbBoard .caissa-legacy-quiet-drag-piece')
      : [...document.querySelectorAll('body > .piece-417db')]
        .find((node) => getComputedStyle(node).display !== 'none');
    const rect = mover?.getBoundingClientRect();
    bench.cursorLagPx = rect ? Math.hypot(
      targetPoint.x - rect.left - bench.grab.x,
      targetPoint.y - rect.top - bench.grab.y
    ) : null;
  }, { selectedMode: mode, targetPoint: target });
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => window.__openingDbQuietDrag.getSnapshot().history.length)).toBe(1);
  const after = await page.evaluate(() => window.__openingDbQuietDrag.getSnapshot());

  return page.evaluate(({ initial, moving, finished, browserBefore, browserAfter, selectedMode }) => {
    const bench = window.__openingDbBench;
    bench.observer?.disconnect();
    bench.restorePointer();
    bench.restoreRect();
    bench.restoreJquery();
    const intervals = bench.frameTimes.slice(1)
      .map((time, index) => time - bench.frameTimes[index])
      .sort((a, b) => a - b);
    const p95 = intervals.length
      ? intervals[Math.min(intervals.length - 1, Math.floor(intervals.length * 0.95))]
      : 0;
    const result = {
      mode: selectedMode,
      pointerEvents: bench.pointerEvents,
      visualWrites: selectedMode === 'quiet'
        ? finished.adapter.movementVisualWrites - initial.adapter.movementVisualWrites
        : bench.positionWrites,
      framesRequested: selectedMode === 'quiet'
        ? finished.adapter.controller.scheduler.framesRequested - initial.adapter.controller.scheduler.framesRequested
        : null,
      geometryReads: bench.geometryReads,
      leftTopWrites: bench.positionWrites,
      jqueryAnimateCalls: bench.animateCalls,
      layouts: Math.max(0, (browserAfter.LayoutCount || 0) - (browserBefore.LayoutCount || 0)),
      paints: Math.max(0, (browserAfter.PaintCount || 0) - (browserBefore.PaintCount || 0)),
      styleRecalculations: Math.max(0, (browserAfter.RecalcStyleCount || 0) - (browserBefore.RecalcStyleCount || 0)),
      movementCpuMs: Math.max(0, ((browserAfter.ScriptDuration || 0) - (browserBefore.ScriptDuration || 0)) * 1000),
      pipelineMs: bench.movementEnd - bench.startTime,
      frameP95Ms: p95,
      cursorLagPx: bench.cursorLagPx,
      longTasks: bench.longTasks.filter((entry) => (
        entry.startTime >= bench.startTime && entry.startTime <= bench.movementEnd
      )).length,
      chessMovesDuringPointerMove: moving.interaction.boardMovesApplied - initial.interaction.boardMovesApplied,
      openingQueriesDuringPointerMove: moving.positionRequestId - initial.positionRequestId,
      chessMovesAfterDrop: finished.interaction.boardMovesApplied - initial.interaction.boardMovesApplied,
      openingQueriesAfterDrop: finished.positionRequestId - initial.positionRequestId
    };
    delete window.__openingDbBench;
    return result;
  }, {
    initial: before,
    moving: during,
    finished: after,
    browserBefore: performanceBefore,
    browserAfter: performanceAfter,
    selectedMode: mode
  });
}

test('Legacy versus Quiet benchmark satisfies state and movement contracts', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Chromium CDP metrics are required for this benchmark.');
  await openLab(page);
  const session = await page.context().newCDPSession(page);
  await session.send('Performance.enable');
  const legacy = await runGesture(page, session, 'legacy');
  const quiet = await runGesture(page, session, 'quiet');
  console.log('OPENING_DATABASE_QUIET_DRAG_BENCHMARK', JSON.stringify({ legacy, quiet }));
  expect(legacy.pointerEvents).toBeGreaterThan(0);
  expect(quiet.pointerEvents).toBeGreaterThan(0);
  expect(quiet.geometryReads).toBe(0);
  expect(quiet.leftTopWrites).toBe(0);
  expect(quiet.jqueryAnimateCalls).toBe(0);
  expect(quiet.visualWrites).toBeLessThanOrEqual(quiet.framesRequested);
  expect(quiet.longTasks).toBe(0);
  expect(quiet.chessMovesDuringPointerMove).toBe(0);
  expect(quiet.openingQueriesDuringPointerMove).toBe(0);
  expect(quiet.chessMovesAfterDrop).toBe(1);
  expect(quiet.openingQueriesAfterDrop).toBe(1);
});
