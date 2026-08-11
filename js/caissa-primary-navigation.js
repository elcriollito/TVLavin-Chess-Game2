(function (global) {
    'use strict';

    const contractId = 'CaissaGlobalNavigationOrderPolicy@1.0.0';
    // PLAY & COMPETE may add Play Online at position 4 only after that product exists.
    // This policy intentionally publishes no route, placeholder, control, or feature flag for it today.
    const allGroups = [
        Object.freeze([
            { id: 'play', label: 'Play', icon: 'fas fa-play-circle', section: 'play', route: '/play', canonicalNavigation: true },
            { id: 'yahooClassic', label: 'CAISSA Classic', icon: 'fas fa-window-restore', section: 'yahooClassic', route: '/yahoo-classic', canonicalNavigation: true },
            { id: 'fics', label: 'FICS', icon: 'fas fa-globe', section: 'fics', route: '/fics', canonicalNavigation: true }
        ]),
        Object.freeze([
            { id: 'academy', label: 'Academy', icon: 'fas fa-graduation-cap', section: 'academy', route: '/academy', canonicalNavigation: true },
            { id: 'endgame-trainer', label: 'Endgame Trainer', icon: 'fas fa-chess-pawn', route: '/endgame-trainer' },
            { id: 'endgame-practice', label: 'Endgame Practice', icon: 'fas fa-chess-board', route: '/endgame-practice' },
            { id: 'endgame-library', label: 'Endgame Library', icon: 'fas fa-book-reader', route: '/endgame-library' }
        ]),
        Object.freeze([
            { id: 'insights', label: 'Insights', icon: 'fas fa-brain', section: 'insights', route: '/insights', canonicalNavigation: true },
            { id: 'analyze', label: 'Analyze', icon: 'fas fa-chart-line', section: 'analyze', route: '/analyze', canonicalNavigation: true },
            { id: 'spectator', label: 'Spectator TV', icon: 'fas fa-tv', section: 'spectator', route: '/spectator-tv', canonicalNavigation: true },
            { id: 'arena', label: 'Arena', icon: 'fas fa-robot', section: 'arena', route: '/arena', canonicalNavigation: true }
        ]),
        Object.freeze([
            { id: 'cheater-insight', label: 'Cheater Insight', icon: 'fas fa-user-shield', section: 'cheater-insight', route: '/cheater-insight', canonicalNavigation: true },
            { id: 'polyglot', label: 'Polyglot Tool', icon: 'fas fa-book-open', route: '/tools/polyglot', externalIndicator: true },
            { id: 'opening-database', label: 'Opening Database', icon: 'fas fa-chess-board', route: '/opening-database' },
            { id: 'eco', label: 'ECO Codes', icon: 'fas fa-book', route: '/eco' },
            { id: 'library', label: 'Game Library', icon: 'fas fa-database', section: 'library', route: '/game-library', className: 'nav-item-tool', canonicalNavigation: true },
            { id: 'history', label: 'History', icon: 'fas fa-history', section: 'history', route: '/history', canonicalNavigation: true },
            { id: 'dosChess', label: 'DOS Chess', icon: 'fas fa-desktop', section: 'dosChess', route: '/dos-chess', canonicalNavigation: true },
            { id: 'vault', label: 'Vault', icon: 'fas fa-box-archive', route: '/vault', externalIndicator: true },
            { id: 'blog', label: 'Blog', icon: 'fas fa-rss', route: '/blog' }
        ])
    ];
    const groups = Object.freeze(allGroups);
    const groupLabels = Object.freeze([
        'Play & Compete',
        'Learn & Improve',
        'Analyze & Watch',
        'Tools'
    ]);

    const support = Object.freeze([
        { id: 'help', label: 'Help', icon: 'fas fa-question-circle', route: '/help' },
        { id: 'about', label: 'About', icon: 'fas fa-info-circle', route: '/about' }
    ]);

    const externalDestinations = Object.freeze({
        discord: 'https://discord.gg/xbFpAtbUK'
    });

    const connect = Object.freeze([
        { id: 'facebook', label: 'Facebook', icon: 'fab fa-facebook', route: 'https://www.facebook.com/CaissaChessOrg/', newTab: true, externalIndicator: true },
        { id: 'youtube', label: 'CAISSA Chess YouTube', icon: 'fas fa-video', route: 'https://www.youtube.com/@CaissaChessOrg', newTab: true, externalIndicator: true },
        { id: 'discord', label: 'CAISSA Discord', icon: 'fab fa-discord', route: externalDestinations.discord, newTab: true, externalIndicator: true },
        { id: 'feedback', label: 'Share an Idea / Contact & Feedback', icon: 'fas fa-comment-dots', route: 'mailto:tvlavin1978@gmail.com?subject=CAISSA%20Feedback&body=Hello%20CAISSA%20Team%2C%0A%0AI%20would%20like%20to%20report%3A%0A%0A%5B%20%5D%20Bug%0A%5B%20%5D%20Feature%20Request%0A%5B%20%5D%20Improvement%20Suggestion%0A%5B%20%5D%20General%20Feedback%0A%0ADetails%3A%0A' }
    ]);

    const inventory = Object.freeze({
        groups,
        support,
        connect,
        primary: Object.freeze(groups.flat()),
        all: Object.freeze([...groups.flat(), ...support, ...connect])
    });

    function escapeAttribute(value) {
        return String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;');
    }

    function renderItem(item, { activeKey = '', mode = 'routes' } = {}) {
        const active = item.id === activeKey;
        const classes = ['nav-item', item.className, active ? 'active' : ''].filter(Boolean).join(' ');
        const icon = `<i class="${item.icon}" aria-hidden="true"></i>`;
        const label = `<span class="nav-label">${item.label}</span>`;
        const external = item.externalIndicator ? '<i class="fas fa-external-link-alt nav-external-icon" aria-hidden="true"></i>' : '';
        const current = active ? ' aria-current="page"' : '';

        if (mode === 'application' && (item.section || item.action) && !item.canonicalNavigation) {
            const section = item.section ? ` data-section="${escapeAttribute(item.section)}"` : '';
            const action = item.action ? ` data-nav-action="${escapeAttribute(item.action)}"` : '';
            return `<button type="button" class="${classes}"${section}${action} aria-label="${escapeAttribute(item.label)}"${current}>${icon}${label}${external}</button>`;
        }

        const target = item.newTab ? ' target="_blank" rel="noopener noreferrer"' : '';
        return `<a href="${escapeAttribute(item.route)}" class="${classes}" data-nav-key="${escapeAttribute(item.id)}" aria-label="${escapeAttribute(item.label)}"${current}${target}>${icon}${label}${external}</a>`;
    }

    function renderGroups(options = {}) {
        return groups.map((group, index) => {
            const items = group.map((item) => renderItem(item, options)).join('');
            if (!options.showHeadings) return items;
            return `<section class="nav-group" aria-labelledby="caissa-nav-group-${index}">
                <h2 class="nav-group-heading nav-label" id="caissa-nav-group-${index}">${groupLabels[index]}</h2>
                ${items}
            </section>`;
        }).join('<div class="nav-divider" aria-hidden="true"></div>');
    }

    function renderSupport(options = {}) {
        return support.map((item) => renderItem(item, options)).join('');
    }

    function renderConnect(options = {}) {
        return `<div class="nav-connect-label nav-label">Connect with CAISSA Chess</div>${connect.map((item) => renderItem(item, options)).join('')}`;
    }

    const api = Object.freeze({
        contractId,
        inventory,
        groupLabels,
        externalDestinations,
        renderGroups,
        renderSupport,
        renderConnect
    });
    global.CaissaPrimaryNavigation = api;

    document.querySelectorAll('.nav-logo').forEach((brand) => {
        if (brand.tagName === 'A') {
            brand.setAttribute('href', '/play');
            brand.setAttribute('aria-label', 'CAISSA Chess — return to Play');
            return;
        }
        const link = document.createElement('a');
        link.className = brand.className;
        link.href = '/play';
        link.setAttribute('aria-label', 'CAISSA Chess — return to Play');
        while (brand.firstChild) link.appendChild(brand.firstChild);
        brand.replaceWith(link);
    });

    document.querySelectorAll('[data-caissa-primary-groups]').forEach((host) => {
        const options = { activeKey: host.dataset.active || '', mode: host.dataset.navigationMode || 'routes' };
        host.innerHTML = `${renderGroups(options)}${host.hasAttribute('data-include-connect') ? renderConnect(options) : ''}`;
        host.setAttribute('data-caissa-navigation-order-ready', contractId);
    });
    document.querySelectorAll('[data-caissa-primary-support]').forEach((host) => {
        const options = { activeKey: host.dataset.active || '', mode: host.dataset.navigationMode || 'routes' };
        host.innerHTML = renderSupport(options);
    });
})(window);
