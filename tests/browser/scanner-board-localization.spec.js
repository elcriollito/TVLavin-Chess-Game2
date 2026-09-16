import { test, expect } from '@playwright/test';
import {
  scannerMultipleBoardImage,
  scannerPerspectiveBoardImage,
  scannerPlainImage
} from './fixtures/scanner-board-image.js';

async function openScanner(page) {
  await page.goto('/scanner/index.html');
  await expect.poll(() => page.evaluate(() => Boolean(window.CaissaScannerRecognitionRuntime))).toBe(true);
}

async function processBytes(page, fixture, generation = 1) {
  const base64 = fixture.buffer.toString('base64');
  return page.evaluate(async ({ encoded, mimeType, generation: requestedGeneration }) => {
    const binary = atob(encoded);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    const runtime = window.CaissaScannerRecognitionRuntime.create({
      isGenerationCurrent: (value) => value === requestedGeneration
    });
    try {
      const result = await runtime.processImage(new Blob([bytes], { type: mimeType }), requestedGeneration);
      return {
        ok: true,
        status: result.status,
        generation: result.generation,
        requestId: result.requestId,
        corners: result.board.corners,
        boardSize: result.board.boardSize,
        pixelBytes: result.board.pixels.byteLength,
        tileCount: result.board.geometry.tiles.length,
        tileSize: result.board.geometry.tileSize,
        orientation: result.board.orientation,
        scores: {
          candidate: result.board.candidateScore,
          geometry: result.board.geometryScore,
          grid: result.board.gridEvidenceScore
        },
        timing: result.timing
      };
    } catch (error) {
      return {
        ok: false,
        code: error.code,
        candidateCount: error.diagnostics?.candidateCount || 0,
        summaries: error.diagnostics?.candidateSummaries?.length || 0
      };
    } finally {
      runtime.dispose();
    }
  }, { encoded: base64, mimeType: fixture.mimeType, generation });
}

test.describe('CAISSA Scanner board localization and homography Worker', () => {
  test('perspective board becomes a 512 square canonical image with 64 equal cells', async ({ page }) => {
    await openScanner(page);
    const result = await processBytes(page, scannerPerspectiveBoardImage);
    expect(result.ok).toBe(true);
    expect(result.status).toBe('board-localized');
    expect(result.generation).toBe(1);
    expect(result.requestId).toMatch(/^1:/);
    expect(result.boardSize).toBe(512);
    expect(result.pixelBytes).toBe(512 * 512 * 4);
    expect(result.tileCount).toBe(64);
    expect(result.tileSize).toBe(64);
    expect(result.orientation).toBe('unknown');
    expect(result.corners).toHaveLength(4);
    expect(result.scores.candidate).toBeGreaterThanOrEqual(0.5);
    expect(result.scores.grid).toBeGreaterThanOrEqual(0.35);
    for (const field of ['localizationMs', 'candidateScoringMs', 'homographyMs', 'geometryValidationMs', 'totalGeometryMs']) {
      expect(result.timing[field]).toBeGreaterThanOrEqual(0);
    }
  });

  test('plain image returns board-not-found without a crop fallback', async ({ page }) => {
    await openScanner(page);
    const result = await processBytes(page, scannerPlainImage);
    expect(result).toMatchObject({ ok: false, code: 'board-not-found' });
    expect(result.summaries).toBeGreaterThan(0);
  });

  test('two similarly scored boards return typed ambiguity', async ({ page }) => {
    await openScanner(page);
    const result = await processBytes(page, scannerMultipleBoardImage);
    expect(result).toMatchObject({ ok: false, code: 'multiple-board-candidates' });
    expect(result.candidateCount).toBeGreaterThanOrEqual(2);
  });

  test('frozen Scanner flow still reaches Review/Edit only after geometry succeeds', async ({ page }) => {
    const nonGetRequests = [];
    page.on('request', (request) => {
      if (request.method() !== 'GET') nonGetRequests.push({ method: request.method(), url: request.url() });
    });
    await openScanner(page);
    await page.locator('#galleryInput').setInputFiles(scannerPerspectiveBoardImage);
    await expect(page.locator('#readingView')).toBeVisible();
    await expect(page.locator('#reviewEditView')).toBeVisible();
    const candidate = await page.evaluate(() => window.CaissaScannerState.snapshot().candidate);
    expect(candidate).toMatchObject({
      recognitionStage: 'geometry-only',
      pieceRecognition: 'not-implemented',
      orientation: 'unknown',
      localization: {
        status: 'board-localized',
        boardSize: 512
      }
    });
    expect(candidate.localization.corners).toHaveLength(4);
    expect(nonGetRequests).toEqual([]);
  });

  test('no-board failure returns through the existing safe Capture flow', async ({ page }) => {
    await openScanner(page);
    await page.locator('#galleryInput').setInputFiles(scannerPlainImage);
    await expect(page.locator('#readingView')).toBeVisible();
    await expect(page.locator('#homeView')).toBeVisible();
    await expect(page.locator('#reviewEditView')).toBeHidden();
    await expect(page.locator('#appToast')).toHaveText('Could not read that image. Choose another image to try again.');
    expect((await page.evaluate(() => window.CaissaScannerState.snapshot())).state).toBe('idle');
  });
});
