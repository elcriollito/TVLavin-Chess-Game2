/**
 * Structured logging for Vercel serverless functions.
 * Outputs JSON lines for easy parsing in Vercel logs / log drains.
 */

/**
 * Log a successful action.
 * @param {string} action - Action name (e.g. 'credits_consumed', 'webhook_processed')
 * @param {Object} [meta] - Additional metadata
 */
export function logAction(action, meta = {}) {
    console.log(JSON.stringify({
        ts: new Date().toISOString(),
        action,
        userId: meta.userId || null,
        outcome: meta.outcome || 'ok',
        detail: meta.detail || null
    }));
}

/**
 * Log an error.
 * @param {string} action - Action during which the error occurred
 * @param {Error|string} error - Error object or message
 * @param {Object} [meta] - Additional metadata
 */
export function logError(action, error, meta = {}) {
    console.error(JSON.stringify({
        ts: new Date().toISOString(),
        action,
        outcome: 'error',
        userId: meta.userId || null,
        error: error instanceof Error ? error.message : String(error),
        detail: meta.detail || null
    }));
}
