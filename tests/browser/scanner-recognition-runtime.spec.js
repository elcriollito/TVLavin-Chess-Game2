import { test, expect } from '@playwright/test';
import { scannerBoardImage as imageFixture } from './fixtures/scanner-board-image.js';

async function openScanner(page) {
  await page.goto('/scanner/index.html');
  await expect.poll(() => page.evaluate(() => Boolean(
    window.CaissaScannerImageDecode && window.CaissaScannerRecognitionRuntime
  ))).toBe(true);
}

test.describe('CAISSA Scanner local recognition runtime', () => {
  test('browser-native JPEG, PNG, and available WebP decode locally with metadata', async ({ page }) => {
    await openScanner(page);
    const results = await page.evaluate(async () => {
      async function fixture(type) {
        const canvas = document.createElement('canvas');
        canvas.width = 320;
        canvas.height = 180;
        const context = canvas.getContext('2d');
        context.fillStyle = '#e7d6b3';
        context.fillRect(0, 0, 320, 180);
        context.fillStyle = '#102638';
        context.fillRect(30, 20, 120, 130);
        const blob = await new Promise((resolve) => canvas.toBlob(resolve, type, 0.9));
        if (!blob || blob.type !== type) return { requestedType: type, supported: false };
        const decoded = await window.CaissaScannerImageDecode.decodeImageBlob(blob);
        return {
          requestedType: type,
          supported: true,
          byteLength: decoded.pixels.byteLength,
          metadata: decoded.metadata,
          timing: decoded.timing
        };
      }
      return Promise.all(['image/jpeg', 'image/png', 'image/webp'].map(fixture));
    });

    for (const requiredType of ['image/jpeg', 'image/png']) {
      const result = results.find(({ requestedType }) => requestedType === requiredType);
      expect(result.supported).toBe(true);
      expect(result.metadata.mimeType).toBe(requiredType);
      expect(result.metadata.sourceWidth).toBe(320);
      expect(result.metadata.sourceHeight).toBe(180);
      expect(result.metadata.workingWidth).toBe(320);
      expect(result.metadata.workingHeight).toBe(180);
      expect(result.metadata.resized).toBe(false);
      expect(result.metadata.preprocessingVersion).toBe('caissa-scanner-local-decode/1');
      expect(result.byteLength).toBe(320 * 180 * 4);
      expect(result.timing.totalPreprocessMs).toBeGreaterThanOrEqual(0);
    }

    const webp = results.find(({ requestedType }) => requestedType === 'image/webp');
    if (webp.supported) {
      expect(webp.metadata.mimeType).toBe('image/webp');
      expect(webp.byteLength).toBe(320 * 180 * 4);
    }
  });

  test('invalid bytes, unsupported types, and tiny images return typed local failures', async ({ page }) => {
    await openScanner(page);
    const failures = await page.evaluate(async () => {
      async function codeFor(action) {
        try {
          await action();
          return null;
        } catch (error) {
          return error.code;
        }
      }
      const invalid = await codeFor(() => window.CaissaScannerImageDecode.decodeImageBlob(
        new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'image/png' })
      ));
      const unsupported = await codeFor(() => window.CaissaScannerImageDecode.decodeImageBlob(
        new Blob(['GIF89a'], { type: 'image/gif' })
      ));
      const tinyCanvas = document.createElement('canvas');
      tinyCanvas.width = 32;
      tinyCanvas.height = 32;
      const tinyBlob = await new Promise((resolve) => tinyCanvas.toBlob(resolve, 'image/png'));
      const tiny = await codeFor(() => window.CaissaScannerImageDecode.decodeImageBlob(tinyBlob));
      return { invalid, unsupported, tiny };
    });
    expect(failures).toEqual({
      invalid: 'decode-failed',
      unsupported: 'unsupported-image-type',
      tiny: 'image-too-small'
    });
  });

  test('oversized decode downscales without crop or stretch', async ({ page }) => {
    await openScanner(page);
    const result = await page.evaluate(async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 3000;
      canvas.height = 1500;
      const context = canvas.getContext('2d');
      context.fillStyle = '#9b6f4a';
      context.fillRect(0, 0, canvas.width, canvas.height);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.75));
      const decoded = await window.CaissaScannerImageDecode.decodeImageBlob(blob);
      return { metadata: decoded.metadata, byteLength: decoded.pixels.byteLength };
    });
    expect(result.metadata.sourceWidth).toBe(3000);
    expect(result.metadata.sourceHeight).toBe(1500);
    expect(result.metadata.workingWidth).toBe(2048);
    expect(result.metadata.workingHeight).toBe(1024);
    expect(result.metadata.resized).toBe(true);
    expect(result.metadata.workingWidth / result.metadata.workingHeight).toBe(2);
    expect(result.byteLength).toBe(2048 * 1024 * 4);
  });

  test('browser-native decode applies EXIF orientation once without manual double rotation', async ({ page }) => {
    await openScanner(page);
    const metadata = await page.evaluate(async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 120;
      canvas.height = 80;
      const context = canvas.getContext('2d');
      context.fillStyle = '#102638';
      context.fillRect(0, 0, 120, 80);
      context.fillStyle = '#f2b766';
      context.fillRect(0, 0, 30, 20);
      const plainJpeg = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
      const original = new Uint8Array(await plainJpeg.arrayBuffer());
      const exifOrientationSix = new Uint8Array([
        0xff, 0xe1, 0x00, 0x22,
        0x45, 0x78, 0x69, 0x66, 0x00, 0x00,
        0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08,
        0x00, 0x01,
        0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, 0x00, 0x06, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00
      ]);
      const orientedBytes = new Uint8Array(original.length + exifOrientationSix.length);
      orientedBytes.set(original.slice(0, 2), 0);
      orientedBytes.set(exifOrientationSix, 2);
      orientedBytes.set(original.slice(2), 2 + exifOrientationSix.length);
      const decoded = await window.CaissaScannerImageDecode.decodeImageBlob(
        new Blob([orientedBytes], { type: 'image/jpeg' })
      );
      return decoded.metadata;
    });
    expect(metadata.encodedWidth).toBe(120);
    expect(metadata.encodedHeight).toBe(80);
    expect(metadata.sourceWidth).toBe(80);
    expect(metadata.sourceHeight).toBe(120);
    expect(metadata.workingWidth).toBe(80);
    expect(metadata.workingHeight).toBe(120);
    expect(metadata.orientationHandling).toMatch(/^browser-/);
  });

  test('Image-element Safari fallback revokes its object URL after local decode', async ({ page }) => {
    await openScanner(page);
    const result = await page.evaluate(async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 128;
      canvas.height = 96;
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      let created = 0;
      let revoked = 0;
      const urlApi = {
        createObjectURL(value) {
          created += 1;
          return URL.createObjectURL(value);
        },
        revokeObjectURL(value) {
          revoked += 1;
          URL.revokeObjectURL(value);
        }
      };
      const decoded = await window.CaissaScannerImageDecode.decodeImageBlob(blob, {
        bitmapFactory: null,
        urlApi
      });
      return { created, revoked, orientationHandling: decoded.metadata.orientationHandling };
    });
    expect(result).toEqual({
      created: 1,
      revoked: 1,
      orientationHandling: 'browser-image-element-from-image'
    });
  });

  test('dedicated Worker handles sequential requests and typed malformed payloads', async ({ page }) => {
    await openScanner(page);
    const result = await page.evaluate(async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 128;
      canvas.height = 128;
      const context = canvas.getContext('2d');
      for (let row = 0; row < 8; row += 1) {
        for (let col = 0; col < 8; col += 1) {
          context.fillStyle = (row + col) % 2 ? '#805b3e' : '#ead8b5';
          context.fillRect(col * 16, row * 16, 16, 16);
        }
      }
      context.strokeStyle = '#07131d';
      context.lineWidth = 3;
      context.strokeRect(1.5, 1.5, 125, 125);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      let generation = 1;
      const runtime = window.CaissaScannerRecognitionRuntime.create({
        isGenerationCurrent: (value) => value === generation
      });
      const first = await runtime.processImage(blob, generation);
      generation = 2;
      const second = await runtime.processImage(blob, generation);
      const snapshot = runtime.snapshot();
      runtime.dispose();

      const malformed = await new Promise((resolve) => {
        const worker = new Worker(window.CaissaScannerRecognitionRuntime.DEFAULT_WORKER_URL);
        worker.onmessage = (event) => {
          resolve(event.data);
          worker.terminate();
        };
        worker.postMessage({ type: 'process-image', version: 1 });
      });
      return {
        first: { generation: first.generation, requestId: first.requestId, bytes: first.probe.byteLength, status: first.status, board: { width: first.board.width, tileCount: first.board.geometry.tiles.length } },
        second: { generation: second.generation, requestId: second.requestId, bytes: second.probe.byteLength, status: second.status, board: { width: second.board.width, tileCount: second.board.geometry.tiles.length } },
        snapshot,
        malformed
      };
    });
    expect(result.first.generation).toBe(1);
    expect(result.second.generation).toBe(2);
    expect(result.first.requestId).not.toBe(result.second.requestId);
    expect(result.first.bytes).toBe(128 * 128 * 4);
    expect(result.second.bytes).toBe(128 * 128 * 4);
    expect(result.first.status).toBe('board-localized');
    expect(result.second.status).toBe('board-localized');
    expect(result.first.board.width).toBe(512);
    expect(result.second.board.tileCount).toBe(64);
    expect(result.snapshot).toMatchObject({ workerCreated: true, active: null, pendingCount: 0, disposed: false });
    expect(result.malformed).toMatchObject({ type: 'recognition-error', code: 'malformed-payload' });
  });

  test('existing Scanner flow replaces local sources, releases URLs, and reaches the unchanged mock review seam', async ({ page }) => {
    await page.addInitScript(() => {
      const create = URL.createObjectURL.bind(URL);
      const revoke = URL.revokeObjectURL.bind(URL);
      window.__scannerUrlLifecycle = { created: 0, revoked: 0 };
      URL.createObjectURL = (value) => {
        window.__scannerUrlLifecycle.created += 1;
        return create(value);
      };
      URL.revokeObjectURL = (value) => {
        window.__scannerUrlLifecycle.revoked += 1;
        return revoke(value);
      };
    });
    const nonGetRequests = [];
    page.on('request', (request) => {
      if (request.method() !== 'GET') nonGetRequests.push({ method: request.method(), url: request.url() });
    });
    await openScanner(page);
    await page.locator('#galleryInput').setInputFiles(imageFixture);
    await page.locator('#galleryInput').evaluate((input) => { input.value = ''; });
    await page.locator('#galleryInput').setInputFiles(imageFixture);
    const expectedGeneration = await page.evaluate(() => window.CaissaScannerState.snapshot().generation);
    await expect.poll(() => page.evaluate(() => {
      const snapshot = window.CaissaScannerState.snapshot();
      return {
        state: snapshot.state,
        candidateGeneration: snapshot.candidate?.generation || null
      };
    }), { timeout: 30_000 }).toEqual({ state: 'reviewing-position', candidateGeneration: expectedGeneration });
    await expect(page.locator('#reviewEditView')).toBeVisible();
    const result = await page.evaluate(() => ({
      state: window.CaissaScannerState.snapshot(),
      urlLifecycle: window.__scannerUrlLifecycle,
      previewSource: document.querySelector('#sourcePreview').getAttribute('src')
    }));
    expect(result.state.state).toBe('reviewing-position');
    expect(result.state.candidate.preprocessing).toMatchObject({
      sourceWidth: 256,
      sourceHeight: 256,
      workingWidth: 256,
      workingHeight: 256,
      mimeType: 'image/png',
      backend: 'rgba-arraybuffer-worker'
    });
    expect(result.state.candidate.timingsMs.totalPreprocessMs).toBeGreaterThanOrEqual(0);
    expect(result.state.candidate.recognitionStage).toBe('geometry-only');
    expect(result.state.candidate.pieceRecognition).toBe('not-implemented');
    expect(result.state.candidate.orientation).toBe('unknown');
    expect(result.state.candidate.localization).toMatchObject({
      status: 'board-localized',
      boardSize: 512
    });
    expect(result.urlLifecycle.created).toBeGreaterThan(0);
    expect(result.urlLifecycle.revoked).toBe(result.urlLifecycle.created);
    expect(result.previewSource).toBe(null);
    expect(nonGetRequests).toEqual([]);
  });
});
