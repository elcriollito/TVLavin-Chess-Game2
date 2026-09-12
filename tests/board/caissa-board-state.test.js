import test from 'node:test';
import assert from 'node:assert/strict';
import {
    START_FEN,
    applySemanticMove,
    assignInitialPieceIdentities,
    createIdentityAllocator,
    parseFen,
    reconcilePieces,
    serializePlacement
} from '../../js/board/caissa-board-state.js';
import { navigateSquare, squareAccessibleLabel, squareFromVisualPoint, visualCoordinates } from '../../js/board/caissa-board-a11y.js';

const state = fen => assignInitialPieceIdentities(parseFen(fen).entries);
const at = (pieces, square) => pieces.find(piece => piece.square === square);

test('strict presentation FEN parser accepts start/full/placement and rejects malformed ranks', () => {
    assert.equal(parseFen('start').fen, START_FEN);
    assert.equal(parseFen(START_FEN).entries.length, 32);
    assert.equal(parseFen('8/8/8/8/8/8/8/8').entries.length, 0);
    assert.throws(() => parseFen('8/8/8/8/8/8/8/7'), error => error.code === 'INVALID_FEN_WIDTH');
    assert.throws(() => parseFen('8/8/8/8/8/8/8/8 white - - 0 1'), error => error.code === 'INVALID_FEN_TURN');
});

test('initial renderer identities are deterministic and duplicate-safe', () => {
    const first = state(START_FEN);
    const second = state(START_FEN);
    assert.deepEqual(first, second);
    assert.equal(new Set(first.map(piece => piece.id)).size, 32);
    assert.equal(at(first, 'a2').id, 'caissa-wP-1');
    assert.equal(at(first, 'h2').id, 'caissa-wP-8');
});

test('semantic quiet moves preserve pawn, knight, bishop, rook, queen and king identities', () => {
    const cases = [
        ['8/8/8/8/8/8/4P3/8', { from: 'e2', to: 'e4' }],
        ['8/8/8/8/8/8/8/6N1', { from: 'g1', to: 'f3' }],
        ['8/8/8/8/8/8/8/2B5', { from: 'c1', to: 'h6' }],
        ['8/8/8/8/8/8/8/R7', { from: 'a1', to: 'a4' }],
        ['8/8/8/8/8/8/8/3Q4', { from: 'd1', to: 'd4' }],
        ['8/8/8/8/8/8/8/4K3', { from: 'e1', to: 'e2' }]
    ];
    for (const [fen, move] of cases) {
        const before = state(fen);
        const id = at(before, move.from).id;
        const after = applySemanticMove(before, move, createIdentityAllocator(before));
        assert.equal(at(after.pieces, move.to).id, id);
        assert.equal(after.moved.length, 1);
        assert.equal(after.added.length, 0);
        assert.equal(after.removed.length, 0);
    }
});

test('capture preserves attacker identity and removes only the captured identity', () => {
    const before = state('8/8/8/3p4/4P3/8/8/8');
    const attacker = at(before, 'e4');
    const victim = at(before, 'd5');
    const after = applySemanticMove(before, { from: 'e4', to: 'd5', capture: true }, createIdentityAllocator(before));
    assert.equal(at(after.pieces, 'd5').id, attacker.id);
    assert.deepEqual(after.removed.map(piece => piece.id), [victim.id]);
});

test('en passant preserves mover and removes the off-destination pawn', () => {
    const before = state('8/8/8/3pP3/8/8/8/8');
    const mover = at(before, 'e5');
    const victim = at(before, 'd5');
    const after = applySemanticMove(before, { from: 'e5', to: 'd6', enPassant: true }, createIdentityAllocator(before));
    assert.equal(at(after.pieces, 'd6').id, mover.id);
    assert.ok(!after.pieces.some(piece => piece.id === victim.id));
    assert.equal(after.removed[0].square, 'd5');
});

test('castling preserves both king and rook identities', () => {
    const before = state('r3k2r/8/8/8/8/8/8/R3K2R');
    const king = at(before, 'e1');
    const rook = at(before, 'h1');
    const after = applySemanticMove(before, { from: 'e1', to: 'g1', castle: true }, createIdentityAllocator(before));
    assert.equal(at(after.pieces, 'g1').id, king.id);
    assert.equal(at(after.pieces, 'f1').id, rook.id);
    assert.equal(after.moved.length, 2);
});

test('promotion intentionally replaces the pawn with a new promoted-piece identity', () => {
    const before = state('8/P7/8/8/8/8/8/8');
    const pawn = at(before, 'a7');
    const after = applySemanticMove(before, { from: 'a7', to: 'a8', promotion: 'Q' }, createIdentityAllocator(before));
    assert.equal(after.removed[0].id, pawn.id);
    assert.equal(after.added[0].type, 'Q');
    assert.notEqual(after.added[0].id, pawn.id);
    assert.equal(serializePlacement(after.pieces), 'Q7/8/8/8/8/8/8/8');
});

test('semantic moves fail closed when capture/castle state is underspecified', () => {
    const occupied = state('8/8/8/3p4/4P3/8/8/8');
    assert.throws(
        () => applySemanticMove(occupied, { from: 'e4', to: 'd5' }, createIdentityAllocator(occupied)),
        error => error.code === 'CAPTURE_SEMANTICS_REQUIRED'
    );
    const noRook = state('8/8/8/8/8/8/8/4K3');
    assert.throws(
        () => applySemanticMove(noRook, { from: 'e1', to: 'g1', castle: true }, createIdentityAllocator(noRook)),
        error => error.code === 'INVALID_CASTLE_ROOK'
    );
});

test('arbitrary FEN reconciliation is deterministic and retains same-code identities', () => {
    const before = state('8/8/8/8/8/8/PP6/R6R');
    const first = reconcilePieces(before, parseFen('8/8/8/8/1P6/8/P7/R6R').entries, createIdentityAllocator(before));
    const second = reconcilePieces(before, parseFen('8/8/8/8/1P6/8/P7/R6R').entries, createIdentityAllocator(before));
    assert.deepEqual(first, second);
    assert.equal(first.added.length, 0);
    assert.equal(first.removed.length, 0);
    assert.equal(at(first.pieces, 'a2').id, at(before, 'a2').id);
    assert.equal(at(first.pieces, 'b4').id, at(before, 'b2').id);
});

test('orientation-aware geometry and keyboard navigation remain canonical', () => {
    assert.deepEqual(visualCoordinates('a8', 'white'), { x: 0, y: 0 });
    assert.deepEqual(visualCoordinates('a8', 'black'), { x: 7, y: 7 });
    assert.equal(squareFromVisualPoint(0, 0, 'white'), 'a8');
    assert.equal(squareFromVisualPoint(0, 0, 'black'), 'h1');
    assert.equal(navigateSquare('a1', 'ArrowRight', 'white'), 'b1');
    assert.equal(navigateSquare('h8', 'ArrowRight', 'black'), 'g8');
    assert.match(squareAccessibleLabel('e2', { color: 'white', type: 'P' }, 'white'), /white pawn on e2/i);
});
