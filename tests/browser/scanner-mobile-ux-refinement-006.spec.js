import { test, expect } from '@playwright/test';
import { scannerBoardImage } from './fixtures/scanner-board-image.js';

async function reachWorkspace(page) {
  await page.goto('/scanner/index.html');
  await page.locator('#galleryInput').setInputFiles(scannerBoardImage);
  await expect(page.locator('#reviewEditView')).toBeVisible();
}

async function installEngine(page) {
  await page.evaluate(() => {
    let generation = 0;
    window.__ux006Searches = [];
    window.EngineRegistry = {
      ...window.EngineRegistry,
      createAnalyzeEngine: () => ({
        ready: true,
        start: async () => true,
        setMultiPV() {},
        stopAnalysis() {},
        startAnalysisAttributed(fen, callback) {
          const id = ++generation;
          window.__ux006Searches.push({ fen, callback, id });
          return id;
        }
      })
    };
  });
}

for (const viewport of [{ width: 390, height: 844 }, { width: 430, height: 932 }]) {
  test(`compact Edit and engine summary honor UX 006 at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await reachWorkspace(page);

    await expect(page.locator('#editCoordinatesVisibilityBtn')).toBeHidden();
    await expect(page.locator('#clearSquareBtn')).toBeVisible();
    await expect(page.locator('#correctOrientationBtn')).toContainText('A1 \u2194 H8');
    await expect(page.locator('#editMorePanel')).toBeHidden();

    const original = (await page.locator('#fenInput').inputValue()).split(' ');
    await page.locator('#editBlackTurnBtn').click();
    const black = (await page.locator('#fenInput').inputValue()).split(' ');
    expect(black[1]).toBe('b');
    expect([black[0], ...black.slice(2)]).toEqual([original[0], ...original.slice(2)]);
    await page.locator('#editWhiteTurnBtn').click();

    await page.locator('#editMoreBtn').click();
    await expect(page.locator('#editMoreBtn')).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('#editCastlingBtn')).toBeVisible();
    await expect(page.locator('#clearBoardBtn')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#editMorePanel')).toBeHidden();
    await expect(page.locator('#editMoreBtn')).toBeFocused();

    await page.locator('#applyEditBtn').click();
    await expect(page.locator('#handoffCard')).toBeVisible();
    await expect(page.locator('#analyzeBtn')).toBeHidden();
    await expect(page.locator('#coordinatesVisibilityBtn')).toBeHidden();
    await expect(page.locator('#primaryEvaluation')).toHaveText('\u2014');
    await expect(page.locator('#primaryEvaluationState')).toHaveText('Engine off');

    await installEngine(page);
    await page.locator('#engineToggle').check({ force: true });
    await expect.poll(() => page.evaluate(() => window.__ux006Searches.length)).toBe(1);
    await page.evaluate(() => {
      const search = window.__ux006Searches[0];
      search.callback({ multipv: 2, depth: 15, score: -0.21, pv: ['d7d5'] }, search.id);
      search.callback({ multipv: 1, depth: 16, score: 0.36, pv: ['d5f6'] }, search.id);
      search.callback({ multipv: 3, depth: 14, score: 0.08, pv: ['c4b5'] }, search.id);
    });
    await expect(page.locator('#primaryEvaluation')).toHaveText('+0.36');
    await expect(page.locator('#primaryEvaluationDepth')).toHaveText('16');
    await expect(page.locator('#primaryBestMove')).not.toHaveText('\u2014');
    await expect(page.locator('.analysis-line')).toHaveCount(3);

    const layout = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth - innerWidth,
      board: document.querySelector('#scannerBoard').getBoundingClientRect().toJSON(),
      summary: document.querySelector('.engine-summary').getBoundingClientRect().toJSON()
    }));
    expect(layout.overflow).toBeLessThanOrEqual(0);
    expect(layout.board.width).toBe(layout.board.height);
    expect(layout.summary.right).toBeLessThanOrEqual(viewport.width);

    await page.locator('#engineToggle').uncheck({ force: true });
    await expect(page.locator('#primaryEvaluation')).toHaveText('\u2014');
    await expect(page.locator('#primaryEvaluationState')).toHaveText('Engine off');
  });
}
