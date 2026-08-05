/**
 * CAISSA Legacy Play Compatibility Boundary
 *
 * This passive bridge is the migration boundary for future Play modules.
 * The legacy App runtime remains the only writer of chess, board, clock,
 * engine, evaluation, promotion, and result state. Snapshots are detached and
 * deeply frozen; commands validate input and invoke exactly one existing
 * legacy action. Unsupported behavior stays explicit.
 *
 * Intended first consumer: the read-only Game Record normalizer. New migration
 * code must use this boundary instead of adding direct App reads. Remove this
 * bridge only after every exposed state axis has a replacement owner and the
 * legacy-consumer/static gates are zero.
 */
(function installLegacyPlayCompatibility(global) {
    'use strict';

    const SCHEMA_VERSION = '1.3.0';
    const EXISTING = global.CaissaPlayCompatibility;
    if (EXISTING?.schemaVersion === SCHEMA_VERSION) return;

    const COMMANDS = Object.freeze([
        'startNewGame',
        'prepareNativeSetup',
        'resetGame',
        'submitMove',
        'promote',
        'resign',
        'flipBoard',
        'openAnalyze',
        'requestPgn'
    ]);
    const MODES = Object.freeze(['engine', 'human', 'eve', 'analysis']);
    const COLORS = Object.freeze(['white', 'black']);
    const PROMOTIONS = Object.freeze(['q', 'r', 'b', 'n']);
    const SQUARE = /^[a-h][1-8]$/;
    const RESULT_STATUSES = Object.freeze(['accepted', 'rejected', 'unsupported', 'unavailable', 'failed']);

    const app = () => global.App && typeof global.App === 'object' ? global.App : null;
    const playElement = () => global.document?.getElementById?.('playSection') ?? null;
    const hasFunction = (name) => typeof global[name] === 'function';

    function deepFreeze(value, seen = new WeakSet()) {
        if (!value || typeof value !== 'object' || seen.has(value)) return value;
        seen.add(value);
        Object.values(value).forEach(item => deepFreeze(item, seen));
        return Object.freeze(value);
    }

    function normalizeMove(move) {
        if (!move || typeof move !== 'object') return null;
        return {
            color: typeof move.color === 'string' ? move.color : null,
            from: typeof move.from === 'string' ? move.from : null,
            to: typeof move.to === 'string' ? move.to : null,
            piece: typeof move.piece === 'string' ? move.piece : null,
            captured: typeof move.captured === 'string' ? move.captured : null,
            promotion: typeof move.promotion === 'string' ? move.promotion : null,
            flags: typeof move.flags === 'string' ? move.flags : null,
            san: typeof move.san === 'string' ? move.san : null
        };
    }

    function normalizePromotion(value) {
        if (!value || typeof value !== 'object') return null;
        return {
            from: typeof value.from === 'string' ? value.from : null,
            to: typeof value.to === 'string' ? value.to : null,
            context: typeof value.context === 'string' ? value.context : null
        };
    }

    function safeGameCall(game, name, fallback = null) {
        try {
            return typeof game?.[name] === 'function' ? game[name]() : fallback;
        } catch (_) {
            return fallback;
        }
    }

    function currentSection() {
        const section = global.CaissaNavigation?.currentSection;
        if (typeof section === 'string' && section) return section;
        const active = global.document?.querySelector?.('.content-section.active');
        return typeof active?.id === 'string' ? active.id.replace(/Section$/, '') : null;
    }

    function isLegacyAnalyzeContext() {
        const body = global.document?.body;
        if (body?.dataset?.caissaPlayV2Entry === 'qa-only') return false;
        const snapshot = getSnapshot();
        return snapshot.section === 'play' && snapshot.mounted && snapshot.active && snapshot.game.active;
    }

    function getSnapshot() {
        const source = app();
        const game = source?.game;
        const section = currentSection();
        const mounted = !!playElement();
        const fen = safeGameCall(game, 'fen');
        const pgn = safeGameCall(game, 'pgn', '');
        const turnCode = safeGameCall(game, 'turn');
        const moves = Array.isArray(source?.moveHistory)
            ? source.moveHistory.map(normalizeMove).filter(Boolean)
            : [];
        const status = source?.gameStatus && typeof source.gameStatus === 'object'
            ? {
                state: typeof source.gameStatus.state === 'string' ? source.gameStatus.state : null,
                result: typeof source.gameStatus.result === 'string' ? source.gameStatus.result : null,
                message: typeof source.gameStatus.message === 'string' ? source.gameStatus.message : null
            }
            : { state: null, result: null, message: null };
        const cp = Number.isFinite(source?.lastEvalCp) ? source.lastEvalCp : null;
        const mate = Number.isFinite(source?.lastEvalMate) ? source.lastEvalMate : null;
        // Temporary legacy-field fallback supports staged script loading only.
        const serviceClock = global.CaissaClockService?.getSnapshot?.() || null;
        const clockRunning = serviceClock ? serviceClock.running === true : source?.clockRunning === true;

        return deepFreeze({
            schemaVersion: SCHEMA_VERSION,
            capturedAt: new Date().toISOString(),
            section,
            mounted,
            active: section === 'play' && !!playElement()?.classList?.contains?.('active'),
            mode: typeof source?.gameMode === 'string' ? source.gameMode : null,
            playerColor: COLORS.includes(source?.playerColor) ? source.playerColor : null,
            selectedOpponent: source?.gameMode === 'engine' && global.CaissaCoachSession?.getActiveProfile?.()
                ? global.CaissaCoachSession.getActiveProfile().id
                : source?.gameMode === 'engine' && global.CaissaBotSession?.getActiveProfile?.()
                ? global.CaissaBotSession.getActiveProfile().id
                : source?.gameMode === 'engine' && typeof source?.engineId === 'string'
                    ? source.engineId : null,
            position: {
                fen: typeof fen === 'string' ? fen : null,
                pgn: typeof pgn === 'string' ? pgn : null,
                turn: turnCode === 'w' ? 'white' : turnCode === 'b' ? 'black' : null,
                moveCount: moves.length,
                moveHistory: moves
            },
            board: {
                available: !!source?.boardAdapter || !!source?.board,
                orientation: source?.boardAdapter?.getSnapshot?.().orientation
                    ?? (source?.board ? (source.isFlipped ? 'black' : 'white') : null)
            },
            game: {
                active: source?.gameActive === true,
                status,
                result: status.result,
                termination: null,
                pendingPromotion: normalizePromotion(source?.pendingPromotion)
            },
            clocks: {
                whiteMilliseconds: serviceClock?.whiteRemainingMs
                    ?? (Number.isFinite(source?.whiteTimeMs) ? source.whiteTimeMs : null),
                blackMilliseconds: serviceClock?.blackRemainingMs
                    ?? (Number.isFinite(source?.blackTimeMs) ? source.blackTimeMs : null),
                whiteSeconds: serviceClock
                    ? Math.max(0, Math.ceil(serviceClock.whiteRemainingMs / 1000))
                    : (Number.isFinite(source?.whiteTime) ? source.whiteTime : null),
                blackSeconds: serviceClock
                    ? Math.max(0, Math.ceil(serviceClock.blackRemainingMs / 1000))
                    : (Number.isFinite(source?.blackTime) ? source.blackTime : null),
                timeControlSeconds: serviceClock
                    ? serviceClock.initialTimeMs / 1000
                    : (Number.isFinite(source?.timeControl) ? source.timeControl : null),
                incrementSeconds: serviceClock ? serviceClock.incrementMs / 1000
                    : (Number.isFinite(source?.timeIncrement) ? source.timeIncrement : 0),
                activeColor: serviceClock?.activeColor
                    ?? (clockRunning ? (turnCode === 'w' ? 'white' : turnCode === 'b' ? 'black' : null) : null),
                running: clockRunning,
                timedOutColor: serviceClock?.timedOutColor ?? null
            },
            evaluation: {
                available: cp !== null || mate !== null,
                scorePawns: cp === null ? null : cp / 100,
                mate,
                perspective: cp !== null || mate !== null ? 'white' : null
            },
            engine: {
                available: !!source?.engine,
                busy: source?.analyzing === true || source?.engine?.analyzing === true,
                purpose: source?.analyzing === true ? 'analysis' : null
            },
            storageVersion: null
        });
    }

    function result(ok, status, command, reason = null, value = null) {
        return deepFreeze({ ok, status, command, reason, value });
    }

    function unavailable(command, reason = 'legacy-play-unavailable') {
        return result(false, 'unavailable', command, reason);
    }

    function rejected(command, reason) {
        return result(false, 'rejected', command, reason);
    }

    function requirePlay(command) {
        if (!app()) return unavailable(command);
        if (!playElement()) return unavailable(command, 'play-not-mounted');
        return null;
    }

    function validateNewGame(input) {
        if (!input || typeof input !== 'object' || Array.isArray(input)) return 'options-required';
        if (input.mode !== undefined && !MODES.includes(input.mode)) return 'invalid-mode';
        if (input.color !== undefined && !COLORS.includes(input.color)) return 'invalid-color';
        if (input.timeControl !== undefined &&
            (!Number.isInteger(input.timeControl) || input.timeControl < 0 || input.timeControl > 86400))
            return 'invalid-time-control';
        if (input.increment !== undefined &&
            (!Number.isInteger(input.increment) || input.increment < 0 || input.increment > 86400))
            return 'invalid-increment';
        const allowed = new Set(['mode', 'color', 'timeControl', 'increment']);
        if (Object.keys(input).some(key => !allowed.has(key))) return 'unknown-option';
        return null;
    }

    function execute(command, input) {
        if (typeof command !== 'string' || !COMMANDS.includes(command))
            return result(false, 'unsupported', typeof command === 'string' ? command : null, 'unsupported-command');

        const unavailableResult = requirePlay(command);
        if (unavailableResult) return unavailableResult;

        try {
            switch (command) {
                case 'startNewGame': {
                    const reason = validateNewGame(input);
                    if (reason) return rejected(command, reason);
                    if (!hasFunction('newGame')) return unavailable(command, 'legacy-action-unavailable');
                    const started = global.newGame({ ...input });
                    return started === false ? result(false, 'failed', command, 'initialization-rejected')
                        : result(true, 'accepted', command);
                }
                case 'prepareNativeSetup': {
                    if (input !== undefined) return rejected(command, 'options-not-supported');
                    if (!hasFunction('prepareNativePlaySetup')) return unavailable(command, 'native-setup-action-unavailable');
                    return global.prepareNativePlaySetup() === true
                        ? result(true, 'accepted', command)
                        : result(false, 'failed', command, 'native-setup-rejected');
                }
                case 'resetGame': {
                    if (input !== undefined && (typeof input !== 'object' || Array.isArray(input)))
                        return rejected(command, 'invalid-options');
                    const reason = validateNewGame(input || {});
                    if (reason) return rejected(command, reason);
                    if (!hasFunction('newGame')) return unavailable(command, 'legacy-action-unavailable');
                    const source = app();
                    global.newGame({
                        mode: source.gameMode,
                        color: source.playerColor,
                        timeControl: source.timeControl,
                        increment: source.timeIncrement || 0,
                        ...(input || {})
                    });
                    return result(true, 'accepted', command);
                }
                case 'submitMove': {
                    if (!input || typeof input !== 'object' || Array.isArray(input))
                        return rejected(command, 'move-required');
                    if (!SQUARE.test(input.from || '') || !SQUARE.test(input.to || ''))
                        return rejected(command, 'invalid-square');
                    if (input.promotion !== undefined && !PROMOTIONS.includes(input.promotion))
                        return rejected(command, 'invalid-promotion');
                    if (Object.keys(input).some(key => !['from', 'to', 'promotion'].includes(key)))
                        return rejected(command, 'unknown-option');
                    if (input.promotion !== undefined)
                        return result(false, 'unsupported', command, 'promotion-requires-legacy-dialog');
                    if (!hasFunction('makeMoveFromSquares')) return unavailable(command, 'legacy-action-unavailable');
                    const accepted = global.makeMoveFromSquares(input.from, input.to) === true;
                    return accepted
                        ? result(true, 'accepted', command)
                        : rejected(command, 'legacy-move-rejected');
                }
                case 'promote': {
                    if (!input || typeof input !== 'object' || Array.isArray(input) ||
                        Object.keys(input).some(key => key !== 'piece'))
                        return rejected(command, 'invalid-promotion');
                    if (!PROMOTIONS.includes(input?.piece)) return rejected(command, 'invalid-promotion');
                    if (!app()?.pendingPromotion) return rejected(command, 'no-pending-promotion');
                    if (!hasFunction('handlePromotion')) return unavailable(command, 'legacy-action-unavailable');
                    global.handlePromotion(input.piece);
                    return result(true, 'accepted', command);
                }
                case 'resign': {
                    if (input !== undefined) return rejected(command, 'input-not-supported');
                    if (!hasFunction('resignGame')) return unavailable(command, 'legacy-action-unavailable');
                    global.resignGame();
                    return result(true, 'accepted', command);
                }
                case 'flipBoard': {
                    if (input !== undefined) return rejected(command, 'input-not-supported');
                    if (!app()?.board) return unavailable(command, 'board-unavailable');
                    if (!hasFunction('flipBoard')) return unavailable(command, 'legacy-action-unavailable');
                    global.flipBoard();
                    return result(true, 'accepted', command);
                }
                case 'openAnalyze': {
                    if (input !== undefined) return rejected(command, 'input-not-supported');
                    if (typeof global.CaissaNavigation?.navigateToSection !== 'function')
                        return unavailable(command, 'navigation-unavailable');
                    const handoffFactory = global.CaissaAnalyzeHandoff?.createFromLegacyActivePlay;
                    const handoff = typeof handoffFactory === 'function' ? handoffFactory() : null;
                    if (handoff && !handoff.ok) return unavailable(command, 'handoff-unavailable');
                    const navigated = global.CaissaNavigation.navigateToSection('analyze',
                        handoff?.value?.token ? { handoffToken: handoff.value.token } : undefined);
                    if (navigated === false) return unavailable(command, 'handoff-unavailable');
                    return result(true, 'accepted', command, null,
                        handoff?.value?.token ?? global.CaissaNavigation.lastAnalyzeHandoffToken ?? null);
                }
                case 'requestPgn':
                    if (input !== undefined) return rejected(command, 'input-not-supported');
                    return result(true, 'accepted', command, null, getSnapshot().position.pgn);
                default:
                    return result(false, 'unsupported', command, 'unsupported-command');
            }
        } catch (_) {
            return result(false, 'failed', command, 'legacy-action-failed');
        }
    }

    const selector = (read) => read(getSnapshot());
    const api = Object.freeze({
        schemaVersion: SCHEMA_VERSION,
        commands: COMMANDS,
        resultStatuses: RESULT_STATUSES,
        isAvailable: () => !!app() && !!playElement(),
        getSnapshot,
        getState: getSnapshot,
        getCurrentFen: () => selector(snapshot => snapshot.position.fen),
        getCurrentPgn: () => selector(snapshot => snapshot.position.pgn),
        getMoveHistory: () => selector(snapshot => snapshot.position.moveHistory),
        getGameStatus: () => selector(snapshot => snapshot.game.status),
        getClockSnapshot: () => selector(snapshot => snapshot.clocks),
        getEvaluationSnapshot: () => selector(snapshot => snapshot.evaluation),
        getBoardOrientation: () => selector(snapshot => snapshot.board.orientation),
        getPendingPromotion: () => selector(snapshot => snapshot.game.pendingPromotion),
        isPlayMounted: () => selector(snapshot => snapshot.mounted),
        isGameActive: () => selector(snapshot => snapshot.game.active),
        isLegacyAnalyzeContext,
        execute
    });

    global.CaissaPlayCompatibility = api;
})(window);
