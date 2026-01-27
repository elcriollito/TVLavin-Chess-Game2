/**
 * CAISSA Feature Flags
 *
 * Simple feature flag system for gradual rollouts and A/B testing
 */

const CaissaFeatureFlags = {
    // Feature flag definitions
    flags: {
        // Core features (always on)
        cloudSync: true,
        mentorAI: true,
        library: true,
        queryEngine: true,
        positionForge: true,

        // Launch features (enabled by default)
        onboarding: true,
        betaBadge: true,

        // Advanced/Developer features (disabled by default)
        BYO_AI_KEY: false, // Bring Your Own AI API Key mode

        // Experimental features (can be toggled)
        advancedAnalysis: false,
        socialSharing: false,
        mobileOptimizations: false,

        // Future features (disabled by default)
        repertoireBuilder: false,
        communityLibrary: false,
        lichessIntegration: false
    },

    // Local overrides (for testing)
    _overrides: {},

    /**
     * Initialize feature flags
     * Loads overrides from localStorage for development
     */
    init() {
        // Load local overrides from localStorage
        try {
            const stored = localStorage.getItem('caissa_feature_flags');
            if (stored) {
                this._overrides = JSON.parse(stored);
                if (window.CaissaLog) {
                    CaissaLog.info('FeatureFlags', 'Loaded overrides', this._overrides);
                }
            }
        } catch (error) {
            console.error('FeatureFlags: Failed to load overrides', error);
        }

        if (window.CaissaLog) {
            CaissaLog.info('FeatureFlags', 'Initialized', this.getAllFlags());
        }
    },

    /**
     * Check if a feature is enabled
     * @param {string} flagName - Feature flag name
     * @returns {boolean}
     */
    isEnabled(flagName) {
        // Check override first
        if (flagName in this._overrides) {
            return this._overrides[flagName];
        }

        // Fall back to default
        return this.flags[flagName] ?? false;
    },

    /**
     * Enable a feature (local override)
     * @param {string} flagName - Feature flag name
     */
    enable(flagName) {
        this._overrides[flagName] = true;
        this._saveOverrides();

        if (window.CaissaLog) {
            CaissaLog.info('FeatureFlags', `Enabled ${flagName}`);
        }
    },

    /**
     * Disable a feature (local override)
     * @param {string} flagName - Feature flag name
     */
    disable(flagName) {
        this._overrides[flagName] = false;
        this._saveOverrides();

        if (window.CaissaLog) {
            CaissaLog.info('FeatureFlags', `Disabled ${flagName}`);
        }
    },

    /**
     * Clear all local overrides
     */
    clearOverrides() {
        this._overrides = {};
        localStorage.removeItem('caissa_feature_flags');

        if (window.CaissaLog) {
            CaissaLog.info('FeatureFlags', 'Cleared all overrides');
        }
    },

    /**
     * Get all flags with their current values
     * @returns {Object}
     */
    getAllFlags() {
        const all = {};
        for (const flagName in this.flags) {
            all[flagName] = this.isEnabled(flagName);
        }
        return all;
    },

    /**
     * Save overrides to localStorage
     * @private
     */
    _saveOverrides() {
        try {
            localStorage.setItem('caissa_feature_flags', JSON.stringify(this._overrides));
        } catch (error) {
            console.error('FeatureFlags: Failed to save overrides', error);
        }
    },

    /**
     * Check if user is in beta (based on auth or localStorage)
     * @returns {boolean}
     */
    isBetaUser() {
        // Check localStorage flag for beta opt-in
        const betaOptIn = localStorage.getItem('caissa_beta_optin');
        if (betaOptIn === 'true') return true;

        // Check if authenticated (all authenticated users are beta)
        if (window.CaissaAuth?.isAuthenticated()) return true;

        return false;
    },

    /**
     * Opt into beta features
     */
    optIntoBeta() {
        localStorage.setItem('caissa_beta_optin', 'true');

        if (window.CaissaLog) {
            CaissaLog.info('FeatureFlags', 'Opted into beta');
        }
    },

    /**
     * Opt out of beta features
     */
    optOutOfBeta() {
        localStorage.removeItem('caissa_beta_optin');

        if (window.CaissaLog) {
            CaissaLog.info('FeatureFlags', 'Opted out of beta');
        }
    }
};

// Auto-initialize
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        CaissaFeatureFlags.init();
    });
} else {
    CaissaFeatureFlags.init();
}

// Expose globally
window.CaissaFeatureFlags = CaissaFeatureFlags;

// Development helper: window.flags for quick access in console
if (typeof window !== 'undefined') {
    window.flags = {
        enable: (name) => CaissaFeatureFlags.enable(name),
        disable: (name) => CaissaFeatureFlags.disable(name),
        list: () => console.table(CaissaFeatureFlags.getAllFlags()),
        clear: () => CaissaFeatureFlags.clearOverrides()
    };
}
