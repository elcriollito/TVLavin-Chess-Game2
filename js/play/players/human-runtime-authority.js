(function installHumanRuntimeAuthority(global) {
    'use strict';
    const VERSION = '1.0.0';
    const FIELDS = Object.freeze(['server', 'clock', 'move', 'result', 'reconnect']);
    const VALUES = new Set(['provider', 'caissa', 'local', 'shared', 'unavailable', 'unknown']);
    const create = (input = {}) => Object.freeze({ schemaVersion: VERSION,
        ...Object.fromEntries(FIELDS.map(field => [field, VALUES.has(input[field]) ? input[field] : 'unknown'])) });
    global.CaissaHumanRuntimeAuthority = Object.freeze({
        schemaVersion: VERSION, fields: FIELDS, create,
        missing: authority => Object.freeze(FIELDS.filter(field => authority?.[field] !== 'provider'))
    });
})(typeof window !== 'undefined' ? window : globalThis);
