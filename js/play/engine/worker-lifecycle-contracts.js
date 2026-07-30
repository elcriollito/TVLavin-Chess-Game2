(function(root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    root.CaissaWorkerLifecycleContracts = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function() {
    'use strict';
    const VERSION = '1.0.0';
    const OWNERS = Object.freeze(['play','analyze','arena','mentor-analysis','spectator','test','unknown']);
    const PURPOSES = Object.freeze(['move-generation','live-evaluation','post-game-analysis','deep-analysis','engine-match','delayed-evaluation','unknown']);
    const STATES = Object.freeze(['created','loading','initializing','ready','busy','stopping','stopped','paused','restarting','degraded','failed','terminating','terminated','disposed']);
    const TRANSITIONS = Object.freeze({
        created:['loading','terminating','disposed'], loading:['initializing','failed','terminating'],
        initializing:['ready','failed','terminating'], ready:['busy','paused','stopping','restarting','degraded','terminating'],
        busy:['ready','stopping','paused','restarting','degraded','failed','terminating'],
        stopping:['stopped','failed','terminating'], stopped:['ready','busy','paused','restarting','terminating'],
        paused:['ready','stopped','restarting','terminating'], restarting:['loading','degraded','failed','terminating'],
        degraded:['restarting','terminating','disposed'], failed:['restarting','terminating','disposed'],
        terminating:['terminated'], terminated:['disposed'], disposed:[]
    });
    Object.values(TRANSITIONS).forEach(Object.freeze);
    const validId = value => typeof value === 'string' && /^[a-z][a-z0-9-]{0,63}$/.test(value)
        && !['constructor','prototype','__proto__'].includes(value);
    const canTransition = (from, to) => STATES.includes(from) && TRANSITIONS[from].includes(to);
    const bounded = (value, max) => Math.max(0, Math.min(max, Number(value) || 0));
    function normalizeContext(input = {}) {
        if (input.schemaVersion !== undefined && input.schemaVersion !== VERSION) throw new TypeError('Unsupported worker lifecycle schema');
        if (!validId(input.contextId)) throw new TypeError('Invalid worker context ID');
        const member = (value, values, fallback) => values.includes(value) ? value : fallback;
        return Object.freeze({
            schemaVersion: VERSION, contextId: input.contextId,
            owner: member(input.owner, OWNERS, 'unknown'), purpose: member(input.purpose, PURPOSES, 'unknown'),
            source: validId(input.source) ? input.source : 'unknown', state: member(input.state, STATES, 'created'),
            workerGeneration: bounded(input.workerGeneration, Number.MAX_SAFE_INTEGER),
            activeRequestId: validId(input.activeRequestId) ? input.activeRequestId : null,
            activeSearchId: validId(input.activeSearchId) ? input.activeSearchId : null,
            initializedAt: Number.isFinite(input.initializedAt) ? input.initializedAt : null,
            readyAt: Number.isFinite(input.readyAt) ? input.readyAt : null,
            stoppedAt: Number.isFinite(input.stoppedAt) ? input.stoppedAt : null,
            terminatedAt: Number.isFinite(input.terminatedAt) ? input.terminatedAt : null,
            restartCount: bounded(input.restartCount, 1),
            fallbackState: member(input.fallbackState, ['none','retrying','unavailable'], 'none'),
            diagnostics: Object.freeze({
                listeners: bounded(input.diagnostics?.listeners, 3), timers: bounded(input.diagnostics?.timers, 8),
                queuedRequests: bounded(input.diagnostics?.queuedRequests, 1),
                staleResponses: bounded(input.diagnostics?.staleResponses, Number.MAX_SAFE_INTEGER),
                terminations: bounded(input.diagnostics?.terminations, Number.MAX_SAFE_INTEGER)
            })
        });
    }
    return Object.freeze({ VERSION, OWNERS, PURPOSES, STATES, TRANSITIONS, validId, canTransition, normalizeContext });
});
