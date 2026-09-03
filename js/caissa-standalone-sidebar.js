(function () {
    'use strict';
    const ownsAuthRuntime = document.currentScript?.dataset.caissaAuthRuntime === 'external';

    function renderSidebar(host) {
        const navigation = window.CaissaPrimaryNavigation;
        if (!navigation) throw new Error('CAISSA primary navigation inventory is unavailable.');
        const adapter = navigation.adapters.modernStandalone;
        const i18n = navigation.i18n;
        const activeKey = host.dataset.active || '';
        const renderOptions = { activeKey };
        const items = adapter.renderGroups(renderOptions);

        host.classList.add('caissa-standalone-sidebar-host');
        host.innerHTML = `
            <button type="button" class="mobile-nav-toggle caissa-standalone-mobile-toggle" data-caissa-i18n-aria-label="shell.openNavigation" aria-label="${i18n.t('shell.openNavigation', 'Open navigation menu')}" aria-controls="mainNav" aria-expanded="false">
                <i class="fas fa-bars" aria-hidden="true"></i>
            </button>
            <nav id="mainNav" class="main-navigation" data-caissa-i18n-aria-label="shell.mainNavigation" aria-label="${i18n.t('shell.mainNavigation', 'CAISSA main navigation')}">
                <div class="nav-header">
                    <a href="/play" class="nav-logo" data-caissa-i18n-aria-label="shell.returnToPlay" aria-label="${i18n.t('shell.returnToPlay', 'CAISSA Chess — return to Play')}">
                        <i class="fas fa-chess-knight" aria-hidden="true"></i>
                        <span class="nav-logo-text">CAISSA</span>
                    </a>
                    <button type="button" class="nav-collapse-btn" data-caissa-i18n-aria-label="shell.collapseNavigation" aria-label="${i18n.t('shell.collapseNavigation', 'Collapse navigation')}" aria-expanded="true">
                        <i class="fas fa-chevron-left" aria-hidden="true"></i>
                    </button>
                </div>
                <div class="nav-auth-area" id="sidebarAuthArea" data-auth-state="loading" aria-busy="true">
                    <a href="/signin" class="nav-auth-btn nav-auth-signin" id="sidebarSignIn">
                        <i class="fas fa-sign-in-alt" aria-hidden="true"></i>
                        <span class="nav-label" data-caissa-i18n="shell.signIn">${i18n.t('shell.signIn', 'Sign In')}</span>
                    </a>
                    <button type="button" class="nav-auth-user nav-auth-signed-in" id="sidebarUserInfo" hidden data-caissa-i18n-aria-label="shell.accountMenu" aria-label="${i18n.t('shell.accountMenu', 'Account menu')}" aria-expanded="false">
                        <div class="nav-auth-avatar" id="sidebarUserAvatar"><span class="nav-auth-initials">U</span></div>
                        <div class="nav-auth-details">
                            <span class="nav-auth-name" id="sidebarUserName">User</span>
                            <span class="nav-auth-tier" id="sidebarUserTier">Free</span>
                        </div>
                        <i class="fas fa-chevron-down nav-auth-menu-caret" aria-hidden="true"></i>
                    </button>
                    <div class="nav-auth-menu" id="sidebarAuthMenu" role="menu" aria-hidden="true" hidden>
                        <button type="button" class="nav-auth-menu-item" id="sidebarAccountBtn" role="menuitem"><i class="fas fa-user-circle" aria-hidden="true"></i><span data-caissa-i18n="shell.account">${i18n.t('shell.account', 'Account')}</span></button>
                        <button type="button" class="nav-auth-menu-item nav-auth-menu-signout" id="sidebarSignOutBtn" role="menuitem"><i class="fas fa-sign-out-alt" aria-hidden="true"></i><span data-caissa-i18n="shell.signOut">${i18n.t('shell.signOut', 'Sign Out')}</span></button>
                    </div>
                </div>
                <div class="nav-premium-cta">
                    <a href="/premium" class="nav-premium-btn" data-caissa-i18n-aria-label="shell.upgradePremium" aria-label="${i18n.t('shell.upgradePremium', 'Upgrade to Premium')}">
                        <i class="fas fa-crown" aria-hidden="true"></i>
                        <span class="nav-label" data-caissa-i18n="shell.premium">${i18n.t('shell.premium', 'Premium')}</span>
                        <span class="nav-premium-badge" data-caissa-i18n="shell.upgrade">${i18n.t('shell.upgrade', 'Upgrade')}</span>
                    </a>
                </div>
                <div class="nav-items">${items}${adapter.renderConnect(renderOptions)}</div>
                <section class="nav-footer" aria-labelledby="caissa-nav-support-heading">
                    <h2 class="nav-group-heading nav-label" id="caissa-nav-support-heading" data-caissa-i18n="nav.support">${i18n.t('nav.support', 'Support')}</h2>
                    <div role="list">${adapter.renderSupport(renderOptions)}${navigation.renderLanguageControl()}</div>
                </section>
            </nav>
            <div class="caissa-standalone-backdrop" aria-hidden="true"></div>`;
        host.setAttribute('data-caissa-navigation-order-ready', navigation.contractId);
        i18n.apply(host);

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
            const labelKey = collapsed ? 'shell.expandNavigation' : 'shell.collapseNavigation';
            collapseButton.dataset.caissaI18nAriaLabel = labelKey;
            collapseButton.setAttribute('aria-label', i18n.t(labelKey, collapsed ? 'Expand navigation' : 'Collapse navigation'));
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
    if (!ownsAuthRuntime && !document.querySelector('script[data-caissa-standalone-auth-runtime]')) {
        const authRuntime = document.createElement('script');
        authRuntime.src = '/js/caissa-standalone-auth-runtime.js?v=1.0.0';
        authRuntime.dataset.caissaStandaloneAuthRuntime = 'true';
        document.head.appendChild(authRuntime);
    }
})();
