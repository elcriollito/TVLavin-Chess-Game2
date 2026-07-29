(function installPresenceFreshnessPolicy(global) {
    'use strict';
    const SCHEMA_VERSION = '1.0.0';
    const CATEGORIES = Object.freeze(['fresh', 'aging', 'stale', 'expired']);
    const DEFAULTS = Object.freeze({ freshUntilMs: 30000, staleUntilMs: 90000, expireAfterMs: 180000, maxClockSkewMs: 5000 });
    const freeze = value => {
        if (value && typeof value === 'object' && !Object.isFrozen(value)) {
            Object.values(value).forEach(freeze); Object.freeze(value);
        }
        return value;
    };
    function create(input = {}) {
        const policy = {
            schemaVersion: SCHEMA_VERSION,
            freshUntilMs: finite(input.freshUntilMs, DEFAULTS.freshUntilMs),
            staleUntilMs: finite(input.staleUntilMs, DEFAULTS.staleUntilMs),
            expireAfterMs: finite(input.expireAfterMs, DEFAULTS.expireAfterMs),
            maxClockSkewMs: finite(input.maxClockSkewMs, DEFAULTS.maxClockSkewMs)
        };
        if (policy.freshUntilMs < 1000 || policy.staleUntilMs <= policy.freshUntilMs ||
            policy.expireAfterMs <= policy.staleUntilMs || policy.expireAfterMs > 3600000 ||
            policy.maxClockSkewMs > 60000) return null;
        return freeze(policy);
    }
    function finite(value, fallback) {
        return Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback;
    }
    function evaluate(timestamp, observedAt, policyInput) {
        const policy = create(policyInput);
        if (!policy || !Number.isFinite(timestamp) || !Number.isFinite(observedAt) ||
            timestamp <= 0 || observedAt <= 0) return null;
        const skewMs = Math.max(0, timestamp - observedAt);
        if (skewMs > policy.maxClockSkewMs) return null;
        const ageMs = Math.max(0, observedAt - timestamp);
        const status = ageMs <= policy.freshUntilMs ? 'fresh'
            : ageMs <= policy.staleUntilMs ? 'aging'
                : ageMs <= policy.expireAfterMs ? 'stale' : 'expired';
        return freeze({
            schemaVersion: SCHEMA_VERSION, status, ageMs,
            expiresAt: timestamp + policy.expireAfterMs,
            clockSkewMs: skewMs
        });
    }
    global.CaissaPresenceFreshnessPolicy = Object.freeze({
        schemaVersion: SCHEMA_VERSION, categories: CATEGORIES, defaults: DEFAULTS, create, evaluate
    });
})(typeof window !== 'undefined' ? window : globalThis);
