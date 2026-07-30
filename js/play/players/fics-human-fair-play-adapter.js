(function installFicsHumanFairPlayAdapter(global) {
    'use strict';
    function inspect() {
        return Object.freeze({ schemaVersion: '1.0.0', provider: 'fics', status: 'incomplete',
            reasonCodes: Object.freeze(['FICS_PROVIDER_OWNED']),
            authority: global.CaissaHumanRuntimeAuthority?.create?.({
                server: 'provider', clock: 'provider', move: 'provider', result: 'provider', reconnect: 'provider'
            }), handoff: 'external-entry-only',
            message: 'FICS owns games, moves, clocks, results, and reconnect. Simplified Play has no normalized human-game handoff.' });
    }
    global.CaissaFicsHumanFairPlayAdapter = Object.freeze({ schemaVersion: '1.0.0', inspect });
})(typeof window !== 'undefined' ? window : globalThis);
