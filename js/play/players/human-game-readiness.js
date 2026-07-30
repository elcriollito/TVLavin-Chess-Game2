(function installHumanGameReadiness(global) {
    'use strict';
    const frozen = value => Object.freeze(value);
    function evaluate(input = {}) {
        const api = global.CaissaHumanFairPlay;
        const context = input?.schemaVersion ? input : api?.createContext?.(input);
        if (!context) return null;
        const reasons = [];
        if (context.gameType === 'unknown') reasons.push('UNKNOWN_GAME_TYPE');
        if (context.ratingMode === 'unknown') reasons.push('UNKNOWN_RATING_MODE');
        for (const [field, reason] of Object.entries({ server: 'PROVIDER_AUTHORITY_REQUIRED',
            clock: 'CLOCK_AUTHORITY_REQUIRED', move: 'MOVE_AUTHORITY_REQUIRED',
            result: 'RESULT_AUTHORITY_REQUIRED', reconnect: 'RECONNECT_AUTHORITY_REQUIRED' }))
            if (context.authority[field] !== 'provider') reasons.push(reason);
        if (context.ratingMode === 'rated' && context.assistanceMode !== 'prohibited')
            reasons.push('RATED_ASSISTANCE_PROHIBITED');
        if (context.ratingMode === 'casual' && context.gameType !== 'human-assisted-casual'
            && !['prohibited', 'post-game-only'].includes(context.assistanceMode))
            reasons.push('CASUAL_ASSISTANCE_DEFAULT_DENY');
        if (context.gameType === 'human-assisted-casual'
            && !(context.assistanceMode === 'mutually-assisted' && context.mutualAssistanceEvidence
                && context.providerAssistanceCapability))
            reasons.push('MUTUAL_ASSISTANCE_UNPROVEN');
        const postGame = context.providerTerminal && context.postGamePolicy === 'provider-terminal-required';
        if (context.enginePolicy === 'post-game-allow' && !postGame) reasons.push('PROVIDER_TERMINAL_REQUIRED');
        if (postGame) reasons.push('POST_GAME_ANALYSIS_ALLOWED');
        const blocking = reasons.some(reason => reason.endsWith('_REQUIRED') || reason.includes('PROHIBITED')
            || reason.includes('DEFAULT_DENY') || reason.includes('UNPROVEN') || reason.startsWith('UNKNOWN_'));
        return api.createDecision(context, blocking ? 'blocked'
            : context.gameType === 'human-assisted-casual' ? 'assisted-ready' : 'ready-provider-owned', reasons, {
            engineAction: postGame ? 'post-game-allow' : 'deny-request',
            evaluationMode: postGame ? 'post-game' : context.gameType === 'human-observed'
                && context.assistanceMode === 'spectator-delayed' ? 'delayed' : 'frozen',
            postGameAnalysisEligible: postGame,
            gameRecordReady: !blocking && context.authority.result === 'provider'
        });
    }
    function gateEngineRequest(decision, dispatch, options = {}) {
        const allowed = global.CaissaHumanFairPlay?.validateDecision?.(decision)
            && decision.postGameAnalysisEligible && decision.engineAction === 'post-game-allow';
        if (!allowed) {
            global.CaissaHumanFairPlay?.noteDenied?.(options.stale === true); options.cancel?.();
            return frozen({ ok: false, status: 'denied', reasonCode: 'HUMAN_ENGINE_PROHIBITED' });
        }
        return typeof dispatch === 'function' ? dispatch()
            : frozen({ ok: false, status: 'unavailable', reasonCode: 'HUMAN_ENGINE_PROHIBITED' });
    }
    global.CaissaHumanGameReadiness = frozen({ schemaVersion: '1.0.0', evaluate, gateEngineRequest });
})(typeof window !== 'undefined' ? window : globalThis);
