import { test, expect } from '@playwright/test';

async function openLab(page) {
  await page.addInitScript(() => localStorage.setItem('caissa_onboarding_completed', 'true'));
  await page.goto('/arena?setup-quiet-drag-lab=1');
  await expect(page.locator('#arenaSetupBoard .board-b72b1')).toHaveAttribute(
    'data-caissa-legacy-quiet-drag-enabled', 'true');
}

async function point(page, square) {
  return page.locator(`#arenaSetupBoard .square-${square}`).evaluate(node => {
    const rect = node.getBoundingClientRect();
    return { x: rect.left + rect.width * 0.37, y: rect.top + rect.height * 0.41 };
  });
}

async function gesture(page, mode) {
  await page.locator('.caissa-legacy-drag-qa').getByRole('button', {
    name: mode === 'quiet' ? 'Quiet Drag' : 'Legacy Drag'
  }).click();
  await page.evaluate(() => window.CaissaArena.resetManualSetup());
  const source = await point(page, 'e2');
  const target = await point(page, 'e5');
  const before = await page.evaluate(() => window.CaissaArena.getSetupQuietDragSnapshot().adapter);
  await page.evaluate(() => {
    const root = document.querySelector('#arenaSetupBoard .board-b72b1');
    const originalRect = Element.prototype.getBoundingClientRect;
    const jquery = window.jQuery;
    const animate = jquery.fn.animate;
    const css = jquery.fn.css;
    window.__dragBench = { active: false, pointerEvents: 0, geometryReads: 0, leftTopWrites: 0, animateCalls: 0 };
    window.__dragBench.pointer = () => { if (window.__dragBench.active) window.__dragBench.pointerEvents += 1; };
    root.addEventListener('pointermove', window.__dragBench.pointer, true);
    Element.prototype.getBoundingClientRect = function (...args) {
      if (window.__dragBench.active) window.__dragBench.geometryReads += 1;
      return originalRect.apply(this, args);
    };
    jquery.fn.animate = function (...args) {
      window.__dragBench.animateCalls += 1;
      return animate.apply(this, args);
    };
    jquery.fn.css = function (name) {
      const keys = name && typeof name === 'object' ? Object.keys(name) : [name];
      const write = (name && typeof name === 'object') || arguments.length > 1;
      if (window.__dragBench.active && write && keys.some(key => key === 'left' || key === 'top')) {
        window.__dragBench.leftTopWrites += 1;
      }
      return css.apply(this, arguments);
    };
    window.__dragBench.restore = () => {
      root.removeEventListener('pointermove', window.__dragBench.pointer, true);
      Element.prototype.getBoundingClientRect = originalRect;
      jquery.fn.animate = animate;
      jquery.fn.css = css;
    };
  });
  await page.mouse.move(source.x, source.y);
  await page.mouse.down();
  await page.evaluate(() => { window.__dragBench.active = true; });
  for (let index = 1; index <= 24; index += 1) {
    const ratio = index / 24;
    await page.mouse.move(source.x + (target.x - source.x) * ratio, source.y + (target.y - source.y) * ratio);
  }
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.evaluate(() => { window.__dragBench.active = false; });
  await page.mouse.up();
  await page.waitForTimeout(80);
  const after = await page.evaluate(() => window.CaissaArena.getSetupQuietDragSnapshot().adapter);
  return page.evaluate(({ initial, final, selectedMode }) => {
    const bench = window.__dragBench;
    bench.restore();
    return {
      mode: selectedMode,
      pointerEvents: bench.pointerEvents,
      geometryReads: bench.geometryReads,
      leftTopWrites: bench.leftTopWrites,
      animateCalls: bench.animateCalls,
      visualWrites: final.movementVisualWrites - initial.movementVisualWrites,
      framesRequested: final.controller.scheduler.framesRequested - initial.controller.scheduler.framesRequested,
      pendingFrame: final.controller.scheduler.pendingFrame
    };
  }, { initial: before, final: after, selectedMode: mode });
}

test('Legacy/Quiet lab proves the rAF transform hot path', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'The repeatable A/B performance probe is certified in Chromium.');
  await openLab(page);
  const legacy = await gesture(page, 'legacy');
  const quiet = await gesture(page, 'quiet');
  console.log('ARENA_SETUP_QUIET_DRAG_BENCHMARK', JSON.stringify({ legacy, quiet }));
  expect(legacy.pointerEvents).toBeGreaterThan(0);
  expect(quiet.pointerEvents).toBeGreaterThan(0);
  expect(quiet.geometryReads).toBe(0);
  expect(quiet.leftTopWrites).toBe(0);
  expect(quiet.animateCalls).toBe(0);
  expect(quiet.visualWrites).toBeLessThanOrEqual(quiet.framesRequested);
  expect(quiet.pendingFrame).toBe(false);
});
