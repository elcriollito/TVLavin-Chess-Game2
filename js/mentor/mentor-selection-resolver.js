(function installMentorSelectionResolver(global) {
    'use strict';
    const SCHEMA_VERSION = '1.0.0';
    const freeze = value => {
        if (value && typeof value === 'object' && !Object.isFrozen(value)) {
            Object.values(value).forEach(freeze); Object.freeze(value);
        }
        return value;
    };
    function resolve(input = {}) {
        const registry = global.CaissaMentorRegistry;
        const choices = [
            ['session', input.sessionMentorId],
            ['academy', input.academyMentorId],
            ['product-default', registry?.resolveDefault?.()?.id]
        ];
        const match = choices.find(([, id]) => typeof id === 'string' && registry?.get?.(id));
        if (!match) return freeze({ schemaVersion: SCHEMA_VERSION, available: false,
            mentor: null, source: 'unavailable', reasonCode: 'MENTOR_NOT_SELECTED' });
        return freeze({ schemaVersion: SCHEMA_VERSION, available: true,
            mentor: registry.get(match[1]), source: match[0], reasonCode: 'MENTOR_RESOLVED' });
    }
    global.CaissaMentorSelectionResolver = freeze({ schemaVersion: SCHEMA_VERSION, resolve });
})(typeof window !== 'undefined' ? window : globalThis);
