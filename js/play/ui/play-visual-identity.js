(function installPlayVisualIdentity(global) {
    'use strict';
    const SCHEMA_VERSION = '1.0.0';
    const PRINCIPLE_ID = 'caissa-board-first';
    const FORBIDDEN_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
    const freeze = value => {
        if (value && typeof value === 'object' && !Object.isFrozen(value)) {
            Object.values(value).forEach(freeze); Object.freeze(value);
        }
        return value;
    };
    const POLICY = freeze({
        schemaVersion: SCHEMA_VERSION,
        principleId: PRINCIPLE_ID,
        preserve: ['board-first-hierarchy', 'contextual-panel', 'one-primary-action',
            'progressive-disclosure', 'mode-navigation', 'responsive-stacking', 'evaluation-visibility'],
        caissaExpression: ['inscribed-mode-rail', 'asymmetric-corner-rhythm', 'edge-marked-surfaces',
            'identity-before-metadata', 'separated-primary-command', 'learning-continuation',
            'truthful-readiness-states', 'classic-bridge'],
        prohibitedSimilarities: ['copied-assets', 'copied-icons', 'copied-avatars', 'copied-wording',
            'copied-card-order', 'copied-measurement-cluster', 'copied-color-cluster',
            'copied-button-hierarchy', 'copied-breakpoint-set', 'copied-animation-sequence'],
        requiredDistinctives: ['caissa-terminology', 'three-step-spacing-rhythm', 'engraved-edge-treatment',
            'profile-identity-then-purpose-then-metadata', 'rail-mode-navigation',
            'primary-command-separation', 'mentor-learning-bridge', 'qa-truth-language',
            'board-proportion-owned-by-shell'],
        evidence: ['play-visual-originality-audit', 'scoped-identity-css',
            'identity-policy-tests', 'cross-browser-visual-distance-tests']
    });
    function hasHostileKey(value, seen = new WeakSet()) {
        if (!value || typeof value !== 'object' || seen.has(value)) return false;
        seen.add(value);
        for (const key of Reflect.ownKeys(value)) {
            if (typeof key !== 'string' || FORBIDDEN_KEYS.has(key) || hasHostileKey(value[key], seen)) return true;
        }
        return false;
    }
    function validate(candidate) {
        if (!candidate || typeof candidate !== 'object' || hasHostileKey(candidate))
            return freeze({ ok: false, reasonCode: 'INVALID_IDENTITY_POLICY' });
        if (candidate.schemaVersion !== SCHEMA_VERSION)
            return freeze({ ok: false, reasonCode: 'UNSUPPORTED_SCHEMA_VERSION' });
        if (candidate.principleId !== PRINCIPLE_ID)
            return freeze({ ok: false, reasonCode: 'UNKNOWN_PRINCIPLE' });
        const fields = ['preserve', 'caissaExpression', 'prohibitedSimilarities', 'requiredDistinctives', 'evidence'];
        if (fields.some(field => !Array.isArray(candidate[field]) || candidate[field].length < 1
            || candidate[field].length > 16 || candidate[field].some(item =>
                typeof item !== 'string' || !/^[a-z0-9-]{2,64}$/.test(item))))
            return freeze({ ok: false, reasonCode: 'INVALID_IDENTITY_POLICY' });
        return freeze({ ok: true, reasonCode: 'IDENTITY_POLICY_VALID' });
    }
    global.CaissaPlayIdentityRules = freeze({
        schemaVersion: SCHEMA_VERSION, policySchemaVersion: SCHEMA_VERSION,
        getPolicy: () => POLICY, validate
    });
})(typeof window !== 'undefined' ? window : globalThis);
