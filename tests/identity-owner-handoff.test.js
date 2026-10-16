import assert from 'node:assert/strict';
import test from 'node:test';

import {
    clearOwnerHandoffCookie,
    deriveOwnerChallengeToken,
    identityOwnerHandoffInternals,
    issueOwnerHandoff,
    issueOwnerProofReceipt,
    ownerHandoffCookie,
    ownerHandoffStateFromCookie,
    safeOwnerReturnTo,
    setOwnerHandoffCors,
    verifyOwnerHandoff,
    verifyOwnerProofReceipt
} from '../api/_lib/identity-owner-handoff.js';
import { createOwnerHandoffStartHandler } from '../api/user/identity-migration/owner/start.js';
import { createOwnerHandoffProofHandler } from '../api/user/identity-migration/owner/prove.js';
import { createOwnerHandoffCompleteHandler } from '../api/user/identity-migration/owner/complete.js';

const NOW = Date.parse('2030-01-01T00:00:00.000Z');
const PROD_ORIGIN = 'https://www.caissa-chess.org';
const LEGACY_ORIGIN = 'https://validation.example.test';
const env = {
    CAISSA_IDENTITY_MIGRATION_MODE: 'enforced',
    CAISSA_IDENTITY_MIGRATION_THROTTLE_PEPPER: 'synthetic-test-pepper-that-is-longer-than-32-bytes',
    CAISSA_APP_ORIGIN: PROD_ORIGIN,
    CAISSA_SEC005_LEGACY_HANDOFF_ORIGIN: LEGACY_ORIGIN
};

function responseHarness() {
    return {
        headers: {}, statusCode: 0, body: null, ended: false,
        setHeader(name, value) { this.headers[name] = value; },
        status(code) { this.statusCode = code; return this; },
        json(body) { this.body = body; return this; },
        end() { this.ended = true; return this; }
    };
}

function request(origin, body = {}, extraHeaders = {}) {
    const serialized = JSON.stringify(body);
    return {
        method: 'POST',
        headers: {
            origin,
            authorization: 'Bearer synthetic-jwt-not-logged',
            'content-type': 'application/json',
            'content-length': String(Buffer.byteLength(serialized)),
            'x-forwarded-for': '192.0.2.50',
            ...extraHeaders
        },
        body
    };
}

test('opaque owner state is confidential, authenticated, expiring, and preserves only a safe internal return', () => {
    const issued = issueOwnerHandoff('production-secret-subject', env, NOW, 10 * 60 * 1000, '/puzzles?mode=account#discarded');
    assert.match(issued.state, /^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    assert.equal(issued.state.includes('production-secret-subject'), false);
    const verified = verifyOwnerHandoff(issued.state, env, NOW + 1);
    assert.deepEqual({ ok: verified.ok, productionSubject: verified.productionSubject, returnTo: verified.returnTo }, {
        ok: true,
        productionSubject: 'production-secret-subject',
        returnTo: '/puzzles?mode=account'
    });
    const tampered = `${issued.state.slice(0, -1)}${issued.state.endsWith('A') ? 'B' : 'A'}`;
    assert.deepEqual(verifyOwnerHandoff(tampered, env, NOW + 1), { ok: false });
    assert.deepEqual(verifyOwnerHandoff(issued.state, env, NOW + 10 * 60 * 1000), { ok: false });
    assert.equal(safeOwnerReturnTo('https://attacker.invalid/x', PROD_ORIGIN), '/play');
    assert.equal(safeOwnerReturnTo('//attacker.invalid/x', PROD_ORIGIN), '/play');
    assert.equal(safeOwnerReturnTo('/safe\\evil', PROD_ORIGIN), '/play');
});

test('challenge token is deterministic, fixed length, and not the opaque state', () => {
    const state = issueOwnerHandoff('PROD_A', env, NOW).state;
    const first = deriveOwnerChallengeToken(state, env);
    assert.match(first, /^[A-Za-z0-9_-]{43}$/);
    assert.equal(first, deriveOwnerChallengeToken(state, env));
    assert.notEqual(first, state);
    assert.notEqual(first, deriveOwnerChallengeToken(`${state}x`, env));
});

test('proof receipt is confidential, authenticated, expiring, and bound to one handoff state', () => {
    const state = issueOwnerHandoff('PROD_A', env, NOW).state;
    const otherState = issueOwnerHandoff('PROD_A', env, NOW).state;
    const receipt = issueOwnerProofReceipt(state, 'LEGACY_A', env, NOW + 1);
    assert.match(receipt, /^r1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    assert.equal(receipt.includes('LEGACY_A'), false);
    assert.equal(verifyOwnerProofReceipt(receipt, state, env, NOW + 2).ok, true);
    assert.deepEqual(verifyOwnerProofReceipt(receipt, otherState, env, NOW + 2), { ok: false });
    const tampered = receipt.slice(0, -1) + (receipt.endsWith('A') ? 'B' : 'A');
    assert.deepEqual(verifyOwnerProofReceipt(tampered, state, env, NOW + 2), { ok: false });
    assert.deepEqual(verifyOwnerProofReceipt(receipt, state, env, NOW + 10 * 60 * 1000), { ok: false });
});

test('handoff cookie is host-only, secure, HttpOnly, Strict, bounded, and clearable', () => {
    const state = issueOwnerHandoff('PROD_A', env, NOW).state;
    const cookie = ownerHandoffCookie(state);
    assert.match(cookie, /^__Host-caissa_sec005_owner_handoff=/);
    assert.match(cookie, /; Path=\/; Secure; HttpOnly; SameSite=Strict$/);
    assert.doesNotMatch(cookie, /Domain=/i);
    assert.equal(ownerHandoffStateFromCookie({ headers: { cookie } }), state);
    assert.match(clearOwnerHandoffCookie(), /Max-Age=0/);
});

test('CORS accepts only the exact configured origin and fixed headers', () => {
    const accepted = responseHarness();
    assert.equal(setOwnerHandoffCors(request(PROD_ORIGIN), accepted, ['POST'], PROD_ORIGIN), true);
    assert.equal(accepted.headers['Access-Control-Allow-Origin'], PROD_ORIGIN);
    const rejected = responseHarness();
    assert.equal(setOwnerHandoffCors(request('https://attacker.invalid'), rejected, ['POST'], PROD_ORIGIN), false);
    assert.equal(rejected.statusCode, 403);
    const preflight = responseHarness();
    const req = request(PROD_ORIGIN, {}, {
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'authorization, x-attacker-header'
    });
    req.method = 'OPTIONS';
    assert.equal(setOwnerHandoffCors(req, preflight, ['POST'], PROD_ORIGIN), false);
});

test('start proves a fresh unresolved Production session and sets no token in response', async () => {
    let issuedSubject;
    const handler = createOwnerHandoffStartHandler({
        env,
        getSupabase: () => ({}),
        getFixedMigrationAuthority: () => ({ name: 'production' }),
        verifyMigrationToken: async () => ({ ok: true, subject: 'PROD_A' }),
        resolveIdentityForSync: async () => ({ ok: true, resolution: 'UNRESOLVED' }),
        consumePersistentMigrationThrottle: async () => ({ ok: true }),
        issueOwnerHandoff: (subject, localEnv, now, ttl, returnTo) => {
            issuedSubject = subject;
            return issueOwnerHandoff(subject, localEnv, now, ttl, returnTo);
        },
        now: () => NOW
    });
    const res = responseHarness();
    await handler(request(PROD_ORIGIN, { returnTo: '/puzzles' }), res);
    assert.equal(res.statusCode, 201);
    assert.equal(issuedSubject, 'PROD_A');
    assert.match(res.headers['Set-Cookie'], /HttpOnly; SameSite=Strict/);
    assert.match(res.body.handoffUrl, new RegExp(`^${LEGACY_ORIGIN.replaceAll('.', '\\.')}\/identity-recovery#handoff=v1\\.`));
    assert.equal('challengeToken' in res.body, false);
    assert.equal(JSON.stringify(res.body).includes('PROD_A'), false);
});

test('proof accepts one fixed legacy authority and creates a hidden deterministic challenge', async () => {
    const state = issueOwnerHandoff('PROD_A', env, NOW, 10 * 60 * 1000, '/puzzles').state;
    let handoffInput;
    const supabase = { rpc: async () => ({ data: [{ resolution: 'BOUND', user_id: 'U1' }], error: null }) };
    const handler = createOwnerHandoffProofHandler({
        env,
        getSupabase: () => supabase,
        getFixedMigrationAuthority: () => ({ name: 'legacy' }),
        verifyMigrationToken: async () => ({ ok: true, subject: 'LEGACY_A' }),
        consumePersistentMigrationThrottle: async () => ({ ok: true }),
        createMigrationHandoff: async input => {
            handoffInput = input;
            return { ok: true, expiresAt: new Date(NOW + 600_000).toISOString() };
        },
        now: () => NOW + 1
    });
    const res = responseHarness();
    await handler(request(LEGACY_ORIGIN, { handoffState: state }), res);
    assert.equal(res.statusCode, 201);
    assert.equal(handoffInput.existingAccount.userId, 'U1');
    assert.equal(handoffInput.existingAccount.legacySubject, 'LEGACY_A');
    assert.equal(handoffInput.verifiedProductionSubject, 'PROD_A');
    assert.equal(handoffInput.proofMethod, 'SESSION_HANDOFF');
    assert.equal(handoffInput.challengeToken, deriveOwnerChallengeToken(state, env));
    assert.deepEqual(Object.keys(res.body).sort(), ['expiresAt', 'proofReceipt', 'verified']);
    assert.equal(verifyOwnerProofReceipt(res.body.proofReceipt, state, env, NOW + 2).ok, true);
    assert.equal(JSON.stringify(res.body).includes(handoffInput.challengeToken), false);
});

test('complete requires the same fresh Production subject and a state-bound proof receipt', async () => {
    const state = issueOwnerHandoff('PROD_A', env, NOW).state;
    const proofReceipt = issueOwnerProofReceipt(state, 'LEGACY_A', env, NOW + 1);
    let activation;
    const handler = createOwnerHandoffCompleteHandler({
        env,
        getSupabase: () => ({}),
        getFixedMigrationAuthority: () => ({ name: 'production' }),
        verifyMigrationToken: async () => ({ ok: true, subject: 'PROD_A' }),
        consumePersistentMigrationThrottle: async () => ({ ok: true }),
        activateMigrationHandoff: async input => { activation = input; return { ok: true }; },
        now: () => NOW + 1
    });
    const res = responseHarness();
    await handler(request(PROD_ORIGIN, { proofReceipt }, { cookie: ownerHandoffCookie(state) }), res);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { migrated: true });
    assert.equal(activation.verifiedProductionSubject, 'PROD_A');
    assert.equal(activation.token, deriveOwnerChallengeToken(state, env));
    assert.match(res.headers['Set-Cookie'], /Max-Age=0/);
});

test('proof and completion fail closed for wrong subjects, origins, and replay-shaped inputs', async () => {
    const state = issueOwnerHandoff('PROD_A', env, NOW).state;
    const proofReceipt = issueOwnerProofReceipt(state, 'LEGACY_A', env, NOW + 1);
    const wrongOriginHandler = createOwnerHandoffProofHandler({ env });
    const wrongOrigin = responseHarness();
    await wrongOriginHandler(request(PROD_ORIGIN, { handoffState: state }), wrongOrigin);
    assert.equal(wrongOrigin.statusCode, 403);

    let activated = false;
    const wrongSubjectHandler = createOwnerHandoffCompleteHandler({
        env,
        getSupabase: () => ({}),
        getFixedMigrationAuthority: () => ({ name: 'production' }),
        verifyMigrationToken: async () => ({ ok: true, subject: 'PROD_OTHER' }),
        consumePersistentMigrationThrottle: async () => ({ ok: true }),
        activateMigrationHandoff: async () => { activated = true; return { ok: true }; },
        now: () => NOW + 1
    });
    const wrongSubject = responseHarness();
    await wrongSubjectHandler(request(PROD_ORIGIN, { proofReceipt }, { cookie: ownerHandoffCookie(state) }), wrongSubject);
    assert.equal(wrongSubject.statusCode, 401);
    assert.equal(activated, false);

    const missingReceipt = responseHarness();
    await wrongSubjectHandler(request(PROD_ORIGIN, {}, { cookie: ownerHandoffCookie(state) }), missingReceipt);
    assert.equal(missingReceipt.statusCode, 400);

    const otherState = issueOwnerHandoff('PROD_A', env, NOW).state;
    const wrongReceipt = responseHarness();
    await wrongSubjectHandler(request(PROD_ORIGIN, {
        proofReceipt: issueOwnerProofReceipt(otherState, 'LEGACY_A', env, NOW + 1)
    }, { cookie: ownerHandoffCookie(state) }), wrongReceipt);
    assert.equal(wrongReceipt.statusCode, 409);
    assert.equal(identityOwnerHandoffInternals.maxTtlMs, 15 * 60 * 1000);
    assert.equal(identityOwnerHandoffInternals.receiptVersion, 'r1');
});
