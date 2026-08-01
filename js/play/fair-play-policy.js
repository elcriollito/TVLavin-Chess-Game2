/**
 * Client-side CAISSA fair-play policy boundary.
 * Prevents unsupported engine use in migrated paths; it is not server-authoritative
 * anti-cheat and cannot prevent external assistance software.
 */
(function installFairPlayPolicy(global) {
    'use strict';
    const POLICY_VERSION = '1.0.0';
    if (global.CaissaFairPlayPolicy?.schemaVersion === POLICY_VERSION) return;
    const CONTEXT_VERSION = '1.0.0';
    const DECISION_VERSION = '1.0.0';
    const PURPOSES = Object.freeze([
        'opponent-move', 'live-evaluation', 'post-game-analysis',
        'coach-assistance', 'mentor-analysis', 'hint'
    ]);
    const STATUSES = Object.freeze([
        'allowed', 'denied', 'unsupported', 'incomplete-context',
        'invalid-context', 'consent-required', 'agreement-required', 'unavailable'
    ]);
    const EVALUATION_MODES = Object.freeze(['live', 'delayed', 'frozen', 'hidden', 'post-game', 'unavailable']);
    const REASON_CODES = Object.freeze({
        MACHINE_OPPONENT_ALLOWED: 'MACHINE_OPPONENT_ALLOWED',
        LOCAL_TRAINING_ALLOWED: 'LOCAL_TRAINING_ALLOWED',
        IMPORTED_ANALYSIS_ALLOWED: 'IMPORTED_ANALYSIS_ALLOWED',
        COMPLETED_GAME_ANALYSIS_ALLOWED: 'COMPLETED_GAME_ANALYSIS_ALLOWED',
        HUMAN_LIVE_ASSISTANCE_DENIED: 'HUMAN_LIVE_ASSISTANCE_DENIED',
        EXTERNAL_AUTHORITY_DENIED: 'EXTERNAL_AUTHORITY_DENIED',
        UNKNOWN_HUMAN_CONTEXT_DENIED: 'UNKNOWN_HUMAN_CONTEXT_DENIED',
        ACTIVE_GAME_POST_ANALYSIS_DENIED: 'ACTIVE_GAME_POST_ANALYSIS_DENIED',
        ASSISTED_MODE_NOT_APPROVED: 'ASSISTED_MODE_NOT_APPROVED',
        UNSUPPORTED_PURPOSE: 'UNSUPPORTED_PURPOSE',
        INVALID_CONTEXT: 'INVALID_CONTEXT',
        INCOMPLETE_CONTEXT: 'INCOMPLETE_CONTEXT',
        UNKNOWN_CONTEXT_DENIED: 'UNKNOWN_CONTEXT_DENIED',
        SPECTATOR_LIVE_EVALUATION_DENIED: 'SPECTATOR_LIVE_EVALUATION_DENIED',
        COACH_CONTEXT_ALLOWED: 'COACH_CONTEXT_ALLOWED'
    });
    const SOURCES = new Set(['local-play', 'external-play', 'arena', 'spectator', 'training', 'imported', 'analyze', 'unknown']);
    const OPPONENTS = new Set(['engine', 'bot', 'coach', 'human', 'local-human', 'external-human', 'none', 'unknown']);
    const AUTHORITIES = new Set(['local-client', 'external-server', 'analysis-workspace', 'training-runtime', 'unknown']);
    const GAME_STATUSES = new Set(['idle', 'configuring', 'active', 'paused', 'completed', 'analyzing', 'reviewing', 'unknown']);
    const FORBIDDEN = new Set(['__proto__', 'constructor', 'prototype']);
    const issued = new WeakSet();
    let sequence = 0;
    const counters = { decisions: 0, allowed: 0, denied: 0, incomplete: 0, invalid: 0 };
    let lastReasonCode = null;
    const freeze = value => {
        if (value && typeof value === 'object' && !Object.isFrozen(value)) {
            Object.values(value).forEach(freeze);
            Object.freeze(value);
        }
        return value;
    };
    const dangerous = (value, seen = new WeakSet()) => {
        if (!value || typeof value !== 'object' || seen.has(value)) return false;
        seen.add(value);
        return Object.keys(value).some(key => FORBIDDEN.has(key))
            || Object.values(value).some(item => dangerous(item, seen));
    };
    function normalizeContext(input = {}) {
        if (!input || typeof input !== 'object' || Array.isArray(input) || dangerous(input)) return null;
        const text = (value, values, fallback = 'unknown') => values.has(value) ? value : fallback;
        return freeze({
            schemaVersion: CONTEXT_VERSION,
            source: text(input.source, SOURCES),
            gameMode: typeof input.gameMode === 'string' ? input.gameMode.slice(0, 40) : null,
            opponentType: text(input.opponentType, OPPONENTS),
            authority: text(input.authority, AUTHORITIES),
            rated: input.rated === true,
            casual: input.casual === true,
            assisted: input.assisted === true,
            spectator: input.spectator === true,
            gameStatus: text(input.gameStatus, GAME_STATUSES),
            purpose: PURPOSES.includes(input.purpose) ? input.purpose : 'unknown',
            consent: input.consent === true,
            coachMode: input.coachMode === true,
            trainingMode: input.trainingMode === true,
            imported: input.imported === true,
            metadata: freeze({})
        });
    }
    const capabilities = (allowed, purpose, mode) => freeze({
        mayRunEngine: allowed,
        mayShowEvaluation: allowed && purpose === 'live-evaluation',
        evaluationMode: mode,
        mayShowHints: allowed && purpose === 'hint',
        mayUseCoachIntervention: allowed && purpose === 'coach-assistance',
        mayAnalyzePostGame: allowed && ['post-game-analysis', 'mentor-analysis'].includes(purpose)
    });
    function createDecision(context, allowed, status, reasonCode, mode = 'unavailable') {
        const decision = freeze({
            schemaVersion: DECISION_VERSION,
            policyVersion: POLICY_VERSION,
            decisionId: `fair-play-decision:${++sequence}`,
            allowed, status, reasonCode, purpose: context?.purpose ?? 'unknown',
            context,
            capabilities: capabilities(allowed, context?.purpose, mode),
            constraints: freeze({
                delayMs: null,
                requiresConsent: false,
                requiresMutualAgreement: status === 'agreement-required',
                requiresCompletedGame: ['post-game-analysis', 'mentor-analysis'].includes(context?.purpose ?? '')
            }),
            diagnostics: freeze([])
        });
        issued.add(decision);
        counters.decisions += 1;
        counters[allowed ? 'allowed' : status === 'incomplete-context' ? 'incomplete'
            : status === 'invalid-context' ? 'invalid' : 'denied'] += 1;
        lastReasonCode = reasonCode;
        return decision;
    }
    function evaluatePurpose(purpose, input) {
        const context = normalizeContext({ ...input, purpose });
        if (!context) return createDecision(null, false, 'invalid-context', REASON_CODES.INVALID_CONTEXT);
        if (!PURPOSES.includes(purpose))
            return createDecision(context, false, 'unsupported', REASON_CODES.UNSUPPORTED_PURPOSE);
        if (context.source === 'unknown' || context.authority === 'unknown' || context.opponentType === 'unknown')
            return createDecision(context, false, 'incomplete-context', REASON_CODES.INCOMPLETE_CONTEXT);
        const analysis = ['post-game-analysis', 'mentor-analysis'].includes(purpose);
        if (analysis) {
            if (context.imported || context.source === 'imported')
                return createDecision(context, true, 'allowed', REASON_CODES.IMPORTED_ANALYSIS_ALLOWED, 'post-game');
            if (context.gameStatus === 'completed')
                return createDecision(context, true, 'allowed', REASON_CODES.COMPLETED_GAME_ANALYSIS_ALLOWED, 'post-game');
            return createDecision(context, false, 'denied', REASON_CODES.ACTIVE_GAME_POST_ANALYSIS_DENIED);
        }
        if (context.assisted && ['human', 'local-human', 'external-human'].includes(context.opponentType))
            return createDecision(context, false, 'agreement-required', REASON_CODES.ASSISTED_MODE_NOT_APPROVED);
        if (context.authority === 'external-server')
            return createDecision(context, false, 'denied', REASON_CODES.EXTERNAL_AUTHORITY_DENIED);
        if (context.source === 'spectator' || context.spectator)
            return createDecision(context, false, 'denied', REASON_CODES.SPECTATOR_LIVE_EVALUATION_DENIED);
        if (['human', 'local-human', 'external-human'].includes(context.opponentType))
            return createDecision(context, false, 'denied', REASON_CODES.HUMAN_LIVE_ASSISTANCE_DENIED);
        if (context.source === 'training' && context.authority === 'training-runtime')
            return createDecision(context, true, 'allowed', REASON_CODES.LOCAL_TRAINING_ALLOWED, 'live');
        if (context.opponentType === 'coach' && context.coachMode)
            return createDecision(context, true, 'allowed', REASON_CODES.COACH_CONTEXT_ALLOWED, 'live');
        if (context.source === 'local-play' && context.authority === 'local-client'
            && ['engine', 'bot', 'coach'].includes(context.opponentType))
            return createDecision(context, true, 'allowed', REASON_CODES.MACHINE_OPPONENT_ALLOWED, 'live');
        return createDecision(context, false, 'denied', REASON_CODES.UNKNOWN_CONTEXT_DENIED);
    }
    function createCurrentPlayContext(purpose) {
        if (global.__caissaPlayHarness && global.__caissaFairPlayTestContext)
            return normalizeContext({ ...global.__caissaFairPlayTestContext, purpose });
        const snapshot = global.CaissaPlayCompatibility?.getSnapshot?.();
        if (!snapshot || !['engine', 'analysis'].includes(snapshot.mode))
            return normalizeContext({ source: 'unknown', opponentType: 'unknown', authority: 'unknown',
                gameStatus: 'unknown', purpose });
        return normalizeContext({
            source: 'local-play',
            gameMode: snapshot.mode,
            opponentType: 'engine',
            authority: 'local-client',
            gameStatus: snapshot.game?.active ? 'active' : 'idle',
            purpose
        });
    }
    function validateDecision(decision, purpose) {
        const valid = issued.has(decision) && decision.allowed === true && decision.purpose === purpose
            && decision.policyVersion === POLICY_VERSION;
        if (valid) issued.delete(decision);
        return valid;
    }
    function validateDisplayDecision(decision, purpose) {
        const valid = issued.has(decision) && decision?.purpose === purpose
            && decision.policyVersion === POLICY_VERSION
            && typeof decision.allowed === 'boolean'
            && EVALUATION_MODES.includes(decision.capabilities?.evaluationMode);
        if (valid) issued.delete(decision);
        return valid;
    }
    const api = freeze({
        schemaVersion: POLICY_VERSION,
        contextSchemaVersion: CONTEXT_VERSION,
        decisionSchemaVersion: DECISION_VERSION,
        purposes: PURPOSES, statuses: STATUSES, reasonCodes: REASON_CODES,
        evaluationModes: EVALUATION_MODES, normalizeContext,
        evaluate: context => evaluatePurpose(context?.purpose, context),
        evaluatePurpose, createCurrentPlayContext, validateDecision, validateDisplayDecision,
        inspect: () => freeze({ counters: { ...counters }, lastReasonCode }),
        resetDiagnostics: () => {
            Object.keys(counters).forEach(key => { counters[key] = 0; });
            lastReasonCode = null;
            return true;
        }
    });
    global.CaissaFairPlayPolicy = api;
})(window);
