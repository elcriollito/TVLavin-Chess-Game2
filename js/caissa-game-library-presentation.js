(function (global) {
    'use strict';

    const contractId = 'CaissaGameLibraryPresentation@1.0.0';
    const route = '/game-library';
    const i18n = global.CaissaI18n;

    function normalizedPathname() {
        const pathname = global.location?.pathname || '';
        return pathname.length > 1 ? pathname.replace(/\/$/, '') : pathname;
    }

    function shouldPresent() {
        return normalizedPathname() === route;
    }

    function elements() {
        return {
            panel: global.document?.getElementById('libraryPanel'),
            presentation: global.document?.querySelector('[data-caissa-library-public-presentation]'),
            title: global.document?.getElementById('caissaLibraryConstructionTitle')
        };
    }

    function localize() {
        const { presentation } = elements();
        if (!presentation || !i18n) return;
        i18n.apply(presentation);
        global.document.title = i18n.t('library.metaTitle', 'Game Library — Under Construction | CAISSA Chess');
    }

    function activate() {
        if (!shouldPresent()) return false;
        const { panel, presentation } = elements();
        if (!panel || !presentation) return false;
        panel.classList.add('caissa-library-construction-mode');
        panel.dataset.caissaLibraryPresentation = 'under-construction';
        presentation.hidden = false;
        localize();
        return true;
    }

    async function open() {
        if (!activate()) return false;
        await global.LibraryUI?.open?.();
        const { panel, title } = elements();
        panel?.classList.add('open');
        title?.focus?.({ preventScroll: true });
        return true;
    }

    const api = Object.freeze({ contractId, route, shouldPresent, activate, open });
    global.CaissaGameLibraryPresentation = api;
    i18n?.subscribe?.(() => { if (shouldPresent()) localize(); });
    if (global.document?.readyState === 'loading') {
        global.document.addEventListener('DOMContentLoaded', activate, { once: true });
    } else {
        activate();
    }
})(window);
