(function installCoachReviewExploration(root) {
    'use strict';

    const SCHEMA_VERSION = '1.4.0';
    const freeze = value => Object.freeze(value);
    const EFFORT_PRESETS = freeze({
        quick: freeze({ id: 'quick', label: 'Quick', depth: 10 }),
        balanced: freeze({ id: 'balanced', label: 'Balanced', depth: 14 }),
        deep: freeze({ id: 'deep', label: 'Deep', depth: 18 })
    });
    let effortPresetId = 'balanced';
    let active = null;
    let engineToken = 0;
    const result = (ok, status, reasonCode, value = null) => freeze({ ok, status, reasonCode, value });

    function renderedBoardFen() {
        const adapter = root.App?.boardAdapter;
        const board = adapter?.getSnapshot?.() || null;
        return adapter?.getPosition?.() || board?.positionFen || board?.renderedFen || null;
    }

    function alignment(state, fen, engine = state?.analyze?.analysisEngine) {
        const engineFen = engine?.currentFen || null;
        const sandboxFen = state?.game?.fen?.() || null;
        const renderedFen = renderedBoardFen();
        return freeze({
            engineFen,
            sandboxFen,
            renderedFen,
            aligned: engineFen === fen && sandboxFen === fen && renderedFen === fen
        });
    }

    function analysisState(status, fen, values = {}) {
        return freeze({
            status,
            requestFen: fen || null,
            generationId: values.generationId || null,
            engineFen: values.engineFen || null,
            sandboxFen: values.sandboxFen || fen || null,
            renderedFen: values.renderedFen || null,
            aligned: values.aligned === true,
            evaluation: Number.isFinite(values.evaluation) ? values.evaluation : null,
            mate: Number.isFinite(values.mate) ? values.mate : null,
            bestMove: values.bestMove || null,
            bestMoveSan: values.bestMoveSan || null,
            pv: freeze([...(values.pv || [])]),
            depth: Number.isFinite(values.depth) ? values.depth : null
        });
    }

    function publishAnalysis(state, analysis) {
        if (!state) return;
        state.analysis = analysis;
        state.onAnalysis?.(analysis);
    }

    function cancelAnalysis(state) {
        const engine = state?.analyze?.analysisEngine;
        const canceled = engine?.cancelAttributedSearch?.();
        if (!canceled) engine?.stopAnalysis?.();
    }

    function snapshot() {
        const cursor = active?.cursor || 0;
        const temporaryPlyCount = active?.moves?.length || 0;
        return freeze({
            schemaVersion: SCHEMA_VERSION,
            active: !!active,
            baseFen: active?.baseFen || null,
            currentFen: active?.game?.fen?.() || null,
            temporaryPlyCount,
            cursor,
            atFirst: cursor === 0,
            atLast: cursor === temporaryPlyCount,
            engineEnabled: active?.engineEnabled === true,
            engineRequests: active?.engineRequests || 0,
            acceptedResults: active?.acceptedResults || 0,
            staleResults: active?.staleResults || 0,
            analysis: active?.analysis || null,
            effortPresetId,
            analysisDepth: EFFORT_PRESETS[effortPresetId].depth,
            reviewPlyOwner: 'AnalyzeSection.currentMoveIndex'
        });
    }

    function currentMove() {
        return active?.cursor > 0 ? active.moves[active.cursor - 1] : active?.baseMove || null;
    }

    function emitPosition() {
        if (!active) return;
        const move = currentMove();
        const fen = active.game.fen();
        const projected = root.App?.boardAdapter?.setPosition?.(fen, {
            animate: false, reason: 'coach-manual-sandbox'
        });
        if (!projected?.ok) root.App?.board?.position?.(fen, false);
        root.App?.boardAdapter?.setLastMove?.(move?.from && move?.to ? { from: move.from, to: move.to } : null);
        active.onPosition?.(freeze({ fen, renderedFen: renderedBoardFen(),
            move: move ? freeze({ ...move }) : null, cursor: active.cursor,
            temporaryPlyCount: active.moves.length }));
        if (active.engineEnabled) analyzeCurrentPosition();
        else publishAnalysis(active, analysisState('off', fen, {
            sandboxFen: fen, renderedFen: renderedBoardFen()
        }));
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
        state.engineRequests += 1;
        publishAnalysis(state, analysisState('loading', fen, {
            sandboxFen: fen, renderedFen: renderedBoardFen()
        }));
        let engine = null;
        try { engine = await state.analyze?.ensureAnalysisEngine?.(); } catch (_) { engine = null; }
        if (!active || active !== state || !state.engineEnabled || token !== engineToken || !engine) {
            if (active === state && state.engineEnabled && token === engineToken) publishAnalysis(state,
                analysisState('unavailable', fen, { sandboxFen: state.game.fen(), renderedFen: renderedBoardFen() }));
            return;
        }
        let generationId = null;
        let latestInfo = null;
        try {
            generationId = engine.getBestMoveAttributed?.(fen, (bestMove, _ponder, generation) => {
                const aligned = alignment(state, fen, engine);
                if (!active || active !== state || !state.engineEnabled || token !== engineToken
                    || generation !== generationId || !aligned.aligned) {
                    if (active === state) state.staleResults += 1;
                    return;
                }
                const pv = toReadablePv(fen, latestInfo?.pv || (bestMove ? [bestMove] : []));
                const bestMoveSan = toReadablePv(fen, bestMove ? [bestMove] : [])[0] || bestMove || null;
                state.acceptedResults += 1;
                publishAnalysis(state, analysisState('ready', fen, {
                    ...aligned,
                    generationId,
                    evaluation: latestInfo?.score,
                    mate: latestInfo?.mate,
                    bestMove,
                    bestMoveSan,
                    pv,
                    depth: latestInfo?.depth
                }));
            }, {
                depth: EFFORT_PRESETS[effortPresetId].depth,
                multiPv: 1,
                onInfo: (info, generation) => {
                    if (!active || active !== state || !state.engineEnabled || token !== engineToken
                        || generation !== generationId || state.game.fen() !== fen) return;
                    latestInfo = info;
                }
            });
        } catch (_) { generationId = null; }
        if (!generationId) {
            publishAnalysis(state, analysisState('unavailable', fen, {
                sandboxFen: state.game.fen(), renderedFen: renderedBoardFen()
            }));
            return;
        }
        state.analysis = analysisState('loading', fen, {
            generationId, sandboxFen: state.game.fen(), renderedFen: renderedBoardFen()
        });
    }

    function setEffortPreset(presetId) {
        if (!Object.hasOwn(EFFORT_PRESETS, presetId))
            return result(false, 'rejected', 'INVALID_EFFORT_PRESET', snapshot());
        if (effortPresetId === presetId)
            return result(true, 'unchanged', 'EFFORT_PRESET_UNCHANGED', snapshot());
        effortPresetId = presetId;
        if (active?.engineEnabled) analyzeCurrentPosition();
        return result(true, 'accepted', 'EFFORT_PRESET_CHANGED', snapshot());
    }

    function setEngineEnabled(enabled) {
        if (!active) return result(false, 'rejected', 'EXPLORATION_NOT_ACTIVE');
        active.engineEnabled = enabled === true;
        engineToken += 1;
        if (!active.engineEnabled) {
            cancelAnalysis(active);
            const fen = active.game.fen();
            publishAnalysis(active, analysisState('off', fen, {
                sandboxFen: fen, renderedFen: renderedBoardFen()
            }));
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
                game, baseFen: options.fen,
                baseMove: options.move?.from && options.move?.to ? freeze({ from: options.move.from, to: options.move.to }) : null,
                moves: [], positions: [options.fen], cursor: 0, engineEnabled: false,
                engineRequests: 0, acceptedResults: 0, staleResults: 0,
                analysis: analysisState('off', options.fen),
                analyze: options.analyze, onPosition: options.onPosition, onAnalysis: options.onAnalysis,
                restore: options.restore
            };
            root.document.body?.classList?.add('caissa-coach-review-exploration-active');
            root.App?.boardAdapter?.setInteractionEnabled?.(true);
            root.App?.boardAdapter?.clearSelection?.();
            root.App?.boardAdapter?.clearLegalTargets?.();
            emitPosition();
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
        cancelAnalysis(state);
        state.analyze?.teardownAnalysisEngine?.('coach-review-exploration-exit');
        active = null;
        root.document.body?.classList?.remove('caissa-coach-review-exploration-active');
        root.App?.boardAdapter?.setInteractionEnabled?.(false);
        root.App?.boardAdapter?.clearSelection?.();
        root.App?.boardAdapter?.clearLegalTargets?.();
        state.restore?.();
        return result(true, 'accepted', 'EXPLORATION_CLOSED', snapshot());
    }

    function rebase(options = {}) {
        if (!active || typeof options.fen !== 'string')
            return result(false, 'rejected', 'INVALID_EXPLORATION_REBASE', snapshot());
        if (active.game.load(options.fen) === false)
            return result(false, 'rejected', 'INVALID_EXPLORATION_FEN', snapshot());
        active.baseFen = options.fen;
        active.baseMove = options.move?.from && options.move?.to
            ? freeze({ from: options.move.from, to: options.move.to }) : null;
        active.moves = [];
        active.positions = [options.fen];
        active.cursor = 0;
        root.App?.boardAdapter?.clearSelection?.();
        root.App?.boardAdapter?.clearLegalTargets?.();
        emitPosition();
        return result(true, 'accepted', 'EXPLORATION_REBASED', snapshot());
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
        let move = null;
        try { move = active.game.move({ from, to, promotion }); } catch (_) { return false; }
        if (!move) return false;
        if (active.cursor < active.moves.length) {
            active.moves.splice(active.cursor);
            active.positions.splice(active.cursor + 1);
        }
        active.moves.push(freeze({ ...move }));
        active.cursor += 1;
        active.positions.push(active.game.fen());
        root.App?.boardAdapter?.clearSelection?.();
        root.App?.boardAdapter?.clearLegalTargets?.();
        emitPosition();
        return true;
    }

    function goTo(cursor) {
        if (!active || !Number.isInteger(cursor) || cursor < 0 || cursor > active.moves.length)
            return result(false, 'rejected', 'INVALID_EXPLORATION_CURSOR', snapshot());
        if (cursor === active.cursor)
            return result(true, 'unchanged', 'EXPLORATION_CURSOR_UNCHANGED', snapshot());
        if (active.game.load(active.positions[cursor]) === false)
            return result(false, 'rejected', 'INVALID_EXPLORATION_POSITION', snapshot());
        active.cursor = cursor;
        root.App?.boardAdapter?.clearSelection?.();
        root.App?.boardAdapter?.clearLegalTargets?.();
        emitPosition();
        return result(true, 'accepted', 'EXPLORATION_CURSOR_CHANGED', snapshot());
    }

    function getLine() {
        if (!active) return freeze([]);
        const fields = active.baseFen.split(/\s+/);
        const startsWithBlack = fields[1] === 'b';
        const firstMoveNumber = Number.parseInt(fields[5], 10) || 1;
        return freeze(active.moves.map((move, index) => freeze({
            index,
            san: move.san,
            color: move.color,
            from: move.from,
            to: move.to,
            promotion: move.promotion || null,
            moveNumber: firstMoveNumber + Math.floor((index + (startsWithBlack ? 1 : 0)) / 2),
            current: active.cursor === index + 1,
            future: index >= active.cursor
        })));
    }

    function restoreBoard() {
        if (!active) return false;
        emitPosition();
        return true;
    }

    root.CaissaCoachReviewExploration = freeze({
        schemaVersion: SCHEMA_VERSION, effortPresets: EFFORT_PRESETS,
        enter, leave, rebase, setEngineEnabled, setEffortPreset, analyzeCurrentPosition,
        goTo, first: () => goTo(0), previous: () => goTo(Math.max(0, (active?.cursor || 0) - 1)),
        next: () => goTo(Math.min(active?.moves?.length || 0, (active?.cursor || 0) + 1)),
        last: () => goTo(active?.moves?.length || 0), getLine,
        movesFrom, pieceAt, canStartMove, playMove, restoreBoard, getFen: () => active?.game?.fen?.() || null,
        isActive: () => !!active, getSnapshot: snapshot
    });
})(typeof window !== 'undefined' ? window : globalThis);
