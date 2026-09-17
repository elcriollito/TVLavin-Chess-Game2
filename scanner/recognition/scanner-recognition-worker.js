(function (workerScope) {
  'use strict';

  let geometryLoadFailure = null;
  try {
    workerScope.importScripts?.(
      '/scanner/recognition/scanner-board-geometry.js?v=0.1.0',
      '/scanner/recognition/scanner-board-localizer.js?v=0.2.0'
    );
  } catch (error) {
    geometryLoadFailure = error;
  }

  const VERSION = 1;
  const PROTOCOL = 'caissa-scanner-recognition-worker/1';
  const MAX_WORKING_PIXELS = 4_000_000;
  const MIN_IMAGE_EDGE = 64;
  const MAX_CANCELED_KEYS = 64;
  const SUPPORTED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
  const canceledKeys = new Set();

  function keyFor(message) {
    return `${message.generation}:${message.requestId}`;
  }

  function postError(message, code, diagnostics = null, timing = null) {
    workerScope.postMessage({
      type: 'recognition-error',
      protocol: PROTOCOL,
      version: VERSION,
      generation: Number.isSafeInteger(message?.generation) ? message.generation : null,
      requestId: typeof message?.requestId === 'string' ? message.requestId : null,
      code,
      message: 'The local recognition worker could not process this image.',
      diagnostics,
      timing
    });
  }

  function validIdentity(message) {
    return Number.isSafeInteger(message?.generation)
      && message.generation >= 0
      && typeof message.requestId === 'string'
      && message.requestId.length > 0
      && message.requestId.length <= 128;
  }

  function validateProcessMessage(message) {
    if (!message || message.type !== 'process-image' || message.version !== VERSION || message.protocol !== PROTOCOL) return 'malformed-payload';
    if (!validIdentity(message)) return 'malformed-payload';
    const metadata = message.metadata;
    const pixels = message.image?.pixels;
    if (!metadata || !(pixels instanceof ArrayBuffer)) return 'malformed-payload';
    const { workingWidth, workingHeight, mimeType } = metadata;
    if (!Number.isSafeInteger(workingWidth) || !Number.isSafeInteger(workingHeight)) return 'image-dimensions-invalid';
    if (workingWidth < MIN_IMAGE_EDGE || workingHeight < MIN_IMAGE_EDGE) return 'image-too-small';
    if (workingWidth * workingHeight > MAX_WORKING_PIXELS) return 'image-dimensions-invalid';
    if (pixels.byteLength !== workingWidth * workingHeight * 4) return 'malformed-payload';
    if (!SUPPORTED_MIME_TYPES.has(mimeType)) return 'unsupported-image-type';
    return null;
  }

  function deterministicPixelProbe(pixels) {
    const bytes = new Uint8Array(pixels);
    const stride = Math.max(1, Math.floor(bytes.length / 4_096));
    let checksum = 2_166_136_261;
    let samples = 0;
    for (let index = 0; index < bytes.length; index += stride) {
      checksum ^= bytes[index];
      checksum = Math.imul(checksum, 16_777_619) >>> 0;
      samples += 1;
    }
    return Object.freeze({
      byteLength: bytes.byteLength,
      samples,
      checksum,
      firstByte: bytes[0],
      lastByte: bytes[bytes.length - 1]
    });
  }

  function rememberCanceled(key) {
    canceledKeys.add(key);
    while (canceledKeys.size > MAX_CANCELED_KEYS) {
      canceledKeys.delete(canceledKeys.values().next().value);
    }
  }

  workerScope.onmessage = (event) => {
    const message = event.data;
    if (message?.type === 'dispose') {
      canceledKeys.clear();
      workerScope.close?.();
      return;
    }
    if (message?.type === 'cancel') {
      if (validIdentity(message)) {
        rememberCanceled(keyFor(message));
        workerScope.postMessage({
          type: 'job-canceled',
          protocol: PROTOCOL,
          version: VERSION,
          generation: message.generation,
          requestId: message.requestId
        });
      }
      return;
    }

    const validationError = validateProcessMessage(message);
    if (validationError) {
      postError(message, validationError);
      return;
    }
    const key = keyFor(message);
    if (canceledKeys.delete(key)) {
      postError(message, 'canceled');
      return;
    }

    const startedAt = workerScope.performance.now();
    try {
      const localizer = workerScope.CaissaScannerBoardLocalizer;
      if (geometryLoadFailure || !localizer?.localizeAndRectify) {
        postError(message, 'worker-processing-failed', { stage: 'geometry-module-load' });
        return;
      }
      const probe = deterministicPixelProbe(message.image.pixels);
      const boardSize = message.geometry?.boardSize || 512;
      if (!Number.isSafeInteger(boardSize) || boardSize <= 0 || boardSize % 8 !== 0) {
        postError(message, 'geometry-contract-failed', { stage: 'canonical-board-size' });
        return;
      }
      const result = localizer.localizeAndRectify({
        pixels: message.image.pixels,
        width: message.metadata.workingWidth,
        height: message.metadata.workingHeight,
        boardSize,
        now: () => workerScope.performance.now()
      });
      if (!result.ok) {
        postError(message, result.error.code, result.error.diagnostics, result.timing);
        return;
      }
      const completedAt = workerScope.performance.now();
      workerScope.postMessage({
        type: 'board-localized',
        protocol: PROTOCOL,
        version: VERSION,
        status: result.status,
        generation: message.generation,
        requestId: message.requestId,
        metadata: message.metadata,
        board: result.board,
        supportBoundary: result.supportBoundary,
        diagnostics: result.diagnostics,
        timing: {
          workerProcessMs: Math.max(0, completedAt - startedAt),
          ...result.timing
        },
        probe
      }, [result.board.pixels]);
    } catch (_) {
      postError(message, 'worker-processing-failed');
    }
  };
})(self);
