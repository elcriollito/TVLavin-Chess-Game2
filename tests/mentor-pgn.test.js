import test from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from '../assets/vendor/chess.js/chess-1.4.0.esm.js';
import { parseMentorPgn, gameReviewPrompt, moveLabel, PGN_LIMITS } from '../js/mentor/mentor-pgn.js';
const pgn = '[Event "Test"]\n[White "Alex"]\n[Black "Opponent"]\n[Result "1-0"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 1-0';

test('completed PGN preserves mainline positions, castling and immutable data', () => {
    const game = parseMentorPgn(pgn.replace('3. Bb5 a6 1-0', '3. Bb5 a6 4. Ba4 Nf6 5. O-O 1-0'))[0];
    assert.equal(game.white, 'Alex'); assert.equal(game.moves.at(-1).san, 'O-O');
    const chess = new Chess(game.positions[0]);
    game.moves.forEach((move, index) => { chess.move(move); assert.equal(chess.fen(), game.positions[index + 1]); });
    assert.ok(Object.isFrozen(game)); assert.ok(Object.isFrozen(game.moves));
    assert.equal(game.notes.length, game.positions.length);
});

test('multi-game collection handles comments and ignores side variations without splitting comment Event text', () => {
    const first = pgn.replace('1. e4 e5', '1. e4 {\n[Event "Comment only"]\n} e5 (1... c5)');
    const games = parseMentorPgn(first + '\n\n' + pgn.replace('Alex', 'Another'));
    assert.equal(games.length, 2); assert.equal(games[0].moves[1].san, 'e5'); assert.equal(games[1].white, 'Another');
});

test('custom starting FEN handles Black first, move numbering and promotion', () => {
    const game = parseMentorPgn('[Event "Promotion"]\n[SetUp "1"]\n[FEN "4k3/8/8/8/8/8/4p3/4K3 b - - 0 23"]\n[Result "0-1"]\n\n23... Kd7 24. Kd2 e1=Q+ 0-1')[0];
    assert.equal(moveLabel(game, 0), '23… Kd7'); assert.equal(moveLabel(game, 1), '24. Kd2');
    assert.equal(game.moves.at(-1).promotion, 'q');
});

test('PGN en passant follows Chess.js legal positions', () => {
    const game = parseMentorPgn('[Event "EP"]\n[Result "1-0"]\n\n1. e4 a6 2. e5 d5 3. exd6 1-0')[0];
    const chess = new Chess(game.positions.at(-1)); assert.equal(chess.get('d5'), undefined); assert.equal(chess.get('d6').type, 'p');
});

test('invalid, ongoing, oversized and too deeply nested collections are rejected atomically', () => {
    assert.throws(() => parseMentorPgn(''), /Paste/);
    assert.throws(() => parseMentorPgn(pgn.replace('e5', 'Ke8')), /Game 1/);
    assert.throws(() => parseMentorPgn(pgn.replaceAll('1-0', '*')), /completed/);
    assert.throws(() => parseMentorPgn(pgn + '\n\n' + pgn.replace('e5', 'Ke8')), /Game 2/);
    assert.throws(() => parseMentorPgn(' '.repeat(PGN_LIMITS.characters + 1) + pgn), /too large/);
    assert.throws(() => parseMentorPgn(Array(51).fill(pgn).join('\n\n')), /50 games/);
    assert.throws(() => parseMentorPgn(pgn.replace('e4', 'e4 ' + '('.repeat(17) + ')'.repeat(17))), /deeply/);
});

test('review prompt includes the actual full mainline and selected position without claiming engine output', () => {
    const game = parseMentorPgn(pgn)[0], prompt = gameReviewPrompt(game, 3, game.positions[3]);
    assert.match(prompt, /Alex vs Opponent/); assert.match(prompt, /3\. Bb5/);
    assert.ok(prompt.includes(game.positions[3])); assert.match(prompt, /not run engine analysis/);
    assert.ok(prompt.length < 12000);
});
