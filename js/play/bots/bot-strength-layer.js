(function installBotStrengthLayer(root) {
    'use strict';

    const SCHEMA_VERSION = '1.0.0';
    const MODEL_VERSION = 'classic-target-model-1';
    const MIN = 100; const MAX = 3200; const STEP = 50;
    const profiles = new Map(); const policies = new Map();
    const freeze = value => Object.freeze(value);
    const bounded = (value, min, max) => Math.max(min, Math.min(max, value));
    const interpolate = (target, start, end, low, high) => {
        const ratio = bounded((target - start) / Math.max(1, end - start), 0, 1);
        return Math.round(low + ((high - low) * ratio));
    };

    function parameters(target) {
        if (target <= 249) return { depth: interpolate(target, 100, 249, 1, 2), candidates: 5,
            loss: interpolate(target, 100, 249, 1200, 800), error: interpolate(target, 100, 249, 95, 85) };
        if (target <= 999) return { depth: interpolate(target, 250, 999, 2, 5), candidates: 5,
            loss: interpolate(target, 250, 999, 700, 220), error: interpolate(target, 250, 999, 80, 35) };
        if (target <= 1499) return { depth: interpolate(target, 1000, 1499, 6, 8), candidates: 5,
            loss: interpolate(target, 1000, 1499, 180, 100), error: interpolate(target, 1000, 1499, 25, 12) };
        if (target <= 2199) return { depth: interpolate(target, 1500, 2199, 9, 12), candidates: 4,
            loss: interpolate(target, 1500, 2199, 80, 35), error: interpolate(target, 1500, 2199, 10, 2) };
        if (target <= 2799) return { depth: interpolate(target, 2200, 2799, 13, 17), candidates: 3,
            loss: interpolate(target, 2200, 2799, 25, 10), error: interpolate(target, 2200, 2799, 1, 0) };
        return { depth: interpolate(target, 2800, 3200, 18, 20), candidates: 2,
            loss: 8, error: 0 };
    }

    function build(target) {
        if (!Number.isInteger(target) || target < MIN || target > MAX || target % STEP !== 0) return null;
        const id = `strength-${target}`; const values = parameters(target);
        const policy = freeze({ id, selectionStyle: 'strength-model', targetStrength: target,
            candidateCount: values.candidates, depth: values.depth, lossBoundaryCp: values.loss,
            errorRatePercent: values.error, tacticalPreference: 0, stabilityPreference: 0 });
        const profile = freeze({ schemaVersion: SCHEMA_VERSION, id, modelVersion: MODEL_VERSION,
            targetStrength: target, calibrationStatus: 'modelled-uncalibrated', ratingClaim: 'none',
            search: freeze({ depth: values.depth, candidateCount: values.candidates }), policy });
        profiles.set(id, profile); policies.set(id, policy); return profile;
    }
    for (let target = MIN; target <= MAX; target += STEP) build(target);

    function get(id) { return profiles.get(id) || null; }
    function getByTarget(target) { return get(`strength-${target}`); }
    function getPolicy(id) { return policies.get(id) || null; }
    function validate(profile) {
        const canonical = get(profile?.id);
        return freeze({ valid: !!canonical && canonical === profile,
            reasonCode: canonical === profile ? 'VALID_MODEL_PROFILE' : 'INVALID_MODEL_PROFILE' });
    }

    root.CaissaBotStrengthLayer = freeze({ schemaVersion: SCHEMA_VERSION, modelVersion: MODEL_VERSION,
        min: MIN, max: MAX, step: STEP, get, getByTarget, getPolicy, has: id => profiles.has(id),
        list: () => freeze([...profiles.values()]), validate });
})(typeof window !== 'undefined' ? window : globalThis);
