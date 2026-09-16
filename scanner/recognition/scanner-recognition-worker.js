(function (workerScope) {
  'use strict';

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

  function postError(message, code) {
    workerScope.postMessage({
      type: 'recognition-error',
      protocol: PROTOCOL,
      version: VERSION,
      generation: Number.isSafeInteger(message?.generation) ? message.generation : null,
      requestId: typeof message?.requestId === 'string' ? message.requestId : null,
      code,
      message: 'The local recognition worker could not process this image.'
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
      const probe = deterministicPixelProbe(message.image.pixels);
      const completedAt = workerScope.performance.now();
      workerScope.postMessage({
        type: 'image-ready',
        protocol: PROTOCOL,
        version: VERSION,
        generation: message.generation,
        requestId: message.requestId,
        metadata: message.metadata,
        timing: { workerProcessMs: Math.max(0, completedAt - startedAt) },
        probe
      });
    } catch (_) {
      postError(message, 'worker-processing-failed');
    }
  };
})(self);
