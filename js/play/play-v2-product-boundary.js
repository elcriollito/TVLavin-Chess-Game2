(function installPlayV2ProductBoundary(root) {
    'use strict';

    const VERSION = '1.0.0';
    const CONTRACT_ID = `PlayV2ProductBoundary@${VERSION}`;
    if (root.CaissaPlayV2ProductBoundary?.contractId === CONTRACT_ID) return;

    const POLICY = Object.freeze({
        primaryPurpose: 'play', academySurface: 'prohibited', classes: 'prohibited',
        lessons: 'prohibited', courses: 'prohibited', curriculum: 'prohibited',
        endgameTrainer: 'prohibited', endgameLibrary: 'prohibited', knowledgeUnits: 'prohibited',
        guidedReplay: 'prohibited', masterySurface: 'prohibited', masteryWrites: 'prohibited',
        trainingMemorySurface: 'prohibited', trainingMemoryWrites: 'prohibited',
        trainingRecommendations: 'prohibited', educationalPromotions: 'prohibited',
        coachRuntime: 'allowed-internal-assistance-pending', mentorRuntime: 'allowed-internal-review-only',
        analyzeHandoff: 'external-post-game', mentorFutureBoundary: 'optional-review-only',
        playersRuntime: 'blocked'
    });
    const TYPES = Object.freeze(['dynamic-group', 'script', 'style', 'route', 'transition', 'action', 'dom', 'network']);
    const GROUPS = Object.freeze(['bots-stack', 'native-coach-stack', 'native-mentor-review', 'analyze-deep']);
    const ROUTES = Object.freeze(['/play', '/play/games', '/play/bots', '/play/coach', '/play/beta', '/play/beta/games', '/play/beta/bots', '/play/beta/coach']);
    const ACTIONS = Object.freeze(['rematch', 'new-game', 'copy-pgn', 'download-pgn', 'save-game', 'analyze', 'mentor-review']);
    const FORBIDDEN_RESOURCE = /(?:academy|coach|mentor|guided[-_/]?replay|educational|knowledge|training[-_/]?memory|mastery|endgame[-_/]?(?:trainer|library))/i;
    const FORBIDDEN_SURFACE = /(?:academy|class(?:es)?|lesson|course|curriculum|guided replay|knowledge unit|training memory|mastery|training recommendation|educational promotion|exercise|puzzle|review with mentor)/i;
    const counters = { checks: 0, allowed: 0, denied: 0 };

    function freeze(value) {
        if (value && typeof value === 'object' && !Object.isFrozen(value)) {
            Object.values(value).forEach(freeze); Object.freeze(value);
        }
        return value;
    }
    function decision(allowed, type, reasonCode) {
        counters.checks += 1; counters[allowed ? 'allowed' : 'denied'] += 1;
        return freeze({ contractId: CONTRACT_ID, allowed, type, reasonCode });
    }
    function authorize(input = {}) {
        const type = String(input.type || ''); const value = String(input.value || '');
        if (!TYPES.includes(type) || !value || value.length > 2048)
            return decision(false, type || 'unknown', 'INVALID_BOUNDARY_INPUT');
        if (type === 'dynamic-group') return decision(GROUPS.includes(value), type,
            GROUPS.includes(value) ? 'PLAY_GROUP_ALLOWED' : 'GROUP_NOT_ALLOWLISTED');
        if (type === 'route') {
            const path = value.split('?')[0].replace(/\/+$/, '') || '/';
            return decision(ROUTES.includes(path), type, ROUTES.includes(path) ? 'PLAY_ROUTE_ALLOWED' : 'ROUTE_PROHIBITED');
        }
        if (type === 'action') return decision(ACTIONS.includes(value), type,
            ACTIONS.includes(value) ? 'POSTGAME_ACTION_ALLOWED' : 'POSTGAME_ACTION_PROHIBITED');
        if (FORBIDDEN_RESOURCE.test(value) && !/play-v2-(?:coach|mentor-review)-boundary|native-(?:coach|mentor-review)/i.test(value))
            return decision(false, type, 'EDUCATIONAL_OWNERSHIP_PROHIBITED');
        if (type === 'transition') return decision(value === 'analyze', type,
            value === 'analyze' ? 'EXTERNAL_ANALYZE_ALLOWED' : 'TRANSITION_PROHIBITED');
        if (type === 'dom') return decision(!FORBIDDEN_SURFACE.test(value), type,
            FORBIDDEN_SURFACE.test(value) ? 'EDUCATIONAL_SURFACE_PROHIBITED' : 'PLAY_SURFACE_ALLOWED');
        if (type === 'network') {
            try {
                const url = new URL(value, input.baseOrigin); const allowed = !!input.baseOrigin && url.origin === input.baseOrigin;
                return decision(allowed, type, allowed ? 'SAME_ORIGIN_ALLOWED' : 'NETWORK_DESTINATION_PROHIBITED');
            } catch (_) { return decision(false, type, 'NETWORK_DESTINATION_PROHIBITED'); }
        }
        const allowed = /^(?:css|js)\/[a-z0-9_./-]+(?:\?v=[a-z0-9_.-]+)?$/i.test(value);
        return decision(allowed, type, allowed ? 'PLAY_RESOURCE_ALLOWED' : 'RESOURCE_NOT_ALLOWLISTED');
    }
    function requireAllowed(input) {
        const result = authorize(input); if (!result.allowed) throw new Error(result.reasonCode); return result;
    }

    root.CaissaPlayV2ProductBoundary = freeze({
        schemaVersion: VERSION, contractId: CONTRACT_ID, policy: POLICY, resourceTypes: TYPES,
        allowedDynamicGroups: GROUPS, allowedRoutes: ROUTES, allowedPostGameActions: ACTIONS,
        authorize, requireAllowed,
        isModeAllowed: mode => ['games', 'bots', 'coach'].includes(String(mode || '')),
        inspect: () => freeze({ contractId: CONTRACT_ID, counters: { ...counters } })
    });
})(typeof window !== 'undefined' ? window : globalThis);
