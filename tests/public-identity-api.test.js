import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/user/public-identity.js';
import { createPublicIdentityStore, sanitizeIdentity } from '../api/_lib/public-identity.js';

const identity = Object.freeze({
    displayName: 'ElCriollito', nickname: 'ElCriollito', fallbackAlias: 'Player-A1B2C3D4E5F60718',
    hasCustomNickname: true, policyVersion: 1, version: 3, updatedAt: '2026-10-14T00:00:00Z'
});

function response() {
    return { statusCode: 200, body: null, headers: {}, setHeader(name, value) { this.headers[name] = value; },
        status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; }, end() { return this; } };
}

const authenticated = async () => ({ authenticated: true, userId: 'clerk_owner', email: 'private@example.test' });

test('GET exposes only the public identity projection for the verified subject', async () => {
    let subject;
    const res = response();
    await handler({ method: 'GET', headers: {}, body: null }, res, {
        verifyAuth: authenticated,
        store: { getOrCreate: async value => { subject = value; return identity; } }
    });
    assert.equal(subject, 'clerk_owner');
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body.identity, identity);
    assert.equal(JSON.stringify(res.body).includes('private@example.test'), false);
});

test('PATCH derives ownership from auth and rejects body impersonation', async () => {
    const res = response();
    await handler({ method: 'PATCH', headers: {}, body: {
        nickname: 'SafeKnight', expectedVersion: 3, userId: 'victim'
    } }, res, { verifyAuth: authenticated, store: { update: async () => assert.fail('must not update') } });
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.code, 'OWNER_FIELD_FORBIDDEN');
});

test('PATCH passes only verified subject, validated nickname, and optimistic version', async () => {
    let input;
    const res = response();
    await handler({ method: 'PATCH', headers: {}, body: { nickname: '  ÉchecsRoyal  ', expectedVersion: 3 } }, res, {
        verifyAuth: authenticated,
        store: { update: async (...args) => { input = args; return { ...identity, displayName: 'ÉchecsRoyal', nickname: 'ÉchecsRoyal', version: 4 }; } }
    });
    assert.equal(input[0], 'clerk_owner');
    assert.deepEqual(input[1], {
        ok: true, value: 'ÉchecsRoyal', key: 'échecsroyal', graphemes: 11,
        scripts: ['Latin'], policyVersion: 1
    });
    assert.equal(input[2], 3);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.identity.displayName, 'ÉchecsRoyal');
});

test('availability and conflicts reveal no owner data', async () => {
    const checkRes = response();
    await handler({ method: 'POST', headers: {}, body: { action: 'availability', nickname: 'TakenKnight' } }, checkRes, {
        verifyAuth: authenticated,
        store: { checkNickname: async () => ({ available: false, normalizedNickname: 'TakenKnight', owner: 'secret' }) }
    });
    assert.deepEqual(checkRes.body, { available: false, normalizedNickname: 'TakenKnight' });

    const conflictRes = response();
    await handler({ method: 'PATCH', headers: {}, body: { nickname: 'TakenKnight', expectedVersion: 3 } }, conflictRes, {
        verifyAuth: authenticated,
        store: { update: async () => { const error = new Error('conflict'); error.code = 'CAISSA_IDENTITY_NICKNAME_TAKEN'; throw error; } }
    });
    assert.deepEqual(conflictRes.body, { code: 'NICKNAME_TAKEN', error: 'That nickname is unavailable.' });
});

test('expired or absent auth cannot reach the store', async () => {
    const res = response();
    await handler({ method: 'GET', headers: {}, body: null }, res, {
        verifyAuth: async () => ({ authenticated: false, status: 401, code: 'INVALID_TOKEN' }),
        store: { getOrCreate: async () => assert.fail('store must not be called') }
    });
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.code, 'INVALID_TOKEN');
});

test('canonical identity records fail closed when aliases or custom-state metadata are malformed', () => {
    assert.throws(() => sanitizeIdentity({
        ...identity,
        fallbackAlias: 'Player-clerk_owner'
    }), { code: 'PUBLIC_IDENTITY_INVALID_RECORD' });
    assert.throws(() => sanitizeIdentity({
        ...identity,
        hasCustomNickname: false
    }), { code: 'PUBLIC_IDENTITY_INVALID_RECORD' });
    assert.throws(() => sanitizeIdentity({
        ...identity,
        displayName: '<script>alert(1)</script>'
    }), { code: 'PUBLIC_IDENTITY_INVALID_RECORD' });
});

test('the server-owned store sends only a validated, versioned policy payload to PostgreSQL', async () => {
    const calls = [];
    const db = { async rpc(name, args) {
        calls.push({ name, args });
        return { data: identity, error: null };
    } };
    const store = createPublicIdentityStore({ db });
    const contract = {
        ok: true, value: 'Café Knight', key: 'café knight', graphemes: 11,
        scripts: ['Latin'], policyVersion: 1
    };
    await store.checkNickname('clerk_owner', contract);
    await store.update('clerk_owner', contract, 3);
    assert.deepEqual(calls, [
        { name: 'caissa_public_identity_check_nickname', args: {
            p_clerk_id: 'clerk_owner', p_nickname: 'Café Knight',
            p_nickname_key: 'café knight', p_policy_version: 1
        } },
        { name: 'caissa_public_identity_update', args: {
            p_clerk_id: 'clerk_owner', p_nickname: 'Café Knight',
            p_nickname_key: 'café knight', p_policy_version: 1, p_expected_version: 3
        } }
    ]);
    assert.throws(() => store.update('clerk_owner', {
        ...contract, key: 'forged-key'
    }, 3), { code: 'PUBLIC_IDENTITY_POLICY_CONTRACT_INVALID' });
});
