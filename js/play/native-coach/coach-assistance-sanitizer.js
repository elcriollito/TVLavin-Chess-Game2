(function installCoachAssistanceSanitizer(root) {
    'use strict';
    const policy = root.CaissaPlayV2CoachAssistancePolicy;
    const allowedKeys = new Set(['eventId', 'generation', 'turnId', 'type', 'category', 'severity', 'confidence', 'timing', 'messageKey', 'requested', 'promotionPending', 'opponentWorking', 'terminal', 'openingPly', 'lowTime']);
    const forbidden = /(?:best|candidate|principal|\bpv\b|mate|line|command|score|evaluation|future|fen|pgn|move|square)/i;
    const freeze = value => Object.freeze(value);
    function sanitize(input) {
        if (!input || typeof input !== 'object' || Array.isArray(input)) return freeze({ ok: false, reasonCode: 'MALFORMED_RESULT' });
        if (Object.keys(input).some(key => !allowedKeys.has(key) || forbidden.test(key))) return freeze({ ok: false, reasonCode: 'RAW_OUTPUT_REJECTED' });
        if (!policy.observableEvents.includes(input.type) || !policy.categories.includes(input.category)
            || !['low', 'medium', 'high'].includes(input.severity) || !['low', 'medium', 'high'].includes(input.confidence)
            || input.timing !== 'on-request' || !Object.hasOwn(policy.messages, input.messageKey)) return freeze({ ok: false, reasonCode: 'UNALLOWLISTED_RESULT' });
        return freeze({ ok: true, value: freeze({ eventId: String(input.eventId || ''), generation: Number(input.generation), turnId: String(input.turnId || ''),
            type: input.type, category: input.category, severity: input.severity, confidence: input.confidence, timing: input.timing,
            messageKey: input.messageKey, requested: input.requested === true, promotionPending: input.promotionPending === true,
            opponentWorking: input.opponentWorking === true, terminal: input.terminal === true, openingPly: Number(input.openingPly || 0), lowTime: input.lowTime === true }) });
    }
    root.CaissaNativeCoachAssistanceSanitizer = Object.freeze({ schemaVersion: '1.0.0', sanitize });
})(typeof window !== 'undefined' ? window : globalThis);
