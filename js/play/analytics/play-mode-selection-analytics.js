(function (root) {
    'use strict';
    const A = root.CaissaPlayAnalytics, C = root.CaissaPlayAnalyticsContracts;
    if (!A || !C) return;
    const resourceModes = Object.freeze({ 'bots-stack': 'bots', 'coach-stack': 'coach', 'players-stack': 'players' });
    const activeLoads = new Map();
    let previousMode = 'none', selectionSequence = 0, currentMode = null, lastRouteSignature = null, unsubscribe = null;
    const source = value => ({ 'cold-load': 'cold-restore', 'direct-path': 'direct', programmatic: 'unknown',
        'mode-tab': 'mode-tab', 'primary-navigation': 'primary-navigation', 'mobile-navigation': 'primary-navigation',
        popstate: 'browser-history', 'legacy-section': 'legacy-bridge' }[value] || (C.ROUTE_SOURCES.includes(value) ? value : 'unknown'));
    const eligibility = (mode, qa, blocked = false, normalized = false) => ({
        qaEligible: qa, productionEligible: mode === 'games' && !blocked,
        accessState: normalized ? 'normalized' : blocked ? 'blocked' : mode === 'games' ? 'allowed' : qa ? 'qa-only' : 'unavailable'
    });
    function payload(mode, prior, routeSource, state, loadState, failureReason, normalized, sequence) {
        return { mode, previousMode: prior, routeSource, ...state, loadState, failureReason,
            routeNormalized: normalized, shellVersion: 'SimplifiedPlayShell@1.7.0', selectionSequence: sequence };
    }
    function publish(eventId, value) { const event = A.createEvent(eventId, value); return event ? A.emit(event) : null; }
    function observeRoute(route) {
        if (!route || route.section !== 'play') return;
        const requested = C.MODES.includes(route.requestedMode) ? route.requestedMode : route.mode;
        const qa = route.query?.simplified === '1'; const routeSource = source(route.source);
        const routeSignature = [route.mode, requested, route.status, qa].join('|');
        if (routeSignature === lastRouteSignature && currentMode === route.mode) {
            A.emit(A.createEvent('play_mode_selected', payload(route.mode, previousMode, routeSource,
                eligibility(route.mode, qa), route.mode === 'games' ? 'eager' : 'unknown', 'none', false,
                Math.max(selectionSequence, 1))));
            return;
        }
        lastRouteSignature = routeSignature;
        const normalized = requested !== route.mode || ['canonicalized', 'inactive-mode', 'unknown-mode', 'legacy-adapted'].includes(route.status);
        const prior = C.PREVIOUS_MODES.includes(previousMode) ? previousMode : 'unknown'; const cycle = ++selectionSequence;
        if (requested !== route.mode && C.MODES.includes(requested)) {
            publish('play_mode_selection_blocked', payload(requested, prior, routeSource,
                eligibility(requested, false, true, false), 'unavailable', 'blocked', true, cycle));
            publish('play_mode_route_normalized', payload(route.mode, prior, routeSource,
                eligibility(route.mode, qa, false, true), route.mode === 'games' ? 'eager' : 'unknown', 'none', true, cycle));
        } else if (normalized) publish('play_mode_route_normalized', payload(route.mode, prior, routeSource,
            eligibility(route.mode, qa, false, true), route.mode === 'games' ? 'eager' : 'unknown', 'none', true, cycle));
        publish('play_mode_selected', payload(route.mode, prior, routeSource, eligibility(route.mode, qa),
            route.mode === 'games' ? 'eager' : 'unknown', 'none', normalized, cycle));
        previousMode = route.mode; currentMode = route.mode;
    }
    function observeLoad(resourceId, state, reason = 'none') {
        const mode = resourceModes[resourceId]; if (!mode || !C.LOAD_STATES.includes(state)) return false;
        if (state === 'started') activeLoads.set(resourceId, { mode, sequence: selectionSequence, source: 'mode-tab' });
        const active = activeLoads.get(resourceId); if (!active) return false;
        if (state === 'succeeded' && currentMode !== mode) { activeLoads.delete(resourceId); return false; }
        const eventId = state === 'started' || state === 'deduplicated' ? 'play_mode_load_started' : state === 'failed' ? 'play_mode_load_failed'
            : state === 'succeeded' ? 'play_mode_load_succeeded' : null;
        if (!eventId) return false;
        publish(eventId, payload(mode, previousMode, active.source, eligibility(mode, true), state,
            C.FAILURE_REASONS.includes(reason) ? reason : 'unknown', false, active.sequence || 1));
        if (!['started', 'deduplicated'].includes(state)) activeLoads.delete(resourceId); return true;
    }
    function init() {
        if (unsubscribe || !root.CaissaPlayRouteController?.subscribe) return false;
        unsubscribe = root.CaissaPlayRouteController.subscribe(observeRoute);
        const route = root.CaissaPlayRouteController.getCurrent?.(); if (route) observeRoute(route); return true;
    }
    function dispose() { unsubscribe?.(); unsubscribe = null; activeLoads.clear(); }
    root.CaissaPlayModeSelectionAnalytics = Object.freeze({ VERSION: 'PlayModeSelectionAnalytics@1.0.0', init,
        observeRoute, observeLoad, inspect: () => C.freeze({ initialized: !!unsubscribe, currentMode, previousMode,
            selectionSequence, activeLoads: activeLoads.size }), dispose });
    init();
})(typeof window !== 'undefined' ? window : globalThis);
