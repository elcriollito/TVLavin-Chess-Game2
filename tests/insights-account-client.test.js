import test from 'node:test';
import assert from 'node:assert/strict';
import '../js/insights/account-client.js';
const create = globalThis.CaissaInsightsAccount.create;
const reportId = '20000000-0000-4000-8000-000000000001', operationId = '20000000-0000-4000-8000-000000000002';
function harness(fetchFn) {
    const memory = new Map(), auth = { isSignedIn: true, userId: 'account_A', getToken: async () => 'token_A', onAuthStateChange(fn) { this.changed = fn; return () => {}; } };
    const storage = { getItem: k => memory.get(k) || null, setItem: (k, v) => memory.set(k, v), removeItem: k => memory.delete(k) };
    const client = create({ auth, storage, fetch: fetchFn });
    return { auth, storage, client, memory };
}
const response = payload => ({ ok: true, json: async () => payload });
test('workspaces are owner-scoped and a legacy unowned key is never automatically imported', () => {
    const h = harness(); h.memory.set('caissa_insight_profile', JSON.stringify({ rawText: 'unowned' }));
    assert.equal(h.client.readWorkspace(), null); h.client.writeWorkspace({ dataset: { rawText: 'A' } });
    h.auth.userId = 'account_B'; h.auth.changed(); assert.equal(h.client.readWorkspace(), null);
    h.client.writeWorkspace({ dataset: { rawText: 'B' } }); h.auth.userId = 'account_A'; h.auth.changed();
    assert.equal(h.client.readWorkspace().dataset.rawText, 'A');
});
test('Start Fresh clears a draft without calling a delete-report API', () => {
    const h = harness(() => { throw new Error('Unexpected API request'); });
    h.client.writeWorkspace({ report: { private: true } }); h.client.clearWorkspace(); assert.equal(h.client.readWorkspace(), null);
});
test('an account switch while obtaining a token cancels the save before any network request', async () => {
    let release, fetches = 0; const h = harness(async () => { fetches++; });
    h.auth.getToken = () => new Promise(resolve => { release = resolve; });
    const saving = h.client.save({ rawText: 'A', subject: { provider: 'local', username: 'A' } }, {}, operationId);
    h.auth.userId = 'account_B'; h.auth.changed(); release('token_A');
    await assert.rejects(saving, { code: 'ACCOUNT_CHANGED' }); assert.equal(fetches, 0);
});
test('an account switch between dataset save and report save never sends an old snapshot as the new owner', async () => {
    const calls = []; let h;
    h = harness(async (url) => { calls.push(url); h.auth.userId = 'account_B'; h.auth.changed();
        return response({ accountId: 'account_A', persistent: true, datasetId: reportId }); });
    await assert.rejects(h.client.save({ rawText: 'A', subject: { provider: 'local', username: 'A' } }, {}, operationId), { code: 'ACCOUNT_CHANGED' });
    assert.deepEqual(calls, ['/api/insights/datasets']);
});
test('a 200 response without persistence or stable IDs is not reported as saved', async () => {
    const h = harness(async () => response({ accountId: 'account_A' }));
    await assert.rejects(h.client.save({ rawText: 'A', subject: { provider: 'local', username: 'A' } }, {}, operationId), /confirm account persistence/);
});
test('retry preserves the operation ID and payload, and rejects a foreign-account response', async () => {
    const posts = [];
    const h = harness(async (url, init) => {
        posts.push(JSON.parse(init.body));
        return response(url.endsWith('datasets') ? { accountId: 'account_A', persistent: true, datasetId: reportId }
            : { accountId: 'account_A', persistent: true, reportId, createdAt: '2026-10-03T04:00:00Z' });
    });
    const dataset = { rawText: 'A', subject: { provider: 'local', username: 'A' } };
    await h.client.save(dataset, { evidence: true }, operationId); await h.client.save(dataset, { evidence: true }, operationId);
    assert.deepEqual(posts[1], posts[3]);
    const other = harness(async () => response({ accountId: 'account_B', persistent: true })); await assert.rejects(other.client.list(), /confirm account persistence/);
});
test('storage exhaustion cannot falsely claim persistence', () => {
    const h = harness(); h.storage.setItem = () => { throw new Error('Quota exceeded'); };
    assert.equal(h.client.writeWorkspace({ report: {} }), false);
});
