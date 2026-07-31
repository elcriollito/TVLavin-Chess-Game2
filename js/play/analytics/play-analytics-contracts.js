(function (root) {
    'use strict';
    const freeze = value => {
        if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
        Object.values(value).forEach(freeze); return Object.freeze(value);
    };
    const values = list => Object.freeze(list);
    const MODE_EVENT_IDS = values(['play_mode_selected', 'play_mode_load_started', 'play_mode_load_succeeded',
        'play_mode_load_failed', 'play_mode_selection_blocked', 'play_mode_route_normalized']);
    const GAME_START_EVENT_IDS = values(['play_game_start_requested', 'play_game_start_succeeded',
        'play_game_start_failed', 'play_game_start_blocked', 'play_game_start_deduplicated']);
    const EVENT_IDS = values([...MODE_EVENT_IDS, ...GAME_START_EVENT_IDS]);
    const MODES = values(['games', 'bots', 'coach', 'players']);
    const PREVIOUS_MODES = values([...MODES, 'none', 'unknown']);
    const ROUTE_SOURCES = values(['direct', 'mode-tab', 'primary-navigation', 'browser-back', 'browser-forward',
        'browser-history', 'cold-restore', 'legacy-bridge', 'classic-bridge', 'qa-entry', 'unknown']);
    const ACCESS_STATES = values(['allowed', 'qa-only', 'blocked', 'unavailable', 'normalized', 'unknown']);
    const LOAD_STATES = values(['eager', 'not-required', 'started', 'succeeded', 'failed', 'deduplicated', 'unavailable', 'unknown']);
    const FAILURE_REASONS = values(['none', 'timeout', 'missing-resource', 'readiness-failed', 'dependency-failed', 'blocked', 'disposed', 'unknown']);
    const PAYLOAD_KEYS = values(['mode', 'previousMode', 'routeSource', 'qaEligible', 'productionEligible',
        'accessState', 'loadState', 'failureReason', 'routeNormalized', 'shellVersion', 'selectionSequence']);
    const START_SOURCES = values(['primary-cta', 'rematch', 'new-game', 'direct-restore', 'provider-entry', 'unknown']);
    const TIME_CONTROL_CATEGORIES = values(['bullet', 'blitz', 'rapid', 'classical', 'custom', 'untimed', 'provider-owned', 'unknown']);
    const COLOR_CATEGORIES = values(['white', 'black', 'random', 'provider-assigned', 'unknown']);
    const OPPONENT_TYPES = values(['engine', 'bot-catalog', 'coach-engine', 'human-provider', 'human-unavailable', 'none', 'unknown']);
    const ASSISTANCE_CATEGORIES = values(['unassisted', 'coach-assisted', 'engine-opponent', 'provider-owned', 'blocked', 'unknown']);
    const START_STATES = values(['requested', 'succeeded', 'failed', 'blocked', 'deduplicated', 'stale', 'unknown']);
    const START_FAILURE_REASONS = values(['invalid-configuration', 'dependency-unavailable', 'engine-unavailable',
        'lifecycle-rejected', 'fairplay-denied', 'provider-unavailable', 'production-blocked', 'stale-action',
        'duplicate-action', 'disposed', 'unknown']);
    const START_PAYLOAD_KEYS = values(['mode', 'startSource', 'timeControlCategory', 'colorCategory', 'opponentType',
        'assistanceCategory', 'startState', 'failureReason', 'qaEligible', 'productionEligible', 'attemptSequence', 'shellVersion']);
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
    function validateStartPayload(payload) {
        return exact(payload, START_PAYLOAD_KEYS) && MODES.includes(payload.mode)
            && START_SOURCES.includes(payload.startSource) && TIME_CONTROL_CATEGORIES.includes(payload.timeControlCategory)
            && COLOR_CATEGORIES.includes(payload.colorCategory) && OPPONENT_TYPES.includes(payload.opponentType)
            && ASSISTANCE_CATEGORIES.includes(payload.assistanceCategory) && START_STATES.includes(payload.startState)
            && START_FAILURE_REASONS.includes(payload.failureReason) && typeof payload.qaEligible === 'boolean'
            && typeof payload.productionEligible === 'boolean' && integer(payload.attemptSequence)
            && /^SimplifiedPlayShell@\d+\.\d+\.\d+$/.test(payload.shellVersion);
    }
    function validateEvent(event) {
        return exact(event, EVENT_KEYS) && event.schemaVersion === 'PlayAnalyticsEvent@1.0.0'
            && EVENT_IDS.includes(event.eventId) && event.eventVersion === '1.0.0' && event.occurredAtBucket === null
            && integer(event.sequence) && (MODE_EVENT_IDS.includes(event.eventId)
                ? event.category === 'play-mode' && ROUTE_SOURCES.includes(event.source) && validatePayload(event.payload)
                : event.category === 'play-game-start' && START_SOURCES.includes(event.source) && validateStartPayload(event.payload));
    }
    function createEvent(eventId, payload, sequence) {
        const modeEvent = MODE_EVENT_IDS.includes(eventId);
        if (!EVENT_IDS.includes(eventId) || !(modeEvent ? validatePayload(payload) : validateStartPayload(payload)) || !integer(sequence)) return null;
        return freeze({ schemaVersion: 'PlayAnalyticsEvent@1.0.0', eventId, eventVersion: '1.0.0',
            category: modeEvent ? 'play-mode' : 'play-game-start', occurredAtBucket: null, sequence,
            source: modeEvent ? payload.routeSource : payload.startSource,
            payload: { ...payload } });
    }
    root.CaissaPlayAnalyticsContracts = freeze({ VERSION: 'PlayAnalyticsEvent@1.0.0', PAYLOAD_VERSION: 'PlayModeSelectionPayload@1.0.0',
        EVENT_IDS, MODE_EVENT_IDS, GAME_START_EVENT_IDS, MODES, PREVIOUS_MODES, ROUTE_SOURCES, ACCESS_STATES,
        LOAD_STATES, FAILURE_REASONS, START_SOURCES, TIME_CONTROL_CATEGORIES, COLOR_CATEGORIES, OPPONENT_TYPES,
        ASSISTANCE_CATEGORIES, START_STATES, START_FAILURE_REASONS, PAYLOAD_KEYS, START_PAYLOAD_KEYS, EVENT_KEYS,
        validatePayload, validateStartPayload, validateEvent, createEvent, freeze });
})(typeof window !== 'undefined' ? window : globalThis);
