(function installOpponentStrength(root) {
    'use strict';
    const SCHEMA_VERSION = '1.0.0';
    const MIN = 250; const MAX = 3200; const STEP = 50; const DEFAULT = 1500;
    const STORAGE_KEY = 'caissa.play.opponent-strength.v1';
    const BANDS = Object.freeze([
        Object.freeze({ id: 'beginner', label: 'Beginner', min: 250, max: 999 }),
        Object.freeze({ id: 'intermediate', label: 'Intermediate', min: 1000, max: 1499 }),
        Object.freeze({ id: 'advanced', label: 'Advanced', min: 1500, max: 2199 }),
        Object.freeze({ id: 'master', label: 'Master', min: 2200, max: 2799 }),
        Object.freeze({ id: 'elite', label: 'Elite', min: 2800, max: 3200 })
    ]);
    let activeTarget = null;
    const freeze = value => { if (value && typeof value === 'object' && !Object.isFrozen(value)) {
        Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
    const valid = value => Number.isInteger(value) && value >= MIN && value <= MAX && (value - MIN) % STEP === 0;
    const bandFor = value => BANDS.find(item => value >= item.min && value <= item.max) || null;
    const legacyDepthFor = value => value >= MAX ? null : value < 500 ? 1 : value < 800 ? 2 : value < 1000 ? 3
        : value < 1200 ? 4 : value < 1400 ? 5 : value < 1600 ? 6 : value < 1800 ? 8
            : value < 2000 ? 10 : value < 2200 ? 12 : value < 2400 ? 14 : value < 2600 ? 16
                : value < 2800 ? 18 : 20;
    const calibratedDepthFor = value => value >= MAX ? null : value >= 2800 ? 18 : legacyDepthFor(value);
    const usesSf18GameCalibration = context => context?.role === 'game'
        && context?.providerKey === 'stockfish-18-gameplay';
    const usesLegacyCoachGmCorrection = context => context?.role === 'coach-active'
        && context?.providerKey === 'legacy-stockfish-2019';
    const LOW_TIER_SKILL_ANCHORS = Object.freeze([
        Object.freeze({ target: 250, skill: 0 }), Object.freeze({ target: 500, skill: 4 }),
        Object.freeze({ target: 800, skill: 8 }), Object.freeze({ target: 1200, skill: 12 }),
        Object.freeze({ target: 1600, skill: 16 })
    ]);
    function calibratedSkillFor(value) {
        if (value <= LOW_TIER_SKILL_ANCHORS[0].target) return LOW_TIER_SKILL_ANCHORS[0].skill;
        for (let index = 1; index < LOW_TIER_SKILL_ANCHORS.length; index += 1) {
            const upper = LOW_TIER_SKILL_ANCHORS[index]; const lower = LOW_TIER_SKILL_ANCHORS[index - 1];
            if (value <= upper.target) return Math.round(lower.skill
                + ((value - lower.target) / (upper.target - lower.target)) * (upper.skill - lower.skill));
        }
        return 20;
    }
    function describe(value) {
        if (!valid(value)) return freeze({ ok: false, reasonCode: 'INVALID_TARGET_ELO', value: null });
        const band = bandFor(value);
        return freeze({ ok: true, reasonCode: 'TARGET_ELO_ACCEPTED', value: freeze({ targetElo: value,
            bandId: band.id, bandLabel: band.label, fullPower: value === MAX, searchDepth: legacyDepthFor(value),
            calibrationStatus: 'target-strength-pending-calibration' }) });
    }
    function readPreference(storage = root.localStorage) {
        try { const value = Number(storage?.getItem?.(STORAGE_KEY)); return valid(value) ? value : DEFAULT; }
        catch (_) { return DEFAULT; }
    }
    function writePreference(value, storage = root.localStorage) {
        if (!valid(value)) return false;
        try { storage?.setItem?.(STORAGE_KEY, String(value)); return true; } catch (_) { return false; }
    }
    function beginGame(value) {
        const description = describe(value); if (!description.ok) return description;
        activeTarget = description.value;
        return freeze({ ok: true, reasonCode: 'TARGET_STRENGTH_SESSION_STARTED', value: activeTarget });
    }
    function reset() { activeTarget = null; return freeze({ ok: true, reasonCode: 'TARGET_STRENGTH_RESET' }); }
    function getSearchOptions(context = null) {
        if (!activeTarget || activeTarget.fullPower) return null;
        const calibrated = usesSf18GameCalibration(context);
        if (calibrated && activeTarget.targetElo <= 1600) return freeze({ movetime: 50,
            targetElo: activeTarget.targetElo, calibrationStatus: 'engine18-003b-skill-movetime-v1' });
        if (usesLegacyCoachGmCorrection(context) && activeTarget.targetElo === 2800) return freeze({ movetime: 2000,
            targetElo: activeTarget.targetElo, calibrationStatus: 'engine18-003b-coach-gm-timeout-v1' });
        return freeze({ depth: calibrated ? calibratedDepthFor(activeTarget.targetElo) : activeTarget.searchDepth,
            targetElo: activeTarget.targetElo,
            calibrationStatus: calibrated ? 'engine18-003a-depth-v1' : activeTarget.calibrationStatus });
    }
    function getEngineOptions(context = null) {
        if (!activeTarget || !usesSf18GameCalibration(context)) return null;
        return freeze({ 'Skill Level': activeTarget.targetElo <= 1600
            ? calibratedSkillFor(activeTarget.targetElo) : 20,
        UCI_LimitStrength: false, UCI_Elo: 1320 });
    }
    const inspect = () => freeze({ schemaVersion: SCHEMA_VERSION, active: activeTarget });
    root.CaissaOpponentStrength = freeze({ schemaVersion: SCHEMA_VERSION, min: MIN, max: MAX, step: STEP,
        defaultValue: DEFAULT, storageKey: STORAGE_KEY, bands: BANDS, isValid: valid, describe,
        readPreference, writePreference });
    root.CaissaOpponentStrengthSession = freeze({ schemaVersion: SCHEMA_VERSION, beginGame, reset,
        getSearchOptions, getEngineOptions, inspect });
})(typeof window !== 'undefined' ? window : globalThis);
