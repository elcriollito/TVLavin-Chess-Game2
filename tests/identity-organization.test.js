import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
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
        env: {
            CAISSA_IDENTITY_OWNERSHIP_MODE: 'enforced',
            CAISSA_IDENTITY_MIGRATION_MODE: 'enforced'
        },
        verifyAuth: async () => ({ authenticated: true, userId: 'production-subject', authority: 'production' }),
        getSupabase: () => ({ from() { writes += 1; throw new Error('must not write'); } }),
        resolveIdentityOwnership: async () => ({ ok: false, status: 409, code: 'OWNERSHIP_REVIEW_REQUIRED' })
    });
    assert.equal(res.statusCode, 409);
    assert.equal(res.body.code, 'OWNERSHIP_REVIEW_REQUIRED');
    assert.equal(writes, 0);
});

test('enforced Production sync provisions only an explicitly approved new identity before ownership verification', async () => {
    const calls = [];
    const res = response();
    const user = {
        clerk_id: 'approved-production-subject',
        email: 'owner@example.invalid',
        role: 'user',
        is_premium: false,
        credits: 0
    };
    const chain = {
        update(value) { calls.push(['update', value]); return this; },
        eq(column, value) { calls.push(['eq', column, value]); return this; },
        select(value) { calls.push(['select', value]); return this; },
        async single() { return { data: user, error: null }; }
    };
    let ownershipChecks = 0;

    await syncHandler({ method: 'POST', headers: {}, body: {} }, res, {
        env: {
            CAISSA_IDENTITY_OWNERSHIP_MODE: 'enforced',
            CAISSA_IDENTITY_MIGRATION_MODE: 'enforced'
        },
        verifyAuth: async () => ({
            authenticated: true,
            userId: 'approved-production-subject',
            authority: 'production',
            email: 'owner@example.invalid'
        }),
        getSupabase: () => ({ from: () => chain }),
        resolveIdentityOwnership: async () => {
            ownershipChecks += 1;
            return ownershipChecks === 1
                ? { ok: false, status: 409, code: 'IDENTITY_RESOLUTION_REQUIRED' }
                : { ok: true, status: 200, userId: 'new-internal-user' };
        },
        resolveIdentityForSync: async (_db, subject) => {
            calls.push(['resolve', subject]);
            return { ok: true, resolution: 'APPROVED_NEW', userId: null };
        },
        provisionApprovedIdentity: async (_db, subject, email) => {
            calls.push(['provision', subject, email]);
            return { ok: true, code: 'NEW_ACCOUNT_PROVISIONED', userId: 'new-internal-user' };
        }
    });

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.user.clerkId, 'approved-production-subject');
    assert.equal(ownershipChecks, 2);
    assert.deepEqual(calls.slice(0, 2), [
        ['resolve', 'approved-production-subject'],
        ['provision', 'approved-production-subject', 'owner@example.invalid']
    ]);
    assert.ok(calls.some(call => call[0] === 'eq' && call[1] === 'id' && call[2] === 'new-internal-user'));
    assert.ok(calls.some(call => call[0] === 'eq' && call[1] === 'clerk_id' && call[2] === 'approved-production-subject'));
});

test('enforced sync never provisions unresolved, historical, or Development identities', async () => {
    for (const authority of ['production', 'legacy_development']) {
        let provisions = 0;
        const res = response();
        await syncHandler({ method: 'POST', headers: {}, body: {} }, res, {
            env: {
                CAISSA_IDENTITY_OWNERSHIP_MODE: 'enforced',
                CAISSA_IDENTITY_MIGRATION_MODE: 'enforced'
            },
            verifyAuth: async () => ({ authenticated: true, userId: 'unresolved-subject', authority }),
            getSupabase: () => ({ from: () => assert.fail('must not write') }),
            resolveIdentityOwnership: async () => ({
                ok: false,
                status: 409,
                code: 'IDENTITY_RESOLUTION_REQUIRED'
            }),
            resolveIdentityForSync: async () => ({
                ok: true,
                resolution: 'MIGRATION_REQUIRED',
                userId: 'historical-user'
            }),
            provisionApprovedIdentity: async () => {
                provisions += 1;
                return { ok: true };
            }
        });
        assert.equal(res.statusCode, 409);
        assert.equal(provisions, 0);
    }
});

test('ownership enforcement will not consume approval outside the migration window', async () => {
    let resolutions = 0;
    let provisions = 0;
    const res = response();
    await syncHandler({ method: 'POST', headers: {}, body: {} }, res, {
        env: {
            CAISSA_IDENTITY_OWNERSHIP_MODE: 'enforced',
            CAISSA_IDENTITY_MIGRATION_MODE: 'off'
        },
        verifyAuth: async () => ({
            authenticated: true,
            userId: 'approved-production-subject',
            authority: 'production'
        }),
        getSupabase: () => ({ from: () => assert.fail('must not write') }),
        resolveIdentityOwnership: async () => ({
            ok: false,
            status: 409,
            code: 'IDENTITY_RESOLUTION_REQUIRED'
        }),
        resolveIdentityForSync: async () => {
            resolutions += 1;
            return { ok: true, resolution: 'APPROVED_NEW' };
        },
        provisionApprovedIdentity: async () => {
            provisions += 1;
            return { ok: true };
        }
    });

    assert.equal(res.statusCode, 409);
    assert.equal(res.body.code, 'IDENTITY_RESOLUTION_REQUIRED');
    assert.equal(resolutions, 0);
    assert.equal(provisions, 0);
});

test('approved-new enrollment race re-verifies ownership before updating the user', async () => {
    const calls = [];
    const res = response();
    const chain = {
        update(value) { calls.push(['update', value]); return this; },
        eq(column, value) { calls.push(['eq', column, value]); return this; },
        select(value) { calls.push(['select', value]); return this; },
        async single() {
            return {
                data: {
                    clerk_id: 'approved-production-subject',
                    email: null,
                    role: 'user',
                    is_premium: false,
                    credits: 0
                },
                error: null
            };
        }
    };
    let ownershipChecks = 0;

    await syncHandler({ method: 'POST', headers: {}, body: {} }, res, {
        env: {
            CAISSA_IDENTITY_OWNERSHIP_MODE: 'enforced',
            CAISSA_IDENTITY_MIGRATION_MODE: 'enforced'
        },
        verifyAuth: async () => ({
            authenticated: true,
            userId: 'approved-production-subject',
            authority: 'production'
        }),
        getSupabase: () => ({ from: () => chain }),
        resolveIdentityOwnership: async () => {
            ownershipChecks += 1;
            return ownershipChecks === 1
                ? { ok: false, status: 409, code: 'IDENTITY_RESOLUTION_REQUIRED' }
                : { ok: true, status: 200, userId: 'existing-internal-user' };
        },
        resolveIdentityForSync: async () => ({
            ok: true,
            resolution: 'APPROVED_NEW',
            userId: null
        }),
        provisionApprovedIdentity: async () => ({
            ok: false,
            code: 'SUBJECT_ALREADY_BOUND',
            userId: null
        })
    });

    assert.equal(res.statusCode, 200);
    assert.equal(ownershipChecks, 2);
    assert.ok(calls.some(call => call[0] === 'eq' && call[1] === 'id' && call[2] === 'existing-internal-user'));
    assert.ok(calls.some(call => call[0] === 'eq' && call[1] === 'clerk_id' && call[2] === 'approved-production-subject'));
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

test('public identity maps an ownership resolver exception to a retryable response', async () => {
    const res = response();
    await assert.doesNotReject(() => publicIdentityHandler(
        { method: 'GET', headers: {}, body: null },
        res,
        {
            env: { CAISSA_IDENTITY_OWNERSHIP_MODE: 'enforced' },
            verifyAuth: async () => ({
                authenticated: true,
                userId: 'production-subject',
                authority: 'production'
            }),
            getSupabase: () => ({}),
            resolveIdentityOwnership: async () => {
                throw Object.assign(new Error('temporary resolver failure'), { code: 'ECONNRESET' });
            }
        }
    ));
    assert.equal(res.statusCode, 503);
    assert.equal(res.body.code, 'PUBLIC_IDENTITY_UNAVAILABLE');
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

test('Production release runbook orders SEC-005 prerequisites before Identity Ownership and Account Control', () => {
    const runbook = fs.readFileSync('docs/security/CAISSA_ACCOUNT_CONTROL_V1_RELEASE_READINESS.md', 'utf8');
    const orderedArtifacts = [
        ['20260811_clerk_identity_remapping_foundation.sql', '8aa39c19e3d6a41d319cf9738a1b50a2b0d68365204912ab49287e10e6c9484b'],
        ['20260811_clerk_migration_cutover_tooling.sql', '2d53b7345b7dcee5fdb204ec568bb97475e2931ae75fa35a7a1d595f324ee6ee'],
        ['20261015220000_sec005_cutover_compatibility_v1.sql', '3644577e080fca71b70f7fa31e07ab0980d9f8884d861dd6eaa9a02f0fd689f2'],
        ['20261018171912_caissa_identity_ownership_v1.sql', 'db2d75b54b5c64eb36488beae27e10e2ad2266bd5adf54f3841183757f4acda5'],
        ['20261018194500_caissa_account_control_v1.sql', '3d0dfdadc9f89fe12be40a086bc491d4971fca40901a4ee7544bb7965a940950'],
        ['20261018180000_caissa_account_control_v1_fk_indexes.sql', '9d7e4b69e691c57dc2a81408d74fd988055375c7d7424a4305133fc4f87d786c'],
        ['20261018203000_caissa_account_control_v1_security_followup.sql', 'dccd0cebfd56a434337ea960c7ff426001b5e37eee589d8172f4d1a5dc4d402b']
    ];
    let priorIndex = -1;
    for (const [artifact, expectedHash] of orderedArtifacts) {
        const index = runbook.indexOf(`| \`${artifact}\``);
        assert.ok(index > priorIndex, `${artifact} must appear once and in dependency order`);
        assert.equal(runbook.indexOf(`| \`${artifact}\``, index + 1), -1, `${artifact} must not be duplicated`);
        const sql = fs.readFileSync(`supabase/migrations/${artifact}`, 'utf8').replace(/\r\n/g, '\n');
        const actualHash = crypto.createHash('sha256').update(sql).digest('hex');
        assert.equal(actualHash, expectedHash, `${artifact} canonical LF hash must remain immutable`);
        assert.ok(runbook.includes(`\`${expectedHash}\``), `${artifact} hash must be documented`);
        priorIndex = index;
    }
    assert.match(runbook, /Their verified presence is\s+therefore a hard prerequisite/i);
    assert.match(runbook, /If any prerequisite is absent, stop until the owner explicitly\s+authorizes/i);
});
