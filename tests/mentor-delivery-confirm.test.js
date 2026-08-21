import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createMentorResultConfirmHandler } from '../api/mentor/result/[operationId]/confirm.js';

const operationId = crypto.randomUUID();
const response = () => ({ statusCode: 0, body: null, setHeader() {}, status(value) { this.statusCode = value; return this; }, json(value) { this.body = value; return this; } });
const request = (authorization = 'Bearer fixture') => ({ method: 'POST', headers: { authorization, origin: 'https://www.caissa-chess.org' }, query: { operationId } });

test('delivery confirmation requires authentication before database access', async () => {
    let calls = 0; const res = response();
    await createMentorResultConfirmHandler({ db: { rpc: async () => { calls += 1; } }, authenticate: async () => ({ authenticated: false, status: 401, code: 'AUTH_REQUIRED' }) })(request(), res);
    assert.equal(res.statusCode, 401); assert.equal(calls, 0);
});

test('delivery confirmation binds the operation to the verified subject', async () => {
    let invocation; const res = response();
    const db = { rpc: async (name, args) => { invocation = { name, args }; return { data: { success: true, code: 'DELIVERY_CONFIRMED' }, error: null }; } };
    await createMentorResultConfirmHandler({ db, authenticate: async () => ({ authenticated: true, userId: 'fixture-subject' }) })(request(), res);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(invocation, { name: 'confirm_mentor_result_delivery', args: { p_operation_id: operationId, p_clerk_id: 'fixture-subject' } });
});

test('invalid operation reference is rejected before database access', async () => {
    let calls = 0; const res = response(); const req = request(); req.query.operationId = 'invalid';
    await createMentorResultConfirmHandler({ db: { rpc: async () => { calls += 1; } }, authenticate: async () => ({ authenticated: true, userId: 'fixture-subject' }) })(req, res);
    assert.equal(res.statusCode, 400); assert.equal(calls, 0);
});
