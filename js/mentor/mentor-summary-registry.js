(function installMentorSummaryRegistry(global) {
    'use strict';
    const SCHEMA_VERSION = '1.0.0'; const MAX_ENTRIES = 8;
    const entries = new Map(); const fingerprints = new Map();
    const diagnostics = { registrations: 0, duplicateReuses: 0, disposals: 0,
        evictions: 0, expirations: 0 };
    const freeze = value => {
        if (value && typeof value === 'object' && !Object.isFrozen(value)) {
            Object.values(value).forEach(freeze); Object.freeze(value);
        }
        return value;
    };
    function register(summary, fingerprint) {
        if (!global.CaissaMentorSummaryContracts?.validateSummary?.(summary)?.ok)
            return freeze({ ok: false, reasonCode: 'INVALID_MENTOR_SUMMARY', value: null });
        const existingId = fingerprints.get(fingerprint);
        if (existingId && entries.has(existingId)) {
            diagnostics.duplicateReuses += 1;
            return freeze({ ok: true, reasonCode: 'SUMMARY_REUSED', value: entries.get(existingId) });
        }
        while (entries.size >= MAX_ENTRIES) {
            const oldest = entries.keys().next().value;
            entries.delete(oldest);
            for (const [key, id] of fingerprints) if (id === oldest) fingerprints.delete(key);
            diagnostics.evictions += 1;
        }
        entries.set(summary.summaryId, summary); fingerprints.set(fingerprint, summary.summaryId);
        diagnostics.registrations += 1;
        return freeze({ ok: true, reasonCode: 'SUMMARY_REGISTERED', value: summary });
    }
    function dispose(id) {
        if (!entries.has(id)) return freeze({ ok: false, reasonCode: 'SUMMARY_NOT_FOUND' });
        entries.delete(id);
        for (const [key, value] of fingerprints) if (value === id) fingerprints.delete(key);
        diagnostics.disposals += 1;
        return freeze({ ok: true, reasonCode: 'SUMMARY_DISPOSED' });
    }
    function expire(cutoffCreatedAt) {
        if (!Number.isFinite(cutoffCreatedAt)) return freeze({ ok: false, reasonCode: 'INVALID_EXPIRY' });
        let expired = 0;
        for (const [id, summary] of entries) {
            if (summary.createdAt >= cutoffCreatedAt) continue;
            entries.delete(id);
            for (const [key, value] of fingerprints) if (value === id) fingerprints.delete(key);
            expired += 1;
        }
        diagnostics.expirations += expired;
        return freeze({ ok: true, reasonCode: 'SUMMARIES_EXPIRED', expired });
    }
    global.CaissaMentorSummaryRegistry = freeze({
        schemaVersion: SCHEMA_VERSION, maxEntries: MAX_ENTRIES, register,
        get: id => entries.get(id) || null, getSnapshot: id => entries.get(id) || null,
        dispose, expire, inspect: () => freeze({ schemaVersion: SCHEMA_VERSION,
            entries: entries.size, maxEntries: MAX_ENTRIES, ...diagnostics })
    });
})(typeof window !== 'undefined' ? window : globalThis);
