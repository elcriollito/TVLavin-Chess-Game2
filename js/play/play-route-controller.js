(function (global) {
    'use strict';

    const SCHEMA_VERSION = '1.1.0';
    const MODES = Object.freeze({ GAMES: 'games', BOTS: 'bots', COACH: 'coach', PLAYERS: 'players' });
    const STATUSES = Object.freeze({
        RESOLVED: 'resolved', CANONICALIZED: 'canonicalized', LEGACY_ADAPTED: 'legacy-adapted',
        INACTIVE_MODE: 'inactive-mode', UNKNOWN_MODE: 'unknown-mode', MALFORMED: 'malformed',
        UNCHANGED: 'unchanged'
    });
    const SOURCES = Object.freeze({
        DIRECT_PATH: 'direct-path', QUERY: 'query', LEGACY_SECTION: 'legacy-section',
        PRIMARY_NAVIGATION: 'primary-navigation', MOBILE_NAVIGATION: 'mobile-navigation',
        PROGRAMMATIC: 'programmatic', POPSTATE: 'popstate', ANALYZE_RETURN: 'analyze-return',
        COLD_LOAD: 'cold-load', UNKNOWN: 'unknown'
    });
    const REASONS = Object.freeze({
        CANONICAL_PLAY_ROUTE: 'CANONICAL_PLAY_ROUTE',
        LEGACY_PLAY_QUERY_ADAPTED: 'LEGACY_PLAY_QUERY_ADAPTED',
        GAMES_MODE_RESOLVED: 'GAMES_MODE_RESOLVED',
        BOTS_MODE_RESOLVED: 'BOTS_MODE_RESOLVED',
        RESERVED_MODE_INACTIVE: 'RESERVED_MODE_INACTIVE',
        UNKNOWN_MODE_FALLBACK: 'UNKNOWN_MODE_FALLBACK',
        MALFORMED_ROUTE: 'MALFORMED_ROUTE',
        CLASSIC_DEFAULT_PRESERVED: 'CLASSIC_DEFAULT_PRESERVED',
        ANALYZE_HANDOFF_PRESERVED: 'ANALYZE_HANDOFF_PRESERVED',
        POPSTATE_RESTORED: 'POPSTATE_RESTORED',
        SAME_ROUTE_NOOP: 'SAME_ROUTE_NOOP'
    });
    const AVAILABILITY = Object.freeze({ games: true, bots: 'qa-only', coach: false, players: false });
    const SAFE_QUERY_LIMIT = 2048;
    const privateQuery = new WeakMap();
    const diagnostics = { parses: 0, navigations: 0, pushes: 0, replaces: 0, noops: 0, popstates: 0, malformed: 0 };
    let navigation = null;
    let listening = false;
    let current = null;
    const subscribers = new Set();

    function notify(route) {
        subscribers.forEach(listener => {
            try { listener(route); } catch (_) {}
        });
    }

    function frozenRoute(value) {
        const query = Object.freeze(Object.assign(Object.create(null), value.query || {}));
        const metadata = Object.freeze(Object.assign(Object.create(null), value.metadata || {}));
        const route = Object.freeze(Object.assign({}, value, { query, metadata, __privateQuery: undefined }));
        privateQuery.set(route, Object.assign(Object.create(null), value.__privateQuery || {}));
        return route;
    }

    function locationValue(input) {
        if (!input) return global.location;
        if (typeof input === 'string') return new URL(input, global.location?.origin || 'http://localhost');
        return input;
    }

    function safeQuery(search) {
        const result = Object.create(null);
        const text = String(search || '').slice(0, SAFE_QUERY_LIMIT);
        try {
            for (const [key, value] of new URLSearchParams(text)) {
                if (!key || key === '__proto__' || key === 'prototype' || key === 'constructor') continue;
                if (key.length <= 64 && value.length <= 1024 && value !== '') result[key] = value;
            }
        } catch (_) {}
        return result;
    }

    function parse(input, options = {}) {
        diagnostics.parses += 1;
        let loc;
        try { loc = locationValue(input); } catch (_) {
            diagnostics.malformed += 1;
            return frozenRoute({
                schemaVersion: SCHEMA_VERSION, routeId: 'site:classic', path: '/', section: 'yahooClassic',
                mode: null, requestedMode: null, status: STATUSES.MALFORMED, source: options.source || SOURCES.UNKNOWN,
                canonicalPath: '/', legacy: false, replace: false, available: true,
                reasonCode: REASONS.MALFORMED_ROUTE, query: {}, handoffToken: null, metadata: {}
            });
        }
        let path = String(loc.pathname || '/');
        const query = safeQuery(loc.search);
        const protectedQuery = Object.create(null);
        for (const key of ['fen', 'pgn']) {
            if (query[key]) {
                protectedQuery[key] = query[key];
                delete query[key];
            }
        }
        const normalizedPath = path.replace(/\/+/g, '/').replace(/\/+$/, '') || '/';
        const lowerPath = normalizedPath.toLowerCase();
        const playMatch = /^\/play(?:\/([^/]+))?$/.exec(lowerPath);
        if (playMatch) {
            const requestedMode = playMatch[1] || MODES.GAMES;
            const known = Object.values(MODES).includes(requestedMode);
            const available = known && (AVAILABILITY[requestedMode] === true
                || (requestedMode === MODES.BOTS && query.simplified === '1'));
            const mode = available ? requestedMode : MODES.GAMES;
            const canonicalPath = mode === MODES.GAMES && !playMatch[1] ? '/play' : `/play/${mode}`;
            const inactive = known && !available;
            const changed = path !== canonicalPath || inactive;
            return frozenRoute({
                schemaVersion: SCHEMA_VERSION, routeId: `play:${mode}`, path, section: 'play', mode,
                requestedMode, status: !known ? STATUSES.UNKNOWN_MODE :
                    (inactive ? STATUSES.INACTIVE_MODE : (changed ? STATUSES.CANONICALIZED : STATUSES.RESOLVED)),
                source: options.source || SOURCES.DIRECT_PATH, canonicalPath, legacy: false, replace: changed,
                available: true, reasonCode: !known ? REASONS.UNKNOWN_MODE_FALLBACK :
                    (inactive ? REASONS.RESERVED_MODE_INACTIVE :
                        (mode === MODES.BOTS ? REASONS.BOTS_MODE_RESOLVED : REASONS.GAMES_MODE_RESOLVED)),
                query, __privateQuery: protectedQuery, handoffToken: null, metadata: { requestedModeAvailable: available }
            });
        }
        if (lowerPath.startsWith('/play/')) {
            return frozenRoute({
                schemaVersion: SCHEMA_VERSION, routeId: 'play:games', path, section: 'play', mode: MODES.GAMES,
                requestedMode: lowerPath.slice(6, 70), status: STATUSES.UNKNOWN_MODE,
                source: options.source || SOURCES.DIRECT_PATH, canonicalPath: '/play/games', legacy: false,
                replace: true, available: true, reasonCode: REASONS.UNKNOWN_MODE_FALLBACK, query, __privateQuery: protectedQuery,
                handoffToken: null, metadata: { requestedModeAvailable: false }
            });
        }
        const section = query.section;
        if (section === 'play') {
            const requestedMode = String(query.mode || 'games').toLowerCase();
            const known = Object.values(MODES).includes(requestedMode);
            const available = known && (AVAILABILITY[requestedMode] === true
                || (requestedMode === MODES.BOTS && query.simplified === '1'));
            return frozenRoute({
                schemaVersion: SCHEMA_VERSION, routeId: 'play:games', path, section: 'play', mode: MODES.GAMES,
                requestedMode, status: known && !available ? STATUSES.INACTIVE_MODE : STATUSES.LEGACY_ADAPTED,
                source: options.source || SOURCES.LEGACY_SECTION, canonicalPath: '/play', legacy: true, replace: true,
                available: true, reasonCode: known && !available ?
                    REASONS.RESERVED_MODE_INACTIVE : REASONS.LEGACY_PLAY_QUERY_ADAPTED,
                query, __privateQuery: protectedQuery, handoffToken: null, metadata: { requestedModeAvailable: available }
            });
        }
        const safeSection = /^[a-zA-Z][a-zA-Z0-9-]{0,31}$/.test(section || '') ? section : null;
        return frozenRoute({
            schemaVersion: SCHEMA_VERSION, routeId: `site:${safeSection || 'classic'}`, path,
            section: safeSection || 'yahooClassic', mode: null, requestedMode: null, status: STATUSES.RESOLVED,
            source: options.source || (safeSection ? SOURCES.QUERY : SOURCES.DIRECT_PATH),
            canonicalPath: lowerPath === '/yahoo-classic' ? '/yahoo-classic' : (safeSection ? `/?section=${encodeURIComponent(safeSection)}` : '/'),
            legacy: false, replace: false, available: true,
            reasonCode: safeSection === 'analyze' && query.handoff ? REASONS.ANALYZE_HANDOFF_PRESERVED : REASONS.CLASSIC_DEFAULT_PRESERVED,
            query, __privateQuery: protectedQuery, handoffToken: safeSection === 'analyze' ? query.handoff || null : null, metadata: {}
        });
    }

    function serialize(route) {
        const params = new URLSearchParams();
        const serializableQuery = Object.assign({}, route.query || {}, privateQuery.get(route) || {});
        Object.entries(serializableQuery).forEach(([key, value]) => {
            if (key !== 'section' && key !== 'mode' && value !== '') params.set(key, String(value));
        });
        const suffix = params.toString();
        return `${route.canonicalPath}${suffix ? `${route.canonicalPath.includes('?') ? '&' : '?'}${suffix}` : ''}`;
    }

    function routeForSection(section, options = {}) {
        if (section === 'play') {
            const existing = safeQuery(global.location?.search);
            delete existing.section;
            delete existing.mode;
            const supplied = Object.assign(existing, options.query || {});
            const params = new URLSearchParams(supplied);
            return parse(`${options.mode ? `/play/${options.mode}` : '/play'}${params.size ? `?${params}` : ''}`,
                { source: options.source || SOURCES.PROGRAMMATIC });
        }
        const query = Object.assign(Object.create(null), options.query || {});
        query.section = section;
        return frozenRoute({
            schemaVersion: SCHEMA_VERSION, routeId: `site:${section}`, path: global.location?.pathname || '/',
            section, mode: null, requestedMode: null, status: STATUSES.RESOLVED,
            source: options.source || SOURCES.PROGRAMMATIC,
            canonicalPath: section === 'yahooClassic' ? '/yahoo-classic' : `/?section=${encodeURIComponent(section)}`,
            legacy: false, replace: false, available: true,
            reasonCode: section === 'analyze' && query.handoff ? REASONS.ANALYZE_HANDOFF_PRESERVED : REASONS.CANONICAL_PLAY_ROUTE,
            query, handoffToken: query.handoff || null, metadata: {}
        });
    }

    function commit(route, method) {
        const url = serialize(route);
        const here = `${global.location.pathname}${global.location.search}${global.location.hash || ''}`;
        if (url === here) { diagnostics.noops += 1; current = route; return 'noop'; }
        if (method === 'replace') { global.history.replaceState({ caissaRoute: route.routeId }, '', url); diagnostics.replaces += 1; }
        else { global.history.pushState({ caissaRoute: route.routeId }, '', url); diagnostics.pushes += 1; }
        current = route;
        return method;
    }

    function navigate(target, options = {}) {
        diagnostics.navigations += 1;
        const route = typeof target === 'string' && !target.startsWith('/') ?
            routeForSection(target, options) : parse(target, { source: options.source || SOURCES.PROGRAMMATIC });
        if (options.history === false) { current = route; return route; }
        commit(route, options.replace ? 'replace' : 'push');
        notify(route);
        return route;
    }

    function handlePopState() {
        diagnostics.popstates += 1;
        const route = parse(global.location, { source: SOURCES.POPSTATE });
        current = route;
        if (navigation && navigation.currentSection !== route.section) {
            navigation.navigateToSection(route.section, { history: false, source: SOURCES.POPSTATE });
        }
        notify(route);
        return route;
    }

    function init(nav) {
        navigation = nav || navigation;
        if (!listening && global.addEventListener) {
            global.addEventListener('popstate', handlePopState);
            listening = true;
        }
        current = parse(global.location, { source: SOURCES.COLD_LOAD });
        if (current.replace) commit(current, 'replace');
        notify(current);
        return current;
    }

    function inspect() { return Object.freeze(Object.assign({}, diagnostics, { listening, current })); }
    function resetDiagnostics() { Object.keys(diagnostics).forEach(key => { diagnostics[key] = 0; }); }
    function dispose() {
        if (listening && global.removeEventListener) global.removeEventListener('popstate', handlePopState);
        listening = false; navigation = null; subscribers.clear();
    }

    const api = Object.freeze({
        schemaVersion: SCHEMA_VERSION, modes: MODES, statuses: STATUSES, sources: SOURCES,
        reasonCodes: REASONS, availability: AVAILABILITY, parse, resolve: parse, serialize,
        getCurrent: () => current || parse(), navigate, replace: (target, options = {}) => navigate(target, Object.assign({}, options, { replace: true })),
        handlePopState, isPlayRoute: input => parse(input).section === 'play',
        isModeAvailable: (mode, options = {}) => AVAILABILITY[mode] === true
            || (mode === MODES.BOTS && options.qa === true),
        getCanonicalPath: mode => mode && mode !== MODES.GAMES ? `/play/${mode}` : '/play',
        subscribe(listener) {
            if (typeof listener !== 'function') return () => {};
            subscribers.add(listener);
            return () => subscribers.delete(listener);
        },
        inspect, resetDiagnostics, dispose, init
    });
    global.CaissaPlayRouteController = api;
})(typeof window !== 'undefined' ? window : globalThis);
