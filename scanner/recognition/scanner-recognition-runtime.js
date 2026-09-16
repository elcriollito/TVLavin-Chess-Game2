(function (global) {
  'use strict';

  const VERSION = 1;
  const PROTOCOL = 'caissa-scanner-recognition-worker/1';
  const DEFAULT_WORKER_URL = '/scanner/recognition/scanner-recognition-worker.js?v=0.2.0';
  const DEFAULT_BOARD_SIZE = 512;

  function createError(decoder, code, message, details = null) {
    const ErrorClass = decoder?.ScannerRecognitionError;
    const error = ErrorClass ? new ErrorClass(code, message) : new Error(message);
    if (!error.code) error.code = code;
    if (details?.diagnostics) error.diagnostics = details.diagnostics;
    if (details?.timing) error.timing = details.timing;
    return error;
  }

  function create(options = {}) {
    const decoder = options.decoder || global.CaissaScannerImageDecode;
    const WorkerClass = options.WorkerClass || global.Worker;
    const workerUrl = options.workerUrl || DEFAULT_WORKER_URL;
    const now = options.now || (() => global.performance.now());
    const isGenerationCurrent = options.isGenerationCurrent || (() => true);
    const boardSize = options.boardSize || DEFAULT_BOARD_SIZE;
    let worker = null;
    let active = null;
    let requestSequence = 0;
    let disposed = false;
    const pending = new Map();

    function rejectPending(error) {
      for (const job of pending.values()) job.reject(error);
      pending.clear();
    }

    function handleWorkerFailure(event) {
      event?.preventDefault?.();
      const error = createError(decoder, 'worker-processing-failed', 'The local recognition worker stopped unexpectedly.');
      rejectPending(error);
      active = null;
      worker?.terminate?.();
      worker = null;
    }

    function handleWorkerMessage(event) {
      const message = event.data;
      if (!message || message.protocol !== PROTOCOL || message.version !== VERSION) return;
      if (message.type === 'job-canceled') return;
      const job = pending.get(message.requestId);
      if (!job || job.generation !== message.generation) return;
      pending.delete(message.requestId);
      if (job.token.canceled) return;
      if (!isGenerationCurrent(job.generation)) {
        job.reject(createError(decoder, 'stale-generation', 'A newer scan replaced this result.'));
        return;
      }
      if (message.type === 'recognition-error') {
        job.reject(createError(
          decoder,
          message.code || 'worker-processing-failed',
          message.message || 'Local worker processing failed.',
          { diagnostics: message.diagnostics, timing: message.timing }
        ));
        return;
      }
      if (message.type !== 'board-localized') {
        job.reject(createError(decoder, 'worker-processing-failed', 'The local worker returned an invalid response.'));
        return;
      }
      job.resolve(message);
    }

    function ensureWorker() {
      if (disposed) throw createError(decoder, 'worker-init-failed', 'The local recognition runtime has been disposed.');
      if (worker) return worker;
      if (typeof WorkerClass !== 'function') throw createError(decoder, 'worker-init-failed', 'Web Workers are unavailable.');
      try {
        worker = new WorkerClass(workerUrl);
        worker.onmessage = handleWorkerMessage;
        worker.onerror = handleWorkerFailure;
        worker.onmessageerror = handleWorkerFailure;
        return worker;
      } catch (_) {
        worker = null;
        throw createError(decoder, 'worker-init-failed', 'The local recognition worker could not start.');
      }
    }

    function cancelActive(reason = 'canceled') {
      const token = active;
      if (!token) return false;
      token.canceled = true;
      if (worker) {
        try {
          worker.postMessage({
            type: 'cancel',
            protocol: PROTOCOL,
            version: VERSION,
            generation: token.generation,
            requestId: token.requestId,
            reason
          });
        } catch (_) {}
      }
      const job = pending.get(token.requestId);
      if (job) {
        pending.delete(token.requestId);
        job.reject(createError(decoder, 'canceled', 'Image processing was canceled.'));
      }
      active = null;
      return true;
    }

    async function processImage(blob, generation) {
      if (disposed) throw createError(decoder, 'worker-init-failed', 'The local recognition runtime has been disposed.');
      if (!Number.isSafeInteger(generation) || generation < 0) {
        throw createError(decoder, 'stale-generation', 'A valid Scanner generation is required.');
      }
      if (!Number.isSafeInteger(boardSize) || boardSize <= 0 || boardSize % 8 !== 0) {
        throw createError(decoder, 'geometry-contract-failed', 'Canonical board size must be a positive integer divisible by 8.');
      }
      if (!decoder?.decodeImageBlob) {
        throw createError(decoder, 'decode-failed', 'The local image decoder is unavailable.');
      }
      cancelActive('new-scan');
      const token = {
        generation,
        requestId: `${generation}:${++requestSequence}`,
        canceled: false
      };
      active = token;
      const startedAt = now();
      try {
        const decoded = await decoder.decodeImageBlob(blob, { isCanceled: () => token.canceled });
        if (token.canceled) throw createError(decoder, 'canceled', 'Image processing was canceled.');
        if (!isGenerationCurrent(generation)) throw createError(decoder, 'stale-generation', 'A newer scan replaced this decode result.');
        const localWorker = ensureWorker();
        const transferStartedAt = now();
        const response = await new Promise((resolve, reject) => {
          pending.set(token.requestId, { token, generation, resolve, reject });
          try {
            localWorker.postMessage({
              type: 'process-image',
              protocol: PROTOCOL,
              version: VERSION,
              generation,
              requestId: token.requestId,
              image: { pixels: decoded.pixels },
              metadata: decoded.metadata,
              geometry: { boardSize }
            }, [decoded.pixels]);
          } catch (_) {
            pending.delete(token.requestId);
            reject(createError(decoder, 'worker-processing-failed', 'The image could not be transferred to the local worker.'));
          }
        });
        if (token.canceled) throw createError(decoder, 'canceled', 'Image processing was canceled.');
        if (!isGenerationCurrent(generation)) throw createError(decoder, 'stale-generation', 'A newer scan replaced this worker result.');
        const completedAt = now();
        return Object.freeze({
          status: response.status,
          generation,
          requestId: token.requestId,
          metadata: Object.freeze({ ...response.metadata }),
          board: response.board ? Object.freeze({ ...response.board }) : null,
          diagnostics: response.diagnostics ? Object.freeze({ ...response.diagnostics }) : null,
          probe: Object.freeze({ ...response.probe }),
          timing: Object.freeze({
            ...decoded.timing,
            ...response.timing,
            workerTransferMs: Math.max(0, completedAt - transferStartedAt),
            workerProcessMs: response.timing?.workerProcessMs || 0,
            totalPreprocessMs: Math.max(0, completedAt - startedAt)
          })
        });
      } finally {
        pending.delete(token.requestId);
        if (active === token) active = null;
      }
    }

    function dispose() {
      if (disposed) return;
      cancelActive('dispose');
      disposed = true;
      rejectPending(createError(decoder, 'canceled', 'The local recognition runtime was disposed.'));
      if (worker) {
        try {
          worker.postMessage({ type: 'dispose', protocol: PROTOCOL, version: VERSION });
        } catch (_) {}
        worker.terminate?.();
      }
      worker = null;
    }

    function snapshot() {
      return Object.freeze({
        workerCreated: Boolean(worker),
        active: active ? Object.freeze({ generation: active.generation, requestId: active.requestId }) : null,
        pendingCount: pending.size,
        disposed
      });
    }

    return Object.freeze({
      processImage,
      cancelActive,
      dispose,
      snapshot,
      supportsMimeType: (type) => decoder?.supportsMimeType?.(type) === true
    });
  }

  global.CaissaScannerRecognitionRuntime = Object.freeze({
    VERSION,
    PROTOCOL,
    DEFAULT_WORKER_URL,
    DEFAULT_BOARD_SIZE,
    create
  });
})(window);
