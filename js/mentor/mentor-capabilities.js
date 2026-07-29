(function installMentorCapabilities(global) {
    'use strict';
    const SCHEMA_VERSION = '1.0.0';
    const RELEASE_ID = 'rel-58b238dfdda8f295fdab023cead6bf069aceefbee74a64a5cd71af2202480a84';
    const STATUSES = Object.freeze(['available', 'foundation', 'disabled', 'unavailable', 'deferred']);
    const REASONS = Object.freeze([
        'CAPABILITY_AVAILABLE', 'FOUNDATION_ONLY', 'PIPELINE_NOT_IMPLEMENTED', 'ANALYSIS_REQUIRED',
        'GAME_RECORD_REQUIRED', 'KNOWLEDGE_RELEASE_REQUIRED', 'MENTOR_NOT_SELECTED',
        'UNSUPPORTED_SOURCE', 'DISABLED_BY_PRODUCT', 'INVALID_REQUEST'
    ]);
    const definitions = Object.freeze({
        'pre-game-goal': 'foundation',
        'post-game-review-request': 'foundation',
        'imported-game-review-request': 'foundation',
        'analysis-guidance': 'deferred',
        'critical-moment-review': 'disabled',
        'knowledge-mapping': 'deferred',
        'training-recommendation': 'deferred',
        'academy-integration': 'foundation',
        'training-memory-read': 'disabled',
        'training-memory-write': 'disabled',
        'mastery-read': 'disabled',
        'mastery-write': 'disabled'
    });
    const freeze = value => {
        if (value && typeof value === 'object' && !Object.isFrozen(value)) {
            Object.values(value).forEach(freeze); Object.freeze(value);
        }
        return value;
    };
    function get(id) {
        const status = definitions[id];
        if (!status) return freeze({ id: null, status: 'unavailable', reasonCode: 'INVALID_REQUEST' });
        return freeze({ id, status, reasonCode: status === 'foundation' ? 'FOUNDATION_ONLY'
            : status === 'disabled' ? 'DISABLED_BY_PRODUCT' : 'PIPELINE_NOT_IMPLEMENTED' });
    }
    const snapshot = freeze({ schemaVersion: SCHEMA_VERSION, releaseId: RELEASE_ID,
        capabilities: Object.entries(definitions).map(([id, status]) => get(id)) });
    global.CaissaMentorCapabilities = freeze({
        schemaVersion: SCHEMA_VERSION, releaseId: RELEASE_ID, statuses: STATUSES,
        reasonCodes: REASONS, get, list: () => snapshot.capabilities, snapshot
    });
})(typeof window !== 'undefined' ? window : globalThis);
