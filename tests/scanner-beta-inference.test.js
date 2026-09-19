import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import {
  FROZEN_V05, RECOGNITION_PROTOCOL, createFrozenV05Runtime, inferFrozenV05Onnx,
  preprocessCanonicalTiles, validateRecognitionRequest
} from '../api/_lib/scanner-beta-inference.js';
import { createScannerBetaRecognitionService } from '../api/_lib/scanner-beta-recognition-service.js';

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex').toUpperCase();
}

function request(overrides = {}) {
  const board = Buffer.alloc(512 * 512 * 4, 255);
  return {
    schemaVersion: RECOGNITION_PROTOCOL.request,
    boardEncoding: 'rgba8', boardWidth: 512, boardHeight: 512,
    sourceImageType: 'image/png', orientation: 'white-at-bottom',
    boardRgbaBase64: board.toString('base64'), ...overrides
  };
}

function response() {
  return { statusCode: null, body: null, headers: {}, setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
}

function service(overrides = {}) {
  return createScannerBetaRecognitionService({
    env: { CAISSA_SCANNER_BETA_STAGE: 'internal' },
    authorizeExperiment: async () => ({ ok: true, user: { id: 'beta-user' } }),
    rateLimit: () => ({ allowed: true, remaining: 11 }),
    log: () => {},
    ...overrides
  });
}

test('frozen v0.5 constants and deployed ONNX artifact match the certified manifest', async () => {
  const [artifact, manifestBytes] = await Promise.all([
    readFile(new URL('../api/_private/scanner-beta-model/frozen-v05.onnx', import.meta.url)),
    readFile(new URL('../api/_private/scanner-beta-model/manifest.json', import.meta.url))
  ]);
  const manifest = JSON.parse(manifestBytes);
  assert.equal(FROZEN_V05.modelChecksum, '90D06A3C1AAC934188CBA5EEB4B68D51AC64C815351BFE372F2215101DD7209E');
  assert.equal(FROZEN_V05.occupancyThreshold, 0.99);
  assert.deepEqual(FROZEN_V05.classOrder, ['empty', 'P', 'N', 'B', 'R', 'Q', 'K', 'p', 'n', 'b', 'r', 'q', 'k']);
  assert.equal(sha256(artifact), manifest.artifactSha256);
  assert.equal(manifest.artifactSha256, FROZEN_V05.artifactChecksum);
  assert.equal(manifest.sourceStateSha256, FROZEN_V05.modelChecksum);
  assert.deepEqual(manifest.input.shape, [64, 3, 64, 64]);
});

test('recognition request validation enforces protocol, type, dimensions, encoding and exact RGBA bytes', () => {
  assert.equal(validateRecognitionRequest(request()).boardRgba.length, 512 * 512 * 4);
  for (const invalid of [
    { schemaVersion: 'wrong' }, { boardEncoding: 'rgb8' }, { boardWidth: 511 }, { boardHeight: 511 },
    { sourceImageType: 'image/gif' }, { orientation: 'unknown' }, { boardRgbaBase64: 'AAAA' }
  ]) assert.throws(() => validateRecognitionRequest(request(invalid)), /INVALID_(?:PAYLOAD|IMAGE)/);
});

test('RGB64 preprocessing is canonical CHW uint8/255 and reverses black-at-bottom tile order', () => {
  const board = Buffer.alloc(512 * 512 * 4, 255);
  for (let tile = 0; tile < 64; tile += 1) {
    const row = Math.floor(tile / 8); const column = tile % 8;
    for (let y = 0; y < 64; y += 1) for (let x = 0; x < 64; x += 1) {
      const offset = ((row * 64 + y) * 512 + column * 64 + x) * 4;
      board[offset] = tile; board[offset + 1] = 64 + tile; board[offset + 2] = 128 + tile;
    }
  }
  const base = { ...request(), boardRgbaBase64: board.toString('base64') };
  const white = preprocessCanonicalTiles(validateRecognitionRequest(base));
  const black = preprocessCanonicalTiles(validateRecognitionRequest({ ...base, orientation: 'black-at-bottom' }));
  assert.equal(white.length, 64 * 3 * 64 * 64);
  assert.equal(white[0], 0);
  assert.ok(Math.abs(white[4096] - 64 / 255) < 1e-7);
  assert.ok(Math.abs(white[63 * 3 * 4096] - 63 / 255) < 1e-7);
  assert.ok(Math.abs(black[0] - 63 / 255) < 1e-7);
  assert.equal(black[63 * 3 * 4096], 0);
});

test('production runtime batches 64 squares and returns the versioned canonical response', async () => {
  const { response: result } = await inferFrozenV05Onnx(request());
  assert.equal(result.schemaVersion, RECOGNITION_PROTOCOL.response);
  assert.equal(result.modelVersion, FROZEN_V05.modelVersion);
  assert.equal(result.modelChecksum, FROZEN_V05.modelChecksum);
  assert.equal(result.modelArtifactChecksum, FROZEN_V05.artifactChecksum);
  assert.equal(result.threshold, 0.99);
  assert.equal(result.preprocessingVersion, FROZEN_V05.preprocessingVersion);
  assert.equal(result.squarePredictions.length, 64);
  assert.equal(result.predictedFEN, '8/8/8/8/8/8/8/8 w - - 0 1');
  for (const row of result.squarePredictions) {
    assert.equal(row.colorProbabilities.length, 2);
    assert.equal(row.pieceTypeProbabilities.length, 6);
    assert.ok(Number.isFinite(row.kingAuxiliaryProbability));
  }
});

test('model checksum mismatch fails closed before creating an inference session', async () => {
  const manifest = await readFile(new URL('../api/_private/scanner-beta-model/manifest.json', import.meta.url));
  let sessionCreated = false;
  const runtime = createFrozenV05Runtime({
    modelPath: 'model', manifestPath: 'manifest',
    read: async path => path === 'manifest' ? manifest : Buffer.from('tampered'),
    loadOrt: async () => ({ InferenceSession: { create: async () => { sessionCreated = true; } } })
  });
  await assert.rejects(runtime.infer(request()), error => error.code === 'MODEL_INTEGRITY_FAILURE');
  assert.equal(sessionCreated, false);
});

test('golden parity fixture manifest covers all classes, real development, hard negatives and multiple families', async () => {
  const golden = JSON.parse(await readFile(new URL('../scanner/recognition/production-inference/golden-fixtures-v01.json', import.meta.url)));
  assert.equal(golden.fixtureCount, 256);
  assert.equal(golden.boardCount, 4);
  assert.equal(golden.canonicalClassAgreement, 1);
  assert.equal(golden.thresholdDecisionAgreement, 1);
  assert.equal(golden.fullBoardAgreement, true);
  assert.ok(golden.maximumNumericalDelta <= golden.tolerance);
  assert.deepEqual(new Set(golden.coverage.labels), new Set(FROZEN_V05.classOrder));
  assert.ok(golden.coverage.roles.includes('real-development-validation'));
  assert.ok(golden.coverage.families.length >= 3);
  assert.ok(golden.coverage.hardNegativeCount > 0);
  assert.ok(golden.coverage.kingCount > 0);
  assert.equal(golden.coverage.lightAndDark, true);
});

test('disabled, anonymous and ordinary-user requests are denied before payload parsing or inference', async () => {
  let authorized = 0; let inferred = 0;
  const disabled = service({ env: { CAISSA_SCANNER_BETA_STAGE: 'disabled' },
    authorizeExperiment: async () => { authorized += 1; return { ok: true, user: { id: 'x' } }; },
    infer: async () => { inferred += 1; } });
  let res = response();
  await disabled.recognize({ method: 'POST', headers: {}, body: 'not json' }, res);
  assert.deepEqual([res.statusCode, res.body.error, authorized, inferred], [404, 'BETA_DISABLED', 0, 0]);

  for (const access of [
    { ok: false, status: 401, code: 'AUTH_REQUIRED' },
    { ok: false, authenticated: true, status: 403, code: 'EXPERIMENT_ACCESS_DENIED' }
  ]) {
    res = response();
    await service({ authorizeExperiment: async () => access, infer: async () => { inferred += 1; } })
      .recognize({ method: 'POST', headers: {}, body: 'not json' }, res);
    assert.equal(res.statusCode, access.status);
    assert.equal(res.body.error, access.status === 401 ? 'AUTH_REQUIRED' : 'BETA_ACCESS_DENIED');
  }
  assert.equal(inferred, 0);
});

test('endpoint validates same-origin and JSON payload then returns only typed failures', async () => {
  let res = response();
  await service().recognize({ method: 'POST', headers: { origin: 'https://evil.example', host: 'www.caissa-chess.org' }, body: {} }, res);
  assert.deepEqual([res.statusCode, res.body.error], [403, 'BETA_ACCESS_DENIED']);

  res = response();
  await service().recognize({ method: 'POST', headers: { 'content-type': 'text/plain' }, body: {} }, res);
  assert.deepEqual([res.statusCode, res.body.error], [400, 'INVALID_PAYLOAD']);

  for (const code of ['INVALID_IMAGE', 'MODEL_INTEGRITY_FAILURE', 'INFERENCE_FAILURE']) {
    res = response();
    await service({ infer: async () => { throw Object.assign(new Error('private path'), { code }); } })
      .recognize({ method: 'POST', headers: { 'content-type': 'application/json' }, body: {} }, res);
    assert.equal(res.body.error, code);
    assert.doesNotMatch(JSON.stringify(res.body), /private path/);
  }
});

test('successful recognition is private, no-store, rate-limited and has no persistence side effect', async () => {
  const expected = { schemaVersion: RECOGNITION_PROTOCOL.response, squarePredictions: [] };
  let persisted = false;
  const res = response();
  await service({ infer: async () => ({ response: expected, metrics: { modelLoadMs: 1, inferenceMs: 2 } }),
    rateLimit: () => ({ allowed: true, remaining: 0 }), store: { putScan() { persisted = true; } } })
    .recognize({ method: 'POST', headers: { 'content-type': 'application/json' }, body: request() }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body, expected);
  assert.match(res.headers['Cache-Control'], /no-store/);
  assert.match(res.headers['Server-Timing'], /model;dur=1\.0/);
  assert.equal(persisted, false);
});

test('timeout and rate limit use stable typed responses', async () => {
  let res = response();
  await service({ timeoutMs: 5, infer: () => new Promise(() => {}) })
    .recognize({ method: 'POST', headers: { 'content-type': 'application/json' }, body: {} }, res);
  assert.deepEqual([res.statusCode, res.body.error], [504, 'TIMEOUT']);
  res = response();
  await service({ rateLimit: () => ({ allowed: false, retryAfter: 9 }) })
    .recognize({ method: 'POST', headers: { 'content-type': 'application/json' }, body: {} }, res);
  assert.deepEqual([res.statusCode, res.body.error, res.headers['Retry-After']], [429, 'RATE_LIMITED', '9']);
});
