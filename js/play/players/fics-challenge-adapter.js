(function installFicsChallengeAdapter(global) {
    'use strict';
    global.CaissaFicsChallengeAdapter = Object.freeze({
        schemaVersion: '1.0.0',
        decision: 'entry-only-no-normalized-challenge-events',
        create: () => global.CaissaChallengeProviderAdapter.unsupported('fics', {
            decision: 'entry-only-no-normalized-challenge-events'
        })
    });
})(typeof window !== 'undefined' ? window : globalThis);
