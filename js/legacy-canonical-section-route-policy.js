(function (global) {
    'use strict';

    const definitions = Object.freeze({
        '/academy': Object.freeze({ section: 'academy', surface: 'academy', title: 'Academy | CAISSA Chess' }),
        '/insights': Object.freeze({ section: 'insights', surface: 'insights', title: 'Insights | CAISSA Chess' }),
        '/fics': Object.freeze({ section: 'fics', surface: 'fics', title: 'FICS | CAISSA Chess' }),
        '/analyze': Object.freeze({ section: 'analyze', surface: 'analyze', title: 'Analyze | CAISSA Chess' }),
        '/spectator-tv': Object.freeze({ section: 'spectator', surface: 'spectator-tv', title: 'Chess TV | CAISSA Chess' }),
        '/arena': Object.freeze({ section: 'arena', surface: 'arena', title: 'CAISSA Engine Arena | CAISSA Chess' }),
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

    function applyDocumentMetadata(definition, document = global.document) {
        if (!definition || !document?.head) return false;
        const absoluteUrl = new URL(definition.route, global.location?.origin || 'https://www.caissa-chess.org').href;
        let canonical = document.querySelector('link[rel="canonical"]');
        if (!canonical) {
            canonical = document.createElement('link');
            canonical.rel = 'canonical';
            document.head.append(canonical);
        }
        canonical.href = absoluteUrl;
        for (const [selector, attribute] of [
            ['meta[property="og:url"]', 'property'],
            ['meta[name="twitter:url"]', 'name']
        ]) {
            let meta = document.querySelector(selector);
            if (!meta) {
                meta = document.createElement('meta');
                meta.setAttribute(attribute, selector.includes('og:url') ? 'og:url' : 'twitter:url');
                document.head.append(meta);
            }
            meta.content = absoluteUrl;
        }
        return true;
    }

    global.LegacyCanonicalSectionRoutePolicy = Object.freeze({
        contractId: 'LegacyCanonicalSectionRoutePolicy@1.1.0',
        routes,
        sections,
        resolve,
        applyDocumentMetadata,
        routeForSection: section => sections[section] || null,
        surfaceForSection: section => definitions[sections[section]]?.surface || section,
        titleForSection: section => definitions[sections[section]]?.title || null
    });

    const current = resolve(global.location);
    if (current) {
        global.document?.documentElement?.setAttribute('data-caissa-navigation-pending', 'true');
        applyDocumentMetadata(current);
    }
})(typeof window !== 'undefined' ? window : globalThis);
