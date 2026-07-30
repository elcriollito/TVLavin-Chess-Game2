(function installCaissaHumanFairPlayAdapter(global) {
    'use strict';
    function inspect(provider = 'future-caissa-network') {
        const local = provider === 'local';
        return Object.freeze({ schemaVersion: '1.0.0', provider: local ? 'local' : 'future-caissa-network',
            status: 'unsupported',
            reasonCodes: Object.freeze([local ? 'LOCAL_HUMAN_RUNTIME_UNAVAILABLE' : 'CAISSA_BACKEND_UNAVAILABLE']),
            authority: global.CaissaHumanRuntimeAuthority?.create?.({}), handoff: 'unavailable',
            message: local ? 'No local human runtime exists in Simplified Play.'
                : 'No proprietary CAISSA multiplayer backend exists.' });
    }
    global.CaissaHumanFairPlayUnavailableAdapter = Object.freeze({ schemaVersion: '1.0.0', inspect });
})(typeof window !== 'undefined' ? window : globalThis);
