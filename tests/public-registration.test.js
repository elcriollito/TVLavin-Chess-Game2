import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
    enrollPublicRegistration,
    isPublicRegistrationOpen,
    publicRegistrationEnvironment
} from '../api/_lib/public-registration.js';
import syncHandler from '../api/user/sync.js';

const stagingEnv = Object.freeze({
    CAISSA_PUBLIC_REGISTRATION_MODE: 'open',
    CAISSA_IDENTITY_OWNERSHIP_MODE: 'enforced',
    CAISSA_CLERK_AUTHORITY: 'legacy_development',
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_test_c3ludGhldGljLmNsZXJrLmFjY291bnRzLmRldiQ',
    CLERK_SECRET_KEY: 'sk_test_private',
    SUPABASE_SERVICE_ROLE_KEY: 'eyJhbGciOiJub25lIn0.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.signature',
    SUPABASE_URL: 'https://aqizagaskicotorfpwfn.supabase.co'
});

const auth = Object.freeze({
    authenticated: true,
    userId: 'user_3PublicRegistrationFixture001',
    sessionId: 'sess_public_registration_001',
    authority: 'legacy_development'
});

function clerkFixture({ verification = 'verified', status = 'active', userId = auth.userId } = {}) {
    return () => ({
        users: {
            getUser: async () => ({
                id: userId,
                banned: false,
                locked: false,
                primaryEmailAddressId: 'email_primary',
                emailAddresses: [{
                    id: 'email_primary',
                    emailAddress: 'New.Player@Example.test',
                    verification: { status: verification }
                }]
            })
        },
        sessions: {
            getSession: async () => ({
                id: auth.sessionId,
                userId,
                status
            })
        }
    });
}

test('public registration is closed by default and fails closed on authority/project mismatches', () => {
    assert.equal(isPublicRegistrationOpen({}), false);
    assert.equal(isPublicRegistrationOpen({ ...stagingEnv, CAISSA_PUBLIC_REGISTRATION_MODE: 'off' }), false);
    assert.equal(isPublicRegistrationOpen({ ...stagingEnv, SUPABASE_URL: 'https://jczauvkfkweuvdpurpem.supabase.co' }), false);
    assert.equal(isPublicRegistrationOpen({ ...stagingEnv, CLERK_SECRET_KEY: 'sk_live_wrong_class' }), false);
    assert.deepEqual(publicRegistrationEnvironment(stagingEnv), {
        authority: 'legacy_development',
        projectRef: 'aqizagaskicotorfpwfn'
    });
});

test('verified Clerk Backend user and active session are the only enrollment inputs', async () => {
    const calls = [];
    const db = { rpc: async (name, args) => {
        calls.push({ name, args });
        return { data: [{
            success: true,
            code: 'REGISTRATION_COMPLETED',
            user_id: '10000000-0000-4000-8000-000000000001',
            binding_id: '20000000-0000-4000-8000-000000000001'
        }], error: null };
    } };

    const result = await enrollPublicRegistration({
        db,
        auth,
        env: stagingEnv,
        createClerkClient: clerkFixture()
    });
    assert.equal(result.ok, true);
    assert.equal(result.verifiedEmail, 'New.Player@Example.test');
    assert.deepEqual(calls, [{
        name: 'register_caissa_clerk_identity',
        args: {
            p_external_subject: auth.userId,
            p_email: 'New.Player@Example.test',
            p_email_key: 'new.player@example.test',
            p_environment: 'legacy_development'
        }
    }]);
});

test('unverified email, inactive session, mismatched user and provider failures never reach Postgres', async () => {
    for (const createClerkClient of [
        clerkFixture({ verification: 'unverified' }),
        clerkFixture({ status: 'revoked' }),
        clerkFixture({ userId: 'user_different' }),
        () => ({ users: { getUser: async () => { throw Object.assign(new Error('down'), { status: 500 }); } }, sessions: { getSession: async () => ({}) } })
    ]) {
        let called = false;
        const result = await enrollPublicRegistration({
            db: { rpc: async () => { called = true; } },
            auth,
            env: stagingEnv,
            createClerkClient
        });
        assert.equal(result.ok, false);
        assert.equal(called, false);
    }
});

test('database review results stay generic and do not disclose collision details', async () => {
    const result = await enrollPublicRegistration({
        db: { rpc: async () => ({ data: [{ success: false, code: 'REGISTRATION_REVIEW_REQUIRED' }], error: null }) },
        auth,
        env: stagingEnv,
        createClerkClient: clerkFixture()
    });
    assert.deepEqual(
        { ok: result.ok, status: result.status, code: result.code },
        { ok: false, status: 409, code: 'REGISTRATION_REVIEW_REQUIRED' }
    );
});

test('sync ignores browser identity fields and persists only the Backend-verified email', async () => {
    const updates = [];
    let ownershipCalls = 0;
    const db = {
        from(name) {
            assert.equal(name, 'users');
            return {
                update(value) {
                    updates.push(value);
                    return { eq() { return this; }, select() { return this; }, single: async () => ({
                        data: { clerk_id: auth.userId, email: value.email, role: 'member', is_premium: false, credits: 5 },
                        error: null
                    }) };
                }
            };
        }
    };
    const res = response();
    await syncHandler({ method: 'POST', headers: {}, body: {
        userId: 'attacker', email: 'attacker@example.test', role: 'admin', credits: 999
    } }, res, {
        env: stagingEnv,
        verifyAuth: async () => ({ ...auth, email: 'jwt-claim@example.test' }),
        getSupabase: () => db,
        resolveIdentityOwnership: async () => (++ownershipCalls === 1
            ? { ok: false, status: 409, code: 'IDENTITY_RESOLUTION_REQUIRED' }
            : { ok: true, status: 200, userId: '10000000-0000-4000-8000-000000000001', bindingId: '20000000-0000-4000-8000-000000000001' }),
        enrollPublicRegistration: async () => ({
            attempted: true,
            ok: true,
            verifiedEmail: 'verified-primary@example.test'
        })
    });
    assert.equal(res.statusCode, 200);
    assert.equal(updates[0].email, 'verified-primary@example.test');
    assert.doesNotMatch(JSON.stringify(updates), /attacker|admin|999/);
});

test('subsequent ownership sync without an email claim preserves the verified stored email', async () => {
    const updates = [];
    const storedEmail = 'verified-primary@example.test';
    const db = {
        from(name) {
            assert.equal(name, 'users');
            return {
                update(value) {
                    updates.push(value);
                    return {
                        eq() { return this; },
                        select() { return this; },
                        single: async () => ({
                            data: {
                                clerk_id: auth.userId,
                                email: storedEmail,
                                role: 'member',
                                is_premium: false,
                                credits: 5
                            },
                            error: null
                        })
                    };
                }
            };
        }
    };
    const res = response();
    await syncHandler({ method: 'POST', headers: {}, body: {} }, res, {
        env: stagingEnv,
        verifyAuth: async () => ({ ...auth, email: null }),
        getSupabase: () => db,
        resolveIdentityOwnership: async () => ({
            ok: true,
            status: 200,
            userId: '10000000-0000-4000-8000-000000000001',
            bindingId: '20000000-0000-4000-8000-000000000001'
        }),
        enrollPublicRegistration: async () => assert.fail('existing verified ownership must not re-enroll')
    });

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.user.email, storedEmail);
    assert.equal(Object.hasOwn(updates[0], 'email'), false);
});

test('migration is service-role only, atomic, idempotent and rejects historical/email collisions', () => {
    const sql = fs.readFileSync('supabase/migrations/20261101192942_caissa_public_registration_v1.sql', 'utf8');
    assert.match(sql, /security definer[\s\S]*set search_path = ''/iu);
    assert.match(sql, /pg_advisory_xact_lock[\s\S]*subject[\s\S]*pg_advisory_xact_lock[\s\S]*email/iu);
    assert.match(sql, /REGISTRATION_ALREADY_COMPLETED/);
    assert.match(sql, /identity_migration_challenges/);
    assert.match(sql, /identity_enrollment_decisions/);
    assert.match(sql, /add column if not exists retired_subject_hash/iu);
    assert.match(sql, /identity_enrollment_decisions_retired_subject_hash_idx/iu);
    assert.match(sql, /retired_subject_hash\s*=\s*v_subject_hash/iu);
    assert.match(sql, /detail->>'subject_hash'\s*=\s*v_subject_hash/iu);
    assert.match(sql, /lower\(pg_catalog\.btrim\(u\.email\)\) = v_email_key/iu);
    assert.match(sql, /'VERIFIED'[\s\S]*'NEW_ACCOUNT'/u);
    assert.match(sql, /revoke all on function[\s\S]*from public, anon, authenticated, service_role/iu);
    assert.match(sql, /grant execute on function[\s\S]*to service_role/iu);
    assert.doesNotMatch(sql, /grant execute[\s\S]*to (?:anon|authenticated)/iu);
});

test('ownership review states never fall through into public enrollment', async () => {
    let enrollmentCalled = false;
    const res = response();
    await syncHandler({ method: 'POST', headers: {}, body: {} }, res, {
        env: stagingEnv,
        verifyAuth: async () => auth,
        getSupabase: () => ({ from() { throw new Error('unexpected user update'); } }),
        resolveIdentityOwnership: async () => ({
            ok: false,
            status: 409,
            code: 'OWNERSHIP_REVIEW_REQUIRED'
        }),
        enrollPublicRegistration: async () => {
            enrollmentCalled = true;
            return { attempted: true, ok: true };
        }
    });
    assert.equal(res.statusCode, 409);
    assert.equal(res.body.code, 'OWNERSHIP_REVIEW_REQUIRED');
    assert.equal(enrollmentCalled, false);
});

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
