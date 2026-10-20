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

test('client downloads the streamed export blob without reparsing and reserializing it', async () => {
    const originalDocument = globalThis.document;
    const originalCreate = URL.createObjectURL;
    const originalRevoke = URL.revokeObjectURL;
    const clicks = [];
    globalThis.document = { createElement: () => ({ click() { clicks.push(this.download); } }) };
    URL.createObjectURL = () => 'blob:synthetic-export';
    URL.revokeObjectURL = () => {};
    try {
        const blob = new Blob(['[{"section":"manifest"}]'], { type: 'application/json' });
        const api = createAccountControlApi({
            tokenProvider: async () => 'signed-token',
            fetchImpl: async () => ({ ok: true, status: 200, blob: async () => blob })
        });
        const result = await api.exportData();
        assert.deepEqual(result, { downloaded: true, bytes: blob.size });
        assert.equal(clicks.length, 1);
        assert.match(clicks[0], /^caissa-account-data-\d{4}-\d{2}-\d{2}\.json$/u);
    } finally {
        globalThis.document = originalDocument;
        URL.createObjectURL = originalCreate;
        URL.revokeObjectURL = originalRevoke;
    }
});

test('backend-certified fresh token stays memory-only for sensitive calls and clears on denial', async () => {
    const authorizations = [];
    const api = createAccountControlApi({
        tokenProvider: async () => 'ordinary-token',
        fetchImpl: async (_url, options) => {
            authorizations.push(options.headers.Authorization);
            if (authorizations.length === 3) return response(403, {
                code: 'REVERIFICATION_REQUIRED', error: 'Verification required.'
            });
            return response(200, {
                backendReady: true, requiresReauthentication: false,
                summary: { capabilities: {} }
            });
        }
    });
    await api.certifyRecentSession('fresh-token');
    await api.summary();
    await assert.rejects(api.summary(), error => error.code === 'REVERIFICATION_REQUIRED');
    await api.summary();
    assert.deepEqual(authorizations, [
        'Bearer fresh-token', 'Bearer fresh-token', 'Bearer fresh-token', 'Bearer ordinary-token'
    ]);
});

test('an expired in-memory fresh token falls back to the live session provider', async () => {
    const authorizations = [];
    const api = createAccountControlApi({
        recentTokenLifetimeMs: 0,
        tokenProvider: async () => 'ordinary-token',
        fetchImpl: async (_url, options) => {
            authorizations.push(options.headers.Authorization);
            return response(200, { backendReady: true, requiresReauthentication: false, summary: {} });
        }
    });
    await api.certifyRecentSession('fresh-token');
    await api.summary();
    assert.deepEqual(authorizations, ['Bearer fresh-token', 'Bearer ordinary-token']);
});

function response(status, payload) {
    return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => payload,
        blob: async () => new Blob([JSON.stringify(payload)], { type: 'application/json' })
    };
}
