import { test, expect } from '@playwright/test';

async function openSetupLab(page) {
  await page.addInitScript(() => localStorage.setItem('caissa_onboarding_completed', 'true'));
  await page.goto('/arena?setup-quiet-drag-lab=1');
  await expect(page.locator('body')).toHaveAttribute('data-caissa-surface', 'arena');
  await expect(page.locator('#arenaSetupModal')).toHaveClass(/show/);
  await expect(page.locator('#arenaSetupBoard .board-b72b1')).toHaveAttribute(
    'data-caissa-legacy-quiet-drag-enabled', 'true');
  await expect(page.locator('#arenaSetupBoard .piece-417db')).toHaveCount(32);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function point(page, square, x = 0.37, y = 0.41) {
  return page.locator(`#arenaSetupBoard .square-${square}`).evaluate((node, ratio) => {
    const rect = node.getBoundingClientRect();
    return { x: rect.left + rect.width * ratio.x, y: rect.top + rect.height * ratio.y };
  }, { x, y });
}

async function drag(page, from, to, steps = 10) {
  const source = await point(page, from);
  const target = await point(page, to);
  await page.mouse.move(source.x, source.y);
  await page.mouse.down();
  await page.mouse.move(target.x, target.y, { steps });
  await page.mouse.up();
}

test('Quiet Drag is visually silent, pointer-attached and isolated from the live board', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openSetupLab(page);
  await expect(page.locator('.caissa-legacy-drag-qa')).toHaveAttribute(
    'aria-label', 'Arena Setup Position drag comparison');
  await expect(page.locator('#arenaBoardMount .board-b72b1')).not.toHaveAttribute(
    'data-caissa-legacy-quiet-drag-enabled', 'true');

  const source = await point(page, 'e2', 0.23, 0.34);
  const target = await point(page, 'e5', 0.23, 0.34);
  await page.evaluate((start) => {
    window.__setupOriginal = document.querySelector('#arenaSetupBoard .square-e2 .piece-417db');
    const rect = window.__setupOriginal.getBoundingClientRect();
    window.__setupOrigin = { left: rect.left, top: rect.top };
    window.__setupGrab = { x: start.x - rect.left, y: start.y - rect.top };
    window.__setupBefore = window.CaissaArena.getSetupQuietDragSnapshot();
  }, source);
  await page.mouse.move(source.x, source.y);
  await page.mouse.down();
  expect(await page.evaluate(() => ({
    count: document.querySelectorAll('#arenaSetupBoard .caissa-legacy-quiet-drag-piece').length,
    same: document.querySelector('#arenaSetupBoard .caissa-legacy-quiet-drag-piece') === window.__setupOriginal,
    captured: window.CaissaArena.getSetupQuietDragSnapshot().adapter.controller.pointerCaptured
  }))).toEqual({ count: 1, same: true, captured: true });
  const mid = { x: (source.x + target.x) / 2, y: (source.y + target.y) / 2 };
  await page.mouse.move(mid.x, mid.y, { steps: 12 });
  await expect.poll(() => page.evaluate((cursor) => {
    const mover = document.querySelector('#arenaSetupBoard .caissa-legacy-quiet-drag-piece');
    const rect = mover.getBoundingClientRect();
    return Math.hypot(cursor.x - rect.left - window.__setupGrab.x, cursor.y - rect.top - window.__setupGrab.y);
  }, mid)).toBeLessThanOrEqual(3);
  const during = await page.evaluate((cursor) => {
    const mover = document.querySelector('#arenaSetupBoard .caissa-legacy-quiet-drag-piece');
    const rect = mover.getBoundingClientRect();
    const style = getComputedStyle(mover);
    const now = window.CaissaArena.getSetupQuietDragSnapshot();
    return {
      lag: Math.hypot(cursor.x - rect.left - window.__setupGrab.x, cursor.y - rect.top - window.__setupGrab.y),
      draftStable: now.draftFen === window.__setupBefore.draftFen,
      mainStable: now.mainFen === window.__setupBefore.mainFen,
      transform: mover.style.transform,
      transition: style.transitionDuration,
      animation: style.animationName,
      opacity: style.opacity,
      filter: style.filter,
      shadow: style.boxShadow,
      geometryReads: now.adapter.controller.geometryReadsDuringMove,
      writes: now.adapter.movementVisualWrites,
      frames: now.adapter.controller.scheduler.framesRequested
    };
  }, mid);
  expect(during.lag).toBeLessThanOrEqual(3);
  expect(during.draftStable).toBe(true);
  expect(during.mainStable).toBe(true);
  expect(during.transform).toMatch(/^translate3d\(/);
  expect(during).toMatchObject({ transition: '0s', animation: 'none', opacity: '1', filter: 'none', shadow: 'none', geometryReads: 0 });
  expect(during.writes).toBeLessThanOrEqual(during.frames);
  await page.mouse.move(target.x, target.y, { steps: 4 });
  await page.mouse.up();
  const after = await page.evaluate(() => ({
    position: window.CaissaArena.setupBoardInstance.position(),
    now: window.CaissaArena.getSetupQuietDragSnapshot(),
    syncDelta: window.CaissaArena.getSetupQuietDragSnapshot().fenSyncCount - window.__setupBefore.fenSyncCount,
    representations: document.querySelectorAll('#arenaSetupBoard .caissa-legacy-quiet-drag-piece').length
  }));
  expect(after.position.e2).toBeUndefined();
  expect(after.position.e5).toBe('wP');
  expect(after.syncDelta).toBe(1);
  expect(after.representations).toBe(0);
});

test('editor semantics, cancel isolation, reopen, options and explicit Apply remain intact', async ({ page }) => {
  await openSetupLab(page);
  const mainBefore = await page.evaluate(() => window.CaissaArena.game.fen());
  await drag(page, 'e2', 'e5');
  await drag(page, 'e7', 'e3');
  await page.getByRole('button', { name: 'Add White queen' }).click();
  await page.locator('#arenaSetupBoard .square-d4').click();
  await page.getByRole('button', { name: 'Add Black rook' }).click();
  await page.locator('#arenaSetupBoard .square-d4').click();
  await page.getByRole('button', { name: 'Erase piece' }).click();
  await page.locator('#arenaSetupBoard .square-d4').click();
  let position = await page.evaluate(() => window.CaissaArena.setupBoardInstance.position());
  expect(position).toMatchObject({ e5: 'wP', e3: 'bP' });
  expect(position.d4).toBeUndefined();
  expect(await page.evaluate(() => window.CaissaArena.game.fen())).toBe(mainBefore);
  await page.locator('#arenaSetupTurn').selectOption('b');
  await page.locator('#arenaSetupCastleWK').uncheck();
  const draft = await page.evaluate(() => window.CaissaArena.state.setupDraftFen);
  expect(draft.split(' ')[1]).toBe('b');
  expect(draft.split(' ')[2]).toBe('Qkq');
  await page.locator('#arenaSetupClose').click();
  expect(await page.evaluate(() => window.CaissaArena.game.fen())).toBe(mainBefore);
  await page.locator('#arenaManualSetupBtn').click();
  await expect(page.locator('#arenaSetupBoard .board-b72b1')).toHaveAttribute('data-caissa-legacy-quiet-drag-enabled', 'true');
  await page.locator('#arenaSetupClear').click();
  expect(Object.keys(await page.evaluate(() => window.CaissaArena.setupBoardInstance.position()))).toHaveLength(0);
  await page.locator('#arenaSetupReset').click();
  expect(Object.keys(await page.evaluate(() => window.CaissaArena.setupBoardInstance.position()))).toHaveLength(32);
  await drag(page, 'b1', 'b6');
  await page.locator('#arenaSetupApply').click();
  await expect(page.locator('#arenaSetupModal')).not.toHaveClass(/show/);
  expect(await page.evaluate(() => window.CaissaArena.game.fen())).not.toBe(mainBefore);
});

test('ten close/reopen cycles release listeners, frames and stale editor roots', async ({ page }) => {
  await openSetupLab(page);
  await page.evaluate(() => { window.__oldAdapters = []; window.__oldRoots = []; });
  for (let index = 0; index < 10; index += 1) {
    expect((await page.evaluate(() => window.CaissaArena.getSetupQuietDragSnapshot())).adapter.controller.listenerCount).toBe(5);
    await page.evaluate(() => {
      window.__oldAdapters.push(window.CaissaArena.setupQuietDragAdapter);
      window.__oldRoots.push(document.querySelector('#arenaSetupBoard .board-b72b1'));
      window.CaissaArena.closeManualSetup();
      window.CaissaArena.openManualSetup();
    });
    await expect(page.locator('#arenaSetupBoard .board-b72b1')).toHaveAttribute('data-caissa-legacy-quiet-drag-enabled', 'true');
  }
  const lifecycle = await page.evaluate(() => ({
    disconnected: window.__oldRoots.every(root => !root.isConnected),
    listeners: window.__oldAdapters.map(adapter => adapter.getMetrics().controller.listenerCount),
    pending: window.__oldAdapters.map(adapter => adapter.getMetrics().controller.scheduler.pendingFrame),
    panels: document.querySelectorAll('.caissa-legacy-drag-qa').length
  }));
  expect(lifecycle).toEqual({ disconnected: true, listeners: Array(10).fill(0), pending: Array(10).fill(false), panels: 1 });
});

for (const viewport of [
  { width: 1920, height: 1080 }, { width: 1440, height: 900 },
  { width: 1366, height: 768 }, { width: 1024, height: 768 }
]) {
  test(`Setup editor remains usable at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await openSetupLab(page);
    const rect = await page.locator('#arenaSetupBoard').evaluate(node => node.getBoundingClientRect().toJSON());
    expect(Math.abs(rect.width - rect.height)).toBeLessThanOrEqual(1);
    expect(rect.width).toBeGreaterThan(250);
    expect(rect.left).toBeGreaterThanOrEqual(0);
    expect(rect.right).toBeLessThanOrEqual(viewport.width);
    await expect(page.locator('#arenaSetupBoard .piece-417db')).toHaveCount(32);
  });
}
