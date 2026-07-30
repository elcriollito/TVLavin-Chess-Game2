(function(root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    root.CaissaWorkerFallbackPolicy = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function() {
    'use strict';
    const VERSION = '1.0.0';
    const RESTARTABLE = Object.freeze(['constructor-failure','init-timeout','worker-error','message-error','search-timeout']);
    function create(options = {}) {
        const restartLimit = Math.max(0, Math.min(1, Number(options.restartLimit) || 1));
        return Object.freeze({ schemaVersion: VERSION, restartLimit, decide(reason, count) {
            return RESTARTABLE.includes(reason) && count < restartLimit
                ? Object.freeze({ action: 'restart', state: 'retrying' })
                : Object.freeze({ action: 'unavailable', state: 'unavailable' });
        }});
    }
    return Object.freeze({ VERSION, RESTARTABLE, create });
});
