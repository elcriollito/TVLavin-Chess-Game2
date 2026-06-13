/**
 * CAISSA Auth Configuration
 *
 * Clerk publishable key - safe to expose in client-side code.
 * For production, set this via Vercel environment variables.
 *
 * To get your Clerk publishable key:
 * 1. Go to https://dashboard.clerk.com
 * 2. Select your application
 * 3. Go to API Keys
 * 4. Copy the "Publishable Key" (starts with pk_test_ or pk_live_)
 */

const CAISSA_AUTH_CONFIG = {
    // Replace with your actual Clerk publishable key
    // For local development, use pk_test_...
    // For production, use pk_live_...
    CLERK_PUBLISHABLE_KEY: 'pk_test_REPLACE_WITH_YOUR_KEY',

    // Redirect URLs after auth actions
    REDIRECT_AFTER_SIGN_IN: '/',
    REDIRECT_AFTER_SIGN_UP: '/',
    REDIRECT_AFTER_SIGN_OUT: '/',

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

// Freeze config to prevent accidental modification
Object.freeze(CAISSA_AUTH_CONFIG);
Object.freeze(CAISSA_AUTH_CONFIG.FEATURES);
Object.freeze(CAISSA_AUTH_CONFIG.STORAGE_KEYS);

// Export for module systems (optional)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CAISSA_AUTH_CONFIG;
}
