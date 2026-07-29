(function installEducationalAnalysisPolicy(global) {
    'use strict';
    const SCHEMA_VERSION = '1.0.0';
    const profiles = Object.freeze({
        quick: Object.freeze({ id: 'technical-quick-v1', perPositionDepth: 8, maximumPositions: 12,
            perPositionTimeoutMs: 5000, totalTimeBudgetMs: 45000 }),
        standard: Object.freeze({ id: 'technical-standard-v1', perPositionDepth: 12, maximumPositions: 24,
            perPositionTimeoutMs: 12000, totalTimeBudgetMs: 180000 }),
        deep: Object.freeze({ id: 'technical-deep-v1', perPositionDepth: 16, maximumPositions: 32,
            perPositionTimeoutMs: 20000, totalTimeBudgetMs: 480000 })
    });
    const freeze = value => {
        if (value && typeof value === 'object' && !Object.isFrozen(value)) {
            Object.values(value).forEach(freeze); Object.freeze(value);
        }
        return value;
    };
    function resolve(requestedDepth, options = {}) {
        const base = profiles[requestedDepth];
        if (!base) return freeze({ ok: false, reasonCode: 'POLICY_INVALID', value: null });
        const mobile = options.mobile === true;
        const maximumPositions = mobile ? Math.max(8, Math.floor(base.maximumPositions * 0.75))
            : base.maximumPositions;
        return freeze({ ok: true, reasonCode: mobile ? 'MOBILE_BUDGET_APPLIED' : 'POLICY_RESOLVED',
            value: freeze({ schemaVersion: SCHEMA_VERSION, id: base.id, requestedDepth,
                resolvedProfile: mobile && requestedDepth === 'deep' ? 'technical-standard-mobile-v1' : base.id,
                perPositionLimit: freeze({ type: 'depth', value: mobile && requestedDepth === 'deep'
                    ? profiles.standard.perPositionDepth : base.perPositionDepth }),
                maximumPositions, totalTimeBudgetMs: mobile
                    ? Math.min(base.totalTimeBudgetMs, profiles.standard.totalTimeBudgetMs) : base.totalTimeBudgetMs,
                perPositionTimeoutMs: mobile
                    ? Math.min(base.perPositionTimeoutMs, profiles.standard.perPositionTimeoutMs)
                    : base.perPositionTimeoutMs,
                multiPv: 1, concurrency: 1, mobileAdjustment: mobile ? 'reduced' : 'none',
                reasonCode: mobile ? 'MOBILE_BUDGET_APPLIED' : 'POLICY_RESOLVED' }) });
    }
    global.CaissaEducationalAnalysisPolicy = freeze({
        schemaVersion: SCHEMA_VERSION, depths: Object.freeze(Object.keys(profiles)), profiles, resolve
    });
})(typeof window !== 'undefined' ? window : globalThis);
