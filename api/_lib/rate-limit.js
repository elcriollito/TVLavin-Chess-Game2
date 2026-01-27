/**
 * Shared rate limiting module for Vercel serverless functions.
 * In-memory Map store — resets on cold start (acceptable for serverless).
 * For production at scale, upgrade to Upstash Redis or Vercel KV.
 */

const store = new Map();

/**
 * Check if a request is within rate limits.
 *
 * @param {string} identifier - Unique key (userId, IP, sessionId, etc.)
 * @param {Object} config
 * @param {number} config.windowMs   - Time window in milliseconds
 * @param {number} config.max        - Max requests allowed within the window
 * @param {string} [config.prefix]   - Optional prefix for the store key (e.g. 'consume', 'checkout')
 * @returns {{ allowed: boolean, remaining: number, retryAfter?: number }}
 */
export function checkRateLimit(identifier, config) {
    const { windowMs, max, prefix } = config;
    const now = Date.now();
    const key = prefix ? `${prefix}:${identifier}` : identifier;

    // Probabilistic cleanup (5% chance per call)
    if (Math.random() < 0.05) {
        _cleanup(now);
    }

    const entry = store.get(key) || { timestamps: [] };

    // Remove timestamps outside the current window
    entry.timestamps = entry.timestamps.filter(t => now - t < windowMs);

    if (entry.timestamps.length >= max) {
        const oldest = Math.min(...entry.timestamps);
        const retryAfterMs = oldest + windowMs - now;
        const retryAfterSec = Math.ceil(retryAfterMs / 1000);

        return {
            allowed: false,
            remaining: 0,
            retryAfter: retryAfterSec
        };
    }

    // Record this request
    entry.timestamps.push(now);
    store.set(key, entry);

    return {
        allowed: true,
        remaining: max - entry.timestamps.length
    };
}

/**
 * Clean up expired entries from the store.
 */
function _cleanup(now) {
    for (const [key, entry] of store.entries()) {
        if (!entry.timestamps || entry.timestamps.length === 0) {
            store.delete(key);
            continue;
        }
        const newest = Math.max(...entry.timestamps);
        // If the newest timestamp is older than 24h, remove entirely
        if (now - newest > 24 * 60 * 60 * 1000) {
            store.delete(key);
        }
    }
}

/**
 * Get client IP from request (handles proxies).
 */
export function getClientIP(req) {
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
        return forwarded.split(',')[0].trim();
    }
    return req.headers['x-real-ip'] || req.socket?.remoteAddress || 'unknown';
}
