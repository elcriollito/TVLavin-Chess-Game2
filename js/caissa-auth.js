/**
 * CAISSA Auth Module
 *
 * Handles Clerk initialization, session management, and profile bootstrapping.
 * Exposes window.CAISSA_AUTH for global auth state access.
 */

(function() {
    'use strict';

    // Global auth state object
    window.CAISSA_AUTH = {
        isSignedIn: false,
        isLoaded: false,
        userId: null,
        email: null,
        fullName: null,
        imageUrl: null,
        clerk: null
    };

    // Private state
    let _clerkInstance = null;
    let _sessionListeners = [];
    let _clerkLoadPromise = null;

    function _getConfiguredPublishableKey() {
        const key = String(window.CAISSA_AUTH_CONFIG?.CLERK_PUBLISHABLE_KEY || '').trim();
        if (!key || key.includes('REPLACE')) return '';
        return key;
    }

    function _loadClerkSdk(publishableKey) {
        if (typeof window.Clerk !== 'undefined') return Promise.resolve(window.Clerk);
        if (_clerkLoadPromise) return _clerkLoadPromise;

        _clerkLoadPromise = new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.async = true;
            script.crossOrigin = 'anonymous';
            script.src = 'https://cdn.jsdelivr.net/npm/@clerk/clerk-js@latest/dist/clerk.browser.js';
            script.dataset.clerkPublishableKey = publishableKey;
            script.onload = () => resolve(window.Clerk);
            script.onerror = () => reject(new Error('Clerk SDK failed to load'));
            document.head.appendChild(script);
        });

        return _clerkLoadPromise;
    }

    /**
     * Initialize Clerk and set up session watching
     */
    async function initializeAuth() {
        const config = window.CAISSA_AUTH_CONFIG;
        const publishableKey = _getConfiguredPublishableKey();

        // Check for valid config
        if (!config || !publishableKey) {
            console.warn('[Auth] Clerk disabled: missing publishableKey');
            window.CAISSA_AUTH.isLoaded = true;
            _notifyListeners();
            return;
        }

        try {
            await _loadClerkSdk(publishableKey);

            // Initialize Clerk
            _clerkInstance = window.Clerk;
            await _clerkInstance.load({
                publishableKey
            });

            window.CAISSA_AUTH.clerk = _clerkInstance;

            // Set up session listener
            _clerkInstance.addListener((event) => {
                _handleSessionChange();
            });

            // Initial session check
            _handleSessionChange();

            window.CAISSA_AUTH.isLoaded = true;
            console.log('CAISSA Auth: Initialized successfully');

        } catch (error) {
            console.warn('CAISSA Auth: Initialization failed - running without authentication', error);
            window.CAISSA_AUTH.isLoaded = true;
        }

        _notifyListeners();
    }

    /**
     * Handle session state changes
     */
    function _handleSessionChange() {
        const clerk = _clerkInstance;
        if (!clerk) return;

        const user = clerk.user;
        const session = clerk.session;

        if (user && session) {
            // User is signed in
            window.CAISSA_AUTH.isSignedIn = true;
            window.CAISSA_AUTH.userId = user.id;
            window.CAISSA_AUTH.email = user.primaryEmailAddress?.emailAddress || null;
            window.CAISSA_AUTH.fullName = user.fullName || user.firstName || 'User';
            window.CAISSA_AUTH.imageUrl = user.imageUrl || null;

            // Bootstrap local profile
            _bootstrapUserProfile(user);
        } else {
            // User is signed out
            window.CAISSA_AUTH.isSignedIn = false;
            window.CAISSA_AUTH.userId = null;
            window.CAISSA_AUTH.email = null;
            window.CAISSA_AUTH.fullName = null;
            window.CAISSA_AUTH.imageUrl = null;

            // Clear active session state but keep profile
            _clearSessionState();
        }

        _notifyListeners();
    }

    /**
     * Bootstrap user profile in localStorage
     * Creates profile if doesn't exist, preserves existing data
     */
    function _bootstrapUserProfile(user) {
        const config = window.CAISSA_AUTH_CONFIG;
        const storageKey = config.STORAGE_KEYS.USER_PROFILE;

        try {
            let profile = null;
            const stored = localStorage.getItem(storageKey);

            if (stored) {
                const allProfiles = JSON.parse(stored);
                // Check if profile exists for this user
                if (allProfiles[user.id]) {
                    profile = allProfiles[user.id];
                    // Update last login
                    profile.lastLoginAt = Date.now();
                    profile.email = user.primaryEmailAddress?.emailAddress || profile.email;
                    profile.fullName = user.fullName || user.firstName || profile.fullName;
                    profile.imageUrl = user.imageUrl || profile.imageUrl;
                    allProfiles[user.id] = profile;
                    localStorage.setItem(storageKey, JSON.stringify(allProfiles));
                } else {
                    // Create new profile for this user
                    profile = _createNewProfile(user);
                    allProfiles[user.id] = profile;
                    localStorage.setItem(storageKey, JSON.stringify(allProfiles));
                }
            } else {
                // First user ever - create storage structure
                profile = _createNewProfile(user);
                const allProfiles = { [user.id]: profile };
                localStorage.setItem(storageKey, JSON.stringify(allProfiles));
            }

            // Store current active user ID
            localStorage.setItem(config.STORAGE_KEYS.AUTH_STATE, JSON.stringify({
                activeUserId: user.id,
                signedInAt: Date.now()
            }));

            console.log('CAISSA Auth: Profile bootstrapped for user', user.id);
            return profile;

        } catch (error) {
            console.error('CAISSA Auth: Failed to bootstrap profile', error);
            return null;
        }
    }

    /**
     * Create a new user profile
     */
    function _createNewProfile(user) {
        const config = window.CAISSA_AUTH_CONFIG;
        return {
            userId: user.id,
            email: user.primaryEmailAddress?.emailAddress || null,
            fullName: user.fullName || user.firstName || 'User',
            imageUrl: user.imageUrl || null,
            role: 'member',
            isPremium: false,
            credits: config.DEFAULT_FREE_CREDITS,
            createdAt: Date.now(),
            lastLoginAt: Date.now()
        };
    }

    /**
     * Clear session state on sign out (keeps profile data)
     */
    function _clearSessionState() {
        const config = window.CAISSA_AUTH_CONFIG;
        try {
            localStorage.setItem(config.STORAGE_KEYS.AUTH_STATE, JSON.stringify({
                activeUserId: null,
                signedOutAt: Date.now()
            }));
        } catch (error) {
            console.error('CAISSA Auth: Failed to clear session state', error);
        }
    }

    /**
     * Get current user's profile from localStorage
     */
    function getUserProfile() {
        const config = window.CAISSA_AUTH_CONFIG;
        const userId = window.CAISSA_AUTH.userId;

        if (!userId) return null;

        try {
            const stored = localStorage.getItem(config.STORAGE_KEYS.USER_PROFILE);
            if (stored) {
                const allProfiles = JSON.parse(stored);
                return allProfiles[userId] || null;
            }
        } catch (error) {
            console.error('CAISSA Auth: Failed to get profile', error);
        }
        return null;
    }

    /**
     * Update user profile in localStorage
     */
    function updateUserProfile(updates) {
        const config = window.CAISSA_AUTH_CONFIG;
        const userId = window.CAISSA_AUTH.userId;

        if (!userId) {
            console.error('CAISSA Auth: Cannot update profile - no user signed in');
            return null;
        }

        try {
            const stored = localStorage.getItem(config.STORAGE_KEYS.USER_PROFILE);
            if (stored) {
                const allProfiles = JSON.parse(stored);
                if (allProfiles[userId]) {
                    allProfiles[userId] = { ...allProfiles[userId], ...updates };
                    localStorage.setItem(config.STORAGE_KEYS.USER_PROFILE, JSON.stringify(allProfiles));
                    return allProfiles[userId];
                }
            }
        } catch (error) {
            console.error('CAISSA Auth: Failed to update profile', error);
        }
        return null;
    }

    /**
     * Deduct credits from user profile
     * Returns true if successful, false if insufficient credits
     */
    function deductCredits(amount = 1) {
        const profile = getUserProfile();
        if (!profile) return false;

        if (profile.credits < amount) {
            return false;
        }

        updateUserProfile({ credits: profile.credits - amount });
        return true;
    }

    /**
     * Add credits to user profile
     */
    function addCredits(amount) {
        const profile = getUserProfile();
        if (!profile) return false;

        updateUserProfile({ credits: (profile.credits || 0) + amount });
        return true;
    }

    /**
     * Sign out the current user
     */
    async function signOut() {
        if (_clerkInstance) {
            try {
                await _clerkInstance.signOut();
            } catch (error) {
                console.error('CAISSA Auth: Sign out failed', error);
            }
        }
    }

    /**
     * Redirect to sign in page
     */
    function redirectToSignIn(returnUrl = null) {
        const url = returnUrl || window.location.href;
        window.location.href = '/signin?redirect_url=' + encodeURIComponent(url);
    }

    /**
     * Redirect to sign up page
     */
    function redirectToSignUp(returnUrl = null) {
        const url = returnUrl || window.location.href;
        window.location.href = '/signup?redirect_url=' + encodeURIComponent(url);
    }

    /**
     * Add listener for auth state changes
     */
    function onAuthStateChange(callback) {
        if (typeof callback === 'function') {
            _sessionListeners.push(callback);
            // If already loaded, call immediately
            if (window.CAISSA_AUTH.isLoaded) {
                callback(window.CAISSA_AUTH);
            }
        }
    }

    /**
     * Notify all listeners of state change
     */
    function _notifyListeners() {
        _sessionListeners.forEach(callback => {
            try {
                callback(window.CAISSA_AUTH);
            } catch (error) {
                console.error('CAISSA Auth: Listener error', error);
            }
        });

        // Dispatch custom event for UI components
        window.dispatchEvent(new CustomEvent('caissa-auth-change', {
            detail: { ...window.CAISSA_AUTH }
        }));
    }

    /**
     * Get a short-lived Clerk session token (JWT) for API calls.
     * Returns null if not signed in.
     */
    async function getToken() {
        if (!_clerkInstance || !_clerkInstance.session) return null;
        try {
            return await _clerkInstance.session.getToken();
        } catch (e) {
            console.error('CAISSA Auth: Failed to get token', e);
            return null;
        }
    }

    // Expose public API
    window.CAISSA_AUTH.getToken = getToken;
    window.CAISSA_AUTH.init = initializeAuth;
    window.CAISSA_AUTH.getUserProfile = getUserProfile;
    window.CAISSA_AUTH.updateUserProfile = updateUserProfile;
    window.CAISSA_AUTH.deductCredits = deductCredits;
    window.CAISSA_AUTH.addCredits = addCredits;
    window.CAISSA_AUTH.signOut = signOut;
    window.CAISSA_AUTH.redirectToSignIn = redirectToSignIn;
    window.CAISSA_AUTH.redirectToSignUp = redirectToSignUp;
    window.CAISSA_AUTH.onAuthStateChange = onAuthStateChange;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeAuth);
    } else {
        initializeAuth();
    }

})();
