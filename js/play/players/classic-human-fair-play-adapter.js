(function installClassicHumanFairPlayAdapter(global) {
    'use strict';
    function inspect() {
        const inherited = global.CaissaFicsHumanFairPlayAdapter?.inspect?.();
        return Object.freeze({ schemaVersion: '1.0.0', provider: 'caissa-classic',
            status: inherited?.status || 'incomplete', reasonCodes: Object.freeze(['CLASSIC_INHERITS_FICS']),
            authority: inherited?.authority || null, handoff: 'inherits-fics-external-entry',
            message: 'Classic is presentation over the existing FICS runtime; it creates no second connection.' });
    }
    global.CaissaClassicHumanFairPlayAdapter = Object.freeze({ schemaVersion: '1.0.0', inspect });
})(typeof window !== 'undefined' ? window : globalThis);
