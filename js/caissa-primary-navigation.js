(function (global) {
    'use strict';

    const groups = Object.freeze([
        Object.freeze([
            { id: 'yahooClassic', label: 'CAISSA Classic', icon: 'fas fa-window-restore', section: 'yahooClassic', route: '/yahoo-classic' },
            { id: 'play', label: 'Play', icon: 'fas fa-play-circle', section: 'play', route: '/?section=play' },
            { id: 'mentor', label: 'Mentor', icon: 'fas fa-graduation-cap', section: 'mentor', route: '/?section=mentor', className: 'nav-item-tool' },
            { id: 'academy', label: 'Academy', icon: 'fas fa-graduation-cap', section: 'academy', route: '/?section=academy' },
            { id: 'endgame-trainer', label: 'Endgame Trainer', icon: 'fas fa-chess-pawn', route: '/endgame-trainer' },
            { id: 'endgame-library', label: 'Endgame Library', icon: 'fas fa-book-reader', route: '/endgame-library' }
        ]),
        Object.freeze([
            { id: 'insights', label: 'Insights', icon: 'fas fa-brain', section: 'insights', route: '/?section=insights' },
            { id: 'fics', label: 'FICS', icon: 'fas fa-globe', section: 'fics', route: '/?section=fics' },
            { id: 'analyze', label: 'Analyze', icon: 'fas fa-chart-line', section: 'analyze', route: '/?section=analyze' },
            { id: 'spectator', label: 'Spectator TV', icon: 'fas fa-tv', section: 'spectator', route: '/?section=spectator' },
            { id: 'arena', label: 'Arena', icon: 'fas fa-robot', section: 'arena', route: '/?section=arena' }
        ]),
        Object.freeze([
            { id: 'cheater-insight', label: 'Cheater Insight', icon: 'fas fa-user-shield', section: 'cheater-insight', route: '/?section=cheater-insight' },
            { id: 'polyglot', label: 'Polyglot Tool', icon: 'fas fa-book-open', route: '/tools/polyglot', externalIndicator: true },
            { id: 'opening-database', label: 'Opening Database', icon: 'fas fa-chess-board', route: '/opening-database' },
            { id: 'eco', label: 'ECO Codes', icon: 'fas fa-book', route: '/eco' },
            { id: 'library', label: 'Game Library', icon: 'fas fa-database', section: 'library', route: '/?section=library', className: 'nav-item-tool' }
        ]),
        Object.freeze([
            { id: 'history', label: 'History', icon: 'fas fa-history', section: 'history', route: '/?section=history' },
            { id: 'dosChess', label: 'DOS Chess', icon: 'fas fa-desktop', section: 'dosChess', route: '/?section=dosChess' },
            { id: 'vault', label: 'Vault', icon: 'fas fa-box-archive', route: '/vault', externalIndicator: true },
            { id: 'blog', label: 'Blog', icon: 'fas fa-rss', route: '/blog' }
        ])
    ]);

    const support = Object.freeze([
        { id: 'help', label: 'Help', icon: 'fas fa-question-circle', route: '/help' },
        { id: 'about', label: 'About', icon: 'fas fa-info-circle', route: '/about' }
    ]);

    const connect = Object.freeze([
        { id: 'facebook', label: 'Facebook', icon: 'fab fa-facebook', route: 'https://www.facebook.com/CaissaChessOrg/', newTab: true, externalIndicator: true },
        { id: 'youtube', label: 'CAISSA Chess YouTube', icon: 'fas fa-video', route: 'https://www.youtube.com/@CaissaChessOrg', newTab: true, externalIndicator: true },
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

        if (mode === 'application' && (item.section || item.action)) {
            const section = item.section ? ` data-section="${escapeAttribute(item.section)}"` : '';
            const action = item.action ? ` data-nav-action="${escapeAttribute(item.action)}"` : '';
            return `<button type="button" class="${classes}"${section}${action} aria-label="${escapeAttribute(item.label)}"${current}>${icon}${label}${external}</button>`;
        }

        const target = item.newTab ? ' target="_blank" rel="noopener noreferrer"' : '';
        return `<a href="${escapeAttribute(item.route)}" class="${classes}" data-nav-key="${escapeAttribute(item.id)}" aria-label="${escapeAttribute(item.label)}"${current}${target}>${icon}${label}${external}</a>`;
    }

    function renderGroups(options = {}) {
        return groups.map((group) => group.map((item) => renderItem(item, options)).join(''))
            .join('<div class="nav-divider" aria-hidden="true"></div>');
    }

    function renderSupport(options = {}) {
        return support.map((item) => renderItem(item, options)).join('');
    }

    function renderConnect(options = {}) {
        return `<div class="nav-connect-label nav-label">Connect with CAISSA Chess</div>${connect.map((item) => renderItem(item, options)).join('')}`;
    }

    const api = Object.freeze({
        inventory,
        renderGroups,
        renderSupport,
        renderConnect
    });
    global.CaissaPrimaryNavigation = api;

    document.querySelectorAll('[data-caissa-primary-groups]').forEach((host) => {
        const options = { activeKey: host.dataset.active || '', mode: host.dataset.navigationMode || 'routes' };
        host.innerHTML = `${renderGroups(options)}${host.hasAttribute('data-include-connect') ? renderConnect(options) : ''}`;
    });
    document.querySelectorAll('[data-caissa-primary-support]').forEach((host) => {
        const options = { activeKey: host.dataset.active || '', mode: host.dataset.navigationMode || 'routes' };
        host.innerHTML = renderSupport(options);
    });
})(window);
