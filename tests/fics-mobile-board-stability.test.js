import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const clientSource = fs.readFileSync(new URL('../js/fics-client.js', import.meta.url), 'utf8');
const shellSource = fs.readFileSync(new URL('../js/fics-layout-shell.js', import.meta.url), 'utf8');
const styles = fs.readFileSync(new URL('../css/fics-redesign-shell.css', import.meta.url), 'utf8');

class FakeChess {
    constructor(fen = 'start') { this.position = fen; }
    load(fen) { this.position = fen; return true; }
    reset() { this.position = 'start'; }
    game_over() { return false; }
    get(square) {
        if (square === 'e2' || square === 'd2') return { color: 'w', type: 'p' };
        if (square === 'e7') return { color: 'b', type: 'p' };
        return null;
    }
    move({ from, to }) {
        if (!['e2e4', 'd2d4'].includes(`${from}${to}`)) return null;
        this.position = `${from}-${to}`;
        return { from, to, promotion: null };
    }
    fen() { return this.position; }
}

function classList() {
    const values = new Set();
    return {
        add: (...names) => names.forEach(name => values.add(name)),
        remove: (...names) => names.forEach(name => values.delete(name)),
        contains: name => values.has(name),
        values
    };
}

function createBoardDom() {
    const listeners = new Map();
    const squares = new Map(['e2', 'e4', 'e5', 'd2', 'd4'].map(square => [square, {
        dataset: { square }, classList: classList(), closest() { return this; }
    }]));
    const piece = { draggable: true, attributes: {}, setAttribute(name, value) { this.attributes[name] = value; } };
    const container = {
        dataset: {}, attributes: {}, listeners, piece,
        addEventListener(type, listener) { listeners.set(type, listener); },
        querySelectorAll(selector) {
            if (selector === '.piece-417db') return [piece];
            if (selector === '.fics-tap-selected') return [...squares.values()].filter(node => node.classList.contains('fics-tap-selected'));
            return [];
        },
        querySelector(selector) { return squares.get(selector.replace('.square-', '')) || null; },
        setAttribute(name, value) { this.attributes[name] = value; }
    };
    return { container, squares, piece };
}

function loadClient() {
    const root = { location: { hostname: '127.0.0.1', protocol: 'http:' }, addEventListener() {} };
    const document = {
        readyState: 'loading', addEventListener() {}, getElementById() { return null; },
        querySelectorAll() { return []; }, elementFromPoint() { return null; }
    };
    const context = {
        window: root, document, console, Chess: FakeChess,
        performance: { now: (() => { let time = 0; return () => ++time; })() },
        setTimeout() {}, clearTimeout() {}
    };
    context.globalThis = root;
    vm.runInNewContext(clientSource, context, { filename: 'fics-client.js' });
    return { client: root.CaissaFICSClient, root, document };
}

function preparePlayableClient() {
    const loaded = loadClient();
    const dom = createBoardDom();
    const pendingState = { textContent: '', className: 'fics-pending-state', classList: { contains(name) { return this.owner.className.split(/\s+/).includes(name); }, owner: null } };
    pendingState.classList.owner = pendingState;
    Object.assign(loaded.client, {
        elements: { boardContainer: dom.container, pendingState },
        chess: new FakeChess(), board: { position() {}, orientation() {} },
        boardPositionKey: 'start', boardOrientation: 'white', gameActive: true, myColor: 'white',
        liveGame: { currentFen: 'start', relation: 1, sideToMove: 'w', observedGame: false },
        sendMove(move) { this.sentMoves.push(move); }, sentMoves: []
    });
    return { ...loaded, ...dom, pendingState };
}

test('mobile tap selection changes, clears and submits through the canonical onDrop path once', () => {
    const { client, squares, container } = preparePlayableClient();
    assert.equal(client.handleBoardTap('e2'), true);
    assert.equal(client.selectedBoardSquare, 'e2');
    assert.equal(squares.get('e2').classList.contains('fics-tap-selected'), true);
    assert.equal(container.dataset.selectedSquare, 'e2');
    assert.match(container.attributes['aria-label'], /e2 selected/);

    assert.equal(client.handleBoardTap('d2'), true);
    assert.equal(client.selectedBoardSquare, 'd2');
    assert.equal(squares.get('e2').classList.contains('fics-tap-selected'), false);
    assert.equal(client.handleBoardTap('d2'), true);
    assert.equal(client.selectedBoardSquare, null);

    assert.equal(client.handleBoardTap('e2'), true);
    assert.equal(client.handleBoardTap('e5'), false);
    assert.equal(client.selectedBoardSquare, 'e2');
    assert.deepEqual(client.sentMoves, []);

    assert.equal(client.handleBoardTap('e4'), true);
    assert.deepEqual(client.sentMoves, ['e2e4']);
    assert.equal(client.pendingMove.uci, 'e2e4');
    assert.equal(client.selectedBoardSquare, null);
    assert.equal(client.handleBoardTap('e2'), false);
    assert.deepEqual(client.sentMoves, ['e2e4']);
});

test('Observe and historical review fail closed without move submission', () => {
    const { client } = preparePlayableClient();
    client.setBoardSelectedSquare('e2');
    client.liveGame.observedGame = true;
    assert.equal(client.handleBoardTap('e4'), false);
    assert.equal(client.selectedBoardSquare, null);
    assert.deepEqual(client.sentMoves, []);

    client.liveGame.observedGame = false;
    client.isReviewingHistoricalPosition = () => true;
    client.setBoardSelectedSquare('e2');
    assert.equal(client.handleBoardTap('e4'), false);
    assert.equal(client.selectedBoardSquare, null);
    assert.deepEqual(client.sentMoves, []);
});

test('selection clears on Style12 confirmation, rollback, game end and session reset', () => {
    const { client } = preparePlayableClient();
    Object.assign(client, {
        recordStyle12Move() {}, updateLiveGameUI() {}, notifySpectator() {}, handleStyle12SoundEvents() {},
        getActiveTableForGame() { return null; }, logToConsole() {}, updateLatency() {}, updatePlayerBars() {},
        updateGameStatus() {}, resetGameRecord() {}
    });
    client.setBoardSelectedSquare('e2');
    client.pendingMove = { uci: 'e2e4', sentAt: 1 };
    client.handleStyle12({
        fen: 'e2-e4', gameNumber: 202, whiteName: 'MobileGuest', blackName: 'Opponent',
        relation: 1, userColor: 'w', sideToMove: 'b', lastMove: 'e4', whiteClock: 299,
        blackClock: 300, initialTime: 5, increment: 0, observedGame: false
    });
    assert.equal(client.selectedBoardSquare, null);
    assert.equal(client.pendingMove, null);

    client.setBoardSelectedSquare('e2');
    client.pendingMove = { uci: 'e2e4' };
    client.clearPendingMove(false);
    assert.equal(client.selectedBoardSquare, null);

    client.setBoardSelectedSquare('e2');
    assert.equal(client.handleGameEnd('Game 202: Opponent checkmated. 1-0'), true);
    assert.equal(client.selectedBoardSquare, null);

    client.setBoardSelectedSquare('e2');
    client.resetLiveSessionState();
    assert.equal(client.selectedBoardSquare, null);
    assert.equal(client.boardOrientation, 'white');
});

test('touch pointer taps survive retargeting while drags do not become taps', () => {
    const { client, container, squares, piece } = preparePlayableClient();
    const activations = [];
    client.handleBoardTap = square => { activations.push(square); return true; };
    client.bindBoardInputEvents();
    container.listeners.get('pointerdown')({ isPrimary: true, pointerType: 'touch', pointerId: 4, target: squares.get('e2'), clientX: 20, clientY: 20 });
    container.listeners.get('pointerup')({ pointerId: 4, target: container, clientX: 22, clientY: 21 });
    assert.deepEqual(activations, ['e2']);

    container.listeners.get('pointerdown')({ isPrimary: true, pointerType: 'touch', pointerId: 5, target: squares.get('e2'), clientX: 20, clientY: 20 });
    container.listeners.get('pointerup')({ pointerId: 5, target: squares.get('e4'), clientX: 70, clientY: 90 });
    assert.deepEqual(activations, ['e2']);
    assert.equal(piece.draggable, false);
    assert.equal(piece.attributes.draggable, 'false');
});

test('piece context menu and native image drag are prevented only on the scoped board surface', () => {
    const { client, container } = preparePlayableClient();
    client.bindBoardInputEvents();
    const pieceTarget = { closest(selector) { return selector.includes('.piece-417db') ? this : null; } };
    let contextPrevented = false;
    let dragPrevented = false;
    container.listeners.get('contextmenu')({ target: pieceTarget, preventDefault() { contextPrevented = true; } });
    container.listeners.get('dragstart')({ target: pieceTarget, preventDefault() { dragPrevented = true; } });
    assert.equal(contextPrevented, true);
    assert.equal(dragPrevented, true);

    let backgroundPrevented = false;
    container.listeners.get('contextmenu')({ target: { closest() { return null; } }, preventDefault() { backgroundPrevented = true; } });
    assert.equal(backgroundPrevented, false);
});

test('twenty Style12 updates preserve one board and avoid repeated orientation work', () => {
    const { client } = loadClient();
    const board = {
        positions: [], orientations: [],
        position(value, animate) { this.positions.push([value, animate]); },
        orientation(value) { this.orientations.push(value); }
    };
    Object.assign(client, {
        chess: new FakeChess(), board, boardPositionKey: null, boardOrientation: null,
        elements: { boardContainer: null }, liveGame: client.createEmptyLiveGameState('idle'),
        recordStyle12Move() {}, updateLiveGameUI() {}, notifySpectator() {}, handleStyle12SoundEvents() {},
        getActiveTableForGame() { return null; }, cancelPromotionSelection() {}, clearBoardSelection() {}
    });
    const identity = client.board;
    for (let index = 0; index < 20; index += 1) {
        client.handleStyle12({
            fen: `8/8/8/8/8/8/8/${index + 1} w - - 0 1`, gameNumber: 12,
            whiteName: 'Alpha', blackName: 'Beta', relation: 0, userColor: null,
            sideToMove: index % 2 ? 'b' : 'w', lastMove: `move-${index}`,
            whiteClock: 180 - index, blackClock: 180 - index,
            initialTime: 3, increment: 0, observedGame: true
        });
    }
    assert.equal(client.board, identity);
    assert.equal(board.positions.length, 20);
    assert.equal(board.positions.every(([, animate]) => animate === false), true);
    assert.deepEqual(board.orientations, ['white']);
});

test('board CSS owns touch, selection and iOS callout behavior without a global context-menu ban', () => {
    assert.match(styles, /#ficsSection\.fics-rd2-enabled #ficsBoardContainer\s*\{[^}]*touch-action:\s*none/s);
    assert.match(styles, /#ficsSection\.fics-rd2-enabled #ficsBoardContainer\s*\{[^}]*overscroll-behavior:\s*contain/s);
    assert.match(styles, /#ficsSection\.fics-rd2-enabled #ficsBoardContainer[^}]*-webkit-touch-callout:\s*none/s);
    assert.match(styles, /#ficsSection\.fics-rd2-enabled #ficsBoardContainer \.piece-417db[^}]*-webkit-user-drag:\s*none/s);
    assert.match(styles, /\.fics-tap-selected\s*\{[^}]*outline:/s);
    assert.doesNotMatch(styles, /(?:^|\n)\s*(?:html|body|\*)\s*\{[^}]*touch-action:\s*none/s);
    assert.match(clientSource, /contextmenu[\s\S]*#ficsBoardContainer \.piece-417db[\s\S]*preventDefault/);
});

test('shell resizes only after measured geometry changes and never from ordinary render', () => {
    const renderBody = shellSource.match(/function render\(\)\s*\{[\s\S]*?\n\s*\}/)?.[0] || '';
    assert.doesNotMatch(renderBody, /scheduleBoardResize\(\)/);
    assert.match(shellSource, /Math\.abs\(lastBoardGeometry\.width - geometry\.width\) <= 0\.5/);
    assert.match(shellSource, /new root\.ResizeObserver\(scheduleBoardResize\)/);
    assert.match(shellSource, /client\?\.refreshBoardInteractionDom\?\.\(\)/);
});
