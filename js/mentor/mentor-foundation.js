(function installMentorFoundation(global) {
    'use strict';
    const SCHEMA_VERSION = '1.1.0';
    const STATUSES = Object.freeze(['idle', 'selecting', 'ready', 'request-created',
        'awaiting-analysis', 'unavailable', 'disabled', 'error', 'disposed']);
    let request = null;
    const diagnostics = { requests: 0, duplicates: 0, invalid: 0, resets: 0, lastReasonCode: null };
    const freeze = value => {
        if (value && typeof value === 'object' && !Object.isFrozen(value)) {
            Object.values(value).forEach(freeze); Object.freeze(value);
        }
        return value;
    };
    function createRequest(input = {}) {
        const readiness = global.CaissaMentorReviewReadiness?.evaluate?.(input);
        if (!readiness?.ready) {
            diagnostics.invalid += 1; diagnostics.lastReasonCode = readiness?.reasonCodes?.[0] || 'INVALID_REQUEST';
            return freeze({ ok: false, status: 'unavailable', reasonCode: diagnostics.lastReasonCode,
                readiness, value: null });
        }
        const options = {
            mentorId: input.mentorId, academyMentorId: input.academyMentorId,
            playerLevel: input.playerLevel, focus: input.focus, analysisDepth: input.analysisDepth,
            criticalMomentLimit: input.criticalMomentLimit, explanationStyle: input.explanationStyle,
            knowledgeReleaseId: input.knowledgeReleaseId, sourceType: input.source,
            requestOrigin: input.requestOrigin
        };
        const created = input.source === 'analyze-import'
            ? global.CaissaMentorReviewRequest?.fromAnalyzeSession?.({
                analyzeSessionId: input.analyzeSessionId, imported: true,
                activeHumanPlay: input.activeHumanPlay === true
            }, options)
            : global.CaissaMentorReviewRequest?.fromGameRecord?.(input.record, options);
        if (!created?.ok) {
            diagnostics.invalid += 1; diagnostics.lastReasonCode = created?.reasonCode || 'INVALID_REQUEST';
            return freeze({ ok: false, status: created?.status || 'invalid',
                reasonCode: diagnostics.lastReasonCode, readiness, value: null });
        }
        const registered = global.CaissaMentorReviewRequestRegistry?.register?.(created);
        if (!registered?.ok) return freeze({ ok: false, status: registered?.status || 'error',
            reasonCode: registered?.reasonCode || 'INVALID_REQUEST', readiness, value: null });
        if (registered.reasonCode === 'DUPLICATE_REQUEST') diagnostics.duplicates += 1;
        else diagnostics.requests += 1;
        request = registered.value;
        diagnostics.lastReasonCode = registered.reasonCode;
        return freeze({ ok: true, status: registered.status, reasonCode: registered.reasonCode,
            readiness, value: registered.value });
    }
    function reset() {
        request = null; global.CaissaMentorReviewRequestRegistry?.dispose?.();
        diagnostics.resets += 1; diagnostics.lastReasonCode = 'FOUNDATION_RESET';
        return freeze({ ok: true, status: 'idle', reasonCode: 'FOUNDATION_RESET' });
    }
    const getSnapshot = () => freeze({ schemaVersion: SCHEMA_VERSION,
        status: request ? request.status : 'idle', request,
        diagnostics: { ...diagnostics } });
    global.CaissaMentorFoundation = freeze({
        schemaVersion: SCHEMA_VERSION, statuses: STATUSES, createRequest, reset,
        getSnapshot, inspect: getSnapshot
    });
})(typeof window !== 'undefined' ? window : globalThis);
