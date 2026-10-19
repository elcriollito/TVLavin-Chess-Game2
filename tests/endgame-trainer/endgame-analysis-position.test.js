import assert from 'node:assert/strict';
import test from 'node:test';
import { EndgameAnalysisPosition } from '../../js/endgame-trainer/puzzle-database/endgame-analysis-position.js';
import { PuzzleSession } from '../../js/puzzles/model.js';

const PUZZLE = Object.freeze({
    id: 'analysis-position',
    fen: '8/8/8/8/8/8/4k3/R5K1 b - - 0 1',
    moves: 'e2f3 a1a3',
    themes: ['endgame', 'rookEndgame'],
});

function solvedSession() {
    const session = new PuzzleSession(PUZZLE);
    assert.equal(session.attempt('a1', 'a3').status, 'solved');
    return session;
}

test('independent analysis accepts legal moves for each side in turn', () => {
    const session = solvedSession();
    const analysis = new EndgameAnalysisPosition();
    analysis.load(session.game.fen());

    const black = analysis.attempt({ from: 'f3', to: 'e2' });
    assert.equal(black.ok, true);
    assert.equal(black.move.san, 'Ke2');
    assert.equal(analysis.turn, 'w');

    const white = analysis.attempt({ from: 'a3', to: 'e3' });
    assert.equal(white.ok, true);
    assert.equal(white.move.san, 'Re3+');
    assert.equal(analysis.turn, 'b');
});

test('analysis rejects illegal and out-of-turn moves without changing its FEN', () => {
    const analysis = new EndgameAnalysisPosition();
    analysis.load(solvedSession().game.fen());
    const before = analysis.fen;

    assert.deepEqual(analysis.attempt({ from: 'a3', to: 'a4' }), {
        ok: false, status: 'illegal', fen: before, move: null,
    });
    assert.deepEqual(analysis.attempt({ from: 'f3', to: 'f8' }), {
        ok: false, status: 'illegal', fen: before, move: null,
    });
    assert.equal(analysis.fen, before);
});

test('manual exploration cannot mutate the canonical puzzle session', () => {
    const session = solvedSession();
    const canonicalFen = session.game.fen();
    const canonicalHistory = session.game.history();
    const analysis = new EndgameAnalysisPosition();
    analysis.load(canonicalFen);
    analysis.attempt({ from: 'f3', to: 'e2' });

    assert.equal(session.solved, true);
    assert.equal(session.game.fen(), canonicalFen);
    assert.deepEqual(session.game.history(), canonicalHistory);
    assert.notEqual(analysis.fen, canonicalFen);
});
