(function installCaissaChallengeAdapter(global) {
    'use strict';
    global.CaissaChallengeAdapter = Object.freeze({
        schemaVersion: '1.0.0',
        decision: 'unavailable-no-proprietary-backend',
        create: () => global.CaissaChallengeProviderAdapter.unsupported('future-caissa-network', {
            decision: 'unavailable-no-proprietary-backend'
        })
    });
})(typeof window !== 'undefined' ? window : globalThis);
