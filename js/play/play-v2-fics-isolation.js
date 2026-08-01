(function installPlayV2FicsIsolation(root) {
    'use strict';

    const VERSION = '1.0.0';
    const CONTRACT_ID = `PlayV2FicsIsolation@${VERSION}`;
    if (root.CaissaPlayV2FicsIsolation?.contractId === CONTRACT_ID) return;

    const POLICY = Object.freeze({
        playProvider: 'caissa-native',
        ficsProvider: 'prohibited',
        ficsFallback: 'prohibited',
        ficsIdentity: 'prohibited',
        ficsPresence: 'prohibited',
        ficsRatings: 'prohibited',
        ficsChallenges: 'prohibited',
        ficsMatchmaking: 'prohibited',
        ficsGameServer: 'prohibited',
        ficsClocks: 'prohibited',
        ficsReconnect: 'prohibited',
        classicOwnership: 'separate',
        legacyFicsOwnership: 'separate',
        playersRuntime: 'blocked'
    });
    const ALLOWED_DYNAMIC_GROUPS = Object.freeze([
        'bots-stack', 'coach-stack', 'mentor-foundation', 'mentor-analysis',
        'mentor-critical-moments', 'mentor-guided-replay', 'mentor-knowledge',
        'mentor-summary', 'analyze-deep'
    ]);
    const ALLOWED_MODES = Object.freeze(['games', 'bots', 'coach']);
    const ALLOWED_TRANSITIONS = Object.freeze(['analyze']);
    const ALLOWED_PROVIDERS = Object.freeze(['caissa-native', 'local-machine']);
    const RESOURCE_TYPES = Object.freeze([
        'dynamic-group', 'script', 'style', 'worker', 'route', 'transition', 'network', 'provider'
    ]);
    const FORBIDDEN_RESOURCE = /(?:^|[\/_-])fics(?:[\/_?&#.-]|$)|players-stack|players-panel|js\/play\/players\//i;
    const FORBIDDEN_PROVIDER = /fics|classic|legacy|external/i;
    const counters = { checks: 0, allowed: 0, denied: 0 };

    function freeze(value) {
        if (value && typeof value === 'object' && !Object.isFrozen(value)) {
            Object.values(value).forEach(freeze);
            Object.freeze(value);
        }
        return value;
    }
    function result(allowed, type, reasonCode) {
        counters.checks += 1;
        counters[allowed ? 'allowed' : 'denied'] += 1;
        return freeze({ contractId: CONTRACT_ID, allowed, type, reasonCode });
    }
    function sameOrigin(value, baseOrigin) {
        try {
            const url = new URL(String(value), baseOrigin || root.location?.origin || 'http://localhost');
            return !!baseOrigin && url.origin === baseOrigin;
        } catch (_) {
            return false;
        }
    }
    function authorize(input = {}) {
        const type = String(input.type || '');
        const value = String(input.value || '');
        if (!RESOURCE_TYPES.includes(type) || !value || value.length > 2048)
            return result(false, type || 'unknown', 'INVALID_RESOURCE');
        if (FORBIDDEN_RESOURCE.test(value)) return result(false, type, 'PROHIBITED_FICS_OR_PLAYERS_RESOURCE');
        if (type === 'dynamic-group')
            return result(ALLOWED_DYNAMIC_GROUPS.includes(value), type,
                ALLOWED_DYNAMIC_GROUPS.includes(value) ? 'ALLOWLISTED_GROUP' : 'GROUP_NOT_ALLOWLISTED');
        if (type === 'provider') {
            const allowed = ALLOWED_PROVIDERS.includes(value) && !FORBIDDEN_PROVIDER.test(value);
            return result(allowed, type, allowed ? 'NATIVE_PROVIDER' : 'PROVIDER_PROHIBITED');
        }
        if (type === 'route') {
            const path = value.split('?')[0].replace(/\/+$/, '') || '/';
            const allowed = /^\/play(?:\/(?:games|bots|coach)|\/beta(?:\/(?:games|bots))?)?$/.test(path);
            return result(allowed, type, allowed ? 'PLAY_ROUTE_ALLOWED' : 'ROUTE_PROHIBITED');
        }
        if (type === 'transition')
            return result(ALLOWED_TRANSITIONS.includes(value), type,
                ALLOWED_TRANSITIONS.includes(value) ? 'EXTERNAL_CONTINUATION_ALLOWED' : 'TRANSITION_PROHIBITED');
        if (type === 'network') {
            const allowed = sameOrigin(value, input.baseOrigin);
            return result(allowed, type, allowed ? 'SAME_ORIGIN_ONLY' : 'NETWORK_DESTINATION_PROHIBITED');
        }
        if (type === 'worker') {
            const allowed = /^(?:\.\/|\/)?(?:engine\/[^?#]+|stockfish-worker\.js)(?:[?#].*)?$/i.test(value);
            return result(allowed, type, allowed ? 'WORKER_RESOURCE_ALLOWED' : 'WORKER_RESOURCE_PROHIBITED');
        }
        const allowed = /^(?:css|js)\/[a-z0-9_./-]+(?:\?v=[a-z0-9_.-]+)?$/i.test(value);
        return result(allowed, type, allowed ? 'OWNED_RESOURCE_ALLOWED' : 'RESOURCE_NOT_ALLOWLISTED');
    }
    function requireAllowed(input) {
        const decision = authorize(input);
        if (!decision.allowed) throw new Error(decision.reasonCode);
        return decision;
    }
    const api = freeze({
        schemaVersion: VERSION,
        contractId: CONTRACT_ID,
        policy: POLICY,
        resourceTypes: RESOURCE_TYPES,
        allowedDynamicGroups: ALLOWED_DYNAMIC_GROUPS,
        allowedModes: ALLOWED_MODES,
        allowedTransitions: ALLOWED_TRANSITIONS,
        allowedProviders: ALLOWED_PROVIDERS,
        authorize,
        requireAllowed,
        isModeAllowed: mode => ALLOWED_MODES.includes(String(mode || '')),
        isProviderAllowed: provider => authorize({ type: 'provider', value: provider }).allowed,
        inspect: () => freeze({ contractId: CONTRACT_ID, counters: { ...counters } })
    });
    root.CaissaPlayV2FicsIsolation = api;
})(typeof window !== 'undefined' ? window : globalThis);
