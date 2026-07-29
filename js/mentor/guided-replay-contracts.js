(function installGuidedReplayContracts(global) {
    'use strict';
    const SCHEMA_VERSION = '1.0.0';
    const MAX_STEPS = 5; const MAX_MOVES = 10000; const MAX_PV = 8;
    const ANSWER_POLICIES = Object.freeze([
        'hidden-until-attempt', 'reveal-on-request-after-attempt',
        'auto-reveal-after-attempt', 'no-reference-answer'
    ]);
    const STATUSES = Object.freeze([
        'created', 'prepared', 'active', 'awaiting-attempt', 'attempted',
        'revealed', 'completed', 'canceled', 'failed', 'disposed'
    ]);
    const FORBIDDEN = new Set(['__proto__', 'prototype', 'constructor']);
    const freeze = value => {
        if (value && typeof value === 'object' && !Object.isFrozen(value)) {
            Object.values(value).forEach(freeze); Object.freeze(value);
        }
        return value;
    };
    function dangerous(value, seen = new WeakSet()) {
        if (!value || typeof value !== 'object' || seen.has(value)) return false;
        seen.add(value);
        return Object.keys(value).some(key => FORBIDDEN.has(key))
            || Object.values(value).some(child => dangerous(child, seen));
    }
    const operation = (ok, reasonCode, value = null) => freeze({ ok, reasonCode, value });
    function validateInput(input) {
        if (!input || dangerous(input)) return operation(false, 'INVALID_REPLAY_INPUT');
        const { request, analysisResult, selection, source } = input;
        if (!request?.requestId || analysisResult?.requestId !== request.requestId
            || selection?.requestId !== request.requestId || selection?.runId !== analysisResult?.runId
            || !['complete', 'partial'].includes(analysisResult?.status)
            || !Array.isArray(analysisResult.positions) || analysisResult.positions.length > 32
            || !Array.isArray(selection?.selectedMoments) || selection.selectedMoments.length > MAX_STEPS
            || selection.selectedCount !== selection.selectedMoments.length
            || !source || !Array.isArray(source.moves?.history || source.moves)
            || (source.moves?.history || source.moves).length > MAX_MOVES)
            return operation(false, 'INVALID_REPLAY_INPUT');
        return operation(true, 'REPLAY_INPUT_VALID', input);
    }
    function buildPositionMap(source, ChessFactory = global.Chess) {
        if (typeof ChessFactory !== 'function') return operation(false, 'POSITION_RESOLUTION_FAILED');
        const moves = source.moves?.history || source.moves;
        let game;
        try {
            game = new ChessFactory();
            const initialFen = source.position?.initialFen || source.initialFen || null;
            if (initialFen && game.load(initialFen) === false)
                return operation(false, 'POSITION_RESOLUTION_FAILED');
            const positions = [game.fen()];
            for (const move of moves) {
                const played = game.move(typeof move === 'string' ? move : move.san || {
                    from: move.from, to: move.to, promotion: move.promotion || undefined
                });
                if (!played) return operation(false, 'POSITION_RESOLUTION_FAILED');
                positions.push(game.fen());
            }
            return operation(true, 'POSITIONS_RESOLVED', freeze(positions));
        } catch (_) { return operation(false, 'POSITION_RESOLUTION_FAILED'); }
    }
    global.CaissaGuidedReplayContracts = freeze({
        schemaVersion: SCHEMA_VERSION, maxSteps: MAX_STEPS, maxPv: MAX_PV,
        answerPolicies: ANSWER_POLICIES, statuses: STATUSES, validateInput, buildPositionMap
    });
})(typeof window !== 'undefined' ? window : globalThis);
