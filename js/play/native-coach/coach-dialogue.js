(function installNativeCoachDialogue(root) {
    'use strict';
    const SCHEMA_VERSION = '1.1.0';
    const EVENT_TYPES = Object.freeze(['welcome', 'game-ready', 'user-turn', 'requested-help', 'game-complete', 'error', 'dismissed']);
    const CATEGORIES = Object.freeze(['general', 'encouragement', 'check', 'reflection', 'completion', 'system']);
    const MESSAGES = Object.freeze({
        WELCOME: "Let's play. I'll help you along the way.",
        GAME_READY: "Your game is ready. Take your time—I’m here when you need me.",
        STAY_QUIET: 'I will stay quiet until you ask again.',
        START_ERROR: 'I could not start this game. Please try again.',
        CHECK_ALERT: 'Your king is in check. Take a calm look at every safe response.',
        PAUSE_AND_SCAN: 'Before moving, scan what your opponent is attacking.',
        KEEP_BUILDING: 'Good—keep developing your pieces and protecting your king.',
        TAKE_YOUR_TIME: 'Take your time. A careful move is better than a rushed one.',
        GAME_COMPLETE: 'Game complete. There is something useful to learn from every position.'
    });
    const ALLOWED_KEYS = new Set(['type', 'category', 'messageKey', 'ply', 'requested']);
    const FORBIDDEN_KEY = /(?:best|candidate|principal|\bpv\b|mate|line|command|score|evaluation|future|fen|pgn|move|square|engine|depth)/i;
    const freeze = value => {
        if (value && typeof value === 'object' && !Object.isFrozen(value)) {
            Object.values(value).forEach(freeze); Object.freeze(value);
        }
        return value;
    };
    const response = (ok, reasonCode, message = null) => freeze({ ok, reasonCode, message });
    const sanitize = input => {
        if (!input || typeof input !== 'object' || Array.isArray(input)) return response(false, 'MALFORMED_EVENT');
        if (Object.keys(input).some(key => !ALLOWED_KEYS.has(key) || FORBIDDEN_KEY.test(key))) return response(false, 'RAW_ANALYSIS_REJECTED');
        if (!EVENT_TYPES.includes(input.type) || !CATEGORIES.includes(input.category)) return response(false, 'UNALLOWLISTED_EVENT');
        if (!Object.hasOwn(MESSAGES, input.messageKey)) return response(false, 'UNALLOWLISTED_MESSAGE');
        const ply = Number(input.ply || 0);
        if (!Number.isInteger(ply) || ply < 0 || ply > 1000) return response(false, 'INVALID_PLY');
        return freeze({ ok: true, value: freeze({ type: input.type, category: input.category,
            messageKey: input.messageKey, ply, requested: input.requested === true }) });
    };
    function create(options = {}) {
        let minimumPlyGap = Number.isInteger(options.minimumPlyGap) ? Math.max(1, options.minimumPlyGap) : 4;
        let maximumAutomaticMessages = Number.isInteger(options.maximumAutomaticMessages)
            ? Math.max(0, options.maximumAutomaticMessages) : 8;
        let disposed = false; let silenced = false; let lastAutomaticPly = -Infinity;
        let automaticMessages = 0; let spoken = 0; let suppressed = 0; let lastMessageKey = null;
        const reject = reasonCode => { suppressed += 1; return response(false, reasonCode); };
        const observe = raw => {
            if (disposed) return reject('DISPOSED');
            const sanitized = sanitize(raw);
            if (!sanitized.ok) return reject(sanitized.reasonCode);
            const event = sanitized.value;
            const automatic = !event.requested && event.type === 'user-turn';
            if (silenced && automatic) return reject('QUIET_BY_USER');
            if (automatic && automaticMessages >= maximumAutomaticMessages) return reject('QUIET_GAME_LIMIT');
            if (automatic && event.ply - lastAutomaticPly < minimumPlyGap) return reject('QUIET_COOLDOWN');
            if (automatic && event.messageKey === lastMessageKey) return reject('QUIET_DUPLICATE');
            if (automatic && event.category !== 'check' && event.ply % minimumPlyGap !== 0) return reject('QUIET_CADENCE');
            if (automatic) { automaticMessages += 1; lastAutomaticPly = event.ply; }
            spoken += 1; lastMessageKey = event.messageKey;
            return response(true, 'SPOKE', MESSAGES[event.messageKey]);
        };
        const presentAssistance = presentation => {
            if (disposed) return reject('DISPOSED');
            const message = presentation?.message;
            if (typeof message !== 'string' || !Object.values(root.CaissaPlayV2CoachAssistancePolicy?.messages || {}).includes(message)) {
                return reject('UNALLOWLISTED_ASSISTANCE');
            }
            spoken += 1; lastMessageKey = presentation.messageKey || null;
            return response(true, 'SPOKE', message);
        };
        return freeze({
            observe, presentAssistance,
            configure(policy = {}) {
                if (!Number.isInteger(policy.minimumPlyGap) || policy.minimumPlyGap < 1 || policy.minimumPlyGap > 40
                    || !Number.isInteger(policy.maximumAutomaticMessages) || policy.maximumAutomaticMessages < 0
                    || policy.maximumAutomaticMessages > 20) return false;
                minimumPlyGap = policy.minimumPlyGap; maximumAutomaticMessages = policy.maximumAutomaticMessages;
                return true;
            },
            silence() { silenced = true; return observe({ type: 'dismissed', category: 'system', messageKey: 'STAY_QUIET', ply: 0, requested: true }); },
            resume() { silenced = false; return true; },
            reset() { silenced = false; lastAutomaticPly = -Infinity; automaticMessages = 0; lastMessageKey = null; return true; },
            inspect: () => freeze({ schemaVersion: SCHEMA_VERSION, spoken, suppressed, automaticMessages,
                policy: freeze({ minimumPlyGap, maximumAutomaticMessages }),
                silenced, rawAnalysisAccepted: 0, bestMoveDisclosures: 0, principalVariationDisclosures: 0 }),
            dispose() { disposed = true; return true; }
        });
    }
    root.CaissaNativeCoachDialogue = freeze({ schemaVersion: SCHEMA_VERSION, eventTypes: EVENT_TYPES,
        categories: CATEGORIES, messages: MESSAGES, sanitize, create });
})(typeof window !== 'undefined' ? window : globalThis);
