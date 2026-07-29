(function installPresenceProviderAdapter(global) {
    'use strict';
    const SCHEMA_VERSION = '1.0.0';
    const freeze = value => {
        if (value && typeof value === 'object' && !Object.isFrozen(value)) {
            Object.values(value).forEach(freeze); Object.freeze(value);
        }
        return value;
    };
    function unsupported(provider, relationship = null) {
        let disposed = false, refreshes = 0;
        return freeze({
            schemaVersion: SCHEMA_VERSION, provider, relationship,
            isSupported: () => false,
            getConnectionStatus: () => disposed ? 'disposed' : 'unsupported',
            getSnapshot: () => null,
            subscribe: () => () => {},
            refresh: () => { refreshes += 1; return freeze({ ok: false, reasonCode: disposed ? 'DISPOSED' : 'SNAPSHOT_UNAVAILABLE' }); },
            inspect: () => freeze({ provider, supported: false, relationship, refreshes,
                listenerCount: 0, socketCount: 0, timerCount: 0, disposed }),
            dispose: () => { disposed = true; return freeze({ ok: true, reasonCode: 'DISPOSED' }); }
        });
    }
    global.CaissaPresenceProviderAdapter = Object.freeze({ schemaVersion: SCHEMA_VERSION, unsupported });
})(typeof window !== 'undefined' ? window : globalThis);
