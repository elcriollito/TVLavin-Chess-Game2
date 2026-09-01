import { authenticateRequest, respondAuthFailure, setCorsHeaders } from '../../../_lib/auth.js';
import { lookupMarketReaderEntitlement } from '../../../_lib/market-reader-entitlements.js';
import { logMarketReaderEvent } from '../../../_lib/market-reader-logging.js';
import {
    MARKET_READER_PRODUCT_ID,
    getMarketReaderProduct,
    isMarketReaderStagingEnabled,
    listMarketReaderReleases
} from '../../../_lib/market-reader-releases.js';

const genericUnavailable = (res) => res.status(403).json({ error: 'Downloads are not available.' });

export function createMarketReaderReleaseListingHandler(dependencies = {}) {
    const authenticate = dependencies.authenticateRequest || authenticateRequest;
    const lookupEntitlement = dependencies.lookupEntitlement || lookupMarketReaderEntitlement;
    const env = dependencies.env || process.env;
    const audit = dependencies.audit || logMarketReaderEvent;

    return async function handler(req, res) {
        if (!setCorsHeaders(req, res, ['GET'])) return;
        if (req.method === 'OPTIONS') return res.status(200).end();
        if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
        res.setHeader('Cache-Control', 'private, no-store, max-age=0');

        const auth = await authenticate(req);
        if (!auth.authenticated) return respondAuthFailure(res, auth);
        const productId = Array.isArray(req.query?.productId) ? '' : String(req.query?.productId || '');
        if (!isMarketReaderStagingEnabled(env) || productId !== MARKET_READER_PRODUCT_ID) {
            audit('market.download_denied', { outcome: 'denied', productId, reason: 'environment_disabled' });
            return genericUnavailable(res);
        }

        let entitlement;
        try {
            entitlement = await lookupEntitlement({ clerkId: auth.userId, productId });
        } catch {
            entitlement = null;
        }
        if (entitlement?.status !== 'active') {
            audit('market.download_denied', { outcome: 'denied', productId, reason: 'not_entitled' });
            return genericUnavailable(res);
        }

        audit('market.releases_listed', { outcome: 'ok', productId });
        return res.status(200).json({
            product: getMarketReaderProduct(),
            entitlement: {
                productId: entitlement.productId,
                status: entitlement.status
            },
            releases: listMarketReaderReleases()
        });
    };
}

export default createMarketReaderReleaseListingHandler();
