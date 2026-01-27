/**
 * CAISSA Premium & Credits Page - JavaScript
 *
 * Handles billing toggle, FAQ accordion, and copy referral code functionality.
 */

const PremiumPage = {
    // State
    billingPeriod: 'monthly', // 'monthly' or 'annual'

    // DOM elements
    elements: {},

    /**
     * Initialize the premium page
     */
    init() {
        this.cacheElements();
        this.bindEvents();
        this.updateBillingUI();
        this.renderWalletStatus();

        // Listen for auth/credit changes
        window.addEventListener('caissa-auth-change', () => this.renderWalletStatus());
        window.addEventListener('caissa-credits-changed', () => this.renderWalletStatus());

        // Check for Stripe checkout return
        this._handleCheckoutReturn();
    },

    /**
     * Cache DOM elements
     */
    cacheElements() {
        this.elements = {
            billingToggle: document.getElementById('billingToggle'),
            billingLabels: document.querySelectorAll('.billing-label'),
            priceDisplays: document.querySelectorAll('.price-display'),
            subscribeBtn: document.getElementById('subscribeBtn'),
            creditBuyBtns: document.querySelectorAll('.credit-buy-btn'),
            faqItems: document.querySelectorAll('.faq-item'),
            referralCode: document.getElementById('referralCode'),
            copyReferralBtn: document.getElementById('copyReferralBtn')
        };
    },

    /**
     * Bind event listeners
     */
    bindEvents() {
        // Billing toggle
        if (this.elements.billingToggle) {
            this.elements.billingToggle.addEventListener('click', () => this.toggleBilling());
        }

        // Subscribe button
        if (this.elements.subscribeBtn) {
            this.elements.subscribeBtn.addEventListener('click', () => this.handleSubscribe());
        }

        // Credit buy buttons
        this.elements.creditBuyBtns.forEach(btn => {
            btn.addEventListener('click', () => this.handleBuyCredits(btn.dataset.package));
        });

        // FAQ accordion
        this.elements.faqItems.forEach(item => {
            const question = item.querySelector('.faq-question');
            if (question) {
                question.addEventListener('click', () => this.toggleFaq(item));
            }
        });

        // Copy referral code
        if (this.elements.copyReferralBtn) {
            this.elements.copyReferralBtn.addEventListener('click', () => this.copyReferralCode());
        }
    },

    /**
     * Toggle billing period between monthly and annual
     */
    toggleBilling() {
        this.billingPeriod = this.billingPeriod === 'monthly' ? 'annual' : 'monthly';
        this.updateBillingUI();
    },

    /**
     * Update UI based on current billing period
     */
    updateBillingUI() {
        const { billingToggle, billingLabels, priceDisplays } = this.elements;

        // Update toggle button state
        if (billingToggle) {
            billingToggle.classList.toggle('annual', this.billingPeriod === 'annual');
        }

        // Update label active states
        billingLabels.forEach(label => {
            const labelPeriod = label.dataset.period;
            label.classList.toggle('active', labelPeriod === this.billingPeriod);
        });

        // Show/hide price displays
        priceDisplays.forEach(display => {
            const displayPeriod = display.dataset.period;
            display.style.display = displayPeriod === this.billingPeriod ? 'flex' : 'none';
        });
    },

    /**
     * Handle subscribe button click — creates Stripe Checkout Session
     */
    async handleSubscribe() {
        const plan = this.billingPeriod;

        if (!window.CAISSA_ACCESS?.isSignedIn()) {
            this.showNotification('Please sign in to subscribe.', 'error');
            window.CAISSA_AUTH?.redirectToSignIn?.('/premium');
            return;
        }

        const btn = this.elements.subscribeBtn;
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Redirecting...';
        }

        try {
            const token = await window.CAISSA_AUTH?.getToken?.();
            if (!token) throw new Error('Authentication failed');

            const resp = await fetch('/api/checkout/session', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + token
                },
                body: JSON.stringify({ type: 'subscription', plan })
            });

            const data = await resp.json();

            if (!resp.ok) {
                throw new Error(data.error || 'Failed to create checkout session');
            }

            // Redirect to Stripe Checkout
            window.location.href = data.url;

        } catch (err) {
            console.error('Subscribe error:', err);
            const userMsg = err.message?.includes('Authentication')
                ? 'Your session has expired. Please sign in again.'
                : 'Payment system is temporarily unavailable. Please try again.';
            this.showNotification(userMsg, 'error');
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-unlock"></i> Subscribe Now';
            }
        }
    },

    /**
     * Handle credit package purchase — creates Stripe Checkout Session
     */
    async handleBuyCredits(packageName) {
        if (!window.CAISSA_ACCESS?.isSignedIn()) {
            this.showNotification('Please sign in to purchase credits.', 'error');
            window.CAISSA_AUTH?.redirectToSignIn?.('/premium');
            return;
        }

        // Find and disable the clicked button
        const btn = document.querySelector(`.credit-buy-btn[data-package="${packageName}"]`);
        if (btn) {
            btn.disabled = true;
            btn.textContent = 'Redirecting...';
        }

        try {
            const token = await window.CAISSA_AUTH?.getToken?.();
            if (!token) throw new Error('Authentication failed');

            const resp = await fetch('/api/checkout/session', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + token
                },
                body: JSON.stringify({ type: 'credits', package: packageName })
            });

            const data = await resp.json();

            if (!resp.ok) {
                throw new Error(data.error || 'Failed to create checkout session');
            }

            // Redirect to Stripe Checkout
            window.location.href = data.url;

        } catch (err) {
            console.error('Buy credits error:', err);
            const userMsg = err.message?.includes('Authentication')
                ? 'Your session has expired. Please sign in again.'
                : 'Payment system is temporarily unavailable. Please try again.';
            this.showNotification(userMsg, 'error');
            if (btn) {
                btn.disabled = false;
                btn.textContent = 'Buy Now';
            }
        }
    },

    /**
     * Toggle FAQ accordion item
     */
    toggleFaq(item) {
        const isOpen = item.classList.contains('open');

        // Close all other items
        this.elements.faqItems.forEach(otherItem => {
            if (otherItem !== item) {
                otherItem.classList.remove('open');
                const btn = otherItem.querySelector('.faq-question');
                if (btn) btn.setAttribute('aria-expanded', 'false');
            }
        });

        // Toggle current item
        item.classList.toggle('open', !isOpen);
        const btn = item.querySelector('.faq-question');
        if (btn) btn.setAttribute('aria-expanded', !isOpen ? 'true' : 'false');
    },

    /**
     * Copy referral code to clipboard
     */
    async copyReferralCode() {
        const { referralCode, copyReferralBtn } = this.elements;
        if (!referralCode) return;

        try {
            await navigator.clipboard.writeText(referralCode.value);

            // Visual feedback
            const originalIcon = copyReferralBtn.innerHTML;
            copyReferralBtn.innerHTML = '<i class="fas fa-check"></i>';
            copyReferralBtn.style.background = 'var(--prem-success)';
            copyReferralBtn.style.borderColor = 'var(--prem-success)';
            copyReferralBtn.style.color = 'white';

            this.showNotification('Referral link copied!');

            setTimeout(() => {
                copyReferralBtn.innerHTML = originalIcon;
                copyReferralBtn.style.background = '';
                copyReferralBtn.style.borderColor = '';
                copyReferralBtn.style.color = '';
            }, 2000);

        } catch (err) {
            console.error('Failed to copy referral code:', err);
            this.showNotification('Failed to copy. Please select and copy manually.', 'error');
        }
    },

    /**
     * Render wallet status banner on the premium page
     */
    renderWalletStatus() {
        const banner = document.getElementById('walletStatusBanner');
        if (!banner) return;

        const hasAccess = typeof window.CAISSA_ACCESS !== 'undefined';
        const isSignedIn = hasAccess && window.CAISSA_ACCESS.isSignedIn();

        if (!isSignedIn) {
            banner.classList.remove('hidden');
            banner.innerHTML = `
                <div class="wallet-banner-content wallet-signed-out">
                    <i class="fas fa-user-lock"></i>
                    <div class="wallet-banner-text">
                        <strong>Sign in to manage your account</strong>
                        <span>View your credits, subscription status, and purchase history</span>
                    </div>
                    <a href="/signin?redirect_url=/premium" class="btn btn-primary wallet-signin-btn">Sign In</a>
                </div>
            `;
            return;
        }

        const credits = window.CAISSA_ACCESS.getCredits();
        const isPremium = window.CAISSA_ACCESS.isPremium();
        const role = window.CAISSA_ACCESS.getRole();
        const auth = window.CAISSA_AUTH || {};

        banner.classList.remove('hidden');
        banner.innerHTML = `
            <div class="wallet-banner-content wallet-signed-in">
                <div class="wallet-info-group">
                    <div class="wallet-user">
                        <i class="fas fa-user-circle"></i>
                        <span>${this._escapeHtml(auth.fullName || auth.email || 'User')}</span>
                    </div>
                    <div class="wallet-stats">
                        <div class="wallet-stat">
                            <span class="wallet-stat-label">Credits</span>
                            <span class="wallet-stat-value ${credits <= 2 ? 'low' : ''}">${credits}</span>
                        </div>
                        <div class="wallet-stat">
                            <span class="wallet-stat-label">Plan</span>
                            <span class="wallet-stat-value ${isPremium ? 'premium' : ''}">${isPremium ? 'Core' : 'Free'}</span>
                        </div>
                        <div class="wallet-stat">
                            <span class="wallet-stat-label">Role</span>
                            <span class="wallet-stat-value">${role}</span>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Update subscribe button text if already premium
        const subscribeBtn = document.getElementById('subscribeBtn');
        if (subscribeBtn) {
            if (isPremium) {
                subscribeBtn.innerHTML = '<i class="fas fa-check-circle"></i> Currently Subscribed';
                subscribeBtn.disabled = true;
                subscribeBtn.classList.add('subscribed');
            } else {
                subscribeBtn.innerHTML = '<i class="fas fa-unlock"></i> Subscribe Now';
                subscribeBtn.disabled = false;
                subscribeBtn.classList.remove('subscribed');
            }
        }
    },

    /**
     * Handle return from Stripe Checkout — show success and refresh wallet
     */
    _handleCheckoutReturn() {
        const params = new URLSearchParams(window.location.search);
        const sessionId = params.get('session_id');
        if (!sessionId) return;

        // Clean URL (remove session_id param)
        const cleanUrl = window.location.pathname;
        window.history.replaceState({}, '', cleanUrl);

        // Show success notification
        this.showNotification('Payment successful! Your account has been updated.');

        // Refresh wallet from backend after a short delay (allow webhook to process)
        setTimeout(() => {
            if (window.CAISSA_ACCESS?.refreshWallet) {
                window.CAISSA_ACCESS.refreshWallet();
            }
        }, 1500);
    },

    /**
     * Escape HTML to prevent XSS
     */
    _escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    },

    /**
     * Show a notification toast — delegates to CaissaNotify if available
     */
    showNotification(message, type = 'success') {
        if (window.CaissaNotify) {
            if (type === 'error') {
                window.CaissaNotify.error(message);
            } else {
                window.CaissaNotify.success(message);
            }
            return;
        }

        // Fallback: inline toast (for pages without CaissaNotify loaded)
        const existing = document.querySelector('.premium-notification');
        if (existing) existing.remove();

        const notification = document.createElement('div');
        notification.className = `premium-notification ${type}`;
        notification.innerHTML = `
            <i class="fas fa-${type === 'success' ? 'check-circle' : 'exclamation-circle'}"></i>
            <span>${message}</span>
        `;

        document.body.appendChild(notification);

        setTimeout(() => {
            notification.style.opacity = '0';
            notification.style.transform = 'translateX(-50%) translateY(20px)';
            notification.style.transition = 'opacity 0.3s, transform 0.3s';
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }
};

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    PremiumPage.init();
});
