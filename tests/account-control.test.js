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

function fixture({ authResult = auth(), rpcImpl, createClerkClient, rateAllowed = true, streamAccountExport } = {}) {
    const calls = [];
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
        }
    };
    const handlers = createAccountControlHandlers({
        env: environment(),
        verifyAuth: async () => authResult,
        getSupabase: () => db,
        resolveIdentityOwnership: async () => ({ ok: true, userId: owner, bindingId: binding }),
        consumeAccountRateLimit: async () => rateAllowed,
        createClerkClient,
        streamAccountExport: streamAccountExport || (async ({ res }) => {
            res.status(200);
            res.write('{"schemaVersion":"caissa.account-export.v1"}');
            res.end();
        }),
        log: { warn() {} }
    });
    return { handlers, calls };
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
    const { handlers, calls } = fixture({ rateAllowed: false });
    const res = response();
    await handlers.summary(request(), res);
    assert.equal(res.statusCode, 429);
    assert.equal(res.body.code, 'RATE_LIMITED');
    assert.deepEqual(calls, []);
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
});

