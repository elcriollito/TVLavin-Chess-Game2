import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const imageFixture = fileURLToPath(new URL('../../img/chesspieces/wikipedia/wK.png', import.meta.url));

async function selectAndConfirm(page) {
  await page.goto('/scanner/index.html');
  await page.getByRole('button', { name: 'Start a new scan' }).click();
  await expect(page.getByRole('region', { name: 'New Scan' })).toBeVisible();
  await page.locator('#galleryInput').setInputFiles(imageFixture);
  await expect(page.locator('#scannerBoard .sq')).toHaveCount(64);
  await expect(page.locator('#confirmBtn')).toBeEnabled();
  await page.locator('#confirmBtn').click();
  await expect(page.locator('#homeView')).toBeHidden();
  await expect(page.locator('#handoffCard')).toBeVisible();
}

async function boardGeometry(page) {
  return page.locator('#scannerBoard').evaluate((board) => {
    const rect = board.getBoundingClientRect();
    const squares = [...board.children].map((square) => square.getBoundingClientRect());
    return {
      width: rect.width,
      height: rect.height,
      count: squares.length,
      squareWidths: [...new Set(squares.map((square) => square.width))],
      squareHeights: [...new Set(squares.map((square) => square.height))],
      overflow: document.documentElement.scrollWidth - window.innerWidth
    };
  });
}

test.describe('CAISSA Scanner approved mobile workspace', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('new scan chooser preserves state until an image is selected', async ({ page }) => {
    await page.goto('/scanner/index.html');
    const generation = await page.evaluate(() => window.CaissaScannerState.snapshot().generation);
    await expect(page.getByRole('button', { name: 'Start a new scan' })).toHaveCount(1);
    await page.getByRole('button', { name: 'Start a new scan' }).click();
    await expect(page.getByRole('region', { name: 'New Scan' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Take Photo' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Choose Photo' })).toBeVisible();
    expect(await page.evaluate(() => window.CaissaScannerState.snapshot().generation)).toBe(generation);
    await page.locator('#cancelNewScanBtn').click();
    await expect(page.getByRole('region', { name: 'New Scan' })).toBeHidden();
    expect(await page.evaluate(() => window.CaissaScannerState.snapshot().generation)).toBe(generation);
  });

  test('board is stable, FEN stays hidden, and confirmed controls use progressive disclosure', async ({ page }) => {
    await selectAndConfirm(page);
    const geometry = await boardGeometry(page);
    expect(geometry.count).toBe(64);
    expect(geometry.width).toBe(geometry.height);
    expect(geometry.width % 8).toBe(0);
    expect(geometry.squareWidths).toHaveLength(1);
    expect(geometry.squareHeights).toHaveLength(1);
    expect(geometry.overflow).toBeLessThanOrEqual(0);
    await expect(page.locator('#fenInput')).toBeHidden();
    await expect(page.locator('#recognitionSummary')).toBeHidden();
    await expect(page.locator('.position-actions button')).toHaveCount(3);
    await expect(page.locator('.new-scan-control #newScanBtn')).toBeVisible();

    await page.locator('#workspaceShareBtn').click();
    await expect(page.getByRole('region', { name: 'Export position' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Diagram Image' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'FEN Text' })).toBeVisible();
    await page.locator('#closeExportBtn').click();

    const confirmedFen = await page.locator('#confirmedFen').textContent();
    await page.locator('#editBtn').click();
    await expect(page.getByRole('region', { name: 'Edit chess position' })).toBeVisible();
    await page.locator('#cancelEditBtn').click();
    await expect(page.locator('#confirmedFen')).toHaveText(confirmedFen);

    const stateBeforeCancel = await page.evaluate(() => window.CaissaScannerState.snapshot());
    await page.locator('#newScanBtn').click();
    await page.locator('#cancelNewScanBtn').click();
    const stateAfterCancel = await page.evaluate(() => window.CaissaScannerState.snapshot());
    expect(stateAfterCancel).toEqual(stateBeforeCancel);
  });

  test('Edit applies to the current board and both export formats remain internal first', async ({ page }) => {
    await page.addInitScript(() => {
      window.__nativeShareCalls = 0;
      navigator.share = async () => { window.__nativeShareCalls += 1; };
    });
    await selectAndConfirm(page);
    const originalFen = await page.locator('#confirmedFen').textContent();
    await page.locator('#editBtn').click();
    await page.locator('#scannerBoard .sq[aria-label="a2 wP"]').click();
    await page.locator('.palette-clear').click();
    await page.locator('#applyEditBtn').click();
    await expect(page.locator('#confirmedFen')).not.toHaveText(originalFen);
    await expect(page.locator('#editSheet')).toBeHidden();

    await page.locator('#workspaceShareBtn').click();
    expect(await page.evaluate(() => window.__nativeShareCalls)).toBe(0);
    const downloadPromise = page.waitForEvent('download');
    await page.locator('#exportDiagramBtn').click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('caissa-position.png');

    await page.locator('#workspaceShareBtn').click();
    await page.locator('#exportFenBtn').click();
    await expect(page.locator('#appToast')).toBeVisible();
    await expect(page.locator('#appToast')).toContainText(/FEN copied| w | b /);
  });

  test('Stockfish MultiPV updates do not resize the board', async ({ page }) => {
    await selectAndConfirm(page);
    const before = await boardGeometry(page);
    await page.locator('#analyzeBtn').click();
    await expect(page.locator('#analysisPanel')).toBeVisible();
    await expect(page.locator('#analysisStatus')).toContainText(/Analyzing|Starting/);
    await expect(page.locator('.analysis-line')).toHaveCount(3);
    await page.waitForTimeout(1200);
    const after = await boardGeometry(page);
    expect(after.width).toBe(before.width);
    expect(after.height).toBe(before.height);
    expect(after.squareWidths).toEqual(before.squareWidths);
    expect(after.squareHeights).toEqual(before.squareHeights);
    await page.locator('#scannerBoard .sq[aria-label="d5 wN"]').click();
    await page.locator('#scannerBoard .sq[aria-label="f6 bN"]').click();
    await expect(page.locator('#previousMoveBtn')).toBeEnabled();
    await page.locator('#previousMoveBtn').click();
    await expect(page.locator('#previousMoveBtn')).toBeDisabled();
    await expect(page.locator('#nextMoveBtn')).toBeEnabled();
    await page.locator('#engineToggle').uncheck({ force: true });
    await expect(page.locator('#analysisPanel')).toBeHidden();
  });
});

for (const profile of [
  { name: 'iPhone landscape', width: 844, height: 390 },
  { name: 'desktop', width: 1280, height: 900 }
]) {
  test(`${profile.name} has no horizontal overflow or clipped board`, async ({ page }) => {
    await page.setViewportSize({ width: profile.width, height: profile.height });
    await selectAndConfirm(page);
    const geometry = await boardGeometry(page);
    expect(geometry.count).toBe(64);
    expect(geometry.width).toBe(geometry.height);
    expect(geometry.width % 8).toBe(0);
    expect(geometry.overflow).toBeLessThanOrEqual(0);
  });
}
