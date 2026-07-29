(function installClassicPresenceAdapter(global) {
    'use strict';
    const SCHEMA_VERSION = '1.0.0';
    global.CaissaClassicPresenceAdapter = Object.freeze({
        schemaVersion: SCHEMA_VERSION,
        decision: 'presentation-only-no-independent-presence',
        create: () => global.CaissaPresenceProviderAdapter.unsupported('fics', 'caissa-classic-presentation')
    });
})(typeof window !== 'undefined' ? window : globalThis);
