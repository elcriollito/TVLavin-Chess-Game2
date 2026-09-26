import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = relative => fs.readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8');

test('isolated client maps bounded relay modes to exact UCI commands', () => {
  const source = read('experiments/lc0-preview-relay/engine/client-source.js');
  assert.match(source, /return `go depth \$\{command\.depth\}`/);
  assert.match(source,
    /return `go wtime \$\{command\.wtime\} btime \$\{command\.btime\} winc \$\{command\.winc\} binc \$\{command\.binc\}`/);
  assert.doesNotMatch(source, /mode === 'clock'[^\n]+movetime/);
});

test('EAE-017 changes adapter protocol only and never changes certified runtime assets', () => {
  const rollout = read('js/arena-lc0-rollout.js');
  const manifest = JSON.parse(read('experiments/lc0-preview-relay/engine/release-manifest.template.json'));
  assert.deepEqual(manifest.runtime, {
    backend: 'onnxruntime-web-wasm-cpu', executionProviders: ['wasm'],
    ortThreads: 1, lc0Threads: 1, minibatchSize: 1, nnCacheSize: 2000,
    simd: true, pthreads: true, asyncifyStackBytes: 65536,
    stackBytes: 1048576, allowMemoryGrowth: true, exitRuntime: true
  });
  assert.equal(manifest.network.sha256,
    'e1cf1cd0c96b8a4fa6a275f4b9fd54ed1ffebf9fe44641b9fceded310e9619c4');
  assert.match(rollout, /supportedMatchTimeControls:[\s\S]*?'blitz', 'rapid', 'long', 'fixed-depth'/);
  assert.doesNotMatch(rollout, /supportedMatchTimeControls:[\s\S]{0,160}'bullet'/);
});

test('relay validates clock fields and approved fixed depths server-side', () => {
  const source = read('experiments/lc0-preview-relay/durable-broker.mjs');
  assert.match(source, /mode === 'clock' && clockValid/);
  assert.match(source, /\[8, 12, 16, 20, 24\]\.includes\(depth\)/);
  assert.match(source, /activeSearchMode/);
});

test('EAE-017 main document permits only the exact preview relay origin', () => {
  const html = read('index.html');
  const csp = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)">/)?.[1] || '';
  assert.match(csp,
    /connect-src[^;]*https:\/\/eae017-relay-elcriollitos-projects\.vercel\.app/);
  assert.doesNotMatch(csp, /connect-src[^;]*https:\/\/\*\.vercel\.app/);
});
