import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const clientSource = fs.readFileSync(new URL('../js/fics-client.js', import.meta.url), 'utf8');
const style12Source = fs.readFileSync(new URL('../js/fics-style12.js', import.meta.url), 'utf8');
const yahooSource = fs.readFileSync(new URL('../js/yahoo-classic-section.js', import.meta.url), 'utf8');
const yahooCss = fs.readFileSync(new URL('../css/yahoo-classic.css', import.meta.url), 'utf8');

function loadClient(challengePending = null) {
    const root = { location: { hostname: '127.0.0.1' }, addEventListener() {}, ClassicComputerChallenge: { snapshot: () => ({ pending: challengePending }) } };
    const context = {
        window: root, document: { readyState: 'loading', addEventListener() {} }, console,
        performance: { now: () => 1 }, setTimeout() {}, clearTimeout() {},
        Chess: class { load() { return true; } reset() {} }
    };
    context.globalThis = root;
    vm.runInNewContext(style12Source, context, { filename: 'fics-style12.js' });
    vm.runInNewContext(clientSource, context, { filename: 'fics-client.js' });
    return root.CaissaFICSClient;
}

function loadYahoo() {
    let section;
    const root = {
        addEventListener() {},
        CaissaNavigation: { registerSection(name, value) { if (name === 'yahooClassic') section = value; } }
    };
    const context = {
        window: root, document: { getElementById() { return null; }, querySelectorAll() { return []; }, createElement() { return {}; } },
        console, performance: { now: () => 1 }, requestAnimationFrame(callback) { callback(); return 1; }
    };
    vm.runInNewContext(yahooSource, context, { filename: 'yahoo-classic-section.js' });
    return { section, root };
}

test('board-side mapping keeps names and clocks aligned for both orientations', () => {
    const { section, root } = loadYahoo();
    assert.deepEqual({ ...section.getBoardSideMapping('white') }, { orientation: 'white', topColor: 'black', bottomColor: 'white' });
    assert.deepEqual({ ...section.getBoardSideMapping('black') }, { orientation: 'black', topColor: 'white', bottomColor: 'black' });

    root.CaissaFICSClient = { myColor: 'black', ficsUsername: 'GuestBGCP' };
    section.liveGame = { userColor: 'black', whiteName: 'rusalka', blackName: 'GuestBGCP', whiteClock: 39, blackClock: 0, sideToMove: 'w' };
    section.elements = { blackPlayerBar: { id: 'top' }, whitePlayerBar: { id: 'bottom' } };
    const rendered = [];
    section.renderGamePlayerBar = (element, player) => rendered.push({ element: element.id, ...player });
    section.renderGamePlayers();
    assert.deepEqual(rendered.map(player => [player.element, player.position, player.color, player.name, player.clock]), [
        ['top', 'top', 'white', 'rusalka', '0:39'],
        ['bottom', 'bottom', 'black', 'GuestBGCP', '0:00']
    ]);
});

test('result star is non-terminal while scored results are terminal', () => {
    const { section } = loadYahoo();
    assert.equal(section.normalizeGameResult('*'), '--');
    assert.equal(section.isTerminalGameResult(section.normalizeGameResult('*')), false);
    for (const result of ['1-0', '0-1', '1/2-1/2']) {
        assert.equal(section.isTerminalGameResult(section.normalizeGameResult(result)), true, result);
    }
});

test('terminal frames never re-enter game-start lifecycle', () => {
    const client = loadClient();
    client.parseSeekLine = () => {};
    client.parseActiveGameLine = () => {};
    let starts = 0;
    let ends = 0;
    client.handleGameStart = () => { starts += 1; };
    client.handleGameEnd = () => { ends += 1; };
    client.parseGameLine('Game 10 (rusalka vs GuestBGCP) *');
    assert.equal(starts, 1);
    assert.equal(ends, 0);
    client.parseGameLine('Game 10 (rusalka vs GuestBGCP) GuestBGCP forfeits on time 1-0');
    assert.equal(starts, 1);
    assert.equal(ends, 1);
});

test('FICS termination model uses evidence and never guesses an unknown reason', () => {
    const client = loadClient();
    client.liveGame.whiteName = 'rusalka';
    client.liveGame.blackName = 'GuestBGCP';
    const timeout = client.normalizeFicsGameResult('Game 10: GuestBGCP forfeits on time. 1-0');
    assert.equal(timeout.terminationReason, 'TIMEOUT');
    assert.equal(timeout.winner, 'rusalka');
    assert.equal(timeout.summary, 'rusalka wins on time — 1-0');
    const unknown = client.normalizeFicsGameResult('Game 10 ended. 1-0');
    assert.equal(unknown.terminationReason, 'UNKNOWN');
    assert.equal(unknown.summary, 'rusalka wins — 1-0');
    assert.equal(client.normalizeFicsGameResult('*').terminal, false);
});

test('disconnect-forfeit advisory is nonterminal and the following Style12 move continues game 25', () => {
    const client = loadClient({ targetHandle: 'inemuri', rated: false });
    const events = [];
    const statuses = [];
    client.chess = { load: () => true, reset() {} };
    client.initBoard = () => {};
    client.board = { orientation() {}, position() {} };
    client.updateLiveGameUI = () => {};
    client.handleStyle12SoundEvents = () => {};
    client.getActiveTableForGame = () => null;
    client.renderMoveList = () => {};
    client.notifySpectator = (event, payload) => events.push({ event, payload });
    client.updateGameStatus = (message, state) => statuses.push({ message, state });

    client.parseGameLine('Creating: GuestSMND (++++) inemuri (1360) unrated blitz 3 2');
    client.parseGameLine('{Game 25 (GuestSMND vs. inemuri) Creating unrated blitz match.}');
    client.parseGameLine('<12> rnbqkbnr pppppppp -------- -------- -------- -------- PPPPPPPP RNBQKBNR W -1 1 1 1 1 0 25 GuestSMND inemuri 1 3 2 39 39 180 180 1 none (0:00) none 0');
    assert.equal(client.gameActive, true);
    assert.equal(client.liveGame.status, 'playing');
    assert.equal(client.liveGame.result, null);
    assert.equal(client.liveGame.resultModel, null);

    const advisory = 'Game 25: A disconnection will be considered a forfeit.';
    client.parseGameLine(advisory);
    const normalized = client.normalizeFicsGameResult(advisory);
    assert.equal(normalized.result, '*');
    assert.equal(normalized.terminationReason, 'UNKNOWN');
    assert.equal(normalized.terminal, false);
    assert.equal(client.gameActive, true);
    assert.equal(client.liveGame.gameActive, true);
    assert.equal(client.liveGame.status, 'playing');
    assert.equal(client.liveGame.result, null);
    assert.equal(client.liveGame.resultModel, null);
    assert.equal(events.filter(item => item.event === 'game-ended').length, 0);
    assert.equal(statuses.some(item => item.state === 'ended'), false);

    client.parseGameLine('<12> rnbqkbnr pppppppp -------- -------- ----P--- -------- PPPP-PPP RNBQKBNR B -1 1 1 1 1 0 25 GuestSMND inemuri -1 3 2 39 39 179 180 1 P/e2-e4 (0:01) e4 0');
    assert.equal(client.gameActive, true);
    assert.equal(client.liveGame.status, 'playing');
    assert.equal(client.liveGame.lastMove, 'e4');
    assert.equal(client.moveHistory.length, 1);
    assert.equal(events.filter(item => item.event === 'game-ended').length, 0);
});

test('black-side Style12 survives advisory, applies the computer move, and returns move ownership to Guest', () => {
    const client = loadClient({ targetHandle: 'inemuri', rated: false });
    const orientations = [];
    const positions = [];
    const events = [];
    client.chess = { load: () => true, reset() {}, game_over: () => false };
    client.initBoard = () => {};
    client.board = {
        orientation(value) { orientations.push(value); },
        position(value) { positions.push(value); }
    };
    client.updateLiveGameUI = () => {};
    client.handleStyle12SoundEvents = () => {};
    client.getActiveTableForGame = () => null;
    client.renderMoveList = () => {};
    client.notifySpectator = (event, payload) => events.push({ event, payload });

    client.parseGameLine('<12> rnbqkbnr pppppppp -------- -------- -------- -------- PPPPPPPP RNBQKBNR W -1 1 1 1 1 0 26 inemuri GuestSMND -1 3 2 39 39 180 180 1 none (0:00) none 0');
    assert.equal(client.myColor, 'black');
    assert.equal(client.liveGame.userColor, 'black');
    assert.equal(client.liveGame.sideToMove, 'w');
    assert.equal(client.canSubmitGraphicalMove(), false);

    client.parseGameLine('Game 26: A disconnection will be considered a forfeit.');
    assert.equal(client.gameActive, true);
    assert.equal(client.liveGame.status, 'playing');
    assert.equal(events.filter(item => item.event === 'game-ended').length, 0);

    client.parseGameLine('<12> rnbqkbnr pppppppp -------- -------- ----P--- -------- PPPP-PPP RNBQKBNR B -1 1 1 1 1 0 26 inemuri GuestSMND 1 3 2 39 39 179 180 1 P/e2-e4 (0:01) e4 0');
    assert.equal(client.gameActive, true);
    assert.equal(client.liveGame.lastMove, 'e4');
    assert.equal(client.liveGame.sideToMove, 'b');
    assert.equal(client.liveGame.whiteClock, 179);
    assert.equal(client.liveGame.blackClock, 180);
    assert.equal(client.moveHistory.length, 1);
    assert.equal(client.canSubmitGraphicalMove(), true);
    assert.equal(client.onDragStart('e7', 'bP'), true);
    assert.equal(orientations.at(-1), 'black');
    assert.equal(positions.at(-1), client.liveGame.currentFen);

    const { section, root } = loadYahoo();
    root.CaissaFICSClient = { myColor: 'black', ficsUsername: 'GuestSMND' };
    section.liveGame = { ...client.liveGame };
    section.elements = { blackPlayerBar: { id: 'top' }, whitePlayerBar: { id: 'bottom' } };
    const rendered = [];
    section.renderGamePlayerBar = (element, player) => rendered.push({ element: element.id, ...player });
    section.renderGamePlayers();
    assert.deepEqual(rendered.map(player => [player.element, player.position, player.color, player.name, player.clock]), [
        ['top', 'top', 'white', 'inemuri', '2:59'],
        ['bottom', 'bottom', 'black', 'GuestSMND', '3:00']
    ]);
});

test('positive terminal grammar remains authoritative without broad disconnect matching', () => {
    const client = loadClient();
    const cases = [
        ['Game 25: inemuri checkmated. 1-0', 'CHECKMATE'],
        ['Game 25: inemuri forfeits on time. 1-0', 'TIMEOUT'],
        ['Game 25: inemuri resigns. 1-0', 'RESIGNATION'],
        ['Game 25: Game drawn by agreement. 1/2-1/2', 'DRAW'],
        ['Game 25: Game aborted.', 'ABORT'],
        ['Game 25: Game adjourned.', 'ADJOURNED']
    ];
    for (const [line, reason] of cases) {
        const model = client.normalizeFicsGameResult(line);
        assert.equal(model.terminal, true, line);
        assert.equal(model.terminationReason, reason, line);
    }
    for (const advisory of [
        'Game 25: A disconnection will be considered a forfeit.',
        'Game 25: A disconnection may result in a forfeit warning.',
        'Game 25: Disconnect policy warning.',
        'Game 25: Repeated disconnections may result in a draw.'
    ]) {
        assert.equal(client.normalizeFicsGameResult(advisory).terminal, false, advisory);
    }
    const scoredDisconnect = client.normalizeFicsGameResult('Game 25: inemuri disconnected. 1-0');
    assert.equal(scoredDisconnect.terminal, true);
    assert.equal(scoredDisconnect.terminationReason, 'UNKNOWN');
});

test('accepted Guest Computer Hall intent remains Unrated in live Style12 state', () => {
    const pending = { targetHandle: 'rusalka', rated: false };
    const client = loadClient(pending);
    client.chess = { load: () => true };
    client.initBoard = () => {};
    client.recordStyle12Move = () => {};
    client.updateLiveGameUI = () => {};
    client.notifySpectator = () => {};
    client.handleStyle12SoundEvents = () => {};
    client.getActiveTableForGame = () => null;
    client.board = { orientation() {}, position() {} };
    client.handleStyle12({ gameNumber: 10, whiteName: 'rusalka', blackName: 'GuestBGCP', relation: -1, userColor: 'b', sideToMove: 'w',
        whiteClock: 180, blackClock: 180, initialTime: 3, increment: 2, fen: '8/8/8/8/8/8/8/8 w - - 0 1', observedGame: false });
    assert.equal(client.liveGame.rated, false);
    const { section } = loadYahoo();
    section.liveGame = { rated: client.liveGame.rated };
    assert.equal(section.getLiveRatedLabel(null), 'Unrated');
});

test('board sizing is square and bounded by both dimensions', () => {
    const { section } = loadYahoo();
    assert.equal(section.calculateClassicBoardSize({ availableWidth: 700, availableHeight: 420 }), 416);
    assert.equal(section.calculateClassicBoardSize({ availableWidth: 390, availableHeight: 700 }), 384);
    assert.equal(section.calculateClassicBoardSize({ availableWidth: 900, availableHeight: 900 }), 616);
});

test('edge-piece containment rules preserve exact square-relative dimensions', () => {
    assert.match(yahooCss, /\.yc-classic-board \.piece-417db\s*\{[^}]*width:\s*100%\s*!important/s);
    assert.match(yahooCss, /\.yc-classic-board \.square-55d63\s*\{[^}]*height:\s*auto\s*!important[^}]*aspect-ratio:\s*1\s*\/\s*1/s);
    assert.match(yahooCss, /\.yc-classic-board \.board-b72b1\s*\{[^}]*height:\s*auto\s*!important/s);
    assert.match(yahooCss, /contain:\s*layout paint/);
});

test('terminal and aborted games expose Exit Table and return to Computer Hall without transport actions', () => {
    for (const terminal of [
        { status: 'ended', result: '1-0', resultModel: { terminal: true, terminationReason: 'CHECKMATE' } },
        { status: 'ended', result: '*', resultModel: { terminal: true, terminationReason: 'ABORT' } },
        { status: 'ended', result: '*', resultModel: { terminal: true, terminationReason: 'ADJOURNED' } }
    ]) {
        const { section, root } = loadYahoo();
        const socket = { readyState: 1 };
        const wire = [];
        root.CaissaFICSClient = {
            authenticated: true, gameActive: false, sessionGeneration: 7, ws: socket,
            liveGame: { gameNumber: 8, currentFen: 'start', observedGame: false, relation: 1, ...terminal },
            send: command => wire.push(command), abort: () => wire.push('abort'), resign: () => wire.push('resign')
        };
        section.tableOpen = true;
        section.currentTableId = 8;
        section.currentRoom = { name: 'Computer Hall', description: 'Computer play.' };
        section.liveGame = { ...root.CaissaFICSClient.liveGame };
        section.render = () => {};
        section.renderGameExperience = () => {};

        assert.equal(section.canExitTable(), true);
        assert.equal(section.leaveTable(), true);
        assert.equal(section.tableOpen, false);
        assert.equal(section.currentRoom.name, 'Computer Hall');
        assert.equal(root.CaissaFICSClient.authenticated, true);
        assert.equal(root.CaissaFICSClient.sessionGeneration, 7);
        assert.equal(root.CaissaFICSClient.ws, socket);
        assert.deepEqual(wire, []);
    }
});

test('active playable games cannot be silently abandoned through Exit Table', () => {
    const { section, root } = loadYahoo();
    const wire = [];
    root.CaissaFICSClient = {
        authenticated: true, gameActive: true, sessionGeneration: 3, ws: { readyState: 1 }, myColor: 'white',
        liveGame: { gameNumber: 9, currentFen: 'start', observedGame: false, relation: 1, userColor: 'white', status: 'playing' },
        send: command => wire.push(command), abort: () => wire.push('abort'), resign: () => wire.push('resign')
    };
    section.tableOpen = true;
    section.currentTableId = 9;
    section.liveGame = { ...root.CaissaFICSClient.liveGame };
    section.render = () => {};

    assert.equal(section.canExitTable(), false);
    assert.equal(section.leaveTable(), false);
    assert.equal(section.tableOpen, true);
    assert.deepEqual(wire, []);
});

test('leaving an observed table reuses unobserve and never aborts or reconnects', () => {
    const { section, root } = loadYahoo();
    const wire = [];
    const socket = { readyState: 1 };
    root.CaissaFICSClient = {
        authenticated: true, gameActive: false, sessionGeneration: 4, ws: socket,
        liveGame: { gameNumber: 11, currentFen: 'start', observedGame: true, relation: 0, status: 'observing' },
        leaveObservedGame: gameNumber => { wire.push(`unobserve ${gameNumber}`); return true; }
    };
    section.tableOpen = true;
    section.currentTableId = 11;
    section.currentRoom = { name: 'CAISSA Lobby', description: 'Lobby.' };
    section.liveGame = { ...root.CaissaFICSClient.liveGame };
    section.render = () => {};
    section.renderGameExperience = () => {};

    assert.equal(section.leaveTable(), true);
    assert.deepEqual(wire, ['unobserve 11']);
    assert.equal(root.CaissaFICSClient.ws, socket);
    assert.equal(root.CaissaFICSClient.sessionGeneration, 4);
});
