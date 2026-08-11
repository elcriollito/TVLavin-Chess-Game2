import crypto from 'node:crypto';
import { getClientIP } from './rate-limit.js';

const MAX_BODY_BYTES = 16 * 1024;

export function prepareSensitiveJsonRoute(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    if (req.method !== 'POST') return { ok: false, status: 405, error: 'Request rejected' };
    const contentType = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
    if (contentType !== 'application/json') return { ok: false, status: 415, error: 'Request rejected' };
    const length = Number(req.headers['content-length'] || 0);
    if (!Number.isFinite(length) || length < 0 || length > MAX_BODY_BYTES) {
        return { ok: false, status: 413, error: 'Request rejected' };
    }
    let actual;
    try { actual = Buffer.byteLength(JSON.stringify(req.body ?? {}), 'utf8'); } catch {
        return { ok: false, status: 400, error: 'Request rejected' };
    }
    if (actual > MAX_BODY_BYTES) return { ok: false, status: 413, error: 'Request rejected' };
    return { ok: true };
}

export function fixedTokenHeader(req, name) {
    const value = req.headers[name];
    return typeof value === 'string' && value.length <= 16 * 1024 ? value.trim() : '';
}

export async function consumePersistentMigrationThrottle(supabase, req, route, env = process.env) {
    const pepper = env.CAISSA_IDENTITY_MIGRATION_THROTTLE_PEPPER;
    if (typeof pepper !== 'string' || pepper.length < 32) return { ok: false, unavailable: true };
    const scope = crypto.createHash('sha256').update(`${route}\0${getClientIP(req)}\0${pepper}`).digest('hex');
    const { data, error } = await supabase.rpc('consume_identity_migration_throttle', {
        p_scope_hash: scope,
        p_limit: 5,
        p_window_seconds: 600
    });
    if (error) return { ok: false, unavailable: true };
    const result = data?.[0] || data;
    return { ok: result?.allowed === true, retryAfter: result?.retry_after_seconds || 0 };
}

export function rejectSensitiveRoute(res, guard) {
    return res.status(guard.status).json({ error: guard.error });
}
