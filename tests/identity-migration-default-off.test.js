import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { isIdentityMigrationEnforced } from '../api/_lib/identity-resolution.js';
import { createChallengeHandler } from '../api/user/identity-migration/challenge.js';
import { createActivationHandler } from '../api/user/identity-migration/activate.js';

const disabledValues = [undefined, '', 'false', 'true', '0', '1', 'ENFORCED', 'Enforced', ' enforced', 'enforced ', 'random'];

function responseHarness() {
    return {
        headers: {}, statusCode: 0, body: null,
        setHeader(name, value) { this.headers[name] = value; },
        status(code) { this.statusCode = code; return this; },
        json(body) { this.body = body; return this; },
        end() { return this; }
    };
}

function request(body, overrides = {}) {
    return {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...overrides.headers },
        query: overrides.query || {},
        cookies: overrides.cookies || {},
        body
    };
}

function privilegedDependencies(value, calls) {
    const env = {
        CAISSA_IDENTITY_MIGRATION_MODE: value,
        CAISSA_IDENTITY_MIGRATION_THROTTLE_PEPPER: 'x'.repeat(32),
        CAISSA_CLERK_LEGACY_ISSUER: 'https://legacy.invalid',
        CAISSA_CLERK_PRODUCTION_ISSUER: 'https://production.invalid',
        CAISSA_CLERK_LEGACY_JWT_KEYS_JSON: '[{"kid":"legacy"}]',
        CAISSA_CLERK_PRODUCTION_JWT_KEYS_JSON: '[{"kid":"production"}]'
    };
    return {
        env,
        getSupabase: () => { calls.database += 1; return {}; },
        consumePersistentMigrationThrottle: async () => { calls.throttle += 1; return { ok: true }; },
        verifyDualMigrationTokens: async () => { calls.jwt += 1; return { ok: false }; },
        verifyMigrationToken: async () => { calls.jwt += 1; return { ok: false }; },
        getFixedMigrationAuthority: () => { calls.authority += 1; return {}; },
        createMigrationHandoff: async () => { calls.rpc += 1; return { ok: false }; },
        activateMigrationHandoff: async () => { calls.rpc += 1; return { ok: false }; }
    };
}

test('migration mode accepts only the exact server-controlled enforced value', () => {
    for (const value of disabledValues) {
        assert.equal(isIdentityMigrationEnforced({ CAISSA_IDENTITY_MIGRATION_MODE: value }), false, String(value));
    }
    assert.equal(isIdentityMigrationEnforced({ CAISSA_IDENTITY_MIGRATION_MODE: 'enforced' }), true);
});

test('challenge and activation stay inert for the complete disabled-value matrix', async () => {
    for (const value of disabledValues) {
        for (const [createHandler, body] of [[createChallengeHandler, {}], [createActivationHandler, { challengeToken: 'synthetic' }]]) {
            const calls = { database: 0, throttle: 0, jwt: 0, authority: 0, rpc: 0 };
            const res = responseHarness();
            await createHandler(privilegedDependencies(value, calls))(request(body), res);
            assert.equal(res.statusCode, 404, String(value));
            assert.deepEqual(res.body, { error: 'Not found' });
            assert.deepEqual(calls, { database: 0, throttle: 0, jwt: 0, authority: 0, rpc: 0 });
        }
    }
});

test('client-controlled mode claims cannot enable either route', async () => {
    for (const [createHandler, body] of [[createChallengeHandler, { mode: 'enforced', frontendFeatureFlag: 'enforced' }], [createActivationHandler, { challengeToken: 'synthetic', mode: 'enforced', frontendFeatureFlag: 'enforced' }]]) {
        const calls = { database: 0, throttle: 0, jwt: 0, authority: 0, rpc: 0 };
        const req = request(body, {
            headers: { 'x-caissa-identity-migration-mode': 'enforced' },
            query: { mode: 'enforced' },
            cookies: { CAISSA_IDENTITY_MIGRATION_MODE: 'enforced' }
        });
        const res = responseHarness();
        await createHandler(privilegedDependencies(undefined, calls))(req, res);
        assert.equal(res.statusCode, 404);
        assert.deepEqual(calls, { database: 0, throttle: 0, jwt: 0, authority: 0, rpc: 0 });
    }
});

test('all other prerequisites cannot override a mode-off server configuration', async () => {
    const calls = { database: 0, throttle: 0, jwt: 0, authority: 0, rpc: 0 };
    const res = responseHarness();
    await createChallengeHandler(privilegedDependencies('true', calls))(request({}), res);
    assert.equal(res.statusCode, 404);
    assert.deepEqual(calls, { database: 0, throttle: 0, jwt: 0, authority: 0, rpc: 0 });
});

test('exact enforced mode reaches the normal challenge and activation paths', async () => {
    const challengeCalls = { database: 0, throttle: 0, jwt: 0, authority: 0, rpc: 0 };
    const challengeDeps = privilegedDependencies('enforced', challengeCalls);
    challengeDeps.getSupabase = () => ({ rpc: async () => ({ data: [{ resolution: 'BOUND', user_id: 'synthetic-user' }], error: null }) });
    challengeDeps.verifyDualMigrationTokens = async () => ({ ok: true, legacySubject: 'legacy-synthetic', productionSubject: 'production-synthetic' });
    challengeDeps.createMigrationHandoff = async () => ({ ok: true, token: 'synthetic-handoff', expiresAt: '2030-01-01T00:00:00.000Z' });
    const challengeResponse = responseHarness();
    await createChallengeHandler(challengeDeps)(request({}), challengeResponse);
    assert.equal(challengeResponse.statusCode, 201);

    const activationCalls = { database: 0, throttle: 0, jwt: 0, authority: 0, rpc: 0 };
    const activationDeps = privilegedDependencies('enforced', activationCalls);
    activationDeps.getSupabase = () => ({});
    activationDeps.getFixedMigrationAuthority = () => ({ fixed: true });
    activationDeps.verifyMigrationToken = async () => ({ ok: true, subject: 'production-synthetic' });
    activationDeps.activateMigrationHandoff = async () => ({ ok: true });
    const activationResponse = responseHarness();
    await createActivationHandler(activationDeps)(request({ challengeToken: 'synthetic-handoff' }), activationResponse);
    assert.equal(activationResponse.statusCode, 200);
});

test('gate is structurally before database, throttle, JWT, and migration operations', () => {
    for (const file of ['api/user/identity-migration/challenge.js', 'api/user/identity-migration/activate.js']) {
        const source = fs.readFileSync(file, 'utf8');
        const gate = source.indexOf('if (!isIdentityMigrationEnforced(environment))');
        assert.ok(gate > source.indexOf('prepareSensitiveJsonRoute(req, res)'));
        for (const privilegedCall of ['getDatabase()', 'consumeThrottle(', 'verifyDual(', 'verifyToken(', 'createHandoff(', 'activateHandoff(']) {
            const position = source.indexOf(privilegedCall, gate);
            if (position !== -1) assert.ok(gate < position, `${file}: ${privilegedCall}`);
        }
    }
});

test('manual recovery remains offline and independent of the public migration-mode gate', () => {
    const cli = fs.readFileSync('scripts/recover-clerk-identity.mjs', 'utf8');
    assert.match(cli, /CAISSA_IDENTITY_RECOVERY_ENVIRONMENT/);
    assert.match(cli, /isolated-rehearsal/);
    assert.doesNotMatch(cli, /CAISSA_IDENTITY_MIGRATION_MODE/);
    for (const route of ['api/user/identity-migration/challenge.js', 'api/user/identity-migration/activate.js']) {
        assert.doesNotMatch(fs.readFileSync(route, 'utf8'), /recover-clerk-identity/);
    }
});
