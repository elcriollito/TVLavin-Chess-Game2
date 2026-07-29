(function installMentorReviewReadiness(global) {
    'use strict';
    const SCHEMA_VERSION = '1.0.0';
    const freeze = value => {
        if (value && typeof value === 'object' && !Object.isFrozen(value)) {
            Object.values(value).forEach(freeze); Object.freeze(value);
        }
        return value;
    };
    function evaluate(input = {}) {
        const missing = []; const reasons = [];
        const mentor = global.CaissaMentorRegistry?.get?.(input.mentorId);
        if (!mentor) { missing.push('mentor'); reasons.push('MENTOR_NOT_SELECTED'); }
        const source = input.source;
        if (!['games', 'bot', 'coach', 'analyze-import'].includes(source)) {
            missing.push('supported-source'); reasons.push('UNSUPPORTED_SOURCE');
        }
        if (source === 'analyze-import') {
            if (!/^[a-z0-9:._-]{1,160}$/i.test(input.analyzeSessionId || '')) {
                missing.push('analyze-session'); reasons.push('ANALYSIS_REQUIRED');
            }
        } else {
            const validation = global.CaissaGameRecord?.validate?.(input.record);
            if (!validation?.valid || input.record?.result?.complete !== true
                || !['completed', 'aborted'].includes(input.record?.status)) {
                missing.push('completed-game-record'); reasons.push('GAME_RECORD_REQUIRED');
            }
        }
        if (input.knowledgeReleaseId !== global.CaissaMentorCapabilities?.releaseId) {
            missing.push('public-knowledge-release'); reasons.push('KNOWLEDGE_RELEASE_REQUIRED');
        }
        const capability = global.CaissaMentorCapabilities?.get?.(
            source === 'analyze-import' ? 'imported-game-review-request' : 'post-game-review-request');
        if (capability?.status !== 'foundation') {
            missing.push('review-request-capability'); reasons.push('DISABLED_BY_PRODUCT');
        }
        const ready = missing.length === 0;
        return freeze({ schemaVersion: SCHEMA_VERSION, ready,
            status: ready ? 'request-ready' : 'unavailable',
            reviewImplemented: false, missingRequirements: missing, reasonCodes: reasons,
            availableNextActions: ready ? ['create-foundation-request', 'analyze-game'] : [] });
    }
    global.CaissaMentorReviewReadiness = freeze({ schemaVersion: SCHEMA_VERSION, evaluate });
})(typeof window !== 'undefined' ? window : globalThis);
