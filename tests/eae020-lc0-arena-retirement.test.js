import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import test from 'node:test';
import handler from '../api/eae016.js';

const read = relative => fs.readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8');

test('EAE-020 removes only the Arena product surface', () => {
  const html = read('index.html');
  assert.doesNotMatch(html, /arenaExperimentalEngines|arenaLc0ConsentModal|arena-lc0-rollout\.js/);
  assert.match(html, /id="arenaWhiteEngine"/);
  assert.match(html, /id="arenaBlackEngine"/);
  assert.match(html, /id="arenaTournamentEngines"/);

  const registry = read('js/engine-registry.js');
  assert.match(registry, /provider\?\.supportsStandardArena !== true/);
  const dormant = read('js/arena-lc0-rollout.js');
  assert.match(dormant, /SUPPORTS_STANDARD_ARENA = false/);
  assert.match(dormant, /productOwner: 'caissa-analyzer-future'/);
  assert.match(dormant, /status: 'dormant'/);
});

test('normal EAE-016 GET reports the exact dormant rollout state without store access', async () => {
  const previous = {
    VERCEL_ENV: process.env.VERCEL_ENV,
    EAE011_MAIN_ORIGIN: process.env.EAE011_MAIN_ORIGIN,
    EAE011_ENGINE_ORIGIN: process.env.EAE011_ENGINE_ORIGIN,
    EAE015A_RELAY_ORIGIN: process.env.EAE015A_RELAY_ORIGIN,
    EAE016_RELEASE_STAGE: process.env.EAE016_RELEASE_STAGE,
    EAE015B_RELEASE_STAGE: process.env.EAE015B_RELEASE_STAGE
  };
  Object.assign(process.env, {
    VERCEL_ENV: 'development',
    EAE011_MAIN_ORIGIN: 'http://127.0.0.1:8000',
    EAE011_ENGINE_ORIGIN: 'https://runtime.example.test',
    EAE015A_RELAY_ORIGIN: 'https://relay.example.test',
    EAE016_RELEASE_STAGE: 'EXPERIMENTAL_OPT_IN',
    EAE015B_RELEASE_STAGE: 'EXPERIMENTAL_OPT_IN'
  });
  let statusCode = null;
  let body = null;
  const res = {
    setHeader() {},
    status(code) { statusCode = code; return this; },
    json(value) { body = value; return value; }
  };
  try {
    await handler({ method: 'GET', headers: { host: '127.0.0.1:8000' }, query: {} }, res);
    assert.equal(statusCode, 200);
    assert.deepEqual({
      enabled: body.enabled,
      eligible: body.eligible,
      visible: body.visible,
      mode: body.mode,
      releaseStage: body.releaseStage,
      productStatus: body.productStatus,
      runtimeHealthy: body.runtimeHealthy,
      relayHealthy: body.relayHealthy
    }, {
      enabled: false,
      eligible: false,
      visible: false,
      mode: 'DISABLED',
      releaseStage: 'DISABLED',
      productStatus: 'LC0_ARENA_RETIRED_DORMANT',
      runtimeHealthy: null,
      relayHealthy: null
    });
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test('certified runtime artifacts and infrastructure entry points remain present and byte-identical', () => {
  const expected = {
    'experiments/lc0-preview-relay/engine/artifacts/runtime/lc0.js':
      'c2b1786ff568d0d5042588b5b9bbf7a78623e47930ad4358803f2a37e3ca66a9',
    'experiments/lc0-preview-relay/engine/artifacts/runtime/lc0.wasm':
      '5c3cc8c72b5794092790ab2c7615a7a7e9757e1c899fa2a4cc1ca158547a07f0',
    'experiments/lc0-preview-relay/engine/artifacts/runtime/lc0.worker.mjs':
      '7e6dad4bca61807357acfcb3789c781deaca3e20214ccd76dd82ddcb0be0a153',
    'experiments/lc0-preview-relay/engine/artifacts/ort/ort-wasm-simd-threaded.mjs':
      '0a1e718d99c41b22c21f2520ff4f9e883a6b5533856e398d21816ee8eb8185d3',
    'experiments/lc0-preview-relay/engine/artifacts/ort/ort-wasm-simd-threaded.wasm':
      'd1ab1b94b16a65b29d710d0b587b29e7bed336827577623913479b8afe8113e6',
    'experiments/lc0-preview-relay/engine/artifacts/network/maia-1100.pb.gz':
      'e1cf1cd0c96b8a4fa6a275f4b9fd54ed1ffebf9fe44641b9fceded310e9619c4'
  };
  for (const [relative, digest] of Object.entries(expected)) {
    const bytes = fs.readFileSync(new URL(`../${relative}`, import.meta.url));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), digest, relative);
  }
  for (const relative of [
    'api/eae011.js',
    'api/cron/eae015a-lc0-cleanup.js',
    'experiments/lc0-preview-relay/durable-broker.mjs',
    'experiments/lc0-production-compliance/corresponding-source.json',
    'docs/compliance/LC0_PRODUCTION_LEGAL_SIGNOFF.md'
  ]) assert.equal(fs.existsSync(new URL(`../${relative}`, import.meta.url)), true, relative);
});

test('Analyzer reserve document records immutable provenance and reactivation boundary', () => {
  const doc = read('docs/architecture/CAISSA_ENGINE_ARENA_LC0_DORMANT_ANALYZER_RESERVE.md');
  for (const value of [
    'LC0_ARENA_RETIRED_DORMANT',
    '9980a755a44b3d704f70505a803b6dd112c97a39853260bc648499b5bed4fd45',
    '61555ff04e76ea804940f728552188905e9e544f3109368ca2878ca26b0f8809',
    'e1cf1cd0c96b8a4fa6a275f4b9fd54ed1ffebf9fe44641b9fceded310e9619c4',
    'lc0-browser-source-v0.1.3',
    'lc0-experimental-beta-v1',
    'CAISSA Analyzer — Lc0 Deep Analysis Integration'
  ]) assert.match(doc, new RegExp(value));
});
