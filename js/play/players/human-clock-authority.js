(function installHumanClockAuthority(global) {
    'use strict';
    const VERSION = '1.0.0';
    global.CaissaHumanClockAuthority = Object.freeze({
        schemaVersion: VERSION,
        create(input = {}) {
            return Object.freeze({ schemaVersion: VERSION,
                authority: input.authority === 'provider' ? 'provider' : 'unavailable',
                displayOnly: input.authority === 'provider', mayStartLocalClock: false,
                providerEventRequired: true });
        }
    });
})(typeof window !== 'undefined' ? window : globalThis);
