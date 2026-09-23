import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const lab = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repository = path.resolve(lab, '..', '..');
const read = file => readFile(path.join(repository, file), 'utf8');

test('lab pins source, CPU-only backend, toolchain, and network integrity', async () => {
  const manifest = JSON.parse(await readFile(path.join(lab, 'lab-manifest.json'), 'utf8'));
  assert.equal(manifest.source.commit, '482bb4a830287b726ebe7d42f14ab7f5f17c18a0');
  assert.deepEqual(manifest.runtime.executionProviders, ['wasm']);
  assert.equal(manifest.runtime.backend, 'onnxruntime-web-wasm-cpu');
  assert.equal(manifest.toolchain.emscripten, '3.1.64');
  assert.equal(manifest.network.sha256, 'e1cf1cd0c96b8a4fa6a275f4b9fd54ed1ffebf9fe44641b9fceded310e9619c4');
  assert.equal(manifest.network.bytes, 1313193);
  assert.equal(manifest.runtime.exitRuntime, true);
  for (const [fileKey, hashKey] of [['patch', 'patchSha256'],
    ['exitPatch', 'exitPatchSha256'], ['tracePatch', 'tracePatchSha256']]) {
    const bytes = await readFile(path.join(lab, manifest.source[fileKey]));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), manifest.source[hashKey]);
  }
  assert.deepEqual(Object.keys(manifest.artifacts).sort(), [
    'lc0.js',
    'lc0.wasm',
    'lc0.worker.mjs',
    'maia-1100.pb.gz',
    'ort-wasm-simd-threaded.mjs',
    'ort-wasm-simd-threaded.wasm'
  ]);
  for (const artifact of Object.values(manifest.artifacts)) {
    assert.match(artifact.sha256, /^[a-f0-9]{64}$/);
    assert.ok(Number.isSafeInteger(artifact.bytes) && artifact.bytes > 0);
  }
});

test('lab server owns isolation headers without changing production configuration', async () => {
  const server = await readFile(path.join(lab, 'server.mjs'), 'utf8');
  assert.match(server, /Cross-Origin-Opener-Policy', 'same-origin'/);
  assert.match(server, /Cross-Origin-Embedder-Policy', 'require-corp'/);
  assert.match(server, /127\.0\.0\.1/);
  const production = JSON.parse(await read('vercel.json'));
  const globalHeaders = production.headers.find(entry => entry.source === '/(.*)').headers;
  assert.equal(globalHeaders.some(header => header.key === 'Cross-Origin-Embedder-Policy'), false);
  assert.equal(globalHeaders.find(header => header.key === 'Cross-Origin-Opener-Policy')?.value,
    'same-origin-allow-popups');
  const previewHeaders = production.headers.find(entry =>
    entry.source === '/experiments/lc0-preview-relay/engine/:path*').headers;
  assert.equal(previewHeaders.find(header => header.key === 'Cross-Origin-Embedder-Policy')?.value,
    'require-corp');
});

test('production registry and navigation do not expose Lc0', async () => {
  const registry = await read('js/engine-registry.js');
  const index = await read('index.html');
  const productionIds = registry.match(
    /const ARENA_PROVIDER_IDS = Object\.freeze\(\[([\s\S]*?)\]\);/
  )?.[1];
  assert.ok(productionIds, 'production Arena provider allowlist must remain explicit');
  assert.doesNotMatch(productionIds, /\blc0\b|Leela Chess Zero/i);
  assert.match(registry, /const arenaPreviewProviders = new Map\(\)/);
  assert.match(registry, /provider\?\.id !== 'lc0-maia-1100-preview'/);
  assert.doesNotMatch(index, /Lc0 Browser Lab|lc0-browser-lab/i);
});

test('lab rejects uploads and limits the backend to ONNX Runtime Web WASM', async () => {
  const server = await readFile(path.join(lab, 'server.mjs'), 'utf8');
  const worker = await readFile(path.join(lab, 'src/lc0-worker.js'), 'utf8');
  assert.match(server, /\['GET', 'HEAD'\]/);
  assert.match(worker, /executionProviders: \['wasm'\]/);
  assert.match(worker, /artifactSegments\.some/);
  assert.match(worker, /segment === '\.\.'/);
  assert.match(worker, /\[A-Za-z0-9\._-\]/);
  assert.doesNotMatch(worker, /webgpu/i);
});
