(function installEducationalAnalysisContracts(global) {
    'use strict';
    const SCHEMA_VERSION = '1.1.0';
    const MAX_MOVES = 10000; const MAX_PGN = 1000000; const MAX_PV = 16;
    const freeze = value => {
        if (value && typeof value === 'object' && !Object.isFrozen(value)) {
            Object.values(value).forEach(freeze); Object.freeze(value);
        }
        return value;
    };
    const forbidden = new Set(['__proto__', 'prototype', 'constructor']);
    function dangerous(value, seen = new WeakSet()) {
        if (!value || typeof value !== 'object' || seen.has(value)) return false;
        seen.add(value);
        return Object.keys(value).some(key => forbidden.has(key))
            || Object.values(value).some(child => dangerous(child, seen));
    }
    const copy = value => JSON.parse(JSON.stringify(value));
    const fail = reasonCode => freeze({ ok: false, reasonCode, value: null });
    function normalizeSource(request, payload) {
        if (!request || !payload || dangerous(request) || dangerous(payload))
            return fail(dangerous(request) || dangerous(payload) ? 'INVALID_INPUT' : 'SOURCE_UNAVAILABLE');
        if (request.source.type === 'imported-game') {
            if (payload.imported !== true || !payload.analyzeSessionId)
                return fail('SOURCE_UNAVAILABLE');
            if (!Array.isArray(payload.moves) && typeof payload.pgn !== 'string')
                return fail('SOURCE_UNAVAILABLE');
        } else {
            const validation = global.CaissaGameRecord?.validate?.(payload);
            if (!validation?.valid || payload.result?.complete !== true
                || !['completed', 'aborted'].includes(payload.status) || payload.pendingPromotion)
                return fail('GAME_NORMALIZATION_FAILED');
        }
        const moves = Array.isArray(payload.moves?.history) ? payload.moves.history
            : Array.isArray(payload.moves) ? payload.moves : [];
        const pgn = payload.notation?.pgn ?? payload.pgn ?? null;
        if (moves.length > MAX_MOVES || (pgn !== null && (typeof pgn !== 'string' || pgn.length > MAX_PGN)))
            return fail('GAME_NORMALIZATION_FAILED');
        return freeze({ ok: true, reasonCode: 'SOURCE_NORMALIZED', value: freeze({
            schemaVersion: SCHEMA_VERSION, sourceType: request.source.type,
            initialFen: payload.position?.initialFen ?? payload.initialFen ?? null,
            moves: freeze(copy(moves)), pgn,
            result: payload.result?.value ?? payload.result ?? null,
            termination: payload.result?.termination ?? payload.termination ?? null,
            playerColor: payload.player?.color ?? payload.playerColor ?? null,
            mode: payload.mode ?? 'analysis', opponentType: payload.opponent?.type ?? null,
            opponentId: payload.opponent?.id ?? null,
            hasResultMismatch: payload.notation?.hasResultMismatch === true
        }) });
    }
    function generatePositions(input, policy, ChessFactory = global.Chess) {
        if (typeof ChessFactory !== 'function' || !input || !policy || dangerous(input) || dangerous(policy))
            return fail('POSITION_REPLAY_FAILED');
        let game;
        try {
            game = new ChessFactory();
            if (input.initialFen && game.load(input.initialFen) === false) return fail('POSITION_REPLAY_FAILED');
        } catch (_) { return fail('POSITION_REPLAY_FAILED'); }
        const all = [];
        const material = () => {
            const values = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
            let white = 0; let black = 0; let nonPawn = 0; let queens = 0;
            const board = typeof game.board === 'function' ? game.board() : [];
            board.flat().filter(Boolean).forEach(piece => {
                const value = values[piece.type] || 0;
                if (piece.color === 'w') white += value; else black += value;
                if (!['p', 'k'].includes(piece.type)) nonPawn += value;
                if (piece.type === 'q') queens += 1;
            });
            return { white, black, whiteMinusBlack: white - black, nonPawn, queens };
        };
        const classifyPhase = (ply, fen, tally) => {
            if (tally.queens === 0 && tally.nonPawn <= 20) return 'endgame';
            const castling = fen.split(' ')[2] || '-';
            if (ply <= 20 && tally.nonPawn >= 52 && castling !== '-') return 'opening';
            return 'middlegame';
        };
        const add = (ply, move) => {
            const fen = game.fen();
            const tally = material();
            all.push({ schemaVersion: SCHEMA_VERSION, positionId: `position:${ply}`,
                ply, fen, move: move?.san || move || null,
                playedMove: move ? {
                    uci: move.from && move.to ? `${move.from}${move.to}${move.promotion || ''}` : null,
                    san: move.san || null
                } : null,
                mover: move?.color === 'b' ? 'black' : move?.color === 'w' ? 'white' : null,
                sideToMove: fen.split(' ')[1] === 'b' ? 'black' : 'white',
                phaseHint: classifyPhase(ply, fen, tally), material: tally,
                isTerminal: !!(game.game_over?.() || game.isGameOver?.()) });
        };
        add(0, null);
        try {
            for (let index = 0; index < input.moves.length; index += 1) {
                const move = input.moves[index];
                const played = game.move(typeof move === 'string' ? move : move.san || {
                    from: move.from, to: move.to, promotion: move.promotion || undefined
                });
                if (!played) return fail('POSITION_REPLAY_FAILED');
                add(index + 1, played);
            }
        } catch (_) { return fail('POSITION_REPLAY_FAILED'); }
        const limit = Math.max(1, policy.maximumPositions);
        let sampled = all;
        if (all.length > limit) {
            const indices = new Set([0, all.length - 1]);
            const stride = (all.length - 1) / (limit - 1);
            for (let i = 1; i < limit - 1; i += 1) indices.add(Math.round(i * stride));
            sampled = [...indices].sort((a, b) => a - b).map(index => all[index]);
        }
        return freeze({ ok: true, reasonCode: 'POSITIONS_GENERATED',
            value: freeze(sampled.map(item => freeze({ ...item }))) });
    }
    function normalizePositionResult(raw, correlation) {
        if (!raw || dangerous(raw) || dangerous(correlation) || raw.stale === true)
            return fail(raw?.stale ? 'STALE_ENGINE_RESPONSE' : 'RESULT_NORMALIZATION_FAILED');
        const pv = Array.isArray(raw.pv) ? raw.pv.filter(move =>
            typeof move === 'string' && /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(move)).slice(0, MAX_PV) : [];
        const score = Number.isFinite(raw.score) ? Math.round(raw.score * 100) : null;
        const mate = Number.isInteger(raw.mate) ? raw.mate : null;
        if (score === null && mate === null) return fail('RESULT_NORMALIZATION_FAILED');
        return freeze({ ok: true, reasonCode: 'POSITION_RESULT_NORMALIZED', value: freeze({
            schemaVersion: SCHEMA_VERSION, runId: correlation.runId,
            positionId: correlation.positionId, ply: correlation.ply, status: 'completed',
            evaluation: freeze({ type: mate !== null ? 'mate' : 'cp', cp: score, mate,
                perspective: 'white' }),
            bestMove: freeze({ uci: /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(raw.bestMove || '')
                ? raw.bestMove : pv[0] || null }),
            principalVariation: freeze(pv), depthReached: Number.isInteger(raw.depth) ? raw.depth : null,
            nodes: Number.isSafeInteger(raw.nodes) ? raw.nodes : null,
            elapsedMs: Number.isFinite(raw.elapsedMs) ? Math.max(0, raw.elapsedMs) : null,
            playedMove: correlation.playedMove ? freeze(copy(correlation.playedMove)) : null,
            mover: ['white', 'black'].includes(correlation.mover) ? correlation.mover : null,
            sideToMove: ['white', 'black'].includes(correlation.sideToMove) ? correlation.sideToMove : null,
            phase: ['opening', 'middlegame', 'endgame'].includes(correlation.phase) ? correlation.phase : null,
            material: correlation.material ? freeze(copy(correlation.material)) : null,
            terminal: correlation.terminal === true,
            source: 'approved-engine-adapter', reasonCode: 'TECHNICAL_EVALUATION_AVAILABLE'
        }) });
    }
    global.CaissaEducationalAnalysisContracts = freeze({
        schemaVersion: SCHEMA_VERSION, limits: freeze({ maxMoves: MAX_MOVES, maxPgn: MAX_PGN, maxPv: MAX_PV }),
        normalizeSource, generatePositions, normalizePositionResult
    });
})(typeof window !== 'undefined' ? window : globalThis);
