(function installFicsPresenceAdapter(global) {
    'use strict';
    const SCHEMA_VERSION = '1.0.0';
    global.CaissaFicsPresenceAdapter = Object.freeze({
        schemaVersion: SCHEMA_VERSION,
        decision: 'unsupported-no-provider-timestamp',
        create: () => global.CaissaPresenceProviderAdapter.unsupported('fics')
    });
})(typeof window !== 'undefined' ? window : globalThis);
