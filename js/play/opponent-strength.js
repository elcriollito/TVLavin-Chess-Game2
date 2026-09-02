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
    const depthFor = value => value >= MAX ? null : value < 500 ? 1 : value < 800 ? 2 : value < 1000 ? 3
        : value < 1200 ? 4 : value < 1400 ? 5 : value < 1600 ? 6 : value < 1800 ? 8
            : value < 2000 ? 10 : value < 2200 ? 12 : value < 2400 ? 14 : value < 2600 ? 16
                : value < 2800 ? 18 : 20;
    function describe(value) {
        if (!valid(value)) return freeze({ ok: false, reasonCode: 'INVALID_TARGET_ELO', value: null });
        const band = bandFor(value);
        return freeze({ ok: true, reasonCode: 'TARGET_ELO_ACCEPTED', value: freeze({ targetElo: value,
            bandId: band.id, bandLabel: band.label, fullPower: value === MAX, searchDepth: depthFor(value),
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
    function getSearchOptions() {
        if (!activeTarget || activeTarget.fullPower) return null;
        return freeze({ depth: activeTarget.searchDepth, targetElo: activeTarget.targetElo,
            calibrationStatus: activeTarget.calibrationStatus });
    }
    const inspect = () => freeze({ schemaVersion: SCHEMA_VERSION, active: activeTarget });
    root.CaissaOpponentStrength = freeze({ schemaVersion: SCHEMA_VERSION, min: MIN, max: MAX, step: STEP,
        defaultValue: DEFAULT, storageKey: STORAGE_KEY, bands: BANDS, isValid: valid, describe,
        readPreference, writePreference });
    root.CaissaOpponentStrengthSession = freeze({ schemaVersion: SCHEMA_VERSION, beginGame, reset,
        getSearchOptions, inspect });
})(typeof window !== 'undefined' ? window : globalThis);
