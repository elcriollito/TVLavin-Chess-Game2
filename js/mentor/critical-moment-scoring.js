(function installCriticalMomentScoring(global) {
    'use strict';
    const SCHEMA_VERSION = '1.0.0';
    const WEIGHTS = Object.freeze({
        evaluationLoss: 34, evaluationSwing: 16, mate: 34, material: 18,
        phaseTransition: 12, terminal: 16, bestMoveMismatch: 4
    });
    const freeze = value => {
        if (value && typeof value === 'object' && !Object.isFrozen(value)) {
            Object.values(value).forEach(freeze); Object.freeze(value);
        }
        return value;
    };
    const scaled = (value, maximum) => Math.min(1, Math.max(0, value || 0) / maximum);
    function score(signals) {
        const components = {
            evaluationLoss: Math.round(WEIGHTS.evaluationLoss * scaled(signals.playerLossCp, 400)),
            evaluationSwing: Math.round(WEIGHTS.evaluationSwing * scaled(signals.absoluteSwingCp, 500)),
            mate: signals.mateIntroduced || signals.mateEscaped || signals.mateChangedSide ? WEIGHTS.mate : 0,
            material: Math.round(WEIGHTS.material * scaled(Math.abs(signals.materialDelta || 0), 9)),
            phaseTransition: signals.phaseTransition ? WEIGHTS.phaseTransition : 0,
            terminal: signals.terminal ? WEIGHTS.terminal : 0,
            bestMoveMismatch: signals.bestMoveMismatch ? WEIGHTS.bestMoveMismatch : 0
        };
        const rawScore = Object.values(components).reduce((sum, value) => sum + value, 0);
        const normalizedScore = Math.min(100, rawScore);
        const evidenceCount = Object.values(components).filter(value => value > 0).length;
        const confidence = Math.min(1, Math.round((0.35 + evidenceCount * 0.12
            + (signals.bestMoveMismatch ? 0.08 : 0)
            + (signals.evaluationBefore !== null && signals.evaluationAfter !== null ? 0.14 : 0)) * 100) / 100);
        return freeze({ schemaVersion: SCHEMA_VERSION, rawScore, normalizedScore,
            components: freeze(components), confidence });
    }
    global.CaissaCriticalMomentScoring = freeze({
        schemaVersion: SCHEMA_VERSION, weights: WEIGHTS, score
    });
})(typeof window !== 'undefined' ? window : globalThis);
