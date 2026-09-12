import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const recoverySource = fs.readFileSync(new URL('../js/fics-observe-recovery.js', import.meta.url), 'utf8');
const style12Source = fs.readFileSync(new URL('../js/fics-style12.js', import.meta.url), 'utf8');
const clientSource = fs.readFileSync(new URL('../js/fics-client.js', import.meta.url), 'utf8');

function createStorage() {
    const values = new Map();
    return {
        getItem(key) { return values.has(key) ? values.get(key) : null; },
        setItem(key, value) { values.set(key, String(value)); },
        removeItem(key) { values.delete(key); }
    };
}

function createHarness(storage = createStorage()) {
    const timeoutTasks = [];
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
            FakeWebSocket.instances.push(this);
        }
        send(message) { this.sent.push(message); }
        close(code, reason) {
            this.readyState = FakeWebSocket.CLOSED;
            this.closed = { code, reason };
        }
    }
    const root = {
        location: { hostname: '127.0.0.1', protocol: 'http:' },
        sessionStorage: storage,
        CAISSA_FICS_PERSISTENT_BOARD_PILOT: true,
        CaissaFICSBoardView: { featureEnabled: () => true },
        ClassicComputerChallenge: { snapshot: () => ({ pending: null }) },
        addEventListener() {},
        dispatchEvent() {}
    };
    const document = {
        readyState: 'loading', body: null,
        addEventListener() {}, getElementById() { return null; }, querySelectorAll() { return []; }
    };
    const context = {
        window: root, document, console, WebSocket: FakeWebSocket,
        CustomEvent: class { constructor(type, options = {}) { this.type = type; this.detail = options.detail; } },
        performance: { now: () => 100 },
        setTimeout(callback, delay) { timeoutTasks.push({ callback, delay }); return timeoutTasks.length; },
        clearTimeout() {}, setInterval() { return 1; }, clearInterval() {},
        Chess: class { load() { return true; } reset() {} game_over() { return false; } }
    };
    context.globalThis = root;
    vm.runInNewContext(recoverySource, context, { filename: 'fics-observe-recovery.js' });
    vm.runInNewContext(style12Source, context, { filename: 'fics-style12.js' });
    vm.runInNewContext(clientSource, context, { filename: 'fics-client.js' });
    const client = root.CaissaFICSClient;
    client.elements = {};
    client.configureGateway();
    return { root, client, FakeWebSocket, storage, timeoutTasks };
}

function prepareClient(client, FakeWebSocket) {
    const socket = new FakeWebSocket(client.gatewayUrl);
    socket.readyState = FakeWebSocket.OPEN;
    Object.assign(client, {
        ws: socket, connected: true, authenticated: true, connectionState: 'connected',
        loginMode: 'guest', sessionGeneration: 1
    });
    client.chess = { load: () => true, reset() {}, game_over: () => false };
    client.initBoard = () => {};
    client.board = { orientation() {}, position() {}, resize() {} };
    client.recordStyle12Move = () => {};
    client.updateLiveGameUI = () => {};
    client.updatePlayerBars = () => {};
    client.handleStyle12SoundEvents = () => {};
    client.renderMoveList = () => {};
    return socket;
}

function observedState(gameNumber = 23) {
    return {
        gameNumber, whiteName: 'FixtureWhite', blackName: 'FixtureBlack',
        relation: 0, observedGame: true, userColor: null, sideToMove: 'w',
        lastMove: 'none', whiteClock: 180, blackClock: 180, initialTime: 3,
        increment: 0, fen: '8/8/8/8/8/8/8/8 w - - 0 1'
    };
}

test('Observe recovery record is session-scoped, short-lived and excludes board/auth state', () => {
    const storage = createStorage();
    const root = { sessionStorage: storage };
    const context = { window: root, globalThis: root, console };
    vm.runInNewContext(recoverySource, context, { filename: 'fics-observe-recovery.js' });
    const now = 1_000_000;
    const controller = root.CaissaFICSObserveRecovery.createController({ storage, now: () => now });
    const record = controller.write(observedState(), 'black');

    assert.equal(record.expiresAt - record.observedAt, 5 * 60 * 1000);
    assert.deepEqual(Object.keys(record).sort(), [
        'expiresAt', 'gameNumber', 'observedAt', 'orientation', 'participantFingerprint', 'schemaVersion'
    ]);
    assert.equal(record.orientation, 'black');
    assert.equal(JSON.stringify(record).includes('FixtureWhite'), false);
    assert.equal(JSON.stringify(record).includes('fen'), false);
    assert.equal(JSON.stringify(record).includes('password'), false);
});

test('expired, unavailable and ambiguously reused games fail closed', () => {
    const storage = createStorage();
    const root = { sessionStorage: storage };
    const context = { window: root, globalThis: root, console };
    vm.runInNewContext(recoverySource, context, { filename: 'fics-observe-recovery.js' });
    let now = 10_000;
    const controller = root.CaissaFICSObserveRecovery.createController({ storage, now: () => now });
    controller.write(observedState());
    assert.equal(controller.assess([], { lobbySettled: false }).code, 'WAITING_FOR_LOBBY');
    assert.equal(controller.assess([], { lobbySettled: true }).code, 'GAME_UNAVAILABLE');
    assert.equal(controller.assess([{ number: 23, white: 'OtherWhite', black: 'OtherBlack' }], { lobbySettled: true }).code, 'AMBIGUOUS_GAME');
    now += 5 * 60 * 1000 + 1;
    assert.equal(controller.read(), null);
});

test('reload recovery validates Tables and emits one Observe on the existing socket', () => {
    const storage = createStorage();
    const first = createHarness(storage);
    prepareClient(first.client, first.FakeWebSocket);
    first.client.handleStyle12(observedState());
    assert.equal(first.root.CaissaFICSObserveRecovery.read().gameNumber, '23');

    const reloaded = createHarness(storage);
    const socket = prepareClient(reloaded.client, reloaded.FakeWebSocket);
    reloaded.client.lobbyRefreshInFlight = true;
    reloaded.client.activeTables = [{ number: '23', white: 'FixtureWhite', black: 'FixtureBlack', timeControl: '3+0' }];
    reloaded.client.renderRoomTables();
    reloaded.client.renderRoomTables();

    assert.deepEqual(socket.sent, ['observe 23']);
    assert.equal(reloaded.FakeWebSocket.instances.length, 1);
    assert.equal(reloaded.client.getObserveRecoverySnapshot().target, '23');
    reloaded.client.handleStyle12(observedState());
    assert.equal(reloaded.client.getObserveRecoverySnapshot().target, null);
    assert.equal(reloaded.client.liveGame.currentFen, observedState().fen);
});

test('settled lobby without the saved game clears recovery without Observe spam', () => {
    const storage = createStorage();
    const initial = createHarness(storage);
    initial.root.CaissaFICSObserveRecovery.write(observedState());
    const reloaded = createHarness(storage);
    const socket = prepareClient(reloaded.client, reloaded.FakeWebSocket);
    reloaded.client.lobbyRefreshInFlight = false;
    reloaded.client.activeTables = [];
    reloaded.client.renderRoomTables();
    reloaded.client.renderRoomTables();
    assert.deepEqual(socket.sent, []);
    assert.equal(reloaded.root.CaissaFICSObserveRecovery.read(), null);
});

test('server rejection clears a recovery request deterministically', () => {
    const { root, client, FakeWebSocket } = createHarness();
    root.CaissaFICSObserveRecovery.write(observedState());
    const socket = prepareClient(client, FakeWebSocket);
    client.lobbyRefreshInFlight = true;
    client.activeTables = [{ number: '23', white: 'FixtureWhite', black: 'FixtureBlack' }];
    client.renderRoomTables();
    assert.deepEqual(socket.sent, ['observe 23']);
    assert.equal(client.handleObservationFailureLine('There is no such game.'), true);
    assert.equal(root.CaissaFICSObserveRecovery.read(), null);
    assert.equal(client.pendingObservation, null);
});

test('intentional Leave Observation and Disconnect clear recovery', () => {
    for (const action of ['leave', 'disconnect']) {
        const { root, client, FakeWebSocket } = createHarness();
        const socket = prepareClient(client, FakeWebSocket);
        client.handleStyle12(observedState());
        assert.ok(root.CaissaFICSObserveRecovery.read());
        if (action === 'leave') {
            client.leaveObservedGame();
            assert.deepEqual(socket.sent, ['unobserve 23']);
        } else {
            client.disconnect();
            assert.deepEqual(socket.sent, ['quit']);
        }
        assert.equal(root.CaissaFICSObserveRecovery.read(), null, action);
    }
});

test('game end clears Observe recovery and playable state is never persisted', () => {
    const { root, client, FakeWebSocket } = createHarness();
    prepareClient(client, FakeWebSocket);
    client.handleStyle12(observedState());
    assert.ok(root.CaissaFICSObserveRecovery.read());
    client.handleGameEnd('Game 23: FixtureBlack resigns. 1-0');
    assert.equal(root.CaissaFICSObserveRecovery.read(), null);
    client.setBoardOrientation('black', true);
    assert.equal(root.CaissaFICSObserveRecovery.read(), null, 'ended observation cannot be re-persisted');

    const playing = { ...observedState(24), observedGame: false, relation: 1, userColor: 'w' };
    assert.equal(root.CaissaFICSObserveRecovery.write(playing), null);
    assert.equal(root.CaissaFICSObserveRecovery.read(), null);
});
