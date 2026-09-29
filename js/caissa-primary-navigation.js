(function (global) {
    'use strict';

    const contractId = 'CaissaGlobalNavigationOrderPolicy@1.15.0';
    const i18n = global.CaissaI18n || Object.freeze({
        enabledLocales: Object.freeze(['en']),
        supportedLocales: Object.freeze({ en: Object.freeze({ code: 'en', name: 'English', enabled: true }) }),
        getLocale: () => 'en',
        getSuggestedLocale: () => '',
        t: (_key, fallback = '') => fallback,
        apply: () => {},
        subscribe: () => () => {}
    });
    const groupMessageKeys = Object.freeze([
        'nav.group.playAndCompete',
        'nav.group.learnAndImprove',
        'nav.group.analyzeAndWatch',
        'nav.group.tools'
    ]);
    const allGroups = [
        Object.freeze([
            { id: 'play', label: 'Play', icon: 'fas fa-play-circle', section: 'play', route: '/play', canonicalNavigation: true },
            { id: 'yahooClassic', label: 'CAISSA Classic', icon: 'fas fa-window-restore', section: 'yahooClassic', route: '/yahoo-classic', canonicalNavigation: true },
            { id: 'fics', label: 'FICS', icon: 'fas fa-globe', section: 'fics', route: '/fics', canonicalNavigation: true },
            { id: 'playchess', label: 'Playchess', icon: 'fas fa-chess-board', route: '/play-online/playchess' },
            { id: 'fritz', label: 'Fritz', icon: 'fas fa-chess-knight', route: '/play-online/fritz' }
        ]),
        Object.freeze([
            { id: 'puzzles', label: 'Puzzles', icon: 'fas fa-puzzle-piece', route: '/puzzles' },
            { id: 'academy', label: 'Academy', icon: 'fas fa-graduation-cap', section: 'academy', route: '/academy', canonicalNavigation: true },
            { id: 'endgame-trainer', label: 'Endgame Trainer', icon: 'fas fa-chess-pawn', route: '/endgame-trainer' },
            { id: 'endgame-library', label: 'Endgame Library', icon: 'fas fa-book-reader', route: '/endgame-library' },
            { id: 'endgame-tablebase', label: 'Endgame Tablebase', icon: 'fas fa-chess-board', route: '/endgame-tablebase' }
        ]),
        Object.freeze([
            { id: 'insights', label: 'Insights', icon: 'fas fa-brain', section: 'insights', route: '/insights', canonicalNavigation: true },
            { id: 'analyze', label: 'Analyze', icon: 'fas fa-chart-line', section: 'analyze', route: '/analyze', canonicalNavigation: true },
            { id: 'pgn-replayer', label: 'CAISSA PGN Reader', icon: 'fas fa-file-lines', route: '/pgn-replayer' },
            { id: 'spectator', label: 'Chess TV', icon: 'fas fa-tv', section: 'spectator', route: '/spectator-tv', canonicalNavigation: true },
            { id: 'lichess-tv', label: 'Lichess TV', icon: 'fas fa-tv', route: '/watch/lichess-tv' },
            { id: 'live-blitz', label: 'Live Blitz', icon: 'fas fa-bolt', route: '/watch/live-blitz' },
            { id: 'live-tournaments', label: 'Live Tournaments', icon: 'fas fa-trophy', route: '/watch/live-tournaments' },
            { id: 'arena', label: 'Engine Arena', icon: 'fas fa-robot', section: 'arena', route: '/arena', canonicalNavigation: true }
        ]),
        Object.freeze([
            { id: 'cheater-insight', label: 'Cheater Insight', icon: 'fas fa-user-shield', section: 'cheater-insight', route: '/cheater-insight', canonicalNavigation: true },
            { id: 'polyglot', label: 'Polyglot Tool', icon: 'fas fa-book-open', route: '/tools/polyglot', externalIndicator: true },
            { id: 'opening-database', label: 'Opening Database', icon: 'fas fa-chess-board', route: '/opening-database' },
            { id: 'eco', label: 'ECO Codes', icon: 'fas fa-book', route: '/eco' },
            { id: 'library', label: 'Game Library', icon: 'fas fa-database', section: 'library', route: '/game-library', canonicalNavigation: true },
            { id: 'history', label: 'History', icon: 'fas fa-history', section: 'history', route: '/history', canonicalNavigation: true },
            { id: 'dosChess', label: 'DOS Chess', icon: 'fas fa-desktop', section: 'dosChess', route: '/dos-chess', canonicalNavigation: true },
            { id: 'vault', label: 'Vault', icon: 'fas fa-box-archive', route: '/vault', externalIndicator: true }
        ])
    ];
    const groups = Object.freeze(allGroups);
    const groupLabels = Object.freeze([
        'Play & Compete',
        'Learn & Improve',
        'Analyze & Watch',
        'Tools'
    ]);

    const more = Object.freeze([
        { id: 'blog', label: 'Blog', icon: 'fas fa-rss', route: '/blog' },
        { id: 'support', label: 'Support CAISSA', icon: 'fas fa-heart', route: '/support' },
        { id: 'help', label: 'Help', icon: 'fas fa-question-circle', route: '/help' },
        { id: 'about', label: 'About', icon: 'fas fa-info-circle', route: '/about' },
        { id: 'feedback', label: 'Share an Idea / Contact & Feedback', icon: 'fas fa-comment-dots', route: 'mailto:tvlavin1978@gmail.com?subject=CAISSA%20Feedback&body=Hello%20CAISSA%20Team%2C%0A%0AI%20would%20like%20to%20report%3A%0A%0A%5B%20%5D%20Bug%0A%5B%20%5D%20Feature%20Request%0A%5B%20%5D%20Improvement%20Suggestion%0A%5B%20%5D%20General%20Feedback%0A%0ADetails%3A%0A' }
    ]);

    const externalDestinations = Object.freeze({
        discord: 'https://discord.gg/TM7GJPUVfr'
    });

    const social = Object.freeze([
        { id: 'facebook', label: 'Facebook', icon: 'fab fa-facebook', route: 'https://www.facebook.com/CaissaChessOrg/', newTab: true, externalIndicator: true },
        { id: 'youtube', label: 'CAISSA Chess YouTube', icon: 'fab fa-youtube', route: 'https://www.youtube.com/@CaissaChessOrg', newTab: true, externalIndicator: true },
        { id: 'discord', label: 'CAISSA Discord', icon: 'fab fa-discord', route: externalDestinations.discord, newTab: true, externalIndicator: true }
    ]);

    const support = more;
    const connect = social;

    const inventory = Object.freeze({
        groups,
        more,
        social,
        support,
        connect,
        primary: Object.freeze(groups.flat()),
        all: Object.freeze([...groups.flat(), ...more, ...social])
    });

    function escapeAttribute(value) {
        return String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;');
    }

    function renderItem(item, { activeKey = '', mode = 'routes' } = {}) {
        const active = item.id === activeKey;
        const classes = ['nav-item', item.className, active ? 'active' : ''].filter(Boolean).join(' ');
        const messageKey = `nav.item.${item.id}`;
        const translatedLabel = i18n.t(messageKey, item.label);
        const icon = `<i class="${item.icon}" aria-hidden="true"></i>`;
        const label = `<span class="nav-label" data-caissa-i18n="${escapeAttribute(messageKey)}">${translatedLabel}</span>`;
        const external = item.externalIndicator ? '<i class="fas fa-external-link-alt nav-external-icon" aria-hidden="true"></i>' : '';
        const current = active ? ' aria-current="page"' : '';
        const accessibleLabel = ` aria-label="${escapeAttribute(translatedLabel)}" data-caissa-i18n-aria-label="${escapeAttribute(messageKey)}"`;

        if (mode === 'application' && (item.section || item.action) && !item.canonicalNavigation) {
            const section = item.section ? ` data-section="${escapeAttribute(item.section)}"` : '';
            const action = item.action ? ` data-nav-action="${escapeAttribute(item.action)}"` : '';
            return `<div class="nav-list-item" role="listitem"><button type="button" class="${classes}"${section}${action}${accessibleLabel}${current}>${icon}${label}${external}</button></div>`;
        }

        const target = item.newTab ? ' target="_blank" rel="noopener noreferrer"' : '';
        return `<div class="nav-list-item" role="listitem"><a href="${escapeAttribute(item.route)}" class="${classes}" data-nav-key="${escapeAttribute(item.id)}"${accessibleLabel}${current}${target}>${icon}${label}${external}</a></div>`;
    }

    function renderGroups(options = {}) {
        return groups.map((group, index) => {
            const items = group.map((item) => renderItem(item, options)).join('');
            if (!options.showHeadings) return items;
            const messageKey = groupMessageKeys[index];
            const heading = i18n.t(messageKey, groupLabels[index]);
            return `<section class="nav-group" aria-labelledby="caissa-nav-group-${index}">
                <h2 class="nav-group-heading nav-label" id="caissa-nav-group-${index}" data-caissa-i18n="${messageKey}">${heading}</h2>
                <div class="nav-destination-list" role="list">${items}</div>
            </section>`;
        }).join('<div class="nav-divider" aria-hidden="true"></div>');
    }

    function renderMore(options = {}) {
        const active = more.some(item => item.id === options.activeKey);
        const panelId = `caissa-nav-more-${options.instanceId || 'primary'}`;
        const label = i18n.t('nav.more', 'More');
        return `<section class="nav-more${active ? ' is-open' : ''}" data-caissa-nav-more>
            <button type="button" class="nav-more-toggle" aria-expanded="${String(active)}" aria-controls="${escapeAttribute(panelId)}" data-caissa-i18n-aria-label="nav.more" aria-label="${escapeAttribute(label)}">
                <i class="fas fa-ellipsis-h" aria-hidden="true"></i>
                <span class="nav-label" data-caissa-i18n="nav.more">${label}</span>
                <i class="fas fa-chevron-down nav-more-chevron" aria-hidden="true"></i>
            </button>
            <div class="nav-more-panel" id="${escapeAttribute(panelId)}" role="list"${active ? '' : ' hidden'}>${more.map((item) => renderItem(item, options)).join('')}</div>
        </section>`;
    }

    function renderSocialFooter() {
        return `<div class="nav-social-links" role="list">${social.map((item) => {
            const messageKey = `nav.item.${item.id}`;
            const label = i18n.t(messageKey, item.label);
            return `<div class="nav-social-list-item" role="listitem"><a href="${escapeAttribute(item.route)}" class="nav-social-link" data-nav-key="${escapeAttribute(item.id)}" aria-label="${escapeAttribute(label)}" data-caissa-i18n-aria-label="${escapeAttribute(messageKey)}" title="${escapeAttribute(label)}" data-caissa-i18n-title="${escapeAttribute(messageKey)}" target="_blank" rel="noopener noreferrer"><i class="${item.icon}" aria-hidden="true"></i></a></div>`;
        }).join('')}</div>`;
    }

    function renderBody(options = {}) {
        return `${renderGroups(options)}${renderMore(options)}${renderLanguageControl()}`;
    }

    function setupMoreControllers(root = document) {
        root.querySelectorAll('[data-caissa-nav-more]').forEach(section => {
            const toggle = section.querySelector('.nav-more-toggle');
            const panel = section.querySelector('.nav-more-panel');
            if (!toggle || !panel || toggle.dataset.caissaMoreReady === 'true') return;
            toggle.dataset.caissaMoreReady = 'true';
            toggle.addEventListener('click', () => {
                const open = toggle.getAttribute('aria-expanded') !== 'true';
                toggle.setAttribute('aria-expanded', String(open));
                section.classList.toggle('is-open', open);
                panel.hidden = !open;
            });
        });
    }

    function renderLanguageControl() {
        const currentLocale = i18n.getLocale();
        const suggestion = i18n.getSuggestedLocale();
        const options = i18n.enabledLocales.map(code => {
            const locale = i18n.supportedLocales[code];
            return `<option value="${escapeAttribute(code)}"${code === currentLocale ? ' selected' : ''}>${locale.name}</option>`;
        }).join('');
        const suggestionName = suggestion ? i18n.supportedLocales[suggestion].name : '';
        const suggestionLabel = i18n.t('language.suggestion', 'Use CAISSA in {language}', { language: suggestionName });
        const suggestionButton = suggestion ? `<button type="button" class="nav-language-suggestion" data-caissa-locale-suggestion="${escapeAttribute(suggestion)}" aria-label="${escapeAttribute(suggestionLabel)}"><span aria-hidden="true">🌐</span> ${suggestionName}</button>` : '';
        return `<div class="nav-language-control" role="listitem">
            <label class="nav-language-field">
                <span class="nav-language-label nav-label"><span class="nav-language-icon" aria-hidden="true">🌐</span><span data-caissa-i18n="language.title">${i18n.t('language.title', 'Language')}</span></span>
                <select data-caissa-locale-select data-caissa-i18n-aria-label="language.selectorLabel" aria-label="${escapeAttribute(i18n.t('language.selectorLabel', 'Interface language'))}">${options}</select>
            </label>
${suggestionButton ? `            ${suggestionButton}\n` : ''}
        </div>`;
    }

    function createShellAdapter(id, defaults, slots) {
        const definition = Object.freeze({ id, ...defaults, slots: Object.freeze({ ...slots }) });
        return Object.freeze({
            definition,
            inventory,
            groupLabels,
            renderGroups: (options = {}) => renderGroups({ ...defaults, ...options }),
            renderMore: (options = {}) => renderMore({ ...defaults, ...options }),
            renderBody: (options = {}) => renderBody({ ...defaults, ...options }),
            renderSocialFooter
        });
    }

    const adapters = Object.freeze({
        modernStandalone: createShellAdapter('modern-standalone',
            { mode: 'routes', showHeadings: true },
            { account: 'sidebar-auth-hooks', premium: 'sidebar-premium-hook', actions: 'route-support' }),
        application: createShellAdapter('application-shell',
            { mode: 'application', showHeadings: true },
            { account: 'sidebar-auth-hooks', premium: 'sidebar-premium-hook', actions: 'application-owned' }),
        trainer: createShellAdapter('trainer-board-first',
            { mode: 'routes', showHeadings: true },
            { account: 'omitted-by-shell', premium: 'trainer-premium-hook', actions: 'route-support' })
    });

    function renderFallbackNavigation({ adapter = adapters.modernStandalone, activeKey = '' } = {}) {
        if (!adapter || adapter.inventory !== inventory) {
            throw new Error('CAISSA fallback navigation requires a canonical shell adapter.');
        }
        const options = { activeKey };
        return `<nav class="caissa-sidebar-fallback" aria-label="CAISSA main navigation">
            <div class="nav-items" data-caissa-sidebar-body>${adapter.renderBody(options)}</div>
            <footer class="nav-footer" data-caissa-sidebar-foot aria-label="${escapeAttribute(i18n.t('nav.socialLinks', 'CAISSA social links'))}">${adapter.renderSocialFooter()}</footer>
        </nav>`;
    }

    function createDrawerController({
        host,
        nav,
        toggle,
        backdrop = null,
        openClass = 'is-open',
        bodyOpenClass = '',
        mobileQuery = '(max-width: 768px)',
        openLabel = '',
        closeLabel = '',
        onStateChange = null
    } = {}) {
        if (!host || !nav || !toggle || !nav.id) {
            throw new Error('CAISSA drawer requires a host, named navigation, and toggle.');
        }
        const media = global.matchMedia ? global.matchMedia(mobileQuery) : { matches: false, addEventListener() {}, removeEventListener() {} };
        let open = false;

        toggle.setAttribute('aria-controls', nav.id);

        function focusableElements() {
            return [toggle, ...nav.querySelectorAll('a[href], button:not([hidden]):not([disabled])')]
                .filter((element) => element.getClientRects().length);
        }

        function applyState({ returnFocus = false } = {}) {
            const mobile = media.matches;
            host.classList.toggle(openClass, mobile && open);
            if (bodyOpenClass) document.body?.classList.toggle(bodyOpenClass, mobile && open);
            toggle.setAttribute('aria-expanded', String(mobile && open));
            const labelKey = mobile && open ? 'shell.closeNavigation' : 'shell.openNavigation';
            toggle.dataset.caissaI18nAriaLabel = labelKey;
            toggle.setAttribute('aria-label', mobile && open
                ? (closeLabel || i18n.t(labelKey, 'Close navigation menu'))
                : (openLabel || i18n.t(labelKey, 'Open navigation menu')));
            nav.toggleAttribute('inert', mobile && !open);
            nav.inert = mobile && !open;
            if (mobile && !open) nav.setAttribute('aria-hidden', 'true');
            else nav.removeAttribute('aria-hidden');
            if (backdrop) backdrop.setAttribute('aria-hidden', String(!(mobile && open)));
            onStateChange?.(mobile && open);
            if (returnFocus && toggle.getClientRects().length) toggle.focus();
        }

        function openDrawer() {
            if (!media.matches) return;
            open = true;
            applyState();
            nav.querySelector('a[href], button:not([hidden]):not([disabled])')?.focus();
        }

        function closeDrawer({ returnFocus = true } = {}) {
            open = false;
            applyState({ returnFocus });
        }

        function onToggle() {
            if (open) closeDrawer();
            else openDrawer();
        }

        function onBackdrop() {
            closeDrawer();
        }

        function onNavClick(event) {
            if (event.target.closest('a') && media.matches) closeDrawer({ returnFocus: false });
        }

        function onKeydown(event) {
            if (!media.matches || !open) return;
            if (event.key === 'Escape') {
                event.preventDefault();
                closeDrawer();
                return;
            }
            if (event.key !== 'Tab') return;
            const focusable = focusableElements();
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last?.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first?.focus();
            }
        }

        function onMediaChange() {
            open = false;
            applyState();
        }

        toggle.addEventListener('click', onToggle);
        backdrop?.addEventListener('click', onBackdrop);
        nav.addEventListener('click', onNavClick);
        document.addEventListener('keydown', onKeydown);
        media.addEventListener?.('change', onMediaChange);
        applyState();

        return Object.freeze({
            open: openDrawer,
            close: closeDrawer,
            sync: onMediaChange,
            destroy() {
                closeDrawer({ returnFocus: false });
                toggle.removeEventListener('click', onToggle);
                backdrop?.removeEventListener('click', onBackdrop);
                nav.removeEventListener('click', onNavClick);
                document.removeEventListener('keydown', onKeydown);
                media.removeEventListener?.('change', onMediaChange);
            }
        });
    }

    const api = Object.freeze({
        contractId,
        inventory,
        groupLabels,
        externalDestinations,
        adapters,
        i18n,
        renderGroups,
        renderMore,
        renderBody,
        renderSocialFooter,
        renderLanguageControl,
        renderFallbackNavigation,
        createDrawerController,
        setupMoreControllers
    });
    global.CaissaPrimaryNavigation = api;

    function adapterFor(host) {
        const requested = host.dataset.caissaSidebarAdapter;
        if (requested && adapters[requested]) return adapters[requested];
        return host.dataset.navigationMode === 'application' ? adapters.application : null;
    }

    function markAdoptedShell(host) {
        const nav = host.closest?.('nav');
        nav?.classList.add('caissa-shared-sidebar');
        if (nav) {
            nav.dataset.caissaI18nAriaLabel = 'shell.mainNavigation';
            nav.setAttribute('aria-label', i18n.t('shell.mainNavigation', 'CAISSA main navigation'));
        }
        nav?.closest?.('.app-container, .endgame-trainer-page')?.classList.add('caissa-sidebar-adopted');
    }

    document.querySelectorAll('.nav-logo').forEach((brand) => {
        if (brand.tagName === 'A') {
            brand.setAttribute('href', '/play');
            brand.dataset.caissaI18nAriaLabel = 'shell.returnToPlay';
            brand.setAttribute('aria-label', i18n.t('shell.returnToPlay', 'CAISSA Chess — return to Play'));
            return;
        }
        const link = document.createElement('a');
        link.className = brand.className;
        link.href = '/play';
        link.dataset.caissaI18nAriaLabel = 'shell.returnToPlay';
        link.setAttribute('aria-label', i18n.t('shell.returnToPlay', 'CAISSA Chess — return to Play'));
        while (brand.firstChild) link.appendChild(brand.firstChild);
        brand.replaceWith(link);
    });

    document.querySelectorAll('[data-caissa-primary-groups]').forEach((host) => {
        const options = { activeKey: host.dataset.active || '', mode: host.dataset.navigationMode || 'routes' };
        const adapter = adapterFor(host);
        host.innerHTML = adapter ? adapter.renderBody(options) : renderBody(options);
        host.setAttribute('data-caissa-sidebar-body', '');
        host.setAttribute('data-caissa-navigation-order-ready', contractId);
        markAdoptedShell(host);
    });
    document.querySelectorAll('[data-caissa-social-footer]').forEach((host) => {
        const adapter = adapterFor(host);
        host.innerHTML = adapter ? adapter.renderSocialFooter() : renderSocialFooter();
        markAdoptedShell(host);
    });
    setupMoreControllers(document);
    const shellTextBindings = [
        ['#sidebarSignIn .nav-label', 'shell.signIn'],
        ['#sidebarAccountBtn span', 'shell.account'],
        ['#sidebarSignOutBtn span', 'shell.signOut'],
        ['.nav-premium-btn .nav-label', 'shell.premium'],
        ['.nav-premium-btn .nav-premium-badge', 'shell.upgrade']
    ];
    shellTextBindings.forEach(([selector, key]) => {
        document.querySelectorAll(selector).forEach(element => { element.dataset.caissaI18n = key; });
    });
    const shellAriaBindings = [
        ['#sidebarUserInfo', 'shell.accountMenu'],
        ['.nav-premium-btn', 'shell.upgradePremium']
    ];
    shellAriaBindings.forEach(([selector, key]) => {
        document.querySelectorAll(selector).forEach(element => { element.dataset.caissaI18nAriaLabel = key; });
    });
    document.querySelectorAll('.nav-collapse-btn').forEach(button => {
        button.dataset.caissaI18nAriaLabel = button.getAttribute('aria-expanded') === 'false'
            ? 'shell.expandNavigation'
            : 'shell.collapseNavigation';
    });
    document.querySelectorAll('.mobile-nav-toggle, [data-mobile-nav-toggle]').forEach(button => {
        button.dataset.caissaI18nAriaLabel = button.getAttribute('aria-expanded') === 'true'
            ? 'shell.closeNavigation'
            : 'shell.openNavigation';
    });
    i18n.apply(document);
})(window);
