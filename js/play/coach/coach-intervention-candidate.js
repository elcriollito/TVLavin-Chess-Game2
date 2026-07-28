(function installCoachInterventionCandidate(global) {
    'use strict';
    const SCHEMA_VERSION = '1.0.0';
    const CONFIDENCE = Object.freeze(['low', 'medium', 'high']);
    const SEVERITY = Object.freeze(['positive', 'notice', 'warning']);
    const PHASES = Object.freeze(['opening', 'middlegame', 'endgame']);
    const GROUPS = Object.freeze(['tactical', 'development', 'king-safety', 'positive-reinforcement', 'endgame']);
    const TRIGGER = /^[a-z][a-z0-9-]{2,47}$/;
    const FORBIDDEN = new Set(['__proto__', 'prototype', 'constructor']);
    const freeze = value => {
        if (value && typeof value === 'object' && !Object.isFrozen(value)) {
            Object.values(value).forEach(freeze); Object.freeze(value);
        }
        return value;
    };
    const safe = (value, seen = new WeakSet()) => {
        if (typeof value === 'function') return false;
        if (!value || typeof value !== 'object') return true;
        if (seen.has(value) || Object.keys(value).some(key => FORBIDDEN.has(key))) return false;
        seen.add(value); return Object.values(value).every(item => safe(item, seen));
    };
    function create(input = {}) {
        const evidence = input.evidence;
        const valid = TRIGGER.test(input.triggerCode || '') && PHASES.includes(input.phase)
            && CONFIDENCE.includes(input.confidence) && SEVERITY.includes(input.severity)
            && Number.isInteger(input.priority) && input.priority >= 1 && input.priority <= 7
            && evidence && typeof evidence === 'object' && !Array.isArray(evidence) && safe(evidence)
            && typeof input.messageTemplateId === 'string'
            && Array.isArray(input.eligibleAssistanceLevels)
            && input.eligibleAssistanceLevels.every(level => ['light', 'guided', 'teaching'].includes(level))
            && GROUPS.includes(input.cooldownGroup) && typeof input.suppressible === 'boolean';
        if (!valid) return freeze({ ok: false, reasonCode: 'INVALID_CANDIDATE' });
        let evidenceCopy; let diagnosticsCopy;
        try { evidenceCopy = structuredClone(evidence); diagnosticsCopy = structuredClone(input.diagnostics || {}); }
        catch (_) { return freeze({ ok: false, reasonCode: 'NON_JSON_EVIDENCE' }); }
        const candidate = {
            schemaVersion: SCHEMA_VERSION, triggerCode: input.triggerCode, category: input.category,
            phase: input.phase, confidence: input.confidence, severity: input.severity, priority: input.priority,
            evidence: evidenceCopy, messageTemplateId: input.messageTemplateId,
            eligibleAssistanceLevels: [...input.eligibleAssistanceLevels],
            cooldownGroup: input.cooldownGroup, suppressible: input.suppressible,
            diagnostics: diagnosticsCopy
        };
        try { JSON.stringify(candidate); } catch (_) { return freeze({ ok: false, reasonCode: 'NON_JSON_EVIDENCE' }); }
        return freeze({ ok: true, reasonCode: 'CANDIDATE_CREATED', value: freeze(candidate) });
    }
    global.CaissaCoachInterventionCandidate = freeze({
        schemaVersion: SCHEMA_VERSION, confidenceBands: CONFIDENCE, priorities: freeze({
            immediateDanger: 1, hangingMaterial: 2, kingSafety: 3, development: 4,
            tacticalAwareness: 5, positiveReinforcement: 6, endgame: 7
        }), cooldownGroups: GROUPS, create
    });
})(typeof window !== 'undefined' ? window : globalThis);
