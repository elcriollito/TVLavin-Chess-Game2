import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const contractSource = fs.readFileSync(new URL('../js/fics-presentation-contract.js', import.meta.url), 'utf8');
const clientSource = fs.readFileSync(new URL('../js/fics-client.js', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const classicHtml = fs.readFileSync(new URL('../yahoo-classic.html', import.meta.url), 'utf8');

function baseClient(overrides = {}) {
    return {
        connected: false,
        authenticated: false,
        connectionState: 'disconnected',
        reconnectAttempts: 0,
        manualDisconnect: false,
        loginMode: 'guest',
        ficsUsername: 'Guest',
        sessionGeneration: 0,
        gameActive: false,
        myColor: null,
        pendingSeek: null,
        activeTables: [],
        seekActions: [],
        moveHistory: [],
        messageBuffer: [],
        pgnStartFen: null,
        buildPGN() { return '*\n'; },
        liveGame: {
            gameNumber: null, whiteName: null, blackName: null, userColor: null, relation: null,
            sideToMove: null, whiteClock: null, blackClock: null, currentFen: null,
            gameActive: false, observedGame: false, result: null, resultModel: null, status: 'idle'
        },
        ...overrides
    };
}

function load(client) {
    const root = { CaissaFICSClient: client };
    vm.runInNewContext(contractSource, { globalThis: root, window: root, Object, Set, TypeError }, { filename: 'fics-presentation-contract.js' });
    return root.CaissaFICSPresentation;
}

test('all product states are deterministically derived from canonical client fields', () => {
    const cases = [
        ['DISCONNECTED', {}],
        ['AUTHENTICATING', { connected: true, connectionState: 'connecting' }],
        ['LOBBY', { connected: true, authenticated: true, connectionState: 'connected' }],
        ['SEEKING', { connected: true, authenticated: true, connectionState: 'connected', pendingSeek: { timeControl: '5+0' } }],
        ['PLAYING', { connected: true, authenticated: true, connectionState: 'connected', gameActive: true,
            liveGame: { gameActive: true, observedGame: false, status: 'playing', relation: 1 } }],
        ['OBSERVING', { connected: true, authenticated: true, connectionState: 'connected',
            liveGame: { gameActive: false, observedGame: true, status: 'observing', relation: 0 } }],
        ['GAME_OVER', { connected: true, authenticated: true, connectionState: 'connected',
            liveGame: { gameActive: false, observedGame: false, status: 'idle', result: '1-0' } }],
        ['RECONNECTING', { connectionState: 'reconnecting' }],
        ['ERROR', { connectionState: 'error' }]
    ];
    for (const [expected, overrides] of cases) {
        const client = baseClient(overrides);
        if (overrides.liveGame) client.liveGame = { ...baseClient().liveGame, ...overrides.liveGame };
        assert.equal(load(client).getSnapshot().productState, expected, expected);
    }
});

test('reconnecting outranks retained stale game data without deleting or presenting it as authoritative', () => {
    const liveGame = {
        ...baseClient().liveGame, gameNumber: 71, currentFen: 'retained-fen', gameActive: true,
        status: 'playing', relation: 1, userColor: 'white'
    };
    const client = baseClient({ connectionState: 'reconnecting', reconnectAttempts: 1, liveGame, gameActive: true });
    const snapshot = load(client).getSnapshot();
    assert.equal(snapshot.productState, 'RECONNECTING');
    assert.equal(snapshot.presentation.bodyMode, 'CONNECTION');
    assert.equal(snapshot.game.currentFen, 'retained-fen');
    assert.equal(snapshot.game.retainedWhileConnectionUnavailable, true);
    assert.equal(snapshot.game.authoritativeForPresentation, false);
    assert.equal(snapshot.capabilities.resign, false);
    assert.equal(client.liveGame.currentFen, 'retained-fen');
});

test('game mode deselects lobby tabs and temporary lobby browsing exposes return to game', () => {
    const client = baseClient({
        connected: true, authenticated: true, connectionState: 'connected', gameActive: true,
        liveGame: { ...baseClient().liveGame, gameNumber: 72, currentFen: 'game-fen', gameActive: true,
            status: 'playing', relation: 1, userColor: 'black' }
    });
    const contract = load(client);
    assert.deepEqual({ ...contract.getViewState() }, {
        productState: 'PLAYING', bodyMode: 'GAME', activeTab: null, primaryGameMode: true,
        gameModeAvailable: true, returnToGameAvailable: false
    });
    assert.deepEqual({ ...contract.getViewState({ requestedLobbyView: 'tables' }) }, {
        productState: 'PLAYING', bodyMode: 'LOBBY_BROWSE', activeTab: 'tables', primaryGameMode: false,
        gameModeAvailable: true, returnToGameAvailable: true
    });
    assert.equal(client.liveGame.status, 'playing');
});

test('snapshots deeply clone and freeze canonical collections', () => {
    const client = baseClient({
        connected: true, authenticated: true, connectionState: 'connected',
        activeTables: [{ number: 1, white: 'Alpha', black: 'Beta', whiteRating: '1500' }],
        seekActions: [{ number: 2, details: { player: 'Gamma', timeControl: '5+0' } }],
        pendingSeek: { timeControl: '3+2', label: 'Mine' },
        moveHistory: [{ moveNumber: 1, color: 'white', san: 'e4', fen: 'after-e4' }]
    });
    const snapshot = load(client).getSnapshot();
    assert.equal(Object.isFrozen(snapshot), true);
    assert.equal(Object.isFrozen(snapshot.lobby.activeTables), true);
    assert.equal(Object.isFrozen(snapshot.lobby.activeTables[0]), true);
    assert.equal(Object.isFrozen(snapshot.game.moves[0]), true);
    assert.notEqual(snapshot.lobby.activeTables, client.activeTables);
    assert.notEqual(snapshot.lobby.activeTables[0], client.activeTables[0]);
    assert.throws(() => { snapshot.lobby.activeTables[0].white = 'Mutated'; }, TypeError);
    assert.throws(() => { snapshot.lobby.seeks.push({}); }, TypeError);
    assert.equal(client.activeTables[0].white, 'Alpha');
    assert.equal(client.seekActions.length, 1);
});

test('lobby projection exposes capped-table provenance and canonical seek delivery state', () => {
    const client = baseClient({
        connected: true, authenticated: true, connectionState: 'connected',
        lobbyRefreshInFlight: true, lobbyLastRefreshAt: 1234,
        activeTables: [{ number: 8, white: 'Alpha', black: 'Beta', whiteRating: '', timeControl: '' }],
        pendingSeek: {
            minutes: 5, increment: 2, timeControl: '5+2', rated: false, color: 'random',
            status: 'pending', operation: 'create', deliveryCode: 'SENT'
        },
        pendingObservation: { target: '9', previous: null, status: 'sending' }
    });
    const snapshot = load(client).getSnapshot();
    assert.equal(snapshot.lobby.coverage, 'RECENT_CAPPED_HEURISTIC');
    assert.equal(snapshot.lobby.loading, true);
    assert.equal(snapshot.lobby.refreshedAt, 1234);
    assert.equal(snapshot.lobby.activeTables[0].whiteRating, null);
    assert.equal(snapshot.lobby.activeTables[0].timeControl, null);
    assert.equal(snapshot.lobby.pendingSeek.status, 'pending');
    assert.equal(snapshot.lobby.pendingSeek.rated, false);
    assert.equal(snapshot.lobby.observationRequest.target, '9');
    assert.equal(snapshot.capabilities.createSeek, false);
    assert.equal(snapshot.capabilities.cancelSeek, true);
    assert.equal(snapshot.capabilities.observeTable, false);
});

test('seek delivery error is not falsely projected as an active acknowledged seek', () => {
    const client = baseClient({
        connected: true, authenticated: true, connectionState: 'connected',
        pendingSeek: { timeControl: '3+0', status: 'error', operation: 'create', error: 'Not delivered' }
    });
    const snapshot = load(client).getSnapshot();
    assert.equal(snapshot.productState, 'LOBBY');
    assert.equal(snapshot.lobby.pendingSeek.status, 'error');
    assert.equal(snapshot.capabilities.createSeek, true);
    assert.equal(snapshot.capabilities.cancelSeek, false);
});

test('player support and unapproved actions fail closed while approved live actions follow relation', () => {
    const client = baseClient({
        connected: true, authenticated: true, connectionState: 'connected', gameActive: true,
        liveGame: { ...baseClient().liveGame, gameNumber: 73, currentFen: 'game-fen', gameActive: true,
            status: 'playing', relation: 1, userColor: 'white' }
    });
    const snapshot = load(client).getSnapshot();
    assert.equal(snapshot.lobby.playersSupported, false);
    assert.equal(snapshot.capabilities.playersSupported, false);
    assert.equal(snapshot.capabilities.specificPlayerChallengesSupported, false);
    assert.equal(snapshot.capabilities.abort, false);
    assert.equal(snapshot.capabilities.resign, true);
    assert.equal(snapshot.capabilities.offerDraw, true);
    assert.equal(snapshot.capabilities.returnFromObservation, false);

    client.liveGame.relation = -1;
    const opponentTurn = load(client).getSnapshot();
    assert.equal(opponentTurn.capabilities.resign, true);
    assert.equal(opponentTurn.capabilities.offerDraw, true);

    client.connected = false;
    const unavailableChannel = load(client).getSnapshot();
    assert.equal(unavailableChannel.console.canSendCommands, false);
    assert.equal(unavailableChannel.capabilities.resign, false);
    assert.equal(unavailableChannel.capabilities.offerDraw, false);
});

test('orientation, ratings, clocks, and observed partial-PGN risk are projected truthfully', () => {
    const client = baseClient({
        connected: true, authenticated: true, connectionState: 'connected',
        activeTables: [{ number: 74, white: 'Alpha', black: 'Beta', whiteRating: '1510', blackRating: '1620' }],
        moveHistory: [{ moveNumber: 20, color: 'black', san: 'Kh2', fen: 'after-kh2' }],
        pgnStartFen: '8/8/8/8/8/8/8/K6k b - - 0 20',
        liveGame: { ...baseClient().liveGame, gameNumber: 74, whiteName: 'Alpha', blackName: 'Beta', currentFen: 'observed-fen',
            observedGame: true, status: 'observing', relation: 0, sideToMove: 'w', whiteClock: 39, blackClock: 0 }
    });
    const snapshot = load(client).getSnapshot();
    assert.equal(snapshot.game.identities.top.name, 'Beta');
    assert.equal(snapshot.game.identities.bottom.name, 'Alpha');
    assert.equal(snapshot.game.identities.white.rating, '1510');
    assert.equal(snapshot.game.clocks.white, '0:39');
    assert.equal(snapshot.game.clocks.black, '0:00');
    assert.equal(snapshot.game.clocks.source, 'STYLE12_SNAPSHOT');
    assert.equal(snapshot.game.pgn.available, true);
    assert.equal(snapshot.game.pgn.mayBePartial, true);
    assert.equal(snapshot.capabilities.returnFromObservation, true);
    assert.equal(snapshot.capabilities.downloadPGN, true);
});

test('PGN availability requires captured moves or a terminal result and action locks project fail closed', () => {
    const client = baseClient({
        connected: true, authenticated: true, connectionState: 'connected', gameActive: true,
        pendingGameActions: { resign: true, draw: false },
        liveGame: { ...baseClient().liveGame, gameNumber: 75, currentFen: 'game-fen', gameActive: true,
            status: 'playing', relation: 1, userColor: 'white' }
    });
    let snapshot = load(client).getSnapshot();
    assert.equal(snapshot.game.pgn.available, false);
    assert.equal(snapshot.capabilities.downloadPGN, false);
    assert.equal(snapshot.game.actions.resignInFlight, true);
    assert.equal(snapshot.capabilities.resign, false);
    assert.equal(snapshot.capabilities.offerDraw, true);

    client.moveHistory = [{ moveNumber: 1, color: 'white', san: 'e4' }];
    snapshot = load(client).getSnapshot();
    assert.equal(snapshot.game.pgn.available, true);
    assert.equal(snapshot.capabilities.downloadPGN, true);
});

test('normalized terminal result remains projected without shell protocol evidence', () => {
    const resultModel = {
        result: '0-1', winner: 'BlackPlayer', loser: 'WhitePlayer', terminationReason: 'CHECKMATE',
        terminal: true, summary: 'BlackPlayer won by checkmate.'
    };
    const client = baseClient({
        connected: true, authenticated: true, connectionState: 'connected', pgnResult: '0-1',
        liveGame: { ...baseClient().liveGame, gameNumber: 76, whiteName: 'WhitePlayer', blackName: 'BlackPlayer',
            currentFen: 'terminal-fen', status: 'ended', result: '0-1', resultModel }
    });
    const snapshot = load(client).getSnapshot();
    assert.equal(snapshot.productState, 'GAME_OVER');
    assert.deepEqual({ ...snapshot.game.result }, resultModel);
    assert.equal(snapshot.presentation.primaryGameMode, true);
    assert.equal(snapshot.capabilities.resign, false);
    assert.equal(snapshot.capabilities.offerDraw, false);

    const dismissed = load(client).getSnapshot({ requestedLobbyView: 'seek', dismissEndedGame: true });
    assert.equal(dismissed.productState, 'GAME_OVER');
    assert.equal(dismissed.presentation.bodyMode, 'LOBBY');
    assert.equal(dismissed.presentation.activeTab, 'seek');
    assert.equal(dismissed.presentation.gameModeAvailable, false);
    assert.equal(dismissed.presentation.returnToGameAvailable, false);
    assert.equal(dismissed.capabilities.createSeek, true);
    assert.equal(dismissed.game.result.result, '0-1');
});

test('presentation contract owns no transport, board, clock loop, game store, seek store, or DOM rendering', () => {
    assert.doesNotMatch(contractSource, /new\s+WebSocket|WebSocket\s*\(|new\s+Chess|Chessboard\s*\(|setInterval|requestAnimationFrame|createElement|querySelector|classList|\.send\s*\(/);
    assert.doesNotMatch(contractSource, /\b(?:let|var)\s+(?:liveGame|gameActive|activeTables|seekActions|pendingSeek|whiteClock|blackClock)\b/);
    assert.equal((clientSource.match(/window\.CaissaFICSClient\s*=\s*CaissaFICSClient/g) || []).length, 1);
    for (const html of [indexHtml, classicHtml]) {
        assert.equal((html.match(/js\/fics-client\.js/g) || []).length, 1);
        assert.equal((html.match(/js\/fics-presentation-contract\.js/g) || []).length, 1);
        assert.ok(html.indexOf('js/fics-client.js') < html.indexOf('js/fics-presentation-contract.js'));
    }
});
