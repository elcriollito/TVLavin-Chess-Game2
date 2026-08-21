(function () {
    'use strict';

    function renderSidebar(host) {
        const navigation = window.CaissaPrimaryNavigation;
        if (!navigation) throw new Error('CAISSA primary navigation inventory is unavailable.');
        const adapter = navigation.adapters.modernStandalone;
        const activeKey = host.dataset.active || '';
        const renderOptions = { activeKey };
        const items = adapter.renderGroups(renderOptions);

        host.classList.add('caissa-standalone-sidebar-host');
        host.innerHTML = `
            <button type="button" class="mobile-nav-toggle caissa-standalone-mobile-toggle" aria-label="Open navigation menu" aria-controls="mainNav" aria-expanded="false">
                <i class="fas fa-bars" aria-hidden="true"></i>
            </button>
            <nav id="mainNav" class="main-navigation" aria-label="CAISSA main navigation">
                <div class="nav-header">
                    <a href="/play" class="nav-logo" aria-label="CAISSA Chess — return to Play">
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
                <div class="nav-items">${items}${adapter.renderConnect(renderOptions)}</div>
                <section class="nav-footer" aria-labelledby="caissa-nav-support-heading">
                    <h2 class="nav-group-heading nav-label" id="caissa-nav-support-heading">Support</h2>
                    <div role="list">${adapter.renderSupport(renderOptions)}</div>
                </section>
            </nav>
            <div class="caissa-standalone-backdrop" aria-hidden="true"></div>`;
        host.setAttribute('data-caissa-navigation-order-ready', navigation.contractId);

        const nav = host.querySelector('.main-navigation');
        const collapseButton = host.querySelector('.nav-collapse-btn');
        const mobileToggle = host.querySelector('.caissa-standalone-mobile-toggle');
        const backdrop = host.querySelector('.caissa-standalone-backdrop');
        const activeItem = host.querySelector('.nav-items .active');
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

        navigation.createDrawerController({
            host,
            nav,
            toggle: mobileToggle,
            backdrop,
            bodyOpenClass: 'caissa-standalone-nav-open'
        });
    }

    document.querySelectorAll('[data-caissa-standalone-sidebar]').forEach(renderSidebar);
    if (!document.querySelector('script[data-caissa-standalone-auth-runtime]')) {
        const authRuntime = document.createElement('script');
        authRuntime.src = '/js/caissa-standalone-auth-runtime.js?v=1.0.0';
        authRuntime.dataset.caissaStandaloneAuthRuntime = 'true';
        document.head.appendChild(authRuntime);
    }
})();
