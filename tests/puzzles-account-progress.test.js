import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/puzzles/progress.js';
import { loadAccountProgress } from '../js/puzzles/account-progress-api.js';

const USER = '7e6977c8-d287-4a53-b85a-5df92a0b44ba';
const OPERATION = '71a44dcb-9040-4503-ac39-44f5c8d5818f';

function response() {
    return { statusCode: 200, headers: {}, setHeader(k, v) { this.headers[k] = v; return this; },
        status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; },
        end() { return this; } };
}
function deps({ authenticated = true, lookup = { puzzleId: '4TN7E', rating: 1820, sourceVersion: '2026-09-10' },
    user = { id: USER }, userError = null, rpcData = { rating: 1813, solved: 1, failed: 0, change: 13 },
    rpcError = null } = {}) {
    const calls = [];
    const db = {
        from(table) {
            if (table === 'users') return { select() { return this; }, eq() { return this; },
                single: async () => ({ data: user, error: userError }) };
            return { select() { return this; }, eq() { return this; },
                maybeSingle: async () => ({ data: { rating: 1800, solved: 0, failed: 0 } }) };
        },
        async rpc(name, arguments_) { calls.push({ name, arguments_ });
            return { data: rpcData, error: rpcError }; },
    };
    return { calls, authenticate: async () => authenticated ? { authenticated: true, userId: 'clerk_user' }
        : { authenticated: false, status: 401 }, getSupabase: () => db,
        checkRateLimit: () => ({ allowed: true }), lookupPuzzle: async () => lookup };
}

test('requires account identity before reading private progress', async () => {
    const res = response();
    await handler({ method: 'GET', headers: {} }, res, deps({ authenticated: false }));
    assert.equal(res.statusCode, 401);
});

test('reads only the authenticated account progress and disables caching', async () => {
    const res = response();
    await handler({ method: 'GET', headers: {} }, res, deps());
    assert.equal(res.statusCode, 200);
    assert.equal(res.headers['Cache-Control'], 'private, no-store');
    assert.deepEqual(res.body, { progress: { rating: 1800, solved: 0, failed: 0 }, persistent: true });
});

test('Preview can relay a read to the canonical progress API without copying production database credentials', async () => {
    const res = response();
    const dependencies = deps();
    dependencies.env = {
        CAISSA_PUZZLE_PROGRESS_READ_ORIGIN: 'https://www.caissa-chess.org',
    };
    dependencies.getSupabase = () => { throw new Error('Preview relay must not open Supabase directly'); };
    dependencies.fetchFn = async (url, options) => {
        assert.equal(url, 'https://www.caissa-chess.org/api/puzzles/progress');
        assert.equal(options.method, 'GET');
        assert.equal(options.headers.Authorization, 'Bearer session-token');
        return {
            status: 200,
            json: async () => ({ progress: { rating: 1912, solved: 12, failed: 3 }, persistent: true }),
        };
    };

    await handler({ method: 'GET', headers: { authorization: 'Bearer session-token' } }, res, dependencies);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { progress: { rating: 1912, solved: 12, failed: 3 }, persistent: true });
});

test('Preview read relay rejects malformed or non-HTTPS origins and stays on the local backend', async () => {
    const res = response();
    const dependencies = deps();
    dependencies.env = {
        CAISSA_PUZZLE_PROGRESS_READ_ORIGIN: 'http://www.caissa-chess.org/path',
    };
    dependencies.fetchFn = async () => { throw new Error('Invalid relay origin must not be requested'); };

    await handler({ method: 'GET', headers: {} }, res, dependencies);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { progress: { rating: 1800, solved: 0, failed: 0 }, persistent: true });
});

test('fails closed while the Clerk identity has no internal account mapping', async () => {
    const res = response();
    await handler({ method: 'GET', headers: {} }, res, deps({ user: null, userError: { code: 'PGRST116' } }));
    assert.equal(res.statusCode, 409);
    assert.deepEqual(res.body, { code: 'ACCOUNT_NOT_READY' });
});

test('persists with server verified puzzle rating and authenticated user ID', async () => {
    const dependencies = deps();
    const res = response();
    await handler({ method: 'POST', headers: {}, body: {
        operationId: OPERATION, puzzleId: '4TN7E', puzzleRating: 4000,
        outcome: 'solved', assisted: false,
    } }, res, dependencies);
    assert.equal(res.statusCode, 200);
    assert.equal(dependencies.calls[0].arguments_.p_puzzle_rating, 1820);
    assert.equal(dependencies.calls[0].arguments_.p_user_id, USER);
    assert.equal(res.body.progress.rating, 1813);
});

test('rejects malformed outcomes before writing', async () => {
    const dependencies = deps();
    const res = response();
    await handler({ method: 'POST', headers: {}, body: {
        operationId: OPERATION, puzzleId: '4TN7E', outcome: 'skipped', assisted: false,
    } }, res, dependencies);
    assert.equal(res.statusCode, 400);
    assert.equal(dependencies.calls.length, 0);
});

test('returns a retryable service response when catalog lookup or the RPC fails', async () => {
    const lookupFailure = deps();
    lookupFailure.lookupPuzzle = async () => { throw new Error('catalog offline'); };
    const lookupResponse = response();
    await handler({ method: 'POST', headers: {}, body: {
        operationId: OPERATION, puzzleId: '4TN7E', outcome: 'solved', assisted: false,
    } }, lookupResponse, lookupFailure);
    assert.equal(lookupResponse.statusCode, 503);
    assert.equal(lookupFailure.calls.length, 0);

    const rpcResponse = response();
    await handler({ method: 'POST', headers: {}, body: {
        operationId: OPERATION, puzzleId: '4TN7E', outcome: 'failed', assisted: true,
    } }, rpcResponse, deps({ rpcError: { code: 'XX000' } }));
    assert.equal(rpcResponse.statusCode, 503);
});

test('a first Puzzles visit creates the verified internal account mapping once', async () => {
    const calls = [];
    const responses = [
        { ok: false, status: 409 },
        { ok: true, status: 200, json: async () => ({ user: { clerkId: 'clerk_user' } }) },
        { ok: true, status: 200, json: async () => ({ progress: { rating: 1800, solved: 0, failed: 0 } }) },
    ];
    const fetchImpl = async (url, options) => {
        calls.push({ url, options });
        return responses.shift();
    };
    const result = await loadAccountProgress({ getToken: async () => 'session-token' }, fetchImpl);

    assert.equal(result.progress.rating, 1800);
    assert.deepEqual(calls.map(call => [call.url, call.options.method]), [
        ['/api/puzzles/progress', 'GET'],
        ['/api/user/sync', 'POST'],
        ['/api/puzzles/progress', 'GET'],
    ]);
    assert.ok(calls.every(call => call.options.headers.Authorization === 'Bearer session-token'));
});

test('account bootstrap does not mask non-mapping service failures', async () => {
    const calls = [];
    await assert.rejects(() => loadAccountProgress({ getToken: async () => 'session-token' }, async url => {
        calls.push(url);
        return { ok: false, status: 503 };
    }), /Account progress HTTP 503/);
    assert.deepEqual(calls, ['/api/puzzles/progress']);
});

test('marks a successful relayed Preview read as read-only without changing progress', async () => {
    const dependencies = deps();
    dependencies.env = { CAISSA_PUZZLE_PROGRESS_READ_ORIGIN: 'https://www.caissa-chess.org' };
    dependencies.fetchFn = async () => ({
        ok: true,
        status: 200,
        json: async () => ({ progress: { rating: 1912, solved: 8, failed: 3 }, persistent: true }),
    });
    const res = response();

    await handler({ method: 'GET', headers: { authorization: 'Bearer synthetic' } }, res, dependencies);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, {
        progress: { rating: 1912, solved: 8, failed: 3 },
        persistent: true,
        readOnly: true,
    });
    assert.equal(dependencies.calls.length, 0);
});
