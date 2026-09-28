import { getSupabase } from '../_lib/supabase.js';

const MAX_RETRY_SECONDS = 86_400;

export class TablebaseLimiterUnavailable extends Error {
    constructor(message = 'Shared tablebase limiter unavailable') { super(message); this.code = 'LIMITER_UNAVAILABLE'; }
}

export function sharedLimiterConfigured(env = process.env) {
    return Boolean((env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL) && env.SUPABASE_SERVICE_ROLE_KEY);
}

export function createSharedTablebaseLimiter(db = getSupabase()) {
    return {
        async claim() {
            let response;
            try { response = await db.rpc('claim_caissa_tablebase_provider'); }
            catch { throw new TablebaseLimiterUnavailable(); }
            const { data, error } = response || {};
            const row = Array.isArray(data) ? data[0] : data;
            if (error || !row || typeof row.allowed !== 'boolean' ||
                !Number.isInteger(row.retry_after_seconds) || row.retry_after_seconds < 0 ||
                (row.allowed && !/^[0-9a-f-]{36}$/i.test(row.lease_id || ''))) {
                throw new TablebaseLimiterUnavailable();
            }
            return { allowed: row.allowed, code: row.code,
                leaseId: row.allowed ? row.lease_id : null,
                retryAfter: Math.min(MAX_RETRY_SECONDS, Math.max(1, row.retry_after_seconds)) };
        },
        async release(leaseId, retryAfter = 0) {
            if (!/^[0-9a-f-]{36}$/i.test(leaseId || '')) throw new TablebaseLimiterUnavailable();
            let response;
            try { response = await db.rpc('release_caissa_tablebase_provider', {
                p_lease_id: leaseId,
                p_retry_after_seconds: Math.min(MAX_RETRY_SECONDS, Math.max(0, Math.ceil(retryAfter)))
            }); } catch { throw new TablebaseLimiterUnavailable(); }
            if (response?.error || response?.data !== true) throw new TablebaseLimiterUnavailable();
        }
    };
}
