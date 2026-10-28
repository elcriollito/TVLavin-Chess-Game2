import { test, expect } from '@playwright/test';
import { scannerBoardImage } from './fixtures/scanner-board-image.js';

async function selectAndConfirm(page) {
  await page.goto('/scanner/index.html');
  await page.locator('#galleryInput').setInputFiles(scannerBoardImage);
  await expect(page.locator('#reviewEditView')).toBeVisible();
  await page.locator('#applyEditBtn').click();
  await expect(page.locator('#handoffCard')).toBeVisible();
}

async function installEngine(page) {
  await page.evaluate(() => {
    let generation = 0;
    window.__arrowSearches = [];
    window.EngineRegistry = {
      ...window.EngineRegistry,
      createAnalyzeEngine: () => ({
        ready: true,
        start: async () => true,
        setMultiPV() {},
        stopAnalysis() {},
        startAnalysisAttributed(fen, callback) {
          const id = ++generation;
          window.__arrowSearches.push({ fen, callback, id });
          return id;
        }
      })
    };
  });
}

async function emitFirstLegalMove(page, searchIndex) {
  return page.evaluate((index) => {
    const search = window.__arrowSearches[index];
    const game = new window.Chess(search.fen);
    const move = game.moves({ verbose: true })[0];
    const uci = move.from + move.to + (move.promotion || '');
    search.callback({ multipv: 1, depth: 12, score: .25, pv: [uci] }, search.id);
    return { uci, from: move.from, to: move.to };
  }, searchIndex);
}

async function arrowGeometry(page) {
  return page.evaluate(() => {
    const overlay = document.querySelector('#bestMoveArrowOverlay');
    const line = document.querySelector('#bestMoveArrowLine');
    const board = document.querySelector('#scannerBoard');
    const center = (square) => {
      const match = square.match(/^([a-h])([1-8])$/);
      const row = 8 - Number(match[2]);
      const col = match[1].charCodeAt(0) - 97;
      const element = board.querySelector(`.sq[data-row="${row}"][data-col="${col}"]`);
      const squareRect = element.getBoundingClientRect();
      const boardRect = board.getBoundingClientRect();
      return { x: squareRect.left - boardRect.left + squareRect.width / 2, y: squareRect.top - boardRect.top + squareRect.height / 2 };
    };
    return {
      hidden: overlay.hasAttribute("hidden"),
      move: overlay.dataset.move,
      from: overlay.dataset.from,
      to: overlay.dataset.to,
      x1: Number(line.getAttribute('x1')),
      y1: Number(line.getAttribute('y1')),
      x2: Number(line.getAttribute('x2')),
      y2: Number(line.getAttribute('y2')),
      expectedFrom: center(overlay.dataset.from),
      expectedTo: center(overlay.dataset.to),
      pointerEvents: getComputedStyle(overlay).pointerEvents,
      overflow: document.documentElement.scrollWidth - window.innerWidth
    };
  });
}

function expectMapped(geometry, move) {
  expect(geometry.hidden).toBe(false);
  expect(geometry.move).toBe(move.uci);
  expect(geometry.from).toBe(move.from);
  expect(geometry.to).toBe(move.to);
  expect(geometry.x1).toBeCloseTo(geometry.expectedFrom.x, 4);
  expect(geometry.y1).toBeCloseTo(geometry.expectedFrom.y, 4);
  expect(geometry.x2).toBeCloseTo(geometry.expectedTo.x, 4);
  expect(geometry.y2).toBeCloseTo(geometry.expectedTo.y, 4);
  expect(geometry.pointerEvents).toBe('none');
  expect(geometry.overflow).toBeLessThanOrEqual(0);
}

async function expectArrowMapped(page, move) {
  await expect.poll(async () => {
    const geometry = await arrowGeometry(page);
    const close = (actual, expected) => Math.abs(actual - expected) < 0.001;
    return !geometry.hidden
      && geometry.move === move.uci
      && close(geometry.x1, geometry.expectedFrom.x)
      && close(geometry.y1, geometry.expectedFrom.y)
      && close(geometry.x2, geometry.expectedTo.x)
      && close(geometry.y2, geometry.expectedTo.y);
  }).toBe(true);
  expectMapped(await arrowGeometry(page), move);
}

for (const viewport of [{ width: 390, height: 844 }, { width: 430, height: 932 }]) {
  test(`MultiPV 1 arrow maps through board geometry at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await selectAndConfirm(page);
    await installEngine(page);
    await expect(page.locator('#arrowsToggle')).toBeChecked();
    await page.locator('#engineToggle').check({ force: true });
    await expect.poll(() => page.evaluate(() => window.__arrowSearches.length)).toBe(1);
    const move = await emitFirstLegalMove(page, 0);
    await expect(page.locator('#bestMoveArrowOverlay')).toBeVisible();
    await expectArrowMapped(page, move);

    await page.locator('#flipBtn').click();
    await expect(page.locator('#scannerBoard')).toHaveAttribute('data-board-orientation', 'black-bottom');
    await expectArrowMapped(page, move);

    await page.locator('#arrowsToggle').uncheck({ force: true });
    await expect(page.locator('#bestMoveArrowOverlay')).toBeHidden();
    await page.locator('#arrowsToggle').check({ force: true });
    await expect(page.locator('#bestMoveArrowOverlay')).toBeVisible();
    await page.locator('#engineToggle').uncheck({ force: true });
    await expect(page.locator('#bestMoveArrowOverlay')).toBeHidden();
    await page.locator('#engineToggle').check({ force: true });
    await expect.poll(() => page.evaluate(() => window.__arrowSearches.length)).toBe(2);
    await emitFirstLegalMove(page, 1);
    await expect(page.locator('#bestMoveArrowOverlay')).toBeVisible();

    await page.locator('#arrowsToggle').uncheck({ force: true });
    await page.locator('#engineToggle').uncheck({ force: true });
    await page.locator('#engineToggle').check({ force: true });
    await expect.poll(() => page.evaluate(() => window.__arrowSearches.length)).toBe(3);
    await emitFirstLegalMove(page, 2);
    await expect(page.locator('#bestMoveArrowOverlay')).toBeHidden();
  });
}

test('PV changes, stale searches, and analysis navigation never show an old move', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await selectAndConfirm(page);
  await installEngine(page);
  await page.locator('#engineToggle').check({ force: true });
  await expect.poll(() => page.evaluate(() => window.__arrowSearches.length)).toBe(1);
  const first = await emitFirstLegalMove(page, 0);
  await expect(page.locator('#bestMoveArrowOverlay')).toHaveAttribute('data-move', first.uci);

  const second = await page.evaluate(() => {
    const search = window.__arrowSearches[0];
    const game = new window.Chess(search.fen);
    const move = game.moves({ verbose: true })[1];
    const uci = move.from + move.to + (move.promotion || '');
    search.callback({ multipv: 1, depth: 14, score: .3, pv: [uci] }, search.id);
    return uci;
  });
  await expect(page.locator('#bestMoveArrowOverlay')).toHaveAttribute('data-move', second);

  await page.locator(`#scannerBoard .sq[aria-label^="${first.from} "]`).click();
  await page.locator(`#scannerBoard .sq[aria-label^="${first.to} "]`).click();
  await expect.poll(() => page.evaluate(() => window.__arrowSearches.length)).toBe(2);
  await expect(page.locator('#bestMoveArrowOverlay')).toBeHidden();
  await page.evaluate(() => {
    const stale = window.__arrowSearches[0];
    stale.callback({ multipv: 1, depth: 18, score: .9, pv: ['d2d4'] }, stale.id);
  });
  await expect(page.locator('#bestMoveArrowOverlay')).toBeHidden();
  const current = await emitFirstLegalMove(page, 1);
  await expect(page.locator('#bestMoveArrowOverlay')).toHaveAttribute('data-move', current.uci);

  await page.locator('#previousMoveBtn').click();
  await expect.poll(() => page.evaluate(() => window.__arrowSearches.length)).toBe(3);
  await expect(page.locator('#bestMoveArrowOverlay')).toBeHidden();
  const previous = await emitFirstLegalMove(page, 2);
  await expect(page.locator('#bestMoveArrowOverlay')).toHaveAttribute('data-move', previous.uci);
});
