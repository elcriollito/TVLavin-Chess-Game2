import test from 'node:test';
import assert from 'node:assert/strict';
import { ChessRulesFacade } from '../../js/endgame-trainer/chess-rules-facade.js';
import { EndgameBoardView, EndgameBoardViewError, detectTouchCapability } from '../../js/endgame-trainer/endgame-board-view.js';

const START = '8/8/8/8/8/8/4P3/4K2k w - - 0 1';
const BLACK_PROMO = '8/8/8/8/8/8/p7/4K2k b - - 0 1';
const WHITE_PROMO = '7k/P7/8/8/8/8/8/7K w - - 0 1';
const FEN_B = '8/8/8/8/8/3K4/4P3/7k w - - 0 1';

class FakeClassList {
    constructor(values = []) { this.values = new Set(values); }
    add(...values) { values.forEach((value) => this.values.add(value)); }
    remove(...values) { values.forEach((value) => this.values.delete(value)); }
    toggle(value, force) { force ? this.add(value) : this.remove(value); }
    contains(value) { return this.values.has(value); }
    [Symbol.iterator]() { return this.values[Symbol.iterator](); }
}

class FakeNode {
    constructor(classes = []) { this.classList = new FakeClassList(classes); this.attributes = {}; this.parentNode = null; this.focused = false; }
    setAttribute(name, value) { this.attributes[name] = String(value); }
    getAttribute(name) { return this.attributes[name]; }
    focus() { this.focused = true; }
}

class FakeRoot extends FakeNode {
    constructor() {
        super(); this.listeners = new Map(); this.squares = [];
        for (const rank of '12345678') for (const file of 'abcdefgh') {
            const square = new FakeNode(['square-55d63', `square-${file}${rank}`]); square.parentNode = this; this.squares.push(square);
        }
    }
    querySelector(selector) { return this.squares.find((node) => node.classList.contains(selector.slice(1))) || null; }
    querySelectorAll(selector) { return selector === '.square-55d63' ? [...this.squares] : []; }
    addEventListener(type, callback, options = {}) {
        const list = this.listeners.get(type) || []; list.push(callback); this.listeners.set(type, list);
        options.signal?.addEventListener('abort', () => this.listeners.set(type, (this.listeners.get(type) || []).filter((item) => item !== callback)), { once: true });
    }
    emit(type, init = {}) {
        const event = { target: this, key: '', preventDefault() { this.defaultPrevented = true; }, ...init };
        for (const callback of this.listeners.get(type) || []) callback(event);
        return event;
    }
    square(name) { return this.querySelector(`.square-${name}`); }
}

function factoryLog(root, { fail = false } = {}) {
    const log = { positions: [], moves: [], orientations: [], resize: 0, destroy: 0, config: null };
    const createBoard = (_element, config) => {
        if (fail) throw new Error('factory');
        log.config = config;
        return {
            position(fen) { log.positions.push(fen); }, move(value, animate) { log.moves.push([value, animate]); }, orientation(color) { log.orientations.push(color); },
            resize() { log.resize += 1; }, destroy() { log.destroy += 1; }
        };
    };
    return { log, createBoard };
}

function create(options = {}) {
    const root = options.root || new FakeRoot(); const board = factoryLog(root, options);
    const view = new EndgameBoardView({
        element: root, createBoard: board.createBoard,
        rulesFactory: (fen) => fen ? ChessRulesFacade.fromFen(fen) : new ChessRulesFacade(),
        options: { resizeObserver: false }, ...options
    });
    view.initialize(); if (options.fen !== false) view.setPosition(options.fen || START);
    return { root, view, ...board };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

test('1 invalid element', () => assert.throws(() => new EndgameBoardView({}), { code: 'invalid-element' }));
test('2 initialize success', () => { const { view } = create({ fen: false }); assert.equal(view.getState().initialized, true); });
test('3 initialize twice', () => { const { view, log } = create({ fen: false }); view.initialize(); assert.equal(log.destroy, 0); });
test('4 board factory failure', () => { const root = new FakeRoot(); const { createBoard } = factoryLog(root, { fail: true }); const view = new EndgameBoardView({ element: root, createBoard, rulesFactory: () => new ChessRulesFacade() }); assert.throws(() => view.initialize(), { code: 'board-initialization-failed' }); });
test('5 setPosition valid', () => { const { view } = create(); assert.equal(view.getPosition(), START); });
test('6 setPosition invalid', () => { const { view } = create(); assert.throws(() => view.setPosition('bad'), { code: 'invalid-fen' }); });
test('7 orientation white/black', () => { const { view, log } = create(); view.setOrientation('black'); view.setOrientation('white'); assert.deepEqual(log.orientations, ['black', 'white']); });
test('8 invalid orientation', () => { const { view } = create(); assert.throws(() => view.setOrientation('sideways'), { code: 'invalid-orientation' }); });
test('9 flip', () => { const { view } = create(); assert.equal(view.flip(), 'black'); });
test('10 interactive lock', () => { const { view } = create(); view.setInteractive(false); assert.equal(view.canInteract(), false); });
test('11 thinking lock', () => { const { view } = create(); view.setThinking(true); assert.equal(view.canInteract(), false); });
test('12 tap select', async () => { const { root, view } = create(); root.emit('click', { target: root.square('e2') }); await tick(); assert.equal(view.getState().selectedSquare, 'e2'); });
test('13 tap legal target', async () => { let move; const { root } = create({ onMove: (value) => { move = value; } }); root.emit('click', { target: root.square('e2') }); root.emit('click', { target: root.square('e3') }); await tick(); assert.equal(move.lan, 'e2e3'); });
test('14 tap invalid target', async () => { const { root, view } = create(); root.emit('click', { target: root.square('e2') }); root.emit('click', { target: root.square('a8') }); await tick(); assert.equal(view.getState().selectedSquare, null); });
test('15 tap switches own piece', async () => { const fen = '8/8/8/8/8/8/3PP3/4K2k w - - 0 1'; const { root, view } = create({ fen }); root.emit('click', { target: root.square('e2') }); root.emit('click', { target: root.square('d2') }); await tick(); assert.equal(view.getState().selectedSquare, 'd2'); });
test('16 legal highlights', async () => { const { root } = create(); root.emit('click', { target: root.square('e2') }); await tick(); assert.equal(root.square('e3').classList.contains('et-board-legal'), true); });
test('17 capture highlights', async () => { const { root } = create({ fen: '8/8/8/8/3p4/4P3/8/4K2k w - - 0 1' }); root.emit('click', { target: root.square('e3') }); await tick(); assert.equal(root.square('d4').classList.contains('et-board-capture'), true); });
test('18 drag blocked wrong color', () => { const { log } = create(); assert.equal(log.config.onDragStart('h1', 'bK'), false); });
test('19 drag blocked thinking', () => { const { view, log } = create(); view.setThinking(true); assert.equal(log.config.onDragStart('e2', 'wP'), false); });
test('20 legal drop stays in place', async () => { let move; const { log } = create({ onMove: (value) => { move = value; } }); assert.equal(log.config.onDrop('e2', 'e3'), undefined); await tick(); assert.equal(move.to, 'e3'); });
test('21 illegal drop snapback', async () => { let count = 0; const { log } = create({ onMove: () => count++ }); assert.equal(log.config.onDrop('e2', 'a8'), 'snapback'); await tick(); assert.equal(count, 0); });
test('22 async onMove success', async () => { const { log, view } = create({ onMove: async () => true }); log.config.onDrop('e2', 'e3'); await tick(); assert.equal(view.getState().submitting, false); });
test('23 async onMove rejection', async () => { const { log, view } = create({ onMove: async () => { throw new Error('no'); } }); log.config.onDrop('e2', 'e3'); await tick(); assert.equal(view.getPosition(), START); });
test('24 second move blocked while pending', async () => { let resolve; let count = 0; const { log } = create({ onMove: () => { count++; return new Promise((done) => { resolve = done; }); } }); log.config.onDrop('e2', 'e3'); log.config.onDrop('e2', 'e4'); await tick(); assert.equal(count, 1); resolve(true); });
test('25 promotion white', async () => { let move; const { log } = create({ fen: WHITE_PROMO, promotionResolver: async () => 'n', onMove: (value) => { move = value; } }); log.config.onDrop('a7', 'a8'); await tick(); assert.equal(move.promotion, 'n'); });
test('26 promotion black', async () => { let move; const { log } = create({ fen: BLACK_PROMO, promotionResolver: async () => 'r', onMove: (value) => { move = value; } }); log.config.onDrop('a2', 'a1'); await tick(); assert.equal(move.promotion, 'r'); });
test('27 promotion cancelled', async () => { let count = 0; const { log } = create({ fen: WHITE_PROMO, promotionResolver: async () => null, onMove: () => count++ }); log.config.onDrop('a7', 'a8'); await tick(); assert.equal(count, 0); });
test('28 last move highlights', () => { const { root, view } = create(); view.setLastMove({ from: 'e2', to: 'e3' }); assert.equal(root.square('e3').classList.contains('et-board-last'), true); });
test('29 check highlight', () => { const { root, view } = create(); view.setCheckSquare('h1'); assert.equal(root.square('h1').classList.contains('et-board-check'), true); });
test('30 clear highlights', () => { const { root, view } = create(); view.setLastMove({ from: 'e2', to: 'e3' }); view.clearHighlights(); assert.equal(root.square('e3').classList.contains('et-board-last'), false); });
test('31 keyboard select', async () => { const { root, view } = create(); view.focusSquare('e2'); root.emit('keydown', { key: 'Enter' }); await tick(); assert.equal(view.getState().selectedSquare, 'e2'); });
test('32 keyboard move', async () => { let move; const { root, view } = create({ onMove: (value) => { move = value; } }); view.focusSquare('e2'); root.emit('keydown', { key: 'Enter' }); view.focusSquare('e3'); root.emit('keydown', { key: ' ' }); await tick(); assert.equal(move.to, 'e3'); });
test('33 Escape clears selection', async () => { const { root, view } = create(); view.focusSquare('e2'); root.emit('keydown', { key: 'Enter' }); root.emit('keydown', { key: 'Escape' }); await tick(); assert.equal(view.getState().selectedSquare, null); });
test('34 keyboard navigation orientation white', () => { const { root, view } = create(); view.focusSquare('d4'); root.emit('keydown', { key: 'ArrowUp' }); assert.equal(view.getState().focusedSquare, 'd5'); });
test('35 keyboard navigation orientation black', () => { const { root, view } = create(); view.setOrientation('black'); view.focusSquare('d4'); root.emit('keydown', { key: 'ArrowUp' }); assert.equal(view.getState().focusedSquare, 'd3'); });
test('36 resize manual', () => { const { view, log } = create(); view.resize(); assert.equal(log.resize, 1); });
test('37 ResizeObserver cleanup', () => { let disconnected = 0; const Original = globalThis.ResizeObserver; globalThis.ResizeObserver = class { observe() {} disconnect() { disconnected++; } }; try { const root = new FakeRoot(); const board = factoryLog(root); const view = new EndgameBoardView({ element: root, createBoard: board.createBoard, rulesFactory: () => new ChessRulesFacade() }); view.initialize(); view.dispose(); assert.equal(disconnected, 1); } finally { globalThis.ResizeObserver = Original; } });
test('38 dispose', () => { const { view, log } = create(); view.dispose(); assert.equal(log.destroy, 1); });
test('39 dispose idempotent', () => { const { view, log } = create(); view.dispose(); view.dispose(); assert.equal(log.destroy, 1); });
test('40 use after dispose', () => { const { view } = create(); view.dispose(); assert.throws(() => view.setPosition(START), { code: 'board-disposed' }); });
test('41 two boards independent', async () => { const a = create(); const b = create({ fen: FEN_B }); a.root.emit('click', { target: a.root.square('e2') }); await tick(); assert.equal(b.view.getState().selectedSquare, null); a.view.dispose(); assert.equal(b.view.canInteract(), true); });
test('42 callbacks throwing', async () => { const { root, view } = create({ onSelectionChange: () => { throw new Error('callback'); }, onAnnouncement: () => { throw new Error('callback'); } }); root.emit('click', { target: root.square('e2') }); await tick(); assert.equal(view.getState().selectedSquare, 'e2'); });
test('43 snapshot immutable', () => { const { view } = create(); const state = view.getState(); state.legalTargets.push({ to: 'a1' }); assert.equal(view.getState().legalTargets.length, 0); });
test('44 FEN external update during pending move', async () => { let resolve; const { log, view } = create({ onMove: () => new Promise((done) => { resolve = done; }) }); log.config.onDrop('e2', 'e3'); await tick(); view.setPosition(FEN_B); resolve(true); await tick(); assert.equal(view.getPosition(), FEN_B); });
test('45 stale async move response ignored', async () => { let resolve; const { log, view } = create({ onMove: () => new Promise((done) => { resolve = done; }) }); log.config.onDrop('e2', 'e3'); await tick(); view.setPosition(FEN_B); resolve(false); await tick(); assert.equal(view.getPosition(), FEN_B); });
test('46 promotion response stale after setPosition', async () => { let resolve; let count = 0; const { log, view } = create({ fen: WHITE_PROMO, promotionResolver: () => new Promise((done) => { resolve = done; }), onMove: () => count++ }); log.config.onDrop('a7', 'a8'); await tick(); view.setPosition(FEN_B); resolve('q'); await tick(); assert.equal(count, 0); });
test('47 focus preserved', async () => { const { root, view } = create(); view.focusSquare('e2'); root.emit('keydown', { key: 'Escape' }); assert.equal(root.square('e2').focused, true); });
test('48 ARIA labels', () => { const { root } = create(); assert.match(root.square('e2').getAttribute('aria-label'), /white pawn on e2/); });
test('49 announcement callback', async () => { let announcement; const { root } = create({ onAnnouncement: (value) => { announcement = value; } }); root.emit('click', { target: root.square('e2') }); await tick(); assert.match(announcement, /legal moves/); });
test('50 no global selectors', () => { const { root, view } = create(); view.setCheckSquare('h1'); assert.equal(root.square('h1').classList.contains('et-board-check'), true); });
test('51 principal race FEN A to B', async () => { let resolve; let moves = 0; const { root, log, view } = create({ onMove: () => { moves++; return new Promise((done) => { resolve = done; }); } }); log.config.onDrop('e2', 'e3'); await tick(); view.setPosition(FEN_B); resolve(true); await tick(); assert.equal(view.getPosition(), FEN_B); assert.equal(view.getState().submitting, false); root.emit('click', { target: root.square('e2') }); await tick(); assert.equal(view.getState().selectedSquare, 'e2'); assert.equal(moves, 1); });
test('52 real pointer tap survives Chessboard moving the pointerup target', async () => { const { root, view } = create(); root.emit('pointerdown', { target: root.square('e2'), pointerId: 1, clientX: 20, clientY: 20 }); root.emit('pointerup', { target: root, pointerId: 1, clientX: 21, clientY: 21 }); await tick(); assert.equal(view.getState().selectedSquare, 'e2'); });
test('53 pointer drag does not duplicate the board drop callback', async () => { let moves = 0; const { root, log } = create({ onMove: () => { moves++; } }); root.emit('pointerdown', { target: root.square('e2'), pointerId: 1, clientX: 20, clientY: 20 }); root.emit('pointerup', { target: root.square('e3'), pointerId: 1, clientX: 20, clientY: 80 }); log.config.onDrop('e2', 'e3'); await tick(); assert.equal(moves, 1); });
test('54 throwing promotion and error callbacks recover without unhandled state', async () => { const { log, view } = create({ fen: WHITE_PROMO, promotionResolver: async () => { throw new Error('resolver'); }, onError: () => { throw new Error('observer'); } }); log.config.onDrop('a7', 'a8'); await tick(); assert.equal(view.getState().submitting, false); assert.equal(view.canInteract(), true); assert.equal(view.getPosition(), WHITE_PROMO); });
test('55 touch capability disables drag without using viewport width', () => { const { root, log } = create({ options: { resizeObserver: false, touchDetector: () => true } }); assert.equal(log.config.draggable, false); assert.equal(root.getAttribute('data-input-mode'), 'tap'); });
test('56 desktop capability retains drag', () => { const { root, log } = create({ options: { resizeObserver: false, touchDetector: () => false } }); assert.equal(log.config.draggable, true); assert.equal(root.getAttribute('data-input-mode'), 'pointer'); });
test('57 tap move causes one incremental render and no full redraw', async () => { let view; const result = create({ onMove: async move => { view.setPosition('8/8/8/8/8/4P3/8/4K2k b - - 0 1', move); return true; } }); view = result.view; const baseline = result.log.positions.length; result.root.emit('click', { target: result.root.square('e2') }); result.root.emit('click', { target: result.root.square('e3') }); await tick(); assert.equal(result.log.positions.length, baseline); assert.deepEqual(result.log.moves, [['e2-e3', false]]); assert.equal(view.getState().incrementalMoveCount, 1); });
test('58 status-only updates never invoke a board renderer', () => { const { view, log } = create(); const positions = log.positions.length; view.setThinking(true); view.setThinking(false); view.setInteractive(false); view.setInteractive(true); view.setLastMove({ from: 'e2', to: 'e3' }); assert.equal(log.positions.length, positions); assert.equal(log.moves.length, 0); });
test('59 touch detection uses pointer capability', () => { assert.equal(detectTouchCapability({ navigator: { maxTouchPoints: 1 } }), true); assert.equal(detectTouchCapability({ navigator: { maxTouchPoints: 0 }, matchMedia: () => ({ matches: true }) }), true); assert.equal(detectTouchCapability({ navigator: { maxTouchPoints: 0 }, matchMedia: () => ({ matches: false }) }), false); });
test('60 promotion uses one correct position diff without remounting', () => { const { view, log } = create({ fen: WHITE_PROMO }); const baseline = log.positions.length; view.setPosition('Q6k/8/8/8/8/8/8/7K b - - 0 1', { from: 'a7', to: 'a8', promotion: 'q' }); assert.equal(log.positions.length, baseline + 1); assert.equal(log.moves.length, 0); assert.equal(log.destroy, 0); assert.equal(view.getState().mountCount, 1); });
