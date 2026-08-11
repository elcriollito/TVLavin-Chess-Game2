(function (global) {
    'use strict';

    const definitions = Object.freeze({
        '/academy': Object.freeze({ section: 'academy', surface: 'academy', title: 'Academy | CAISSA Chess' }),
        '/insights': Object.freeze({ section: 'insights', surface: 'insights', title: 'Insights | CAISSA Chess' }),
        '/fics': Object.freeze({ section: 'fics', surface: 'fics', title: 'FICS | CAISSA Chess' }),
        '/analyze': Object.freeze({ section: 'analyze', surface: 'analyze', title: 'Analyze | CAISSA Chess' }),
        '/spectator-tv': Object.freeze({ section: 'spectator', surface: 'spectator-tv', title: 'Spectator TV | CAISSA Chess' }),
        '/arena': Object.freeze({ section: 'arena', surface: 'arena', title: 'Arena | CAISSA Chess' }),
        '/cheater-insight': Object.freeze({ section: 'cheater-insight', surface: 'cheater-insight', title: 'Cheater Insight | CAISSA Chess' }),
        '/game-library': Object.freeze({ section: 'library', surface: 'game-library', title: 'Game Library | CAISSA Chess' }),
        '/history': Object.freeze({ section: 'history', surface: 'history', title: 'History | CAISSA Chess' }),
        '/dos-chess': Object.freeze({ section: 'dosChess', surface: 'dos-chess', title: 'DOS Chess | CAISSA Chess' })
    });
    const routes = Object.freeze(Object.fromEntries(Object.entries(definitions).map(([route, value]) => [route, value.section])));
    const sections = Object.freeze(Object.fromEntries(
        Object.entries(routes).map(([route, section]) => [section, route])
    ));

    function resolve(input = global.location) {
        let pathname;
        try {
            pathname = typeof input === 'string'
                ? new URL(input, global.location?.origin || 'http://localhost').pathname
                : input?.pathname;
        } catch (_) {
            return null;
        }
        const normalized = String(pathname || '').replace(/\/+$/, '') || '/';
        const definition = definitions[normalized] || null;
        return definition ? Object.freeze({ route: normalized, ...definition }) : null;
    }

    global.LegacyCanonicalSectionRoutePolicy = Object.freeze({
        contractId: 'LegacyCanonicalSectionRoutePolicy@1.0.0',
        routes,
        sections,
        resolve,
        routeForSection: section => sections[section] || null,
        surfaceForSection: section => definitions[sections[section]]?.surface || section,
        titleForSection: section => definitions[sections[section]]?.title || null
    });

    if (resolve(global.location)) global.document?.documentElement?.setAttribute('data-caissa-navigation-pending', 'true');
})(typeof window !== 'undefined' ? window : globalThis);
