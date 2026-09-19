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

async function mockBeta(page, { feedbackFailures = 0, recognitionFailure = false,
  recognitionFailures = 0, recognitionNetworkFailures = 0 } = {}) {
  const captured = { scans: [], feedback: [], failures: [], recognition: [], feedbackAttempts: 0, recognitionAttempts: 0 };
  await page.route('**/api/scanner/beta/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/status')) return route.fulfill({ status: 200, json: { available: true } });
    if (path.endsWith('/recognize')) {
      captured.recognitionAttempts += 1;
      captured.recognition.push(route.request().postDataJSON());
      if (captured.recognitionAttempts <= recognitionNetworkFailures) return route.abort('connectionreset');
      if (recognitionFailure || captured.recognitionAttempts <= recognitionFailures) {
        return route.fulfill({ status: 503, json: { error: 'INFERENCE_FAILURE' } });
      }
      return route.fulfill({ status: 200, json: prediction() });
    }
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
    if (path.endsWith('/failure')) {
      captured.failures.push(route.request().postDataJSON());
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

async function chooseThroughButton(page, buttonName, file = imageFixture) {
  const chooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: buttonName, exact: true }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles(file);
}

async function boardGeometry(page, selector) {
  return page.locator(selector).evaluate((board) => {
    const boardRect = board.getBoundingClientRect();
    const squares = [...board.querySelectorAll('.sq')].map((square) => {
      const rect = square.getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    });
    const style = getComputedStyle(board);
    return {
      width: boardRect.width,
      height: boardRect.height,
      gridColumns: style.gridTemplateColumns.split(' ').length,
      gridRows: style.gridTemplateRows.split(' ').length,
      squares
    };
  });
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
    expect(captured.recognition).toHaveLength(1);
    expect(captured.recognition[0]).toMatchObject({
      schemaVersion: 'caissa-scanner-beta-recognition-request/1', boardEncoding: 'rgba8',
      boardWidth: 512, boardHeight: 512, sourceImageType: 'image/png', orientation: 'white-at-bottom'
    });
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
    await expect.poll(() => page.evaluate(() => JSON.parse(
      localStorage.getItem('caissa-scanner-beta-pending-sync-v1')
    ).length)).toBe(0);
    expect(captured.feedback).toHaveLength(1);
  });

  test('classifier failure records a scan disposition without fabricated FEN', async ({ page }) => {
    const captured = await mockBeta(page, { recognitionFailure: true });
    await page.goto('/scanner/beta');
    await page.locator('#galleryInput').setInputFiles(imageFixture);
    await expect(page.locator('#captureView')).toBeVisible();
    await expect.poll(() => captured.failures.length).toBe(1);
    expect(captured.failures[0].failure).toMatchObject({
      feedbackType: 'SCAN_FAILURE', failureStage: 'classifier', originalFEN: null,
      finalPositionConfirmed: false, localizationValid: false
    });
  });

  test('one endpoint rejection is retried and then reaches review', async ({ page }) => {
    const captured = await mockBeta(page, { recognitionFailures: 1 });
    await page.goto('/scanner/beta');
    await recognize(page);
    expect(captured.recognitionAttempts).toBe(2);
    expect(captured.failures).toHaveLength(0);
  });

  test('one network failure is retried and camera capture preserves its source metadata', async ({ page }) => {
    const captured = await mockBeta(page, { recognitionNetworkFailures: 1 });
    await page.goto('/scanner/beta');
    await page.locator('#cameraInput').setInputFiles(imageFixture);
    await expect(page.locator('#reviewView')).toBeVisible({ timeout: 20_000 });
    expect(captured.recognitionAttempts).toBe(2);
    expect(captured.scans).toHaveLength(1);
    expect(captured.scans[0].metadata.captureType).toBe('camera');
  });

  test('Review/Edit board and every rendered cell remain square at iPhone display widths', async ({ page }) => {
    await mockBeta(page);
    for (const viewport of [{ width: 390, height: 844 }, { width: 430, height: 932 }]) {
      await page.setViewportSize(viewport);
      await page.goto('/scanner/beta');
      await recognize(page);
      const geometry = await boardGeometry(page, '#betaBoard');
      expect(Math.abs(geometry.width - geometry.height)).toBeLessThanOrEqual(0.5);
      expect(geometry.gridColumns).toBe(8);
      expect(geometry.gridRows).toBe(8);
      expect(geometry.squares).toHaveLength(64);
      for (const square of geometry.squares) {
        expect(Math.abs(square.width - square.height)).toBeLessThanOrEqual(0.5);
        expect(Math.abs(square.width - geometry.width / 8)).toBeLessThanOrEqual(0.5);
      }
    }
  });

  test('camera and gallery re-arm after New scan and accept the same file repeatedly', async ({ page }) => {
    const captured = await mockBeta(page);
    await page.goto('/scanner/beta');

    await chooseThroughButton(page, 'Take Photo');
    await expect(page.locator('#reviewView')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('#cameraInput')).toHaveValue('');

    await page.getByRole('button', { name: 'New scan', exact: true }).click();
    await expect(page.locator('#captureView')).toBeVisible();
    await chooseThroughButton(page, 'Take Photo');
    await expect(page.locator('#reviewView')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('#cameraInput')).toHaveValue('');

    await page.getByRole('button', { name: 'New scan', exact: true }).click();
    await chooseThroughButton(page, 'Choose Photo');
    await expect(page.locator('#reviewView')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('#galleryInput')).toHaveValue('');

    await page.getByRole('button', { name: 'New scan', exact: true }).click();
    await chooseThroughButton(page, 'Choose Photo');
    await expect(page.locator('#reviewView')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('#galleryInput')).toHaveValue('');

    await page.getByRole('button', { name: 'New scan', exact: true }).click();
    await chooseThroughButton(page, 'Take Photo');
    await expect(page.locator('#reviewView')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('#cameraInput')).toHaveValue('');

    expect(captured.recognition).toHaveLength(5);
    expect(captured.scans).toHaveLength(5);
    expect(captured.scans.map(({ metadata }) => metadata.captureType)).toEqual([
      'camera', 'camera', 'gallery', 'gallery', 'camera'
    ]);
    expect(captured.feedback).toHaveLength(0);
    expect(captured.failures).toHaveLength(0);
  });

  test('reset invalidates an in-flight recognition result without feedback or failure submission', async ({ page }) => {
    await page.addInitScript((responseBody) => {
      const originalFetch = window.fetch.bind(window);
      window.__recognitionStarted = false;
      window.__releaseRecognition = null;
      window.fetch = (input, init) => {
        const url = new URL(typeof input === 'string' ? input : input.url, location.href);
        if (!url.pathname.endsWith('/api/scanner/beta/recognize')) return originalFetch(input, init);
        window.__recognitionStarted = true;
        return new Promise((resolve, reject) => {
          const signal = init?.signal;
          const onAbort = () => reject(new DOMException('Recognition canceled.', 'AbortError'));
          if (signal?.aborted) return onAbort();
          signal?.addEventListener('abort', onAbort, { once: true });
          window.__releaseRecognition = () => {
            signal?.removeEventListener('abort', onAbort);
            resolve(new Response(JSON.stringify(responseBody), {
              status: 200,
              headers: { 'Content-Type': 'application/json' }
            }));
          };
        });
      };
    }, prediction());
    const captured = await mockBeta(page);
    await page.goto('/scanner/beta');
    await page.locator('#galleryInput').setInputFiles(imageFixture);
    await expect(page.locator('#readingView')).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.__recognitionStarted), { timeout: 20_000 }).toBe(true);
    await page.locator('#newScan').evaluate((button) => button.click());
    await expect(page.locator('#captureView')).toBeVisible();
    await page.evaluate(() => window.__releaseRecognition?.());
    await page.waitForTimeout(100);
    await expect(page.locator('#captureView')).toBeVisible();
    expect(captured.scans).toHaveLength(0);
    expect(captured.feedback).toHaveLength(0);
    expect(captured.failures).toHaveLength(0);
  });
});
