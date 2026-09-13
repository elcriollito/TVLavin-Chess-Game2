import test from 'node:test';
import assert from 'node:assert/strict';
import { PgnBoard } from '../../js/pgn-replayer/pgn-board.js';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

function harness({ moveResult = { ok: true } } = {}) {
    const calls = [];
    let renderedFen = START;
    let orientation = 'white';
    const adapter = {
        getPosition: () => ({ renderedFen }),
        applyMove: (move, options) => { calls.push(['applyMove', move, options]); if (moveResult.ok) renderedFen = options.fen; return moveResult; },
        setPosition: (fen, options) => { calls.push(['setPosition', fen, options]); renderedFen = fen; return { ok: true }; },
        highlightSquares: items => { calls.push(['highlightSquares', items]); return { ok: true }; },
        getOrientation: () => orientation,
        setOrientation: value => { orientation = value; calls.push(['setOrientation', value]); return { ok: true }; },
        resize: () => ({ ok: true }),
        getMetrics: () => ({ renderer: { squareCount: 64 } }),
        destroy: () => ({ ok: true })
    };
    const container = { dataset: {} };
    const board = new PgnBoard(container, { adapterFactory: (_container, options) => { calls.push(['create', options]); return adapter; } });
    return { board, calls, adapter, container };
}

function node(overrides = {}) {
    return {
        id: 'g1-n1', previousId: null, from: 'e2', to: 'e4', flags: 'b', promotion: '',
        fenBefore: START, fenAfter: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
        ...overrides
    };
}

test('PGN board is created as a read-only persistent adapter consumer', () => {
    const { calls } = harness();
    assert.equal(calls[0][0], 'create');
    assert.equal(calls[0][1].interactive, false);
    assert.equal(calls[0][1].readOnly, true);
    assert.equal(calls[0][1].label, 'PGN Reader chessboard');
});

test('trusted sequential forward nodes use semantic applyMove evidence', () => {
    for (const [flags, promotion, expected] of [
        ['b', '', { from: 'e2', to: 'e4' }],
        ['c', '', { from: 'e2', to: 'e4', capture: true }],
        ['e', '', { from: 'e2', to: 'e4', enPassant: true }],
        ['k', '', { from: 'e2', to: 'e4', castle: true }],
        ['q', '', { from: 'e2', to: 'e4', castle: true }],
        ['np', 'q', { from: 'e2', to: 'e4', promotion: 'Q' }]
    ]) {
        const { board, calls } = harness();
        const moveNode = node({ flags, promotion });
        board.applyNode(moveNode);
        assert.deepEqual(calls.find(call => call[0] === 'applyMove')[1], expected);
        assert.equal(board.inspect().strategy, 'move');
    }
});

test('arbitrary jumps always reconcile from canonical FEN', () => {
    const { board, calls } = harness();
    const target = node({ id: 'g1-n8', previousId: 'g1-n7' });
    board.setPosition(target.fenAfter, target, false);
    assert.equal(calls.some(call => call[0] === 'applyMove'), false);
    assert.deepEqual(calls.find(call => call[0] === 'setPosition').slice(1), [target.fenAfter, { animate: false }]);
    assert.equal(board.inspect().strategy, 'position');
});

test('untrusted or rejected semantic updates fall back to canonical setPosition', () => {
    const rejected = harness({ moveResult: { ok: false, reasonCode: 'CANONICAL_FEN_MISMATCH' } });
    rejected.board.applyNode(node());
    assert.equal(rejected.calls.some(call => call[0] === 'applyMove'), true);
    assert.equal(rejected.calls.some(call => call[0] === 'setPosition'), true);
    assert.equal(rejected.board.inspect().stats.semanticFallbacks, 1);

    const discontinuous = harness();
    discontinuous.board.applyNode(node({ previousId: 'missing' }));
    assert.equal(discontinuous.calls.some(call => call[0] === 'applyMove'), false);
    assert.equal(discontinuous.board.inspect().stats.semanticFallbacks, 1);
});
