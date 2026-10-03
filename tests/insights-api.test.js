import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Chess } from '../assets/vendor/chess.js/chess-1.4.0.esm.js';
import { createInsightsHandler } from '../api/_lib/insights-handlers.js';
import { validateDataset, validateSnapshot, hash } from '../api/_lib/insights-validation.js';
import '../js/insights/engine-analysis.js';
const rawText = '[Event "Synthetic"]\n[White "Alex"]\n[Black "B"]\n[Result "0-1"]\n\n1. e4 e5 2. Nf3 Nc6 0-1';
const input = { rawText, subject: { provider: 'local', username: 'Alex' }, importMetadata: [] };
const ownerA = randomUUID(), ownerB = randomUUID();
function memoryDb() {
    const tables = { users: [{ id: ownerA, clerk_id: 'A' }, { id: ownerB, clerk_id: 'B' }], insight_datasets: [], insight_reports: [] };
    return { tables,
        from(table) {
            let filters = [], limit = Infinity, mode = 'many', countOnly = false, fields, insert;
            const query = {
                select(value, options) { fields = value; countOnly = !!options?.head; return query; },
                eq(k, v) { filters.push(r => r[k] === v); return query; },
                order() { return query; }, limit(value) { limit = value; return query; },
                or() { throw new Error('Cursor query is covered separately'); },
                insert(row) { insert = row; return query; },
                maybeSingle() { mode = 'single'; return query; }, single() { mode = 'single'; return query; },
                then(resolve, reject) {
                    try {
                        const inserted = insert ? { ...insert, created_at: '2026-10-03T04:00:00Z' } : null;
                        if (inserted) tables[table].push(inserted);
                        const rows = (inserted ? [inserted] : tables[table]).filter(r => filters.every(f => f(r))).slice(0, limit);
                        const projected = rows.map(r => Object.fromEntries(fields.split(',').map(k => k.trim()).filter(k => Object.hasOwn(r, k)).map(k => [k, structuredClone(r[k])])));
                        return Promise.resolve({ data: countOnly ? null : mode === 'single' ? projected[0] || null : projected, count: rows.length, error: null }).then(resolve, reject);
                    } catch (error) { return Promise.reject(error).then(resolve, reject); }
                }
            }; return query;
        },
        async rpc(name, args) {
            if (name === 'save_insight_report') {
                const existing = tables.insight_reports.find(r => r.user_id === args.p_user_id && r.operation_id === args.p_operation_id);
                if (existing) return { data: existing.payload_hash === args.p_payload_hash && existing.dataset_id === args.p_dataset_id
                    ? { status: 'existing', reportId: existing.id, createdAt: existing.created_at } : { status: 'conflict' } };
                const row = { id: randomUUID(), user_id: args.p_user_id, dataset_id: args.p_dataset_id, operation_id: args.p_operation_id,
                    payload_hash: args.p_payload_hash, snapshot: structuredClone(args.p_snapshot), summary: args.p_summary, created_at: '2026-10-03T04:00:00Z' };
                tables.insight_reports.push(row); return { data: { status: 'created', reportId: row.id, createdAt: row.created_at } };
            }
            const index = tables.insight_reports.findIndex(r => r.user_id === args.p_user_id && r.id === args.p_report_id);
            if (index < 0) return { data: { deleted: false } };
            tables.insight_reports.splice(index, 1); return { data: { deleted: true } };
        }
    };
}
function harness() {
    const db = memoryDb();
    const dependencies = { authenticate: async req => req.account ? { authenticated: true, userId: req.account } : { authenticated: false, status: 401 },
        authFailure: (res, auth) => res.status(auth.status).json({ code: 'AUTH_REQUIRED' }),
        db: () => db, rate: () => ({ allowed: true }), env: { VERCEL_URL: 'owned-preview.vercel.app' } };
    async function call(action, method, body, account = 'A', query = {}, origin) {
        const result = { headers: {}, status: 200, body: null };
        const res = { setHeader(k, v) { result.headers[k] = v; }, status(n) { result.status = n; return res; }, json(value) { result.body = value; return res; }, end() { return res; } };
        await createInsightsHandler(action, dependencies)({ method, body, account, query, headers: origin ? { origin } : {} }, res); return result;
    }
    return { db, call, dependencies };
}
async function prepared(h) {
    const data = validateDataset(input).dataset;
    const snapshot = await globalThis.CaissaInsightsAnalysis.generate(data, 1, 'both', { Chess, engineFactory: () => null });
    const dataset = await h.call('dataset', 'POST', input);
    return { datasetId: dataset.body.datasetId, operationId: randomUUID(), snapshot };
}
test('every reports endpoint requires verified authentication before database access', async () => {
    const h = harness(); h.dependencies.db = () => { throw new Error('Must not access database'); };
    for (const [action, method] of [['dataset', 'POST'], ['list', 'GET'], ['list', 'POST'], ['detail', 'GET'], ['detail', 'DELETE']]) {
        const response = await h.call(action, method, {}, null); assert.equal(response.status, 401); assert.equal(response.headers['Cache-Control'], 'private, no-store');
    }
});
test('owner comes from canonical users.clerk_id, never request body', async () => {
    const h = harness(); const rejected = await h.call('dataset', 'POST', { ...input, ownerId: ownerB }); assert.equal(rejected.status, 400);
    const valid = await h.call('dataset', 'POST', input); assert.equal(valid.status, 201); assert.equal(h.db.tables.insight_datasets[0].user_id, ownerA);
});
test('identical inputs deduplicate only within the same owner', async () => {
    const h = harness(); const a = await h.call('dataset', 'POST', input), again = await h.call('dataset', 'POST', input), b = await h.call('dataset', 'POST', input, 'B');
    assert.equal(a.body.datasetId, again.body.datasetId); assert.notEqual(a.body.datasetId, b.body.datasetId); assert.equal(h.db.tables.insight_datasets.length, 2);
});
test('unidentified, invalid and oversized PGNs cannot create a dataset', async () => {
    const h = harness();
    for (const invalid of [{ ...input, subject: { ...input.subject, username: 'Foreign' } },
        { ...input, rawText: rawText.replace('Nf3', 'Qh9') }, { ...input, rawText: 'x'.repeat(1048577) }]) {
        const r = await h.call('dataset', 'POST', invalid); assert.ok([400, 413].includes(r.status));
    }
    assert.equal(h.db.tables.insight_datasets.length, 0);
});
test('repeat save returns the same immutable report and changed payload conflicts', async () => {
    const h = harness(), body = await prepared(h);
    const first = await h.call('list', 'POST', body), second = await h.call('list', 'POST', body);
    assert.equal(first.status, 201); assert.equal(second.status, 200); assert.equal(first.body.reportId, second.body.reportId);
    const changed = structuredClone(body); changed.snapshot.timestamp = '2026-10-02T04:00:00Z';
    const conflict = await h.call('list', 'POST', changed); assert.equal(conflict.status, 409); assert.equal(conflict.body.code, 'IDEMPOTENCY_CONFLICT');
    assert.equal(h.db.tables.insight_reports.length, 1);
});
test('a clean client can recover the saved report and exact source dataset', async () => {
    const h = harness(), body = await prepared(h), saved = await h.call('list', 'POST', body);
    const list = await h.call('list', 'GET'); assert.equal(list.body.reports.length, 1); assert.equal(list.body.reports[0].summary.wld.losses, 1);
    const detail = await h.call('detail', 'GET', null, 'A', { id: saved.body.reportId });
    assert.equal(detail.body.dataset.rawText, rawText); assert.equal(detail.body.report.snapshot.analysisStatus, 'unavailable');
    assert.equal(detail.body.report.snapshot.verificationStatus, 'structurally_validated');
});
test('second owner cannot list, read, delete or save a report against the first owner dataset', async () => {
    const h = harness(), body = await prepared(h), saved = await h.call('list', 'POST', body), id = saved.body.reportId;
    assert.deepEqual((await h.call('list', 'GET', null, 'B')).body.reports, []);
    for (const method of ['GET', 'DELETE']) assert.equal((await h.call('detail', method, null, 'B', { id })).status, 404);
    assert.equal((await h.call('list', 'POST', body, 'B')).status, 404); assert.equal(h.db.tables.insight_reports.length, 1);
});
test('nonexistent and foreign reports have the same not-found response', async () => {
    const h = harness(), body = await prepared(h), saved = await h.call('list', 'POST', body);
    const foreign = await h.call('detail', 'GET', null, 'B', { id: saved.body.reportId });
    const absent = await h.call('detail', 'GET', null, 'B', { id: randomUUID() }); assert.deepEqual(foreign.body, absent.body);
});
test('server rebuilds W/D/L and coverage and ignores client verification claims', async () => {
    const { dataset } = validateDataset(input), h = harness(), body = await prepared(h);
    body.snapshot.aggregate.wld = { wins: 999, losses: 0, draws: 0 }; body.snapshot.verified = true;
    const clean = validateSnapshot(body.snapshot, dataset); assert.equal(clean.aggregate.wld.losses, 1); assert.equal(clean.aggregate.wld.wins, 0);
    assert.equal(clean.verified, undefined); assert.equal(clean.verificationStatus, 'structurally_validated');
});
test('claimed complete analysis without comparable scores is rejected', async () => {
    const h = harness(), body = await prepared(h); body.snapshot.analysisStatus = 'complete';
    assert.equal((await h.call('list', 'POST', body)).status, 400);
});
test('history cursors cannot inject filters', async () => {
    const h = harness(); const result = await h.call('list', 'GET', null, 'A', { cursor: Buffer.from(JSON.stringify({ id: 'x),user_id.eq.other', createdAt: 'bad' })).toString('base64url') });
    assert.equal(result.status, 400);
});
test('CORS permits the configured preview and rejects arbitrary origins', async () => {
    const h = harness(); assert.equal((await h.call('list', 'GET', null, 'A', {}, 'https://owned-preview.vercel.app')).status, 200);
    assert.equal((await h.call('list', 'GET', null, 'A', {}, 'https://unrelated.vercel.app')).status, 403);
});
test('database errors produce a save failure without leaking internals', async () => {
    const h = harness(); h.dependencies.db = () => { throw new Error('private token and PGN'); };
    const result = await h.call('list', 'GET'); assert.equal(result.status, 503); assert.doesNotMatch(JSON.stringify(result.body), /private token/);
});
test('input hash is stable across object key order', () => {
    assert.equal(hash({ a: 1, b: { d: 2, c: 3 } }), hash({ b: { c: 3, d: 2 }, a: 1 }));
});
