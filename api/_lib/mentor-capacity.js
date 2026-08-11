import crypto from 'node:crypto';

export const MENTOR_CAPACITY_POLICY = Object.freeze({ minute: 6, hour: 30, day: 100, globalHour: 1000, concurrent: 2, leaseSeconds: 30 });

function scopeHash(secret, kind, value) {
  return crypto.createHmac('sha256', secret).update(`${kind}:${value}`).digest('hex');
}

export async function claimMentorCapacity(db, userId, secret, policy = MENTOR_CAPACITY_POLICY) {
  if (!db || typeof secret !== 'string' || secret.length < 32 || !userId) return { ok: false, unavailable: true };
  try {
    const { data, error } = await db.rpc('claim_mentor_capacity', {
      p_scope_hash: scopeHash(secret, 'user', userId),
      p_global_scope_hash: scopeHash(secret, 'global', 'mentor'),
      p_minute_limit: policy.minute, p_hour_limit: policy.hour, p_daily_limit: policy.day,
      p_global_hour_limit: policy.globalHour, p_concurrency_limit: policy.concurrent,
      p_lease_seconds: policy.leaseSeconds
    });
    if (error) return { ok: false, unavailable: true };
    const result = data?.[0] || data;
    return result?.allowed
      ? { ok: true, leaseId: result.lease_id, remaining: result.remaining }
      : { ok: false, unavailable: false, retryAfter: Math.max(1, result?.retry_after_seconds || 1), code: result?.code || 'RATE_LIMITED' };
  } catch { return { ok: false, unavailable: true }; }
}

export async function releaseMentorCapacity(db, leaseId, userId, secret) {
  if (!db || !leaseId || !userId || typeof secret !== 'string') return false;
  try {
    const { error } = await db.rpc('release_mentor_capacity', { p_lease_id: leaseId, p_scope_hash: scopeHash(secret, 'user', userId) });
    return !error;
  } catch { return false; }
}
