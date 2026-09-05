(function installBotsAnalysisExploration(root) {
    'use strict';

    const SCHEMA_VERSION = '1.0.0';
    const ANALYSIS_DEPTH = 14;
    const freeze = value => Object.freeze(value);
    const result = (ok, status, reasonCode, value = null) => freeze({ ok, status, reasonCode, value });
    let active = null;
    let engineToken = 0;

    function snapshot() {
        const cursor = active?.cursor || 0; const count = active?.moves?.length || 0;
        return freeze({ schemaVersion: SCHEMA_VERSION, active: !!active, baseFen: active?.baseFen || null,
            currentFen: active?.game?.fen?.() || null, temporaryPlyCount: count, cursor,
            atFirst: cursor === 0, atLast: cursor === count, engineEnabled: active?.engineEnabled === true,
            engineRequests: active?.engineRequests || 0, entryReviewPly: active?.entryReviewPly ?? null,
            reviewPlyOwner: 'AnalyzeSection.currentMoveIndex', temporaryOwner: 'CaissaBotsAnalysisExploration' });
    }

    function currentMove() { return active?.cursor > 0 ? active.moves[active.cursor - 1] : null; }
    function readablePv(fen, pv) {
        if (!Array.isArray(pv) || !pv.length || !root.Chess) return [];
        try {
            const game = new root.Chess(); if (game.load(fen) === false) return [];
            const line = [];
            for (const uci of pv.slice(0, 8)) {
                if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/i.test(uci)) break;
                const move = game.move({ from: uci.slice(0, 2), to: uci.slice(2, 4),
                    promotion: uci.slice(4, 5) || undefined });
                if (!move) break; line.push(move.san);
            }
            return line;
        } catch (_) { return []; }
    }

    async function analyzeCurrentPosition() {
        if (!active?.engineEnabled) return;
        const state = active; const fen = state.game.fen(); const token = ++engineToken;
        state.engineRequests += 1;
        state.onAnalysis?.(freeze({ status: 'loading', ...state.lastAnalysis }));
        const engine = await state.analyze?.ensureAnalysisEngine?.();
        if (!active || active !== state || !state.engineEnabled || token !== engineToken || !engine) return;
        engine.stopAnalysis?.();
        engine.startAnalysis(fen, info => {
            if (!active || active !== state || !state.engineEnabled || token !== engineToken || state.game.fen() !== fen) return;
            state.lastAnalysis = freeze({ evaluation: Number.isFinite(info?.score) ? info.score : null,
                mate: Number.isFinite(info?.mate) ? info.mate : null, pv: freeze(readablePv(fen, info?.pv)) });
            state.onAnalysis?.(freeze({ status: 'ready', ...state.lastAnalysis }));
        }, ANALYSIS_DEPTH);
    }

    function emitPosition() {
        if (!active) return;
        const move = currentMove(); const fen = active.game.fen();
        root.App?.board?.position?.(fen, false);
        root.App?.boardAdapter?.setLastMove?.(move?.from && move?.to ? { from: move.from, to: move.to } : null);
        active.onPosition?.(freeze({ fen, move: move ? freeze({ ...move }) : null,
            cursor: active.cursor, temporaryPlyCount: active.moves.length }));
        if (active.engineEnabled) analyzeCurrentPosition();
    }

    function enter(options = {}) {
        if (active || !root.Chess || !options.analyze || typeof options.fen !== 'string'
            || !Number.isInteger(options.entryReviewPly))
            return result(false, 'rejected', active ? 'EXPLORATION_ALREADY_ACTIVE' : 'INVALID_EXPLORATION_ENTRY');
        try {
            const game = new root.Chess(); if (game.load(options.fen) === false)
                return result(false, 'rejected', 'INVALID_EXPLORATION_FEN');
            active = { game, baseFen: options.fen, moves: [], positions: [options.fen], cursor: 0,
                engineEnabled: false, engineRequests: 0, entryReviewPly: options.entryReviewPly,
                analyze: options.analyze, onPosition: options.onPosition, onAnalysis: options.onAnalysis,
                restore: options.restore, lastAnalysis: freeze({ evaluation: null, mate: null, pv: freeze([]) }) };
            root.document.body?.classList?.add('caissa-bots-analysis-exploration-active');
            root.App?.boardAdapter?.setInteractionEnabled?.(true);
            root.App?.boardAdapter?.clearSelection?.(); root.App?.boardAdapter?.clearLegalTargets?.();
            emitPosition(); setEngineEnabled(true);
            return result(true, 'accepted', 'EXPLORATION_ENTERED', snapshot());
        } catch (_) { active = null; return result(false, 'rejected', 'INVALID_EXPLORATION_FEN'); }
    }

    function leave() {
        if (!active) return result(true, 'unchanged', 'EXPLORATION_ALREADY_CLOSED');
        const state = active; engineToken += 1; state.analyze?.analysisEngine?.stopAnalysis?.();
        state.analyze?.teardownAnalysisEngine?.('bots-analysis-exploration-exit'); active = null;
        root.document.body?.classList?.remove('caissa-bots-analysis-exploration-active');
        root.App?.boardAdapter?.setInteractionEnabled?.(false);
        root.App?.boardAdapter?.clearSelection?.(); root.App?.boardAdapter?.clearLegalTargets?.(); state.restore?.();
        return result(true, 'accepted', 'EXPLORATION_CLOSED', snapshot());
    }

    function setEngineEnabled(enabled) {
        if (!active) return result(false, 'rejected', 'EXPLORATION_NOT_ACTIVE');
        active.engineEnabled = enabled === true; engineToken += 1;
        if (active.engineEnabled) analyzeCurrentPosition();
        else {
            active.analyze?.analysisEngine?.stopAnalysis?.();
            active.onAnalysis?.(freeze({ status: 'off', ...active.lastAnalysis }));
        }
        return result(true, 'accepted', active.engineEnabled ? 'ENGINE_ENABLED' : 'ENGINE_DISABLED', snapshot());
    }

    function movesFrom(square) {
        return !active || typeof square !== 'string' ? []
            : active.game.moves({ square, verbose: true }).map(move => ({ ...move }));
    }
    function pieceAt(square) { const piece = active?.game?.get?.(square); return piece ? freeze({ ...piece }) : null; }
    function canStartMove(square) {
        const piece = active?.game?.get?.(square);
        return !!piece && piece.color === active.game.turn() && !active.game.game_over();
    }
    function playMove(from, to, promotion) {
        if (!active) return false;
        const move = active.game.move({ from, to, promotion }); if (!move) return false;
        if (active.cursor < active.moves.length) {
            active.moves.splice(active.cursor); active.positions.splice(active.cursor + 1);
        }
        active.moves.push(freeze({ ...move })); active.cursor += 1; active.positions.push(active.game.fen());
        root.App?.boardAdapter?.clearSelection?.(); root.App?.boardAdapter?.clearLegalTargets?.(); emitPosition(); return true;
    }
    function goTo(cursor) {
        if (!active || !Number.isInteger(cursor) || cursor < 0 || cursor > active.moves.length)
            return result(false, 'rejected', 'INVALID_EXPLORATION_CURSOR', snapshot());
        if (cursor === active.cursor) return result(true, 'unchanged', 'EXPLORATION_CURSOR_UNCHANGED', snapshot());
        if (active.game.load(active.positions[cursor]) === false)
            return result(false, 'rejected', 'INVALID_EXPLORATION_POSITION', snapshot());
        active.cursor = cursor; root.App?.boardAdapter?.clearSelection?.();
        root.App?.boardAdapter?.clearLegalTargets?.(); emitPosition();
        return result(true, 'accepted', 'EXPLORATION_CURSOR_CHANGED', snapshot());
    }
    function getLine() {
        if (!active) return freeze([]);
        const fields = active.baseFen.split(/\s+/); const blackStart = fields[1] === 'b';
        const firstNumber = Number.parseInt(fields[5], 10) || 1;
        return freeze(active.moves.map((move, index) => freeze({ index, san: move.san, color: move.color,
            from: move.from, to: move.to, promotion: move.promotion || null,
            moveNumber: firstNumber + Math.floor((index + (blackStart ? 1 : 0)) / 2),
            current: active.cursor === index + 1, future: index >= active.cursor })));
    }
    function restoreBoard() { if (!active) return false; emitPosition(); return true; }

    root.CaissaBotsAnalysisExploration = freeze({ schemaVersion: SCHEMA_VERSION, enter, leave,
        setEngineEnabled, analyzeCurrentPosition, goTo, first: () => goTo(0),
        previous: () => goTo(Math.max(0, (active?.cursor || 0) - 1)),
        next: () => goTo(Math.min(active?.moves?.length || 0, (active?.cursor || 0) + 1)),
        last: () => goTo(active?.moves?.length || 0), getLine, movesFrom, pieceAt, canStartMove, playMove,
        restoreBoard, getFen: () => active?.game?.fen?.() || null, isActive: () => !!active, getSnapshot: snapshot });
})(typeof window !== 'undefined' ? window : globalThis);
