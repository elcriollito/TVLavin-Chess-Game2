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

test('analysis navigation reconstructs every historical FEN', () => {
    const analysis = new EndgameAnalysisPosition();
    const origin = analysis.load(solvedSession().game.fen()).fen;
    const afterBlack = analysis.attempt({ from: 'f3', to: 'e2' }).fen;
    const afterWhite = analysis.attempt({ from: 'a3', to: 'e3' }).fen;
    const afterSecondBlack = analysis.attempt({ from: 'e2', to: 'd2' }).fen;

    assert.deepEqual([origin, afterBlack, afterWhite, afterSecondBlack], [
        '8/8/8/8/8/R4k2/8/6K1 b - - 2 2',
        '8/8/8/8/8/R7/4k3/6K1 w - - 3 3',
        '8/8/8/8/8/4R3/4k3/6K1 b - - 4 3',
        '8/8/8/8/8/4R3/3k4/6K1 w - - 5 4',
    ]);
    assert.equal(analysis.snapshot().positionCount, 4);
    assert.equal(analysis.navigate(0).fen, origin);
    assert.equal(analysis.navigate(1).fen, afterBlack);
    assert.equal(analysis.navigate(2).fen, afterWhite);
    assert.equal(analysis.navigate(3).fen, afterSecondBlack);
    assert.equal(analysis.snapshot().atEnd, true);
    assert.equal(analysis.navigate(-1), null);
    assert.equal(analysis.navigate(4), null);
});

test('a legal move after rewind truncates the abandoned continuation', () => {
    const analysis = new EndgameAnalysisPosition();
    analysis.load(solvedSession().game.fen());
    analysis.attempt({ from: 'f3', to: 'e2' });
    analysis.attempt({ from: 'a3', to: 'e3' });
    analysis.attempt({ from: 'e2', to: 'd2' });

    analysis.navigate(1);
    const branch = analysis.attempt({ from: 'a3', to: 'a4' });

    assert.equal(branch.ok, true);
    assert.equal(branch.truncated, 2);
    assert.equal(branch.cursor, 2);
    assert.equal(branch.lastIndex, 2);
    assert.equal(analysis.snapshot().positionCount, 3);
    assert.equal(analysis.snapshot().history.at(-1).san, 'Ra4');
    assert.equal(analysis.navigate(3), null);
});

test('a canonical history is cloned with an independent selectable cursor', () => {
    const session = solvedSession();
    const canonicalFen = session.game.fen();
    const history = session.game.history({ verbose: true });
    const analysis = new EndgameAnalysisPosition();

    const selected = analysis.loadHistory(history, 1);

    assert.equal(selected.cursor, 1);
    assert.equal(selected.positionCount, 3);
    assert.equal(selected.history.length, 1);
    assert.equal(selected.timeline.length, 2);
    assert.equal(selected.timeline[0].san, 'Kf3');
    assert.equal(selected.timeline[1].san, 'Ra3+');
    assert.equal(session.game.fen(), canonicalFen);
    assert.equal(analysis.navigate(2).fen, canonicalFen);
});
