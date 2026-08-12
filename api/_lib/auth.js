/**
 * Shared Clerk token verification for Vercel serverless functions.
 * Reads Bearer token from Authorization header and verifies with Clerk.
 */

import { verifyToken } from '@clerk/backend';
import { TokenVerificationError } from '@clerk/backend/errors';

const INVALID_TOKEN_REASONS = new Set([
    'token-expired', 'token-invalid', 'token-invalid-algorithm',
    'token-invalid-authorized-parties', 'token-invalid-signature',
    'token-not-active-yet', 'token-iat-in-the-future', 'token-verification-failed'
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
  const log = dependencies.log || (() => {});

  return async function authenticateRequest(req) {
    const authHeader = req.headers['authorization'] || req.headers['Authorization'];

    if (typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
        return failure(401, 'AUTH_REQUIRED');
    }

    const token = authHeader.slice(7).trim();
    if (!token) return failure(401, 'AUTH_REQUIRED');

    if (!env.CLERK_SECRET_KEY) {
        log('auth_configuration_unavailable');
        return failure(503, 'AUTH_SERVICE_UNAVAILABLE');
    }

    try {
        const payload = await verify(token, {
            secretKey: env.CLERK_SECRET_KEY
        });

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
        log('auth_service_unavailable');
        return failure(503, 'AUTH_SERVICE_UNAVAILABLE');
    }
  };
}

export const authenticateRequest = createAuthenticateRequest();

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
        || requestedHeaders.some(value => !['authorization', 'content-type'].includes(value)))) {
        res.status(403).json({ error: 'Request rejected' });
        return false;
    }
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', allowedMethods.join(', '));
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.setHeader('Vary', 'Origin');
    return true;
}
