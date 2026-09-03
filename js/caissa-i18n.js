(function (global) {
    'use strict';

    const contractId = 'CaissaI18nFoundation@1.0.0';
    const storageKey = 'caissa.locale';
    const defaultLocale = 'en';

    const supportedLocales = Object.freeze({
        en: Object.freeze({ code: 'en', name: 'English', enabled: true }),
        es: Object.freeze({ code: 'es', name: 'Español', enabled: true }),
        ru: Object.freeze({ code: 'ru', name: 'Русский', enabled: false }),
        hi: Object.freeze({ code: 'hi', name: 'हिन्दी', enabled: false }),
        de: Object.freeze({ code: 'de', name: 'Deutsch', enabled: false }),
        pt: Object.freeze({ code: 'pt', name: 'Português', enabled: false }),
        fr: Object.freeze({ code: 'fr', name: 'Français', enabled: false })
    });
    const enabledLocales = Object.freeze(Object.keys(supportedLocales).filter(code => supportedLocales[code].enabled));

    const catalogs = Object.freeze({
        en: Object.freeze({
            'nav.group.playAndCompete': 'Play & Compete',
            'nav.group.learnAndImprove': 'Learn & Improve',
            'nav.group.analyzeAndWatch': 'Analyze & Watch',
            'nav.group.tools': 'Tools',
            'nav.connect': 'Connect with CAISSA Chess',
            'nav.support': 'Support',
            'nav.item.play': 'Play',
            'nav.item.yahooClassic': 'CAISSA Classic',
            'nav.item.fics': 'FICS',
            'nav.item.playchess': 'Playchess',
            'nav.item.fritz': 'Fritz',
            'nav.item.tactics': 'Tactics',
            'nav.item.interactive-diagrams': 'Interactive Diagrams',
            'nav.item.academy': 'Academy',
            'nav.item.endgame-trainer': 'Endgame Trainer',
            'nav.item.endgame-practice': 'Endgame Practice',
            'nav.item.endgame-library': 'Endgame Library',
            'nav.item.insights': 'Insights',
            'nav.item.analyze': 'Analyze',
            'nav.item.pgn-replayer': 'CAISSA PGN Reader',
            'nav.item.spectator': 'Spectator TV',
            'nav.item.lichess-tv': 'Lichess TV',
            'nav.item.live-blitz': 'Live Blitz',
            'nav.item.live-tournaments': 'Live Tournaments',
            'nav.item.lichess-broadcasts': 'Lichess Broadcasts',
            'nav.item.game-replayer': 'Game Replayer',
            'nav.item.arena': 'Arena',
            'nav.item.cheater-insight': 'Cheater Insight',
            'nav.item.polyglot': 'Polyglot Tool',
            'nav.item.opening-database': 'Opening Database',
            'nav.item.eco': 'ECO Codes',
            'nav.item.library': 'Game Library',
            'nav.item.history': 'History',
            'nav.item.dosChess': 'DOS Chess',
            'nav.item.vault': 'Vault',
            'nav.item.blog': 'Blog',
            'nav.item.help': 'Help',
            'nav.item.about': 'About',
            'nav.item.facebook': 'Facebook',
            'nav.item.youtube': 'CAISSA Chess YouTube',
            'nav.item.discord': 'CAISSA Discord',
            'nav.item.feedback': 'Share an Idea / Contact & Feedback',
            'language.title': 'Language',
            'language.selectorLabel': 'Interface language',
            'language.suggestion': 'Use CAISSA in {language}',
            'common.close': 'Close',
            'shell.mainNavigation': 'CAISSA main navigation',
            'shell.returnToPlay': 'CAISSA Chess — return to Play',
            'shell.openNavigation': 'Open navigation menu',
            'shell.closeNavigation': 'Close navigation menu',
            'shell.collapseNavigation': 'Collapse navigation',
            'shell.expandNavigation': 'Expand navigation',
            'shell.signIn': 'Sign In',
            'shell.accountMenu': 'Account menu',
            'shell.account': 'Account',
            'shell.signOut': 'Sign Out',
            'shell.premium': 'Premium',
            'shell.upgrade': 'Upgrade',
            'shell.upgradePremium': 'Upgrade to Premium'
        }),
        es: Object.freeze({
            'nav.group.playAndCompete': 'Jugar y competir',
            'nav.group.learnAndImprove': 'Aprender y mejorar',
            'nav.group.analyzeAndWatch': 'Analizar y observar',
            'nav.group.tools': 'Herramientas',
            'nav.connect': 'Conecta con CAISSA Chess',
            'nav.support': 'Soporte',
            'nav.item.play': 'Jugar',
            'nav.item.yahooClassic': 'CAISSA Classic',
            'nav.item.fics': 'FICS',
            'nav.item.playchess': 'Playchess',
            'nav.item.fritz': 'Fritz',
            'nav.item.tactics': 'Tácticas',
            'nav.item.interactive-diagrams': 'Diagramas interactivos',
            'nav.item.academy': 'Academia',
            'nav.item.endgame-trainer': 'Entrenador de finales',
            'nav.item.endgame-practice': 'Práctica de finales',
            'nav.item.endgame-library': 'Biblioteca de finales',
            'nav.item.insights': 'Perspectivas',
            'nav.item.analyze': 'Analizar',
            'nav.item.pgn-replayer': 'Lector PGN de CAISSA',
            'nav.item.spectator': 'TV de espectadores',
            'nav.item.lichess-tv': 'Lichess TV',
            'nav.item.live-blitz': 'Blitz en vivo',
            'nav.item.live-tournaments': 'Torneos en vivo',
            'nav.item.lichess-broadcasts': 'Transmisiones de Lichess',
            'nav.item.game-replayer': 'Reproductor de partidas',
            'nav.item.arena': 'Arena',
            'nav.item.cheater-insight': 'Detección de trampas',
            'nav.item.polyglot': 'Herramienta Polyglot',
            'nav.item.opening-database': 'Base de datos de aperturas',
            'nav.item.eco': 'Códigos ECO',
            'nav.item.library': 'Biblioteca de partidas',
            'nav.item.history': 'Historial',
            'nav.item.dosChess': 'Ajedrez DOS',
            'nav.item.vault': 'Bóveda',
            'nav.item.blog': 'Blog',
            'nav.item.help': 'Ayuda',
            'nav.item.about': 'Acerca de',
            'nav.item.facebook': 'Facebook',
            'nav.item.youtube': 'CAISSA Chess YouTube',
            'nav.item.discord': 'CAISSA Discord',
            'nav.item.feedback': 'Comparte una idea / Contacto y comentarios',
            'language.title': 'Idioma',
            'language.selectorLabel': 'Idioma de la interfaz',
            'language.suggestion': 'Usar CAISSA en {language}',
            'shell.mainNavigation': 'Navegación principal de CAISSA',
            'shell.returnToPlay': 'CAISSA Chess — volver a Jugar',
            'shell.openNavigation': 'Abrir menú de navegación',
            'shell.closeNavigation': 'Cerrar menú de navegación',
            'shell.collapseNavigation': 'Contraer navegación',
            'shell.expandNavigation': 'Expandir navegación',
            'shell.signIn': 'Iniciar sesión',
            'shell.accountMenu': 'Menú de cuenta',
            'shell.account': 'Cuenta',
            'shell.signOut': 'Cerrar sesión',
            'shell.premium': 'Premium',
            'shell.upgrade': 'Mejorar plan',
            'shell.upgradePremium': 'Mejorar a Premium'
        })
    });

    function normalizeLocale(value) {
        const normalized = String(value || '').trim().replaceAll('_', '-').toLowerCase().split('-')[0];
        return supportedLocales[normalized] ? normalized : '';
    }

    function enabledLocale(value) {
        const normalized = normalizeLocale(value);
        return enabledLocales.includes(normalized) ? normalized : '';
    }

    function readStoredLocale() {
        try {
            return enabledLocale(global.localStorage?.getItem(storageKey));
        } catch (_error) {
            return '';
        }
    }

    function detectBrowserLocale(languages = global.navigator?.languages || [global.navigator?.language]) {
        for (const language of languages || []) {
            const locale = enabledLocale(language);
            if (locale) return locale;
        }
        return defaultLocale;
    }

    const storedLocale = readStoredLocale();
    const browserLocale = detectBrowserLocale();
    let locale = storedLocale || defaultLocale;
    let suggestedLocale = (storedLocale || browserLocale === defaultLocale) ? '' : browserLocale;
    const subscribers = new Set();

    function t(key, fallback = '', variables = {}) {
        const selectedValue = catalogs[locale]?.[key];
        const englishValue = catalogs[defaultLocale]?.[key];
        for (const value of [selectedValue, englishValue, fallback]) {
            if (typeof value === 'string' && value) {
                return value.replace(/\{([a-zA-Z][\w]*)\}/g, (_match, name) => String(variables[name] ?? ''));
            }
        }
        return '';
    }

    function translateElement(element) {
        const textKey = element.dataset?.caissaI18n;
        const ariaKey = element.dataset?.caissaI18nAriaLabel;
        const titleKey = element.dataset?.caissaI18nTitle;
        if (textKey) element.textContent = t(textKey, element.textContent || '');
        if (ariaKey) element.setAttribute('aria-label', t(ariaKey, element.getAttribute('aria-label') || ''));
        if (titleKey) element.setAttribute('title', t(titleKey, element.getAttribute('title') || ''));
    }

    function apply(root = global.document) {
        if (!root) return;
        if (root.documentElement) root.documentElement.lang = locale;
        if (root.matches?.('[data-caissa-i18n], [data-caissa-i18n-aria-label], [data-caissa-i18n-title]')) {
            translateElement(root);
        }
        root.querySelectorAll?.('[data-caissa-i18n], [data-caissa-i18n-aria-label], [data-caissa-i18n-title]')
            ?.forEach(translateElement);
        root.querySelectorAll?.('[data-caissa-locale-select]')?.forEach(select => { select.value = locale; });
        root.querySelectorAll?.('[data-caissa-locale-suggestion]')?.forEach(button => {
            button.hidden = !suggestedLocale || button.dataset.caissaLocaleSuggestion !== suggestedLocale;
        });
    }

    function setLocale(value, { persist = true } = {}) {
        const nextLocale = enabledLocale(value) || defaultLocale;
        locale = nextLocale;
        if (persist) {
            try {
                global.localStorage?.setItem(storageKey, nextLocale);
            } catch (_error) {
                // Storage denial must never prevent a language change for this page.
            }
            suggestedLocale = '';
        }
        apply();
        subscribers.forEach(subscriber => subscriber(locale));
        if (typeof global.CustomEvent === 'function' && global.dispatchEvent) {
            global.dispatchEvent(new global.CustomEvent('caissa:locale-change', { detail: Object.freeze({ locale }) }));
        }
        return locale;
    }

    function subscribe(subscriber) {
        if (typeof subscriber !== 'function') return () => {};
        subscribers.add(subscriber);
        return () => subscribers.delete(subscriber);
    }

    const api = Object.freeze({
        contractId,
        storageKey,
        defaultLocale,
        supportedLocales,
        enabledLocales,
        catalogs,
        normalizeLocale,
        detectBrowserLocale,
        getLocale: () => locale,
        getSuggestedLocale: () => suggestedLocale,
        t,
        apply,
        setLocale,
        subscribe
    });
    global.CaissaI18n = api;

    global.document?.addEventListener?.('change', event => {
        const select = event.target?.closest?.('[data-caissa-locale-select]');
        if (select) setLocale(select.value);
    });
    global.document?.addEventListener?.('click', event => {
        const suggestion = event.target?.closest?.('[data-caissa-locale-suggestion]');
        if (suggestion) setLocale(suggestion.dataset.caissaLocaleSuggestion);
    });
    apply();
})(window);
