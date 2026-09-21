import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { previewArenaEnabled } from '../api/eae013.js';

const branch = 'experiment/lc0-eae013-arena-preview-integration';
const config = { VERCEL_ENV: 'preview', VERCEL_GIT_COMMIT_REF: branch,
  EAE013_ARENA_PREVIEW: '1', EAE011_MAIN_ORIGIN: 'https://eae013-main.vercel.app',
  EAE011_ENGINE_ORIGIN: 'https://eae013-engine.vercel.app' };

test('preview API gate requires exact branch, flag, host, and separate HTTPS origin', () => {
  assert.equal(previewArenaEnabled(config, 'eae013-main.vercel.app'), true);
  for (const change of [
    { EAE013_ARENA_PREVIEW: '0' }, { VERCEL_ENV: 'production' },
    { VERCEL_GIT_COMMIT_REF: 'main' },
    { EAE011_ENGINE_ORIGIN: config.EAE011_MAIN_ORIGIN },
    { EAE011_ENGINE_ORIGIN: 'http://eae013-engine.vercel.app' }
  ]) assert.equal(previewArenaEnabled({ ...config, ...change }, 'eae013-main.vercel.app'), false);
  assert.equal(previewArenaEnabled(config, 'www.caissa-chess.org'), false);
});

test('normal Arena provider list is frozen without explicit preview registration', () => {
  const source = fs.readFileSync(new URL('../js/engine-registry.js', import.meta.url), 'utf8');
  const window = { location: { pathname: '/arena' }, WebAssembly: {},
    matchMedia: () => ({ matches: false }) };
  vm.runInNewContext(source, { window, console }, { filename: 'engine-registry.js' });
  const registry = window.EngineRegistry;
  const before = registry.listArenaProviders().map(item => item.id);
  assert.equal(before.includes('lc0-maia-1100-preview'), false);
  assert.equal(registry.registerArenaPreviewProvider({ id: 'lc0-maia-1100-preview' }, () => {}), false);
  assert.deepEqual(registry.listArenaProviders().map(item => item.id), before);
  window.CaissaArenaPreview = { enabled: true };
  assert.equal(registry.registerArenaPreviewProvider({ id: 'lc0-maia-1100-preview',
    availability: 'available', enabled: true, workerPath: '/isolated' }, () => ({})), true);
  assert.equal(registry.listArenaProviders().filter(item => item.id === 'lc0-maia-1100-preview').length, 1);
  assert.equal(registry.list().some(item => item.id === 'lc0-maia-1100-preview'), false);
});

test('preview URL resolves to the existing Arena section without changing its canonical route', () => {
  const source = fs.readFileSync(new URL('../js/legacy-canonical-section-route-policy.js', import.meta.url), 'utf8');
  const window = { location: { origin: 'https://eae013-main.vercel.app',
    pathname: '/arena-preview' }, document: { documentElement: { setAttribute() {} } } };
  vm.runInNewContext(source, { window, URL }, { filename: 'legacy-canonical-section-route-policy.js' });
  assert.equal(window.LegacyCanonicalSectionRoutePolicy.resolve('/arena-preview').section, 'arena');
  assert.equal(window.LegacyCanonicalSectionRoutePolicy.routeForSection('arena'), '/arena');
});

test('Stockfish 19 worker receives the same WASM-only CSP as Stockfish 18 in preview', () => {
  const config = JSON.parse(fs.readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
  const sf18 = config.headers.find(item => item.source === '/assets/vendor/stockfish/18.0.0/:path*');
  const sf19 = config.headers.find(item => item.source === '/assets/vendor/stockfish/19.0.0/:path*');
  assert.ok(sf18 && sf19);
  assert.equal(sf19.headers.find(item => item.key === 'Content-Security-Policy').value,
    sf18.headers.find(item => item.key === 'Content-Security-Policy').value);
  assert.equal(config.headers.find(item => item.source === '/arena')?.headers?.some(item =>
    item.key === 'Cross-Origin-Embedder-Policy'), undefined);
});
