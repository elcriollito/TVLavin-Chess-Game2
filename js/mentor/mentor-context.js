(function installMentorContext(global) {
    'use strict';
    const SCHEMA_VERSION = '1.0.0';
    const TYPES = Object.freeze(['pre-game', 'post-game', 'imported-game', 'analysis', 'training', 'academy']);
    const SOURCES = Object.freeze(['games', 'bot', 'coach', 'analyze-import', 'academy', 'training']);
    const SAFE_ID = /^[a-z0-9:._-]{1,160}$/i;
    const freeze = value => {
        if (value && typeof value === 'object' && !Object.isFrozen(value)) {
            Object.values(value).forEach(freeze); Object.freeze(value);
        }
        return value;
    };
    function create(input = {}) {
        const valid = TYPES.includes(input.contextType) && SOURCES.includes(input.source)
            && SAFE_ID.test(input.mentorId || '') && (!input.gameRecordId || SAFE_ID.test(input.gameRecordId))
            && (!input.analyzeSessionId || SAFE_ID.test(input.analyzeSessionId))
            && SAFE_ID.test(input.knowledgeReleaseId || '');
        if (!valid) return freeze({ valid: false, reasonCode: 'INVALID_CONTEXT', value: null });
        return freeze({ valid: true, reasonCode: 'CONTEXT_CREATED', value: freeze({
            schemaVersion: SCHEMA_VERSION,
            contextId: `mentor-context:${input.contextType}:${input.source}:${input.gameRecordId || input.analyzeSessionId || 'foundation'}`,
            contextType: input.contextType, source: input.source, mentorId: input.mentorId,
            playerLevel: ['beginner', 'novice', 'intermediate'].includes(input.playerLevel)
                ? input.playerLevel : 'novice',
            focus: typeof input.focus === 'string' && /^[a-z][a-z-]{1,39}$/.test(input.focus)
                ? input.focus : 'general',
            gameRecordId: input.gameRecordId || null, analyzeSessionId: input.analyzeSessionId || null,
            knowledgeReleaseId: input.knowledgeReleaseId,
            capabilities: ['post-game-review-request'], status: 'foundation'
        }) });
    }
    global.CaissaMentorContext = freeze({ schemaVersion: SCHEMA_VERSION,
        contextTypes: TYPES, sources: SOURCES, create });
})(typeof window !== 'undefined' ? window : globalThis);
