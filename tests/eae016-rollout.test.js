import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { normalizeReleaseStage, publicRolloutConfigured, rolloutEligibility } from
  '../experiments/lc0-preview-relay/rollout-policy.mjs';
import { configuredStore, SupabaseStore } from
  '../experiments/lc0-preview-relay/store.mjs';

const read = relative => fs.readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8');

test('certified Lc0 binary, ORT, Maia, and worker source bytes remain frozen at RC1', () => {
  const expected = {
    'experiments/lc0-preview-relay/engine/artifacts/runtime/lc0.js': 'c2b1786ff568d0d5042588b5b9bbf7a78623e47930ad4358803f2a37e3ca66a9',
    'experiments/lc0-preview-relay/engine/artifacts/runtime/lc0.wasm': '5c3cc8c72b5794092790ab2c7615a7a7e9757e1c899fa2a4cc1ca158547a07f0',
    'experiments/lc0-preview-relay/engine/artifacts/runtime/lc0.worker.mjs': '7e6dad4bca61807357acfcb3789c781deaca3e20214ccd76dd82ddcb0be0a153',
    'experiments/lc0-preview-relay/engine/artifacts/ort/ort-wasm-simd-threaded.mjs': '0a1e718d99c41b22c21f2520ff4f9e883a6b5533856e398d21816ee8eb8185d3',
    'experiments/lc0-preview-relay/engine/artifacts/ort/ort-wasm-simd-threaded.wasm': 'd1ab1b94b16a65b29d710d0b587b29e7bed336827577623913479b8afe8113e6',
    'experiments/lc0-preview-relay/engine/artifacts/network/maia-1100.pb.gz': 'e1cf1cd0c96b8a4fa6a275f4b9fd54ed1ffebf9fe44641b9fceded310e9619c4',
    'experiments/lc0-browser-lab/src/lc0-worker.js': 'c75176d4e2b908cf4218a71af9193b7bc676d2c477bfc3c263f65a189a3080b2'
  };
  for (const [relative, digest] of Object.entries(expected)) {
    const raw = fs.readFileSync(new URL(`../${relative}`, import.meta.url));
    const bytes = relative.endsWith('/src/lc0-worker.js')
      ? Buffer.from(raw.toString('utf8').replace(/\r\n/g, '\n')) : raw;
    assert.equal(createHash('sha256').update(bytes).digest('hex'), digest, relative);
  }
});

test('release stages fail closed and preserve the progressive rollout order', () => {
  assert.equal(normalizeReleaseStage('INTERNAL_ONLY'), 'INTERNAL_ONLY');
  assert.equal(normalizeReleaseStage('CANARY_OPT_IN'), 'CANARY_OPT_IN');
  assert.equal(normalizeReleaseStage('EXPERIMENTAL_OPT_IN'), 'EXPERIMENTAL_OPT_IN');
  assert.equal(normalizeReleaseStage('DRAINING'), 'DRAINING');
  assert.equal(normalizeReleaseStage('unknown'), 'DISABLED');
  assert.equal(normalizeReleaseStage(), 'DISABLED');
});

test('internal and canary eligibility is stable and server-authoritative', () => {
  const env = { EAE015B_INTERNAL_USER_IDS: 'owner', EAE016_CANARY_USER_IDS: 'alpha,beta' };
  assert.deepEqual(rolloutEligibility('owner', 'INTERNAL_ONLY', env),
    { eligible: true, stage: 'INTERNAL_ONLY', reason: null });
  assert.equal(rolloutEligibility('alpha', 'INTERNAL_ONLY', env).eligible, false);
  assert.equal(rolloutEligibility('alpha', 'CANARY_OPT_IN', env).eligible, true);
  assert.equal(rolloutEligibility('owner', 'CANARY_OPT_IN', env).eligible, true);
  assert.equal(rolloutEligibility('other', 'CANARY_OPT_IN', env).eligible, false);
  assert.equal(rolloutEligibility('other', 'EXPERIMENTAL_OPT_IN', env).eligible, true);
  assert.equal(rolloutEligibility(null, 'EXPERIMENTAL_OPT_IN', env).reason, 'AUTH_REQUIRED');
  assert.equal(rolloutEligibility('owner', 'DRAINING', env).eligible, false);
  assert.equal(rolloutEligibility('owner', 'DISABLED', env).eligible, false);
});

test('public production datastore access requires explicit rollout controls', () => {
  const base = { VERCEL_ENV: 'production', EAE015B_PRODUCTION_CANDIDATE: '1',
    EAE015A_PRODUCTION_SHAPE: '1', EAE011_SUPABASE_URL:
      'https://jczauvkfkweuvdpurpem.supabase.co', EAE011_SUPABASE_SERVICE_ROLE_KEY: 'test-key' };
  assert.equal(publicRolloutConfigured({ ...base, EAE016_PUBLIC_ROLLOUT: '1' }), true);
  assert.throws(() => configuredStore(base), /LC0_STORE_TARGET_REJECTED/);
  assert.ok(configuredStore({ ...base, EAE016_PUBLIC_ROLLOUT: '1' }) instanceof SupabaseStore);
  assert.ok(configuredStore({ VERCEL_ENV: 'production', EAE015B_PRODUCTION_CANDIDATE: '1',
    EAE015A_PRODUCTION_SHAPE: '1', EAE016_PUBLIC_ROLLOUT: '1',
    NEXT_PUBLIC_SUPABASE_URL: base.EAE011_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: base.EAE011_SUPABASE_SERVICE_ROLE_KEY }) instanceof SupabaseStore);
});

test('public Arena carries a compact consent surface and no static runtime payload', () => {
  const html = read('index.html');
  assert.match(html, /id="arenaExperimentalEngines"/);
  assert.match(html, /Enable Experimental Lc0/);
  assert.match(html, /desktop Chrome and Edge/);
  assert.match(html, /additional browser memory and processing power/);
  assert.match(html, /\/about#engine-sources/);
  assert.doesNotMatch(html, /lc0\.wasm|maia-1100\.pb\.gz|isolated-browser-runtime-adapter\.js/);
});

test('rollout controller gates browser support before dynamic adapter loading', () => {
  const source = read('js/arena-lc0-rollout.js');
  assert.match(source, /Google Chrome\|Microsoft Edge/);
  assert.match(source, /Android\|iPhone\|iPad\|iPod\|Mobile/);
  assert.match(source, /config\.runtimeHealthy === true/);
  assert.match(source, /config\.relayHealthy === true/);
  const prepare = source.slice(source.indexOf('async prepare()'));
  assert.ok(prepare.indexOf('if (!capability.supported)') < prepare.indexOf('await this.register()'));
  assert.match(source, /SOURCE_MANIFEST.*492c6749989f429c269725d6d2761d4687c8096ca437f5651189fcfbe4ffbb9f/s);
  assert.match(source, /DEPLOYMENT_MANIFEST.*a38862ac2113cf4e5962aa35e30a315046bafe650fedb24471b9feab954b4ed3/s);
});

test('normal registry excludes Lc0 until explicit opt-in and supports clean disable', () => {
  const source = read('js/engine-registry.js');
  const window = { WebAssembly: {}, matchMedia: () => ({ matches: false }) };
  vm.runInNewContext(source, { window, console }, { filename: 'engine-registry.js' });
  const registry = window.EngineRegistry;
  assert.equal(registry.listArenaProviders().some(item => item.id === 'lc0-maia-1100-preview'), false);
  window.CaissaArenaPreview = { enabled: true };
  assert.equal(registry.registerArenaPreviewProvider({ id: 'lc0-maia-1100-preview',
    availability: 'available', enabled: true, workerPath: '/isolated' }, () => ({})), true);
  assert.equal(registry.listArenaProviders().filter(item => item.id === 'lc0-maia-1100-preview').length, 1);
  assert.equal(registry.unregisterArenaPreviewProvider('lc0-maia-1100-preview'), true);
  assert.equal(registry.listArenaProviders().some(item => item.id === 'lc0-maia-1100-preview'), false);
});

test('server telemetry is allowlisted, bounded, and excludes user identifiers from payloads', () => {
  const source = read('api/eae016.js');
  for (const event of ['opt_in_viewed', 'opt_in_enabled', 'opt_in_disabled',
    'lc0_selector_visible', 'lc0_session_requested', 'lc0_session_created', 'lc0_ready',
    'lc0_initialization_failed', 'lc0_popup_blocked', 'lc0_unsupported_browser',
    'lc0_match_started', 'lc0_match_completed', 'lc0_user_abort']) assert.match(source, new RegExp(event));
  assert.match(source, /createHmac\('sha256'/);
  assert.doesNotMatch(source, /recordMetrics\(\[\{[^}]*userId/s);
  assert.match(source, /60_000, 60/);
});

test('rollout dashboard keeps actor identity pseudonymous and exposes bounded percentiles', () => {
  const sql = read('supabase/migrations/20260924010000_eae016_rollout_metrics.sql');
  assert.match(sql, /actor_hash text not null check \(actor_hash ~ '\^\[0-9a-f\]\{64\}\$'\)/);
  assert.match(sql, /percentile_cont\(0\.5\)/);
  assert.match(sql, /percentile_cont\(0\.95\)/);
  assert.match(sql, /eligibleUsers/);
  assert.match(sql, /cleanupFailures/);
  assert.match(sql, /transportFailures/);
  assert.match(sql, /forcedKills/);
  assert.match(sql, /interval '30 days'/);
  assert.doesNotMatch(sql, /user_id|email/i);
});

test('competition and evaluator invariants remain enforced outside the UI', () => {
  const arena = read('js/caissa-arena.js');
  const relay = read('api/eae011.js');
  assert.match(arena, /Only one Lc0 participant is permitted per competition/);
  assert.match(arena, /const evalConfig = this\.engines\.find\(e => e\.id === 'stockfish'\)/);
  assert.match(relay, /rolloutEligibility\(userId, stage, process\.env\)/);
  assert.match(relay, /LC0_CANARY_ONLY/);
});

test('public CSP permits only the exact relay and does not alter Arena isolation headers', () => {
  const config = JSON.parse(read('vercel.json'));
  const global = config.headers.find(item => item.source === '/(.*)').headers;
  const csp = global.find(item => item.key === 'Content-Security-Policy').value;
  assert.match(csp, /connect-src[^;]*https:\/\/caissa-lc0-relay-eae015a\.vercel\.app/);
  assert.doesNotMatch(csp, /connect-src[^;]*https:\/\/\*\.vercel\.app/);
  assert.equal(global.find(item => item.key === 'Cross-Origin-Opener-Policy').value,
    'same-origin-allow-popups');
  assert.equal(global.some(item => item.key === 'Cross-Origin-Embedder-Policy'), false);
});
