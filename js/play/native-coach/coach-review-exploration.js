(function installCoachReviewExploration(root) {
    'use strict';

    const SCHEMA_VERSION = '1.0.0';
    let active = null;
    let engineToken = 0;
    const freeze = value => Object.freeze(value);
    const result = (ok, status, reasonCode, value = null) => freeze({ ok, status, reasonCode, value });

    function snapshot() {
        return freeze({
            schemaVersion: SCHEMA_VERSION,
            active: !!active,
            baseFen: active?.baseFen || null,
            currentFen: active?.game?.fen?.() || null,
            temporaryPlyCount: active?.moves?.length || 0,
            engineEnabled: active?.engineEnabled === true,
            reviewPlyOwner: 'AnalyzeSection.currentMoveIndex'
        });
    }

    function emitPosition(move = null) {
        if (!active) return;
        root.App?.board?.position?.(active.game.fen(), false);
        root.App?.boardAdapter?.setLastMove?.(move?.from && move?.to ? { from: move.from, to: move.to } : null);
        active.onPosition?.(freeze({ fen: active.game.fen(), move: move ? freeze({ ...move }) : null }));
        if (active.engineEnabled) analyzeCurrentPosition();
    }

    function toReadablePv(fen, pv) {
        if (!Array.isArray(pv) || !pv.length || !root.Chess) return [];
        try {
            const game = new root.Chess();
            if (game.load(fen) === false) return [];
            const line = [];
            for (const uci of pv.slice(0, 8)) {
                if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/i.test(uci)) break;
                const move = game.move({ from: uci.slice(0, 2), to: uci.slice(2, 4),
                    promotion: uci.slice(4, 5) || undefined });
                if (!move) break;
                line.push(move.san);
            }
            return line;
        } catch (_) {
            return [];
        }
    }

    async function analyzeCurrentPosition() {
        if (!active?.engineEnabled) return;
        const state = active;
        const fen = state.game.fen();
        const token = ++engineToken;
        state.onAnalysis?.(freeze({ status: 'loading', evaluation: null, mate: null, pv: freeze([]) }));
        const engine = await state.analyze?.ensureAnalysisEngine?.();
        if (!active || active !== state || !state.engineEnabled || token !== engineToken || !engine) {
            if (active === state && state.engineEnabled && token === engineToken)
                state.onAnalysis?.(freeze({ status: 'unavailable', evaluation: null, mate: null, pv: freeze([]) }));
            return;
        }
        engine.stopAnalysis?.();
        engine.startAnalysis(fen, info => {
            if (!active || active !== state || !state.engineEnabled || token !== engineToken
                || state.game.fen() !== fen) return;
            state.onAnalysis?.(freeze({
                status: 'ready',
                evaluation: Number.isFinite(info?.score) ? info.score : null,
                mate: Number.isFinite(info?.mate) ? info.mate : null,
                pv: freeze(toReadablePv(fen, info?.pv))
            }));
        }, 14);
    }

    function setEngineEnabled(enabled) {
        if (!active) return result(false, 'rejected', 'EXPLORATION_NOT_ACTIVE');
        active.engineEnabled = enabled === true;
        engineToken += 1;
        if (!active.engineEnabled) {
            active.analyze?.analysisEngine?.stopAnalysis?.();
            active.onAnalysis?.(freeze({ status: 'off', evaluation: null, mate: null, pv: freeze([]) }));
        } else {
            analyzeCurrentPosition();
        }
        return result(true, 'accepted', active.engineEnabled ? 'ENGINE_ENABLED' : 'ENGINE_DISABLED', snapshot());
    }

    function enter(options = {}) {
        if (active || !root.Chess || !options.analyze || typeof options.fen !== 'string')
            return result(false, 'rejected', active ? 'EXPLORATION_ALREADY_ACTIVE' : 'INVALID_EXPLORATION_ENTRY');
        try {
            const game = new root.Chess();
            if (game.load(options.fen) === false) return result(false, 'rejected', 'INVALID_EXPLORATION_FEN');
            active = {
                game, baseFen: options.fen, moves: [], engineEnabled: false,
                analyze: options.analyze, onPosition: options.onPosition, onAnalysis: options.onAnalysis,
                restore: options.restore
            };
            root.document.body?.classList?.add('caissa-coach-review-exploration-active');
            root.App?.boardAdapter?.setInteractionEnabled?.(true);
            root.App?.boardAdapter?.clearSelection?.();
            root.App?.boardAdapter?.clearLegalTargets?.();
            emitPosition();
            setEngineEnabled(true);
            return result(true, 'accepted', 'EXPLORATION_ENTERED', snapshot());
        } catch (_) {
            active = null;
            return result(false, 'rejected', 'INVALID_EXPLORATION_FEN');
        }
    }

    function leave() {
        if (!active) return result(true, 'unchanged', 'EXPLORATION_ALREADY_CLOSED');
        const state = active;
        engineToken += 1;
        state.analyze?.analysisEngine?.stopAnalysis?.();
        state.analyze?.teardownAnalysisEngine?.('coach-review-exploration-exit');
        active = null;
        root.document.body?.classList?.remove('caissa-coach-review-exploration-active');
        root.App?.boardAdapter?.setInteractionEnabled?.(false);
        root.App?.boardAdapter?.clearSelection?.();
        root.App?.boardAdapter?.clearLegalTargets?.();
        state.restore?.();
        return result(true, 'accepted', 'EXPLORATION_CLOSED', snapshot());
    }

    function movesFrom(square) {
        if (!active || typeof square !== 'string') return [];
        return active.game.moves({ square, verbose: true }).map(move => ({ ...move }));
    }

    function pieceAt(square) {
        const piece = active?.game?.get?.(square);
        return piece ? freeze({ ...piece }) : null;
    }

    function canStartMove(square) {
        if (!active) return false;
        const piece = active.game.get(square);
        return !!piece && piece.color === active.game.turn() && !active.game.game_over();
    }

    function playMove(from, to, promotion) {
        if (!active) return false;
        const move = active.game.move({ from, to, promotion });
        if (!move) return false;
        active.moves.push(freeze({ ...move }));
        root.App?.boardAdapter?.clearSelection?.();
        root.App?.boardAdapter?.clearLegalTargets?.();
        emitPosition(move);
        return true;
    }

    function restoreBoard() {
        if (!active) return false;
        emitPosition(active.moves.at(-1) || null);
        return true;
    }

    root.CaissaCoachReviewExploration = freeze({
        schemaVersion: SCHEMA_VERSION, enter, leave, setEngineEnabled, analyzeCurrentPosition,
        movesFrom, pieceAt, canStartMove, playMove, restoreBoard, getFen: () => active?.game?.fen?.() || null,
        isActive: () => !!active, getSnapshot: snapshot
    });
})(typeof window !== 'undefined' ? window : globalThis);
