/**
 * Shared Clerk token verification for Vercel serverless functions.
 * Reads Bearer token from Authorization header and verifies with Clerk.
 */

import { verifyToken } from '@clerk/backend';

/**
 * Verify the Clerk JWT from the request Authorization header.
 * @param {Object} req - Vercel request object
 * @returns {Object} { authenticated, userId, email } or { authenticated: false, error }
 */
export async function authenticateRequest(req) {
    const authHeader = req.headers['authorization'] || req.headers['Authorization'];

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return { authenticated: false, error: 'Missing or invalid Authorization header' };
    }

    const token = authHeader.slice(7).trim();

    if (!process.env.CLERK_SECRET_KEY) {
        console.error('CLERK_SECRET_KEY not configured');
        return { authenticated: false, error: 'Server auth not configured' };
    }

    try {
        const payload = await verifyToken(token, {
            secretKey: process.env.CLERK_SECRET_KEY
        });

        return {
            authenticated: true,
            userId: payload.sub,
            email: payload.email || null
        };
    } catch (err) {
        console.error('Clerk token verification failed:', err.message);
        return { authenticated: false, error: 'Invalid or expired token' };
    }
}

/**
 * Legacy name for compatibility
 */
export const verifyAuth = authenticateRequest;

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
