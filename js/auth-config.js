/**
 * CAISSA Auth Configuration
 *
 * Clerk publishable key - safe to expose in client-side code.
 * For production, /api/public-auth-config supplies this from Vercel environment
 * variables so secrets stay server-side and static files do not need edits.
 *
 * To get your Clerk publishable key:
 * 1. Go to https://dashboard.clerk.com
 * 2. Select your application
 * 3. Go to API Keys
 * 4. Copy the "Publishable Key" (starts with pk_test_ or pk_live_)
 */

const BLOCKED_REDIRECT_PATHS = Object.freeze(['/api', '/internal', '/debug', '/qa', '/admin', '/auth']);

function sanitizeInternalRedirect(candidate, fallback = '/') {
    const normalize = value => {
        if (typeof value !== 'string' || value.length === 0 || value.length > 2048) return null;
        if (value !== value.trim() || /[\u0000-\u001f\u007f]/.test(value)) return null;
        if (!/^\/(?![\\/])/.test(value) || value.includes('\\')) return null;
        if (/%(?:0[0-9a-f]|1[0-9a-f]|7f|2f|5c|25)/i.test(value)) return null;
        try {
            const parsed = new URL(value, 'https://caissa.invalid');
            if (parsed.origin !== 'https://caissa.invalid') return null;
            const path = parsed.pathname.toLowerCase();
            if (BLOCKED_REDIRECT_PATHS.some(prefix => path === prefix || path.startsWith(`${prefix}/`))) return null;
            return `${parsed.pathname}${parsed.search}${parsed.hash}`;
        } catch (_) {
            return null;
        }
    };
    return normalize(candidate) || normalize(fallback) || '/';
}

function isValidClerkPublishableKey(value) {
    if (typeof value !== 'string') return false;
    const key = value.trim();
    if (key.length < 24 || key.length > 512 || !/^pk_(?:test|live)_[A-Za-z0-9_-]+$/.test(key)) return false;
    return !/(?:replace(?:_with)?_your_key|placeholder|change(?:me|_me)|dummy|example)/i.test(key);
}

const CAISSA_AUTH_CONFIG = {
    // Fallback only. Production should hydrate this from /api/public-auth-config.
    CLERK_PUBLISHABLE_KEY: 'pk_test_REPLACE_WITH_YOUR_KEY',
    REGISTRATION_TRACKING_AVAILABLE: false,

    // Redirect URLs after auth actions
    REDIRECT_AFTER_SIGN_IN: '/',
    REDIRECT_AFTER_SIGN_UP: '/',
    REDIRECT_AFTER_SIGN_OUT: '/',
    sanitizeInternalRedirect,

    // Feature flags (can be overridden by backend in future)
    FEATURES: {
        // Features that require Premium subscription
        PREMIUM_FEATURES: ['advanced_search', 'cloud_sync', 'unlimited_analysis'],
        // Features that consume credits
        CREDIT_FEATURES: ['batch_analysis', 'insight', 'mentor_chat'],
        // Free features available to all users
        FREE_FEATURES: ['basic_analysis', 'position_library', 'game_import']
    },

    // Default credits for new users (trial)
    DEFAULT_FREE_CREDITS: 5,

    // Local storage keys
    STORAGE_KEYS: {
        USER_PROFILE: 'caissa_user_profile',
        AUTH_STATE: 'caissa_auth_state'
    }
};

window.CAISSA_AUTH_CONFIG = CAISSA_AUTH_CONFIG;
window.CAISSA_REDIRECTS = Object.freeze({ sanitizeInternalRedirect });
window.CAISSA_AUTH_CONFIG_UTILS = Object.freeze({ isValidClerkPublishableKey });
window.CAISSA_AUTH_CONFIG_READY = (async function loadPublicAuthConfig() {
    try {
        const response = await fetch('/api/public-auth-config', {
            method: 'GET',
            headers: { 'Accept': 'application/json' },
            cache: 'no-store'
        });

        if (!response.ok) {
            console.warn('[Auth Config] Public auth config unavailable', response.status);
            return CAISSA_AUTH_CONFIG;
        }

        const data = await response.json();
        const publishableKey = String(data.clerkPublishableKey || '').trim();
        if (isValidClerkPublishableKey(publishableKey)) {
            CAISSA_AUTH_CONFIG.CLERK_PUBLISHABLE_KEY = publishableKey;
            if (window.location.hostname === 'www.caissa-chess.org' && publishableKey.startsWith('pk_test_')) {
                console.warn('[Auth Config] Production is using a Clerk development publishable key. Configure NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY with a pk_live_ key in Vercel.');
            }
        }
        CAISSA_AUTH_CONFIG.REGISTRATION_TRACKING_AVAILABLE = data.registrationTracking === true;
    } catch (error) {
        console.warn('[Auth Config] Public auth config failed to load', error.message);
    }

    return CAISSA_AUTH_CONFIG;
})();

// Keep the top-level config mutable so the public server config can hydrate it.
Object.freeze(CAISSA_AUTH_CONFIG.FEATURES);
Object.freeze(CAISSA_AUTH_CONFIG.STORAGE_KEYS);

// Export for module systems (optional)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CAISSA_AUTH_CONFIG;
}
