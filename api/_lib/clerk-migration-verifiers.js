import crypto from 'node:crypto';
import { verifyToken as clerkVerifyToken } from '@clerk/backend';

const ALGORITHM = 'RS256';
const MAX_TOKEN_BYTES = 16 * 1024;

function decodeProtectedHeader(token) {
    if (typeof token !== 'string' || Buffer.byteLength(token, 'utf8') > MAX_TOKEN_BYTES) {
        throw new Error('TOKEN_INVALID');
    }
    const parts = token.split('.');
    if (parts.length !== 3 || parts.some((part) => !part)) throw new Error('TOKEN_INVALID');
    let header;
    try {
        header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    } catch {
        throw new Error('TOKEN_INVALID');
    }
    if (!header || header.alg !== ALGORITHM || header.typ !== 'JWT'
        || typeof header.kid !== 'string' || !header.kid || header.kid.length > 256
        || 'jku' in header || 'jwk' in header || 'x5u' in header) {
        throw new Error('TOKEN_INVALID');
    }
    return header;
}

function parseJson(value, fallback) {
    if (!value) return fallback;
    try { return JSON.parse(value); } catch { throw new Error('VERIFIER_CONFIG_INVALID'); }
}

function loadAuthority(env, name) {
    const prefix = name === 'legacy' ? 'CAISSA_CLERK_LEGACY' : 'CAISSA_CLERK_PRODUCTION';
    const issuer = env[`${prefix}_ISSUER`];
    const keys = parseJson(env[`${prefix}_JWT_KEYS_JSON`], null);
    const audience = env[`${prefix}_AUDIENCE`] || undefined;
    const authorizedParties = parseJson(env[`${prefix}_AUTHORIZED_PARTIES_JSON`], undefined);
    if (typeof issuer !== 'string' || !issuer.startsWith('https://') || !Array.isArray(keys) || keys.length < 1) {
        throw new Error('VERIFIER_CONFIG_INVALID');
    }
    if (authorizedParties !== undefined && (!Array.isArray(authorizedParties)
        || authorizedParties.some((party) => typeof party !== 'string' || !party))) {
        throw new Error('VERIFIER_CONFIG_INVALID');
    }
    const byKid = new Map();
    for (const key of keys) {
        if (!key || typeof key.kid !== 'string' || !key.kid
            || typeof key.pem !== 'string' || !key.pem.includes('PUBLIC KEY') || byKid.has(key.kid)) {
            throw new Error('VERIFIER_CONFIG_INVALID');
        }
        byKid.set(key.kid, key.pem);
    }
    return Object.freeze({ name, issuer, byKid, audience, authorizedParties });
}

export function loadMigrationAuthorities(env = process.env) {
    const legacy = loadAuthority(env, 'legacy');
    const production = loadAuthority(env, 'production');
    const legacyKeys = new Set([...legacy.byKid.values()].map((key) => crypto.createHash('sha256').update(key).digest('hex')));
    const keyOverlap = [...production.byKid.values()].some((key) => legacyKeys.has(crypto.createHash('sha256').update(key).digest('hex')));
    if (legacy.issuer === production.issuer || keyOverlap) throw new Error('VERIFIER_AUTHORITIES_NOT_DISTINCT');
    return Object.freeze({ legacy, production });
}

export async function verifyMigrationToken(token, authority, verifyToken = clerkVerifyToken) {
    try {
        const header = decodeProtectedHeader(token);
        const jwtKey = authority.byKid.get(header.kid);
        if (!jwtKey) return { ok: false };
        const options = { jwtKey, clockSkewInMs: 5000, headerType: 'JWT' };
        if (authority.audience) options.audience = authority.audience;
        if (authority.authorizedParties) options.authorizedParties = authority.authorizedParties;
        const payload = await verifyToken(token, options);
        if (!payload || payload.iss !== authority.issuer || typeof payload.sub !== 'string' || !payload.sub) {
            return { ok: false };
        }
        return { ok: true, subject: payload.sub };
    } catch {
        return { ok: false };
    }
}

export async function verifyDualMigrationTokens({ legacyToken, productionToken, env = process.env, verifyToken }) {
    let authorities;
    try { authorities = loadMigrationAuthorities(env); } catch { return { ok: false }; }
    const [legacy, production] = await Promise.all([
        verifyMigrationToken(legacyToken, authorities.legacy, verifyToken),
        verifyMigrationToken(productionToken, authorities.production, verifyToken)
    ]);
    if (!legacy.ok || !production.ok || legacy.subject === production.subject) return { ok: false };
    return { ok: true, legacySubject: legacy.subject, productionSubject: production.subject };
}

export function getFixedMigrationAuthority(name, env = process.env) {
    try { return loadMigrationAuthorities(env)[name]; } catch { return null; }
}

export const clerkMigrationVerifierInternals = Object.freeze({ decodeProtectedHeader, algorithm: ALGORITHM });
