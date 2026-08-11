import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../llm-provider.js', import.meta.url), 'utf8');
const mentorSource = fs.readFileSync(new URL('../mentor-ai.js', import.meta.url), 'utf8');
const authSource = fs.readFileSync(new URL('../js/caissa-auth.js', import.meta.url), 'utf8');

function harness(fetchImpl = async () => ({ ok: true, headers: { get: () => null }, json: async () => ({ content: 'OK' }) })) {
  const listeners = new Map();
  const logs = [];
  const window = {
    location: { origin: 'https://www.caissa-chess.org' },
    CaissaFeatureFlags: { isEnabled: () => true },
    CAISSA_AUTH: { getToken: async () => null },
    addEventListener(type, fn) { listeners.set(type, fn); }
  };
  const context = { window, fetch: fetchImpl, console: { log() {}, warn() {}, error: (...args) => logs.push(args.join(' ')) }, TextDecoder };
  vm.createContext(context);
  vm.runInContext(`${source};globalThis.provider=LLMProvider`, context);
  return { provider: context.provider, listeners, logs };
}

test('BYO key is absent from persistent storage code', () => assert.doesNotMatch(source + mentorSource, /(?:localStorage|sessionStorage)\.setItem\([^\n]*(?:api.?key|secret)/i));
test('BYO key is absent from IndexedDB, cookies, URLs, datasets, and history', () => assert.doesNotMatch(source + mentorSource, /(?:indexedDB|document\.cookie|history\.|location\.(?:search|hash)|dataset)[^\n]*(?:api.?key|secret)/i));
test('public configuration never contains an apiKey property', () => { const { provider } = harness(); provider.initialize({ apiKey: 'must-not-enter-config' }); assert.equal('apiKey' in provider.config, false); assert.equal(provider.hasApiKey(), false); });
test('getConfig exposes only boolean key state', () => { const { provider } = harness(); provider.setApiKey('synthetic-key'); assert.deepEqual(Object.keys(provider.getConfig()).sort(), ['canUseSharedApi','hasApiKey','isReady','maxTokens','model','provider','temperature'].sort()); });
test('provider switch clears the previous credential', () => { const { provider } = harness(); provider.setApiKey('openai-key'); provider.switchProvider('anthropic'); assert.equal(provider.getConfig().hasApiKey, false); });
test('explicit clear removes the reachable credential reference', () => { const { provider } = harness(); provider.setApiKey('key'); provider.clearApiKey(); assert.equal(provider.hasApiKey(), false); });
test('logout clear event removes the credential', () => { const { provider, listeners } = harness(); provider.setApiKey('key'); listeners.get('caissa-byo-clear')(); assert.equal(provider.hasApiKey(), false); });
test('authoritative auth transition removes the credential', () => { const { provider, listeners } = harness(); provider.setApiKey('key'); listeners.get('caissa-auth-change')(); assert.equal(provider.hasApiKey(), false); });
test('pagehide removes the credential for unload and BFCache', () => { const { provider, listeners } = harness(); provider.setApiKey('key'); listeners.get('pagehide')(); assert.equal(provider.hasApiKey(), false); });
test('fresh module reload has no credential restoration', () => { const first = harness().provider; first.setApiKey('key'); assert.equal(harness().provider.hasApiKey(), false); });
test('invalid and oversized credentials fail closed', () => { const { provider } = harness(); assert.throws(() => provider.setApiKey('')); assert.throws(() => provider.setApiKey('x'.repeat(513))); assert.equal(provider.hasApiKey(), false); });
test('proxy request binds the key to the same-origin fixed Mentor route', async () => { let request; const { provider } = harness(async (url, options) => { request = { url, options }; return { ok: true, headers: { get: () => null }, json: async () => ({ content: 'OK' }) }; }); provider.switchProvider('openai'); provider.setApiKey('synthetic-key'); await provider.chat([{ role: 'user', content: 'hello' }]); assert.equal(request.url, 'https://www.caissa-chess.org/api/mentor/chat'); assert.equal(JSON.parse(request.options.body).apiKey, 'synthetic-key'); });
test('direct stream binds only to the selected fixed provider endpoint', async () => { let url; const reader = { read: async () => ({ done: true }) }; const { provider } = harness(async target => { url = target; return { ok: true, body: { getReader: () => reader } }; }); provider.switchProvider('anthropic'); provider.setApiKey('synthetic-key'); await provider.chatStream([], () => {}); assert.equal(url, 'https://api.anthropic.com/v1/messages'); });
test('errors and timeouts do not log the sentinel credential', async () => { const sentinel = 'TEST_BYO_SECRET_DO_NOT_LOG_123'; const { provider, logs } = harness(async () => { throw new Error(`timeout ${sentinel}`); }); provider.setApiKey(sentinel); await assert.rejects(provider.chat([])); assert.equal(logs.join(' ').includes(sentinel), false); });
test('failed testConnection clears the credential and signOut dispatches clearing', async () => { const { provider } = harness(async () => { throw new Error('network'); }); provider.setApiKey('key'); assert.equal(await provider.testConnection(), false); assert.equal(provider.hasApiKey(), false); assert.match(authSource, /dispatchEvent\(new CustomEvent\('caissa-byo-clear'\)\)/); });
