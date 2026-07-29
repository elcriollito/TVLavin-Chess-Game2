(function installCriticalMomentContracts(global) {
    'use strict';
    const SCHEMA_VERSION = '1.0.0';
    const SELECTION_SCHEMA_VERSION = '1.0.0';
    const CATEGORIES = Object.freeze([
        'opening', 'tactical', 'strategic', 'transition', 'endgame', 'decision', 'terminal'
    ]);
    const LIMITS = Object.freeze([1, 3, 5]);
    const FORBIDDEN = new Set(['__proto__', 'prototype', 'constructor']);
    const freeze = value => {
        if (value && typeof value === 'object' && !Object.isFrozen(value)) {
            Object.values(value).forEach(freeze); Object.freeze(value);
        }
        return value;
    };
    const copy = value => JSON.parse(JSON.stringify(value));
    function dangerous(value, seen = new WeakSet()) {
        if (!value || typeof value !== 'object' || seen.has(value)) return false;
        seen.add(value);
        return Object.keys(value).some(key => FORBIDDEN.has(key))
            || Object.values(value).some(child => dangerous(child, seen));
    }
    const outcome = (ok, reasonCode, value = null) => freeze({ ok, reasonCode, value });
    function validateAnalysisResult(result) {
        if (!result || dangerous(result) || !['1.0.0', '1.1.0'].includes(result.schemaVersion)
            || !['complete', 'partial'].includes(result.status)
            || typeof result.runId !== 'string' || typeof result.requestId !== 'string'
            || !Array.isArray(result.positions) || result.positions.length > 32)
            return outcome(false, 'INVALID_ANALYSIS_RESULT');
        if (result.positions.some(position => !position || !Number.isInteger(position.ply)
            || position.ply < 0 || !position.evaluation
            || (!Number.isFinite(position.evaluation.cp) && !Number.isInteger(position.evaluation.mate))
            || position.evaluation.perspective !== 'white'))
            return outcome(false, 'INVALID_ANALYSIS_RESULT');
        if (result.positions.some((position, index) => index
            && position.ply <= result.positions[index - 1].ply))
            return outcome(false, 'INVALID_ANALYSIS_RESULT');
        return outcome(true, 'ANALYSIS_RESULT_VALID', freeze(copy(result)));
    }
    function validateRequest(request) {
        const limit = request?.review?.criticalMomentLimit;
        return LIMITS.includes(limit)
            ? outcome(true, 'REQUEST_VALID', freeze(copy(request)))
            : outcome(false, 'INVALID_CRITICAL_MOMENT_LIMIT');
    }
    global.CaissaCriticalMomentContracts = freeze({
        schemaVersion: SCHEMA_VERSION, selectionSchemaVersion: SELECTION_SCHEMA_VERSION,
        categories: CATEGORIES, limits: LIMITS, validateAnalysisResult, validateRequest
    });
})(typeof window !== 'undefined' ? window : globalThis);
