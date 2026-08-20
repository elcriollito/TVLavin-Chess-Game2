const INTERNAL_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export const MENTOR_CANARY_ALLOWLIST_MAX_ENTRIES = 10;
export const MENTOR_CANARY_ALLOWLIST_MAX_BYTES = 512;

export function parseMentorCanaryAllowlist(value) {
  if (typeof value !== 'string' || value.length === 0 || Buffer.byteLength(value, 'utf8') > MENTOR_CANARY_ALLOWLIST_MAX_BYTES) {
    return { ok: false, code: 'CANARY_ALLOWLIST_INVALID' };
  }
  const entries = value.split(',');
  if (entries.length < 1 || entries.length > MENTOR_CANARY_ALLOWLIST_MAX_ENTRIES
      || entries.some(entry => entry !== entry.trim() || !INTERNAL_UUID.test(entry))) {
    return { ok: false, code: 'CANARY_ALLOWLIST_INVALID' };
  }
  const unique = new Set(entries);
  if (unique.size !== entries.length) return { ok: false, code: 'CANARY_ALLOWLIST_INVALID' };
  return { ok: true, ids: unique, count: unique.size };
}

export async function evaluateMentorReservationEligibility({ db, env, clerkId, byo }) {
  if (byo || env.CAISSA_MENTOR_RESERVATIONS_ENABLED !== 'true') return { ok: true, enabled: false };
  const allowlist = parseMentorCanaryAllowlist(env.CAISSA_MENTOR_RESERVATION_CANARY_USER_IDS);
  if (!allowlist.ok || !db || typeof clerkId !== 'string' || clerkId.length < 1 || clerkId.length > 255) {
    return { ok: false, enabled: false, code: 'CANARY_CONFIGURATION_INVALID' };
  }
  const { data, error } = await db.from('users').select('id').eq('clerk_id', clerkId).maybeSingle();
  if (error || !data?.id || !INTERNAL_UUID.test(data.id)) return { ok: false, enabled: false, code: 'CANARY_ELIGIBILITY_UNAVAILABLE' };
  return { ok: true, enabled: allowlist.ids.has(data.id), allowlistCount: allowlist.count };
}
