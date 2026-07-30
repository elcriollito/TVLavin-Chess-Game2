(function installClassicChallengeAdapter(global) {
    'use strict';
    global.CaissaClassicChallengeAdapter = Object.freeze({
        schemaVersion: '1.0.0',
        decision: 'presentation-only-shared-fics-owner',
        create: () => global.CaissaChallengeProviderAdapter.unsupported('fics', {
            relationship: 'caissa-classic-presentation',
            decision: 'presentation-only-shared-fics-owner'
        })
    });
})(typeof window !== 'undefined' ? window : globalThis);
