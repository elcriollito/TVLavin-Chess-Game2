(function installCoachProfile(global) {
    'use strict';
    const SCHEMA_VERSION = '1.0.0';
    const LEVELS = Object.freeze(['beginner', 'novice', 'intermediate']);
    const FOCUSES = Object.freeze(['general', 'opening-principles', 'tactical-awareness', 'positional-basics', 'defense', 'endgames']);
    const STYLES = Object.freeze(['concise', 'supportive', 'question-led']);
    const FORBIDDEN = new Set(['__proto__', 'prototype', 'constructor']);
    const text = (value, max = 240) => typeof value === 'string' && value.length > 0 && value.length <= max;
    const dangerous = (value, seen = new WeakSet()) => {
        if (typeof value === 'function') return true;
        if (!value || typeof value !== 'object' || seen.has(value)) return false;
        seen.add(value);
        return Object.keys(value).some(key => FORBIDDEN.has(key))
            || Object.values(value).some(item => dangerous(item, seen));
    };
    const freeze = value => {
        if (value && typeof value === 'object' && !Object.isFrozen(value)) {
            Object.values(value).forEach(freeze); Object.freeze(value);
        }
        return value;
    };
    function validate(value) {
        const errors = [];
        if (!value || typeof value !== 'object' || Array.isArray(value) || dangerous(value)) errors.push('INVALID_SHAPE');
        else {
            if (value.schemaVersion !== SCHEMA_VERSION) errors.push('SCHEMA_VERSION');
            if (!text(value.id, 64) || !/^[a-z0-9-]+$/.test(value.id)) errors.push('ID');
            if (!Number.isInteger(value.version) || value.version < 1) errors.push('VERSION');
            for (const key of ['name', 'shortName', 'description']) if (!text(value[key])) errors.push(key.toUpperCase());
            if (!LEVELS.includes(value.learnerLevel)) errors.push('LEARNER_LEVEL');
            if (!FOCUSES.includes(value.teachingFocus)) errors.push('TEACHING_FOCUS');
            if (!STYLES.includes(value.communicationStyle)) errors.push('COMMUNICATION_STYLE');
            if (!text(value.engineFoundation?.botProfileId, 64) || !text(value.engineFoundation?.presetId, 64)) errors.push('ENGINE_FOUNDATION');
            if (!text(value.interventionPolicyId, 64) || !text(value.feedbackPolicyId, 64)) errors.push('POLICY');
            if (!value.availability || value.availability.qaOnly !== true || typeof value.availability.enabled !== 'boolean') errors.push('AVAILABILITY');
            if (!text(value.presentation?.tagline) || !Array.isArray(value.presentation?.limitations)
                || value.presentation.limitations.length > 4 || value.presentation.limitations.some(item => !text(item))) errors.push('PRESENTATION');
            try { JSON.stringify(value); } catch (_) { errors.push('JSON_SAFE'); }
        }
        return freeze({ valid: errors.length === 0, errors });
    }
    function normalize(value) {
        const checked = validate(value);
        return checked.valid ? freeze({ ok: true, value: freeze(structuredClone(value)) })
            : freeze({ ok: false, reasonCode: 'INVALID_PROFILE', errors: checked.errors });
    }
    global.CaissaCoachProfile = freeze({
        schemaVersion: SCHEMA_VERSION, learnerLevels: LEVELS, teachingFocuses: FOCUSES,
        communicationStyles: STYLES, validate, normalize
    });
})(typeof window !== 'undefined' ? window : globalThis);
