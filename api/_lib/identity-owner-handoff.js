import crypto from 'node:crypto';

const VERSION = 'v1';
const RECEIPT_VERSION = 'r1';
const COOKIE_NAME = '__Host-caissa_sec005_owner_handoff';
const DEFAULT_TTL_MS = 10 * 60 * 1000;
const MAX_TTL_MS = 15 * 60 * 1000;
const MAX_STATE_BYTES = 4096;
const MAX_SUBJECT_BYTES = 512;
const MAX_RETURN_TO_BYTES = 2048;

function requirePepper(env) {
    const pepper = env.CAISSA_IDENTITY_MIGRATION_THROTTLE_PEPPER;
    if (typeof pepper !== 'string' || Buffer.byteLength(pepper, 'utf8') < 32) {
        throw new Error('HANDOFF_CONFIG_INVALID');
    }
    return pepper;
}

function deriveKey(env, purpose) {
    return crypto.createHmac('sha256', requirePepper(env))
        .update(`caissa-sec005-owner-handoff\0${purpose}`, 'utf8')
        .digest();
}

function sha256Base64Url(value) {
    return crypto.createHash('sha256').update(String(value), 'utf8').digest('base64url');
}

function decodeCanonicalBase64Url(value) {
    const decoded = Buffer.from(value, 'base64url');
    if (!decoded.length || decoded.toString('base64url') !== value) throw new Error('HANDOFF_ENCODING_INVALID');
    return decoded;
}

function strictOrigin(value, name) {
    let parsed;
    try { parsed = new URL(String(value || '')); } catch { throw new Error(`${name}_INVALID`); }
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password
        || parsed.pathname !== '/' || parsed.search || parsed.hash) {
        throw new Error(`${name}_INVALID`);
    }
    return parsed.origin;
}

export function ownerHandoffOrigins(env = process.env) {
    const production = strictOrigin(env.CAISSA_APP_ORIGIN || 'https://www.caissa-chess.org', 'PRODUCTION_ORIGIN');
    const legacy = strictOrigin(env.CAISSA_SEC005_LEGACY_HANDOFF_ORIGIN, 'LEGACY_ORIGIN');
    if (production === legacy) throw new Error('HANDOFF_ORIGINS_NOT_DISTINCT');
    return Object.freeze({ production, legacy });
}

export function safeOwnerReturnTo(value, productionOrigin) {
    const fallback = '/play';
    if (typeof value !== 'string' || !value || Buffer.byteLength(value, 'utf8') > MAX_RETURN_TO_BYTES
        || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return fallback;
    try {
        const parsed = new URL(value, `${productionOrigin}/`);
        if (parsed.origin !== productionOrigin || !parsed.pathname.startsWith('/') || parsed.username || parsed.password) {
            return fallback;
        }
        let decodedPath;
        try { decodedPath = decodeURIComponent(parsed.pathname); } catch { return fallback; }
        if (decodedPath.includes('\\') || decodedPath.startsWith('//')) return fallback;
        return `${parsed.pathname}${parsed.search}`;
    } catch {
        return fallback;
    }
}

export function issueOwnerHandoff(
    productionSubject,
    env = process.env,
    now = Date.now(),
    ttlMs = DEFAULT_TTL_MS,
    returnTo = '/play'
) {
    if (typeof productionSubject !== 'string' || !productionSubject
        || Buffer.byteLength(productionSubject, 'utf8') > MAX_SUBJECT_BYTES) {
        throw new Error('PRODUCTION_SUBJECT_INVALID');
    }
    if (!Number.isSafeInteger(now) || !Number.isSafeInteger(ttlMs)
        || ttlMs <= 0 || ttlMs > MAX_TTL_MS) {
        throw new Error('HANDOFF_EXPIRY_INVALID');
    }

    const { production } = ownerHandoffOrigins(env);
    const payload = Buffer.from(JSON.stringify({
        v: 1,
        nonce: crypto.randomBytes(16).toString('base64url'),
        productionSubject,
        returnTo: safeOwnerReturnTo(returnTo, production),
        issuedAt: now,
        expiresAt: now + ttlMs
    }), 'utf8');
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', deriveKey(env, 'state-encryption'), iv);
    cipher.setAAD(Buffer.from(VERSION, 'utf8'));
    const ciphertext = Buffer.concat([cipher.update(payload), cipher.final()]);
    const state = [VERSION, iv.toString('base64url'), ciphertext.toString('base64url'), cipher.getAuthTag().toString('base64url')].join('.');
    if (Buffer.byteLength(state, 'utf8') > MAX_STATE_BYTES) throw new Error('HANDOFF_STATE_TOO_LARGE');
    return { state, expiresAt: new Date(now + ttlMs).toISOString() };
}

export function verifyOwnerHandoff(state, env = process.env, now = Date.now()) {
    if (typeof state !== 'string' || !state
        || Buffer.byteLength(state, 'utf8') > MAX_STATE_BYTES) {
        return { ok: false };
    }
    const parts = state.split('.');
    if (parts.length !== 4 || parts[0] !== VERSION
        || parts.slice(1).some((part) => !/^[A-Za-z0-9_-]+$/.test(part))) {
        return { ok: false };
    }
    try {
        const iv = decodeCanonicalBase64Url(parts[1]);
        const ciphertext = decodeCanonicalBase64Url(parts[2]);
        const tag = decodeCanonicalBase64Url(parts[3]);
        if (iv.length !== 12 || tag.length !== 16 || ciphertext.length < 1) return { ok: false };
        const decipher = crypto.createDecipheriv('aes-256-gcm', deriveKey(env, 'state-encryption'), iv);
        decipher.setAAD(Buffer.from(VERSION, 'utf8'));
        decipher.setAuthTag(tag);
        const parsed = JSON.parse(Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8'));
        const keys = Object.keys(parsed || {}).sort();
        if (JSON.stringify(keys) !== JSON.stringify(['expiresAt', 'issuedAt', 'nonce', 'productionSubject', 'returnTo', 'v'])) {
            return { ok: false };
        }
        if (parsed.v !== 1 || typeof parsed.nonce !== 'string'
            || !/^[A-Za-z0-9_-]{22}$/.test(parsed.nonce)
            || typeof parsed.productionSubject !== 'string' || !parsed.productionSubject
            || Buffer.byteLength(parsed.productionSubject, 'utf8') > MAX_SUBJECT_BYTES
            || parsed.returnTo !== safeOwnerReturnTo(parsed.returnTo, ownerHandoffOrigins(env).production)
            || !Number.isSafeInteger(parsed.issuedAt) || !Number.isSafeInteger(parsed.expiresAt)
            || parsed.expiresAt <= parsed.issuedAt || parsed.expiresAt - parsed.issuedAt > MAX_TTL_MS
            || now < parsed.issuedAt - 5000 || now >= parsed.expiresAt) {
            return { ok: false };
        }
        return {
            ok: true,
            productionSubject: parsed.productionSubject,
            returnTo: parsed.returnTo,
            issuedAt: parsed.issuedAt,
            expiresAt: parsed.expiresAt
        };
    } catch {
        return { ok: false };
    }
}

export function deriveOwnerChallengeToken(state, env = process.env) {
    if (typeof state !== 'string' || !state || Buffer.byteLength(state, 'utf8') > MAX_STATE_BYTES) {
        throw new Error('HANDOFF_STATE_INVALID');
    }
    return crypto.createHmac('sha256', deriveKey(env, 'challenge-token'))
        .update(state, 'utf8')
        .digest('base64url');
}

export function issueOwnerProofReceipt(
    handoffState,
    legacySubject,
    env = process.env,
    now = Date.now()
) {
    const state = verifyOwnerHandoff(handoffState, env, now);
    if (!state.ok || typeof legacySubject !== 'string' || !legacySubject
        || Buffer.byteLength(legacySubject, 'utf8') > MAX_SUBJECT_BYTES) {
        throw new Error('PROOF_RECEIPT_INPUT_INVALID');
    }

    const payload = Buffer.from(JSON.stringify({
        v: 1,
        stateHash: sha256Base64Url(handoffState),
        legacySubjectHash: sha256Base64Url(legacySubject),
        issuedAt: now,
        expiresAt: state.expiresAt
    }), 'utf8');
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', deriveKey(env, 'proof-receipt-encryption'), iv);
    cipher.setAAD(Buffer.from(RECEIPT_VERSION, 'utf8'));
    const ciphertext = Buffer.concat([cipher.update(payload), cipher.final()]);
    const receipt = [
        RECEIPT_VERSION,
        iv.toString('base64url'),
        ciphertext.toString('base64url'),
        cipher.getAuthTag().toString('base64url')
    ].join('.');
    if (Buffer.byteLength(receipt, 'utf8') > MAX_STATE_BYTES) throw new Error('PROOF_RECEIPT_TOO_LARGE');
    return receipt;
}

export function verifyOwnerProofReceipt(receipt, handoffState, env = process.env, now = Date.now()) {
    if (typeof receipt !== 'string' || !receipt
        || Buffer.byteLength(receipt, 'utf8') > MAX_STATE_BYTES) return { ok: false };
    const state = verifyOwnerHandoff(handoffState, env, now);
    if (!state.ok) return { ok: false };
    const parts = receipt.split('.');
    if (parts.length !== 4 || parts[0] !== RECEIPT_VERSION
        || parts.slice(1).some((part) => !/^[A-Za-z0-9_-]+$/.test(part))) return { ok: false };

    try {
        const iv = decodeCanonicalBase64Url(parts[1]);
        const ciphertext = decodeCanonicalBase64Url(parts[2]);
        const tag = decodeCanonicalBase64Url(parts[3]);
        if (iv.length !== 12 || tag.length !== 16 || ciphertext.length < 1) return { ok: false };
        const decipher = crypto.createDecipheriv('aes-256-gcm', deriveKey(env, 'proof-receipt-encryption'), iv);
        decipher.setAAD(Buffer.from(RECEIPT_VERSION, 'utf8'));
        decipher.setAuthTag(tag);
        const parsed = JSON.parse(Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8'));
        const keys = Object.keys(parsed || {}).sort();
        if (JSON.stringify(keys) !== JSON.stringify(['expiresAt', 'issuedAt', 'legacySubjectHash', 'stateHash', 'v'])
            || parsed.v !== 1 || !/^[A-Za-z0-9_-]{43}$/.test(parsed.stateHash || '')
            || !/^[A-Za-z0-9_-]{43}$/.test(parsed.legacySubjectHash || '')
            || !Number.isSafeInteger(parsed.issuedAt) || !Number.isSafeInteger(parsed.expiresAt)
            || parsed.issuedAt < state.issuedAt || parsed.expiresAt !== state.expiresAt
            || now < parsed.issuedAt - 5000 || now >= parsed.expiresAt
            || !sameSubject(parsed.stateHash, sha256Base64Url(handoffState))) {
            return { ok: false };
        }
        return { ok: true, issuedAt: parsed.issuedAt, expiresAt: parsed.expiresAt };
    } catch {
        return { ok: false };
    }
}

export function ownerHandoffCookie(state, maxAgeSeconds = DEFAULT_TTL_MS / 1000) {
    if (typeof state !== 'string' || !state || !Number.isSafeInteger(maxAgeSeconds)
        || maxAgeSeconds <= 0 || maxAgeSeconds > MAX_TTL_MS / 1000) {
        throw new Error('HANDOFF_COOKIE_INVALID');
    }
    return `${COOKIE_NAME}=${state}; Max-Age=${maxAgeSeconds}; Path=/; Secure; HttpOnly; SameSite=Strict`;
}

export function clearOwnerHandoffCookie() {
    return `${COOKIE_NAME}=; Max-Age=0; Path=/; Secure; HttpOnly; SameSite=Strict`;
}

export function ownerHandoffStateFromCookie(req) {
    const header = String(req?.headers?.cookie || req?.headers?.Cookie || '');
    for (const item of header.split(';')) {
        const [name, ...rest] = item.trim().split('=');
        if (name !== COOKIE_NAME) continue;
        const value = rest.join('=');
        return value.length <= MAX_STATE_BYTES ? value : '';
    }
    return '';
}

export function sameSubject(left, right) {
    if (typeof left !== 'string' || typeof right !== 'string') return false;
    const a = crypto.createHash('sha256').update(left, 'utf8').digest();
    const b = crypto.createHash('sha256').update(right, 'utf8').digest();
    return crypto.timingSafeEqual(a, b);
}

export function setOwnerHandoffCors(req, res, methods, allowedOrigin) {
    const origin = String(req?.headers?.origin || '');
    if (!origin || origin !== allowedOrigin) {
        res.status(403).json({ error: 'Request rejected' });
        return false;
    }
    const requestedMethod = String(req.headers?.['access-control-request-method'] || '').toUpperCase();
    const requestedHeaders = String(req.headers?.['access-control-request-headers'] || '')
        .toLowerCase().split(',').map((value) => value.trim()).filter(Boolean);
    if (req.method === 'OPTIONS' && ((requestedMethod && !methods.includes(requestedMethod))
        || requestedHeaders.some((value) => !['authorization', 'content-type'].includes(value)))) {
        res.status(403).json({ error: 'Request rejected' });
        return false;
    }
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', [...new Set([...methods, 'OPTIONS'])].join(', '));
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.setHeader('Vary', 'Origin');
    return true;
}

export function fixedBearerToken(req) {
    const value = req?.headers?.authorization || req?.headers?.Authorization;
    if (typeof value !== 'string' || !value.startsWith('Bearer ')
        || Buffer.byteLength(value, 'utf8') > 16 * 1024) return '';
    return value.slice(7).trim();
}

export const identityOwnerHandoffInternals = Object.freeze({
    cookieName: COOKIE_NAME,
    defaultTtlMs: DEFAULT_TTL_MS,
    maxTtlMs: MAX_TTL_MS,
    maxStateBytes: MAX_STATE_BYTES,
    maxReturnToBytes: MAX_RETURN_TO_BYTES,
    receiptVersion: RECEIPT_VERSION
});
