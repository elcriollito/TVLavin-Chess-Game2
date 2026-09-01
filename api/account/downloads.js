import { authenticateRequest, respondAuthFailure, setCorsHeaders } from '../_lib/auth.js';
import { checkRateLimit } from '../_lib/rate-limit.js';
import { createMarketReaderDownloadAuthorizer, MarketReaderDownloadError } from '../_lib/market-reader-downloads.js';
import { lookupMarketReaderEntitlement } from '../_lib/market-reader-entitlements.js';
import { logMarketReaderEvent } from '../_lib/market-reader-logging.js';

export function createMarketReaderDownloadHandler(dependencies = {}) {
    const authenticate = dependencies.authenticateRequest || authenticateRequest;
    const env = dependencies.env || process.env;
    const audit = dependencies.audit || logMarketReaderEvent;
    const rateLimit = dependencies.checkRateLimit || checkRateLimit;
    const authorize = dependencies.authorize || createMarketReaderDownloadAuthorizer({
        env,
        lookupEntitlement: dependencies.lookupEntitlement || lookupMarketReaderEntitlement,
        issueSignedToken: dependencies.issueSignedToken,
        parseStoreIdFromDelegationToken: dependencies.parseStoreIdFromDelegationToken,
        presignUrl: dependencies.presignUrl,
        clock: dependencies.clock,
        ttlMs: dependencies.ttlMs
    });

    return async function handler(req, res) {
        if (!setCorsHeaders(req, res, ['POST'])) return;
        if (req.method === 'OPTIONS') return res.status(200).end();
        if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
        res.setHeader('Cache-Control', 'private, no-store, max-age=0');

        const auth = await authenticate(req);
        if (!auth.authenticated) return respondAuthFailure(res, auth);
        const limited = rateLimit(auth.userId, { windowMs: 10 * 60 * 1000, max: 10, prefix: 'market-download' });
        if (!limited.allowed) return res.status(429).json({ error: 'Download is temporarily unavailable.' });

        const productId = typeof req.body?.productId === 'string' ? req.body.productId : null;
        const releaseId = typeof req.body?.releaseId === 'string' ? req.body.releaseId : null;
        try {
            const result = await authorize({ clerkId: auth.userId, body: req.body });
            audit('market.download_authorized', { outcome: 'ok', productId, releaseId });
            return res.status(200).json(result);
        } catch (error) {
            if (error instanceof MarketReaderDownloadError && error.status === 403) {
                const reason = error.code === 'DOWNLOAD_ENVIRONMENT_DISABLED' ? 'environment_disabled'
                    : error.code === 'DOWNLOAD_NOT_ENTITLED' ? 'not_entitled' : 'invalid_release';
                audit('market.download_denied', { outcome: 'denied', productId, releaseId, reason });
                return res.status(403).json({ error: 'Download is not available.' });
            }
            const reason = error instanceof MarketReaderDownloadError
                && error.code === 'DOWNLOAD_CONFIGURATION_UNAVAILABLE'
                ? 'configuration_unavailable' : 'signing_unavailable';
            audit('market.download_failed', { outcome: 'error', productId, releaseId, reason });
            return res.status(503).json({ error: 'Download service is temporarily unavailable.' });
        }
    };
}

export default createMarketReaderDownloadHandler();
