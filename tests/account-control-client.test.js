import test from 'node:test';
import assert from 'node:assert/strict';
import { createAccountControlApi, AccountControlApiError } from '../js/identity/account-control-api.js';

test('client keeps confirmation tokens in memory and reuses one idempotency key for prepare and confirm', async () => {
    const calls = [];
    const fetchImpl = async (url, options) => {
        calls.push({ url, options });
        if (url.endsWith('/prepare')) return response(201, {
            operationId: '30000000-0000-4000-8000-000000000001',
            confirmationToken: 'a'.repeat(43), status: 'PREPARED'
        });
        return response(200, { status: 'COMPLETED' });
    };
    const api = createAccountControlApi({ fetchImpl, tokenProvider: async () => 'signed-token' });
    const prepared = await api.prepareReset('RESET');
    await api.confirmReset(prepared);
    assert.equal(calls.length, 2);
    assert.equal(calls[0].options.headers['Idempotency-Key'], calls[1].options.headers['Idempotency-Key']);
    assert.equal(JSON.parse(calls[1].options.body).confirmationToken, 'a'.repeat(43));
    assert.ok(!JSON.stringify(calls).includes('userId'));
});

test('client never sends an account target and maps fail-closed server errors', async () => {
    const api = createAccountControlApi({
        tokenProvider: async () => 'signed-token',
        fetchImpl: async () => response(409, { code: 'OWNERSHIP_REVIEW_REQUIRED', error: 'Review required.' })
    });
    await assert.rejects(api.summary(), error => {
        assert.ok(error instanceof AccountControlApiError);
        assert.equal(error.code, 'OWNERSHIP_REVIEW_REQUIRED');
        return true;
    });
});

function response(status, payload) {
    return { ok: status >= 200 && status < 300, status, json: async () => payload };
}
