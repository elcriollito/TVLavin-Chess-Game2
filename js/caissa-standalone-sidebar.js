(function () {
    'use strict';

    function renderSidebar(host) {
        const navigation = window.CaissaPrimaryNavigation;
        if (!navigation) throw new Error('CAISSA primary navigation inventory is unavailable.');
        const activeKey = host.dataset.active || '';
        const renderOptions = { activeKey, mode: 'routes' };
        const items = navigation.renderGroups(renderOptions);

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
                <div class="nav-items">${items}${navigation.renderConnect(renderOptions)}</div>
                <div class="nav-footer">${navigation.renderSupport(renderOptions)}</div>
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
