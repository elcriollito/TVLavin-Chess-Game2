import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
    accountControlEnvironment,
    createAccountControlHandlers,
    freshReverification
} from '../api/_lib/account-control.js';

const owner = '10000000-0000-4000-8000-000000000001';
const binding = '20000000-0000-4000-8000-000000000001';
const operation = '30000000-0000-4000-8000-000000000001';
const idempotency = '40000000-0000-4000-8000-000000000001';

function environment(overrides = {}) {
    return {
        CAISSA_ACCOUNT_CONTROL_MODE: 'staging',
        CAISSA_IDENTITY_OWNERSHIP_MODE: 'enforced',
        CAISSA_CLERK_AUTHORITY: 'legacy_development',
        SUPABASE_URL: 'https://aqizagaskicotorfpwfn.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'service_role_fixture',
        CLERK_SECRET_KEY: 'sk_test_fixture',
        ...overrides
    };
}

function auth(overrides = {}) {
    return {
        authenticated: true,
        userId: 'synthetic_subject_a',
        authority: 'legacy_development',
        sessionId: 'sess_synthetic_a',
        tokenId: 'jwt_synthetic_a',
        factorVerificationAge: [0, -1],
        ...overrides
    };
}

function request(method = 'GET', body = undefined, headers = {}) {
    return {
        method,
        body,
        headers: {
            origin: 'https://www.caissa-chess.org',
            'sec-fetch-site': 'same-origin',
            ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
            ...(method === 'POST' ? { 'idempotency-key': idempotency } : {}),
            ...headers
        }
    };
}

function response() {
    return {
        statusCode: 200,
        body: null,
        headers: {},
        chunks: [],
        headersSent: false,
        ended: false,
        status(code) { this.statusCode = code; return this; },
        json(body) { this.body = body; return this; },
        send(body) { this.body = body; return this; },
        write(chunk) { this.headersSent = true; this.chunks.push(Buffer.from(chunk)); return true; },
        end() { this.ended = true; return this; },
        destroy(error) { this.destroyed = error || true; },
        setHeader(name, value) { this.headers[name] = value; }
    };
}

function fixture({
    authResult = auth(),
    rpcImpl,
    createClerkClient,
    rateAllowed = true,
    streamAccountExport,
    getClerkSession,
    clerkSessionTimeoutMs,
    envOverrides
} = {}) {
    const calls = [];
    const sessionCalls = [];
    const rateLimitInputs = [];
    let dbAccesses = 0;
    let rateLimitCalls = 0;
    let ownershipCalls = 0;
    const db = {
        rpc: async (name, args) => {
            calls.push({ name, args });
            if (rpcImpl) return rpcImpl(name, args);
            if (name === 'caissa_account_control_summary') return { data: {
                ownership: 'VERIFIED', accountState: 'ACTIVE',
                counts: { onlineGames: 2, puzzleAttempts: 3, activeEntitlements: 0 },
                capabilities: { export: true, progressReset: true, accountDeletion: true },
                manualReviewRequired: false
            }, error: null };
            if (name === 'prepare_caissa_account_control') return { data: [{
                operation_id: operation, operation_status: 'PREPARED', operation_expires_at: new Date(Date.now() + 60_000).toISOString()
            }], error: null };
            if (name === 'confirm_caissa_progress_reset') return { data: { puzzleAttemptsDeleted: 3 }, error: null };
            if (name === 'lock_caissa_account_deletion') return { data: { status: 'LOCKED' }, error: null };
            if (name === 'erase_caissa_account_data') return { data: { status: 'AUTH_DELETION_PENDING' }, error: null };
            if (name === 'complete_caissa_account_deletion') return { data: { accountDeleted: true }, error: null };
            if (name === 'mark_caissa_auth_deletion_failed') return { data: null, error: null };
            if (name === 'mark_caissa_data_deletion_failed') return { data: null, error: null };
            throw new Error(`Unexpected RPC ${name}`);
        },
        from: name => ({
            select: () => ({
                eq: () => ({
                    order: () => ({
                        limit: async () => {
                            calls.push({ name: `select:${name}` });
                            return { data: [], error: null };
                        }
                    })
                })
            })
        })
    };
    const loadSession = getClerkSession || (async ({ sessionId }) => ({
        id: sessionId,
        status: 'active',
        userId: authResult.userId
    }));
    const handlers = createAccountControlHandlers({
        env: environment(envOverrides),
        verifyAuth: async () => authResult,
        getSupabase: () => { dbAccesses += 1; return db; },
        resolveIdentityOwnership: async () => {
            ownershipCalls += 1;
            return { ok: true, userId: owner, bindingId: binding };
        },
        consumeAccountRateLimit: async input => {
            rateLimitCalls += 1;
            rateLimitInputs.push(input);
            return typeof rateAllowed === 'function' ? rateAllowed(input) : rateAllowed;
        },
        createClerkClient,
        getClerkSession: async input => {
            sessionCalls.push(input);
            return loadSession(input);
        },
        clerkSessionTimeoutMs,
        streamAccountExport: streamAccountExport || (async ({ res }) => {
            res.status(200);
            res.write('{"schemaVersion":"caissa.account-export.v1"}');
            res.end();
        }),
        log: { warn() {} }
    });
    return {
        handlers,
        calls,
        sessionCalls,
        rateLimitInputs,
        metrics: () => ({ dbAccesses, rateLimitCalls, ownershipCalls })
    };
}

test('environment gate binds mode, Clerk authority, ownership mode and exact Supabase project', () => {
    assert.deepEqual(accountControlEnvironment(environment()), {
        mode: 'staging', projectRef: 'aqizagaskicotorfpwfn', authority: 'legacy_development'
    });
    assert.equal(accountControlEnvironment(environment({ CAISSA_IDENTITY_OWNERSHIP_MODE: 'off' })), null);
    assert.equal(accountControlEnvironment(environment({ SUPABASE_URL: 'https://jczauvkfkweuvdpurpem.supabase.co' })), null);
    assert.equal(accountControlEnvironment(environment({ CAISSA_ACCOUNT_CONTROL_MODE: 'production' })), null);
});
test('fresh reverification uses signed Clerk fva and rejects token age or missing session metadata', () => {
    assert.equal(freshReverification(auth()), true);
    assert.equal(freshReverification(auth({ factorVerificationAge: [0, -1] })), true);
    assert.equal(freshReverification(auth({ factorVerificationAge: [5, -1] })), true);
    assert.equal(freshReverification(auth({ factorVerificationAge: [6, -1] })), false);
    assert.equal(freshReverification(auth({ factorVerificationAge: [-1, -1] })), false);
    assert.equal(freshReverification(auth({ factorVerificationAge: ['0', -1] })), false);
    assert.equal(freshReverification(auth({ factorVerificationAge: [NaN, -1] })), false);
    assert.equal(freshReverification(auth({ factorVerificationAge: {} })), false);
    assert.equal(freshReverification(auth({ factorVerificationAge: null })), false);
    assert.equal(freshReverification(auth({ sessionId: null })), false);
    assert.equal(freshReverification(auth({ tokenId: null })), false);
});

test('Account Control requires a current active Clerk session bound to the signed sid and sub', async () => {
    const active = fixture();
    const activeResponse = response();
    await active.handlers.summary(request(), activeResponse);
    assert.equal(activeResponse.statusCode, 200);
    assert.deepEqual(active.sessionCalls.map(call => call.sessionId), ['sess_synthetic_a']);

    for (const status of ['ended', 'revoked', 'expired', 'removed', 'deleted', 'replaced', 'abandoned', 'pending']) {
        const denied = fixture({ getClerkSession: async ({ sessionId }) => ({
            id: sessionId, status, userId: 'synthetic_subject_a'
        }) });
        const res = response();
        await denied.handlers.summary(request(), res);
        assert.equal(res.statusCode, 401, status);
        assert.deepEqual(res.body, { code: 'AUTH_REQUIRED', error: 'Authentication required.' });
        assert.deepEqual(denied.metrics(), { dbAccesses: 1, rateLimitCalls: 1, ownershipCalls: 0 });
    }
});

test('Deletion Status permits an active matching session and reads only the verified owner scope', async () => {
    const current = fixture();
    const res = response();
    await current.handlers.status(request('GET'), res);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { operations: [] });
    assert.deepEqual(current.calls, [{ name: 'select:caissa_account_control_operations' }]);
    assert.equal(current.sessionCalls.length, 1);
    assert.deepEqual(current.metrics(), { dbAccesses: 1, rateLimitCalls: 2, ownershipCalls: 1 });
});

test('inactive sessions cannot consume a replacement session\'s per-user action quota', async () => {
    const revoked = fixture({
        authResult: auth({ sessionId: 'sess_revoked' }),
        getClerkSession: async ({ sessionId }) => ({
            id: sessionId, status: 'revoked', userId: 'synthetic_subject_a'
        })
    });
    const revokedResponse = response();
    await revoked.handlers.summary(request(), revokedResponse);
    assert.equal(revokedResponse.statusCode, 401);
    assert.deepEqual(revoked.rateLimitInputs.map(input => input.bucket), ['session_lookup']);
    assert.match(revoked.rateLimitInputs[0].bucket, /^[a-z][a-z0-9_]{1,39}$/u);

    const replacement = fixture({ authResult: auth({ sessionId: 'sess_replacement' }) });
    const replacementResponse = response();
    await replacement.handlers.summary(request(), replacementResponse);
    assert.equal(replacementResponse.statusCode, 200);
    assert.deepEqual(replacement.rateLimitInputs.map(input => input.bucket), ['session_lookup', 'summary']);
    assert.notEqual(revoked.rateLimitInputs[0].scopeHash, replacement.rateLimitInputs[0].scopeHash);
});

test('JWT refresh keeps the Clerk lookup quota stable while fresh verification controls action eligibility', async () => {
    const stale = fixture({ authResult: auth({ factorVerificationAge: [7, -1], tokenId: 'jwt_stale' }) });
    const staleResponse = response();
    await stale.handlers.exportData(request('POST', {}), staleResponse);
    assert.equal(staleResponse.statusCode, 403);
    assert.equal(staleResponse.body.code, 'REVERIFICATION_REQUIRED');
    assert.deepEqual(stale.rateLimitInputs.map(input => input.bucket), ['session_lookup']);

    const fresh = fixture({ authResult: auth({ factorVerificationAge: [0, -1], tokenId: 'jwt_fresh' }) });
    const freshResponse = response();
    await fresh.handlers.exportData(request('POST', {}), freshResponse);
    assert.equal(freshResponse.statusCode, 200);
    assert.deepEqual(fresh.rateLimitInputs.map(input => input.bucket), ['session_lookup', 'export']);
    assert.equal(stale.rateLimitInputs[0].scopeHash, fresh.rateLimitInputs[0].scopeHash);
});

test('Account Control rejects missing or crossed signed session identity before account-data access', async () => {
    const cases = [
        { authResult: auth({ sessionId: null }) },
        { getClerkSession: async () => ({ id: 'sess_other', status: 'active', userId: 'synthetic_subject_a' }) },
        { getClerkSession: async ({ sessionId }) => ({ id: sessionId, status: 'active', userId: 'synthetic_subject_b' }) }
    ];
    for (const options of cases) {
        const denied = fixture(options);
        const res = response();
        await denied.handlers.summary(request(), res);
        assert.equal(res.statusCode, 401);
        assert.deepEqual(denied.metrics(), { dbAccesses: 1, rateLimitCalls: 1, ownershipCalls: 0 });
    }
});

test('missing sessions are 401 while Clerk configuration, outages, timeouts and malformed responses are 503', async () => {
    const missing = new Error('synthetic not found');
    missing.status = 404;
    const missingFixture = fixture({ getClerkSession: async () => { throw missing; } });
    const missingResponse = response();
    await missingFixture.handlers.summary(request(), missingResponse);
    assert.equal(missingResponse.statusCode, 401);

    for (const options of [
        { envOverrides: { CLERK_SECRET_KEY: '' } },
        { envOverrides: { CLERK_SECRET_KEY: 'sk_live_wrong_authority' } },
        { getClerkSession: async () => { const error = new Error('synthetic credential failure'); error.status = 401; throw error; } },
        { getClerkSession: async () => { const error = new Error('synthetic rate limit'); error.status = 429; throw error; } },
        { getClerkSession: async () => { const error = new Error('synthetic provider outage'); error.status = 503; throw error; } },
        { getClerkSession: async () => ({ status: 'active' }) },
        { getClerkSession: async () => new Promise(() => {}), clerkSessionTimeoutMs: 5 }
    ]) {
        const unavailable = fixture(options);
        const res = response();
        await unavailable.handlers.summary(request(), res);
        assert.equal(res.statusCode, 503);
        assert.deepEqual(res.body, {
            code: 'AUTH_SERVICE_UNAVAILABLE', error: 'Authentication service unavailable.'
        });
        assert.deepEqual(unavailable.metrics(), { dbAccesses: 1, rateLimitCalls: 1, ownershipCalls: 0 });
    }
});

test('the active-session boundary guards all seven Account Control operations', async () => {
    const denied = fixture({ getClerkSession: async ({ sessionId }) => ({
        id: sessionId, status: 'ended', userId: 'synthetic_subject_a'
    }) });
    const operations = [
        ['summary', request('GET')],
        ['exportData', request('POST', {})],
        ['prepareReset', request('POST', { confirmation: 'RESET' })],
        ['confirmReset', request('POST', { operationId: operation, confirmationToken: 'x'.repeat(43) })],
        ['prepareDeletion', request('POST', { confirmation: 'DELETE' })],
        ['confirmDeletion', request('POST', { operationId: operation, confirmationToken: 'x'.repeat(43) })],
        ['status', request('GET')]
    ];
    for (const [name, req] of operations) {
        const res = response();
        await denied.handlers[name](req, res);
        assert.equal(res.statusCode, 401, name);
    }
    assert.equal(denied.sessionCalls.length, 7);
    assert.deepEqual(denied.metrics(), { dbAccesses: 7, rateLimitCalls: 7, ownershipCalls: 0 });
    assert.deepEqual(denied.calls, []);
});

test('prepare and confirm independently re-check the live Clerk session', async () => {
    const current = fixture();
    const prepared = response();
    await current.handlers.prepareReset(request('POST', { confirmation: 'RESET' }), prepared);
    const confirmed = response();
    await current.handlers.confirmReset(request('POST', {
        operationId: operation,
        confirmationToken: prepared.body.confirmationToken
    }), confirmed);
    assert.equal(confirmed.statusCode, 200);
    assert.equal(current.sessionCalls.length, 2);
});

test('summary is scoped to the ownership UUID and exposes no client-selected target', async () => {
    const { handlers, calls } = fixture();
    const res = response();
    await handlers.summary(request(), res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.backendReady, true);
    assert.equal(res.body.requiresReauthentication, false);
    assert.deepEqual(calls[0], {
        name: 'caissa_account_control_summary',
        args: { p_user_id: owner, p_binding_id: binding }
    });
});

test('stale reverification, crossed authority, CSRF origin and owner fields fail before effects', async () => {
    for (const [authResult, req, expected] of [
        [auth({ factorVerificationAge: [7, -1] }), request('POST', {}), 'REVERIFICATION_REQUIRED'],
        [auth({ tokenId: null }), request('POST', {}), 'REVERIFICATION_REQUIRED'],
        [auth({ factorVerificationAge: null }), request('POST', {}), 'REVERIFICATION_REQUIRED'],
        [auth({ authority: 'production' }), request('POST', {}), 'IDENTITY_AUTHORITY_REJECTED'],
        [auth(), request('POST', {}, { origin: 'https://attacker.example' }), null]
    ]) {
        const { handlers, calls } = fixture({ authResult });
        const res = response();
        await handlers.exportData(req, res);
        assert.equal(res.statusCode, 403);
        if (expected) assert.equal(res.body.code, expected);
        else assert.equal(res.body.error, 'Request rejected');
        assert.equal(calls.length, 0);
    }

    const { handlers, calls } = fixture();
    const res = response();
    await assert.rejects(() => handlers.exportData(request('POST', { userId: 'victim' }), res), /OWNER_FIELD_FORBIDDEN/);
    assert.equal(calls.length, 0);
});

test('private export streams from the verified owner boundary without a buffering RPC', async () => {
    const seen = [];
    const { handlers, calls } = fixture({ streamAccountExport: async input => {
        seen.push({ userId: input.userId, bindingId: input.bindingId });
        input.res.status(200);
        input.res.write('[{"section":"manifest"}]');
        input.res.end();
    } });
    const res = response();
    await handlers.exportData(request('POST', {}), res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.ended, true);
    assert.equal(Buffer.concat(res.chunks).toString(), '[{"section":"manifest"}]');
    assert.deepEqual(seen, [{ userId: owner, bindingId: binding }]);
    assert.ok(!calls.some(call => call.name === 'export_caissa_account_data'));
});

test('reset confirmation is one owner-bound operation and preserves economic classes by contract', async () => {
    const { handlers, calls } = fixture();
    const preparedResponse = response();
    await handlers.prepareReset(request('POST', { confirmation: 'RESET' }), preparedResponse);
    assert.equal(preparedResponse.statusCode, 201);
    assert.equal(preparedResponse.body.operationId, operation);
    assert.match(preparedResponse.body.confirmationToken, /^[A-Za-z0-9_-]{40,64}$/u);

    const confirmedResponse = response();
    await handlers.confirmReset(request('POST', {
        operationId: operation,
        confirmationToken: preparedResponse.body.confirmationToken
    }), confirmedResponse);
    assert.equal(confirmedResponse.statusCode, 200);
    assert.equal(confirmedResponse.body.result.puzzleAttemptsDeleted, 3);
    assert.equal(calls.filter(call => call.name === 'prepare_caissa_account_control').length, 1);
    assert.equal(calls.filter(call => call.name === 'confirm_caissa_progress_reset').length, 1);
});

test('a repeated prepare with the same idempotency key returns the same confirmation token', async () => {
    const { handlers, calls } = fixture();
    const req = request('POST', { confirmation: 'RESET' });
    const first = response();
    const second = response();
    await handlers.prepareReset(req, first);
    await handlers.prepareReset(req, second);
    assert.equal(first.statusCode, 201);
    assert.equal(second.statusCode, 201);
    assert.equal(first.body.operationId, second.body.operationId);
    assert.equal(first.body.confirmationToken, second.body.confirmationToken);
    assert.equal(calls.filter(call => call.name === 'prepare_caissa_account_control').length, 2);
});

test('deletion uses only authenticated Clerk subject and completes database erasure after provider success', async () => {
    const deleted = [];
    const { handlers, calls } = fixture({ createClerkClient: () => ({ users: {
        deleteUser: async subject => deleted.push(subject)
    } }) });
    const prepared = response();
    await handlers.prepareDeletion(request('POST', { confirmation: 'DELETE' }), prepared);
    const confirmed = response();
    await handlers.confirmDeletion(request('POST', {
        operationId: operation,
        confirmationToken: prepared.body.confirmationToken
    }), confirmed);
    assert.equal(confirmed.statusCode, 200);
    assert.deepEqual(deleted, ['synthetic_subject_a']);
    assert.deepEqual(calls.map(call => call.name).slice(-3), [
        'lock_caissa_account_deletion', 'erase_caissa_account_data', 'complete_caissa_account_deletion'
    ]);
});

test('Clerk failure is fail-closed and records review instead of continuing erasure', async () => {
    const { handlers, calls } = fixture({ createClerkClient: () => ({ users: {
        deleteUser: async () => { throw new Error('synthetic provider outage'); }
    } }) });
    const prepared = response();
    await handlers.prepareDeletion(request('POST', { confirmation: 'DELETE' }), prepared);
    const confirmed = response();
    await handlers.confirmDeletion(request('POST', {
        operationId: operation, confirmationToken: prepared.body.confirmationToken
    }), confirmed);
    assert.equal(confirmed.statusCode, 503);
    assert.equal(confirmed.body.code, 'DELETION_REVIEW_REQUIRED');
    assert.ok(calls.some(call => call.name === 'mark_caissa_auth_deletion_failed'));
    assert.ok(calls.some(call => call.name === 'erase_caissa_account_data'));
    assert.ok(!calls.some(call => call.name === 'complete_caissa_account_deletion'));
});

test('persistent throttling fails closed before ownership or account effects', async () => {
    const { handlers, calls, sessionCalls, rateLimitInputs } = fixture({ rateAllowed: false });
    const res = response();
    await handlers.summary(request(), res);
    assert.equal(res.statusCode, 429);
    assert.equal(res.body.code, 'RATE_LIMITED');
    assert.deepEqual(calls, []);
    assert.deepEqual(sessionCalls, []);
    assert.deepEqual(rateLimitInputs.map(input => input.bucket), ['session_lookup']);
});

test('data erasure failure quarantines the request before Clerk deletion', async () => {
    const deleted = [];
    const { handlers, calls } = fixture({
        rpcImpl: async name => {
            if (name === 'prepare_caissa_account_control') return { data: [{
                operation_id: operation, operation_status: 'PREPARED',
                operation_expires_at: new Date(Date.now() + 60_000).toISOString()
            }], error: null };
            if (name === 'lock_caissa_account_deletion') return { data: { status: 'LOCKED' }, error: null };
            if (name === 'erase_caissa_account_data') return { data: null, error: { message: 'synthetic data failure' } };
            if (name === 'mark_caissa_data_deletion_failed') return { data: null, error: null };
            throw new Error(`Unexpected RPC ${name}`);
        },
        createClerkClient: () => ({ users: { deleteUser: async subject => deleted.push(subject) } })
    });
    const prepared = response();
    await handlers.prepareDeletion(request('POST', { confirmation: 'DELETE' }), prepared);
    const confirmed = response();
    await handlers.confirmDeletion(request('POST', {
        operationId: operation, confirmationToken: prepared.body.confirmationToken
    }), confirmed);
    assert.equal(confirmed.statusCode, 503);
    assert.equal(confirmed.body.code, 'DELETION_REVIEW_REQUIRED');
    assert.deepEqual(deleted, []);
    assert.ok(calls.some(call => call.name === 'mark_caissa_data_deletion_failed'));
    assert.ok(!calls.some(call => call.name === 'complete_caissa_account_deletion'));
});

test('a concurrent ownership or entitlement hold stops before Clerk deletion', async () => {
    const deleted = [];
    const { handlers, calls } = fixture({
        rpcImpl: async name => {
            if (name === 'prepare_caissa_account_control') return { data: [{
                operation_id: operation,
                operation_status: 'PREPARED',
                operation_expires_at: new Date(Date.now() + 60_000).toISOString()
            }], error: null };
            if (name === 'lock_caissa_account_deletion') {
                return { data: { status: 'REVIEW_REQUIRED', duplicate: false }, error: null };
            }
            throw new Error(`Unexpected RPC ${name}`);
        },
        createClerkClient: () => ({ users: { deleteUser: async subject => deleted.push(subject) } })
    });
    const prepared = response();
    await handlers.prepareDeletion(request('POST', { confirmation: 'DELETE' }), prepared);
    const confirmed = response();
    await handlers.confirmDeletion(request('POST', {
        operationId: operation,
        confirmationToken: prepared.body.confirmationToken
    }), confirmed);
    assert.equal(confirmed.statusCode, 409);
    assert.equal(confirmed.body.code, 'ACCOUNT_REVIEW_REQUIRED');
    assert.deepEqual(deleted, []);
    assert.ok(!calls.some(call => call.name === 'complete_caissa_account_deletion'));
});

test('migration is service-role only, keeps economic/shared history, and tombstones instead of deleting users', () => {
    const sql = fs.readFileSync('supabase/migrations/20261018174754_caissa_account_control_v1.sql', 'utf8');
    const grantsSql = fs.readFileSync('supabase/migrations/20261024153000_caissa_account_control_explicit_service_grants.sql', 'utf8');
    assert.match(sql, /enable row level security/iu);
    assert.match(sql, /revoke all on table public\.caissa_account_control_operations from public, anon, authenticated/iu);
    assert.match(sql, /grant execute on function public\.complete_caissa_account_deletion\(uuid,uuid,uuid\) to service_role/iu);
    assert.match(sql, /grant execute on function public\.confirm_caissa_progress_reset\(uuid,uuid,uuid,text,text,text,text\) to service_role/iu);
    assert.match(sql, /grant execute on function public\.lock_caissa_account_deletion\(uuid,uuid,uuid,text,text,text,text\) to service_role/iu);
    assert.match(sql, /consume_caissa_account_control_rate_limit/iu);
    assert.match(sql, /export_caissa_account_data_page\(uuid,uuid,text,integer,integer,timestamptz\)/iu);
    assert.match(sql, /p_limit not between 1 and 100/iu);
    assert.match(sql, /caissa_account_rate_limit_write_barrier/iu);
    assert.match(sql, /pg_advisory_xact_lock/iu);
    assert.match(sql, /erase_caissa_account_data/iu);
    assert.match(sql, /delete from public\.puzzle_training_attempts/iu);
    assert.doesNotMatch(sql, /delete from public\.credit_events/iu);
    assert.doesNotMatch(sql, /delete from public\.product_entitlements/iu);
    assert.doesNotMatch(sql, /delete from public\.stripe_events/iu);
    assert.doesNotMatch(sql, /delete from public\.caissa_online_games/iu);
    assert.doesNotMatch(sql, /delete from public\.caissa_online_tournament_participants/iu);
    assert.doesNotMatch(sql, /delete from public\.caissa_online_challenges/iu);
    assert.doesNotMatch(sql, /delete from public\.users/iu);
    assert.match(sql, /clerk_id='deleted_'/u);
    assert.match(sql, /identity_migration_challenges set status='REVOKED'/u);
    assert.match(sql, /identity_manual_recovery_previews set status='REVOKED'/u);
    assert.match(sql, /caissa_account_control_one_pending_kind_idx/u);
    assert.match(sql, /external_subject='deleted_'/u);
    assert.match(grantsSql, /begin;/iu);
    assert.match(grantsSql, /revoke all on table[\s\S]*caissa_identity_ownership_reviews[\s\S]*from public, anon, authenticated, service_role/iu);
    assert.match(grantsSql, /grant select, insert, update on table[\s\S]*caissa_account_states[\s\S]*to service_role/iu);
    assert.match(grantsSql, /grant select, insert on table public\.caissa_account_control_audit to service_role/iu);
    assert.match(grantsSql, /grant usage, select on sequence public\.caissa_account_control_audit_id_seq to service_role/iu);
    assert.match(grantsSql, /create or replace function public\.caissa_account_has_active_economic_work\(p_user_id uuid\)[\s\S]*caissa_online_games[\s\S]*status='active'/iu);
    assert.match(grantsSql, /revoke all on function[\s\S]*caissa_account_assert_writable\(uuid\)[\s\S]*from public, anon, authenticated, service_role/iu);
    assert.doesNotMatch(grantsSql, /grant execute on function[\s\S]*caissa_account_assert_writable\(uuid\)/iu);
    assert.match(grantsSql, /grant execute on function[\s\S]*prepare_caissa_account_control\(uuid,uuid,text,text,text,text,timestamptz\)[\s\S]*to service_role/iu);
    assert.match(grantsSql, /commit;/iu);
});

test('terminal integration treats modern Scanner evidence as exportable but deletion-blocking', () => {
    const sql = fs.readFileSync(
        'supabase/migrations/20261031152722_caissa_account_control_scanner_public_evidence_guard.sql',
        'utf8'
    );
    assert.match(sql, /create or replace function public\.caissa_account_scanner_public_evidence_count\(p_user_id uuid\)/iu);
    assert.match(sql, /create or replace function public\.export_caissa_scanner_public_data_page\(/iu);
    assert.match(sql, /v_scanner_public_evidence=0/iu);
    assert.match(sql, /manualReviewRequired[\s\S]*v_scanner_public_evidence>0/iu);
    assert.match(sql, /scanner_public_feedback_raw[\s\S]*image_storage_reference/iu);
    assert.match(sql, /before insert or update or delete on public\.scanner_public_feedback_raw/iu);
    assert.match(sql, /revoke all on table[\s\S]*scanner_public_feedback_raw[\s\S]*from public,anon,authenticated,service_role/iu);
    assert.match(sql, /grant select,insert on table[\s\S]*scanner_public_feedback_raw[\s\S]*to service_role/iu);
    assert.doesNotMatch(sql, /delete from public\.scanner_(?:public|feedback)/iu);
    assert.doesNotMatch(sql, /update public\.scanner_(?:public|feedback)/iu);
    assert.match(sql, /pg_catalog\.to_jsonb\(f\)-'submitted_by'/iu);
    assert.match(sql, /'feedbackId',case when f\.submitted_by=p_user_id then c\.feedback_id else null end/iu);
});
