import crypto from 'node:crypto';

export const REGISTRATION_AGE_POLICY = Object.freeze({
  version: 'caissa-account-16-plus-v1',
  minimumAge: 16,
  method: 'neutral-birth-month-year',
  eligibleTtlSeconds: 10 * 60,
  blockedTtlSeconds: 24 * 60 * 60,
  cookieName: '__Host-caissa_registration_age'
});

export const REGISTRATION_AGE_REASONS = Object.freeze({
  ELIGIBLE: 'eligible',
  NOT_ELIGIBLE: 'not_eligible',
  ANSWER_REQUIRED: 'answer_required',
  INVALID_ANSWER: 'invalid_answer',
  THRESHOLD_MONTH: 'threshold_month'
});

function integer(value) {
  if (typeof value === 'number' && Number.isSafeInteger(value)) return value;
  if (typeof value === 'string' && /^\d{1,4}$/.test(value)) return Number(value);
  return null;
}

/**
 * Evaluate month and year transiently. A day of birth is intentionally not
 * collected. Someone who may turn 16 during the current month is held until
 * the following month, avoiding an invented birth day.
 */
export function evaluateNeutralAge({ birthMonth, birthYear, now = new Date() } = {}) {
  const month = integer(birthMonth);
  const year = integer(birthYear);
  if (birthMonth === undefined || birthMonth === null || birthMonth === ''
      || birthYear === undefined || birthYear === null || birthYear === '') {
    return Object.freeze({ eligible: false, reason: REGISTRATION_AGE_REASONS.ANSWER_REQUIRED });
  }
  const currentYear = now.getUTCFullYear();
  const currentMonth = now.getUTCMonth() + 1;
  if (!Number.isInteger(month) || month < 1 || month > 12
      || !Number.isInteger(year) || year < currentYear - 120 || year > currentYear) {
    return Object.freeze({ eligible: false, reason: REGISTRATION_AGE_REASONS.INVALID_ANSWER });
  }
  const thresholdYear = currentYear - REGISTRATION_AGE_POLICY.minimumAge;
  if (year < thresholdYear || (year === thresholdYear && month < currentMonth)) {
    return Object.freeze({ eligible: true, reason: REGISTRATION_AGE_REASONS.ELIGIBLE });
  }
  if (year === thresholdYear && month === currentMonth) {
    return Object.freeze({ eligible: false, reason: REGISTRATION_AGE_REASONS.THRESHOLD_MONTH });
  }
  return Object.freeze({ eligible: false, reason: REGISTRATION_AGE_REASONS.NOT_ELIGIBLE });
}

export function registrationReleaseReady(env = process.env) {
  return env.CAISSA_REGISTRATION_RELEASE === 'approved'
    && env.CAISSA_CLERK_RESTRICTED_INVITATIONS === 'confirmed'
    && env.CAISSA_REGISTRATION_DURABLE_LIMITER === 'confirmed'
    && typeof env.CAISSA_REGISTRATION_GATE_SECRET === 'string'
    && Buffer.byteLength(env.CAISSA_REGISTRATION_GATE_SECRET, 'utf8') >= 32
    && typeof env.CLERK_SECRET_KEY === 'string'
    && env.CLERK_SECRET_KEY.startsWith('sk_')
    && Boolean(env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL)
    && Boolean(env.SUPABASE_SERVICE_ROLE_KEY);
}

function secret(env) {
  const value = String(env.CAISSA_REGISTRATION_GATE_SECRET || '');
  if (Buffer.byteLength(value, 'utf8') < 32) throw new Error('REGISTRATION_GATE_UNAVAILABLE');
  return value;
}

function encode(value) {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

function signature(value, env) {
  return crypto.createHmac('sha256', secret(env)).update(value).digest('base64url');
}

export function issueRegistrationAgeState({ eligible, env = process.env, now = Date.now, nonce } = {}) {
  const issuedAt = now();
  const ttl = eligible ? REGISTRATION_AGE_POLICY.eligibleTtlSeconds : REGISTRATION_AGE_POLICY.blockedTtlSeconds;
  const payload = encode({
    v: REGISTRATION_AGE_POLICY.version,
    s: eligible ? 'eligible' : 'blocked',
    iat: issuedAt,
    exp: issuedAt + ttl * 1000,
    n: nonce || crypto.randomBytes(24).toString('base64url')
  });
  return Object.freeze({ value: `${payload}.${signature(payload, env)}`, maxAge: ttl });
}

export function verifyRegistrationAgeState(value, { env = process.env, now = Date.now } = {}) {
  try {
    if (typeof value !== 'string' || value.length > 2048) return Object.freeze({ ok: false });
    const parts = value.split('.');
    if (parts.length !== 2) return Object.freeze({ ok: false });
    const expected = Buffer.from(signature(parts[0], env));
    const actual = Buffer.from(parts[1]);
    if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) return Object.freeze({ ok: false });
    const payload = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    if (Object.keys(payload).sort().join(',') !== 'exp,iat,n,s,v'
        || payload.v !== REGISTRATION_AGE_POLICY.version
        || !['eligible', 'blocked'].includes(payload.s)
        || !Number.isSafeInteger(payload.iat) || !Number.isSafeInteger(payload.exp)
        || payload.iat > now() + 30_000 || payload.exp <= now()
        || typeof payload.n !== 'string' || !/^[A-Za-z0-9_-]{32}$/.test(payload.n)) {
      return Object.freeze({ ok: false });
    }
    return Object.freeze({ ok: true, eligible: payload.s === 'eligible', nonce: payload.n, issuedAt: payload.iat, expiresAt: payload.exp });
  } catch {
    return Object.freeze({ ok: false });
  }
}

export function registrationAgeCookie(value, maxAge) {
  return `${REGISTRATION_AGE_POLICY.cookieName}=${encodeURIComponent(value)}; Max-Age=${maxAge}; Path=/; Secure; HttpOnly; SameSite=Strict`;
}

export function clearRegistrationAgeCookie() {
  return `${REGISTRATION_AGE_POLICY.cookieName}=; Max-Age=0; Path=/; Secure; HttpOnly; SameSite=Strict`;
}

export function registrationAgeStateFromRequest(req) {
  const cookie = String(req?.headers?.cookie || req?.headers?.Cookie || '');
  const prefix = `${REGISTRATION_AGE_POLICY.cookieName}=`;
  const pair = cookie.split(';').map(value => value.trim()).find(value => value.startsWith(prefix));
  if (!pair) return '';
  try { return decodeURIComponent(pair.slice(prefix.length)); } catch { return ''; }
}

export function nonceDigest(nonce) {
  return crypto.createHash('sha256').update(`${REGISTRATION_AGE_POLICY.version}:${nonce}`).digest('hex');
}

export function registrationAbuseDigest(kind, value, env = process.env) {
  if (!/^[a-z-]{3,40}$/.test(String(kind || ''))) throw new Error('REGISTRATION_GATE_UNAVAILABLE');
  return crypto.createHmac('sha256', secret(env))
    .update(`abuse:${kind}:${String(value || '')}`)
    .digest('hex');
}
