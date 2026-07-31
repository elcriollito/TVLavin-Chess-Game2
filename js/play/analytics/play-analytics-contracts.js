(function (root) {
    'use strict';
    const freeze = value => {
        if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
        Object.values(value).forEach(freeze); return Object.freeze(value);
    };
    const values = list => Object.freeze(list);
    const EVENT_IDS = values(['play_mode_selected', 'play_mode_load_started', 'play_mode_load_succeeded',
        'play_mode_load_failed', 'play_mode_selection_blocked', 'play_mode_route_normalized']);
    const MODES = values(['games', 'bots', 'coach', 'players']);
    const PREVIOUS_MODES = values([...MODES, 'none', 'unknown']);
    const ROUTE_SOURCES = values(['direct', 'mode-tab', 'primary-navigation', 'browser-back', 'browser-forward',
        'browser-history', 'cold-restore', 'legacy-bridge', 'classic-bridge', 'qa-entry', 'unknown']);
    const ACCESS_STATES = values(['allowed', 'qa-only', 'blocked', 'unavailable', 'normalized', 'unknown']);
    const LOAD_STATES = values(['eager', 'not-required', 'started', 'succeeded', 'failed', 'deduplicated', 'unavailable', 'unknown']);
    const FAILURE_REASONS = values(['none', 'timeout', 'missing-resource', 'readiness-failed', 'dependency-failed', 'blocked', 'disposed', 'unknown']);
    const PAYLOAD_KEYS = values(['mode', 'previousMode', 'routeSource', 'qaEligible', 'productionEligible',
        'accessState', 'loadState', 'failureReason', 'routeNormalized', 'shellVersion', 'selectionSequence']);
    const EVENT_KEYS = values(['schemaVersion', 'eventId', 'eventVersion', 'category', 'occurredAtBucket', 'sequence', 'source', 'payload']);
    const dangerous = key => ['__proto__', 'prototype', 'constructor'].includes(key);
    const exact = (object, keys) => object && typeof object === 'object' && !Array.isArray(object)
        && Object.keys(object).length === keys.length && Object.keys(object).every(key => keys.includes(key) && !dangerous(key));
    const integer = value => Number.isSafeInteger(value) && value > 0 && value <= Number.MAX_SAFE_INTEGER;
    function validatePayload(payload) {
        return exact(payload, PAYLOAD_KEYS) && MODES.includes(payload.mode) && PREVIOUS_MODES.includes(payload.previousMode)
            && ROUTE_SOURCES.includes(payload.routeSource) && typeof payload.qaEligible === 'boolean'
            && typeof payload.productionEligible === 'boolean' && ACCESS_STATES.includes(payload.accessState)
            && LOAD_STATES.includes(payload.loadState) && FAILURE_REASONS.includes(payload.failureReason)
            && typeof payload.routeNormalized === 'boolean' && /^SimplifiedPlayShell@\d+\.\d+\.\d+$/.test(payload.shellVersion)
            && integer(payload.selectionSequence);
    }
    function validateEvent(event) {
        return exact(event, EVENT_KEYS) && event.schemaVersion === 'PlayAnalyticsEvent@1.0.0'
            && EVENT_IDS.includes(event.eventId) && event.eventVersion === '1.0.0' && event.category === 'play-mode'
            && event.occurredAtBucket === null && integer(event.sequence) && ROUTE_SOURCES.includes(event.source)
            && validatePayload(event.payload);
    }
    function createEvent(eventId, payload, sequence) {
        if (!EVENT_IDS.includes(eventId) || !validatePayload(payload) || !integer(sequence)) return null;
        return freeze({ schemaVersion: 'PlayAnalyticsEvent@1.0.0', eventId, eventVersion: '1.0.0',
            category: 'play-mode', occurredAtBucket: null, sequence, source: payload.routeSource,
            payload: { ...payload } });
    }
    root.CaissaPlayAnalyticsContracts = freeze({ VERSION: 'PlayAnalyticsEvent@1.0.0', PAYLOAD_VERSION: 'PlayModeSelectionPayload@1.0.0',
        EVENT_IDS, MODES, PREVIOUS_MODES, ROUTE_SOURCES, ACCESS_STATES, LOAD_STATES, FAILURE_REASONS,
        PAYLOAD_KEYS, EVENT_KEYS, validatePayload, validateEvent, createEvent, freeze });
})(typeof window !== 'undefined' ? window : globalThis);
