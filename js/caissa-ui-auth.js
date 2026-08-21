/**
 * CAISSA UI Auth Module
 *
 * Handles auth-related UI components in the header/navigation.
 * Renders sign-in/sign-out buttons, user avatar, and account dropdown.
 */

(function() {
    'use strict';

    const CaissaUIAuth = {
        // DOM element references
        elements: {
            container: null,
            dropdown: null
        },

        // State
        isDropdownOpen: false,

        /**
         * Initialize the auth UI
         */
        init: function() {
            // Find or create auth container
            this._findOrCreateContainer();
            this._bindSidebarSignInGuard();

            // Listen for auth state changes
            window.addEventListener('caissa-auth-change', (e) => {
                this.render(e.detail);
            });

            // Listen for feature locked events
            window.addEventListener('caissa-feature-locked', (e) => {
                this.showLockedModal(e.detail);
            });

            // Listen for credit changes to update badge live
            window.addEventListener('caissa-credits-changed', (e) => {
                this._updateCreditBadge(e.detail);
            });

            // Close dropdown when clicking outside
            document.addEventListener('click', (e) => {
                if (this.isDropdownOpen && !e.target.closest('.caissa-auth-container')) {
                    this.closeDropdown();
                }
                if (!e.target.closest('#sidebarAuthArea')) {
                    this.closeSidebarMenu();
                }
            });

            // Initial render if auth is already loaded
            if (window.CAISSA_AUTH && window.CAISSA_AUTH.isLoaded) {
                this.render(window.CAISSA_AUTH);
            } else {
                this.render({ isLoaded: false, isSignedIn: false });
            }
        },

        /**
         * Find existing auth container or create one in header
         */
        _findOrCreateContainer: function() {
            // Check for existing container
            let container = document.querySelector('.caissa-auth-container');

            if (!container) {
                // Find header nav area to insert auth controls
                const headerControls = document.querySelector('.header-controls');
                const libraryNavLinks = document.querySelector('.library-nav-links');
                const premiumNavLinks = document.querySelector('.premium-nav-links');

                const targetNav = headerControls || libraryNavLinks || premiumNavLinks;

                if (targetNav) {
                    container = document.createElement('div');
                    container.className = 'caissa-auth-container';
                    targetNav.appendChild(container);
                }
            }

            this.elements.container = container;
        },

        /**
         * Render auth UI based on current state
         */
        render: function(authState) {
            const container = this.elements.container;

            if (authState?.isLoaded !== true) {
                if (container) this._renderPending();
                this._updateSidebarAuth({ isLoaded: false, isSignedIn: false });
                return;
            }

            if (container) {
                if (authState.isSignedIn) {
                    this._renderSignedIn(authState);
                } else {
                    this._renderSignedOut();
                }
            }

            // Also update sidebar auth area
            this._updateSidebarAuth(authState);
        },

        /**
         * Update sidebar auth area
         */
        _updateSidebarAuth: function(authState) {
            const signInBtn = document.getElementById('sidebarSignIn');
            const createAccountBtn = this._ensureCreateAccountAction(signInBtn);
            const userInfo = document.getElementById('sidebarUserInfo');
            const userName = document.getElementById('sidebarUserName');
            const userTier = document.getElementById('sidebarUserTier');
            const userAvatar = document.getElementById('sidebarUserAvatar');
            const sidebarMenu = document.getElementById('sidebarAuthMenu');
            const accountBtn = document.getElementById('sidebarAccountBtn');
            const signOutBtn = document.getElementById('sidebarSignOutBtn');

            if (!signInBtn || !userInfo) return;

            if (authState?.isLoaded !== true) {
                signInBtn.style.display = 'none';
                if (createAccountBtn) createAccountBtn.style.display = 'none';
                userInfo.style.display = 'none';
                userInfo.hidden = true;
                this.closeSidebarMenu();
                if (sidebarMenu) {
                    sidebarMenu.hidden = true;
                    sidebarMenu.setAttribute('aria-hidden', 'true');
                }
                return;
            }

            if (authState.isSignedIn) {
                // Hide sign in button, show user info
                signInBtn.style.display = 'none';
                if (createAccountBtn) createAccountBtn.style.display = 'none';
                userInfo.style.display = 'flex';
                userInfo.hidden = false;
                userInfo.setAttribute('aria-expanded', 'false');

                // Update user details
                if (userName) {
                    userName.textContent = authState.fullName || authState.email?.split('@')[0] || 'User';
                }

                const membership = this._getMembershipPresentation(authState);

                if (userTier) {
                    userTier.textContent = membership.label;
                    userTier.classList.toggle('premium', membership.isPaid);
                }

                // Update avatar
                if (userAvatar) {
                    if (authState.imageUrl) {
                        userAvatar.innerHTML = `<img src="${this._escapeHtml(authState.imageUrl)}" alt="Avatar" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;">`;
                    } else {
                        const initials = this._getInitials(authState.fullName || authState.email || 'U');
                        userAvatar.innerHTML = `<span class="nav-auth-initials">${initials}</span>`;
                    }
                }

                userInfo.onclick = (event) => {
                    event.stopPropagation();
                    this.toggleSidebarMenu();
                };

                if (accountBtn && !accountBtn.dataset.bound) {
                    accountBtn.dataset.bound = 'true';
                    accountBtn.addEventListener('click', (event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        this.closeSidebarMenu();
                        this.toggleDropdown();
                    });
                }

                if (signOutBtn && !signOutBtn.dataset.bound) {
                    signOutBtn.dataset.bound = 'true';
                    signOutBtn.addEventListener('click', async (event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        this.closeSidebarMenu();
                        await this.handleSignOut();
                    });
                }
            } else {
                // Show sign in button, hide user info
                signInBtn.style.display = 'flex';
                if (createAccountBtn) createAccountBtn.style.display = 'flex';
                userInfo.style.display = 'none';
                userInfo.hidden = true;
                this.closeSidebarMenu();
                if (sidebarMenu) {
                    sidebarMenu.hidden = true;
                    sidebarMenu.setAttribute('aria-hidden', 'true');
                }
            }
        },

        _ensureCreateAccountAction: function(signInBtn) {
            if (!signInBtn) return null;
            let action = document.getElementById('sidebarCreateAccount');
            if (action) return action;
            action = document.createElement('a');
            action.id = 'sidebarCreateAccount';
            action.href = '/signup';
            action.className = 'nav-auth-btn nav-auth-signup';
            action.setAttribute('aria-label', 'Create Account');
            action.innerHTML = '<i class="fas fa-user-plus" aria-hidden="true"></i><span class="nav-label">Create Account</span>';
            signInBtn.insertAdjacentElement('afterend', action);
            return action;
        },

        _getMembershipPresentation: function(authState) {
            const access = window.CAISSA_ACCESS;
            const explicitTier = access?.getMembershipTier?.() || authState?.membershipTier;
            const normalized = typeof explicitTier === 'string' ? explicitTier.trim().toLowerCase() : '';
            const labels = { free: 'Free', silver: 'Silver', gold: 'Gold', platinum: 'Platinum' };
            if (labels[normalized]) return { label: labels[normalized], isPaid: normalized !== 'free' };
            const isPremium = access?.isPremium?.() === true;
            return { label: isPremium ? 'Premium' : 'Free', isPaid: isPremium };
        },

        _bindSidebarSignInGuard: function() {
            const signInBtn = document.getElementById('sidebarSignIn');
            if (!signInBtn || signInBtn.dataset.authGuardBound) return;

            signInBtn.dataset.authGuardBound = 'true';
            signInBtn.addEventListener('click', (event) => {
                const auth = window.CAISSA_AUTH || {};
                if (auth.isLoaded !== true) {
                    event.preventDefault();
                    return;
                }

                if (auth.isSignedIn === true) {
                    event.preventDefault();
                    this.openSidebarMenu();
                }
            });
        },

        toggleSidebarMenu: function() {
            const menu = document.getElementById('sidebarAuthMenu');
            if (!menu) return;
            if (menu.hidden) {
                this.openSidebarMenu();
            } else {
                this.closeSidebarMenu();
            }
        },

        openSidebarMenu: function() {
            const menu = document.getElementById('sidebarAuthMenu');
            const userInfo = document.getElementById('sidebarUserInfo');
            if (!menu) return;
            menu.hidden = false;
            menu.classList.add('open');
            menu.setAttribute('aria-hidden', 'false');
            userInfo?.setAttribute('aria-expanded', 'true');
        },

        closeSidebarMenu: function() {
            const menu = document.getElementById('sidebarAuthMenu');
            const userInfo = document.getElementById('sidebarUserInfo');
            if (!menu) return;
            menu.classList.remove('open');
            menu.hidden = true;
            menu.setAttribute('aria-hidden', 'true');
            userInfo?.setAttribute('aria-expanded', 'false');
        },

        /**
         * Render signed-out state (Sign In button)
         */
        _renderSignedOut: function() {
            const container = this.elements.container;
            container.innerHTML = `
                <a href="/signin" class="btn btn-auth-signin" aria-label="Sign In" title="Unlock AI analysis, cloud sync, and more">
                    <i class="fas fa-sign-in-alt"></i>
                    <span class="auth-btn-text">Sign In</span>
                </a>
                <a href="/signup" class="btn btn-auth-signup" aria-label="Create Account">
                    <i class="fas fa-user-plus"></i>
                    <span class="auth-btn-text">Create Account</span>
                </a>
            `;
        },

        _renderPending: function() {
            const container = this.elements.container;
            container.innerHTML = '';
            this.closeDropdown();
        },

        /**
         * Render signed-in state (User avatar/menu)
         */
        _renderSignedIn: function(authState) {
            const container = this.elements.container;
            // Use CAISSA_ACCESS wallet if available, fall back to profile
            const hasAccess = typeof window.CAISSA_ACCESS !== 'undefined';
            const credits = hasAccess ? window.CAISSA_ACCESS.getCredits() : 0;
            const isPremium = hasAccess ? window.CAISSA_ACCESS.isPremium() : false;
            const membership = this._getMembershipPresentation(authState);

            // Create avatar image or initials
            let avatarContent;
            if (authState.imageUrl) {
                avatarContent = `<img src="${this._escapeHtml(authState.imageUrl)}" alt="Avatar" class="auth-avatar-img">`;
            } else {
                const initials = this._getInitials(authState.fullName || authState.email || 'U');
                avatarContent = `<span class="auth-avatar-initials">${initials}</span>`;
            }

            container.innerHTML = `
                <div class="caissa-auth-user">
                    <button type="button" class="auth-user-button" aria-label="Account menu" aria-expanded="false">
                        <span class="auth-avatar">${avatarContent}</span>
                        ${isPremium ? '<span class="auth-premium-badge"><i class="fas fa-crown"></i></span>' : ''}
                        <span class="auth-credits-badge" title="Insight Credits">${credits}</span>
                    </button>
                    <div class="auth-dropdown" role="menu" aria-hidden="true">
                        <div class="auth-dropdown-header">
                            <span class="auth-user-name">${this._escapeHtml(authState.fullName || 'User')}</span>
                            <span class="auth-user-email">${this._escapeHtml(authState.email || '')}</span>
                        </div>
                        <div class="auth-dropdown-stats">
                            <div class="auth-stat">
                                <span class="auth-stat-label">Credits</span>
                                <span class="auth-stat-value">${credits}</span>
                            </div>
                            <div class="auth-stat">
                                <span class="auth-stat-label">Status</span>
                                <span class="auth-stat-value ${membership.isPaid ? 'premium' : ''}">${membership.label}</span>
                            </div>
                        </div>
                        <div class="auth-dropdown-actions">
                            ${!isPremium ? '<a href="/premium" class="auth-dropdown-item upgrade"><i class="fas fa-crown"></i> Upgrade to Premium</a>' : ''}
                            <a href="/premium" class="auth-dropdown-item"><i class="fas fa-bolt"></i> Buy Credits</a>
                            <button type="button" class="auth-dropdown-item signout"><i class="fas fa-sign-out-alt"></i> Sign Out</button>
                        </div>
                    </div>
                </div>
            `;

            // Bind events
            this._bindDropdownEvents();
        },

        /**
         * Bind dropdown toggle and sign out events
         */
        _bindDropdownEvents: function() {
            const container = this.elements.container;
            if (!container) return;

            const userButton = container.querySelector('.auth-user-button');
            const signOutBtn = container.querySelector('.auth-dropdown-item.signout');
            const dropdown = container.querySelector('.auth-dropdown');

            this.elements.dropdown = dropdown;

            if (userButton) {
                userButton.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.toggleDropdown();
                });
            }

            if (signOutBtn) {
                signOutBtn.addEventListener('click', async (e) => {
                    e.preventDefault();
                    await this.handleSignOut();
                });
            }
        },

        /**
         * Toggle dropdown visibility
         */
        toggleDropdown: function() {
            if (this.isDropdownOpen) {
                this.closeDropdown();
            } else {
                this.openDropdown();
            }
        },

        /**
         * Open dropdown
         */
        openDropdown: function() {
            const dropdown = this.elements.dropdown;
            const button = this.elements.container?.querySelector('.auth-user-button');

            if (dropdown) {
                dropdown.classList.add('open');
                dropdown.setAttribute('aria-hidden', 'false');
            }
            if (button) {
                button.setAttribute('aria-expanded', 'true');
            }
            this.isDropdownOpen = true;
        },

        /**
         * Close dropdown
         */
        closeDropdown: function() {
            const dropdown = this.elements.dropdown;
            const button = this.elements.container?.querySelector('.auth-user-button');

            if (dropdown) {
                dropdown.classList.remove('open');
                dropdown.setAttribute('aria-hidden', 'true');
            }
            if (button) {
                button.setAttribute('aria-expanded', 'false');
            }
            this.isDropdownOpen = false;
        },

        /**
         * Handle sign out
         */
        handleSignOut: async function() {
            this.closeDropdown();

            if (window.CAISSA_AUTH && window.CAISSA_AUTH.signOut) {
                await window.CAISSA_AUTH.signOut();
            }
        },

        /**
         * Show locked feature modal
         */
        showLockedModal: function(detail) {
            // Remove any existing modal
            const existing = document.querySelector('.caissa-locked-modal');
            if (existing) existing.remove();

            const modal = document.createElement('div');
            modal.className = 'caissa-locked-modal';
            modal.setAttribute('role', 'dialog');
            modal.setAttribute('aria-modal', 'true');

            let actionButton = '';
            switch (detail.action) {
                case 'signin':
                    actionButton = `<a href="/signin" class="btn btn-primary locked-modal-btn">Sign In</a>`;
                    break;
                case 'upgrade':
                    actionButton = `<a href="/premium" class="btn btn-premium locked-modal-btn">Upgrade to Premium</a>`;
                    break;
                case 'buy_credits':
                    actionButton = `<a href="/premium" class="btn btn-primary locked-modal-btn">Buy Credits</a>`;
                    break;
            }

            modal.innerHTML = `
                <div class="locked-modal-backdrop"></div>
                <div class="locked-modal-content">
                    <button type="button" class="locked-modal-close" aria-label="Close">&times;</button>
                    <div class="locked-modal-icon">
                        <i class="fas fa-lock"></i>
                    </div>
                    <h3 class="locked-modal-title">Feature Locked</h3>
                    <p class="locked-modal-message">${this._escapeHtml(detail.message)}</p>
                    <div class="locked-modal-actions">
                        ${actionButton}
                        <button type="button" class="btn btn-secondary locked-modal-cancel">Cancel</button>
                    </div>
                </div>
            `;

            document.body.appendChild(modal);

            // Bind close events
            const closeBtn = modal.querySelector('.locked-modal-close');
            const cancelBtn = modal.querySelector('.locked-modal-cancel');
            const backdrop = modal.querySelector('.locked-modal-backdrop');

            const closeModal = () => modal.remove();

            closeBtn?.addEventListener('click', closeModal);
            cancelBtn?.addEventListener('click', closeModal);
            backdrop?.addEventListener('click', closeModal);

            // Close on Escape
            const handleEscape = (e) => {
                if (e.key === 'Escape') {
                    closeModal();
                    document.removeEventListener('keydown', handleEscape);
                }
            };
            document.addEventListener('keydown', handleEscape);

            // Show with animation
            requestAnimationFrame(() => {
                modal.classList.add('show');
            });
        },

        /**
         * Update the credit badge and dropdown stats without full re-render
         */
        _updateCreditBadge: function(detail) {
            const container = this.elements.container;
            if (!container) return;

            const credits = detail?.credits ?? 0;
            const isPremium = detail?.isPremium ?? false;

            // Update header badge
            const badge = container.querySelector('.auth-credits-badge');
            if (badge) {
                badge.textContent = credits;
                badge.classList.toggle('low', credits <= 2 && !isPremium);
                badge.classList.toggle('zero', credits === 0 && !isPremium);
            }

            // Update dropdown stats
            const creditStat = container.querySelector('.auth-stat-value');
            if (creditStat) creditStat.textContent = credits;

            const statusStat = container.querySelectorAll('.auth-stat-value')[1];
            if (statusStat) {
                const normalized = typeof detail?.membershipTier === 'string' ? detail.membershipTier.trim().toLowerCase() : '';
                const labels = { free: 'Free', silver: 'Silver', gold: 'Gold', platinum: 'Platinum' };
                statusStat.textContent = labels[normalized] || (isPremium ? 'Premium' : 'Free');
                statusStat.classList.toggle('premium', normalized ? normalized !== 'free' : isPremium);
            }

            const sidebarTier = document.getElementById('sidebarUserTier');
            if (sidebarTier) {
                const membership = this._getMembershipPresentation({ membershipTier: detail?.membershipTier });
                sidebarTier.textContent = membership.label;
                sidebarTier.classList.toggle('premium', membership.isPaid);
            }

            // Update premium crown badge
            const premiumBadge = container.querySelector('.auth-premium-badge');
            if (isPremium && !premiumBadge) {
                const userBtn = container.querySelector('.auth-user-button');
                if (userBtn) {
                    const crown = document.createElement('span');
                    crown.className = 'auth-premium-badge';
                    crown.innerHTML = '<i class="fas fa-crown"></i>';
                    userBtn.insertBefore(crown, userBtn.querySelector('.auth-credits-badge'));
                }
            } else if (!isPremium && premiumBadge) {
                premiumBadge.remove();
            }
        },

        /**
         * Get initials from name
         */
        _getInitials: function(name) {
            if (!name) return 'U';
            const parts = name.trim().split(/\s+/);
            if (parts.length >= 2) {
                return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
            }
            return name.substring(0, 2).toUpperCase();
        },

        /**
         * Escape HTML to prevent XSS
         */
        _escapeHtml: function(str) {
            if (!str) return '';
            const div = document.createElement('div');
            div.textContent = str;
            return div.innerHTML;
        }
    };

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => CaissaUIAuth.init());
    } else {
        CaissaUIAuth.init();
    }

    // Expose for external use
    window.CaissaUIAuth = CaissaUIAuth;

})();
