import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { create, PlayBoardProjection } from '../../js/play/play-board-projection.js';
import legacyModule from '../../js/play/chessboard-adapter.js';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

function ok(status = 'accepted', reasonCode = 'OK', value = null) {
    return Object.freeze({ ok: true, status, reasonCode, value });
}

function fixture(options = {}) {
    const calls = [];
    let configured;
    let generation = 0;
    let orientation = 'white';
    let pieces = [{ square: 'e2', code: 'wP', color: 'white', type: 'P', id: 'caissa-wP-1' }];
    const adapter = {
        setPosition(fen, config) {
            calls.push(['setPosition', fen, config]);
            if (options.rejectPosition) return { ok: false, status: 'rejected', reasonCode: 'BAD' };
            generation += 1;
            return ok('accepted', 'POSITION_APPLIED', fen);
        },
        applyMove(move, config) {
            calls.push(['applyMove', move, config]);
            if (options.rejectMove) return { ok: false, status: 'rejected', reasonCode: 'MISMATCH' };
            generation += 1;
            pieces = pieces.map(piece => piece.square === move.from ? { ...piece, square: move.to } : piece);
            return ok('accepted', 'SEMANTIC_MOVE_APPLIED', config.fen);
        },
        setOrientation(value) { calls.push(['setOrientation', value]); orientation = value; return ok('accepted', 'ORIENTATION_CHANGED', value); },
        setInteractive(value) { calls.push(['setInteractive', value]); return ok(); },
        replaceOverlays(value) { calls.push(['replaceOverlays', value]); return ok(); },
        resize() { calls.push(['resize']); return ok(); },
        focus(square) { calls.push(['focus', square]); return ok('accepted', 'BOARD_FOCUSED', square || 'a1'); },
        getPieceAt(square) { return pieces.find(piece => piece.square === square) || null; },
        getPosition() { return { pieces }; },
        getMetrics() { return { renderer: { rendererId: 'persistent-1', generation, resizeChecks: 0, squareCount: 64, orientation } }; },
        destroy() { calls.push(['destroy']); return ok(); }
    };
    const adapterFactory = (container, input) => {
        calls.push(['create', container]);
        configured = input;
        return adapter;
    };
    const container = {
        id: 'chessboard', appendChild() {}, addEventListener() {}, removeEventListener() {},
        querySelector() { return null; }, querySelectorAll() { return []; },
        getBoundingClientRect() { return { width: 400, height: 400 }; }
    };
    const projection = create({ position: START, adapterFactory, ...options });
    return { projection, container, calls, configured: () => configured };
}

test('publishes the versioned persistent Play seam and keeps the former module path as an alias', () => {
    assert.equal(globalThis.CaissaPlayBoardProjection.schemaVersion, '2.0.0');
    assert.equal(globalThis.CaissaChessboardAdapter, globalThis.CaissaPlayBoardProjection);
    assert.equal(legacyModule, globalThis.CaissaPlayBoardProjection);
    assert.ok(create({}) instanceof PlayBoardProjection);
});

test('mount constructs exactly one persistent adapter with independent Play input policies', () => {
    const f = fixture();
    assert.equal(f.projection.mount(f.container).status, 'accepted');
    assert.equal(f.projection.mount(f.container).status, 'unchanged');
    assert.equal(f.calls.filter(call => call[0] === 'create').length, 1);
    assert.equal(f.configured().tapPolicy, 'intent-only');
    assert.equal(f.configured().dragPolicy, 'mouse');
    assert.equal(f.configured().keyboardPolicy, 'enabled');
    assert.equal(f.projection.getSnapshot().renderer, 'CaissaPersistentRenderer');
});

test('semantic moves carry capture, en-passant, castling and promotion intent with canonical FEN', () => {
    const f = fixture();
    f.projection.mount(f.container);
    const fen = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
    assert.equal(f.projection.applyMove({ from: 'e2', to: 'e4', flags: 'b' }, { fen }).ok, true);
    const move = f.calls.find(call => call[0] === 'applyMove');
    assert.deepEqual(move[1], { from: 'e2', to: 'e4', capture: false, enPassant: false, castle: false, promotion: null });
    assert.equal(move[2].fen, fen);
    assert.equal(f.projection.inspect().semanticMoves, 1);
});

test('semantic rejection recovers once through canonical setPosition', () => {
    const f = fixture({ rejectMove: true });
    f.projection.mount(f.container);
    const fen = '8/8/8/8/4P3/8/8/8 b - - 0 1';
    assert.equal(f.projection.applyMove({ from: 'e2', to: 'e4' }, { fen }).ok, true);
    assert.equal(f.calls.filter(call => call[0] === 'applyMove').length, 1);
    assert.equal(f.calls.filter(call => call[0] === 'setPosition').length, 1);
    assert.equal(f.projection.inspect().semanticFallbacks, 1);
});

test('legacy position maps are translated without introducing another chess owner', () => {
    const f = fixture();
    f.projection.mount(f.container);
    const facade = f.projection.getLegacyFacade();
    facade.position({ a1: 'wK', h8: 'bK' }, false);
    assert.match(f.calls.findLast(call => call[0] === 'setPosition')[1], /^7k\/8\/8\/8\/8\/8\/8\/K7 w - - 0 1$/);
    assert.deepEqual(facade.position(), { e2: 'wP' });
});

test('tap, drag and overlay intent remain presentation-only and are forwarded once', async () => {
    const interactions = [];
    let drops = 0;
    const f = fixture({
        onInteraction: event => interactions.push(event),
        onDragStart: () => true,
        onDrop: () => { drops += 1; }
    });
    f.projection.mount(f.container);
    f.configured().onSquareTap('e2');
    assert.equal(interactions.filter(event => event.type === 'square-selected').length, 1);
    assert.equal(f.configured().onDragStart('e2'), true);
    f.configured().onMoveAttempt({ from: 'e2', to: 'e4', promotion: null, inputMethod: 'drag' });
    assert.equal(drops, 1);
    f.projection.setSelection('e2');
    f.projection.setLegalTargets(['e3', 'e4'], { captureTargets: ['e4'] });
    f.projection.setLastMove({ from: 'e7', to: 'e5' });
    const overlay = f.calls.findLast(call => call[0] === 'replaceOverlays')[1];
    assert.equal(overlay.selection, 'e2');
    assert.equal(overlay.highlights.filter(item => item.type === 'legal').length, 2);
    assert.equal(overlay.highlights.filter(item => item.type === 'last').length, 2);
});

test('static ownership guard removes Chessboard.js construction and routes shared writes through one seam', () => {
    const projection = fs.readFileSync(new URL('../../js/play/play-board-projection.js', import.meta.url), 'utf8');
    const app = fs.readFileSync(new URL('../../app.js', import.meta.url), 'utf8');
    const index = fs.readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
    assert.doesNotMatch(projection, /\bnew\s+Chess\b|\bChessboard\s*\(|boardFactory|App\.game|Engine|ClockService/);
    assert.doesNotMatch(app, /App\.board\??\.(?:position|orientation|resize|flip|start)\??\.?\s*\(/);
    assert.equal((app.match(/CaissaPlayBoardProjection\.create\s*\(/g) || []).length, 1);
    assert.match(index, /type="module" src="js\/play\/play-board-projection\.js\?v=2\.0\.0"/);
    assert.doesNotMatch(index, /src="js\/play\/chessboard-adapter\.js/);
});
