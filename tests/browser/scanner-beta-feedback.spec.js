import { test, expect } from '@playwright/test';
import sharp from 'sharp';
import { scannerBoardImage as imageFixture, scannerPlainImage } from './fixtures/scanner-board-image.js';

const FEN = '4k3/8/8/8/8/8/8/4K3 w - - 0 1';
const jpegFixture = Object.freeze({
  name: 'scanner-board.jpg', mimeType: 'image/jpeg', buffer: await sharp(imageFixture.buffer).jpeg().toBuffer()
});
const webpFixture = Object.freeze({
  name: 'scanner-board.webp', mimeType: 'image/webp', buffer: await sharp(imageFixture.buffer).webp().toBuffer()
});

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
  recognitionFailures = 0, recognitionNetworkFailures = 0, recognitionResponses = [], statusDelayMs = 0 } = {}) {
  const captured = { scans: [], feedback: [], failures: [], recognition: [], feedbackAttempts: 0, recognitionAttempts: 0 };
  await page.route('**/api/scanner/beta/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/status')) {
      if (statusDelayMs) await new Promise((resolve) => setTimeout(resolve, statusDelayMs));
      return route.fulfill({ status: 200, json: { available: true } });
    }
    if (path.endsWith('/recognize')) {
      captured.recognitionAttempts += 1;
      captured.recognition.push(route.request().postDataJSON());
      const scripted = recognitionResponses[captured.recognitionAttempts - 1];
      if (scripted?.networkFailure) return route.abort(scripted.networkFailure);
      if (scripted) return route.fulfill({ status: scripted.status, json: scripted.json || {} });
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
      const squareStyle = getComputedStyle(square);
      return {
        left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom,
        width: rect.width, height: rect.height,
        borderRadius: squareStyle.borderRadius,
        margin: squareStyle.margin
      };
    });
    const style = getComputedStyle(board);
    return {
      width: boardRect.width,
      height: boardRect.height,
      gridColumns: style.gridTemplateColumns.split(' ').length,
      gridRows: style.gridTemplateRows.split(' ').length,
      columnGap: style.columnGap,
      rowGap: style.rowGap,
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
      overflowElements: [...document.body.querySelectorAll('*')].flatMap((element) => {
        const rect = element.getBoundingClientRect();
        return rect.left < -0.5 || rect.right > innerWidth + 0.5
          ? [{ tag: element.tagName, id: element.id, className: String(element.className), left: rect.left, right: rect.right }]
          : [];
      }).slice(0, 10),
      pieceSources: [...board.querySelectorAll('.piece-img:not([hidden])')].map((image) => new URL(image.src).pathname),
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
    const reviewState = await page.locator('#betaBoard').evaluate((board) => {
      window.__caissaBetaBoardReference = board;
      return { fen: board.dataset.fen, orientation: board.dataset.orientation, editable: board.dataset.editable };
    });
    await page.getByRole('button', { name: 'Confirm Correct', exact: true }).click();
    await expect(page.locator('#workspaceView')).toBeVisible();
    await expect(page.locator('#workspaceBoardSlot > #betaBoardShell #betaBoard .sq')).toHaveCount(64);
    const readyState = await page.locator('#betaBoard').evaluate((board) => ({
      fen: board.dataset.fen,
      orientation: board.dataset.orientation,
      editable: board.dataset.editable,
      sameNode: window.__caissaBetaBoardReference === board
    }));
    expect(readyState).toEqual({ ...reviewState, editable: 'false', sameNode: true });
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
    const correctedFen = await page.locator('#betaBoard').getAttribute('data-fen');
    await expect(page.getByRole('button', { name: 'Position Correct Now' })).toBeVisible();
    await page.getByRole('button', { name: 'Position Correct Now' }).click();
    await expect(page.locator('#workspaceView')).toBeVisible();
    await expect(page.locator('#betaBoard')).toHaveAttribute('data-fen', correctedFen);
    await expect(page.locator('#betaBoard')).toHaveAttribute('data-editable', 'false');
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
      finalPositionConfirmed: false, localizationValid: false, errorCode: 'INFERENCE_FAILURE'
    });
    expect(captured.recognitionAttempts).toBe(1);
    await expect(page.locator('#syncStatus')).toContainText('temporarily unavailable');
  });

  test('endpoint failure is not automatically retried or charged twice', async ({ page }) => {
    const captured = await mockBeta(page, { recognitionFailures: 1 });
    await page.goto('/scanner/beta');
    await page.locator('#galleryInput').setInputFiles(imageFixture);
    await expect(page.locator('#syncStatus')).toContainText('temporarily unavailable');
    expect(captured.recognitionAttempts).toBe(1);
    expect(captured.failures).toHaveLength(1);
  });

  test('network failure remains distinct and a manual New scan retry makes exactly one new request', async ({ page }) => {
    const captured = await mockBeta(page, { recognitionNetworkFailures: 1 });
    await page.goto('/scanner/beta');
    await page.locator('#cameraInput').setInputFiles(imageFixture);
    await expect(page.locator('#syncStatus')).toContainText('Check your connection');
    expect(captured.recognitionAttempts).toBe(1);
    expect(captured.failures[0].failure).toMatchObject({ failureStage: 'network', errorCode: 'NETWORK_FAILURE' });
    await page.locator('#cameraInput').setInputFiles(imageFixture);
    await expect(page.locator('#reviewView')).toBeVisible({ timeout: 20_000 });
    expect(captured.recognitionAttempts).toBe(2);
    expect(captured.scans).toHaveLength(1);
    expect(captured.scans[0].metadata.captureType).toBe('camera');
  });

  test('gallery accepts JPEG, PNG, WebP, and an empty MIME with a supported extension', async ({ page }) => {
    const captured = await mockBeta(page);
    await page.goto('/scanner/beta');
    const fixtures = [jpegFixture, imageFixture, webpFixture, { ...imageFixture, name: 'ios-gallery.png', mimeType: '' }];
    for (const fixture of fixtures) {
      await page.locator('#galleryInput').setInputFiles(fixture);
      await expect(page.locator('#reviewView')).toBeVisible({ timeout: 20_000 });
      await page.getByRole('button', { name: 'New scan', exact: true }).click();
    }
    expect(captured.recognitionAttempts).toBe(4);
    expect(captured.recognition.map(({ sourceImageType }) => sourceImageType)).toEqual([
      'image/jpeg', 'image/png', 'image/webp', 'image/png'
    ]);
    expect(captured.scans).toHaveLength(4);
  });

  test('HEIC, HEIF, and unsupported MIME values fail clearly without recognition', async ({ page }) => {
    const captured = await mockBeta(page);
    await page.goto('/scanner/beta');
    for (const fixture of [
      { name: 'iphone.heic', mimeType: 'image/heic', buffer: Buffer.from('not-uploaded') },
      { name: 'iphone.heif', mimeType: '', buffer: Buffer.from('not-uploaded') },
      { name: 'board.gif', mimeType: 'image/gif', buffer: Buffer.from('not-uploaded') }
    ]) {
      await page.locator('#galleryInput').setInputFiles(fixture);
      await expect(page.locator('#captureView')).toBeVisible();
      await expect(page.locator('#syncStatus')).toContainText('Unsupported photo format');
    }
    expect(captured.recognitionAttempts).toBe(0);
    expect(captured.failures).toHaveLength(3);
    expect(captured.failures.map(({ failure }) => [failure.failureStage, failure.errorCode])).toEqual([
      ['unsupported-input', 'UNSUPPORTED_IMAGE'],
      ['unsupported-input', 'UNSUPPORTED_IMAGE'],
      ['unsupported-input', 'UNSUPPORTED_IMAGE']
    ]);
  });

  test('a late startup status response cannot erase a gallery error', async ({ page }) => {
    const captured = await mockBeta(page, { statusDelayMs: 500 });
    await page.goto('/scanner/beta');
    await page.locator('#galleryInput').setInputFiles({
      name: 'iphone.heic', mimeType: 'image/heic', buffer: Buffer.from('not-uploaded')
    });
    await expect(page.locator('#syncStatus')).toContainText('Unsupported photo format');
    await page.waitForTimeout(700);
    await expect(page.locator('#syncStatus')).toContainText('Unsupported photo format');
    expect(captured.recognitionAttempts).toBe(0);
  });

  test('decode and localization failures stay visible and do not call recognition', async ({ page }) => {
    const captured = await mockBeta(page);
    await page.goto('/scanner/beta');
    await page.locator('#galleryInput').setInputFiles({
      name: 'broken.png', mimeType: 'image/png', buffer: Buffer.from('invalid-png')
    });
    await expect(page.locator('#syncStatus')).toContainText('Could not read this image');
    await page.locator('#galleryInput').setInputFiles(scannerPlainImage);
    await expect(page.locator('#syncStatus')).toContainText('Board could not be detected', { timeout: 20_000 });
    expect(captured.recognitionAttempts).toBe(0);
    expect(captured.failures.map(({ failure }) => [failure.failureStage, failure.errorCode])).toEqual([
      ['decode', 'DECODE_FAILURE'],
      ['localization', 'LOCALIZATION_FAILURE']
    ]);
  });

  test('typed endpoint and transport failures show distinct messages with one request each', async ({ page }) => {
    test.setTimeout(120_000);
    const cases = [
      [401, { error: 'AUTH_REQUIRED' }, 'session expired', 'authorization', 'AUTH_REQUIRED'],
      [403, { error: 'BETA_ACCESS_DENIED' }, 'does not have Scanner beta access', 'authorization', 'BETA_ACCESS_DENIED'],
      [404, { error: 'BETA_DISABLED' }, 'temporarily unavailable', 'service', 'BETA_DISABLED'],
      [413, { error: 'INVALID_PAYLOAD' }, 'too large', 'service', 'PAYLOAD_TOO_LARGE'],
      [415, { error: 'INVALID_IMAGE' }, 'Unsupported photo format', 'unsupported-input', 'UNSUPPORTED_IMAGE'],
      [422, { error: 'INVALID_PAYLOAD' }, 'could not be prepared', 'service', 'INVALID_PAYLOAD'],
      [429, { error: 'RATE_LIMITED' }, 'Too many scan attempts', 'rate-limit', 'RATE_LIMIT'],
      [500, { error: 'INFERENCE_FAILURE' }, 'temporarily unavailable', 'classifier', 'INFERENCE_FAILURE'],
      [504, { error: 'TIMEOUT' }, 'took too long', 'service', 'TIMEOUT']
    ];
    const captured = await mockBeta(page, {
      recognitionResponses: cases.map(([status, json]) => ({ status, json }))
    });
    await page.goto('/scanner/beta');
    for (let index = 0; index < cases.length; index += 1) {
      const [, , message, stage, code] = cases[index];
      await page.locator('#galleryInput').setInputFiles(imageFixture);
      await expect(page.locator('#syncStatus')).toContainText(message, { timeout: 20_000 });
      expect(captured.recognitionAttempts).toBe(index + 1);
      expect(captured.failures[index].failure).toMatchObject({ failureStage: stage, errorCode: code });
    }
    expect(captured.scans).toHaveLength(0);
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
      expect(geometry.columnGap).toBe('0px');
      expect(geometry.rowGap).toBe('0px');
      expect(geometry.horizontalOverflow, JSON.stringify(geometry.overflowElements)).toBe(false);
      expect(geometry.pieceSources).toEqual(expect.arrayContaining([
        '/img/chesspieces/wikipedia/bK.png', '/img/chesspieces/wikipedia/wK.png'
      ]));
      expect(geometry.squares).toHaveLength(64);
      for (const [index, square] of geometry.squares.entries()) {
        expect(Math.abs(square.width - square.height)).toBeLessThanOrEqual(0.5);
        expect(Math.abs(square.width - geometry.width / 8)).toBeLessThanOrEqual(0.5);
        expect(square.borderRadius).toBe('0px');
        expect(square.margin).toBe('0px');
        if (index % 8 !== 7) expect(Math.abs(square.right - geometry.squares[index + 1].left)).toBeLessThanOrEqual(0.5);
        if (index < 56) expect(Math.abs(square.bottom - geometry.squares[index + 8].top)).toBeLessThanOrEqual(0.5);
      }
    }
  });

  test('Review and Position Ready use the canonical presentation on the same persistent board', async ({ page }) => {
    await mockBeta(page);
    await page.goto('/scanner/beta');
    await recognize(page);
    await expect(page.locator('link[href^="/scanner/scanner-experience.css"]')).toHaveCount(1);
    const reviewGeometry = await boardGeometry(page, '#betaBoard');
    const reviewFen = await page.locator('#betaBoard').getAttribute('data-fen');
    await page.locator('#betaBoard').evaluate((board) => { window.__caissaBetaBoardReference = board; });
    await page.getByRole('button', { name: 'Confirm Correct', exact: true }).click();
    await expect(page.locator('#workspaceView')).toBeVisible();
    const readyGeometry = await boardGeometry(page, '#betaBoard');
    expect(await page.locator('#betaBoard').evaluate((board) => window.__caissaBetaBoardReference === board)).toBe(true);
    expect(await page.locator('#betaBoard').getAttribute('data-fen')).toBe(reviewFen);
    expect(readyGeometry.width).toBeCloseTo(reviewGeometry.width, 1);
    expect(readyGeometry.height).toBeCloseTo(reviewGeometry.height, 1);
    expect(readyGeometry.squares.map(({ borderRadius }) => borderRadius)).toEqual(Array(64).fill('0px'));
  });

  test('explicit black-bottom orientation is stable from Review through Position Ready', async ({ page }) => {
    const captured = await mockBeta(page);
    await page.goto('/scanner/beta');
    await page.locator('#orientation').selectOption('black-at-bottom');
    await recognize(page);
    await expect(page.locator('#betaBoard')).toHaveAttribute('data-orientation', 'black-at-bottom');
    await expect(page.locator('#betaBoard .sq').first()).toHaveAttribute('aria-label', 'h1 empty');
    await expect(page.locator('#betaBoard .sq').last()).toHaveAttribute('aria-label', 'a8 empty');
    await page.getByRole('button', { name: 'Confirm Correct', exact: true }).click();
    await expect(page.locator('#workspaceView')).toBeVisible();
    await expect(page.locator('#betaBoard')).toHaveAttribute('data-orientation', 'black-at-bottom');
    await expect(page.locator('#betaBoard .sq').first()).toHaveAttribute('aria-label', 'h1 empty');
    expect(captured.recognition[0].orientation).toBe('black-at-bottom');
    expect(captured.scans[0].snapshot.orientation).toBe('black-at-bottom');
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
