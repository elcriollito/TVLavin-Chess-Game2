import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

async function loadBrowserModules() {
  const [decoderSource, runtimeSource] = await Promise.all([
    read('scanner/recognition/scanner-image-decode.js'),
    read('scanner/recognition/scanner-recognition-runtime.js')
  ]);
  const window = { performance: { now: () => 0 } };
  const context = {
    window,
    ArrayBuffer,
    Uint8Array,
    Uint8ClampedArray,
    DataView,
    URL,
    Blob
  };
  vm.runInNewContext(decoderSource, context);
  vm.runInNewContext(runtimeSource, context);
  return window;
}

async function loadWorkerHarness() {
  const source = await read('scanner/recognition/scanner-recognition-worker.js');
  const messages = [];
  let clock = 0;
  const self = {
    performance: { now: () => ++clock },
    postMessage: (message) => messages.push(message),
    closeCalled: false,
    close() { this.closeCalled = true; }
  };
  vm.runInNewContext(source, { self, ArrayBuffer, Uint8Array, Set, Math, Number, Object, String });
  return { self, messages };
}

function metadata(width = 64, height = 64) {
  return {
    sourceWidth: width,
    sourceHeight: height,
    encodedWidth: width,
    encodedHeight: height,
    workingWidth: width,
    workingHeight: height,
    sourceBytes: 100,
    mimeType: 'image/png',
    resized: false,
    orientationHandling: 'browser-create-image-bitmap-from-image',
    preprocessingVersion: 'caissa-scanner-local-decode/1',
    backend: 'rgba-arraybuffer-worker'
  };
}

function processMessage(generation, requestId, width = 64, height = 64) {
  return {
    type: 'process-image',
    protocol: 'caissa-scanner-recognition-worker/1',
    version: 1,
    generation,
    requestId,
    image: { pixels: new ArrayBuffer(width * height * 4) },
    metadata: metadata(width, height)
  };
}

function createFakeDecoder({ decode } = {}) {
  class RecognitionError extends Error {
    constructor(code, message) {
      super(message);
      this.code = code;
    }
  }
  return {
    ScannerRecognitionError: RecognitionError,
    supportsMimeType: (type) => ['image/png', 'image/jpeg', 'image/webp'].includes(type),
    decodeImageBlob: decode || (async () => ({
      pixels: new ArrayBuffer(64 * 64 * 4),
      metadata: metadata(),
      timing: { decodeMs: 2, resizeMs: 1, totalPreprocessMs: 3 }
    }))
  };
}

class FakeWorker {
  static instances = [];

  constructor(url) {
    this.url = url;
    this.messages = [];
    this.terminated = false;
    FakeWorker.instances.push(this);
  }

  postMessage(message, transfer = []) {
    this.messages.push({ message, transfer });
    if (message.type !== 'process-image') return;
    queueMicrotask(() => this.onmessage?.({
      data: {
        type: 'image-ready',
        protocol: message.protocol,
        version: message.version,
        generation: message.generation,
        requestId: message.requestId,
        metadata: message.metadata,
        timing: { workerProcessMs: 1 },
        probe: { byteLength: message.metadata.workingWidth * message.metadata.workingHeight * 4, checksum: 1 }
      }
    }));
  }

  terminate() {
    this.terminated = true;
  }
}

test('decode policy exposes bounded local-only MVP limits', async () => {
  const { CaissaScannerImageDecode: decoder } = await loadBrowserModules();
  assert.equal(decoder.MAX_SOURCE_BYTES, 32 * 1024 * 1024);
  assert.equal(decoder.MAX_SOURCE_PIXELS, 100_000_000);
  assert.equal(decoder.MAX_DECODE_EDGE, 2048);
  assert.equal(decoder.MAX_DECODE_PIXELS, 4_000_000);
  assert.equal(decoder.MIN_IMAGE_EDGE, 64);
  assert.deepEqual([...decoder.SUPPORTED_MIME_TYPES], ['image/jpeg', 'image/png', 'image/webp']);
  assert.equal(decoder.supportsMimeType('image/heic'), false);
  assert.equal(decoder.supportsMimeType('image/svg+xml'), false);
});

test('working dimensions preserve aspect ratio and obey both edge and pixel bounds', async () => {
  const { CaissaScannerImageDecode: decoder } = await loadBrowserModules();
  const landscape = decoder.computeWorkingDimensions(4000, 3000);
  assert.deepEqual(
    { width: landscape.workingWidth, height: landscape.workingHeight, resized: landscape.resized },
    { width: 2048, height: 1536, resized: true }
  );
  assert.equal(landscape.workingWidth * landscape.workingHeight <= decoder.MAX_DECODE_PIXELS, true);
  assert.ok(Math.abs((landscape.workingWidth / landscape.workingHeight) - (4 / 3)) < 0.001);

  const square = decoder.computeWorkingDimensions(4000, 4000);
  assert.deepEqual([square.workingWidth, square.workingHeight], [2000, 2000]);
  assert.equal(square.workingWidth * square.workingHeight, decoder.MAX_DECODE_PIXELS);

  const unchanged = decoder.computeWorkingDimensions(1200, 800);
  assert.deepEqual([unchanged.workingWidth, unchanged.workingHeight, unchanged.resized], [1200, 800, false]);
});

test('dimension policy rejects zero, tiny, and decompression-bomb-scale inputs', async () => {
  const { CaissaScannerImageDecode: decoder } = await loadBrowserModules();
  assert.throws(() => decoder.computeWorkingDimensions(0, 100), (error) => error.code === 'image-dimensions-invalid');
  assert.throws(() => decoder.computeWorkingDimensions(32, 32), (error) => error.code === 'image-too-small');
  assert.throws(() => decoder.computeWorkingDimensions(40_000, 40_000), (error) => error.code === 'image-dimensions-invalid');
});

test('header inspection validates deterministic PNG, JPEG, and WebP signatures', async () => {
  const { CaissaScannerImageDecode: decoder } = await loadBrowserModules();
  const png = new Uint8Array(24);
  png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  new DataView(png.buffer).setUint32(16, 320);
  new DataView(png.buffer).setUint32(20, 180);
  assert.deepEqual({ ...decoder.inspectImageHeaderBytes(png, 'image/png') }, { width: 320, height: 180, signatureValid: true });

  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0xb4, 0x01, 0x40, 0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x00, 0x03, 0x11, 0x00]);
  assert.deepEqual({ ...decoder.inspectImageHeaderBytes(jpeg, 'image/jpeg') }, { width: 320, height: 180, signatureValid: true });

  const webp = new Uint8Array(30);
  webp.set([...Buffer.from('RIFF'), 0, 0, 0, 0, ...Buffer.from('WEBPVP8X')]);
  webp[24] = 0x3f;
  webp[25] = 0x01;
  webp[27] = 0xb3;
  assert.deepEqual({ ...decoder.inspectImageHeaderBytes(webp, 'image/webp') }, { width: 320, height: 180, signatureValid: true });
  assert.equal(decoder.inspectImageHeaderBytes(new Uint8Array([1, 2, 3]), 'image/png'), null);
});

test('worker validates payload and echoes matching generation and request identity', async () => {
  const { self, messages } = await loadWorkerHarness();
  assert.equal(typeof self.onmessage, 'function');
  self.onmessage({ data: processMessage(7, '7:1') });
  assert.equal(messages.length, 1);
  assert.equal(messages[0].type, 'image-ready');
  assert.equal(messages[0].generation, 7);
  assert.equal(messages[0].requestId, '7:1');
  assert.equal(messages[0].probe.byteLength, 64 * 64 * 4);
  assert.equal(messages[0].metadata.preprocessingVersion, 'caissa-scanner-local-decode/1');
});

test('worker returns typed failures for malformed, tiny, and mismatched pixel payloads', async () => {
  const { self, messages } = await loadWorkerHarness();
  self.onmessage({ data: { type: 'process-image', version: 1 } });
  self.onmessage({ data: processMessage(1, 'tiny', 32, 32) });
  const mismatch = processMessage(1, 'mismatch');
  mismatch.image.pixels = new ArrayBuffer(4);
  self.onmessage({ data: mismatch });
  assert.deepEqual(messages.map((message) => message.code), ['malformed-payload', 'image-too-small', 'malformed-payload']);
});

test('worker supports sequential jobs and a bounded cancellation protocol', async () => {
  const { self, messages } = await loadWorkerHarness();
  self.onmessage({ data: processMessage(1, '1:1') });
  self.onmessage({ data: processMessage(2, '2:1') });
  self.onmessage({ data: {
    type: 'cancel',
    protocol: 'caissa-scanner-recognition-worker/1',
    version: 1,
    generation: 3,
    requestId: '3:1'
  } });
  self.onmessage({ data: processMessage(3, '3:1') });
  assert.deepEqual(messages.map((message) => message.type), ['image-ready', 'image-ready', 'job-canceled', 'recognition-error']);
  assert.equal(messages[3].code, 'canceled');
});

test('runtime lazily creates and reuses one worker for sequential requests', async () => {
  FakeWorker.instances = [];
  const { CaissaScannerRecognitionRuntime: runtimeModule } = await loadBrowserModules();
  const runtime = runtimeModule.create({
    decoder: createFakeDecoder(),
    WorkerClass: FakeWorker,
    isGenerationCurrent: () => true,
    now: (() => { let time = 0; return () => ++time; })()
  });
  assert.equal(runtime.snapshot().workerCreated, false);
  const first = await runtime.processImage({}, 1);
  const second = await runtime.processImage({}, 2);
  assert.equal(FakeWorker.instances.length, 1);
  assert.equal(first.generation, 1);
  assert.equal(second.generation, 2);
  assert.notEqual(first.requestId, second.requestId);
  assert.equal(runtime.snapshot().pendingCount, 0);
  assert.equal(FakeWorker.instances[0].messages.filter(({ message }) => message.type === 'process-image').length, 2);
  assert.equal(FakeWorker.instances[0].messages[0].transfer.length, 1);
  runtime.dispose();
  assert.equal(FakeWorker.instances[0].terminated, true);
});

test('new request logically cancels an unfinished decode without retaining it', async () => {
  FakeWorker.instances = [];
  const { CaissaScannerRecognitionRuntime: runtimeModule } = await loadBrowserModules();
  let resolveFirst;
  let calls = 0;
  const decoder = createFakeDecoder({
    decode: () => {
      calls += 1;
      if (calls === 1) return new Promise((resolve) => { resolveFirst = resolve; });
      return Promise.resolve({ pixels: new ArrayBuffer(64 * 64 * 4), metadata: metadata(), timing: {} });
    }
  });
  const runtime = runtimeModule.create({ decoder, WorkerClass: FakeWorker, isGenerationCurrent: () => true, now: () => 0 });
  const first = runtime.processImage({}, 1);
  const second = runtime.processImage({}, 2);
  resolveFirst({ pixels: new ArrayBuffer(64 * 64 * 4), metadata: metadata(), timing: {} });
  await assert.rejects(first, (error) => error.code === 'canceled');
  assert.equal((await second).generation, 2);
  assert.equal(runtime.snapshot().active, null);
  assert.equal(runtime.snapshot().pendingCount, 0);
  runtime.dispose();
});

test('worker initialization failure is typed and leaves no pending job', async () => {
  class BrokenWorker {
    constructor() {
      throw new Error('synthetic worker failure');
    }
  }
  const { CaissaScannerRecognitionRuntime: runtimeModule } = await loadBrowserModules();
  const runtime = runtimeModule.create({
    decoder: createFakeDecoder(),
    WorkerClass: BrokenWorker,
    isGenerationCurrent: () => true,
    now: () => 0
  });
  await assert.rejects(runtime.processImage({}, 1), (error) => error.code === 'worker-init-failed');
  assert.deepEqual({ ...runtime.snapshot() }, {
    workerCreated: false,
    active: null,
    pendingCount: 0,
    disposed: false
  });
  runtime.dispose();
});

test('stale worker result and worker failure cannot mutate the authoritative generation', async () => {
  class ControlledWorker extends FakeWorker {
    postMessage(message, transfer = []) {
      this.messages.push({ message, transfer });
    }
  }
  let currentGeneration = 4;
  const { CaissaScannerRecognitionRuntime: runtimeModule } = await loadBrowserModules();
  const runtime = runtimeModule.create({
    decoder: createFakeDecoder(),
    WorkerClass: ControlledWorker,
    isGenerationCurrent: (generation) => generation === currentGeneration,
    now: () => 0
  });
  const pendingResult = runtime.processImage({}, 4);
  await new Promise((resolve) => setImmediate(resolve));
  const worker = FakeWorker.instances.at(-1);
  const request = worker.messages.find(({ message }) => message.type === 'process-image').message;
  currentGeneration = 5;
  worker.onmessage({ data: {
    type: 'image-ready',
    protocol: request.protocol,
    version: request.version,
    generation: request.generation,
    requestId: request.requestId,
    metadata: request.metadata,
    timing: {},
    probe: {}
  } });
  await assert.rejects(pendingResult, (error) => error.code === 'stale-generation');
  assert.equal(currentGeneration, 5);

  currentGeneration = 6;
  const failedResult = runtime.processImage({}, 6);
  await new Promise((resolve) => setImmediate(resolve));
  FakeWorker.instances.at(-1).onerror({ preventDefault() {} });
  await assert.rejects(failedResult, (error) => error.code === 'worker-processing-failed');
  assert.equal(currentGeneration, 6);
  assert.equal(runtime.snapshot().pendingCount, 0);
  runtime.dispose();
});

test('recognition runtime source has an explicit zero-upload and zero-persistence guard', async () => {
  const paths = [
    'scanner/recognition/scanner-image-decode.js',
    'scanner/recognition/scanner-recognition-runtime.js',
    'scanner/recognition/scanner-recognition-worker.js'
  ];
  const sources = await Promise.all(paths.map(read));
  const forbidden = [
    /\bfetch\s*\(/,
    /XMLHttpRequest/,
    /\bFormData\b/,
    /sendBeacon/,
    /\bindexedDB\b/,
    /\blocalStorage\b/,
    /\bsessionStorage\b/,
    /\bwriteFile\b/,
    /debug_upload/,
    /\/api\//
  ];
  for (const [index, source] of sources.entries()) {
    for (const pattern of forbidden) {
      assert.doesNotMatch(source, pattern, `${paths[index]} violates local-only image processing: ${pattern}`);
    }
  }
});

test('Scanner app connects decode and worker behind the existing frozen route seam', async () => {
  const [html, app] = await Promise.all([read('scanner/index.html'), read('scanner/scanner-app.js')]);
  assert.match(html, /scanner-image-decode\.js/);
  assert.match(html, /scanner-recognition-runtime\.js/);
  assert.match(app, /recognitionRuntime\.processImage\(file, expectedGeneration\)/);
  assert.match(app, /state\.setCandidate\(expectedGeneration/);
  assert.match(app, /routeRecognitionResult\(\)/);
  assert.match(app, /recognitionRuntime\?\.cancelActive\('scanner-reset'\)/);
  assert.match(app, /recognitionRuntime\?\.dispose\(\)/);
  assert.match(app, /URL\.revokeObjectURL\(objectUrl\)/);
  assert.doesNotMatch(app.slice(app.indexOf('async function selectFile'), app.indexOf('function resetAll')), /setTimeout\(/);
});
