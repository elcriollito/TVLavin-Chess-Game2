import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BETA_STAGES, canAccessBetaProgram, canAccessExperiment, isExperimentActive, listAccessibleExperiments
} from '../api/_lib/beta-program-policy.js';
import { createBetaProgramService } from '../api/_lib/beta-program-service.js';
import { createAuthenticateRequest } from '../api/_lib/auth.js';
import { createScannerBetaService } from '../api/_lib/scanner-beta-service.js';

const now = new Date('2026-09-19T17:00:00Z');
const experiment = (overrides = {}) => ({ id: 'scanner', slug: 'scanner', displayName: 'CAISSA Scanner',
  stage: 'internal-beta', enabled: true, accessPolicy: 'global-beta', sortOrder: 10, ...overrides });
const user = (overrides = {}) => ({ authenticated: true, role: 'member', entitlements: [], ...overrides });

test('beta lifecycle stages remain explicit and historical stages are inactive', () => {
  assert.deepEqual(BETA_STAGES, ['development', 'internal-alpha', 'internal-beta', 'closed-beta', 'public-beta', 'released', 'retired']);
  assert.equal(isExperimentActive(experiment({ stage: 'released' }), now), false);
  assert.equal(isExperimentActive(experiment({ stage: 'retired' }), now), false);
  assert.equal(isExperimentActive(experiment({ enabled: false }), now), false);
  assert.equal(isExperimentActive(experiment({ endsAt: '2026-09-19T16:59:59Z' }), now), false);
  assert.equal(isExperimentActive(experiment({ endsAt: '2026-09-20T00:00:00Z' }), now), true);
});

test('global beta, owner/admin, feature cohorts, and public-beta policies are centralized', () => {
  const betaTester = user({ entitlements: ['beta_tester'] });
  assert.equal(canAccessBetaProgram(betaTester), true);
  assert.equal(canAccessExperiment(betaTester, experiment(), now), true);
  assert.equal(canAccessExperiment(user({ role: 'owner' }), experiment({ accessPolicy: 'owner-only' }), now), true);
  assert.equal(canAccessExperiment(user({ role: 'admin' }), experiment({ accessPolicy: 'feature-entitlement', requiredEntitlement: 'scanner_beta' }), now), true);
  assert.equal(canAccessExperiment(user({ entitlements: ['scanner_beta'] }), experiment({ accessPolicy: 'feature-entitlement', requiredEntitlement: 'scanner_beta' }), now), true);
  assert.equal(canAccessExperiment(betaTester, experiment({ accessPolicy: 'feature-entitlement', requiredEntitlement: 'scanner_beta' }), now), false);
  assert.equal(canAccessExperiment(user(), experiment({ stage: 'public-beta', accessPolicy: 'public-beta' }), now), true);
  assert.equal(canAccessExperiment(user(), experiment(), now), false);
});

test('registry listing omits inaccessible, disabled, released, retired, and expired records', () => {
  const records = [experiment(), experiment({ id: 'released', slug: 'released', displayName: 'Released', stage: 'released' }),
    experiment({ id: 'retired', slug: 'retired', displayName: 'Retired', stage: 'retired' }),
    experiment({ id: 'closed', slug: 'closed', displayName: 'Closed', accessPolicy: 'feature-entitlement', requiredEntitlement: 'closed_beta' })];
  assert.deepEqual(listAccessibleExperiments(user({ entitlements: ['beta_tester'] }), records, now).map(item => item.id), ['scanner']);
});

test('Scanner kill switch is additive to account authorization', async () => {
  const store = { async getUserByClerkId() { return { ...user({ entitlements: ['beta_tester'] }), id: 'u1' }; },
    async getExperiment() { return experiment(); }, async listExperiments() { return [experiment()]; }, async recordEvent() {} };
  const authenticate = async () => ({ authenticated: true, userId: 'clerk' });
  const enabled = createBetaProgramService({ store, authenticate, env: { CAISSA_SCANNER_BETA_STAGE: 'internal' }, now: () => now });
  const disabled = createBetaProgramService({ store, authenticate, env: {}, now: () => now });
  assert.equal((await enabled.authorizeExperiment({ headers: {} }, 'scanner')).ok, true);
  const disabledAccess = await disabled.authorizeExperiment({ headers: {} }, 'scanner');
  assert.equal(disabledAccess.ok, false);
  assert.equal(disabledAccess.status, 404);
  assert.equal(disabledAccess.code, 'BETA_DISABLED');
});

test('browser authentication accepts the Clerk session cookie while API authentication stays Bearer-only', async () => {
  const payload = { sub: 'user_abc', email: 'beta@example.test' };
  const browser = createAuthenticateRequest({ allowSessionCookie: true, env: { CLERK_SECRET_KEY: 'secret' }, verifyToken: async token => {
    assert.equal(token, 'signed.token'); return payload;
  } });
  assert.equal((await browser({ headers: { cookie: 'a=1; __session=signed.token' } })).userId, 'user_abc');
  const api = createAuthenticateRequest({ env: { CLERK_SECRET_KEY: 'secret' }, verifyToken: async () => payload });
  assert.equal((await api({ headers: { cookie: '__session=signed.token' } })).status, 401);
});

test('direct Scanner API requests cannot reach parsing or persistence without entitlement', async () => {
  let stored = false;
  const service = createScannerBetaService({ env: { CAISSA_SCANNER_BETA_STAGE: 'internal' },
    authorizeExperiment: async () => ({ ok: false, authenticated: true, status: 403, code: 'BETA_ACCESS_DENIED' }),
    store: { async putScan() { stored = true; } } });
  const res = { statusCode: 0, body: null, setHeader() {}, status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; } };
  await service.scan({ method: 'POST', headers: {}, body: { deliberately: 'invalid' } }, res);
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.error, 'BETA_ACCESS_DENIED');
  assert.equal(stored, false);
});
