const EVENTS = new Set([
    'market.releases_listed',
    'market.download_authorized',
    'market.download_denied',
    'market.download_failed'
]);
const OUTCOMES = new Set(['ok', 'denied', 'error']);
const REASONS = new Set([
    'not_entitled',
    'invalid_release',
    'environment_disabled',
    'signing_unavailable',
    'configuration_unavailable'
]);
const IDENTIFIER = /^[a-z0-9](?:[a-z0-9.-]{0,62}[a-z0-9])?$/;

function safeIdentifier(value) {
    return IDENTIFIER.test(String(value || '')) ? String(value) : null;
}

export function createMarketReaderAuditLog(write = console.log) {
    return function audit(event, metadata = {}) {
        if (!EVENTS.has(event)) return;
        const record = {
            ts: new Date().toISOString(),
            event,
            outcome: OUTCOMES.has(metadata.outcome) ? metadata.outcome : 'error',
            productId: safeIdentifier(metadata.productId),
            releaseId: safeIdentifier(metadata.releaseId),
            reason: REASONS.has(metadata.reason) ? metadata.reason : null
        };
        write(JSON.stringify(record));
    };
}

export const logMarketReaderEvent = createMarketReaderAuditLog();
