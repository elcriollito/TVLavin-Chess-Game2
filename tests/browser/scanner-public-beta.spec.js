import { test, expect } from '@playwright/test';
import { scannerBoardImage, scannerPerspectiveBoardImage } from './fixtures/scanner-board-image.js';

async function boardPresentation(page) {
  return page.locator('#scannerBoard').evaluate((board) => ({
    state: {
      boardOrientation: board.dataset.boardOrientation,
      coordinateOrientation: board.dataset.coordinateOrientation,
      coordinateOrientationUserOverride: board.dataset.coordinateOrientationUserOverride
    },
    files: [...board.children].filter(square => square.dataset.file).map(square => square.dataset.file),
    ranks: [...board.children].filter(square => square.dataset.rank).map(square => square.dataset.rank),
    mapping: [...board.children].map(square => `${square.dataset.row},${square.dataset.col}`),
    pieces: [...board.children].map((square, index) => ({ index, piece: square.querySelector('.piece-img')?.dataset.piece || '' }))
  }));
}

function expectCoordinates(presentation, files, ranks) {
  expect(presentation.files).toEqual(files.split(''));
  expect(presentation.ranks).toEqual(ranks.split(''));
}

test.describe('CAISSA Scanner controlled public beta', () => {
  test('desktop is an intentional information and mobile handoff experience', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 900 });
    await page.goto('/scanner');
    await expect(page.locator('#scannerDesktopLanding')).toBeVisible();
    await expect(page.locator('#scannerApp')).toBeHidden();
    await expect(page.getByRole('heading', { name: 'Scan a chess position from your phone.' })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-scanner-handoff-ready', 'true');
    await expect(page.locator('#scannerHandoffQr')).toHaveAttribute('src', '/api/scanner/public/handoff-qr');
    await expect(page.locator('#scannerCanonicalUrl')).toHaveValue('https://www.caissa-chess.org/scanner');
    await expect(page.locator('#scannerMobileCta')).toHaveAttribute('href', 'https://www.caissa-chess.org/scanner');
    await expect(page.getByText('Physical 3D boards', { exact: false })).toBeVisible();
    await expect(page.getByText('Privacy by choice')).toBeVisible();
  });

  test('protected preview uses one exact handoff URL for QR, CTA, copy, and hidden build identity', async ({ page }) => {
    const previewUrl = 'https://tv-lavin-chess-game2-env-staging-elcriollitos-projects.vercel.app/scanner?_vercel_share=PreviewToken_1234567890';
    const sourceSha = '0123456789abcdef0123456789abcdef01234567';
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: async (value) => { window.__copiedScannerUrl = value; } }
      });
    });
    await page.route('**/api/scanner/public/handoff', route => route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        schemaVersion: 'caissa-scanner-handoff/1', environment: 'preview', url: previewUrl,
        buildIdentity: { sourceSha, publicStage: 'public-beta', targetEnvironment: 'staging' }
      })
    }));
    await page.setViewportSize({ width: 1366, height: 900 });
    await page.goto('/scanner');
    await expect(page.locator('html')).toHaveAttribute('data-scanner-handoff-ready', 'true');
    await expect(page.locator('html')).toHaveAttribute('data-scanner-build-sha', sourceSha);
    await expect(page.locator('html')).toHaveAttribute('data-scanner-public-stage', 'public-beta');
    await expect(page.locator('#scannerMobileCta')).toHaveAttribute('href', previewUrl);
    await expect(page.locator('#scannerCanonicalUrl')).toHaveValue(previewUrl);
    await expect(page.locator('#scannerHandoffQr')).toHaveAttribute('src', '/api/scanner/public/handoff-qr');
    await page.locator('#copyScannerUrlBtn').click();
    await expect.poll(() => page.evaluate(() => window.__copiedScannerUrl)).toBe(previewUrl);
  });

  test('mobile remains the functional certified Scanner with mandatory review', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/scanner');
    await expect(page.locator('#scannerDesktopLanding')).toBeHidden();
    await expect(page.locator('#scannerApp')).toBeVisible();
    await expect(page.locator('.public-beta-badge')).toBeVisible();
    await page.locator('#galleryInput').setInputFiles(scannerBoardImage);
    await expect(page.locator('#readingView')).toBeVisible();
    await expect(page.locator('#reviewEditView')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('#workspaceView')).toBeHidden();
    await expect(page.locator('#scannerBoard .sq')).toHaveCount(64);
    await page.locator('#applyEditBtn').click();
    await expect(page.locator('#workspaceView')).toBeVisible();
    await expect(page.locator('#helpImproveBtn')).toBeVisible();
  });

  test('board and coordinate orientations support all four independent presentation states', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/scanner');
    await page.locator('#galleryInput').setInputFiles(scannerBoardImage);
    await expect(page.locator('#reviewEditView')).toBeVisible({ timeout: 30_000 });
    await page.locator('#applyEditBtn').click();
    const fen = await page.locator('#confirmedFen').textContent();

    const whiteWhite = await boardPresentation(page);
    expect(whiteWhite.state).toEqual({
      boardOrientation: 'white-bottom', coordinateOrientation: 'white-bottom',
      coordinateOrientationUserOverride: 'false'
    });
    expectCoordinates(whiteWhite, 'abcdefgh', '87654321');
    await testInfo.attach('white-board-white-coordinates', { body: await page.locator('#scannerBoard').screenshot(), contentType: 'image/png' });

    await page.locator('#flipCoordinatesBtn').click();
    const whiteBlack = await boardPresentation(page);
    expect(whiteBlack.state).toEqual({
      boardOrientation: 'white-bottom', coordinateOrientation: 'black-bottom',
      coordinateOrientationUserOverride: 'true'
    });
    expectCoordinates(whiteBlack, 'hgfedcba', '12345678');
    expect(whiteBlack.mapping).toEqual(whiteWhite.mapping);
    expect(whiteBlack.pieces).toEqual(whiteWhite.pieces);
    await testInfo.attach('white-board-black-coordinates', { body: await page.locator('#scannerBoard').screenshot(), contentType: 'image/png' });

    await page.locator('#flipBtn').click();
    const blackBlack = await boardPresentation(page);
    expect(blackBlack.state).toEqual({
      boardOrientation: 'black-bottom', coordinateOrientation: 'black-bottom',
      coordinateOrientationUserOverride: 'true'
    });
    expectCoordinates(blackBlack, 'hgfedcba', '12345678');
    expect([...blackBlack.mapping].sort()).toEqual([...whiteWhite.mapping].sort());
    await testInfo.attach('black-board-black-coordinates', { body: await page.locator('#scannerBoard').screenshot(), contentType: 'image/png' });

    await page.locator('#flipCoordinatesBtn').click();
    const blackWhite = await boardPresentation(page);
    expect(blackWhite.state).toEqual({
      boardOrientation: 'black-bottom', coordinateOrientation: 'white-bottom',
      coordinateOrientationUserOverride: 'true'
    });
    expectCoordinates(blackWhite, 'abcdefgh', '87654321');
    expect(blackWhite.mapping).toEqual(blackBlack.mapping);
    expect(blackWhite.pieces).toEqual(blackBlack.pieces);
    await expect(page.locator('#confirmedFen')).toHaveText(fen);
    await testInfo.attach('black-board-white-coordinates', { body: await page.locator('#scannerBoard').screenshot(), contentType: 'image/png' });
  });

  for (const viewport of [{ width: 390, height: 844 }, { width: 430, height: 932 }]) {
    test(`mobile preview opens Capture/New Scan without a legacy demo at ${viewport.width}x${viewport.height}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto('/scanner');
      await expect(page.locator('#homeView')).toBeVisible();
      await expect(page.locator('#workspaceView')).toBeHidden();
      await expect(page.locator('#scannerBoard .piece-img:not([hidden])')).toHaveCount(0);
      await expect(page.locator('#homeView').getByText('New Scan', { exact: true })).toBeVisible();
      await page.locator('#homeScanBtn').click();
      await expect(page.getByRole('button', { name: 'Take Photo' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Choose Photo' })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    });
  }

  test('tablet-width layout keeps the functional Scanner rather than user-agent sniffing', async ({ page }) => {
    await page.setViewportSize({ width: 820, height: 1024 });
    await page.goto('/scanner');
    await expect(page.locator('#scannerApp')).toBeVisible();
    await expect(page.locator('#scannerDesktopLanding')).toBeHidden();
  });

  test('feedback is optional, separates both consents, and is raw-unverified', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const requests = [];
    page.on('request', request => {
      if (request.url().includes('/api/scanner/public/')) {
        requests.push({ url: request.url(), method: request.method(), body: request.postDataJSON?.() || null });
      }
    });
    await page.goto('/scanner');
    await page.locator('#galleryInput').setInputFiles(scannerBoardImage);
    await expect(page.locator('#reviewEditView')).toBeVisible({ timeout: 30_000 });
    await page.locator('#applyEditBtn').click();
    const confirmedFen = await page.locator('#confirmedFen').textContent();
    await page.locator('#flipCoordinatesBtn').click();
    await page.locator('#helpImproveBtn').click();
    await expect(page.locator('#feedbackSheet')).toBeVisible();
    await expect(page.locator('#shareCorrectionConsent')).not.toBeChecked();
    await expect(page.locator('#shareImageConsent')).not.toBeChecked();
    await expect(page.locator('#submitFeedbackBtn')).toBeDisabled();
    await page.locator('#shareCorrectionConsent').check();
    await page.locator('#submitFeedbackBtn').click();
    await expect(page.locator('#appToast')).toContainText('raw-unverified');
    expect(requests.some(item => item.url.endsWith('/feedback') && item.method === 'POST')).toBe(true);
    expect(requests.some(item => item.url.endsWith('/image'))).toBe(false);
    const submitted = requests.find(item => item.url.endsWith('/feedback')).body.feedback;
    expect(submitted.feedbackType).toBe('CONFIRMED_CORRECT');
    expect(submitted.correctedFEN).toBe(confirmedFen);
    expect(submitted.changedSquareCount).toBe(0);
  });

  test('HEIC and HEIF fail explicitly without calling recognition', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    let recognitionCalls = 0;
    page.on('request', request => { if (request.url().endsWith('/api/scanner/public/recognize')) recognitionCalls += 1; });
    await page.goto('/scanner');
    await page.locator('#galleryInput').setInputFiles({ name: 'board.heic', mimeType: 'image/heic', buffer: Buffer.from('unsupported') });
    await expect(page.locator('#appToast')).toContainText('HEIC and HEIF are not supported');
    expect(recognitionCalls).toBe(0);
  });

  test('localization failure stays safe and offers opt-in failure evidence', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/scanner');
    await page.locator('#galleryInput').setInputFiles(scannerPerspectiveBoardImage);
    await expect(page.locator('#reviewEditView')).toBeVisible({ timeout: 30_000 });
    await page.locator('#publicLocalizationWrongBtn').click();
    await expect(page.locator('#feedbackSheetDescription')).toContainText('localization review');
    await expect(page.locator('#shareImageConsent')).not.toBeChecked();
  });

  test('mobile public beta has no horizontal overflow', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/scanner');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
});
