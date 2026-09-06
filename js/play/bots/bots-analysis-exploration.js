(function installBotsAnalysisExploration(root) {
    'use strict';

    const SCHEMA_VERSION = '1.2.0';
    const ANALYSIS_DEPTH = 14;
    const freeze = value => Object.freeze(value);
    const result = (ok, status, reasonCode, value = null) => freeze({ ok, status, reasonCode, value });
    let active = null;
    let engineToken = 0;

    function snapshot() {
        const temporaryCursor = active?.temporaryCursor || 0; const count = active?.moves?.length || 0;
        const sourceCursor = active?.sourceCursor || 0; const sourceCount = active?.sourceMoves?.length || 0;
        const browsingTemporary = active?.mode === 'temporary';
        return freeze({ schemaVersion: SCHEMA_VERSION, active: !!active, baseFen: active?.baseFen || null,
            currentFen: active?.game?.fen?.() || null, temporaryPlyCount: count,
            cursor: browsingTemporary ? temporaryCursor : sourceCursor, mode: active?.mode || null,
            sourceCursor, sourcePlyCount: sourceCount, temporaryCursor,
            branchSourceCursor: active?.branchSourceCursor ?? null,
            atFirst: browsingTemporary ? temporaryCursor === 0 : sourceCursor === 0,
            atLast: browsingTemporary ? temporaryCursor === count : sourceCursor === sourceCount,
            engineEnabled: active?.engineEnabled === true,
            engineRequests: active?.engineRequests || 0, entryReviewPly: active?.entryReviewPly ?? null,
            reviewPlyOwner: 'AnalyzeSection.currentMoveIndex',
            temporaryOwner: active?.temporaryOwner || 'CaissaBotsAnalysisExploration' });
    }

    function currentMove() {
        if (!active) return null;
        return active.mode === 'temporary'
            ? (active.temporaryCursor > 0 ? active.moves[active.temporaryCursor - 1] : null)
            : (active.sourceCursor > 0 ? active.sourceMoves[active.sourceCursor - 1] : null);
    }

    function loadGame(fen) {
        const game = new root.Chess();
        return game.load(fen) === false ? null : game;
    }

    function buildSource(initialFen, moves) {
        const game = loadGame(initialFen); if (!game) return null;
        const positions = [game.fen()]; const normalized = [];
        for (const candidate of moves) {
            const move = game.move(candidate?.san || candidate); if (!move) return null;
            normalized.push(freeze({ ...move })); positions.push(game.fen());
        }
        return { moves: normalized, positions };
    }
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
            mode: active.mode, sourceCursor: active.sourceCursor, temporaryCursor: active.temporaryCursor,
            branchSourceCursor: active.branchSourceCursor, temporaryPlyCount: active.moves.length }));
        if (active.engineEnabled) analyzeCurrentPosition();
    }

    function enter(options = {}) {
        if (active || !root.Chess || !options.analyze || typeof options.fen !== 'string'
            || !Number.isInteger(options.entryReviewPly))
            return result(false, 'rejected', active ? 'EXPLORATION_ALREADY_ACTIVE' : 'INVALID_EXPLORATION_ENTRY');
        try {
            const initialFen = typeof options.sourceInitialFen === 'string' ? options.sourceInitialFen : options.fen;
            const source = buildSource(initialFen, Array.isArray(options.sourceMoves) ? options.sourceMoves : []);
            if (!source)
                return result(false, 'rejected', 'INVALID_EXPLORATION_FEN');
            const sourceCursor = Math.max(0, Math.min(Number.isInteger(options.sourceCursor)
                ? options.sourceCursor : source.moves.length, source.moves.length));
            const game = loadGame(source.positions[sourceCursor]); if (!game)
                return result(false, 'rejected', 'INVALID_EXPLORATION_FEN');
            active = { game, baseFen: source.positions[sourceCursor], sourceInitialFen: initialFen,
                sourceMoves: source.moves, sourcePositions: source.positions, sourceCursor, mode: 'source',
                moves: [], positions: [source.positions[sourceCursor]], temporaryCursor: 0, branchSourceCursor: null,
                engineEnabled: false, engineRequests: 0, entryReviewPly: options.entryReviewPly,
                analyze: options.analyze, onPosition: options.onPosition, onAnalysis: options.onAnalysis,
                restore: options.restore, lastAnalysis: freeze({ evaluation: null, mate: null, pv: freeze([]) }),
                temporaryOwner: options.temporaryOwner || 'CaissaBotsAnalysisExploration',
                bodyClass: options.bodyClass || 'caissa-bots-analysis-exploration-active',
                teardownReason: options.teardownReason || 'bots-analysis-exploration-exit' };
            root.document.body?.classList?.add(active.bodyClass);
            root.App?.boardAdapter?.setInteractionEnabled?.(true);
            root.App?.boardAdapter?.clearSelection?.(); root.App?.boardAdapter?.clearLegalTargets?.();
            emitPosition(); setEngineEnabled(true);
            return result(true, 'accepted', 'EXPLORATION_ENTERED', snapshot());
        } catch (_) { active = null; return result(false, 'rejected', 'INVALID_EXPLORATION_FEN'); }
    }

    function leave() {
        if (!active) return result(true, 'unchanged', 'EXPLORATION_ALREADY_CLOSED');
        const state = active; engineToken += 1; state.analyze?.analysisEngine?.stopAnalysis?.();
        state.analyze?.teardownAnalysisEngine?.(state.teardownReason);
        root.document.body?.classList?.remove(state.bodyClass); active = null;
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
        if (active.mode === 'source') {
            active.branchSourceCursor = active.sourceCursor; active.baseFen = active.sourcePositions[active.sourceCursor];
            active.moves = []; active.positions = [active.baseFen]; active.temporaryCursor = 0;
        } else if (active.temporaryCursor < active.moves.length) {
            active.moves.splice(active.temporaryCursor); active.positions.splice(active.temporaryCursor + 1);
        }
        active.mode = 'temporary'; active.moves.push(freeze({ ...move })); active.temporaryCursor += 1;
        active.positions.push(active.game.fen());
        root.App?.boardAdapter?.clearSelection?.(); root.App?.boardAdapter?.clearLegalTargets?.(); emitPosition(); return true;
    }
    function goToTemporary(cursor) {
        if (!active || !Number.isInteger(cursor) || cursor < 0 || cursor > active.moves.length)
            return result(false, 'rejected', 'INVALID_EXPLORATION_CURSOR', snapshot());
        if (active.mode === 'temporary' && cursor === active.temporaryCursor)
            return result(true, 'unchanged', 'EXPLORATION_CURSOR_UNCHANGED', snapshot());
        if (active.game.load(active.positions[cursor]) === false)
            return result(false, 'rejected', 'INVALID_EXPLORATION_POSITION', snapshot());
        active.mode = 'temporary'; active.temporaryCursor = cursor; root.App?.boardAdapter?.clearSelection?.();
        root.App?.boardAdapter?.clearLegalTargets?.(); emitPosition();
        return result(true, 'accepted', 'EXPLORATION_CURSOR_CHANGED', snapshot());
    }
    function goToSource(cursor) {
        if (!active || !Number.isInteger(cursor) || cursor < 0 || cursor > active.sourceMoves.length)
            return result(false, 'rejected', 'INVALID_SOURCE_CURSOR', snapshot());
        if (active.mode === 'source' && cursor === active.sourceCursor)
            return result(true, 'unchanged', 'SOURCE_CURSOR_UNCHANGED', snapshot());
        if (active.game.load(active.sourcePositions[cursor]) === false)
            return result(false, 'rejected', 'INVALID_SOURCE_POSITION', snapshot());
        active.mode = 'source'; active.sourceCursor = cursor; root.App?.boardAdapter?.clearSelection?.();
        root.App?.boardAdapter?.clearLegalTargets?.(); emitPosition();
        return result(true, 'accepted', 'SOURCE_CURSOR_CHANGED', snapshot());
    }
    function getLine() {
        if (!active) return freeze([]);
        const fields = active.baseFen.split(/\s+/); const blackStart = fields[1] === 'b';
        const firstNumber = Number.parseInt(fields[5], 10) || 1;
        return freeze(active.moves.map((move, index) => freeze({ index, san: move.san, color: move.color,
            from: move.from, to: move.to, promotion: move.promotion || null,
            moveNumber: firstNumber + Math.floor((index + (blackStart ? 1 : 0)) / 2),
            current: active.mode === 'temporary' && active.temporaryCursor === index + 1,
            future: active.mode !== 'temporary' || index >= active.temporaryCursor })));
    }
    function getSourceLine() {
        if (!active) return freeze([]);
        const fields = active.sourceInitialFen.split(/\s+/); const blackStart = fields[1] === 'b';
        const firstNumber = Number.parseInt(fields[5], 10) || 1;
        return freeze(active.sourceMoves.map((move, index) => freeze({ index, san: move.san, color: move.color,
            from: move.from, to: move.to, promotion: move.promotion || null,
            moveNumber: firstNumber + Math.floor((index + (blackStart ? 1 : 0)) / 2),
            current: active.mode === 'source' && active.sourceCursor === index + 1,
            branchAnchor: active.moves.length > 0 && active.branchSourceCursor === index + 1,
            future: active.mode === 'source' && index >= active.sourceCursor })));
    }
    function first() { return active?.mode === 'temporary' ? goToTemporary(0) : goToSource(0); }
    function previous() { return active?.mode === 'temporary'
        ? goToTemporary(Math.max(0, active.temporaryCursor - 1))
        : goToSource(Math.max(0, active.sourceCursor - 1)); }
    function next() { return active?.mode === 'temporary'
        ? goToTemporary(Math.min(active.moves.length, active.temporaryCursor + 1))
        : goToSource(Math.min(active.sourceMoves.length, active.sourceCursor + 1)); }
    function last() { return active?.mode === 'temporary'
        ? goToTemporary(active.moves.length) : goToSource(active.sourceMoves.length); }
    function restoreBoard() { if (!active) return false; emitPosition(); return true; }

    root.CaissaBotsAnalysisExploration = freeze({ schemaVersion: SCHEMA_VERSION, enter, leave,
        setEngineEnabled, analyzeCurrentPosition, goTo: goToTemporary, goToTemporary, goToSource,
        first, previous, next, last, getLine, getSourceLine, movesFrom, pieceAt, canStartMove, playMove,
        restoreBoard, getFen: () => active?.game?.fen?.() || null, isActive: () => !!active, getSnapshot: snapshot });
})(typeof window !== 'undefined' ? window : globalThis);
