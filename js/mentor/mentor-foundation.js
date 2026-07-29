(function installMentorFoundation(global) {
    'use strict';
    const SCHEMA_VERSION = '1.0.0';
    const STATUSES = Object.freeze(['idle', 'selecting', 'ready', 'request-created',
        'awaiting-analysis', 'unavailable', 'disabled', 'error', 'disposed']);
    let request = null; let sequence = 0;
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
        const context = global.CaissaMentorContext.create({
            contextType: input.source === 'analyze-import' ? 'imported-game' : 'post-game',
            source: input.source, mentorId: input.mentorId, playerLevel: input.playerLevel,
            focus: input.focus, gameRecordId: input.record?.recordId,
            analyzeSessionId: input.analyzeSessionId, knowledgeReleaseId: input.knowledgeReleaseId
        });
        if (!context.valid) return freeze({ ok: false, status: 'error',
            reasonCode: context.reasonCode, readiness, value: null });
        const identity = `${context.value.source}:${context.value.gameRecordId || context.value.analyzeSessionId}:${input.mentorId}`;
        if (request?.identity === identity) {
            diagnostics.duplicates += 1; diagnostics.lastReasonCode = 'DUPLICATE_REQUEST';
            return freeze({ ok: true, status: 'unchanged', reasonCode: 'DUPLICATE_REQUEST',
                readiness, value: request.public });
        }
        const publicRequest = freeze({ schemaVersion: SCHEMA_VERSION,
            requestId: `mentor-request-${++sequence}`, sourceType: context.value.source,
            sourceId: context.value.gameRecordId || context.value.analyzeSessionId,
            mentorId: input.mentorId, playerLevel: context.value.playerLevel, focus: context.value.focus,
            gameRecordId: context.value.gameRecordId, analyzeSessionId: context.value.analyzeSessionId,
            knowledgeReleaseId: context.value.knowledgeReleaseId, status: 'request-created',
            createdAt: sequence, reviewImplemented: false });
        request = freeze({ identity, public: publicRequest });
        diagnostics.requests += 1; diagnostics.lastReasonCode = 'FOUNDATION_REQUEST_CREATED';
        return freeze({ ok: true, status: 'request-created', reasonCode: 'FOUNDATION_REQUEST_CREATED',
            readiness, value: publicRequest });
    }
    function reset() {
        request = null; diagnostics.resets += 1; diagnostics.lastReasonCode = 'FOUNDATION_RESET';
        return freeze({ ok: true, status: 'idle', reasonCode: 'FOUNDATION_RESET' });
    }
    const getSnapshot = () => freeze({ schemaVersion: SCHEMA_VERSION,
        status: request ? 'request-created' : 'idle', request: request?.public || null,
        diagnostics: { ...diagnostics } });
    global.CaissaMentorFoundation = freeze({
        schemaVersion: SCHEMA_VERSION, statuses: STATUSES, createRequest, reset,
        getSnapshot, inspect: getSnapshot
    });
})(typeof window !== 'undefined' ? window : globalThis);
