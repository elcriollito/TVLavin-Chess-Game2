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
    const COMPLETION_EVENT_IDS = values(['play_game_completed', 'play_game_aborted', 'play_game_completion_failed']);
    const POSTGAME_EVENT_IDS = values(['play_postgame_shown', 'play_postgame_action_selected',
        'play_postgame_action_succeeded', 'play_postgame_action_failed', 'play_postgame_action_blocked']);
    const MENTOR_EVENT_IDS = values(['play_mentor_review_requested', 'play_mentor_review_ready', 'play_mentor_review_failed',
        'play_mentor_critical_moments_opened', 'play_mentor_guided_replay_started', 'play_mentor_replay_attempted',
        'play_mentor_reference_revealed', 'play_mentor_knowledge_opened', 'play_mentor_summary_requested',
        'play_mentor_summary_ready', 'play_mentor_summary_failed', 'play_mentor_exited']);
    const EVENT_IDS = values([...MODE_EVENT_IDS, ...GAME_START_EVENT_IDS, ...COMPLETION_EVENT_IDS, ...POSTGAME_EVENT_IDS, ...MENTOR_EVENT_IDS]);
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
    const COMPLETION_STATES = values(['completed', 'aborted', 'failed', 'stale', 'deduplicated', 'unknown']);
    const RESULT_CATEGORIES = values(['white-win', 'black-win', 'draw', 'no-result', 'unknown']);
    const TERMINATION_CATEGORIES = values(['checkmate', 'resignation', 'timeout', 'stalemate', 'repetition',
        'fifty-move', 'insufficient-material', 'draw-agreement', 'disconnect', 'aborted', 'provider-owned', 'technical-failure', 'unknown']);
    const DURATION_BUCKETS = values(['under-1-minute', '1-to-3-minutes', '3-to-10-minutes', '10-to-30-minutes',
        'over-30-minutes', 'untimed', 'provider-owned', 'unavailable', 'unknown']);
    const POSTGAME_ACTIONS = values(['rematch', 'analyze', 'mentor-review', 'guided-replay', 'mentor-summary',
        'pgn-copy', 'pgn-download', 'new-game', 'back', 'unknown']);
    const ACTION_STATES = values(['selected', 'succeeded', 'failed', 'blocked', 'deduplicated', 'stale', 'unavailable', 'unknown']);
    const ACTION_FAILURE_REASONS = values(['dependency-unavailable', 'invalid-game-record', 'stale-session',
        'clipboard-unavailable', 'download-unavailable', 'analyze-unavailable', 'mentor-unavailable',
        'replay-unavailable', 'summary-unavailable', 'production-blocked', 'disposed', 'unknown']);
    const COMPLETION_PAYLOAD_KEYS = values(['mode', 'completionState', 'resultCategory', 'terminationCategory',
        'durationBucket', 'opponentType', 'assistanceCategory', 'qaEligible', 'productionEligible',
        'completionSequence', 'startAttemptSequence', 'shellVersion']);
    const POSTGAME_PAYLOAD_KEYS = values(['mode', 'action', 'actionState', 'failureReason', 'resultCategory',
        'terminationCategory', 'source', 'qaEligible', 'productionEligible', 'completionSequence', 'actionSequence', 'shellVersion']);
    const MENTOR_ENGAGEMENTS = values(['review', 'critical-moments', 'guided-replay', 'replay-attempt', 'reference-reveal', 'knowledge', 'summary', 'exit', 'unknown']);
    const MENTOR_STAGES = values(['postgame', 'review-request', 'review-ready', 'critical-moments', 'guided-replay', 'replay-attempt', 'reference', 'knowledge', 'summary-request', 'summary-ready', 'exit', 'unknown']);
    const MENTOR_STATES = values(['requested', 'ready', 'opened', 'started', 'attempted', 'revealed', 'succeeded', 'failed', 'blocked', 'stale', 'deduplicated', 'exited', 'unavailable', 'unknown']);
    const ATTEMPT_CATEGORIES = values(['accepted', 'rejected', 'invalid', 'unavailable', 'unknown']);
    const CONCEPT_CATEGORIES = values(['pawn-endgame', 'king-activity', 'opposition', 'passed-pawn', 'pawn-structure', 'simplification', 'calculation', 'tactical', 'strategic', 'general', 'unknown']);
    const MENTOR_SOURCES = values(['postgame-cta', 'critical-moment-card', 'guided-replay-cta', 'replay-control', 'knowledge-link', 'summary-cta', 'back-action', 'close-action', 'unknown']);
    const MENTOR_FAILURE_REASONS = values(['invalid-game-record', 'analysis-unavailable', 'dependency-unavailable', 'critical-moments-unavailable', 'replay-unavailable', 'replay-expired', 'knowledge-unavailable', 'summary-unavailable', 'stale-session', 'canceled', 'disposed', 'production-blocked', 'unknown']);
    const MENTOR_PAYLOAD_KEYS = values(['engagement', 'stage', 'state', 'attemptCategory', 'conceptCategory', 'source', 'failureReason', 'qaEligible', 'productionEligible', 'completionSequence', 'engagementSequence', 'shellVersion']);
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
    function validateCompletionPayload(payload) {
        return exact(payload, COMPLETION_PAYLOAD_KEYS) && MODES.includes(payload.mode)
            && COMPLETION_STATES.includes(payload.completionState) && RESULT_CATEGORIES.includes(payload.resultCategory)
            && TERMINATION_CATEGORIES.includes(payload.terminationCategory) && DURATION_BUCKETS.includes(payload.durationBucket)
            && OPPONENT_TYPES.includes(payload.opponentType) && ASSISTANCE_CATEGORIES.includes(payload.assistanceCategory)
            && typeof payload.qaEligible === 'boolean' && typeof payload.productionEligible === 'boolean'
            && integer(payload.completionSequence) && (payload.startAttemptSequence === 0 || integer(payload.startAttemptSequence))
            && /^SimplifiedPlayShell@\d+\.\d+\.\d+$/.test(payload.shellVersion);
    }
    function validatePostGamePayload(payload) {
        return exact(payload, POSTGAME_PAYLOAD_KEYS) && MODES.includes(payload.mode) && POSTGAME_ACTIONS.includes(payload.action)
            && ACTION_STATES.includes(payload.actionState) && ACTION_FAILURE_REASONS.includes(payload.failureReason)
            && RESULT_CATEGORIES.includes(payload.resultCategory) && TERMINATION_CATEGORIES.includes(payload.terminationCategory)
            && payload.source === 'postgame' && typeof payload.qaEligible === 'boolean'
            && typeof payload.productionEligible === 'boolean' && integer(payload.completionSequence)
            && integer(payload.actionSequence) && /^SimplifiedPlayShell@\d+\.\d+\.\d+$/.test(payload.shellVersion);
    }
    function validateMentorPayload(payload) { return exact(payload, MENTOR_PAYLOAD_KEYS)
        && MENTOR_ENGAGEMENTS.includes(payload.engagement) && MENTOR_STAGES.includes(payload.stage)
        && MENTOR_STATES.includes(payload.state) && ATTEMPT_CATEGORIES.includes(payload.attemptCategory)
        && CONCEPT_CATEGORIES.includes(payload.conceptCategory) && MENTOR_SOURCES.includes(payload.source)
        && MENTOR_FAILURE_REASONS.includes(payload.failureReason) && typeof payload.qaEligible === 'boolean'
        && typeof payload.productionEligible === 'boolean' && (payload.completionSequence === 0 || integer(payload.completionSequence))
        && integer(payload.engagementSequence) && /^SimplifiedPlayShell@\d+\.\d+\.\d+$/.test(payload.shellVersion); }
    function validateEvent(event) {
        return exact(event, EVENT_KEYS) && event.schemaVersion === 'PlayAnalyticsEvent@1.0.0'
            && EVENT_IDS.includes(event.eventId) && event.eventVersion === '1.0.0' && event.occurredAtBucket === null
            && integer(event.sequence) && (MODE_EVENT_IDS.includes(event.eventId)
                ? event.category === 'play-mode' && ROUTE_SOURCES.includes(event.source) && validatePayload(event.payload)
                : GAME_START_EVENT_IDS.includes(event.eventId)
                    ? event.category === 'play-game-start' && START_SOURCES.includes(event.source) && validateStartPayload(event.payload)
                    : COMPLETION_EVENT_IDS.includes(event.eventId)
                        ? event.category === 'play-game-completion' && event.source === 'game-record' && validateCompletionPayload(event.payload)
                        : POSTGAME_EVENT_IDS.includes(event.eventId) ? event.category === 'play-postgame' && event.source === 'postgame' && validatePostGamePayload(event.payload)
                            : event.category === 'play-mentor' && event.source === 'mentor' && validateMentorPayload(event.payload));
    }
    function createEvent(eventId, payload, sequence) {
        const modeEvent = MODE_EVENT_IDS.includes(eventId), startEvent = GAME_START_EVENT_IDS.includes(eventId);
        const completionEvent = COMPLETION_EVENT_IDS.includes(eventId), postGameEvent = POSTGAME_EVENT_IDS.includes(eventId);
        const valid = modeEvent ? validatePayload(payload) : startEvent ? validateStartPayload(payload)
            : completionEvent ? validateCompletionPayload(payload) : postGameEvent ? validatePostGamePayload(payload) : validateMentorPayload(payload);
        if (!EVENT_IDS.includes(eventId) || !valid || !integer(sequence)) return null;
        return freeze({ schemaVersion: 'PlayAnalyticsEvent@1.0.0', eventId, eventVersion: '1.0.0',
            category: modeEvent ? 'play-mode' : startEvent ? 'play-game-start' : completionEvent ? 'play-game-completion' : postGameEvent ? 'play-postgame' : 'play-mentor',
            occurredAtBucket: null, sequence, source: modeEvent ? payload.routeSource : startEvent ? payload.startSource
                : completionEvent ? 'game-record' : postGameEvent ? 'postgame' : 'mentor',
            payload: { ...payload } });
    }
    root.CaissaPlayAnalyticsContracts = freeze({ VERSION: 'PlayAnalyticsEvent@1.0.0', PAYLOAD_VERSION: 'PlayModeSelectionPayload@1.0.0',
        EVENT_IDS, MODE_EVENT_IDS, GAME_START_EVENT_IDS, COMPLETION_EVENT_IDS, POSTGAME_EVENT_IDS, MENTOR_EVENT_IDS, MODES, PREVIOUS_MODES, ROUTE_SOURCES, ACCESS_STATES,
        LOAD_STATES, FAILURE_REASONS, START_SOURCES, TIME_CONTROL_CATEGORIES, COLOR_CATEGORIES, OPPONENT_TYPES,
        ASSISTANCE_CATEGORIES, START_STATES, START_FAILURE_REASONS, PAYLOAD_KEYS, START_PAYLOAD_KEYS, EVENT_KEYS,
        COMPLETION_STATES, RESULT_CATEGORIES, TERMINATION_CATEGORIES, DURATION_BUCKETS, POSTGAME_ACTIONS,
        ACTION_STATES, ACTION_FAILURE_REASONS, COMPLETION_PAYLOAD_KEYS, POSTGAME_PAYLOAD_KEYS,
        MENTOR_ENGAGEMENTS, MENTOR_STAGES, MENTOR_STATES, ATTEMPT_CATEGORIES, CONCEPT_CATEGORIES, MENTOR_SOURCES,
        MENTOR_FAILURE_REASONS, MENTOR_PAYLOAD_KEYS, validatePayload, validateStartPayload, validateCompletionPayload,
        validatePostGamePayload, validateMentorPayload, validateEvent, createEvent, freeze });
})(typeof window !== 'undefined' ? window : globalThis);
