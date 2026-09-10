import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const clientSource = fs.readFileSync(new URL('../js/fics-client.js', import.meta.url), 'utf8');
const style12Source = fs.readFileSync(new URL('../js/fics-style12.js', import.meta.url), 'utf8');

function createHarness() {
    const timeoutTasks = [];
    const intervalTasks = [];
    class FakeWebSocket {
        static CONNECTING = 0;
        static OPEN = 1;
        static CLOSING = 2;
        static CLOSED = 3;
        static instances = [];

        constructor(url) {
            this.url = url;
            this.readyState = FakeWebSocket.CONNECTING;
            this.sent = [];
            this.closed = [];
            FakeWebSocket.instances.push(this);
        }

        send(message) {
            this.sent.push(message);
        }

        close(code, reason) {
            this.readyState = FakeWebSocket.CLOSED;
            this.closed.push({ code, reason });
        }

        open() {
            this.readyState = FakeWebSocket.OPEN;
            this.onopen?.();
        }

        closeFromNetwork(code = 1006, reason = '') {
            this.readyState = FakeWebSocket.CLOSED;
            this.onclose?.({ code, reason });
        }
    }

    const events = [];
    const root = {
        location: { hostname: '127.0.0.1', protocol: 'http:' },
        addEventListener() {},
        dispatchEvent(event) { events.push(event); },
        ClassicComputerChallenge: { snapshot: () => ({ pending: null }) }
    };
    class FakeCustomEvent {
        constructor(type, options = {}) { this.type = type; this.detail = options.detail; }
    }
    const document = { readyState: 'loading', addEventListener() {}, getElementById() { return null; }, querySelectorAll() { return []; } };
    const context = {
        window: root,
        document,
        console,
        WebSocket: FakeWebSocket,
        CustomEvent: FakeCustomEvent,
        performance: { now: () => 100 },
        setTimeout(callback, delay) { timeoutTasks.push({ callback, delay }); return timeoutTasks.length; },
        clearTimeout() {},
        setInterval(callback, delay) { intervalTasks.push({ callback, delay }); return intervalTasks.length; },
        clearInterval() {},
        Chess: class { load() { return true; } reset() {} game_over() { return false; } }
    };
    context.globalThis = root;
    vm.runInNewContext(style12Source, context, { filename: 'fics-style12.js' });
    vm.runInNewContext(clientSource, context, { filename: 'fics-client.js' });
    const client = root.CaissaFICSClient;
    client.elements = {};
    client.configureGateway();
    return { client, FakeWebSocket, timeoutTasks, intervalTasks, events };
}

function prepareLiveRendering(client) {
    client.chess = { load: () => true, reset() {} };
    client.initBoard = () => {};
    client.board = { orientation() {}, position() {} };
    client.updateLiveGameUI = () => {};
    client.handleStyle12SoundEvents = () => {};
    client.renderMoveList = () => {};
    client.updatePlayerBars = () => {};
}

test('guest prompt sequence authenticates once and installs the existing session commands', () => {
    const { client, FakeWebSocket } = createHarness();
    const socket = new FakeWebSocket(client.gatewayUrl);
    socket.readyState = FakeWebSocket.OPEN;
    client.ws = socket;
    client.connected = true;
    client.loginMode = 'guest';

    client.handleRawGatewayData('login:');
    client.handleRawGatewayData('Press return to enter the server');
    client.handleRawGatewayData('Starting FICS session as GuestABCD\nfics%');

    assert.equal(client.authenticated, true);
    assert.equal(client.connectionState, 'connected');
    assert.equal(client.ficsUsername, 'GuestABCD');
    assert.equal(client.sessionGeneration, 1);
    assert.deepEqual(socket.sent, ['guest', '', 'sought', 'games', 'set style 12', 'set interface CAISSA Chess']);
});

test('registered prompt sequence sends the supplied credentials once and clears the password reference', () => {
    const { client, FakeWebSocket } = createHarness();
    const socket = new FakeWebSocket(client.gatewayUrl);
    socket.readyState = FakeWebSocket.OPEN;
    client.ws = socket;
    client.connected = true;
    client.loginMode = 'account';
    client.accountUsername = 'RegisteredUser';
    client.pendingAccountPassword = 'fixture-secret';

    client.handleRawGatewayData('login:');
    client.handleRawGatewayData('password:');
    client.handleRawGatewayData('Press return to enter the server');
    client.handleRawGatewayData('Starting FICS session as RegisteredUser\nfics%');

    assert.equal(client.authenticated, true);
    assert.equal(client.ficsUsername, 'RegisteredUser');
    assert.equal(client.pendingAccountPassword, null);
    assert.deepEqual(socket.sent, [
        'RegisteredUser', 'fixture-secret', '', 'sought', 'games',
        'set style 12', 'set interface CAISSA Chess'
    ]);
    assert.equal(socket.sent.filter((item) => item === 'fixture-secret').length, 1);
});

test('connection remains authenticating after WebSocket open until a FICS session prompt confirms auth', () => {
    const { client, FakeWebSocket } = createHarness();
    client.connect('guest');
    const socket = FakeWebSocket.instances[0];
    assert.equal(client.connectionState, 'connecting');
    assert.equal(client.authenticated, false);
    socket.open();
    assert.equal(client.connected, true);
    assert.equal(client.connectionState, 'connecting');
    assert.equal(client.authenticated, false);
    client.handleRawGatewayData('Starting FICS session as GuestOPEN\nfics%');
    assert.equal(client.connectionState, 'connected');
    assert.equal(client.authenticated, true);
});

test('abnormal guest close schedules reconnect and retains stale live-game state', () => {
    const { client, FakeWebSocket, timeoutTasks } = createHarness();
    client.connect('guest');
    const socket = FakeWebSocket.instances[0];
    socket.open();
    client.authenticated = true;
    client.connectionState = 'connected';
    client.gameActive = true;
    client.liveGame = { ...client.liveGame, gameNumber: 41, currentFen: 'retained-fen', gameActive: true, status: 'playing' };

    socket.closeFromNetwork(1006, 'network lost');

    assert.equal(client.connected, false);
    assert.equal(client.authenticated, false);
    assert.equal(client.connectionState, 'reconnecting');
    assert.equal(client.reconnectAttempts, 1);
    assert.equal(client.liveGame.gameNumber, 41);
    assert.equal(client.liveGame.currentFen, 'retained-fen');
    assert.equal(timeoutTasks.some((task) => task.delay === 1500), true);
});

test('abnormal registered close does not reconnect and resets the live session', () => {
    const { client, FakeWebSocket, timeoutTasks } = createHarness();
    client.elements.accountUsernameInput = { value: 'RegisteredUser', disabled: false };
    client.elements.accountPasswordInput = { value: 'fixture-secret', disabled: false };
    client.connect('account');
    const socket = FakeWebSocket.instances[0];
    socket.open();
    client.authenticated = true;
    client.connectionState = 'connected';
    client.liveGame = { ...client.liveGame, gameNumber: 42, currentFen: 'registered-fen', gameActive: true, status: 'playing' };

    socket.closeFromNetwork(1006, 'network lost');

    assert.equal(client.authenticated, false);
    assert.equal(client.connectionState, 'error');
    assert.equal(client.reconnectAttempts, 0);
    assert.equal(client.liveGame.gameNumber, null);
    assert.equal(client.liveGame.currentFen, null);
    assert.equal(timeoutTasks.some((task) => task.delay === 1500), false);
});

test('sought and games transcripts populate the existing bounded lobby collections', () => {
    const { client } = createHarness();
    client.renderSeekActions = () => {};
    client.renderRoomTables = () => {};

    client.parseSeekLine('1200 PlayerOne [ blitz 5 0 ] seeking an unrated game; type play 17');
    client.parseActiveGameLine('23 1500 WhitePlayer 1600 BlackPlayer [ 3 2 ]');

    assert.equal(client.seekActions.length, 1);
    assert.equal(client.seekActions[0].number, '17');
    assert.equal(client.seekActions[0].details.timeControl, '5+0');
    assert.equal(client.activeTables.length, 1);
    assert.deepEqual({ ...client.activeTables[0] }, {
        number: '23', white: 'WhitePlayer', black: 'BlackPlayer', whiteRating: '1500', blackRating: '1600',
        timeControl: '3+2', observers: '', label: '23 1500 WhitePlayer 1600 BlackPlayer [ 3 2 ]'
    });
});

test('basic pending seek creation and cancellation retain the existing wire grammar', () => {
    const { client, FakeWebSocket } = createHarness();
    const socket = new FakeWebSocket(client.gatewayUrl);
    socket.readyState = FakeWebSocket.OPEN;
    client.ws = socket;
    client.authenticated = true;
    client.renderRoomTables = () => {};

    client.seek(5, 0);
    assert.deepEqual({ ...client.pendingSeek }, {
        minutes: 5, increment: 0, timeControl: '5+0', rated: null, color: 'random',
        label: 'Your active seek', status: 'pending', operation: 'create', error: null,
        deliveryCode: 'SENT'
    });
    assert.deepEqual(socket.sent, ['seek 5 0']);
    client.cancelSeek();
    assert.equal(client.pendingSeek.status, 'cancel_requested');
    assert.equal(client.pendingSeek.operation, 'cancel');
    assert.deepEqual(socket.sent, ['seek 5 0', 'unseek']);
});

test('canonical seek API validates and maps time rating and color without shell mutation', () => {
    const { client, FakeWebSocket } = createHarness();
    const socket = new FakeWebSocket(client.gatewayUrl);
    socket.readyState = FakeWebSocket.OPEN;
    client.ws = socket;
    client.authenticated = true;
    client.renderRoomTables = () => {};

    assert.equal(client.requestSeek({ minutes: 0, increment: 2, rated: true, color: 'white' }).code, 'INVALID_TIME');
    assert.equal(client.requestSeek({ minutes: 5, increment: 61, rated: true, color: 'white' }).code, 'INVALID_INCREMENT');
    assert.equal(client.requestSeek({ minutes: 5, increment: 2, rated: 'unknown', color: 'white' }).code, 'INVALID_RATING_MODE');
    assert.equal(client.requestSeek({ minutes: 5, increment: 2, rated: true, color: 'green' }).code, 'INVALID_COLOR');
    assert.deepEqual(socket.sent, []);

    const result = client.requestSeek({ minutes: 10, increment: 5, rated: 'rated', color: 'black' });
    assert.equal(result.ok, true);
    assert.equal(result.state, 'pending');
    assert.equal(client.pendingSeek.rated, true);
    assert.equal(client.pendingSeek.color, 'black');
    assert.deepEqual(socket.sent, ['seek 10 5 rated black']);
});

test('canonical seek API represents delivery and cancellation failure honestly', () => {
    const { client, FakeWebSocket } = createHarness();
    const socket = new FakeWebSocket(client.gatewayUrl);
    client.ws = socket;
    client.authenticated = true;
    client.renderRoomTables = () => {};

    const failedCreate = client.requestSeek({ minutes: 3, increment: 0, rated: false, color: 'random' });
    assert.equal(failedCreate.code, 'SOCKET_NOT_OPEN');
    assert.equal(client.pendingSeek.status, 'error');
    assert.equal(client.pendingSeek.operation, 'create');

    socket.readyState = FakeWebSocket.OPEN;
    assert.equal(client.requestSeek({ minutes: 3, increment: 0, rated: false, color: 'white' }).ok, true);
    socket.readyState = FakeWebSocket.CLOSED;
    const failedCancel = client.cancelSeek();
    assert.equal(failedCancel.code, 'SOCKET_NOT_OPEN');
    assert.equal(client.pendingSeek.status, 'error');
    assert.equal(client.pendingSeek.operation, 'cancel');
});

test('canonical observation method blocks duplicate delivery and active local-game replacement', () => {
    const { client, FakeWebSocket } = createHarness();
    const socket = new FakeWebSocket(client.gatewayUrl);
    socket.readyState = FakeWebSocket.OPEN;
    client.ws = socket;
    client.authenticated = true;
    client.updateGameStatus = () => {};
    client.logToConsole = () => {};
    client.cancelPromotionSelection = () => {};

    assert.equal(client.switchObservedGame(42).ok, true);
    assert.equal(client.switchObservedGame(42).code, 'OBSERVE_IN_PROGRESS');
    assert.deepEqual(socket.sent, ['observe 42']);

    client.pendingObservation = null;
    client.gameActive = true;
    client.liveGame = { ...client.liveGame, status: 'playing', observedGame: false };
    assert.equal(client.switchObservedGame(43).code, 'ACTIVE_LOCAL_GAME');
    assert.deepEqual(socket.sent, ['observe 42']);
});

test('canonical observation switch preserves the supported unobserve then observe sequence', () => {
    const { client, FakeWebSocket, timeoutTasks } = createHarness();
    const socket = new FakeWebSocket(client.gatewayUrl);
    socket.readyState = FakeWebSocket.OPEN;
    client.ws = socket;
    client.authenticated = true;
    client.sessionGeneration = 3;
    client.liveGame = { ...client.liveGame, gameNumber: 42, status: 'observing', observedGame: true };
    client.updateGameStatus = () => {};
    client.logToConsole = () => {};
    client.cancelPromotionSelection = () => {};

    const result = client.switchObservedGame(43);
    assert.equal(result.code, 'SWITCH_REQUESTED');
    assert.deepEqual(socket.sent, ['unobserve 42']);
    const delayedObserve = timeoutTasks.find((task) => task.delay === 250);
    assert.ok(delayedObserve);
    delayedObserve.callback();
    assert.deepEqual(socket.sent, ['unobserve 42', 'observe 43']);
    assert.equal(client.pendingObservation.target, '43');
    assert.equal(client.pendingObservation.status, 'sent');
});

test('Style12 remains authoritative for playing, observing, and game-ended transitions', () => {
    const { client } = createHarness();
    prepareLiveRendering(client);
    const base = {
        gameNumber: 51, whiteName: 'WhitePlayer', blackName: 'BlackPlayer', sideToMove: 'w', lastMove: 'none',
        whiteClock: 300, blackClock: 300, initialTime: 5, increment: 0,
        fen: '8/8/8/8/8/8/8/8 w - - 0 1', moveNumber: 1
    };

    client.handleStyle12({ ...base, relation: 1, userColor: 'w', observedGame: false });
    assert.equal(client.liveGame.status, 'playing');
    assert.equal(client.gameActive, true);
    client.handleStyle12({ ...base, gameNumber: 52, relation: 0, userColor: null, observedGame: true });
    assert.equal(client.liveGame.status, 'observing');
    assert.equal(client.gameActive, false);
    client.handleGameEnd('Game 52: WhitePlayer resigns. 0-1');
    assert.equal(client.liveGame.status, 'ended');
    assert.equal(client.liveGame.result, '0-1');
    assert.equal(client.liveGame.resultModel.terminal, true);
});

test('PGN is always buildable, while an observed mid-game record uses SetUp and may be incomplete', () => {
    const { client } = createHarness();
    const emptyPgn = client.buildPGN();
    assert.match(emptyPgn, /\[Result "\*"\]/);
    assert.match(emptyPgn, /\n\n\*\n$/);

    client.liveGame = {
        ...client.liveGame, gameNumber: 61, whiteName: 'WhitePlayer', blackName: 'BlackPlayer', observedGame: true,
        currentFen: '8/8/8/8/8/8/8/K6k b - - 0 20', initialTime: 5, increment: 0
    };
    client.pgnStartFen = '8/8/8/8/8/8/8/K6k b - - 0 20';
    client.moveHistory = [{ moveNumber: 20, color: 'black', san: 'Kh2', fen: '8/8/8/8/8/8/7k/K7 w - - 1 21' }];
    const partial = client.buildPGN();
    assert.match(partial, /\[SetUp "1"\]/);
    assert.match(partial, /\[FEN "8\/8\/8\/8\/8\/8\/8\/K6k b - - 0 20"\]/);
    assert.match(partial, /20\. \.\.\. Kh2 \*/);
});

test('played-game actions report delivery, reject duplicates, and fail closed without a command channel', () => {
    const { client, FakeWebSocket, timeoutTasks } = createHarness();
    const socket = new FakeWebSocket(client.gatewayUrl);
    socket.readyState = FakeWebSocket.OPEN;
    client.ws = socket;
    client.connected = true;
    client.authenticated = true;
    client.connectionState = 'connected';
    client.gameActive = true;
    client.liveGame = { ...client.liveGame, gameActive: true, observedGame: false, status: 'playing' };
    client.logToConsole = () => {};

    assert.equal(client.runPlayedGameAction('abort').code, 'ACTION_UNAVAILABLE');
    assert.deepEqual(socket.sent, []);
    const first = client.resign();
    const duplicate = client.resign();
    assert.equal(first.ok, true);
    assert.equal(first.serverAcknowledged, false);
    assert.equal(duplicate.code, 'ACTION_IN_PROGRESS');
    assert.deepEqual(socket.sent, ['resign']);

    timeoutTasks.find((task) => task.delay === 1500).callback();
    assert.equal(client.offerDraw().ok, true);
    assert.deepEqual(socket.sent, ['resign', 'draw']);

    client.connectionState = 'reconnecting';
    client.pendingGameActions = { resign: false, draw: false };
    assert.equal(client.resign().code, 'CONNECTION_UNAVAILABLE');
    assert.deepEqual(socket.sent, ['resign', 'draw']);
});

test('observation exit clears canonical state only after successful unobserve delivery', () => {
    const { client, FakeWebSocket } = createHarness();
    const socket = new FakeWebSocket(client.gatewayUrl);
    client.ws = socket;
    client.connected = true;
    client.authenticated = true;
    client.connectionState = 'connected';
    client.liveGame = { ...client.liveGame, gameNumber: 91, currentFen: 'observed-fen', observedGame: true, status: 'observing' };
    prepareLiveRendering(client);
    client.updateGameStatus = () => {};
    client.logToConsole = () => {};
    client.refreshLobby = () => {};

    socket.readyState = FakeWebSocket.CLOSED;
    const failed = client.leaveObservedGame(91);
    assert.equal(failed.ok, false);
    assert.equal(client.liveGame.observedGame, true);

    socket.readyState = FakeWebSocket.OPEN;
    const delivered = client.leaveObservedGame(91);
    assert.equal(delivered.ok, true);
    assert.equal(delivered.serverAcknowledged, false);
    assert.deepEqual(socket.sent, ['unobserve 91']);
    assert.equal(client.liveGame.status, 'idle');
    assert.equal(client.moveHistory.length, 0);
});

test('console buffering is capped and expansion remains legacy DOM presentation state', () => {
    const { client } = createHarness();
    client.maxBufferSize = 3;
    client.elements.console = { textContent: '', scrollTop: 0, scrollHeight: 10 };
    client.elements.consoleContainer = { style: { display: '' } };
    client.elements.consoleToggle = { textContent: '', setAttribute() {} };
    ['one', 'two', 'three', 'four'].forEach((line) => client.logToConsole(line));
    assert.deepEqual(Array.from(client.messageBuffer), ['[CAISSA] two', '[CAISSA] three', '[CAISSA] four']);
    assert.equal(client.elements.console.textContent, '[CAISSA] two\n[CAISSA] three\n[CAISSA] four');
    client.toggleConsole();
    assert.equal(client.elements.consoleContainer.style.display, 'none');
    client.toggleConsole();
    assert.equal(client.elements.consoleContainer.style.display, 'block');
});

test('first FICS entry starts exactly one automatic guest connection attempt', () => {
    const { client, FakeWebSocket } = createHarness();
    client.initBoard = () => {};
    client.updatePlayerBars = () => {};
    client.messageBuffer = [];

    client.onEnter();
    client.onEnter();

    assert.equal(FakeWebSocket.instances.length, 1);
    assert.equal(client.autoGuestAttempted, true);
    assert.equal(client.loginMode, 'guest');
    assert.equal(client.connectionState, 'connecting');
    assert.equal(client.messageBuffer.filter(line => line === '[CAISSA] Connecting to FICS as guest...').length, 1);
});

test('duplicate connect calls cannot construct a second WebSocket', () => {
    const { client, FakeWebSocket } = createHarness();
    assert.equal(client.connect('guest').ok, true);
    assert.equal(client.connect('guest').code, 'CONNECTION_ALREADY_ACTIVE');
    assert.equal(FakeWebSocket.instances.length, 1);
});

test('retained registered session is never replaced by automatic guest entry', () => {
    const { client, FakeWebSocket } = createHarness();
    const socket = new FakeWebSocket(client.gatewayUrl);
    socket.readyState = FakeWebSocket.OPEN;
    Object.assign(client, {
        ws: socket, connected: true, authenticated: true, connectionState: 'connected',
        loginMode: 'account', ficsUsername: 'RegisteredUser'
    });

    assert.equal(client.requestAutomaticGuestConnection().code, 'SESSION_RETAINED');
    assert.equal(client.loginMode, 'account');
    assert.equal(client.ficsUsername, 'RegisteredUser');
    assert.equal(FakeWebSocket.instances.length, 1);
});

test('route leave and return retain the authenticated socket and do not restart guest login', () => {
    const { client, FakeWebSocket } = createHarness();
    client.initBoard = () => {};
    client.updatePlayerBars = () => {};
    client.onEnter();
    const socket = FakeWebSocket.instances[0];
    socket.open();
    Object.assign(client, { authenticated: true, connectionState: 'connected', ficsUsername: 'GuestRoute' });

    client.onExit();
    client.onEnter();

    assert.strictEqual(client.ws, socket);
    assert.equal(client.authenticated, true);
    assert.equal(FakeWebSocket.instances.length, 1);
});

test('canonical bounded guest reconnect can start a replacement socket', () => {
    const { client, FakeWebSocket, timeoutTasks } = createHarness();
    client.connect('guest');
    const first = FakeWebSocket.instances[0];
    first.open();
    Object.assign(client, { authenticated: true, connectionState: 'connected' });
    first.closeFromNetwork(1006, 'network lost');

    const reconnect = timeoutTasks.find(task => task.delay === 1500);
    assert.ok(reconnect);
    reconnect.callback();

    assert.equal(FakeWebSocket.instances.length, 2);
    assert.equal(client.connectionState, 'reconnecting');
    assert.equal(client.reconnectAttempts, 1);
});

test('registered switch reuses canonical credential path and stale guest callbacks are isolated', () => {
    const { client, FakeWebSocket } = createHarness();
    const guestSocket = new FakeWebSocket(client.gatewayUrl);
    guestSocket.readyState = FakeWebSocket.OPEN;
    Object.assign(client, {
        ws: guestSocket, connected: true, authenticated: true, connectionState: 'connected',
        loginMode: 'guest', ficsUsername: 'GuestSwitch'
    });
    client.elements.accountUsernameInput = { value: 'RegisteredUser', disabled: false };
    client.elements.accountPasswordInput = { value: 'fixture-secret', disabled: false };
    client.messageBuffer = [];

    const result = client.connectAsRegistered();
    const accountSocket = FakeWebSocket.instances[1];
    assert.equal(result.ok, true);
    assert.equal(client.loginMode, 'account');
    assert.equal(client.pendingAccountPassword, 'fixture-secret');
    assert.equal(client.elements.accountPasswordInput.value, '');
    assert.strictEqual(client.ws, accountSocket);
    guestSocket.closeFromNetwork(1006, 'late guest close');
    assert.strictEqual(client.ws, accountSocket);
    assert.equal(client.connectionState, 'connecting');
    assert.equal(client.messageBuffer.some(line => line.includes('fixture-secret')), false);
});

test('authenticated welcome guidance is generation-bound and deduplicated', () => {
    const { client } = createHarness();
    Object.assign(client, {
        authenticated: true, loginMode: 'guest', ficsUsername: 'GuestWelcome',
        sessionGeneration: 4, welcomedSessionGeneration: 0, messageBuffer: []
    });

    assert.equal(client.announceAuthenticatedSession(), true);
    assert.equal(client.announceAuthenticatedSession(), false);
    assert.deepEqual(Array.from(client.messageBuffer), [
        '[CAISSA] Connected as GuestWelcome.',
        '[CAISSA] Choose Tables to observe games or Seek to create a game.',
        '[CAISSA] Open the session menu above to connect with a registered FICS account.'
    ]);
});

test('manual guest retry remains available after automatic failure', () => {
    const { client, FakeWebSocket } = createHarness();
    assert.equal(client.requestAutomaticGuestConnection().ok, true);
    const failed = FakeWebSocket.instances[0];
    failed.readyState = FakeWebSocket.CLOSED;
    client.ws = null;
    client.connected = false;
    client.connectionState = 'error';

    assert.equal(client.connect('guest').ok, true);
    assert.equal(FakeWebSocket.instances.length, 2);
});
