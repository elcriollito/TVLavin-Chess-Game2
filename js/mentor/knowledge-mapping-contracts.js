(function installKnowledgeMappingContracts(global) {
    'use strict';
    const SCHEMA_VERSION = '1.0.0';
    const SAFE_ID = /^[a-z0-9:._-]{1,200}$/i;
    const freeze = value => {
        if (value && typeof value === 'object' && !Object.isFrozen(value)) {
            Object.values(value).forEach(freeze); Object.freeze(value);
        }
        return value;
    };
    const operation = (ok, reasonCode, value = null) => freeze({ ok, reasonCode, value });
    function createRequest(input = {}) {
        const policy = global.CaissaKnowledgeMappingPolicy;
        if (!policy || input.knowledgeReleaseId !== policy.releaseId
            || !SAFE_ID.test(input.mappingRequestId || '') || !Array.isArray(input.evidence)
            || input.evidence.length > policy.limits.evidence || input.evidence.some(value =>
                !global.CaissaConceptEvidence?.validate?.(value)?.ok))
            return operation(false, 'INVALID_KNOWLEDGE_MAPPING_REQUEST');
        const limit = Number.isInteger(input.requestedConceptLimit)
            ? Math.max(0, Math.min(input.requestedConceptLimit, policy.limits.concepts)) : 3;
        return operation(true, 'KNOWLEDGE_MAPPING_REQUEST_CREATED', freeze({
            schemaVersion: SCHEMA_VERSION, mappingRequestId: input.mappingRequestId,
            mentorRequestId: input.mentorRequestId || null,
            analysisResultId: input.analysisResultId || null, selectionId: input.selectionId || null,
            replaySessionId: input.replaySessionId || null,
            knowledgeReleaseId: input.knowledgeReleaseId,
            evidence: freeze(JSON.parse(JSON.stringify(input.evidence))),
            requestedConceptLimit: limit, status: 'validated'
        }));
    }
    function validateResult(value) {
        const policy = global.CaissaKnowledgeMappingPolicy;
        const valid = value?.schemaVersion === SCHEMA_VERSION
            && value.knowledgeReleaseId === policy?.releaseId && Array.isArray(value.mappings)
            && value.mappings.length <= policy.limits.concepts
            && value.mappings.every(mapping => policy.concepts.includes(mapping.conceptId)
                && (!mapping.knowledgeUnit || Object.values(policy.units)
                    .some(unit => unit.id === mapping.knowledgeUnit.id
                        && unit.contentVersion === mapping.knowledgeUnit.contentVersion
                        && unit.publicUrl === mapping.knowledgeUnit.publicUrl)));
        return operation(valid, valid ? 'KNOWLEDGE_MAPPING_RESULT_VALID' : 'INVALID_KNOWLEDGE_MAPPING_RESULT',
            valid ? value : null);
    }
    global.CaissaKnowledgeMappingContracts = freeze({
        schemaVersion: SCHEMA_VERSION, createRequest, validateResult
    });
})(typeof window !== 'undefined' ? window : globalThis);
