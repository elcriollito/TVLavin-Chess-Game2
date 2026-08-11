import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import test from 'node:test';
import {
    clerkMigrationVerifierInternals,
    loadMigrationAuthorities,
    verifyDualMigrationTokens,
    verifyMigrationToken
} from '../api/_lib/clerk-migration-verifiers.js';
import { prepareSensitiveJsonRoute, consumePersistentMigrationThrottle } from '../api/_lib/identity-migration-http.js';
import { runRecoveryCli } from '../scripts/recover-clerk-identity.mjs';
import { createChallengeHandler } from '../api/user/identity-migration/challenge.js';
import { createActivationHandler } from '../api/user/identity-migration/activate.js';

const keyPair = () => crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }).publicKey.export({ type: 'spki', format: 'pem' });
const legacyPem = keyPair();
const productionPem = keyPair();
const env = {
    CAISSA_CLERK_LEGACY_ISSUER: 'https://legacy.invalid',
    CAISSA_CLERK_LEGACY_JWT_KEYS_JSON: JSON.stringify([{ kid: 'legacy-key', pem: legacyPem }]),
    CAISSA_CLERK_PRODUCTION_ISSUER: 'https://production.invalid',
    CAISSA_CLERK_PRODUCTION_JWT_KEYS_JSON: JSON.stringify([{ kid: 'production-key', pem: productionPem }])
};
const token = ({ kid, alg = 'RS256', typ = 'JWT', payload = {} }) => [
    Buffer.from(JSON.stringify({ alg, typ, kid })).toString('base64url'),
    Buffer.from(JSON.stringify(payload)).toString('base64url'),
    'synthetic-signature'
].join('.');

test('dual authorities require distinct fixed issuers and key material', () => {
    const loaded = loadMigrationAuthorities(env);
    assert.equal(loaded.legacy.issuer, 'https://legacy.invalid');
    assert.throws(() => loadMigrationAuthorities({
        ...env,
        CAISSA_CLERK_PRODUCTION_ISSUER: env.CAISSA_CLERK_LEGACY_ISSUER
    }), /VERIFIER_AUTHORITIES_NOT_DISTINCT/);
    assert.throws(() => loadMigrationAuthorities({
        ...env,
        CAISSA_CLERK_PRODUCTION_JWT_KEYS_JSON: env.CAISSA_CLERK_LEGACY_JWT_KEYS_JSON
    }), /VERIFIER_AUTHORITIES_NOT_DISTINCT/);
});

test('JWT header gate pins RS256/JWT and rejects none, confusion, URLs, and malformed tokens', () => {
    assert.equal(clerkMigrationVerifierInternals.algorithm, 'RS256');
    assert.throws(() => clerkMigrationVerifierInternals.decodeProtectedHeader(token({ kid: 'k', alg: 'none' })), /TOKEN_INVALID/);
    assert.throws(() => clerkMigrationVerifierInternals.decodeProtectedHeader(token({ kid: 'k', alg: 'HS256' })), /TOKEN_INVALID/);
    const embedded = [Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: 'k', jku: 'https://attacker.invalid' })).toString('base64url'), 'e30', 'x'].join('.');
    assert.throws(() => clerkMigrationVerifierInternals.decodeProtectedHeader(embedded), /TOKEN_INVALID/);
    for (const value of ['', 'a.b', 'a.b.c.d', 'not-json.e30.x']) {
        assert.throws(() => clerkMigrationVerifierInternals.decodeProtectedHeader(value), /TOKEN_INVALID/);
    }
});

test('key rotation is server-controlled by fixed kid allowlist', async () => {
    const rotatedPem = keyPair();
    const authorities = loadMigrationAuthorities({
        ...env,
        CAISSA_CLERK_PRODUCTION_JWT_KEYS_JSON: JSON.stringify([
            { kid: 'production-key', pem: productionPem },
            { kid: 'production-next', pem: rotatedPem }
        ])
    });
    let observedKey;
    const result = await verifyMigrationToken(token({ kid: 'production-next' }), authorities.production, async (_token, options) => {
        observedKey = options.jwtKey;
        return { iss: authorities.production.issuer, sub: 'PROD_ROTATED' };
    });
    assert.equal(result.ok, true);
    assert.equal(observedKey, rotatedPem);
    assert.deepEqual(await verifyMigrationToken(token({ kid: 'attacker-key' }), authorities.production, async () => {
        throw new Error('must not run');
    }), { ok: false });
});

test('signature verification failure is generic and fail closed', async () => {
    const authority = loadMigrationAuthorities(env).legacy;
    const result = await verifyMigrationToken(token({ kid: 'legacy-key' }), authority, async () => {
        throw new Error('synthetic invalid signature details');
    });
    assert.deepEqual(result, { ok: false });
});

test('only explicitly configured supported optional claims are forwarded', async () => {
    const authority = loadMigrationAuthorities(env).legacy;
    let observed;
    await verifyMigrationToken(token({ kid: 'legacy-key' }), authority, async (_token, options) => {
        observed = options;
        return { iss: authority.issuer, sub: 'LEGACY_A' };
    });
    assert.equal('audience' in observed, false);
    assert.equal('authorizedParties' in observed, false);
    const configured = loadMigrationAuthorities({
        ...env,
        CAISSA_CLERK_LEGACY_AUDIENCE: 'caissa-rehearsal',
        CAISSA_CLERK_LEGACY_AUTHORIZED_PARTIES_JSON: '["https://rehearsal.invalid"]'
    }).legacy;
    await verifyMigrationToken(token({ kid: 'legacy-key' }), configured, async (_token, options) => {
        observed = options;
        return { iss: configured.issuer, sub: 'LEGACY_A' };
    });
    assert.equal(observed.audience, 'caissa-rehearsal');
    assert.deepEqual(observed.authorizedParties, ['https://rehearsal.invalid']);
});

test('dual verification fails on wrong issuer, swapped authority, and same subject', async () => {
    const legacy = token({ kid: 'legacy-key' });
    const production = token({ kid: 'production-key' });
    const verifier = async (value, options) => ({
        iss: options.jwtKey === legacyPem ? env.CAISSA_CLERK_LEGACY_ISSUER : env.CAISSA_CLERK_PRODUCTION_ISSUER,
        sub: value === legacy ? 'LEGACY_A' : 'PROD_A'
    });
    assert.equal((await verifyDualMigrationTokens({ legacyToken: legacy, productionToken: production, env, verifyToken: verifier })).ok, true);
    assert.equal((await verifyDualMigrationTokens({ legacyToken: production, productionToken: legacy, env, verifyToken: verifier })).ok, false);
    assert.equal((await verifyDualMigrationTokens({
        legacyToken: legacy,
        productionToken: production,
        env,
        verifyToken: async (_value, options) => ({ iss: options.jwtKey === legacyPem ? env.CAISSA_CLERK_LEGACY_ISSUER : env.CAISSA_CLERK_PRODUCTION_ISSUER, sub: 'SAME' })
    })).ok, false);
});

test('HTTP guard enforces POST, JSON, body limits, and no-store', () => {
    const response = { headers: {}, setHeader(name, value) { this.headers[name] = value; } };
    assert.equal(prepareSensitiveJsonRoute({ method: 'GET', headers: {}, body: {} }, response).status, 405);
    assert.equal(prepareSensitiveJsonRoute({ method: 'POST', headers: { 'content-type': 'text/plain' }, body: {} }, response).status, 415);
    assert.equal(prepareSensitiveJsonRoute({ method: 'POST', headers: { 'content-type': 'application/json', 'content-length': '20000' }, body: {} }, response).status, 413);
    assert.equal(prepareSensitiveJsonRoute({ method: 'POST', headers: { 'content-type': 'application/json' }, body: {} }, response).ok, true);
    assert.equal(response.headers['Cache-Control'], 'no-store');
});

test('persistent throttle fails closed and hashes scope before RPC', async () => {
    let params;
    const supabase = { rpc: async (_name, value) => { params = value; return { data: [{ allowed: true, retry_after_seconds: 0 }], error: null }; } };
    const req = { headers: { 'x-forwarded-for': '192.0.2.1' } };
    assert.deepEqual(await consumePersistentMigrationThrottle(supabase, req, 'challenge', {}), { ok: false, unavailable: true });
    assert.equal((await consumePersistentMigrationThrottle(supabase, req, 'challenge', { CAISSA_IDENTITY_MIGRATION_THROTTLE_PEPPER: 'x'.repeat(32) })).ok, true);
    assert.match(params.p_scope_hash, /^[0-9a-f]{64}$/);
    assert.equal(JSON.stringify(params).includes('192.0.2.1'), false);
});

class MockClient {
    constructor(options) { this.options = options; this.calls = []; }
    async connect() {}
    async end() {}
    async query(sql, params = []) {
        this.calls.push({ sql, params });
        if (sql.includes('preview_manual')) return { rows: [{ success: true, code: 'RECOVERY_PREVIEW_READY', preview_id: '10000000-0000-4000-8000-000000000001' }] };
        if (sql.includes('execute_manual')) return { rows: [{ success: true, code: 'MANUAL_RECOVERY_EXECUTED' }] };
        if (sql.includes('rollback_clerk')) return { rows: [{ success: true, code: 'BINDING_ROLLED_BACK' }] };
        return { rows: [] };
    }
}

const cliEnv = {
    CAISSA_IDENTITY_RECOVERY_ENVIRONMENT: 'isolated-rehearsal',
    CAISSA_IDENTITY_MIGRATION_REHEARSAL_DATABASE_URL: 'REDACTED_TEST_CONNECTION'
};
const userId = '00000000-0000-4000-8000-00000000000a';
const reason = 'Approved synthetic recovery ticket SEC-005-TEST';

test('recovery dry-run returns only redacted target evidence', async () => {
    const result = await runRecoveryCli({ argv: ['--dry-run', '--user-id', userId, '--target-subject', 'PROD_SECRET_TARGET', '--reason', reason], env: cliEnv, ClientClass: MockClient });
    assert.equal(result.ok, true);
    const output = JSON.stringify(result);
    assert.equal(output.includes('PROD_SECRET_TARGET'), false);
    assert.equal(output.includes(reason), false);
    assert.equal(output.includes(cliEnv.CAISSA_IDENTITY_MIGRATION_REHEARSAL_DATABASE_URL), false);
});

test('recovery execution and rollback require exact explicit confirmation', async () => {
    await assert.rejects(runRecoveryCli({ argv: ['--execute', '--preview-id', '10000000-0000-4000-8000-000000000001', '--user-id', userId, '--target-subject', 'PROD_A', '--reason', reason, '--confirm', 'yes'], env: cliEnv, ClientClass: MockClient }), /EXPLICIT_CONFIRMATION_REQUIRED/);
    const executed = await runRecoveryCli({ argv: ['--execute', '--preview-id', '10000000-0000-4000-8000-000000000001', '--user-id', userId, '--target-subject', 'PROD_A', '--reason', reason, '--confirm', `RECOVER ${userId}`], env: cliEnv, ClientClass: MockClient });
    assert.equal(executed.ok, true);
    await assert.rejects(runRecoveryCli({ argv: ['--rollback', '--user-id', userId, '--reason', reason, '--confirm', 'ROLLBACK wrong'], env: cliEnv, ClientClass: MockClient }), /EXPLICIT_CONFIRMATION_REQUIRED/);
});

test('recovery CLI is not imported or exposed by public API routes', () => {
    const apiFiles = ['api/user/identity-migration/challenge.js', 'api/user/identity-migration/activate.js'];
    for (const file of apiFiles) {
        const source = fs.readFileSync(file, 'utf8');
        assert.doesNotMatch(source, /recover-clerk-identity|DATABASE_URL|JWT_KEYS_JSON|ISSUER/);
        assert.doesNotMatch(source, /console\.(log|error)|req\.body\.(issuer|jwks|secret|key|apiUrl)/);
    }
});

function responseHarness() {
    return {
        headers: {}, statusCode: 0, body: null,
        setHeader(name, value) { this.headers[name] = value; },
        status(code) { this.statusCode = code; return this; },
        json(body) { this.body = body; return this; }
    };
}

const routeRequest = (body = {}) => ({
    method: 'POST',
    headers: {
        'content-type': 'application/json',
        'x-caissa-legacy-session': 'legacy-token',
        'x-caissa-production-session': 'production-token',
        'x-forwarded-for': '192.0.2.10'
    },
    body
});

test('challenge route creates handoff only from verified server-derived subjects', async () => {
    let handoffInput;
    const supabase = { rpc: async () => ({ data: [{ resolution: 'BOUND', user_id: userId }], error: null }) };
    const handler = createChallengeHandler({
        getSupabase: () => supabase,
        consumePersistentMigrationThrottle: async () => ({ ok: true }),
        verifyDualMigrationTokens: async () => ({ ok: true, legacySubject: 'LEGACY_VERIFIED', productionSubject: 'PROD_VERIFIED' }),
        createMigrationHandoff: async input => { handoffInput = input; return { ok: true, token: 'opaque-handoff', expiresAt: '2030-01-01T00:00:00.000Z' }; }
    });
    const res = responseHarness();
    await handler(routeRequest(), res);
    assert.equal(res.statusCode, 201);
    assert.equal(handoffInput.existingAccount.userId, userId);
    assert.equal(handoffInput.existingAccount.legacySubject, 'LEGACY_VERIFIED');
    assert.equal(handoffInput.verifiedProductionSubject, 'PROD_VERIFIED');
});

test('challenge route returns generic failure without invoking handoff', async () => {
    let called = false;
    const handler = createChallengeHandler({
        getSupabase: () => ({}),
        consumePersistentMigrationThrottle: async () => ({ ok: true }),
        verifyDualMigrationTokens: async () => ({ ok: false }),
        createMigrationHandoff: async () => { called = true; }
    });
    const res = responseHarness();
    await handler(routeRequest(), res);
    assert.equal(res.statusCode, 401);
    assert.deepEqual(res.body, { error: 'Identity verification failed' });
    assert.equal(called, false);
});

test('activation route binds challenge to freshly verified production subject', async () => {
    let activation;
    const handler = createActivationHandler({
        getSupabase: () => ({}),
        consumePersistentMigrationThrottle: async () => ({ ok: true }),
        getFixedMigrationAuthority: () => ({ fixed: true }),
        verifyMigrationToken: async () => ({ ok: true, subject: 'PROD_VERIFIED' }),
        activateMigrationHandoff: async input => { activation = input; return { ok: true }; }
    });
    const res = responseHarness();
    await handler(routeRequest({ challengeToken: 'opaque-handoff' }), res);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { migrated: true });
    assert.equal(activation.verifiedProductionSubject, 'PROD_VERIFIED');
});

test('routes fail closed on persistent throttle outage or denial', async () => {
    for (const throttle of [{ ok: false, unavailable: true }, { ok: false, retryAfter: 60 }]) {
        const handler = createChallengeHandler({
            getSupabase: () => ({}),
            consumePersistentMigrationThrottle: async () => throttle
        });
        const res = responseHarness();
        await handler(routeRequest(), res);
        assert.equal(res.statusCode, throttle.unavailable ? 503 : 429);
        assert.deepEqual(res.body, { error: 'Identity migration unavailable' });
    }
});
