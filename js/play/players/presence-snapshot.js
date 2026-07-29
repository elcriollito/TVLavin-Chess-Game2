(function installPresenceSnapshot(global) {
    'use strict';
    const SCHEMA_VERSION = '1.0.0';
    const STATUSES = Object.freeze(['connected', 'empty', 'disconnected', 'unsupported', 'stale', 'error']);
    const MAX_RECORDS = 128;
    const freeze = value => {
        if (value && typeof value === 'object' && !Object.isFrozen(value)) {
            Object.values(value).forEach(freeze); Object.freeze(value);
        }
        return value;
    };
    function create(input = {}, options = {}) {
        if (!input || typeof input !== 'object' || input.schemaVersion && input.schemaVersion !== SCHEMA_VERSION) return null;
        const provider = String(input.provider || '').toLowerCase();
        if (!global.CaissaPlayerPresence?.providers?.includes(provider) || !STATUSES.includes(input.status)) return null;
        const observedAt = Number(input.observedAt);
        const providerTimestamp = input.providerTimestamp == null ? null : Number(input.providerTimestamp);
        if (!Number.isFinite(observedAt) || observedAt <= 0 ||
            providerTimestamp != null && (!Number.isFinite(providerTimestamp) || providerTimestamp <= 0)) return null;
        if (!Array.isArray(input.records) || input.records.length > MAX_RECORDS) return null;
        const records = [];
        const ids = new Set();
        for (const raw of input.records) {
            const record = global.CaissaPlayerPresence.normalize(raw, options);
            if (!record || record.provider !== provider || ids.has(record.presenceId)) return null;
            ids.add(record.presenceId); records.push(record);
        }
        records.sort((a, b) => a.presenceId.localeCompare(b.presenceId));
        if (input.status === 'disconnected' && records.length) return null;
        return freeze({
            schemaVersion: SCHEMA_VERSION,
            snapshotId: `${provider}:${providerTimestamp || observedAt}`,
            provider, status: input.status,
            connected: input.status === 'connected' || input.status === 'empty',
            authenticated: typeof input.authenticated === 'boolean' ? input.authenticated : null,
            observedAt, providerTimestamp, records: freeze(records),
            freshnessPolicy: global.CaissaPresenceFreshnessPolicy.create(options.freshnessPolicy),
            source: typeof input.source === 'string' && input.source.length <= 48 ? input.source : 'provider-adapter',
            diagnostics: freeze({ recordCount: records.length, rejectedCount: 0 })
        });
    }
    global.CaissaPresenceSnapshot = Object.freeze({
        schemaVersion: SCHEMA_VERSION, statuses: STATUSES, maxRecords: MAX_RECORDS, create
    });
})(typeof window !== 'undefined' ? window : globalThis);
