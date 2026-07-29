(function installMentorSummaryContracts(global) {
    'use strict';
    const SCHEMA_VERSION = '1.0.0';
    const EVIDENCE_STATUSES = Object.freeze(['complete', 'partial', 'limited', 'insufficient', 'unavailable']);
    const ACTION_TYPES = Object.freeze([
        'replay-again', 'analyze-this-game', 'review-concept',
        'rematch-with-goal', 'return-to-play', 'no-action'
    ]);
    const CONFIDENCE = Object.freeze(['low', 'medium', 'high']);
    const SAFE_ID = /^[a-z0-9:._-]{1,220}$/i;
    const FORBIDDEN = new Set(['__proto__', 'prototype', 'constructor']);
    const freeze = (value, seen = new WeakSet()) => {
        if (!value || typeof value !== 'object' || seen.has(value)) return value;
        seen.add(value); Object.values(value).forEach(child => freeze(child, seen));
        return Object.freeze(value);
    };
    const copy = value => JSON.parse(JSON.stringify(value));
    const operation = (ok, reasonCode, value = null) => freeze({ ok, reasonCode, value });
    function dangerous(value, seen = new WeakSet()) {
        if (!value || typeof value !== 'object' || seen.has(value)) return false;
        seen.add(value);
        return Object.keys(value).some(key => FORBIDDEN.has(key))
            || Object.values(value).some(child => dangerous(child, seen));
    }
    function validateInputs(input) {
        if (!input || dangerous(input)) return operation(false, 'INVALID_SUMMARY_INPUT');
        const { request, analysisResult, selection, replaySession = null, mappingResult = null } = input;
        if (!SAFE_ID.test(request?.requestId || '')
            || !['complete', 'partial'].includes(analysisResult?.status)
            || analysisResult.requestId !== request.requestId
            || selection?.requestId !== request.requestId
            || selection?.runId !== analysisResult.runId
            || !Array.isArray(selection.selectedMoments) || selection.selectedMoments.length > 5
            || selection.selectedCount !== selection.selectedMoments.length)
            return operation(false, 'SUMMARY_INPUT_CORRELATION_FAILED');
        if (replaySession && (replaySession.requestId !== request.requestId
            || replaySession.analysisResultId !== (analysisResult.resultId
                || `analysis-result:${analysisResult.runId}`)
            || replaySession.selectionId !== selection.selectionId))
            return operation(false, 'REPLAY_CORRELATION_FAILED');
        if (mappingResult && (mappingResult.knowledgeReleaseId !== request.knowledge?.releaseId
            || mappingResult.mappingRequestId == null
            || !mappingResult.mappingRequestId.includes(request.requestId)
            || mappingResult.mappings?.some(mapping => mapping.sourceMomentId
                && !selection.selectedMoments.some(moment => moment.candidateId === mapping.sourceMomentId))
            || !global.CaissaKnowledgeMappingContracts?.validateResult?.(mappingResult)?.ok))
            return operation(false, 'MAPPING_CORRELATION_FAILED');
        return operation(true, 'SUMMARY_INPUTS_VALID', freeze(copy(input)));
    }
    function validateSummary(summary) {
        const valid = summary?.schemaVersion === SCHEMA_VERSION
            && SAFE_ID.test(summary.summaryId || '') && SAFE_ID.test(summary.requestId || '')
            && EVIDENCE_STATUSES.includes(summary.evidenceStatus)
            && (!summary.strength || CONFIDENCE.includes(summary.strength.confidence))
            && (!summary.improvementArea || CONFIDENCE.includes(summary.improvementArea.confidence))
            && Array.isArray(summary.moments) && summary.moments.length <= 3
            && ACTION_TYPES.includes(summary.prioritizedAction?.type)
            && Array.isArray(summary.concepts) && summary.concepts.length <= 3;
        return operation(valid, valid ? 'MENTOR_SUMMARY_VALID' : 'INVALID_MENTOR_SUMMARY',
            valid ? summary : null);
    }
    global.CaissaMentorSummaryContracts = freeze({
        schemaVersion: SCHEMA_VERSION, evidenceStatuses: EVIDENCE_STATUSES,
        actionTypes: ACTION_TYPES, confidenceLevels: CONFIDENCE,
        validateInputs, validateSummary
    });
})(typeof window !== 'undefined' ? window : globalThis);
