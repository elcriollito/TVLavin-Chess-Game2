/**
 * CAISSA Access Control & Credit Wallet Module
 *
 * Manages per-user wallet, feature gating, and credit consumption.
 * API-first: syncs with backend on auth change, consumes via API.
 * Fallback: localStorage cache when backend is unavailable.
 * Exposes window.CAISSA_ACCESS for global access control.
 */

(function() {
    'use strict';

    // ========================================
    // FEATURE DEFINITIONS
    // ========================================

    const FEATURE_RULES = {
        // Credit-based features (require signed-in; premium users skip cost)
        'mentor_chat':      { type: 'credits', cost: 1, label: 'Mentor Chat' },
        'insight':          { type: 'credits', cost: 2, label: 'CAISSA Insight' },
        'batch_analysis':   { type: 'credits', cost: 1, label: 'Batch Analysis' },
        'game_review':      { type: 'credits', cost: 2, label: 'Full Game Review' },

        // Premium-only features (require isPremium)
        'deep_analysis':    { type: 'premium', label: 'Deep Analysis (40+)' },
        'advanced_search':  { type: 'premium', label: 'Advanced Search' },
        'cloud_sync':       { type: 'premium', label: 'Cloud Sync' },

        // Free features (require signed-in)
        'basic_analysis':   { type: 'free', label: 'Basic Analysis' },
        'position_library': { type: 'free', label: 'Position Library' },
        'game_import':      { type: 'free', label: 'Game Import' },

        // Guest features (no auth required)
        'play_engine':      { type: 'guest', label: 'Play vs Engine' },
        'view_library':     { type: 'guest', label: 'View Library' }
    };

    // Wallet localStorage prefix
    const WALLET_PREFIX = 'caissa_wallet_';

    // Track if backend is available
    let _backendAvailable = true;

    // ========================================
    // BACKEND API HELPERS
    // ========================================

    /**
     * Get auth headers for API calls (Bearer token from Clerk)
     */
    async function _getAuthHeaders() {
        const token = await window.CAISSA_AUTH?.getToken?.();
        if (!token) return null;
        return {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token
        };
    }

    /**
     * Sync user to backend on sign-in (POST /api/user/sync)
     */
    async function _syncUser() {
        const auth = window.CAISSA_AUTH || {};
        if (!auth.isSignedIn) return;

        const headers = await _getAuthHeaders();
        if (!headers) return;

        try {
            const resp = await fetch('/api/user/sync', {
                method: 'POST',
                headers: headers,
                body: JSON.stringify({
                    email: auth.email,
                    fullName: auth.fullName
                })
            });

            if (resp.ok) {
                _backendAvailable = true;
                console.log('CAISSA Access: User synced to backend');
            } else {
                console.warn('CAISSA Access: User sync failed', resp.status);
            }
        } catch (e) {
            _backendAvailable = false;
            console.warn('CAISSA Access: Backend unreachable for user sync', e.message);
        }
    }

    /**
     * Fetch wallet from backend and update local cache (GET /api/wallet)
     */
    async function _fetchWallet() {
        const auth = window.CAISSA_AUTH || {};
        if (!auth.isSignedIn || !auth.userId) return;

        const headers = await _getAuthHeaders();
        if (!headers) return;

        try {
            const resp = await fetch('/api/wallet', {
                method: 'GET',
                headers: headers
            });

            if (resp.ok) {
                const data = await resp.json();
                _backendAvailable = true;

                // Update local cache
                const wallet = {
                    credits: data.credits ?? 0,
                    isPremium: data.isPremium ?? false,
                    role: data.role ?? 'member',
                    updatedAt: Date.now()
                };
                _saveWallet(auth.userId, wallet);
                _syncToProfile(auth.userId, wallet);

                // Dispatch event so UI updates
                window.dispatchEvent(new CustomEvent('caissa-credits-changed', {
                    detail: { credits: wallet.credits, isPremium: wallet.isPremium, role: wallet.role }
                }));

                console.log('CAISSA Access: Wallet hydrated from backend', wallet.credits, 'credits');
            } else {
                console.warn('CAISSA Access: Wallet fetch failed', resp.status);
            }
        } catch (e) {
            _backendAvailable = false;
            console.warn('CAISSA Access: Backend unreachable for wallet fetch', e.message);
            if (window.CaissaNotify) {
                window.CaissaNotify.warn('Connection issue. Your changes are saved locally.');
            }
        }
    }

    /**
     * Consume credits via backend API (POST /api/credits/consume)
     * Fire-and-forget — local cache already deducted by caller.
     */
    async function _consumeViaApi(featureName, localNewBalance) {
        const headers = await _getAuthHeaders();
        if (!headers) return;

        try {
            const resp = await fetch('/api/credits/consume', {
                method: 'POST',
                headers: headers,
                body: JSON.stringify({ feature: featureName })
            });

            if (resp.ok) {
                const data = await resp.json();
                _backendAvailable = true;

                // Reconcile: backend is source of truth
                const auth = window.CAISSA_AUTH || {};
                if (auth.userId && data.credits !== undefined) {
                    const wallet = getWallet();
                    if (wallet && wallet.credits !== data.credits) {
                        _updateWalletSilent({ credits: data.credits });
                    }
                }
            } else if (resp.status === 402) {
                // Backend says insufficient — reconcile local
                const data = await resp.json();
                _updateWalletSilent({ credits: data.credits ?? 0 });
                console.warn('CAISSA Access: Backend rejected consume — insufficient credits');
            }
        } catch (e) {
            _backendAvailable = false;
            console.warn('CAISSA Access: Backend unreachable for consume', e.message);
        }
    }

    // ========================================
    // WALLET MANAGEMENT (localStorage cache)
    // ========================================

    /**
     * Get wallet for current user (synchronous — reads local cache)
     * @returns {Object|null} { credits, isPremium, role, updatedAt }
     */
    function getWallet() {
        const auth = window.CAISSA_AUTH || {};
        if (!auth.isSignedIn || !auth.userId) return null;

        const key = WALLET_PREFIX + auth.userId;
        try {
            const stored = localStorage.getItem(key);
            if (stored) {
                return JSON.parse(stored);
            }
        } catch (e) {
            console.error('CAISSA Access: Failed to read wallet', e);
        }

        // Initialize wallet if missing (migrate from profile if available)
        return _initWallet(auth.userId);
    }

    /**
     * Initialize wallet for a user, migrating from existing profile if available
     */
    function _initWallet(userId) {
        const wallet = {
            credits: 0,
            isPremium: false,
            role: 'member',
            updatedAt: Date.now()
        };

        // Attempt migration from caissa_user_profile
        try {
            const profileStore = localStorage.getItem('caissa_user_profile');
            if (profileStore) {
                const profiles = JSON.parse(profileStore);
                const profile = profiles[userId];
                if (profile) {
                    wallet.credits = profile.credits || 0;
                    wallet.isPremium = profile.isPremium || false;
                    wallet.role = profile.role || 'member';
                }
            }
        } catch (e) {
            // Ignore migration errors
        }

        _saveWallet(userId, wallet);
        return wallet;
    }

    /**
     * Save wallet to localStorage
     */
    function _saveWallet(userId, wallet) {
        const key = WALLET_PREFIX + userId;
        wallet.updatedAt = Date.now();
        try {
            localStorage.setItem(key, JSON.stringify(wallet));
        } catch (e) {
            console.error('CAISSA Access: Failed to save wallet', e);
        }
    }

    /**
     * Update wallet fields, persist, sync to profile, and dispatch event
     */
    function _updateWallet(updates) {
        const auth = window.CAISSA_AUTH || {};
        if (!auth.isSignedIn || !auth.userId) return null;

        const wallet = getWallet();
        if (!wallet) return null;

        Object.assign(wallet, updates);
        _saveWallet(auth.userId, wallet);

        // Also sync credits to caissa_user_profile for compatibility
        _syncToProfile(auth.userId, wallet);

        // Dispatch credit change event
        window.dispatchEvent(new CustomEvent('caissa-credits-changed', {
            detail: { credits: wallet.credits, isPremium: wallet.isPremium, role: wallet.role }
        }));

        return wallet;
    }

    /**
     * Update wallet locally without dispatching events (for backend reconciliation)
     */
    function _updateWalletSilent(updates) {
        const auth = window.CAISSA_AUTH || {};
        if (!auth.isSignedIn || !auth.userId) return;

        const wallet = getWallet();
        if (!wallet) return;

        Object.assign(wallet, updates);
        _saveWallet(auth.userId, wallet);
        _syncToProfile(auth.userId, wallet);
    }

    /**
     * Keep caissa_user_profile in sync
     */
    function _syncToProfile(userId, wallet) {
        try {
            const profileStore = localStorage.getItem('caissa_user_profile');
            if (profileStore) {
                const profiles = JSON.parse(profileStore);
                if (profiles[userId]) {
                    profiles[userId].credits = wallet.credits;
                    profiles[userId].isPremium = wallet.isPremium;
                    profiles[userId].role = wallet.role;
                    localStorage.setItem('caissa_user_profile', JSON.stringify(profiles));
                }
            }
        } catch (e) {
            // Non-critical
        }
    }

    // ========================================
    // ACCESS CONTROL API
    // ========================================

    window.CAISSA_ACCESS = {

        // --- Wallet helpers ---

        getWallet: getWallet,

        isSignedIn: function() {
            return (window.CAISSA_AUTH || {}).isSignedIn === true;
        },

        isPremium: function() {
            const wallet = getWallet();
            return wallet?.isPremium === true;
        },

        getCredits: function() {
            const wallet = getWallet();
            return wallet?.credits || 0;
        },

        getRole: function() {
            const wallet = getWallet();
            return wallet?.role || 'member';
        },

        /**
         * Manually set credits (for testing or admin use)
         */
        setCredits: function(amount) {
            return _updateWallet({ credits: Math.max(0, amount) });
        },

        /**
         * Manually set premium status (for testing or admin use)
         */
        setPremium: function(value) {
            return _updateWallet({ isPremium: !!value });
        },

        /**
         * Force refresh wallet from backend
         */
        refreshWallet: function() {
            return _fetchWallet();
        },

        /**
         * Check if backend is reachable
         */
        isBackendAvailable: function() {
            return _backendAvailable;
        },

        // --- Feature gating ---

        /**
         * Check if current user can use a feature (does NOT consume credits)
         */
        canUse: function(featureName) {
            const rule = FEATURE_RULES[featureName];
            if (!rule) { console.warn('CAISSA Access: Unknown feature', featureName); return false; }

            const auth = window.CAISSA_AUTH || {};
            const wallet = getWallet();

            switch (rule.type) {
                case 'guest':
                    return true;
                case 'free':
                    return auth.isSignedIn === true;
                case 'premium':
                    return auth.isSignedIn === true && wallet?.isPremium === true;
                case 'credits':
                    if (!auth.isSignedIn) return false;
                    if (wallet?.isPremium) return true; // Premium = unlimited
                    return (wallet?.credits || 0) >= (rule.cost || 1);
                default:
                    return false;
            }
        },

        /**
         * If user is NOT signed in, show sign-in modal and return false.
         * Otherwise return true.
         */
        requireSignIn: function(featureName) {
            const auth = window.CAISSA_AUTH || {};
            if (auth.isSignedIn) return true;

            const rule = FEATURE_RULES[featureName] || {};
            window.dispatchEvent(new CustomEvent('caissa-feature-locked', {
                detail: {
                    feature: featureName,
                    locked: true,
                    reason: 'Sign in required',
                    action: 'signin',
                    message: (rule.label || featureName) + ' requires you to sign in.'
                }
            }));
            return false;
        },

        /**
         * Consume credits for a feature.
         * Synchronous: deducts from local cache immediately for responsive UX.
         * Async: fires background API call to sync with backend.
         * Returns true if consumed successfully (or premium user).
         * Returns false if insufficient credits.
         */
        consumeCredits: function(featureName) {
            const rule = FEATURE_RULES[featureName];
            if (!rule || rule.type !== 'credits') return true; // not a credit feature

            const auth = window.CAISSA_AUTH || {};
            if (!auth.isSignedIn || !auth.userId) return false;

            const wallet = getWallet();
            if (!wallet) return false;

            // Premium = unlimited
            if (wallet.isPremium) {
                // Still notify backend for logging
                _consumeViaApi(featureName, wallet.credits);
                return true;
            }

            const cost = rule.cost || 1;
            if (wallet.credits < cost) return false;

            // Deduct locally (optimistic)
            const newBalance = wallet.credits - cost;
            _updateWallet({ credits: newBalance });
            console.log(`CAISSA Access: Consumed ${cost} credit(s) for ${featureName}. Remaining: ${newBalance}`);

            // Sync to backend (fire-and-forget)
            _consumeViaApi(featureName, newBalance);

            return true;
        },

        /**
         * Get detailed access status for a feature
         */
        getAccessStatus: function(featureName) {
            const rule = FEATURE_RULES[featureName];
            if (!rule) return { locked: true, reason: 'Unknown feature', action: null, message: 'Unknown feature.' };

            if (this.canUse(featureName)) return { locked: false, reason: null, action: null, message: null };

            const auth = window.CAISSA_AUTH || {};
            const wallet = getWallet();

            if (!auth.isSignedIn) {
                return {
                    locked: true, reason: 'Sign in required', action: 'signin',
                    message: (rule.label || featureName) + ' requires you to sign in.'
                };
            }

            if (rule.type === 'premium') {
                return {
                    locked: true, reason: 'Premium required', action: 'upgrade',
                    message: rule.label + ' requires a CAISSA Core subscription.'
                };
            }

            if (rule.type === 'credits') {
                const cost = rule.cost || 1;
                const have = wallet?.credits || 0;
                return {
                    locked: true,
                    reason: `Insufficient credits (need ${cost}, have ${have})`,
                    action: 'buy_credits',
                    message: `${rule.label} requires ${cost} credit${cost > 1 ? 's' : ''}. You have ${have}.`
                };
            }

            return { locked: true, reason: 'Access denied', action: null, message: 'Access denied.' };
        },

        /**
         * Show locked feature modal via custom event
         */
        showLockedMessage: function(featureName, reason) {
            const status = this.getAccessStatus(featureName);
            if (!status.locked) return;

            // Allow optional reason override
            if (reason === 'credits') {
                status.action = 'buy_credits';
            } else if (reason === 'signin') {
                status.action = 'signin';
            }

            window.dispatchEvent(new CustomEvent('caissa-feature-locked', {
                detail: { feature: featureName, ...status }
            }));
        },

        /**
         * Wrap a function to check access + consume credits before executing
         */
        guard: function(featureName, fn) {
            const self = this;
            return function(...args) {
                if (!self.requireSignIn(featureName)) return;

                if (!self.canUse(featureName)) {
                    self.showLockedMessage(featureName);
                    return;
                }

                // For credit features, consume before executing
                const rule = FEATURE_RULES[featureName];
                if (rule?.type === 'credits') {
                    if (!self.consumeCredits(featureName)) {
                        self.showLockedMessage(featureName, 'credits');
                        return;
                    }
                }

                return fn.apply(this, args);
            };
        },

        /**
         * Get feature definitions (for display purposes)
         */
        getFeatures: function() {
            return { ...FEATURE_RULES };
        },

        /**
         * Get cost for a specific feature
         */
        getCost: function(featureName) {
            const rule = FEATURE_RULES[featureName];
            return rule?.cost || 0;
        }
    };

    // ========================================
    // AUTH CHANGE LISTENER — Sync with backend
    // ========================================

    window.addEventListener('caissa-auth-change', async function(e) {
        if (e.detail && e.detail.isSignedIn && e.detail.userId) {
            // Ensure local wallet exists
            getWallet();

            // Sync user and hydrate wallet from backend
            await _syncUser();
            await _fetchWallet();
        }
    });

})();
