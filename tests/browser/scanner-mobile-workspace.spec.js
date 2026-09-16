import { test, expect } from '@playwright/test';
import { scannerBoardImage as imageFixture } from './fixtures/scanner-board-image.js';

async function selectAndConfirm(page) {
  await page.goto('/scanner/index.html');
  await page.getByRole('button', { name: 'Start a new scan' }).click();
  await expect(page.getByRole('dialog', { name: 'New Scan' })).toBeVisible();
  await page.locator('#galleryInput').setInputFiles(imageFixture);
  await expect(page.locator('#readingView')).toBeVisible();
  await expect(page.locator('#workspaceView')).toBeHidden();
  await expect(page.locator('#reviewEditView')).toBeVisible();
  await expect(page.locator('#scannerBoard .sq')).toHaveCount(64);
  await expect(page.locator('#applyEditBtn')).toBeFocused();
  await page.locator('#applyEditBtn').click();
  await expect(page.locator('#homeView')).toBeHidden();
  await expect(page.locator('#workspaceView')).toBeVisible();
  await expect(page.locator('#handoffCard')).toBeVisible();
}

async function expectOnlyView(page, view) {
  const visible = await page.locator('[data-principal-view]').evaluateAll((views) => views
    .filter((element) => !element.hidden && getComputedStyle(element).display !== 'none')
    .map((element) => element.dataset.principalView));
  expect(visible).toEqual([view]);
  for (const element of await page.locator('[data-principal-view]').all()) {
    const name = await element.getAttribute('data-principal-view');
    if (name === view) {
      await expect(element).not.toHaveAttribute('inert', '');
      await expect(element).toHaveAttribute('aria-hidden', 'false');
    } else {
      await expect(element).toHaveAttribute('inert', '');
      await expect(element).toHaveAttribute('aria-hidden', 'true');
    }
  }
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

async function toolbarGeometry(page) {
  return page.locator('.position-toolbar').evaluate((toolbar) => {
    const actions = toolbar.querySelector('.position-actions');
    const actionRects = [...actions.children].map((button) => button.getBoundingClientRect());
    return {
      flexWrap: getComputedStyle(actions).flexWrap,
      rows: new Set(actionRects.map((rect) => Math.round(rect.top))).size,
      clipped: actionRects.some((rect) => rect.left < 0 || rect.right > window.innerWidth),
      overflow: document.documentElement.scrollWidth - window.innerWidth
    };
  });
}

test.describe('CAISSA Scanner approved mobile workspace', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('initial entry exposes only Capture and places focus on its primary action', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto('/scanner/index.html');
    await expectOnlyView(page, 'capture');
    await expect(page.locator('#readingView')).toBeHidden();
    await expect(page.locator('#reviewEditView')).toBeHidden();
    await expect(page.locator('#workspaceView')).toBeHidden();
    await expect(page.locator('#homeScanBtn')).toBeFocused();
    await expect(page.locator('#scannerBoard')).toBeHidden();
    expect(errors).toEqual([]);
  });

  test('new scan chooser preserves state until an image is selected', async ({ page }) => {
    await page.goto('/scanner/index.html');
    const generation = await page.evaluate(() => window.CaissaScannerState.snapshot().generation);
    await expect(page.getByRole('button', { name: 'Start a new scan' })).toHaveCount(1);
    await page.getByRole('button', { name: 'Start a new scan' }).click();
    await expect(page.getByRole('dialog', { name: 'New Scan' })).toBeVisible();
    await expect(page.locator('#homeView')).toHaveAttribute('inert', '');
    await expect(page.locator('.app-topbar')).toHaveAttribute('inert', '');
    await expect(page.locator('.app-topbar')).toHaveAttribute('aria-hidden', 'true');
    await expect(page.getByRole('button', { name: 'Take Photo' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Choose Photo' })).toBeVisible();
    expect(await page.evaluate(() => window.CaissaScannerState.snapshot().generation)).toBe(generation);

    await page.locator('#sheetBackdrop').click({ position: { x: 2, y: 2 } });
    await expect(page.getByRole('dialog', { name: 'New Scan' })).toBeHidden();
    await expect(page.locator('#homeScanBtn')).toBeFocused();
    await expect(page.locator('.app-topbar')).not.toHaveAttribute('inert', '');

    await page.getByRole('button', { name: 'Start a new scan' }).click();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'New Scan' })).toBeHidden();
    await expect(page.locator('#homeScanBtn')).toBeFocused();

    await page.getByRole('button', { name: 'Start a new scan' }).click();
    await page.locator('#cancelNewScanBtn').click();
    await expect(page.getByRole('dialog', { name: 'New Scan' })).toBeHidden();
    await expectOnlyView(page, 'capture');
    await expect(page.locator('#homeScanBtn')).toBeFocused();
    expect(await page.evaluate(() => window.CaissaScannerState.snapshot().generation)).toBe(generation);
  });

  test('valid image uses Reading, rejects stale generations, and review Cancel returns to Capture', async ({ page }) => {
    await page.goto('/scanner/index.html');
    await page.locator('#galleryInput').setInputFiles(imageFixture);
    await expectOnlyView(page, 'reading');
    await expect(page.locator('#readingTitle')).toBeFocused();
    const firstGeneration = await page.evaluate(() => window.CaissaScannerState.snapshot().generation);

    await page.locator('#galleryInput').evaluate((input) => { input.value = ''; });
    await page.locator('#galleryInput').setInputFiles(imageFixture);
    const secondGeneration = await page.evaluate(() => window.CaissaScannerState.snapshot().generation);
    expect(secondGeneration).toBeGreaterThan(firstGeneration);
    expect(await page.evaluate((generation) => window.CaissaScannerState.setCandidate(generation, { fen: 'stale' }), firstGeneration)).toBe(false);
    await expect(page.locator('#reviewEditView')).toBeVisible();
    await expectOnlyView(page, 'review_edit');
    await expect(page.locator('#workspaceView')).toBeHidden();
    await expect(page.locator('#applyEditBtn')).toBeFocused();
    await page.locator('#cancelEditBtn').click();
    await expectOnlyView(page, 'capture');
    await expect(page.locator('#homeScanBtn')).toBeFocused();
    expect((await page.evaluate(() => window.CaissaScannerState.snapshot())).state).toBe('idle');
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
    await expect(page.locator('.position-actions button')).toHaveCount(4);
    await expect(page.locator('.new-scan-control #newScanBtn')).toBeVisible();

    await page.locator('#workspaceShareBtn').click();
    await expect(page.getByRole('dialog', { name: 'Export position' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Diagram Image' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'FEN Text' })).toBeVisible();
    await page.locator('#closeExportBtn').click();

    const confirmedFen = await page.locator('#confirmedFen').textContent();
    await page.evaluate(() => { window.__scannerViewStateBoardNode = document.querySelector('#scannerBoard .sq'); });
    await page.locator('#editBtn').click();
    await expect(page.getByRole('region', { name: 'Edit chess position' })).toBeVisible();
    await expectOnlyView(page, 'review_edit');
    await expect(page.locator('#workspaceView')).toBeHidden();
    await page.locator('#cancelEditBtn').click();
    await expectOnlyView(page, 'workspace');
    await expect(page.locator('#editBtn')).toBeFocused();
    await expect(page.locator('#confirmedFen')).toHaveText(confirmedFen);
    expect(await page.evaluate(() => window.__scannerViewStateBoardNode === document.querySelector('#scannerBoard .sq'))).toBe(true);

    const stateBeforeCancel = await page.evaluate(() => window.CaissaScannerState.snapshot());
    await page.locator('#newScanBtn').click();
    await expect(page.locator('#newScanSheet')).toBeVisible();
    await expect(page.locator('#workspaceView')).toHaveAttribute('inert', '');
    await page.locator('#cancelNewScanBtn').click();
    await expectOnlyView(page, 'workspace');
    await expect(page.locator('#newScanBtn')).toBeFocused();
    const stateAfterCancel = await page.evaluate(() => window.CaissaScannerState.snapshot());
    expect(stateAfterCancel).toEqual(stateBeforeCancel);
  });

  test('New Scan keeps Workspace on cancel and hides the old board once a valid image begins', async ({ page }) => {
    await selectAndConfirm(page);
    const confirmedBefore = await page.locator('#confirmedFen').textContent();
    await page.locator('#newScanBtn').click();
    await page.locator('#cancelNewScanBtn').click();
    await expectOnlyView(page, 'workspace');
    await expect(page.locator('#confirmedFen')).toHaveText(confirmedBefore);

    await page.locator('#newScanBtn').click();
    await page.locator('#galleryInput').evaluate((input) => { input.value = ''; });
    await page.locator('#galleryInput').setInputFiles(imageFixture);
    await expectOnlyView(page, 'reading');
    await expect(page.locator('#workspaceView')).toBeHidden();
    await expect(page.locator('#scannerBoard')).toBeHidden();
    await expect(page.locator('#reviewEditView')).toBeVisible();
    await expectOnlyView(page, 'review_edit');
  });

  test('workspace Save Diagram is ordered, unsaved, non-persistent, and layout-stable', async ({ page }) => {
    await selectAndConfirm(page);
    const actionIds = await page.locator('.position-actions > button').evaluateAll((buttons) => buttons.map((button) => button.id));
    expect(actionIds).toEqual(['editBtn', 'workspaceSaveDiagramBtn', 'workspaceShareBtn', 'moreBtn']);
    await expect(page.locator('#workspaceSaveDiagramBtn')).toHaveCount(1);
    const saveDiagram = page.getByRole('button', { name: 'Save Diagram' });
    await expect(saveDiagram).toHaveAttribute('data-diagram-state', 'unsaved');
    await expect(saveDiagram).toHaveAttribute('aria-pressed', 'false');
    await expect(saveDiagram.locator('i')).toHaveClass(/\bfar\b/);

    const beforeBoard = await boardGeometry(page);
    const beforeStorage = await page.evaluate(() => Object.fromEntries(Object.entries(localStorage)));
    await saveDiagram.focus();
    await expect(saveDiagram).toBeFocused();
    await saveDiagram.click();
    await expect(page.locator('#appToast')).toHaveText('Diagram Library — coming soon.');
    await expect(saveDiagram).toHaveAttribute('data-diagram-state', 'unsaved');
    await expect(saveDiagram).toHaveAttribute('aria-pressed', 'false');
    expect(await page.evaluate(() => Object.fromEntries(Object.entries(localStorage)))).toEqual(beforeStorage);
    expect(await boardGeometry(page)).toEqual(beforeBoard);
    expect(await toolbarGeometry(page)).toEqual({ flexWrap: 'nowrap', rows: 1, clipped: false, overflow: 0 });
  });

  test('Edit applies to the current board and both export formats remain internal first', async ({ page }) => {
    await page.addInitScript(() => {
      window.__nativeShareCalls = 0;
      navigator.share = async () => { window.__nativeShareCalls += 1; };
    });
    await selectAndConfirm(page);
    const originalFen = await page.locator('#confirmedFen').textContent();
    await page.locator('#editBtn').click();
    await expectOnlyView(page, 'review_edit');
    await page.locator('#clearSquareBtn').click();
    await page.locator('#scannerBoard .sq[aria-label="a2 wP"]').click();
    await page.locator('#applyEditBtn').click();
    await expect(page.locator('#confirmedFen')).not.toHaveText(originalFen);
    await expect(page.locator('#editSheet')).toBeHidden();
    await expectOnlyView(page, 'workspace');
    await expect(page.locator('#editBtn')).toBeFocused();

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

  test('Edit opens the currently visible analyzed position without invoking image pickers', async ({ page }) => {
    await selectAndConfirm(page);
    await page.evaluate(() => {
      window.__scannerPickerClicks = 0;
      document.querySelector('#cameraInput').addEventListener('click', () => { window.__scannerPickerClicks += 1; });
      document.querySelector('#galleryInput').addEventListener('click', () => { window.__scannerPickerClicks += 1; });
    });
    await page.locator('#analyzeBtn').click();
    await page.locator('#scannerBoard .sq[aria-label="d5 wN"]').click();
    await page.locator('#scannerBoard .sq[aria-label="f6 bN"]').click();
    const exploredFen = await page.locator('#confirmedFen').textContent();
    await page.locator('#editBtn').click();
    await expect(page.getByRole('region', { name: 'Edit chess position' })).toBeVisible();
    await expect(page.locator('#fenInput')).toHaveValue(exploredFen);
    await expect(page.locator('#analysisPanel')).toBeHidden();
    await expect(page.locator('#newScanBtn')).toBeHidden();
    expect(await page.evaluate(() => window.__scannerPickerClicks)).toBe(0);
  });

  test('piece tools stay visibly armed for repeated placement, clearing, and flipped mapping', async ({ page }) => {
    await selectAndConfirm(page);
    await page.locator('#editBtn').click();
    const pieces = ['k', 'q', 'r', 'b', 'n', 'p', 'K', 'Q', 'R', 'B', 'N', 'P'];
    for (const piece of pieces) {
      const tool = page.locator(`${piece === piece.toLowerCase() ? '#blackPiecePalette' : '#whitePiecePalette'} [data-piece="${piece}"]`);
      await tool.click();
      await expect(tool).toHaveAttribute('aria-pressed', 'true');
      await expect(page.locator('[data-piece][aria-pressed="true"], #clearSquareBtn[aria-pressed="true"]')).toHaveCount(1);
    }

    await page.locator('#blackPiecePalette [data-piece="p"]').click();
    for (const square of ['a5', 'b5', 'c5']) await page.locator(`#scannerBoard .sq[aria-label^="${square} "]`).click();
    let placed = await page.evaluate(() => window.CaissaScannerFen.validateDraft(document.querySelector('#fenInput').value).board);
    expect(placed[3].slice(0, 3)).toEqual(['p', 'p', 'p']);

    await page.locator('#clearSquareBtn').click();
    await expect(page.locator('#clearSquareBtn')).toHaveAttribute('aria-pressed', 'true');
    for (const square of ['a5', 'b5']) await page.locator(`#scannerBoard .sq[aria-label^="${square} "]`).click();
    placed = await page.evaluate(() => window.CaissaScannerFen.validateDraft(document.querySelector('#fenInput').value).board);
    expect(placed[3].slice(0, 3)).toEqual(['', '', 'p']);

    await page.locator('#editFlipBtn').click();
    await page.locator('#whitePiecePalette [data-piece="Q"]').click();
    await page.locator('#scannerBoard .sq').first().click();
    const flippedTarget = await page.evaluate(() => window.CaissaScannerFen.validateDraft(document.querySelector('#fenInput').value).board[7][7]);
    expect(flippedTarget).toBe('Q');
  });

  test('Clear Board and every editable FEN field are isolated until Apply', async ({ page }) => {
    await selectAndConfirm(page);
    const originalFen = await page.locator('#confirmedFen').textContent();
    await page.locator('#editBtn').click();
    await page.locator('#blackPiecePalette [data-piece="p"]').click();
    await page.locator('#scannerBoard .sq[aria-label="a5 empty"]').click();
    await page.locator('#clearSquareBtn').click();
    await page.locator('#scannerBoard .sq[aria-label="a7 bP"]').click();
    await page.locator('#editBlackTurnBtn').click();
    await expect(page.locator('#fenInput')).toHaveValue(/ b /);
    await page.locator('#editWhiteTurnBtn').click();
    await expect(page.locator('#fenInput')).toHaveValue(/ w /);
    await page.locator('#editCastlingBtn').click();
    await page.locator('[data-castling="K"]').uncheck();
    await page.locator('#clearBoardBtn').click();
    await expect(page.locator('#fenInput')).toHaveValue(/^8\/8\/8\/8\/8\/8\/8\/8 w Qkq - 4 10$/);
    await expect(page.locator('#editValidation')).toContainText('exactly one white king');
    await page.locator('#editFlipBtn').click();
    await page.locator('#cancelEditBtn').click();
    await expect(page.locator('#confirmedFen')).toHaveText(originalFen);
    await expect(page.locator('#fenInput')).toHaveValue(originalFen);
    expect((await page.evaluate(() => window.CaissaScannerState.snapshot())).state).toBe('confirmed');
    await expect(page.locator('#scannerBoard .sq').first()).toHaveAttribute('aria-label', /^a8 /);
  });

  test('invalid king edits stay in Edit and valid Apply replaces analysis without stale FEN', async ({ page }) => {
    await selectAndConfirm(page);
    await page.evaluate(() => { window.__scannerFirstSquareNode = document.querySelector('#scannerBoard .sq'); });
    await page.locator('#analyzeBtn').click();
    await expect(page.locator('#analysisPanel')).toBeVisible();
    await page.locator('#editBtn').click();
    await page.locator('#clearSquareBtn').click();
    await page.locator('#scannerBoard .sq[aria-label="e8 bK"]').click();
    await expect(page.locator('#scannerBoard .sq[aria-label="e8 empty"]')).toBeVisible();
    await page.locator('#applyEditBtn').click();
    await expect(page.locator('#editSheet')).toBeVisible();
    await expect(page.locator('#editValidation')).toContainText('exactly one white king and one black king');

    await page.locator('#blackPiecePalette [data-piece="k"]').click();
    await page.locator('#scannerBoard .sq[aria-label="e8 empty"]').click();
    await page.locator('#editBlackTurnBtn').click();
    await page.locator('#editCastlingBtn').click();
    await page.locator('[data-castling="K"]').uncheck();
    await page.locator('#applyEditBtn').click();
    await expect(page.locator('#editSheet')).toBeHidden();
    const appliedFen = await page.locator('#confirmedFen').textContent();
    expect(appliedFen.split(' ')[1]).toBe('b');
    expect(appliedFen.split(' ')[2]).toBe('Qkq');
    await expect(page.locator('#analysisFen')).toHaveText(appliedFen);
    await expect(page.locator('#analysisPanel')).toBeVisible();
    await expect(page.locator('#scannerBoard .sq')).toHaveCount(64);
    expect(await page.evaluate(() => window.__scannerFirstSquareNode === document.querySelector('#scannerBoard .sq'))).toBe(true);
  });

  test('Edit exports the working FEN and Diagram Library remains an honest placeholder', async ({ page }) => {
    await page.addInitScript(() => {
      window.__scannerCopiedFen = '';
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (value) => { window.__scannerCopiedFen = value; } } });
    });
    await selectAndConfirm(page);
    await page.locator('#editBtn').click();
    await page.locator('#blackPiecePalette [data-piece="q"]').click();
    await page.locator('#scannerBoard .sq[aria-label="a3 empty"]').click();
    const workingFen = await page.locator('#fenInput').inputValue();
    await page.locator('#editExportBtn').click();
    await expect(page.getByRole('dialog', { name: 'Export position' })).toBeVisible();
    await page.locator('#exportFenBtn').click();
    expect(await page.evaluate(() => window.__scannerCopiedFen)).toBe(workingFen);
    await expect(page.locator('#editSheet')).toBeVisible();

    await page.locator('#editLibraryBtn').click();
    await expect(page.locator('#appToast')).toHaveText('Diagram Library — coming soon.');
    expect(await page.evaluate(() => [...Array(localStorage.length).keys()].map((index) => localStorage.key(index)).filter((key) => /diagram.*library/i.test(key)))).toEqual([]);
    await page.locator('#editMenuBtn').click();
    await expect(page.locator('#scannerProductMenu')).toBeVisible();
    await expect(page.locator('#editMenuBtn')).toHaveAttribute('aria-expanded', 'true');
  });

  test('hamburgers control distinct, exclusive, dismissible overlay menus', async ({ page }) => {
    await selectAndConfirm(page);
    const before = await boardGeometry(page);

    await page.locator('#moreBtn').click();
    await expect(page.locator('#scannerProductMenu')).toBeVisible();
    await expect(page.locator('#moreBtn')).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByRole('menuitem', { name: /Diagram Library/ })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: /Video Board Explorer/ })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: /^Account/ })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: /Membership/ })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: /Logout/ })).toBeVisible();
    await expect(page.locator('#scannerProductMenu')).not.toContainText(/Flip Board|Copy FEN|Reset Scanner/);

    await page.locator('#boardActionsBtn').click();
    await expect(page.locator('#scannerProductMenu')).toBeHidden();
    await expect(page.locator('#scannerAnalysisMenu')).toBeVisible();
    await expect(page.locator('#moreBtn')).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('#boardActionsBtn')).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByRole('menuitem', { name: /Open in Lichess Analyzer/ })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: /Open in Chess.com Analyzer/ })).toContainText('Soon');
    await expect(page.getByRole('menuitem', { name: /Open in CAISSA Analyzer/ })).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.locator('#scannerAnalysisMenu')).toBeHidden();
    await expect(page.locator('#boardActionsBtn')).toBeFocused();
    await page.locator('#moreBtn').click();
    await page.locator('#sideToMove').click();
    await expect(page.locator('#scannerProductMenu')).toBeHidden();

    await page.locator('#moreBtn').click();
    await page.getByRole('menuitem', { name: /Diagram Library/ }).click();
    await expect(page.locator('#scannerProductMenu')).toBeHidden();
    await expect(page.locator('#appToast')).toHaveText('Diagram Library — coming soon.');

    await page.locator('#boardActionsBtn').click();
    await page.getByRole('menuitem', { name: /Open in Chess.com Analyzer/ }).click();
    await expect(page.locator('#scannerAnalysisMenu')).toBeHidden();
    await expect(page.locator('#appToast')).toContainText('not available yet');

    const after = await boardGeometry(page);
    expect(after.width).toBe(before.width);
    expect(after.height).toBe(before.height);
    expect(after.overflow).toBeLessThanOrEqual(0);
  });

  test('analysis handoffs use the currently explored FEN', async ({ page }) => {
    await page.addInitScript(() => {
      window.__scannerOpenedUrls = [];
      window.open = (url, target, features) => {
        window.__scannerOpenedUrls.push({ url: String(url), target, features });
        return { opener: window };
      };
    });
    await selectAndConfirm(page);
    const originalFen = await page.locator('#confirmedFen').textContent();
    await page.locator('#analyzeBtn').click();
    await page.locator('#scannerBoard .sq[aria-label="d5 wN"]').click();
    await page.locator('#scannerBoard .sq[aria-label="f6 bN"]').click();
    const exploredFen = await page.locator('#confirmedFen').textContent();
    expect(exploredFen).not.toBe(originalFen);

    await page.locator('#boardActionsBtn').click();
    await page.getByRole('menuitem', { name: /Open in Lichess Analyzer/ }).click();
    const opened = await page.evaluate(() => window.__scannerOpenedUrls);
    expect(opened).toEqual([{
      url: 'https://lichess.org/analysis/standard/' + exploredFen.trim().replace(/\s+/g, '_'),
      target: '_blank',
      features: 'noopener,noreferrer'
    }]);
    await expect(page.locator('#confirmedFen')).toHaveText(exploredFen);

    await page.locator('#boardActionsBtn').click();
    await page.getByRole('menuitem', { name: /Open in CAISSA Analyzer/ }).click();
    await page.waitForURL(/\/analyze\?handoff=/);
    const handoff = await page.evaluate(() => {
      const token = new URLSearchParams(location.search).get('handoff');
      return JSON.parse(sessionStorage.getItem(`caissa:analyze:handoff:v1:${token}`));
    });
    expect(handoff.intent).toBe('analyze-position');
    expect(handoff.source).toBe('scanner');
    expect(handoff.payload.finalFen).toBe(exploredFen);
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
  { name: 'iPhone portrait compact', width: 393, height: 852 },
  { name: 'iPhone portrait large', width: 430, height: 932 },
  { name: 'iPhone landscape', width: 844, height: 390 },
  { name: 'iPhone landscape large', width: 932, height: 430 },
  { name: 'desktop', width: 1280, height: 900 }
]) {
  test(`${profile.name} has no horizontal overflow or clipped board`, async ({ page }) => {
    await page.setViewportSize({ width: profile.width, height: profile.height });
    await page.goto('/scanner/index.html');
    await expectOnlyView(page, 'capture');
    const captureTarget = await page.locator('#homeScanBtn').evaluate((button) => {
      const rect = button.getBoundingClientRect();
      return { width: rect.width, height: rect.height, overflow: document.documentElement.scrollWidth - window.innerWidth };
    });
    expect(captureTarget.width).toBeGreaterThanOrEqual(44);
    expect(captureTarget.height).toBeGreaterThanOrEqual(44);
    expect(captureTarget.overflow).toBeLessThanOrEqual(0);
    await selectAndConfirm(page);
    await expectOnlyView(page, 'workspace');
    const geometry = await boardGeometry(page);
    expect(geometry.count).toBe(64);
    expect(geometry.width).toBe(geometry.height);
    expect(geometry.width % 8).toBe(0);
    expect(geometry.overflow).toBeLessThanOrEqual(0);
    expect(await toolbarGeometry(page)).toEqual({ flexWrap: 'nowrap', rows: 1, clipped: false, overflow: 0 });
    await page.locator('#boardActionsBtn').click();
    const menuRect = await page.locator('#scannerAnalysisMenu').evaluate((menu) => {
      const rect = menu.getBoundingClientRect();
      return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
    });
    expect(menuRect.left).toBeGreaterThanOrEqual(0);
    expect(menuRect.right).toBeLessThanOrEqual(profile.width);
    expect(menuRect.top).toBeGreaterThanOrEqual(0);
    expect(menuRect.bottom).toBeLessThanOrEqual(profile.height);
    const menuGeometry = await boardGeometry(page);
    expect(menuGeometry.width).toBe(geometry.width);
    expect(menuGeometry.height).toBe(geometry.height);
    await page.keyboard.press('Escape');
    await page.locator('#editBtn').click();
    await expectOnlyView(page, 'review_edit');
    const editGeometry = await boardGeometry(page);
    expect(editGeometry.count).toBe(64);
    expect(editGeometry.width).toBe(editGeometry.height);
    expect(editGeometry.width % 8).toBe(0);
    expect(editGeometry.overflow).toBeLessThanOrEqual(0);
    await expect(page.locator('#blackPiecePalette button')).toHaveCount(6);
    await expect(page.locator('#whitePiecePalette button')).toHaveCount(6);
    const applyTarget = await page.locator('#applyEditBtn').evaluate((button) => {
      const rect = button.getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    });
    expect(applyTarget.width).toBeGreaterThanOrEqual(44);
    expect(applyTarget.height).toBeGreaterThanOrEqual(44);
  });
}
