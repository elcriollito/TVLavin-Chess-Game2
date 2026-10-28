import { test, expect } from '@playwright/test';
import { scannerBoardImage, scannerPerspectiveBoardImage } from './fixtures/scanner-board-image.js';
import { canonicalFenForOrientation } from '../../scanner/orientation/scanner-orientation-inference.js';

const orientationPrediction = (fen) => {
  const labels = fen.split(/\s+/)[0].split('/').flatMap(rank => [...rank].flatMap(token => (
    /^[1-8]$/.test(token) ? Array(Number(token)).fill('empty') : [token]
  )));
  return {
    modelVersion: 'caissa-piece-classifier-v0.5-occupancy-recovery',
    modelChecksum: '90D06A3C1AAC934188CBA5EEB4B68D51AC64C815351BFE372F2215101DD7209E',
    occupancyThreshold: .99,
    predictedFEN: fen,
    squarePredictions: labels.map((predictedClass, index) => ({
      square: String.fromCharCode(97 + index % 8) + String(8 - Math.floor(index / 8)),
      predictedClass,
      confidence: .999,
      occupancyProbability: predictedClass === 'empty' ? .001 : .999,
      colorProbabilities: [.5, .5],
      pieceTypeProbabilities: [0, 0, 0, 0, 0, 1],
      kingAuxiliaryProbability: /[Kk]/.test(predictedClass) ? .999 : .001
    }))
  };
};

async function boardPresentation(page) {
  return page.locator('#scannerBoard').evaluate((board) => ({
    state: {
      boardOrientation: board.dataset.boardOrientation,
      coordinateContract: board.dataset.coordinateContract,
      coordinatesVisible: board.dataset.coordinatesVisible,
      orientationCorrectionApplied: board.dataset.orientationCorrectionApplied
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

  test('high-confidence black-bottom scan auto-selects canonical h8 at physical bottom-left', async ({ page }) => {
    const canonical = '4k2r/ppp2ppp/2np4/4p3/3PP3/2N5/PPP2PPP/R3K3 w - - 0 12';
    const physical = canonicalFenForOrientation(canonical, 'black-bottom');
    let submitted = null;
    page.on('request', request => {
      if (request.url().endsWith('/api/scanner/public/feedback')) submitted = request.postDataJSON()?.feedback || null;
    });
    await page.route('**/api/scanner/public/recognize', route => route.fulfill({ json: orientationPrediction(physical) }));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/scanner');
    await page.locator('#galleryInput').setInputFiles(scannerBoardImage);
    await expect(page.locator('#reviewEditView')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('#orientationReview')).toBeHidden();
    await expect(page.locator('#scannerBoard')).toHaveAttribute('data-board-orientation', 'black-bottom');
    await expect(page.locator('#scannerBoard .sq').nth(56)).toHaveAttribute('aria-label', /^h8\b/);
    await page.locator('#applyEditBtn').click();
    await expect(page.locator('#confirmedFen')).toHaveText(canonical);
    await page.locator('#helpImproveBtn').click();
    await page.locator('#shareCorrectionConsent').check();
    await page.locator('#submitFeedbackBtn').click();
    await expect(page.locator('#appToast')).toContainText('raw-unverified');
    expect(submitted.originalFEN).toBe(canonical);
    expect(submitted.clientMetadata).toMatchObject({
      rawRecognitionFEN: physical,
      recommendedOrientation: 'black-bottom',
      orientationConfidence: 'HIGH',
      finalCanonicalOrientation: 'black-bottom',
      userOrientationOverride: false,
      trainingTruthPolicy: 'STANDARD'
    });
  });

  test('ambiguous sparse scan blocks Apply until a human chooses orientation', async ({ page }) => {
    const sparse = '8/8/3k4/8/8/4K3/8/8 w - - 0 70';
    await page.route('**/api/scanner/public/recognize', route => route.fulfill({ json: orientationPrediction(sparse) }));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/scanner');
    await page.locator('#galleryInput').setInputFiles(scannerBoardImage);
    await expect(page.locator('#reviewEditView')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('#orientationReview')).toBeVisible();
    await expect(page.locator('#orientationReviewMessage')).toContainText('ambiguous');
    await expect(page.locator('#applyEditBtn')).toBeDisabled();
    await page.locator('#blackBottomBtn').click();
    await expect(page.locator('#blackBottomBtn')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#applyEditBtn')).toBeEnabled();
    await expect(page.locator('#scannerBoard .sq').nth(56)).toHaveAttribute('aria-label', /^h8\b/);
  });

  test('Flip View keeps coordinates canonical and Correct Orientation changes canonical FEN', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/scanner');
    await page.locator('#galleryInput').setInputFiles(scannerBoardImage);
    await expect(page.locator('#reviewEditView')).toBeVisible({ timeout: 30_000 });
    await page.locator('#applyEditBtn').click();
    const fen = await page.locator('#confirmedFen').textContent();

    const whiteView = await boardPresentation(page);
    expect(whiteView.state).toEqual({
      boardOrientation: 'white-bottom', coordinateContract: 'canonical-square',
      coordinatesVisible: 'true', orientationCorrectionApplied: 'false'
    });
    expectCoordinates(whiteView, 'abcdefgh', '87654321');
    await testInfo.attach('white-view-canonical-coordinates', { body: await page.locator('#scannerBoard').screenshot(), contentType: 'image/png' });

    await expect(page.locator('#coordinatesVisibilityBtn')).toBeHidden();
    await page.locator('#coordinatesVisibilityBtn').evaluate((button) => button.click());
    const hidden = await boardPresentation(page);
    expect(hidden.mapping).toEqual(whiteView.mapping);
    expect(hidden.pieces).toEqual(whiteView.pieces);
    expectCoordinates(hidden, 'abcdefgh', '87654321');
    await expect(page.locator('#confirmedFen')).toHaveText(fen);

    await page.locator('#flipBtn').click();
    const blackView = await boardPresentation(page);
    expect(blackView.state).toEqual({
      boardOrientation: 'black-bottom', coordinateContract: 'canonical-square',
      coordinatesVisible: 'false', orientationCorrectionApplied: 'false'
    });
    expectCoordinates(blackView, 'hgfedcba', '12345678');
    expect([...blackView.mapping].sort()).toEqual([...whiteView.mapping].sort());
    await page.locator('#coordinatesVisibilityBtn').evaluate((button) => button.click());
    await testInfo.attach('black-view-canonical-coordinates', { body: await page.locator('#scannerBoard').screenshot(), contentType: 'image/png' });
    await expect(page.locator('#confirmedFen')).toHaveText(fen);

    await page.locator('#editBtn').click();
    const expectedRotated = await page.evaluate(value => window.CaissaScannerFen.rotatePosition180(value), fen);
    await page.locator('#correctOrientationBtn').click();
    await expect(page.locator('#fenInput')).toHaveValue(expectedRotated);
    await page.locator('#applyEditBtn').click();
    await expect(page.locator('#confirmedFen')).toHaveText(expectedRotated);
    expect((await boardPresentation(page)).state.orientationCorrectionApplied).toBe('true');
    await testInfo.attach('corrected-canonical-position', { body: await page.locator('#scannerBoard').screenshot(), contentType: 'image/png' });
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
    await page.locator('#flipBtn').click();
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

  test('Correct Orientation feedback records canonical truth and routes away from classifier training', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    let submitted = null;
    page.on('request', request => {
      if (request.url().endsWith('/api/scanner/public/feedback')) submitted = request.postDataJSON()?.feedback || null;
    });
    await page.goto('/scanner');
    await page.locator('#galleryInput').setInputFiles(scannerBoardImage);
    await expect(page.locator('#reviewEditView')).toBeVisible({ timeout: 30_000 });
    const originalFen = await page.locator('#fenInput').inputValue();
    const correctedFen = await page.evaluate(value => window.CaissaScannerFen.rotatePosition180(value), originalFen);
    await page.locator('#correctOrientationBtn').click();
    await page.locator('#applyEditBtn').click();
    await page.locator('#helpImproveBtn').click();
    await page.locator('#shareCorrectionConsent').check();
    await page.locator('#submitFeedbackBtn').click();
    await expect(page.locator('#appToast')).toContainText('raw-unverified');
    expect(submitted.feedbackType).toBe('PIECE_CORRECTION');
    expect(submitted.originalFEN).toBe(originalFen);
    expect(submitted.correctedFEN).toBe(correctedFen);
    expect(submitted.changedSquareCount).toBeGreaterThan(0);
    expect(submitted.clientMetadata).toMatchObject({
      orientationCorrectionApplied: true,
      orientationDiagnostic: 'CANONICAL_180_ROTATION',
      orientationReviewRequired: true,
      trainingTruthPolicy: 'ORIENTATION_REVIEW_ONLY'
    });
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
