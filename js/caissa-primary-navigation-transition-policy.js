(function (global) {
    'use strict';
    let generation = 0;
    let installed = false;

    function destinationName(href, fallback = '') {
        const explicit = String(fallback || '').replace(/\s+/g, ' ').trim();
        if (explicit) return explicit;
        let pathname = '';
        try { pathname = new URL(String(href || ''), global.location?.href || 'http://localhost/').pathname; } catch (_) {}
        const names = {
            '/play': 'Play', '/yahoo-classic': 'CAISSA Classic', '/academy': 'Academy',
            '/insights': 'Insights', '/fics': 'FICS', '/analyze': 'Analyze',
            '/spectator-tv': 'Spectator TV', '/arena': 'Arena', '/cheater-insight': 'Cheater Insight',
            '/game-library': 'Game Library', '/history': 'History', '/dos-chess': 'DOS Chess'
        };
        return names[pathname] || pathname.split('/').filter(Boolean).pop()?.replace(/[-_]+/g, ' ').replace(/\b\w/g, char => char.toUpperCase()) || 'page';
    }

    function overlay() {
        let node = global.document?.getElementById('caissaNavigationTransition');
        if (!node && global.document?.body) {
            node = global.document.createElement('div');
            node.id = 'caissaNavigationTransition';
            node.className = 'caissa-navigation-transition';
            node.setAttribute('role', 'status');
            node.setAttribute('aria-live', 'polite');
            node.setAttribute('aria-atomic', 'true');
            node.innerHTML = '<span class="caissa-navigation-transition__spinner" aria-hidden="true"></span><span class="caissa-navigation-transition__text"></span>';
            global.document.body.appendChild(node);
        }
        return node;
    }

    function begin(href, label) {
        generation += 1;
        global.document?.documentElement?.setAttribute('data-caissa-navigation-pending', 'true');
        global.document?.body?.setAttribute('data-caissa-surface', 'loading');
        const node = overlay();
        const destination = destinationName(href, label);
        node?.setAttribute('data-generation', String(generation));
        node?.classList.remove('is-error');
        node?.querySelector('.caissa-navigation-transition__spinner')?.removeAttribute('hidden');
        node?.querySelector('.caissa-navigation-transition__action')?.remove();
        const status = node?.querySelector('.caissa-navigation-transition__text');
        if (status) status.textContent = `Loading ${destination}\u2026`;
        return Object.freeze({ generation, href: String(href || ''), destination });
    }

    function confirm(surface) {
        global.document?.documentElement?.removeAttribute('data-caissa-navigation-pending');
        global.document?.body?.setAttribute('data-caissa-surface', String(surface || 'unknown'));
        overlay()?.remove();
        return generation;
    }

    function fail(message = 'This page could not be opened.') {
        const node = overlay();
        global.document?.documentElement?.setAttribute('data-caissa-navigation-pending', 'true');
        global.document?.body?.setAttribute('data-caissa-surface', 'navigation-error');
        node?.classList.add('is-error');
        node?.querySelector('.caissa-navigation-transition__spinner')?.setAttribute('hidden', '');
        const status = node?.querySelector('.caissa-navigation-transition__text');
        if (status) status.textContent = String(message || 'This page could not be opened.');
        if (node && !node.querySelector('.caissa-navigation-transition__action')) {
            const action = global.document.createElement('a');
            action.className = 'caissa-navigation-transition__action';
            action.href = '/play';
            action.textContent = 'Return to Play';
            node.appendChild(action);
        }
        return generation;
    }

    function install() {
        if (installed || !global.document) return false;
        installed = true;
        global.document.addEventListener('click', event => {
            if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
            const link = event.target.closest?.('#mainNav a.nav-item[href]');
            if (!link || link.target === '_blank' || link.hasAttribute('download')) return;
            let target;
            try { target = new URL(link.href, global.location.href); } catch (_) { return; }
            if (target.origin !== global.location.origin || target.href === global.location.href) return;
            begin(target.href, link.getAttribute('aria-label') || link.textContent);
        }, true);
        if (global.document.documentElement.hasAttribute('data-caissa-navigation-pending')) begin(global.location.href);
        return true;
    }

    global.CaissaPrimaryNavigationTransitionPolicy = Object.freeze({
        contractId: 'CaissaPrimaryNavigationTransitionPolicy@1.0.0', begin, confirm, fail, install,
        inspect: () => Object.freeze({ generation, installed, pending: global.document?.documentElement?.hasAttribute('data-caissa-navigation-pending') === true })
    });
    install();
})(typeof window !== 'undefined' ? window : globalThis);
