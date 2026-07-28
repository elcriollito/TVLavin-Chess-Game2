(function installEndgamePublicationGate(global) {
    'use strict';
    const SCHEMA_VERSION = '1.0.0';
    const REQUIRED = Object.freeze(['endgame-activate-king', 'endgame-opposition',
        'endgame-support-passer', 'endgame-pawn-square']);
    function evaluate(overrides = {}) {
        const checks = Object.freeze({
            phaseClassifier: overrides.phaseClassifier ?? typeof global.CaissaEndgamePhaseClassifier?.classify === 'function',
            detectors: overrides.detectors ?? typeof global.CaissaEndgameDetectors?.evaluate === 'function',
            candidateContract: overrides.candidateContract ?? typeof global.CaissaCoachInterventionCandidate?.create === 'function',
            policy: overrides.policy ?? !!global.CaissaCoachInterventionPolicy?.get?.('endgame-bounded'),
            templates: overrides.templates ?? REQUIRED.every(id => !!global.CaissaCoachMessages?.templates?.[id]),
            mappings: overrides.mappings ?? REQUIRED.every(id => global.CaissaEndgameKnowledgeMap?.validate?.(
                global.CaissaEndgameKnowledgeMap.get(id)).valid)
        });
        const failed = Object.keys(checks).filter(key => !checks[key]);
        return Object.freeze({ schemaVersion: SCHEMA_VERSION, canPublish: failed.length === 0,
            requiredDetectors: REQUIRED, checks, failed: Object.freeze(failed) });
    }
    global.CaissaEndgamePublicationGate = Object.freeze({ schemaVersion: SCHEMA_VERSION,
        requiredDetectors: REQUIRED, evaluate, snapshot: evaluate() });
})(typeof window !== 'undefined' ? window : globalThis);
