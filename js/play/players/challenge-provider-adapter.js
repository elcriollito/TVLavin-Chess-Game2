(function installChallengeProviderAdapter(global) {
    'use strict';
    const SCHEMA_VERSION = '1.0.0';
    const CAPABILITIES = Object.freeze({
        create: false, accept: false, decline: false, cancel: false,
        reconnect: false, activeGame: false
    });
    const freeze = value => {
        if (value && typeof value === 'object' && !Object.isFrozen(value)) {
            Object.values(value).forEach(freeze); Object.freeze(value);
        }
        return value;
    };
    function unsupported(provider, options = {}) {
        let disposed = false, calls = 0;
        const unavailable = action => {
            calls += 1;
            return Promise.resolve(freeze({
                ok: false, reasonCode: disposed ? 'DISPOSED' : 'PROVIDER_UNAVAILABLE',
                action, provider, providerUpdate: null
            }));
        };
        return freeze({
            schemaVersion: SCHEMA_VERSION, provider,
            relationship: options.relationship || null, decision: options.decision || 'unsupported',
            isSupported: () => false, getCapabilities: () => CAPABILITIES,
            createChallenge: () => unavailable('submit'),
            acceptChallenge: () => unavailable('accept'),
            declineChallenge: () => unavailable('decline'),
            cancelChallenge: () => unavailable('cancel'),
            reconnectChallenge: () => unavailable('reconnect'),
            openProvider: () => unavailable('open-provider'),
            getSnapshot: () => null, subscribe: () => () => {},
            inspect: () => freeze({ provider, supported: false, calls, listenerCount: 0,
                socketCount: 0, timerCount: 0, disposed }),
            dispose: () => { disposed = true; return freeze({ ok: true, reasonCode: 'DISPOSED' }); }
        });
    }
    global.CaissaChallengeProviderAdapter = Object.freeze({
        schemaVersion: SCHEMA_VERSION, capabilities: CAPABILITIES, unsupported
    });
})(typeof window !== 'undefined' ? window : globalThis);
