/**
 * Shared Clerk token verification for Vercel serverless functions.
 * Reads a Clerk token from the Authorization header. Protected browser
 * handlers may explicitly opt into the standard Clerk __session cookie too.
 */

import { verifyToken } from '@clerk/backend';

const INVALID_TOKEN_REASONS = new Set([
    'token-expired', 'token-invalid', 'token-invalid-algorithm',
    'token-invalid-authorized-parties', 'token-invalid-signature',
    'token-not-active-yet', 'token-iat-in-the-future', 'token-verification-failed',
    'jwk-kid-mismatch'
]);

const failure = (status, code) => ({
    authenticated: false,
    ok: false,
    status,
    code,
    error: status === 503 ? 'Authentication service unavailable.' : 'Authentication required.'
});

/**
 * Verify the Clerk JWT from the request Authorization header.
 * @param {Object} req - Vercel request object
 * @returns {Object} { authenticated, userId, email } or { authenticated: false, error }
 */
export function createAuthenticateRequest(dependencies = {}) {
  const verify = dependencies.verifyToken || verifyToken;
  const env = dependencies.env || process.env;
  const log = dependencies.log || (message => console.warn(message));
  const authorizedParties = clerkAuthorizedParties(env);
  const expectedIssuer = clerkExpectedIssuer(env);
  const authority = clerkAuthority(env);
  const requiresBoundAuthority = env.CAISSA_IDENTITY_OWNERSHIP_MODE === 'enforced';

  const allowSessionCookie = dependencies.allowSessionCookie === true;

  return async function authenticateRequest(req) {
    const authHeader = req.headers['authorization'] || req.headers['Authorization'];
    let token = typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
        ? authHeader.slice(7).trim() : '';
    if (!token && allowSessionCookie) {
        const cookieHeader = String(req.headers?.cookie || req.headers?.Cookie || '');
        const session = cookieHeader.split(';').map(value => value.trim()).find(value => value.startsWith('__session='));
        if (session) {
            try { token = decodeURIComponent(session.slice('__session='.length)); }
            catch (_) { return failure(401, 'INVALID_TOKEN'); }
        }
    }
    if (!token) return failure(401, 'AUTH_REQUIRED');

    if (!env.CLERK_SECRET_KEY && !env.CLERK_JWT_KEY) {
        log('auth_configuration_unavailable');
        return failure(503, 'AUTH_SERVICE_UNAVAILABLE');
    }
    if (requiresBoundAuthority && (!authority || !expectedIssuer)) {
        log('auth_authority_configuration_unavailable');
        return failure(503, 'AUTH_SERVICE_UNAVAILABLE');
    }

    try {
        const payload = await verify(token, {
            ...(env.CLERK_JWT_KEY
                ? { jwtKey: env.CLERK_JWT_KEY }
                : { secretKey: env.CLERK_SECRET_KEY }),
            authorizedParties
        });

        if (!payload?.sub || (expectedIssuer && normalizeIssuer(payload.iss) !== expectedIssuer)) {
            return failure(401, 'INVALID_TOKEN');
        }

        return {
            authenticated: true,
            ok: true,
            userId: payload.sub,
            email: payload.email || null,
            authority,
            issuer: payload.iss || null,
            sessionId: payload.sid || null,
            issuedAt: Number.isFinite(payload.iat) ? payload.iat : null,
            tokenId: typeof payload.jti === 'string' ? payload.jti : null,
            factorVerificationAge: Array.isArray(payload.fva)
                ? payload.fva.slice(0, 2).map(value => Number.isFinite(value) ? value : null)
                : null
        };
    } catch (err) {
        if (INVALID_TOKEN_REASONS.has(err?.reason) || malformedCompactJwt(token)) {
            return failure(401, 'INVALID_TOKEN');
        }
        const diagnostic = [err?.name, err?.reason || err?.code].filter(Boolean).join(':') || 'unknown';
        log(`auth_service_unavailable:${diagnostic}`);
        return failure(503, 'AUTH_SERVICE_UNAVAILABLE');
    }
  };
}

function malformedCompactJwt(token) {
    const parts = String(token || '').split('.');
    if (parts.length !== 3 || parts.some(part => !/^[A-Za-z0-9_-]+$/u.test(part))) return true;
    try {
        const [headerPart, payloadPart, signaturePart] = parts;
        const decode = part => {
            const bytes = Buffer.from(part, 'base64url');
            if (!bytes.length || bytes.toString('base64url') !== part) throw new SyntaxError('Non-canonical JWT segment');
            return bytes;
        };
        const header = JSON.parse(decode(headerPart).toString('utf8'));
        const payload = JSON.parse(decode(payloadPart).toString('utf8'));
        decode(signaturePart);
        return !header || typeof header !== 'object' || Array.isArray(header)
            || !payload || typeof payload !== 'object' || Array.isArray(payload);
    } catch {
        return true;
    }
}

function clerkAuthority(env) {
    const configured = String(env.CAISSA_CLERK_AUTHORITY || '').trim();
    const publishable = String(env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || env.CLERK_PUBLISHABLE_KEY || '').trim();
    const secret = String(env.CLERK_SECRET_KEY || '').trim();
    const inferred = [
        publishable.startsWith('pk_live_') ? 'production'
            : publishable.startsWith('pk_test_') ? 'legacy_development' : null,
        secret.startsWith('sk_live_') ? 'production'
            : secret.startsWith('sk_test_') ? 'legacy_development' : null
    ].filter(Boolean);
    if (new Set(inferred).size > 1) return null;
    const keyAuthority = inferred[0] || null;
    if (configured) {
        if (!['legacy_development', 'production'].includes(configured)) return null;
        if (keyAuthority && configured !== keyAuthority) return null;
        return configured;
    }
    return keyAuthority;
}

function clerkExpectedIssuer(env) {
    const configured = String(env.CAISSA_CLERK_ISSUER || '').trim();
    if (configured) {
        try { return normalizeIssuer(new URL(configured).origin); } catch { return null; }
    }
    const key = String(env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || env.CLERK_PUBLISHABLE_KEY || '').trim();
    const encoded = key.replace(/^pk_(?:test|live)_/, '');
    if (!encoded || encoded === key) return null;
    try {
        const host = Buffer.from(encoded, 'base64url').toString('utf8').replace(/\$$/, '');
        if (!/^[A-Za-z0-9.-]+$/.test(host)) return null;
        return normalizeIssuer(`https://${host}`);
    } catch { return null; }
}

function normalizeIssuer(value) {
    try { return new URL(String(value || '')).origin; } catch { return ''; }
}

function clerkAuthorizedParties(env) {
    const configured = `${env.CAISSA_CLERK_AUTHORIZED_PARTIES || ''},${env.CAISSA_BROWSER_ORIGINS || ''}`;
    return [...new Set([
        'https://www.caissa-chess.org',
        ...configured.split(',').map(value => value.trim()).filter(Boolean)
    ])];
}

export const authenticateRequest = createAuthenticateRequest();
export const authenticateBrowserRequest = createAuthenticateRequest({ allowSessionCookie: true });

/**
 * Legacy name for compatibility
 */
export const verifyAuth = authenticateRequest;

export function respondAuthFailure(res, auth) {
    const status = [401, 403, 503].includes(auth?.status) ? auth.status : 401;
    const code = status === 503 ? 'AUTH_SERVICE_UNAVAILABLE'
        : status === 403 ? 'FORBIDDEN' : auth?.code === 'INVALID_TOKEN' ? 'INVALID_TOKEN' : 'AUTH_REQUIRED';
    const error = status === 503 ? 'Authentication service unavailable.'
        : status === 403 ? 'Operation forbidden.' : 'Authentication required.';
    return res.status(status).json({ code, error });
}

/**
 * Standard CORS headers for API responses.
 */
export function setCorsHeaders(req, res, methods) {
    const origin = String(req.headers?.origin || '');
    if (!origin) return true;
    const configured = String(process.env.CAISSA_BROWSER_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean);
    const allowed = new Set(['https://www.caissa-chess.org', ...configured]);
    if (origin === 'null' || !allowed.has(origin)) {
        res.status(403).json({ error: 'Request rejected' });
        return false;
    }
    const allowedMethods = [...new Set([...methods, 'OPTIONS'])];
    const requestedMethod = String(req.headers?.['access-control-request-method'] || '').toUpperCase();
    const requestedHeaders = String(req.headers?.['access-control-request-headers'] || '').toLowerCase().split(',').map(value => value.trim()).filter(Boolean);
    if (req.method === 'OPTIONS' && ((requestedMethod && !methods.includes(requestedMethod))
        || requestedHeaders.some(value => !['authorization', 'content-type', 'idempotency-key'].includes(value)))) {
        res.status(403).json({ error: 'Request rejected' });
        return false;
    }
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', allowedMethods.join(', '));
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, Idempotency-Key');
    res.setHeader('Vary', 'Origin');
    return true;
}
