(function installHumanFairPlayContracts(global) {
    'use strict';
    const VERSION = '1.0.0';
    const GAME_TYPES = Object.freeze(['human-rated', 'human-casual', 'human-assisted-casual', 'human-observed', 'unknown']);
    const RATING_MODES = Object.freeze(['rated', 'casual', 'unrated', 'unknown']);
    const ASSISTANCE_MODES = Object.freeze(['prohibited', 'post-game-only', 'mutually-assisted', 'spectator-delayed', 'unknown']);
    const ENGINE_ACTIONS = Object.freeze(['terminate', 'suspend', 'isolate', 'deny-request', 'post-game-allow', 'unavailable']);
    const AUTHORITIES = Object.freeze(['provider', 'caissa', 'local', 'shared', 'unavailable', 'unknown']);
    const RECONNECT_STATES = Object.freeze(['connected', 'reconnecting', 'resynchronizing', 'restored', 'failed', 'unavailable']);
    const READINESS_STATUSES = Object.freeze(['ready-provider-owned', 'assisted-ready', 'blocked', 'incomplete', 'unsupported', 'unknown']);
    const REASON_CODES = Object.freeze(['HUMAN_ENGINE_PROHIBITED', 'HUMAN_EVALUATION_FROZEN',
        'PROVIDER_AUTHORITY_REQUIRED', 'CLOCK_AUTHORITY_REQUIRED', 'MOVE_AUTHORITY_REQUIRED',
        'RESULT_AUTHORITY_REQUIRED', 'RECONNECT_AUTHORITY_REQUIRED', 'RATED_ASSISTANCE_PROHIBITED',
        'CASUAL_ASSISTANCE_DEFAULT_DENY', 'MUTUAL_ASSISTANCE_UNPROVEN', 'UNKNOWN_GAME_TYPE',
        'UNKNOWN_RATING_MODE', 'PROVIDER_TERMINAL_REQUIRED', 'POST_GAME_ANALYSIS_ALLOWED',
        'FICS_PROVIDER_OWNED', 'CLASSIC_INHERITS_FICS', 'CAISSA_BACKEND_UNAVAILABLE',
        'LOCAL_HUMAN_RUNTIME_UNAVAILABLE']);
    const issued = new WeakSet();
    let sequence = 0;
    const counters = { contexts: 0, decisions: 0, deniedEngineRequests: 0, staleRequestsCanceled: 0 };
    function freeze(value) {
        if (value && typeof value === 'object' && !Object.isFrozen(value)) {
            Object.values(value).forEach(freeze); Object.freeze(value);
        }
        return value;
    }
    const member = (value, values, fallback) => values.includes(value) ? value : fallback;
    const text = (value, max = 120) => typeof value === 'string' && value ? value.slice(0, max) : null;
    function createContext(input = {}) {
        if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
        const authority = input.authority && typeof input.authority === 'object' ? input.authority : {};
        const context = freeze({
            schemaVersion: VERSION, contextId: text(input.contextId) || `human-fair-play:${++sequence}`,
            provider: text(input.provider, 48) || 'unknown', providerGameId: text(input.providerGameId),
            gameType: member(input.gameType, GAME_TYPES, 'unknown'),
            ratingMode: member(input.ratingMode, RATING_MODES, 'unknown'),
            assistanceMode: member(input.assistanceMode, ASSISTANCE_MODES, 'unknown'),
            playerRole: member(input.playerRole, ['player', 'spectator', 'unknown'], 'unknown'),
            authority: freeze(Object.fromEntries(['server', 'clock', 'move', 'result', 'reconnect']
                .map(key => [key, member(authority[key], AUTHORITIES, 'unknown')]))),
            enginePolicy: member(input.enginePolicy, ENGINE_ACTIONS, 'unavailable'),
            evaluationPolicy: member(input.evaluationPolicy, ['frozen', 'post-game', 'delayed', 'unavailable'], 'unavailable'),
            postGamePolicy: member(input.postGamePolicy, ['provider-terminal-required', 'allowed', 'unavailable'], 'unavailable'),
            sourceConfidence: member(input.sourceConfidence, ['provider-confirmed', 'inherited', 'unavailable', 'unknown'], 'unknown'),
            providerTerminal: input.providerTerminal === true,
            mutualAssistanceEvidence: input.mutualAssistanceEvidence === true,
            providerAssistanceCapability: input.providerAssistanceCapability === true,
            reconnectState: member(input.reconnectState, RECONNECT_STATES, 'unavailable')
        });
        counters.contexts += 1; return context;
    }
    function createDecision(context, status, reasons, options = {}) {
        const value = freeze({
            schemaVersion: VERSION, decisionId: `human-fair-play-decision:${++sequence}`,
            context, status, ready: ['ready-provider-owned', 'assisted-ready'].includes(status),
            reasonCodes: freeze([...new Set(reasons)]),
            engineAction: options.engineAction || 'deny-request',
            evaluationMode: options.evaluationMode || 'frozen',
            postGameAnalysisEligible: options.postGameAnalysisEligible === true,
            gameRecordReady: options.gameRecordReady === true
        });
        issued.add(value); counters.decisions += 1; return value;
    }
    function validateDecision(value) { return issued.has(value) && value?.schemaVersion === VERSION; }
    function noteDenied(stale = false) {
        counters.deniedEngineRequests += 1;
        if (stale) counters.staleRequestsCanceled += 1;
    }
    global.CaissaHumanFairPlay = freeze({
        schemaVersion: VERSION, gameTypes: GAME_TYPES, ratingModes: RATING_MODES,
        assistanceModes: ASSISTANCE_MODES, engineActions: ENGINE_ACTIONS, authorities: AUTHORITIES,
        reconnectStates: RECONNECT_STATES, readinessStatuses: READINESS_STATUSES,
        reasonCodes: REASON_CODES, createContext, createDecision, validateDecision, noteDenied,
        inspect: () => freeze({ ...counters })
    });
})(typeof window !== 'undefined' ? window : globalThis);
