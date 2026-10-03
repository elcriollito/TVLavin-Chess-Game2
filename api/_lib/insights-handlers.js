import { randomUUID } from 'node:crypto';
import { core, UUID, bodyObject, validateDataset, validateSnapshot, summary, hash, invalid } from './insights-validation.js';

export function insightCors(req, res, methods, env = process.env) {
    const origin = String(req.headers?.origin || '');
    if (!origin) return true;
    const allowed = new Set(['https://www.caissa-chess.org', ...String(env.CAISSA_BROWSER_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean)]);
    for (const host of [env.VERCEL_URL, env.VERCEL_BRANCH_URL]) if (/^[a-z0-9.-]+\.vercel\.app$/i.test(host || '')) allowed.add(`https://${host}`);
    const requested = String(req.headers?.['access-control-request-method'] || '').toUpperCase();
    const headers = String(req.headers?.['access-control-request-headers'] || '').toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
    if (!allowed.has(origin) || (req.method === 'OPTIONS' && ((requested && !methods.includes(requested)) || headers.some(h => !['authorization', 'content-type'].includes(h))))) {
        res.status(403).json({ code: 'FORBIDDEN' }); return false;
    }
    res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', [...methods, 'OPTIONS'].join(', '));
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type'); return true;
}
function decodeCursor(text) {
    if (!text) return null;
    if (typeof text !== 'string' || text.length > 250) throw invalid('Invalid history cursor.');
    try {
        const cursor = JSON.parse(Buffer.from(text, 'base64url').toString());
        if (!UUID.test(cursor.id || '') || !/^\d{4}-\d{2}-\d{2}T[0-9:.]+(?:Z|\+00:00)$/.test(cursor.createdAt || '') || !Number.isFinite(Date.parse(cursor.createdAt))) throw new Error();
        return cursor;
    } catch { throw invalid('Invalid history cursor.'); }
}
export function createInsightsHandler(action, dependencies) {
    return async function handler(req, res) {
        res.setHeader('Cache-Control', 'private, no-store'); res.setHeader('X-Content-Type-Options', 'nosniff');
        const methods = action === 'dataset' ? ['POST'] : action === 'detail' ? ['GET', 'DELETE'] : ['GET', 'POST'];
        if (!insightCors(req, res, methods, dependencies.env || process.env)) return;
        if (req.method === 'OPTIONS') return res.status(204).end();
        if (!methods.includes(req.method)) return res.status(405).json({ code: 'METHOD_NOT_ALLOWED' });
        const auth = await dependencies.authenticate(req);
        if (!auth.authenticated) return dependencies.authFailure(res, auth);
        const rate = dependencies.rate(auth.userId, { prefix: 'insights-reports', windowMs: 60000, max: 30 });
        if (!rate.allowed) { res.setHeader('Retry-After', String(rate.retryAfter || 60)); return res.status(429).json({ code: 'RATE_LIMITED' }); }
        try {
            const db = dependencies.db();
            const { data: user, error: userError } = await db.from('users').select('id').eq('clerk_id', auth.userId).maybeSingle();
            if (userError) throw userError;
            if (!user?.id) return res.status(409).json({ code: 'ACCOUNT_NOT_READY', error: 'Your account is still being prepared. Retry saving shortly.' });
            const owner = user.id, envelope = { accountId: auth.userId, persistent: true };
            if (action === 'dataset') {
                const { dataset, inputHash } = validateDataset(req.body);
                const { data: existing, error: lookupError } = await db.from('insight_datasets').select('id').eq('user_id', owner).eq('input_hash', inputHash).maybeSingle();
                if (lookupError) throw lookupError;
                if (existing) return res.status(200).json({ ...envelope, datasetId: existing.id });
                const { count, error: countError } = await db.from('insight_datasets').select('id', { count: 'exact', head: true }).eq('user_id', owner);
                if (countError) throw countError;
                if (count >= 1000) return res.status(409).json({ code: 'HISTORY_LIMIT', error: 'The 1000 dataset limit has been reached. Delete saved reports to make room.' });
                const row = { id: randomUUID(), user_id: owner, input_hash: inputHash, schema_version: core.VERSION,
                    raw_pgn: dataset.rawText, subject: dataset.subject, import_metadata: dataset.importMetadata, game_count: dataset.games.length };
                const { data: created, error } = await db.from('insight_datasets').insert(row).select('id').single();
                if (error?.code === '23505') {
                    const { data: retry, error: retryError } = await db.from('insight_datasets').select('id').eq('user_id', owner).eq('input_hash', inputHash).single();
                    if (retryError) throw retryError;
                    return res.status(200).json({ ...envelope, datasetId: retry.id });
                }
                if (error) throw error;
                return res.status(201).json({ ...envelope, datasetId: created.id });
            }
            if (action === 'list' && req.method === 'GET') {
                const cursor = decodeCursor(req.query?.cursor);
                let query = db.from('insight_reports').select('id, dataset_id, created_at, summary').eq('user_id', owner)
                    .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(21);
                if (cursor) query = query.or(`created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`);
                const { data, error } = await query; if (error) throw error;
                const rows = data || [], reports = rows.slice(0, 20), last = reports.at(-1);
                const nextCursor = rows.length > 20 ? Buffer.from(JSON.stringify({ createdAt: last.created_at, id: last.id })).toString('base64url') : null;
                return res.status(200).json({ ...envelope, reports, nextCursor });
            }
            if (action === 'detail') {
                const id = req.query?.id;
                if (!UUID.test(id || '')) return res.status(404).json({ code: 'REPORT_NOT_FOUND' });
                if (req.method === 'DELETE') {
                    const { data, error } = await db.rpc('delete_insight_report', { p_user_id: owner, p_report_id: id });
                    if (error) throw error;
                    if (!data?.deleted) return res.status(404).json({ code: 'REPORT_NOT_FOUND' });
                    return res.status(200).json({ ...envelope, reportId: id, deleted: true });
                }
                const { data: report, error } = await db.from('insight_reports').select('id, dataset_id, created_at, snapshot').eq('user_id', owner).eq('id', id).maybeSingle();
                if (error) throw error;
                if (!report) return res.status(404).json({ code: 'REPORT_NOT_FOUND' });
                const { data: dataset, error: datasetError } = await db.from('insight_datasets').select('id, raw_pgn, subject, import_metadata').eq('user_id', owner).eq('id', report.dataset_id).single();
                if (datasetError) throw datasetError;
                return res.status(200).json({ ...envelope, report, dataset: { id: dataset.id, rawText: dataset.raw_pgn, subject: dataset.subject, importMetadata: dataset.import_metadata } });
            }
            bodyObject(req.body);
            const { datasetId, operationId, snapshot: input } = req.body;
            if (!UUID.test(datasetId || '') || !UUID.test(operationId || '')) throw invalid('Invalid dataset or operation ID.');
            const { data: datasetRow, error } = await db.from('insight_datasets').select('id, raw_pgn, subject, import_metadata').eq('user_id', owner).eq('id', datasetId).maybeSingle();
            if (error) throw error;
            if (!datasetRow) return res.status(404).json({ code: 'DATASET_NOT_FOUND' });
            const { dataset } = validateDataset({ rawText: datasetRow.raw_pgn, subject: datasetRow.subject, importMetadata: datasetRow.import_metadata });
            const snapshot = validateSnapshot(input, dataset);
            const { data, error: saveError } = await db.rpc('save_insight_report', { p_user_id: owner, p_dataset_id: datasetId,
                p_operation_id: operationId, p_payload_hash: hash({ datasetId, snapshot }), p_snapshot: snapshot, p_summary: summary(snapshot) });
            if (saveError) throw saveError;
            if (data?.status === 'conflict') return res.status(409).json({ code: 'IDEMPOTENCY_CONFLICT', error: 'This operation already saved a different report. Start a new analysis.' });
            if (data?.status === 'limit') return res.status(409).json({ code: 'HISTORY_LIMIT', error: 'The 1000 report limit has been reached.' });
            if (!UUID.test(data?.reportId || '') || !data.createdAt) throw new Error('Invalid persistence response');
            return res.status(data.status === 'created' ? 201 : 200).json({ ...envelope, reportId: data.reportId, createdAt: data.createdAt, status: data.status });
        } catch (error) {
            if (error.status) return res.status(error.status).json({ code: error.code, error: error.message });
            // Deliberately omit tokens, PGNs, FENs and database error details.
            dependencies.log?.warn?.('insights_service_unavailable');
            return res.status(503).json({ code: 'INSIGHTS_UNAVAILABLE', error: 'Report service unavailable. Your report has not been saved. You can retry or export it.' });
        }
    };
}
