(function installHumanPlayInfrastructureContracts(global) {
    'use strict';
    const VERSION = '1.0.0';
    const CATEGORIES = Object.freeze([
        'available-now', 'provider-entry', 'provider-owned', 'presentation-only',
        'contract-ready', 'coming-later', 'blocked', 'unsupported', 'unavailable', 'unknown'
    ]);
    const BLOCKERS = Object.freeze([
        'PROPRIETARY_BACKEND_UNAVAILABLE', 'PRESENCE_SOURCE_UNAVAILABLE',
        'CHALLENGE_EVENT_STREAM_UNAVAILABLE', 'HUMAN_HANDOFF_UNAVAILABLE',
        'SERVER_AUTHORITY_UNAVAILABLE', 'CLOCK_AUTHORITY_UNAVAILABLE',
        'MOVE_AUTHORITY_UNAVAILABLE', 'RESULT_AUTHORITY_UNAVAILABLE',
        'RECONNECT_AUTHORITY_UNAVAILABLE', 'FRIEND_SYSTEM_UNAVAILABLE',
        'HUMAN_HISTORY_UNAVAILABLE', 'MATCHMAKING_UNAVAILABLE',
        'RATING_BACKEND_UNAVAILABLE', 'INVITATION_BACKEND_UNAVAILABLE',
        'LOCAL_RUNTIME_UNAVAILABLE', 'PRODUCTION_ROLLOUT_NOT_APPROVED',
        'PROVIDER_CONNECTION_REQUIRED', 'PROVIDER_ENTRY_ONLY', 'QA_ONLY', 'UNKNOWN'
    ]);
    const ACTIONS = Object.freeze([
        'open-fics', 'connect-fics', 'open-classic', 'create-classic-table',
        'return-to-games', 'view-capability-details', 'refresh-capabilities',
        'find-match', 'challenge-player', 'add-friend', 'invite-friend',
        'start-local-human-game', 'start-rated-game', 'start-casual-human-game'
    ]);
    const CAPABILITY_IDS = Object.freeze([
        'fics-login', 'fics-lobby', 'fics-seeks', 'fics-games', 'fics-server-clocks',
        'fics-reconnect', 'classic-lobby', 'classic-table-creation', 'classic-sit',
        'classic-watch', 'caissa-presence', 'caissa-friends', 'caissa-challenges',
        'caissa-matchmaking', 'caissa-rated-play', 'caissa-casual-human-play',
        'caissa-human-board-runtime', 'caissa-server-clocks', 'caissa-reconnect',
        'caissa-human-game-record', 'caissa-post-game-analysis', 'local-human-play',
        'invitation-links', 'recent-human-opponents', 'suggested-players',
        'tournament-human-entry'
    ]);
    const PROVIDERS = Object.freeze(['fics', 'caissa-classic', 'local', 'future-caissa-network']);
    const forbidden = new Set(['__proto__', 'prototype', 'constructor']);
    const counters = {
        capabilityEvaluations: 0, availableNow: 0, providerEntry: 0,
        comingLater: 0, blocked: 0, unsupported: 0, actionsInvoked: 0,
        actionFailures: 0, snapshotsCreated: 0, disposals: 0, lastReasonCode: null
    };
    function freeze(value) {
        if (value && typeof value === 'object' && !Object.isFrozen(value)) {
            Object.values(value).forEach(freeze); Object.freeze(value);
        }
        return value;
    }
    function safe(value, seen = new WeakSet()) {
        if (!value || typeof value !== 'object') return true;
        if (seen.has(value)) return false;
        seen.add(value);
        if (Array.isArray(value)) return value.every(item => safe(item, seen));
        return !Object.keys(value).some(key => forbidden.has(key))
            && Object.values(value).every(item => typeof item !== 'function' && safe(item, seen));
    }
    const bounded = (value, max) => typeof value === 'string' && value.length > 0 && value.length <= max
        && !/[\u0000-\u001f<>]/.test(value) ? value : null;
    function createCapability(input = {}) {
        if (!safe(input) || input.schemaVersion && input.schemaVersion !== VERSION) return null;
        if (!CAPABILITY_IDS.includes(input.capabilityId) || !CATEGORIES.includes(input.category)
            || !PROVIDERS.includes(input.provider)) return null;
        const label = bounded(input.label, 80), owner = bounded(input.owner, 64);
        if (!label || !owner || !Array.isArray(input.limitations) || !Array.isArray(input.blockers)
            || !Array.isArray(input.evidence) || input.limitations.length > 4
            || input.blockers.length > 8 || input.evidence.length > 4
            || input.blockers.some(code => !BLOCKERS.includes(code))) return null;
        const actionId = input.actionId == null ? null : ACTIONS.includes(input.actionId) ? input.actionId : false;
        const strings = [...input.limitations, ...input.evidence];
        if (actionId === false || strings.some(value => !bounded(value, 180))) return null;
        const actionable = input.actionable === true && actionId !== null;
        const value = freeze({
            schemaVersion: VERSION, capabilityId: input.capabilityId, label,
            category: input.category, provider: input.provider, owner,
            available: input.category === 'available-now',
            actionable, actionId: actionable ? actionId : null,
            limitations: freeze([...input.limitations]), blockers: freeze([...input.blockers]),
            evidence: freeze([...input.evidence]), qaOnly: true, productionReady: false
        });
        counters.capabilityEvaluations += 1;
        const key = input.category === 'available-now' ? 'availableNow'
            : input.category === 'provider-entry' ? 'providerEntry'
                : input.category === 'coming-later' ? 'comingLater'
                    : input.category === 'blocked' ? 'blocked'
                        : input.category === 'unsupported' ? 'unsupported' : null;
        if (key) counters[key] += 1;
        return value;
    }
    function noteAction(ok, reasonCode) {
        counters.actionsInvoked += 1;
        if (!ok) counters.actionFailures += 1;
        counters.lastReasonCode = BLOCKERS.includes(reasonCode) ? reasonCode : null;
    }
    function noteSnapshot() { counters.snapshotsCreated += 1; }
    global.CaissaHumanPlayInfrastructureContracts = freeze({
        schemaVersion: VERSION, categories: CATEGORIES, blockers: BLOCKERS, actions: ACTIONS,
        capabilityIds: CAPABILITY_IDS, providers: PROVIDERS, createCapability,
        noteAction, noteSnapshot, inspect: () => freeze({ ...counters })
    });
})(typeof window !== 'undefined' ? window : globalThis);
