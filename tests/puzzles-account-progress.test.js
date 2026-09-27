import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/puzzles/progress.js';

const USER = '7e6977c8-d287-4a53-b85a-5df92a0b44ba';
const OPERATION = '71a44dcb-9040-4503-ac39-44f5c8d5818f';

function response() {
    return { statusCode: 200, headers: {}, setHeader(k, v) { this.headers[k] = v; return this; },
        status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; },
        end() { return this; } };
}
function deps({ authenticated = true, lookup = { puzzleId: '4TN7E', rating: 1820, sourceVersion: '2026-09-10' } } = {}) {
    const calls = [];
    const db = {
        from(table) {
            if (table === 'users') return { select() { return this; }, eq() { return this; },
                single: async () => ({ data: { id: USER } }) };
            return { select() { return this; }, eq() { return this; },
                maybeSingle: async () => ({ data: { rating: 1800, solved: 0, failed: 0 } }) };
        },
        async rpc(name, arguments_) { calls.push({ name, arguments_ });
            return { data: { rating: 1813, solved: 1, failed: 0, change: 13 } }; },
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
