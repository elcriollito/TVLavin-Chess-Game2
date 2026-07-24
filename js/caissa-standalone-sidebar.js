(function () {
    'use strict';

    const groups = [
        [
            ['yahooClassic', 'CAISSA Classic', 'fas fa-window-restore', '/?section=yahooClassic'],
            ['play', 'Play', 'fas fa-play-circle', '/?section=play'],
            ['mentor', 'Mentor', 'fas fa-graduation-cap', '/?section=mentor', 'nav-item-tool'],
            ['academy', 'Academy', 'fas fa-graduation-cap', '/?section=academy'],
            ['endgame-library', 'Endgame Library', 'fas fa-book-reader', '/endgame-library', 'nav-item-external']
        ],
        [
            ['insights', 'Insights', 'fas fa-brain', '/?section=insights'],
            ['fics', 'FICS', 'fas fa-globe', '/?section=fics'],
            ['analyze', 'Analyze', 'fas fa-chart-line', '/?section=analyze'],
            ['spectator', 'Spectator TV', 'fas fa-tv', '/?section=spectator'],
            ['arena', 'Arena', 'fas fa-robot', '/?section=arena']
        ],
        [
            ['cheater-insight', 'Cheater Insight', 'fas fa-user-shield', '/?section=cheater-insight'],
            ['polyglot', 'Polyglot Tool', 'fas fa-book-open', '/tools/polyglot', 'nav-item-external', true],
            ['opening-database', 'Opening Database', 'fas fa-chess-board', '/opening-database', 'nav-item-external'],
            ['eco', 'ECO Codes', 'fas fa-book', '/eco', 'nav-item-external'],
            ['library', 'Game Library', 'fas fa-database', '/?section=library', 'nav-item-tool']
        ],
        [
            ['history', 'History', 'fas fa-history', '/?section=history'],
            ['dosChess', 'DOS Chess', 'fas fa-desktop', '/?section=dosChess'],
            ['vault', 'Vault', 'fas fa-box-archive', '/vault', 'nav-item-external', true],
            ['blog', 'Blog', 'fas fa-rss', '/blog', 'nav-item-external']
        ]
    ];

    const feedbackHref = 'mailto:tvlavin1978@gmail.com?subject=CAISSA%20Feedback&body=Hello%20CAISSA%20Team%2C%0A%0AI%20would%20like%20to%20report%3A%0A%0A%5B%20%5D%20Bug%0A%5B%20%5D%20Feature%20Request%0A%5B%20%5D%20Improvement%20Suggestion%0A%5B%20%5D%20General%20Feedback%0A%0ADetails%3A%0A';

    function renderItem(item, activeKey) {
        const [key, label, icon, href, extraClass = '', showExternalIcon = false, newTab = false] = item;
        const isActive = key === activeKey;
        const classes = ['nav-item', extraClass, isActive ? 'active' : ''].filter(Boolean).join(' ');
        const current = isActive ? ' aria-current="page"' : '';
        const external = newTab ? ' target="_blank" rel="noopener noreferrer"' : '';
        const externalIcon = showExternalIcon ? '<i class="fas fa-external-link-alt nav-external-icon" aria-hidden="true"></i>' : '';
        return `<a href="${href}" class="${classes}" aria-label="${label}"${current}${external}>
            <i class="${icon}" aria-hidden="true"></i>
            <span class="nav-label">${label}</span>
            ${externalIcon}
        </a>`;
    }

    function renderSidebar(host) {
        const activeKey = host.dataset.active || '';
        const items = groups.map((group) => group.map((item) => renderItem(item, activeKey)).join('')).join('<div class="nav-divider" aria-hidden="true"></div>');

        host.classList.add('caissa-standalone-sidebar-host');
        host.innerHTML = `
            <button type="button" class="mobile-nav-toggle caissa-standalone-mobile-toggle" aria-label="Open navigation menu" aria-controls="mainNav" aria-expanded="false">
                <i class="fas fa-bars" aria-hidden="true"></i>
            </button>
            <nav id="mainNav" class="main-navigation" aria-label="CAISSA main navigation">
                <div class="nav-header">
                    <a href="/" class="nav-logo" aria-label="CAISSA Chess home">
                        <i class="fas fa-chess-knight" aria-hidden="true"></i>
                        <span class="nav-logo-text">CAISSA</span>
                    </a>
                    <button type="button" class="nav-collapse-btn" aria-label="Collapse navigation" aria-expanded="true">
                        <i class="fas fa-chevron-left" aria-hidden="true"></i>
                    </button>
                </div>
                <div class="nav-auth-area" id="sidebarAuthArea">
                    <a href="/signin" class="nav-auth-btn nav-auth-signin" id="sidebarSignIn">
                        <i class="fas fa-sign-in-alt" aria-hidden="true"></i>
                        <span class="nav-label">Sign In</span>
                    </a>
                    <button type="button" class="nav-auth-user nav-auth-signed-in" id="sidebarUserInfo" hidden aria-label="Account menu" aria-expanded="false">
                        <div class="nav-auth-avatar" id="sidebarUserAvatar"><span class="nav-auth-initials">U</span></div>
                        <div class="nav-auth-details">
                            <span class="nav-auth-name" id="sidebarUserName">User</span>
                            <span class="nav-auth-tier" id="sidebarUserTier">Free</span>
                        </div>
                        <i class="fas fa-chevron-down nav-auth-menu-caret" aria-hidden="true"></i>
                    </button>
                    <div class="nav-auth-menu" id="sidebarAuthMenu" role="menu" aria-hidden="true" hidden>
                        <button type="button" class="nav-auth-menu-item" id="sidebarAccountBtn" role="menuitem"><i class="fas fa-user-circle" aria-hidden="true"></i><span>Account</span></button>
                        <button type="button" class="nav-auth-menu-item nav-auth-menu-signout" id="sidebarSignOutBtn" role="menuitem"><i class="fas fa-sign-out-alt" aria-hidden="true"></i><span>Sign Out</span></button>
                    </div>
                </div>
                <div class="nav-premium-cta">
                    <a href="/premium" class="nav-premium-btn" aria-label="Upgrade to Premium">
                        <i class="fas fa-crown" aria-hidden="true"></i>
                        <span class="nav-label">Premium</span>
                        <span class="nav-premium-badge">Upgrade</span>
                    </a>
                </div>
                <div class="nav-items">${items}
                    <div class="nav-connect-label nav-label">Connect with CAISSA Chess</div>
                    <a href="https://www.facebook.com/CaissaChessOrg/" target="_blank" rel="noopener noreferrer" class="nav-item nav-item-external" aria-label="CAISSA Chess on Facebook (opens in a new tab)">
                        <i class="fab fa-facebook" aria-hidden="true"></i>
                        <span class="nav-label">Facebook</span>
                        <i class="fas fa-external-link-alt nav-external-icon" aria-hidden="true"></i>
                    </a>
                    <a href="https://www.youtube.com/@CaissaChessOrg" target="_blank" rel="noopener noreferrer" class="nav-item nav-item-external" aria-label="CAISSA Chess YouTube (opens in a new tab)">
                        <i class="fas fa-video" aria-hidden="true"></i>
                        <span class="nav-label">CAISSA Chess YouTube</span>
                        <i class="fas fa-external-link-alt nav-external-icon" aria-hidden="true"></i>
                    </a>
                    <a href="${feedbackHref}" class="nav-item nav-item-external" aria-label="Send feedback about CAISSA Chess">
                        <i class="fas fa-comment-dots" aria-hidden="true"></i>
                        <span class="nav-label">Share an Idea / Contact &amp; Feedback</span>
                    </a>
                </div>
                <div class="nav-footer">
                    <a href="/?section=help" class="nav-item" aria-label="Help and FAQ"><i class="fas fa-question-circle" aria-hidden="true"></i><span class="nav-label">Help</span></a>
                    <a href="/?section=settings" class="nav-item" aria-label="Settings section"><i class="fas fa-cog" aria-hidden="true"></i><span class="nav-label">Settings</span></a>
                </div>
            </nav>`;

        const nav = host.querySelector('.main-navigation');
        const collapseButton = host.querySelector('.nav-collapse-btn');
        const mobileToggle = host.querySelector('.caissa-standalone-mobile-toggle');
        const activeItem = host.querySelector('.nav-items > .active');
        if (activeItem) {
            const itemList = activeItem.closest('.nav-items');
            itemList.scrollTop = Math.max(0, activeItem.offsetTop - itemList.clientHeight + activeItem.offsetHeight + 12);
        }

        collapseButton.addEventListener('click', () => {
            const collapsed = host.classList.toggle('is-collapsed');
            collapseButton.setAttribute('aria-expanded', String(!collapsed));
            collapseButton.setAttribute('aria-label', collapsed ? 'Expand navigation' : 'Collapse navigation');
            collapseButton.querySelector('i').className = collapsed ? 'fas fa-chevron-right' : 'fas fa-chevron-left';
        });

        function closeMobileNav() {
            host.classList.remove('is-open');
            mobileToggle.setAttribute('aria-expanded', 'false');
            mobileToggle.setAttribute('aria-label', 'Open navigation menu');
        }

        mobileToggle.addEventListener('click', () => {
            const open = host.classList.toggle('is-open');
            mobileToggle.setAttribute('aria-expanded', String(open));
            mobileToggle.setAttribute('aria-label', open ? 'Close navigation menu' : 'Open navigation menu');
        });
        nav.addEventListener('click', (event) => {
            if (event.target.closest('a') && window.innerWidth <= 768) closeMobileNav();
        });
        document.addEventListener('click', (event) => {
            if (window.innerWidth <= 768 && host.classList.contains('is-open') && !host.contains(event.target)) closeMobileNav();
        });
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && host.classList.contains('is-open')) {
                closeMobileNav();
                mobileToggle.focus();
            }
        });
    }

    document.querySelectorAll('[data-caissa-standalone-sidebar]').forEach(renderSidebar);
})();
