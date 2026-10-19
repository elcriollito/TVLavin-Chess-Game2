import assert from 'node:assert/strict';
import test from 'node:test';
import { pairEndgameMoves } from '../../js/endgame-trainer/puzzle-database/endgame-move-history.js';

const move = (color, number, san) => Object.freeze({
    color,
    san,
    before: `8/8/8/8/8/8/4k3/6K1 ${color} - - 0 ${number}`,
});

test('pairs a White-first history by color and fullmove number', () => {
    const rows = pairEndgameMoves([
        move('w', 12, 'O-O'),
        move('b', 12, 'Kf7'),
        move('w', 13, 'e8=Q+'),
    ]);

    assert.deepEqual(rows.map(row => [row.number, row.white?.san, row.black?.san]), [
        [12, 'O-O', 'Kf7'],
        [13, 'e8=Q+', undefined],
    ]);
    assert.equal(rows[0].white.cursor, 1);
    assert.equal(rows[0].black.cursor, 2);
    assert.equal(rows[1].white.cursor, 3);
});

test('preserves a Black-first partial row and an incomplete final row', () => {
    const rows = pairEndgameMoves([
        move('b', 37, 'g4'),
        move('w', 38, 'hxg4'),
        move('b', 38, 'hxg4'),
        move('w', 39, 'Kf4'),
        move('b', 39, 'c5'),
        move('w', 40, 'bxc5+'),
    ]);

    assert.deepEqual(rows.map(row => [row.number, row.white?.san, row.black?.san]), [
        [37, undefined, 'g4'],
        [38, 'hxg4', 'hxg4'],
        [39, 'Kf4', 'c5'],
        [40, 'bxc5+', undefined],
    ]);
});

test('SAN remains canonical for captures, checks, checkmates, promotions, and castling', () => {
    const sans = ['O-O-O', 'Qxh7#', 'exd8=N+'];
    const rows = pairEndgameMoves([
        move('w', 7, sans[0]),
        move('b', 7, sans[1]),
        move('w', 8, sans[2]),
    ]);

    assert.deepEqual(rows.flatMap(row => [row.white?.san, row.black?.san].filter(Boolean)), sans);
});
