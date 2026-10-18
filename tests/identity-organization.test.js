import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
    clerkAuthorityFromEnvironment,
    isIdentityOwnershipEnforced,
    resolveVerifiedIdentityOwnership
} from '../api/_lib/identity-ownership.js';
import syncHandler from '../api/user/sync.js';
import publicIdentityHandler from '../api/user/public-identity.js';
import puzzleProgressHandler from '../api/puzzles/progress.js';

function response() {
    return {
        statusCode: 200,
        body: null,
        headers: {},
        status(code) { this.statusCode = code; return this; },
        json(body) { this.body = body; return this; },
        end() { return this; },
        setHeader(name, value) { this.headers[name] = value; }
    };
}

test('ownership mode and Clerk authority require exact server-owned configuration', () => {
    assert.equal(isIdentityOwnershipEnforced({ CAISSA_IDENTITY_OWNERSHIP_MODE: 'enforced' }), true);
    assert.equal(isIdentityOwnershipEnforced({ CAISSA_IDENTITY_OWNERSHIP_MODE: 'enforce' }), false);
    assert.equal(clerkAuthorityFromEnvironment({ NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_test_fixture' }), 'legacy_development');
    assert.equal(clerkAuthorityFromEnvironment({ NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_live_fixture' }), 'production');
    assert.equal(clerkAuthorityFromEnvironment({
        CAISSA_CLERK_AUTHORITY: 'production',
        NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_test_fixture'
    }), null);
    assert.equal(clerkAuthorityFromEnvironment({
        NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_test_fixture',
        CLERK_SECRET_KEY: 'sk_live_fixture'
    }), null);
    assert.equal(clerkAuthorityFromEnvironment({
        CAISSA_CLERK_AUTHORITY: 'invalid',
        NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_test_fixture'
    }), null);
    assert.equal(clerkAuthorityFromEnvironment({}), null);
});

test('resolver sends only the authenticated subject and fixed authority to PostgreSQL', async () => {
    const calls = [];
    const db = { rpc: async (name, args) => {
        calls.push({ name, args });
        return { data: [{ ownership_state: 'VERIFIED', user_id: 'internal-user', binding_id: 'binding' }], error: null };
    } };
    const result = await resolveVerifiedIdentityOwnership({
        db,
        auth: { userId: 'verified-subject', authority: 'legacy_development' },
        env: {}
    });
    assert.equal(result.ok, true);
    assert.equal(result.userId, 'internal-user');
    assert.deepEqual(calls, [{
        name: 'resolve_caissa_identity_ownership',
        args: { p_external_subject: 'verified-subject', p_environment: 'legacy_development' }
    }]);
});

test('resolver fails closed for ambiguous ownership, crossed authority, and service errors', async () => {
    for (const [data, error, expected] of [
        [[{ ownership_state: 'REVIEW_REQUIRED', user_id: 'historical-user' }], null, 'OWNERSHIP_REVIEW_REQUIRED'],
        [[{ ownership_state: 'QUARANTINED', user_id: 'historical-user' }], null, 'OWNERSHIP_REVIEW_REQUIRED'],
        [[{ ownership_state: 'UNRESOLVED' }], null, 'IDENTITY_RESOLUTION_REQUIRED'],
        [null, { code: 'XX000' }, 'IDENTITY_SERVICE_UNAVAILABLE']
    ]) {
        const result = await resolveVerifiedIdentityOwnership({
            db: { rpc: async () => ({ data, error }) },
            auth: { userId: 'subject', authority: 'production' },
            env: {}
        });
        assert.equal(result.ok, false);
        assert.equal(result.code, expected);
    }
    const missingAuthority = await resolveVerifiedIdentityOwnership({
        db: { rpc: async () => assert.fail('must not query') },
        auth: { userId: 'subject' },
        env: {}
    });
    assert.equal(missingAuthority.code, 'IDENTITY_AUTHORITY_UNAVAILABLE');
});

test('enforced sync cannot write a cross-bound historical UUID', async () => {
    let writes = 0;
    const res = response();
    await syncHandler({ method: 'POST', headers: {}, body: {} }, res, {
        env: { CAISSA_IDENTITY_OWNERSHIP_MODE: 'enforced' },
        verifyAuth: async () => ({ authenticated: true, userId: 'production-subject', authority: 'production' }),
        getSupabase: () => ({ from() { writes += 1; throw new Error('must not write'); } }),
        resolveIdentityOwnership: async () => ({ ok: false, status: 409, code: 'OWNERSHIP_REVIEW_REQUIRED' })
    });
    assert.equal(res.statusCode, 409);
    assert.equal(res.body.code, 'OWNERSHIP_REVIEW_REQUIRED');
    assert.equal(writes, 0);
});

test('nickname and progress endpoints stop before accessing another owner data', async () => {
    const env = { CAISSA_IDENTITY_OWNERSHIP_MODE: 'enforced' };
    const auth = async () => ({ authenticated: true, userId: 'production-subject', authority: 'production' });
    const deny = async () => ({ ok: false, status: 409, code: 'OWNERSHIP_REVIEW_REQUIRED' });
    let storeCalls = 0;
    const identityResponse = response();
    await publicIdentityHandler({ method: 'GET', headers: {}, body: null }, identityResponse, {
        env,
        verifyAuth: auth,
        getSupabase: () => ({}),
        resolveIdentityOwnership: deny,
        store: { getOrCreate: async () => { storeCalls += 1; } }
    });
    assert.equal(identityResponse.statusCode, 409);
    assert.equal(storeCalls, 0);

    let tableReads = 0;
    const progressResponse = response();
    await puzzleProgressHandler({ method: 'GET', headers: {} }, progressResponse, {
        env,
        authenticate: auth,
        checkRateLimit: () => ({ allowed: true }),
        getSupabase: () => ({ from() { tableReads += 1; throw new Error('must not read'); } }),
        resolveIdentityOwnership: deny
    });
    assert.equal(progressResponse.statusCode, 409);
    assert.equal(tableReads, 0);
});

test('ownership migration is service-role only and defaults historical Production cutovers to review', () => {
    const sql = fs.readFileSync('supabase/migrations/20261018171912_caissa_identity_ownership_v1.sql', 'utf8');
    assert.match(sql, /enable row level security/i);
    assert.match(sql, /revoke all on table public\.caissa_identity_ownership_reviews from public, anon, authenticated/i);
    assert.match(sql, /grant execute on function public\.resolve_caissa_identity_ownership\(text, text\)\s+to service_role/i);
    assert.match(sql, /proof_method = 'NEW_ACCOUNT'/);
    assert.match(sql, /return query select 'REVIEW_REQUIRED'/);
    assert.doesNotMatch(sql, /\n\s+(?:email|nickname)\s+/i);
});
