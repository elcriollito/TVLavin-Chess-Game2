/**
 * Shared Clerk token verification for Vercel serverless functions.
 * Reads Bearer token from Authorization header and verifies with Clerk.
 */

import { verifyToken } from '@clerk/backend';

/**
 * Verify the Clerk JWT from the request Authorization header.
 * @param {Object} req - Vercel request object
 * @returns {Object} { userId, email } on success, or { error, status } on failure
 */
export async function verifyAuth(req) {
    const authHeader = req.headers['authorization'] || req.headers['Authorization'];

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return { error: 'Missing or invalid Authorization header', status: 401 };
    }

    const token = authHeader.slice(7).trim();

    if (!process.env.CLERK_SECRET_KEY) {
        console.error('CLERK_SECRET_KEY not configured');
        return { error: 'Server auth not configured', status: 500 };
    }

    try {
        const payload = await verifyToken(token, {
            secretKey: process.env.CLERK_SECRET_KEY
        });

        return {
            userId: payload.sub,
            email: payload.email || null
        };
    } catch (err) {
        console.error('Clerk token verification failed:', err.message);
        return { error: 'Invalid or expired token', status: 401 };
    }
}

/**
 * Standard CORS headers for API responses.
 */
export function setCorsHeaders(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}
