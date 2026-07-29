(function installMentorFutureAdapters(global) {
    'use strict';
    const SCHEMA_VERSION = '1.0.0';
    const freeze = value => Object.freeze(value);
    const create = (id, prerequisite) => freeze({
        schemaVersion: SCHEMA_VERSION, id,
        evaluate(mappingResult) {
            const valid = global.CaissaKnowledgeMappingContracts?.validateResult?.(mappingResult)?.ok === true;
            return freeze({ ready: valid && mappingResult.mappings.length > 0,
                reasonCode: valid && mappingResult.mappings.length > 0 ? prerequisite : 'MAPPING_REQUIRED',
                writes: 0, mutationAllowed: false });
        },
        evaluateSummary(summary) {
            const valid = global.CaissaMentorSummaryContracts?.validateSummary?.(summary)?.ok === true;
            return freeze({ ready: valid && summary.evidenceStatus === 'complete',
                reasonCode: valid ? prerequisite : 'SUMMARY_REQUIRED',
                writes: 0, mutationAllowed: false, recommendationsAssigned: 0 });
        },
        inspect: () => freeze({ writes: 0, mutationAllowed: false })
    });
    global.CaissaMentorTrainingMemoryAdapter = create('training-memory-readiness', 'CONSENT_AND_CONTRACT_REQUIRED');
    global.CaissaMentorMasteryAdapter = create('mastery-readiness', 'ASSESSMENT_EVIDENCE_REQUIRED');
    global.CaissaMentorRecommendationAdapter = create('recommendation-readiness', 'SUMMARY_POLICY_REQUIRED');
})(typeof window !== 'undefined' ? window : globalThis);
