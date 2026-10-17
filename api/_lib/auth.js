/**
 * Shared Clerk token verification for Vercel serverless functions.
 * Reads a Clerk token from the Authorization header. Protected browser
 * handlers may explicitly opt into the standard Clerk __session cookie too.
 */

import { verifyToken } from '@clerk/backend';
import { TokenVerificationError } from '@clerk/backend/errors';
import {
    ACCOUNT_SYSTEM_MODES,
    cleanStartTokenCutoff,
    resolveAccountSystemMode
} from './account-system.js';

const INVALID_TOKEN_REASONS = new Set([
    'token-expired', 'token-invalid', 'token-invalid-algorithm',
    'token-invalid-authorized-parties', 'token-invalid-signature',
    'token-not-active-yet', 'token-iat-in-the-future', 'token-verification-failed'
]);

const failure = (status, code, error) => ({
    authenticated: false,
    ok: false,
    status,
    code,
    error: error || (status === 503 ? 'Authentication service unavailable.' : 'Authentication required.')
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

    const accountMode = resolveAccountSystemMode(env);
    if (accountMode === ACCOUNT_SYSTEM_MODES.maintenance) {
        return failure(503, 'ACCOUNT_SYSTEM_MAINTENANCE', 'Account access is temporarily paused.');
    }
    if (accountMode === ACCOUNT_SYSTEM_MODES.invalid) {
        log('account_system_configuration_invalid');
        return failure(503, 'ACCOUNT_SYSTEM_MISCONFIGURED');
    }

    if (!env.CLERK_SECRET_KEY && !env.CLERK_JWT_KEY) {
        log('auth_configuration_unavailable');
        return failure(503, 'AUTH_SERVICE_UNAVAILABLE');
    }

    try {
        const payload = await verify(token, {
            ...(env.CLERK_JWT_KEY
                ? { jwtKey: env.CLERK_JWT_KEY }
                : { secretKey: env.CLERK_SECRET_KEY }),
            authorizedParties
        });

        if (accountMode === ACCOUNT_SYSTEM_MODES.cleanStart) {
            const cutoff = cleanStartTokenCutoff(env);
            if (!cutoff) {
                log('account_system_cutoff_unavailable');
                return failure(503, 'ACCOUNT_SYSTEM_MISCONFIGURED');
            }
            const issuedAt = Number(payload.iat);
            if (!Number.isSafeInteger(issuedAt) || issuedAt < cutoff) {
                return failure(401, 'SESSION_RESET_REQUIRED', 'Please sign in again to start your new CAISSA account.');
            }
        }

        return {
            authenticated: true,
            ok: true,
            userId: payload.sub,
            email: payload.email || null
        };
    } catch (err) {
        if (err instanceof TokenVerificationError && INVALID_TOKEN_REASONS.has(err.reason)) {
            return failure(401, 'INVALID_TOKEN');
        }
        const diagnostic = [err?.name, err?.reason || err?.code].filter(Boolean).join(':') || 'unknown';
        log(`auth_service_unavailable:${diagnostic}`);
        return failure(503, 'AUTH_SERVICE_UNAVAILABLE');
    }
  };
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
    const permittedCodes = new Set([
        'AUTH_REQUIRED', 'INVALID_TOKEN', 'FORBIDDEN', 'AUTH_SERVICE_UNAVAILABLE',
        'ACCOUNT_SYSTEM_MAINTENANCE', 'ACCOUNT_SYSTEM_MISCONFIGURED', 'SESSION_RESET_REQUIRED'
    ]);
    const code = permittedCodes.has(auth?.code) ? auth.code
        : status === 503 ? 'AUTH_SERVICE_UNAVAILABLE'
        : status === 403 ? 'FORBIDDEN' : 'AUTH_REQUIRED';
    const messages = {
        ACCOUNT_SYSTEM_MAINTENANCE: 'Account access is temporarily paused.',
        SESSION_RESET_REQUIRED: 'Please sign in again to start your new CAISSA account.',
        FORBIDDEN: 'Operation forbidden.',
        AUTH_REQUIRED: 'Authentication required.',
        INVALID_TOKEN: 'Authentication required.',
        AUTH_SERVICE_UNAVAILABLE: 'Authentication service unavailable.',
        ACCOUNT_SYSTEM_MISCONFIGURED: 'Authentication service unavailable.'
    };
    const error = messages[code] || messages.AUTH_REQUIRED;
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
