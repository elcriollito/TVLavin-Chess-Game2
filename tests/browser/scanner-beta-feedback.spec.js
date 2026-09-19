import { test, expect } from '@playwright/test';
import { scannerBoardImage as imageFixture } from './fixtures/scanner-board-image.js';

const FEN = '4k3/8/8/8/8/8/8/4K3 w - - 0 1';

function labels() {
  const output = Array(64).fill('empty'); output[4] = 'k'; output[60] = 'K'; return output;
}

function prediction() {
  return {
    modelVersion: 'caissa-piece-classifier-v0.5-occupancy-recovery',
    modelChecksum: '90D06A3C1AAC934188CBA5EEB4B68D51AC64C815351BFE372F2215101DD7209E',
    occupancyThreshold: .99,
    predictedFEN: FEN,
    squarePredictions: labels().map((label, index) => ({
      square: String.fromCharCode(97 + index % 8) + String(8 - Math.floor(index / 8)),
      predictedClass: label, confidence: .98, occupancyProbability: label === 'empty' ? .01 : .999,
      colorProbabilities: [.5, .5], pieceTypeProbabilities: [0, 0, 0, 0, 0, 1], kingAuxiliaryProbability: label.toLowerCase() === 'k' ? .99 : .01
    }))
  };
}

async function mockBeta(page, { feedbackFailures = 0 } = {}) {
  const captured = { scans: [], feedback: [], feedbackAttempts: 0 };
  await page.route('**/api/scanner/beta/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/status')) return route.fulfill({ status: 200, json: { available: true } });
    if (path.endsWith('/recognize')) return route.fulfill({ status: 200, json: prediction() });
    if (path.endsWith('/scan')) {
      captured.scans.push(route.request().postDataJSON());
      return route.fulfill({ status: 200, json: { accepted: true } });
    }
    if (path.endsWith('/feedback')) {
      captured.feedbackAttempts += 1;
      if (captured.feedbackAttempts <= feedbackFailures) return route.fulfill({ status: 503, json: { error: 'OFFLINE' } });
      captured.feedback.push(route.request().postDataJSON());
      return route.fulfill({ status: 200, json: { accepted: true } });
    }
    return route.fulfill({ status: 200, json: { accepted: true, imageStorageReference: 'test://image' } });
  });
  return captured;
}

async function recognize(page) {
  await page.locator('#galleryInput').setInputFiles(imageFixture);
  await expect(page.locator('#readingView')).toBeVisible();
  await expect(page.locator('#reviewView')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('#betaBoard .sq')).toHaveCount(64);
}

test.describe('Scanner internal mobile beta feedback', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('mobile capture exposes Take Photo and Choose Photo without public navigation', async ({ page }) => {
    await mockBeta(page);
    await page.goto('/scanner/beta');
    await expect(page.getByText('INTERNAL BETA')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Take Photo' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Choose Photo' })).toBeVisible();
    await expect(page.locator('#cameraInput')).toHaveAttribute('capture', 'environment');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });

  test('recognition result can be confirmed with no correction', async ({ page }) => {
    const captured = await mockBeta(page);
    await page.goto('/scanner/beta');
    await recognize(page);
    await page.getByRole('button', { name: 'Confirm Correct', exact: true }).click();
    await expect(page.locator('#workspaceView')).toBeVisible();
    await expect(page.locator('#workspaceBoard .sq')).toHaveCount(64);
    expect(captured.scans).toHaveLength(1);
    expect(captured.feedback).toHaveLength(1);
    expect(captured.feedback[0].feedback.feedbackType).toBe('CONFIRMED_CORRECT');
    expect(captured.feedback[0].feedback.changedSquareCount).toBe(0);
  });

  test('piece correction derives changed square and requires final-position confirmation', async ({ page }) => {
    const captured = await mockBeta(page);
    await page.goto('/scanner/beta');
    await recognize(page);
    await page.locator('#piecePalette button[data-piece="B"]').click();
    await page.locator('#betaBoard .sq[aria-label="f2 empty"]').click();
    await expect(page.getByRole('button', { name: 'Position Correct Now' })).toBeVisible();
    await page.getByRole('button', { name: 'Position Correct Now' }).click();
    await expect(page.locator('#workspaceView')).toBeVisible();
    const feedback = captured.feedback[0].feedback;
    expect(feedback.feedbackType).toBe('PIECE_CORRECTION');
    expect(feedback.changedSquares).toHaveLength(1);
    expect(feedback.changedSquares[0]).toMatchObject({ square: 'f2', predicted: 'empty', corrected: 'B' });
    expect(feedback.finalPositionConfirmed).toBe(true);
  });

  test('board detection wrong is isolated from classifier truth', async ({ page }) => {
    const captured = await mockBeta(page);
    await page.goto('/scanner/beta');
    await recognize(page);
    await page.getByRole('button', { name: 'Board Detection Wrong' }).click();
    const feedback = captured.feedback[0].feedback;
    expect(feedback.feedbackType).toBe('LOCALIZATION_FAILURE');
    expect(feedback.localizationValid).toBe(false);
    expect(feedback.finalPositionConfirmed).toBe(false);
  });

  test('failed feedback upload is queued and retried idempotently when online', async ({ page }) => {
    const captured = await mockBeta(page, { feedbackFailures: 1 });
    await page.goto('/scanner/beta');
    await recognize(page);
    await page.getByRole('button', { name: 'Confirm Correct', exact: true }).click();
    await expect(page.locator('#workspaceView')).toBeVisible();
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('caissa-scanner-beta-pending-sync-v1')).length)).toBe(1);
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await expect.poll(() => captured.feedbackAttempts).toBe(2);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('caissa-scanner-beta-pending-sync-v1')).length)).toBe(0);
    expect(captured.feedback).toHaveLength(1);
  });
});
