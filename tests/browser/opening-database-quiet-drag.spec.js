import { test, expect } from '@playwright/test';

async function openLab(page) {
  await page.addInitScript(() => localStorage.setItem('caissa_onboarding_completed', 'true'));
  await page.goto('/opening-database?quiet-drag-lab=1');
  await expect(page.locator('#openingDbBoard .board-b72b1')).toHaveAttribute(
    'data-caissa-legacy-quiet-drag-enabled', 'true');
  await expect(page.locator('#openingDbBoard .piece-417db')).toHaveCount(32);
  await expect.poll(() => page.evaluate(() => !!window.__openingDbQuietDrag)).toBe(true);
}

async function squarePoint(page, square, xRatio = 0.37, yRatio = 0.41) {
  const target = page.locator(`#openingDbBoard .square-${square}`);
  await target.scrollIntoViewIfNeeded();
  return target.evaluate((node, ratios) => {
    const rect = node.getBoundingClientRect();
    return { x: rect.left + rect.width * ratios.xRatio, y: rect.top + rect.height * ratios.yRatio };
  }, { xRatio, yRatio });
}

async function drag(page, sourceSquare, targetSquare) {
  const source = await squarePoint(page, sourceSquare);
  const target = await squarePoint(page, targetSquare);
  await page.mouse.move(source.x, source.y);
  await page.mouse.down();
  await page.mouse.move(target.x, target.y, { steps: 5 });
  await page.mouse.up();
}

async function applyFen(page, fen) {
  await page.getByRole('button', { name: 'Input FEN' }).click();
  await page.locator('#odbFenInput').fill(fen);
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__openingDbQuietDrag.getSnapshot().fen)).toBe(fen);
}

test('Quiet Drag is silent and isolates Chess.js, notation, and lookup work until drop', async ({ page }) => {
  await openLab(page);
  await expect(page.locator('.caissa-legacy-drag-qa')).toHaveAttribute(
    'aria-label', 'Opening Database drag comparison');

  const source = await squarePoint(page, 'e2', 0.24, 0.71);
  const target = await squarePoint(page, 'e4', 0.24, 0.71);
  const before = await page.evaluate(() => window.__openingDbQuietDrag.getSnapshot());
  await page.mouse.move(source.x, source.y);
  await page.mouse.down();
  await page.mouse.move((source.x + target.x) / 2, (source.y + target.y) / 2, { steps: 5 });
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));

  const during = await page.evaluate(({ sourcePoint, targetPoint }) => {
    const snapshot = window.__openingDbQuietDrag.getSnapshot();
    const mover = document.querySelector('#openingDbBoard .caissa-legacy-quiet-drag-piece');
    const style = getComputedStyle(mover);
    const rect = mover.getBoundingClientRect();
    const origin = document.querySelector('#openingDbBoard .square-e2').getBoundingClientRect();
    return {
      snapshot,
      representations: document.querySelectorAll('#openingDbBoard .caissa-legacy-quiet-drag-piece').length,
      vendorFloaters: [...document.querySelectorAll('body > .piece-417db')]
        .filter((node) => getComputedStyle(node).display !== 'none').length,
      sourcePieceVisible: !!document.querySelector('#openingDbBoard .square-e2 .piece-417db'),
      transform: mover.style.transform,
      transition: style.transitionDuration,
      animation: style.animationName,
      opacity: style.opacity,
      filter: style.filter,
      boxShadow: style.boxShadow,
      rect: rect.toJSON(),
      expected: {
        x: (sourcePoint.x + targetPoint.x) / 2 - (sourcePoint.x - origin.left),
        y: (sourcePoint.y + targetPoint.y) / 2 - (sourcePoint.y - origin.top)
      }
    };
  }, { sourcePoint: source, targetPoint: target });

  expect(during.snapshot.fen).toBe(before.fen);
  expect(during.snapshot.history).toEqual(before.history);
  expect(during.snapshot.positionRequestId).toBe(before.positionRequestId);
  expect(during.snapshot.interaction.moveListWrites).toBe(before.interaction.moveListWrites);
  expect(during.representations).toBe(1);
  expect(during.vendorFloaters).toBe(0);
  expect(during.sourcePieceVisible).toBe(true);
  expect(during.transform).toMatch(/^translate3d\(/);
  expect(during.transition).toBe('0s');
  expect(during.animation).toBe('none');
  expect(during.opacity).toBe('1');
  expect(during.filter).toBe('none');
  expect(during.boxShadow).toBe('none');
  expect(Math.abs(during.rect.left - during.expected.x)).toBeLessThanOrEqual(3);
  expect(Math.abs(during.rect.top - during.expected.y)).toBeLessThanOrEqual(3);
  expect(during.snapshot.adapter.controller.geometryReadsDuringMove).toBe(0);
  expect(during.snapshot.adapter.movementVisualWrites).toBeLessThanOrEqual(
    during.snapshot.adapter.controller.scheduler.framesRequested);

  await page.mouse.move(target.x, target.y, { steps: 4 });
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => window.__openingDbQuietDrag.getSnapshot().history)).toEqual(['e4']);
  await expect.poll(() => page.locator('#odbOpeningLabel').textContent()).toContain("King's Pawn Game");
  await expect.poll(() => page.locator('#odbLookupStatus').textContent()).toContain('Position lookup: match');
  const after = await page.evaluate(() => window.__openingDbQuietDrag.getSnapshot());
  expect(after.turn).toBe('b');
  expect(after.moveList).toContain('1.e4');
  expect(after.positionRequestId).toBe(before.positionRequestId + 1);
  expect(after.interaction.boardMoveAttempts).toBe(before.interaction.boardMoveAttempts + 1);
  expect(after.interaction.boardMovesApplied).toBe(before.interaction.boardMovesApplied + 1);
  expect(after.interaction.boardPositionWrites).toBe(before.interaction.boardPositionWrites + 1);
  expect(after.interaction.moveListWrites).toBe(before.interaction.moveListWrites + 1);
  expect(after.interaction.positionViewRequests).toBe(before.interaction.positionViewRequests + 1);
  expect(after.boardPosition.e4).toBe('wP');
  expect(after.adapter.legacyInput.attached).toBe(false);
  expect(after.adapter.representationCount).toBe(0);
});

test('captures, castling, en passant, queen promotion, rejection, flip, and touch stay correct', async ({ page }) => {
  await openLab(page);

  await applyFen(page, '8/8/8/3p4/4P3/8/8/4K2k w - - 0 1');
  await drag(page, 'e4', 'd5');
  let snapshot = await page.evaluate(() => window.__openingDbQuietDrag.getSnapshot());
  expect(snapshot.history).toEqual(['exd5']);
  expect(snapshot.boardPosition.d5).toBe('wP');
  expect(snapshot.boardPosition.e4).toBeUndefined();

  await applyFen(page, 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
  await drag(page, 'e1', 'g1');
  snapshot = await page.evaluate(() => window.__openingDbQuietDrag.getSnapshot());
  expect(snapshot.history).toEqual(['O-O']);
  expect(snapshot.boardPosition.g1).toBe('wK');
  expect(snapshot.boardPosition.f1).toBe('wR');

  await applyFen(page, '7k/8/8/3pP3/8/8/8/K7 w - d6 0 1');
  await drag(page, 'e5', 'd6');
  snapshot = await page.evaluate(() => window.__openingDbQuietDrag.getSnapshot());
  expect(snapshot.history).toEqual(['exd6']);
  expect(snapshot.boardPosition.d6).toBe('wP');
  expect(snapshot.boardPosition.d5).toBeUndefined();

  await applyFen(page, '7k/P7/8/8/8/8/8/K7 w - - 0 1');
  const beforeWhitePromotion = await page.evaluate(() => window.__openingDbQuietDrag.getSnapshot());
  await drag(page, 'a7', 'a8');
  snapshot = await page.evaluate(() => window.__openingDbQuietDrag.getSnapshot());
  expect(snapshot.history[0]).toMatch(/^a8=Q/);
  expect(snapshot.uciHistory).toEqual(['a7a8q']);
  expect(snapshot.fen.split(' ')[0]).toBe('Q6k/8/8/8/8/8/8/K7');
  expect(snapshot.boardPosition.a8).toBe('wQ');
  expect(snapshot.positionRequestId).toBe(beforeWhitePromotion.positionRequestId + 1);

  await applyFen(page, 'k7/8/8/8/8/8/p7/7K b - - 0 1');
  await drag(page, 'a2', 'a1');
  snapshot = await page.evaluate(() => window.__openingDbQuietDrag.getSnapshot());
  expect(snapshot.history[0]).toMatch(/^a1=Q/);
  expect(snapshot.uciHistory).toEqual(['a2a1q']);
  expect(snapshot.fen.split(' ')[0]).toBe('k7/8/8/8/8/8/8/q6K');
  expect(snapshot.boardPosition.a1).toBe('bQ');

  await page.getByRole('button', { name: 'Start Position' }).click();
  const beforeIllegal = await page.evaluate(() => window.__openingDbQuietDrag.getSnapshot());
  await drag(page, 'e2', 'e5');
  snapshot = await page.evaluate(() => window.__openingDbQuietDrag.getSnapshot());
  expect(snapshot.fen).toBe(beforeIllegal.fen);
  expect(snapshot.positionRequestId).toBe(beforeIllegal.positionRequestId);
  expect(snapshot.interaction.boardMovesApplied).toBe(beforeIllegal.interaction.boardMovesApplied);

  await drag(page, 'e2', 'e4');
  await page.getByRole('button', { name: 'Flip Board' }).click();
  await drag(page, 'e7', 'e5');
  snapshot = await page.evaluate(() => window.__openingDbQuietDrag.getSnapshot());
  expect(snapshot.orientation).toBe('black');
  expect(snapshot.history.slice(-2)).toEqual(['e4', 'e5']);

  await page.getByRole('button', { name: 'Start Position' }).click();
  const source = await squarePoint(page, 'd2');
  const target = await squarePoint(page, 'd4');
  await page.evaluate(({ sourcePoint, targetPoint }) => {
    const root = document.querySelector('#openingDbBoard .board-b72b1');
    const dispatch = (type, point) => root.dispatchEvent(new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      isPrimary: true,
      pointerId: 17,
      pointerType: 'touch',
      clientX: point.x,
      clientY: point.y
    }));
    dispatch('pointerdown', sourcePoint);
    dispatch('pointermove', targetPoint);
    dispatch('pointerup', targetPoint);
  }, { sourcePoint: source, targetPoint: target });
  snapshot = await page.evaluate(() => window.__openingDbQuietDrag.getSnapshot());
  expect(snapshot.history).toEqual(['d4']);
  expect(snapshot.boardPosition.d4).toBe('wP');
});

test('ten reset/recreate cycles leave stable listeners, handlers, frames, and references', async ({ page }) => {
  await openLab(page);
  await page.evaluate(() => { window.__openingDbOldAdapters = []; });

  for (let index = 0; index < 10; index += 1) {
    await page.getByRole('button', { name: 'Start Position' }).click();
    const current = await page.evaluate(() => window.__openingDbQuietDrag.getSnapshot());
    expect(current.adapter.controller.listenerCount).toBe(5);
    expect(current.adapter.controller.scheduler.pendingFrame).toBe(false);
    expect(current.adapter.legacyInput.attached).toBe(false);
    await page.evaluate(async () => {
      window.__openingDbOldAdapters.push(window.__openingDbQuietDrag.getAdapter());
      await window.__openingDbQuietDrag.recreateBoard();
    });
    await expect(page.locator('#openingDbBoard .piece-417db')).toHaveCount(32);
  }

  const lifecycle = await page.evaluate(() => ({
    oldListeners: window.__openingDbOldAdapters.map((adapter) => adapter.getMetrics().controller.listenerCount),
    oldFrames: window.__openingDbOldAdapters.map((adapter) => adapter.getMetrics().controller.scheduler.pendingFrame),
    representations: document.querySelectorAll('#openingDbBoard .caissa-legacy-quiet-drag-piece').length,
    panels: document.querySelectorAll('.caissa-legacy-drag-qa').length,
    floaters: [...document.querySelectorAll('body > .piece-417db')]
      .filter((node) => getComputedStyle(node).display !== 'none').length,
    current: window.__openingDbQuietDrag.getSnapshot().adapter
  }));
  expect(lifecycle.oldListeners).toEqual(Array(10).fill(0));
  expect(lifecycle.oldFrames).toEqual(Array(10).fill(false));
  expect(lifecycle.representations).toBe(0);
  expect(lifecycle.panels).toBe(1);
  expect(lifecycle.floaters).toBe(0);
  expect(lifecycle.current.controller.listenerCount).toBe(5);
  expect(lifecycle.current.legacyInput.attached).toBe(false);
});

for (const viewport of [
  { width: 1920, height: 1080 },
  { width: 1440, height: 900 },
  { width: 1366, height: 768 },
  { width: 1024, height: 768 }
]) {
  test(`Opening Database board remains usable at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await openLab(page);
    const geometry = await page.locator('#openingDbBoard').evaluate((node) => {
      const rect = node.getBoundingClientRect();
      return { width: rect.width, height: rect.height, left: rect.left, right: rect.right };
    });
    expect(Math.abs(geometry.width - geometry.height)).toBeLessThanOrEqual(1);
    expect(geometry.width).toBeGreaterThan(250);
    expect(geometry.left).toBeGreaterThanOrEqual(0);
    expect(geometry.right).toBeLessThanOrEqual(viewport.width);
    expect(await page.locator('#openingDbBoard .piece-417db').count()).toBe(32);
  });
}
