import assert from 'node:assert/strict';
import { webcrypto as crypto } from 'node:crypto';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { Chess } from 'chess.js';

const read = relative => fs.readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8');

test('isolated client maps bounded relay modes to exact UCI commands', () => {
  const source = read('experiments/lc0-preview-relay/engine/client-source.js');
  assert.match(source, /return `go depth \$\{command\.depth\}`/);
  assert.match(source,
    /return `go wtime \$\{command\.wtime\} btime \$\{command\.btime\} winc \$\{command\.winc\} binc \$\{command\.binc\}`/);
  assert.doesNotMatch(source, /mode === 'clock'[^\n]+movetime/);
});

test('isolated client publishes a STOP-race bestmove exactly once', () => {
  const source = read('experiments/lc0-preview-relay/engine/client-source.js');
  assert.match(source, /await this\.completeSearch\(active, line\)/);
  assert.match(source, /if \(active\.completionPromise\) return active\.completionPromise/);
  assert.match(source, /finishNaturalSearch\(active, line\)[\s\S]*?return this\.completeSearch\(active, line\)/);
  assert.doesNotMatch(source, /active\.naturalCompletionPromise/);
});

function runtimeClientFixture() {
  const elements = new Map();
  const element = selector => {
    if (!elements.has(selector)) elements.set(selector, {
      textContent: '', disabled: false
    });
    return elements.get(selector);
  };
  const window = {};
  const source = read('experiments/lc0-preview-relay/engine/client-source.js')
    .replace(/^import .*$/gm, '')
    .replace(/window\.Eae012Engine = new RealLc0RelayClient\(\);[\s\S]*$/,
      'window.RealLc0RelayClient = RealLc0RelayClient;');
  vm.runInNewContext(source, {
    window, Chess, crypto, performance, URL, URLSearchParams,
    TextDecoder, TextEncoder, AbortController,
    setTimeout, clearTimeout, setInterval, clearInterval, queueMicrotask,
    navigator: { onLine: true }, location: { origin: 'https://runtime.example',
      pathname: '/' }, history: { replaceState() {} },
    document: { visibilityState: 'visible', querySelector: element },
    sessionStorage: { setItem() {}, getItem() { return null; }, removeItem() {} },
    Lc0LabRuntime: class {}, sha256: async () => ''
  }, { filename: 'client-source.js' });
  return { client: new window.RealLc0RelayClient(), element };
}

async function exerciseStopOrdering(ordering, iteration) {
  const { client } = runtimeClientFixture();
  const line = 'bestmove e2e4';
  const messages = [];
  const active = { searchId: `search_${ordering}_${iteration}`, mode: 'clock',
    chess: new Chess(), startLine: 0, startedAt: performance.now(), bestmove: null };
  client.active = active;
  client.currentPosition = { chess: active.chess };
  client.runtime = {
    state: 'SEARCHING', lines: [], send() {},
    waitForLine: async () => {
      if (ordering === 'stop-bestmove' || ordering === 'stop-ack-bestmove')
        client.runtimeEvent({ type: 'stdout', line });
      return line;
    },
    terminate: async () => ({ parentWorkers: 0, pthreadWorkers: 0,
      state: 'TERMINATED', cleanupAcknowledged: true, forcedTerminations: 0,
      timings: { terminateMs: 1 } })
  };
  client.message = async type => {
    messages.push(type);
    if (type === 'ACK' && ordering === 'bestmove-before-stop-ack' &&
        !active.completionPromise) client.runtimeEvent({ type: 'stdout', line });
    return { accepted: true };
  };

  if (ordering === 'bestmove-stop') client.runtimeEvent({ type: 'stdout', line });
  if (ordering === 'duplicate-around-stop') {
    client.runtimeEvent({ type: 'stdout', line });
    client.runtimeEvent({ type: 'stdout', line });
  }
  await client.handle({ type: 'STOP', seq: 1, searchId: active.searchId });
  if (ordering === 'duplicate-around-stop')
    client.runtimeEvent({ type: 'stdout', line });
  await client.handle({ type: 'QUIT', seq: 2 });

  assert.equal(messages.filter(type => type === 'BESTMOVE').length, 1);
  assert.equal(messages.filter(type => type === 'STOPPED').length, 1);
  assert.equal(messages.filter(type => type === 'CLEANUP').length, 1);
  assert.equal(messages.filter(type => type === 'ERROR').length, 0);
  assert.equal(active.chess.history().length, 1);
  assert.equal(client.active, null);
  assert.equal(client.closed, true);
}

test('50 deterministic STOP/BESTMOVE races stay search-scoped and clean once', async () => {
  const orderings = ['stop-bestmove', 'bestmove-stop', 'duplicate-around-stop',
    'stop-ack-bestmove', 'bestmove-before-stop-ack'];
  for (let iteration = 0; iteration < 50; iteration += 1)
    await exerciseStopOrdering(orderings[iteration % orderings.length], iteration);
});

test('BESTMOVE idempotency does not suppress a new search generation', async () => {
  const { client } = runtimeClientFixture();
  const messages = [];
  client.message = async type => { messages.push(type); return { accepted: true }; };
  client.runtime = { state: 'SEARCHING' };
  for (const [index, move] of ['e2e4', 'd2d4'].entries()) {
    const active = { searchId: `search_generation_${index}`, mode: 'clock',
      chess: new Chess(), startLine: 0, startedAt: performance.now(), bestmove: null };
    client.active = active;
    client.runtimeEvent({ type: 'stdout', line: `bestmove ${move}` });
    await active.completionPromise;
    assert.equal(active.chess.history().length, 1);
  }
  assert.equal(messages.filter(type => type === 'BESTMOVE').length, 2);
  assert.equal(messages.filter(type => type === 'STOPPED').length, 2);
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
