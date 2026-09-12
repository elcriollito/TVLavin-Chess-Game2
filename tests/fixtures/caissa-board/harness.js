import { create } from '/js/board/caissa-board-adapter.js';
import { START_FEN } from '/js/board/caissa-board-state.js';

const host = document.getElementById('board-host');
const eventLog = document.getElementById('event-log');
const metricsOutput = document.getElementById('metrics');
const animationInput = document.getElementById('animation-enabled');
const reducedMotionInput = document.getElementById('reduced-motion');
const events = [];
let adapter;
let moveCursor = 0;
let mutationObserver = null;
let mutationRecords = [];

const OPENING_MOVES = Object.freeze([
    { from: 'e2', to: 'e4' }, { from: 'e7', to: 'e5' },
    { from: 'g1', to: 'f3' }, { from: 'b8', to: 'c6' },
    { from: 'f1', to: 'b5' }, { from: 'a7', to: 'a6' },
    { from: 'b5', to: 'a4' }, { from: 'g8', to: 'f6' },
    { from: 'e1', to: 'g1', castle: true }, { from: 'f8', to: 'e7' },
    { from: 'f1', to: 'e1' }, { from: 'b7', to: 'b5' },
    { from: 'a4', to: 'b3' }, { from: 'd7', to: 'd6' },
    { from: 'c2', to: 'c3' }, { from: 'e8', to: 'g8', castle: true },
    { from: 'h2', to: 'h3' }, { from: 'c6', to: 'b8' },
    { from: 'd2', to: 'd4' }, { from: 'b8', to: 'd7' }
]);

function record(type, payload) {
    events.push({ type, payload, sequence: events.length + 1 });
    const item = document.createElement('li');
    item.textContent = `${type}: ${typeof payload === 'string' ? payload : JSON.stringify(payload)}`;
    eventLog.append(item);
    while (eventLog.children.length > 12) eventLog.firstElementChild.remove();
    return undefined;
}

function updateMetrics() {
    if (!adapter) return;
    const value = adapter.getMetrics();
    metricsOutput.value = JSON.stringify({
        pieces: value.renderer.pieceCount,
        squares: value.renderer.squareCount,
        generation: value.renderer.generation,
        mutations: value.renderer.lastUpdate,
        geometry: value.renderer.geometry
    });
}

function makeAdapter(options = {}) {
    adapter?.destroy();
    events.length = 0;
    eventLog.replaceChildren();
    moveCursor = 0;
    adapter = create(host, {
        label: 'CAISSA persistent renderer test chessboard',
        position: options.position || START_FEN,
        orientation: options.orientation || 'white',
        animation: options.animation ?? animationInput.checked,
        animationDuration: options.animationDuration ?? 180,
        reducedMotion: options.reducedMotion ?? (reducedMotionInput.checked ? true : null),
        coalesce: options.coalesce ?? false,
        onSquareTap: square => record('squareTap', square),
        onMoveAttempt: move => record('moveAttempt', move),
        onDragStart: square => { record('dragStart', square); return true; },
        onDragEnd: move => record('dragEnd', move),
        onPromotionRequest: request => { record('promotionRequest', request); return 'Q'; },
        onOrientationChange: orientation => record('orientationChange', orientation),
        onResize: geometry => record('resize', geometry),
        onError: error => record('error', error.message)
    });
    updateMetrics();
    return adapter;
}

function apply(move, options = {}) {
    const response = adapter.applyMove(move, { animate: animationInput.checked, ...options });
    updateMetrics();
    return response;
}

function setPosition(fen, options = {}) {
    const response = adapter.setPosition(fen, { animate: animationInput.checked, ...options });
    updateMetrics();
    return response;
}

function summarizeMutations(records) {
    const summary = { records: records.length, nodesAdded: 0, nodesRemoved: 0, attributes: 0, styles: 0 };
    for (const mutation of records) {
        if (mutation.type === 'childList') {
            summary.nodesAdded += mutation.addedNodes.length;
            summary.nodesRemoved += mutation.removedNodes.length;
        } else if (mutation.type === 'attributes') {
            summary.attributes += 1;
            if (mutation.attributeName === 'style') summary.styles += 1;
        }
    }
    return summary;
}

const api = {
    START_FEN,
    OPENING_MOVES,
    reset: options => makeAdapter(options),
    applyMove: apply,
    setPosition,
    getPosition: () => adapter.getPosition(),
    getMetrics: () => adapter.getMetrics(),
    getEvents: () => structuredClone(events),
    clearEvents: () => { events.length = 0; eventLog.replaceChildren(); },
    selectSquare: square => adapter.selectSquare(square),
    clearSelection: () => adapter.clearSelection(),
    highlightSquares: items => adapter.highlightSquares(items),
    clearHighlights: () => adapter.clearHighlights(),
    drawArrow: (from, to, options) => adapter.drawArrow(from, to, options),
    clearArrows: () => adapter.clearArrows(),
    setOrientation: orientation => adapter.setOrientation(orientation),
    setInteractive: enabled => adapter.setInteractive(enabled),
    setReadOnly: enabled => adapter.setReadOnly(enabled),
    root: () => host.querySelector('.caissa-board'),
    pieceNode: square => host.querySelector(`.caissa-board__piece[data-square="${square}"]`),
    squareNode: square => host.querySelector(`.caissa-board__square[data-square="${square}"]`),
    geometry: () => {
        const root = api.root();
        const rect = root.getBoundingClientRect();
        return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, scrollX, scrollY };
    },
    startMutationCapture: () => {
        mutationObserver?.disconnect();
        mutationRecords = [];
        mutationObserver = new MutationObserver(records => mutationRecords.push(...records));
        mutationObserver.observe(api.root(), { subtree: true, childList: true, attributes: true, attributeOldValue: true });
    },
    stopMutationCapture: async () => {
        await Promise.resolve();
        if (mutationObserver) mutationRecords.push(...mutationObserver.takeRecords());
        mutationObserver?.disconnect();
        mutationObserver = null;
        return summarizeMutations(mutationRecords);
    },
    run20Moves: () => {
        makeAdapter({ position: START_FEN });
        const root = api.root();
        const squares = [...root.querySelectorAll('.caissa-board__square')];
        const initialNodes = new Map([...root.querySelectorAll('.caissa-board__piece')].map(node => [node.dataset.pieceId, node]));
        const responses = OPENING_MOVES.map(move => apply(move));
        return {
            responses,
            rootStable: root === api.root(),
            squaresStable: squares.every((node, index) => node === api.root().querySelectorAll('.caissa-board__square')[index]),
            retainedInitialPieces: [...api.root().querySelectorAll('.caissa-board__piece')]
                .filter(node => initialNodes.get(node.dataset.pieceId) === node).length,
            position: adapter.getPosition(),
            metrics: adapter.getMetrics()
        };
    },
    runBurst: async count => {
        makeAdapter({ position: START_FEN, coalesce: true });
        const alternate = 'rnbqkbnr/pppppppp/8/8/8/5N2/PPPPPPPP/RNBQKB1R w KQkq - 1 1';
        for (let index = 0; index < count; index += 1) {
            setPosition(index === count - 1 || index % 2 === 0 ? alternate : START_FEN, { coalesce: true });
        }
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        updateMetrics();
        return { position: adapter.getPosition(), metrics: adapter.getMetrics() };
    },
    runSoak: async count => {
        makeAdapter({ position: '8/8/8/8/8/8/8/1N6', animation: true });
        for (let index = 0; index < count; index += 1) {
            apply({ from: index % 2 === 0 ? 'b1' : 'c3', to: index % 2 === 0 ? 'c3' : 'b1' });
        }
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        return { position: adapter.getPosition(), metrics: adapter.getMetrics() };
    }
};

document.getElementById('set-fen').addEventListener('click', () => setPosition(document.getElementById('fen-input').value));
document.getElementById('reset-board').addEventListener('click', () => makeAdapter());
document.getElementById('next-move').addEventListener('click', () => {
    if (moveCursor < OPENING_MOVES.length) apply(OPENING_MOVES[moveCursor++]);
});
document.getElementById('previous-move').addEventListener('click', () => {
    if (moveCursor > 0) makeAdapter();
    moveCursor = Math.max(0, moveCursor - 1);
    for (let index = 0; index < moveCursor; index += 1) apply(OPENING_MOVES[index]);
});
document.getElementById('flip-board').addEventListener('click', () => adapter.setOrientation(adapter.getOrientation() === 'white' ? 'black' : 'white'));
document.getElementById('rapid-updates').addEventListener('click', () => api.runBurst(50));
document.getElementById('toggle-highlights').addEventListener('click', () => adapter.highlightSquares([
    { square: 'e4', type: 'last' }, { square: 'e5', type: 'legal' }, { square: 'c3', type: 'hint' }, { square: 'd4', type: 'error' }
]));
document.getElementById('toggle-arrow').addEventListener('click', () => adapter.drawArrow('e2', 'e4'));
animationInput.addEventListener('change', () => makeAdapter());
reducedMotionInput.addEventListener('change', () => makeAdapter());

makeAdapter();
window.caissaBoardHarness = api;
window.caissaBoardReady = true;
