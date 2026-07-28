(function installBotProfile(global) {
    'use strict';

    const SCHEMA_VERSION = '1.0.0';
    const CALIBRATION = Object.freeze(['estimated', 'internally-tested']);
    const DIFFICULTIES = Object.freeze(['beginner', 'casual', 'intermediate', 'advanced']);
    const ID = /^[a-z][a-z0-9-]{2,39}$/;
    const DANGEROUS = new Set(['__proto__', 'prototype', 'constructor']);

    function deepFreeze(value, seen = new WeakSet()) {
        if (!value || typeof value !== 'object' || seen.has(value)) return value;
        seen.add(value); Object.values(value).forEach(item => deepFreeze(item, seen));
        return Object.freeze(value);
    }
    function safeObject(value) {
        return value && typeof value === 'object' && !Array.isArray(value)
            && !Object.keys(value).some(key => DANGEROUS.has(key));
    }
    function boundedText(value, max) {
        return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= max;
    }
    function validate(profile) {
        const errors = [];
        if (!safeObject(profile)) return deepFreeze({ valid: false, errors: ['Profile must be a safe object.'] });
        if (profile.schemaVersion !== SCHEMA_VERSION) errors.push('Unsupported profile schema.');
        if (!ID.test(profile.id || '')) errors.push('Invalid profile ID.');
        if (profile.version !== 1) errors.push('Unsupported profile version.');
        for (const [key, max] of [['name', 60], ['shortName', 24], ['description', 240], ['enginePresetId', 40]]) {
            if (!boundedText(profile[key], max)) errors.push(`Invalid ${key}.`);
        }
        if (!DIFFICULTIES.includes(profile.difficultyBand)) errors.push('Invalid difficulty band.');
        if (!CALIBRATION.includes(profile.calibrationStatus)) errors.push('Invalid calibration status.');
        if (!safeObject(profile.availability) || profile.availability.enabled !== true
            || profile.availability.qaOnly !== true || profile.availability.locked !== false)
            errors.push('Invalid availability.');
        if (!safeObject(profile.presentation)
            || !boundedText(profile.presentation.tagline, 100)
            || !Array.isArray(profile.presentation.strengths)
            || !Array.isArray(profile.presentation.limitations)
            || [...profile.presentation.strengths, ...profile.presentation.limitations]
                .some(item => !boundedText(item, 100)))
            errors.push('Invalid presentation.');
        return deepFreeze({ valid: errors.length === 0, errors });
    }
    function normalize(profile) {
        const validation = validate(profile);
        if (!validation.valid) return deepFreeze({ ok: false, validation, value: null });
        const value = JSON.parse(JSON.stringify(profile));
        return deepFreeze({ ok: true, validation, value: deepFreeze(value) });
    }

    global.CaissaBotProfile = Object.freeze({
        schemaVersion: SCHEMA_VERSION, calibrationStatuses: CALIBRATION,
        difficultyBands: DIFFICULTIES, validate, normalize
    });
})(typeof window !== 'undefined' ? window : globalThis);
