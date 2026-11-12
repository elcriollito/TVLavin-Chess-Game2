(function (global) {
    'use strict';

    const HOME_BACK = Object.freeze({ backHref: '/', backLabel: 'CAISSA Mobile Home' });
    const HUB_BACK = Object.freeze({ backHref: '/play-hub', backLabel: 'Play Hub' });
    const ROUTES = Object.freeze({
        '/play-hub': Object.freeze({ id: 'play-hub', title: 'Play', ...HOME_BACK }),
        '/play/games': Object.freeze({ id: 'play', title: 'Play', ...HUB_BACK }),
        '/online': Object.freeze({ id: 'online', title: 'CAISSA Online', ...HUB_BACK }),
        '/play-online/playchess': Object.freeze({ id: 'playchess', title: 'Playchess', ...HUB_BACK }),
        '/fics': Object.freeze({ id: 'fics', title: 'FICS', ...HUB_BACK }),
        '/analyze': Object.freeze({ id: 'analyze', title: 'Analyze', ...HOME_BACK }),
        '/opening-database': Object.freeze({ id: 'opening-explorer', title: 'Opening Explorer', ...HOME_BACK }),
        '/watch/lichess-tv': Object.freeze({ id: 'watch-games', title: 'Watch Games', ...HOME_BACK }),
        '/puzzles': Object.freeze({ id: 'puzzles', title: 'CAISSA Puzzles', ...HOME_BACK }),
        '/play/bots': Object.freeze({ id: 'bots', title: 'Play Bots', ...HOME_BACK }),
        '/play/coach': Object.freeze({ id: 'coach', title: 'Play Coach', ...HOME_BACK })
    });
    const mobile = global.matchMedia?.('(max-width: 768px)') || {
        matches: false,
        addEventListener() {}
    };

    function normalizePath(pathname = global.location?.pathname || '') {
        const normalized = String(pathname || '').replace(/\/{2,}/g, '/').replace(/\/$/, '') || '/';
        try { return decodeURIComponent(normalized).toLowerCase(); } catch (_) { return normalized.toLowerCase(); }
    }

    function routeFor(pathname) {
        return ROUTES[normalizePath(pathname)] || null;
    }

    function owns(pathname = global.location?.pathname) {
        return Boolean(routeFor(pathname));
    }

    function markRoute(pathname = global.location?.pathname) {
        const route = routeFor(pathname);
        if (route) global.document.documentElement.dataset.caissaMobile2Destination = route.id;
        else delete global.document.documentElement.dataset.caissaMobile2Destination;
        return route;
    }

    function enhance(host) {
        const route = routeFor();
        if (!host || !route) return null;
        const existing = host.querySelector(':scope > [data-caissa-mobile2-destination-header]');
        if (existing) return existing;

        host.dataset.caissaMobile2HeaderHost = 'true';
        const header = global.document.createElement('div');
        header.className = 'caissa-mobile2-destination-header';
        header.dataset.caissaMobile2DestinationHeader = '';

        const back = global.document.createElement('a');
        back.className = 'caissa-mobile2-destination-back';
        back.href = route.backHref;
        back.setAttribute('aria-label', `Back to ${route.backLabel} from ${route.title}`);
        back.dataset.caissaMobile2Back = '';

        const arrow = global.document.createElement('span');
        arrow.className = 'caissa-mobile2-destination-arrow';
        arrow.setAttribute('aria-hidden', 'true');
        arrow.textContent = '\u2190';

        const title = global.document.createElement('span');
        title.className = 'caissa-mobile2-destination-title';
        title.dataset.caissaMobile2DestinationTitle = '';
        title.textContent = route.title;

        back.append(arrow, title);
        header.appendChild(back);
        host.prepend(header);
        return header;
    }

    function isolateLegacyNavigation(route = routeFor()) {
        const shouldIsolate = Boolean(route && mobile.matches);
        const nav = global.document.getElementById('mainNav');
        const app = global.document.querySelector('.app-container');
        const toggle = global.document.getElementById('mobileNavToggle');

        if (shouldIsolate) {
            app?.classList.remove('nav-open');
            global.document.body?.classList.remove('caissa-standalone-nav-open');
            if (nav) {
                nav.inert = true;
                nav.setAttribute('inert', '');
                nav.setAttribute('aria-hidden', 'true');
                nav.dataset.caissaMobile2Isolated = 'true';
            }
            if (toggle) {
                toggle.setAttribute('aria-expanded', 'false');
                toggle.setAttribute('aria-hidden', 'true');
                toggle.tabIndex = -1;
            }
            return;
        }

        if (nav?.dataset.caissaMobile2Isolated === 'true') {
            nav.inert = false;
            nav.removeAttribute('inert');
            nav.removeAttribute('aria-hidden');
            delete nav.dataset.caissaMobile2Isolated;
        }
        if (toggle?.getAttribute('aria-hidden') === 'true') {
            toggle.removeAttribute('aria-hidden');
            toggle.removeAttribute('tabindex');
        }
    }

    function sync(pathname = global.location?.pathname) {
        const route = markRoute(pathname);
        global.document.querySelectorAll('[data-caissa-mobile2-destination-title]').forEach((title) => {
            if (route) title.textContent = route.title;
        });
        global.document.querySelectorAll('[data-caissa-mobile2-back]').forEach((back) => {
            if (!route) return;
            back.href = route.backHref;
            back.setAttribute('aria-label', `Back to ${route.backLabel} from ${route.title}`);
        });
        global.document.querySelectorAll('[data-caissa-mobile2-header-host]').forEach(enhance);
        isolateLegacyNavigation(route);
        return route;
    }

    function ready() {
        global.document.querySelectorAll('[data-caissa-mobile2-header-host]').forEach(enhance);
        sync();
    }

    markRoute();
    if (global.document.readyState === 'loading') global.document.addEventListener('DOMContentLoaded', ready, { once: true });
    else ready();
    global.addEventListener?.('pageshow', () => sync());
    global.addEventListener?.('popstate', () => sync());
    mobile.addEventListener?.('change', () => sync());

    global.CaissaMobile2DestinationHeader = Object.freeze({
        contractId: 'CaissaMobile2DestinationHeader@1.2.0',
        routes: ROUTES,
        owns,
        enhance,
        sync,
        isMobileNavigationIsolated: () => owns() && mobile.matches
    });
})(typeof window !== 'undefined' ? window : globalThis);
