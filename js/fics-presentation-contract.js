(function installFicsPresentationContract(root) {
    'use strict';

    const SCHEMA_VERSION = '1.0.0';
    const PRODUCT_STATES = Object.freeze({
        DISCONNECTED: 'DISCONNECTED',
        AUTHENTICATING: 'AUTHENTICATING',
        LOBBY: 'LOBBY',
        SEEKING: 'SEEKING',
        PLAYING: 'PLAYING',
        OBSERVING: 'OBSERVING',
        GAME_OVER: 'GAME_OVER',
        RECONNECTING: 'RECONNECTING',
        ERROR: 'ERROR'
    });
    const LOBBY_VIEWS = Object.freeze(['tables', 'players', 'seek']);
    const ACTIVE_GAME_STATES = new Set([
        PRODUCT_STATES.PLAYING,
        PRODUCT_STATES.OBSERVING,
        PRODUCT_STATES.GAME_OVER
    ]);
    const STANDARD_START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

    function deepFreeze(value) {
        if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
        Object.values(value).forEach(deepFreeze);
        return Object.freeze(value);
    }

    function finiteOrNull(value) {
        return Number.isFinite(value) ? value : null;
    }

    function textOrNull(value) {
        const text = String(value ?? '').trim();
        return text || null;
    }

    function isTerminalResult(value) {
        return ['1-0', '0-1', '1/2-1/2'].includes(textOrNull(value));
    }

    function formatClock(seconds) {
        if (!Number.isFinite(seconds)) return '--:--';
        const safeSeconds = Math.max(0, seconds);
        return `${Math.floor(safeSeconds / 60)}:${String(safeSeconds % 60).padStart(2, '0')}`;
    }

    function copyTable(table = {}) {
        return {
            number: table.number ?? null,
            white: textOrNull(table.white),
            black: textOrNull(table.black),
            whiteRating: textOrNull(table.whiteRating),
            blackRating: textOrNull(table.blackRating),
            timeControl: textOrNull(table.timeControl),
            observers: textOrNull(table.observers),
            rated: typeof table.rated === 'boolean' ? table.rated : textOrNull(table.rated),
            variant: textOrNull(table.variant)
        };
    }

    function copySeek(seek = {}) {
        const details = seek.details || {};
        return {
            number: seek.number ?? details.number ?? null,
            player: textOrNull(details.player),
            rating: textOrNull(details.rating),
            timeControl: textOrNull(details.timeControl),
            variant: textOrNull(details.variant),
            rated: typeof details.rated === 'boolean' ? details.rated : textOrNull(details.rated),
            color: textOrNull(details.color)
        };
    }

    function copyPendingSeek(pendingSeek) {
        if (!pendingSeek || typeof pendingSeek !== 'object') return null;
        return {
            timeControl: textOrNull(pendingSeek.timeControl),
            label: textOrNull(pendingSeek.label),
            rated: typeof pendingSeek.rated === 'boolean' ? pendingSeek.rated : textOrNull(pendingSeek.rated),
            color: textOrNull(pendingSeek.color)
        };
    }

    function copyMove(move = {}) {
        return {
            moveNumber: finiteOrNull(move.moveNumber),
            color: ['white', 'black'].includes(move.color) ? move.color : null,
            san: textOrNull(move.san),
            fen: textOrNull(move.fen)
        };
    }

    function copyResult(resultModel, result) {
        if (!resultModel && !result) return null;
        const normalizedResult = textOrNull(resultModel?.result || result);
        return {
            result: normalizedResult,
            winner: textOrNull(resultModel?.winner),
            loser: textOrNull(resultModel?.loser),
            terminationReason: textOrNull(resultModel?.terminationReason),
            terminal: resultModel?.terminal === true || isTerminalResult(normalizedResult),
            summary: textOrNull(resultModel?.summary)
        };
    }

    function deriveProductState(client = {}) {
        const connectionState = String(client.connectionState || '').toLowerCase();
        if (connectionState === 'error') return PRODUCT_STATES.ERROR;
        if (connectionState === 'reconnecting') return PRODUCT_STATES.RECONNECTING;
        if (!client.authenticated) {
            if (connectionState === 'connecting' || connectionState === 'connected' || client.connected) {
                return PRODUCT_STATES.AUTHENTICATING;
            }
            return PRODUCT_STATES.DISCONNECTED;
        }

        const liveGame = client.liveGame || {};
        const result = liveGame.resultModel;
        const ended = liveGame.status === 'ended' || result?.terminal === true || isTerminalResult(liveGame.result);
        if (ended) return PRODUCT_STATES.GAME_OVER;
        if (liveGame.observedGame || liveGame.status === 'observing') return PRODUCT_STATES.OBSERVING;
        if (liveGame.gameActive || client.gameActive || liveGame.status === 'playing') return PRODUCT_STATES.PLAYING;
        if (client.pendingSeek) return PRODUCT_STATES.SEEKING;
        return PRODUCT_STATES.LOBBY;
    }

    function normalizeLobbyView(options = {}) {
        const requested = options.requestedLobbyView || options.lobbyView || null;
        return LOBBY_VIEWS.includes(requested) ? requested : null;
    }

    function derivePresentation(productState, options = {}) {
        const requestedLobbyView = normalizeLobbyView(options);
        const gameModeAvailable = ACTIVE_GAME_STATES.has(productState);
        if (gameModeAvailable && requestedLobbyView) {
            return {
                bodyMode: 'LOBBY_BROWSE',
                activeTab: requestedLobbyView,
                primaryGameMode: false,
                gameModeAvailable: true,
                returnToGameAvailable: true
            };
        }
        if (gameModeAvailable) {
            return {
                bodyMode: 'GAME',
                activeTab: null,
                primaryGameMode: true,
                gameModeAvailable: true,
                returnToGameAvailable: false
            };
        }
        if ([PRODUCT_STATES.DISCONNECTED, PRODUCT_STATES.AUTHENTICATING,
            PRODUCT_STATES.RECONNECTING, PRODUCT_STATES.ERROR].includes(productState)) {
            return {
                bodyMode: 'CONNECTION',
                activeTab: null,
                primaryGameMode: false,
                gameModeAvailable: false,
                returnToGameAvailable: false
            };
        }
        return {
            bodyMode: 'LOBBY',
            activeTab: requestedLobbyView || (productState === PRODUCT_STATES.SEEKING ? 'seek' : 'tables'),
            primaryGameMode: false,
            gameModeAvailable: false,
            returnToGameAvailable: false
        };
    }

    function deriveSnapshot(client, options = {}) {
        const canonical = client || {};
        const liveGame = canonical.liveGame || {};
        const productState = deriveProductState(canonical);
        const authenticated = canonical.authenticated === true;
        const activeTables = Array.isArray(canonical.activeTables) ? canonical.activeTables.map(copyTable) : [];
        const seeks = Array.isArray(canonical.seekActions) ? canonical.seekActions.map(copySeek) : [];
        const moves = Array.isArray(canonical.moveHistory) ? canonical.moveHistory.map(copyMove) : [];
        const matchingTable = activeTables.find((table) => String(table.number) === String(liveGame.gameNumber)) || null;
        const orientation = ['white', 'black'].includes(liveGame.userColor)
            ? liveGame.userColor
            : ['white', 'black'].includes(canonical.myColor) ? canonical.myColor : 'white';
        const white = {
            color: 'white',
            name: textOrNull(liveGame.whiteName),
            rating: matchingTable?.whiteRating || null,
            clockSeconds: finiteOrNull(liveGame.whiteClock),
            clock: formatClock(liveGame.whiteClock)
        };
        const black = {
            color: 'black',
            name: textOrNull(liveGame.blackName),
            rating: matchingTable?.blackRating || null,
            clockSeconds: finiteOrNull(liveGame.blackClock),
            clock: formatClock(liveGame.blackClock)
        };
        const hasRetainedGame = Boolean(liveGame.currentFen
            || (liveGame.gameNumber !== null && liveGame.gameNumber !== undefined));
        const retainedWhileConnectionUnavailable = hasRetainedGame && !authenticated;
        const terminal = liveGame.status === 'ended' || liveGame.resultModel?.terminal === true
            || isTerminalResult(liveGame.result);
        const observed = liveGame.observedGame === true || liveGame.status === 'observing';
        const playing = !terminal && !observed
            && (liveGame.gameActive === true || canonical.gameActive === true || liveGame.status === 'playing');
        const pgnStartFen = textOrNull(canonical.pgnStartFen);
        const pgnAvailable = typeof canonical.buildPGN === 'function' && Boolean(hasRetainedGame || moves.length || terminal);
        const result = copyResult(liveGame.resultModel, liveGame.result);
        const presentation = derivePresentation(productState, options);
        const commandChannelAvailable = authenticated && canonical.connected === true
            && String(canonical.connectionState || '').toLowerCase() === 'connected';

        const snapshot = {
            schemaVersion: SCHEMA_VERSION,
            productState,
            connection: {
                state: textOrNull(canonical.connectionState) || 'disconnected',
                transportConnected: canonical.connected === true,
                authenticated,
                reconnecting: productState === PRODUCT_STATES.RECONNECTING,
                reconnectAttempts: finiteOrNull(canonical.reconnectAttempts) || 0,
                manualDisconnect: canonical.manualDisconnect === true,
                error: productState === PRODUCT_STATES.ERROR ? 'CONNECTION_ERROR' : null
            },
            session: {
                loginMode: canonical.loginMode === 'account' ? 'account' : 'guest',
                guest: canonical.loginMode !== 'account',
                registered: canonical.loginMode === 'account',
                username: textOrNull(canonical.ficsUsername),
                generation: finiteOrNull(canonical.sessionGeneration) || 0
            },
            lobby: {
                activeTables,
                seeks,
                pendingSeek: copyPendingSeek(canonical.pendingSeek),
                playersSupported: false
            },
            game: {
                mode: terminal ? 'ended' : observed ? 'observing' : playing ? 'playing' : 'idle',
                gameNumber: liveGame.gameNumber ?? null,
                active: playing,
                observed,
                ended: terminal,
                orientation,
                sideToMove: liveGame.sideToMove === 'b' ? 'black' : liveGame.sideToMove === 'w' ? 'white' : null,
                myColor: ['white', 'black'].includes(liveGame.userColor) ? liveGame.userColor : null,
                identities: {
                    white,
                    black,
                    top: orientation === 'black' ? white : black,
                    bottom: orientation === 'black' ? black : white,
                    local: liveGame.userColor === 'white' ? white : liveGame.userColor === 'black' ? black : null,
                    opponent: liveGame.userColor === 'white' ? black : liveGame.userColor === 'black' ? white : null
                },
                clocks: {
                    whiteSeconds: white.clockSeconds,
                    blackSeconds: black.clockSeconds,
                    white: white.clock,
                    black: black.clock,
                    source: 'STYLE12_SNAPSHOT'
                },
                currentFen: textOrNull(liveGame.currentFen),
                moves,
                result,
                pgn: {
                    available: pgnAvailable,
                    mayBePartial: pgnAvailable && (observed || Boolean(pgnStartFen && pgnStartFen !== STANDARD_START_FEN)
                        || retainedWhileConnectionUnavailable)
                },
                retainedWhileConnectionUnavailable,
                authoritativeForPresentation: authenticated && ACTIVE_GAME_STATES.has(productState)
            },
            console: {
                available: typeof canonical.logToConsole === 'function' || Array.isArray(canonical.messageBuffer),
                messageCount: Array.isArray(canonical.messageBuffer) ? canonical.messageBuffer.length : 0,
                hasBufferedMessages: Array.isArray(canonical.messageBuffer) && canonical.messageBuffer.length > 0,
                canSendCommands: commandChannelAvailable,
                expansionStateOwner: 'PRESENTATION'
            },
            capabilities: {
                playersSupported: false,
                specificPlayerChallengesSupported: false,
                resign: commandChannelAvailable && productState === PRODUCT_STATES.PLAYING,
                offerDraw: commandChannelAvailable && productState === PRODUCT_STATES.PLAYING,
                returnFromObservation: commandChannelAvailable && productState === PRODUCT_STATES.OBSERVING,
                downloadPGN: pgnAvailable,
                abort: false
            },
            presentation
        };
        return deepFreeze(snapshot);
    }

    function create(getClient = () => root.CaissaFICSClient) {
        if (typeof getClient !== 'function') throw new TypeError('getClient must be a function');
        return Object.freeze({
            schemaVersion: SCHEMA_VERSION,
            states: PRODUCT_STATES,
            lobbyViews: LOBBY_VIEWS,
            getSnapshot(options = {}) {
                return deriveSnapshot(getClient(), options);
            },
            getViewState(options = {}) {
                const snapshot = deriveSnapshot(getClient(), options);
                return deepFreeze({ productState: snapshot.productState, ...snapshot.presentation });
            }
        });
    }

    root.CaissaFICSPresentation = create();
})(typeof globalThis !== 'undefined' ? globalThis : window);
