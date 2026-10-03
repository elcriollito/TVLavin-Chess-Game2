import test from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from '../assets/vendor/chess.js/chess-1.4.0.esm.js';
import '../js/insights/core.js';
const core = globalThis.CaissaInsightsCore;
export function pgn(white = 'Alex', black = 'Opponent', result = '*', moves = '1. e4 e5 2. Nf3 Nc6', extra = '') {
    return `[Event "Synthetic"]\n[White "${white}"]\n[Black "${black}"]\n[Result "${result}"]\n${extra}\n${moves} ${result}`;
}
const parse = (text, opts = {}) => core.parse(text, { provider: 'local', username: 'Alex', ...opts }, Chess);
test('results follow the selected player, with unfinished and foreign games separate', () => {
    const dataset = parse([pgn('Alex', 'B', '1-0'), pgn('B', 'alex', '0-1'), pgn('Alex', 'B', '0-1'),
        pgn('B', 'Alex', '1/2-1/2'), pgn(), pgn('X', 'Y', '1-0')].join('\n\n'));
    assert.deepEqual([dataset.stats.wins, dataset.stats.draws, dataset.stats.losses, dataset.stats.unfinished, dataset.stats.unidentified], [2, 1, 1, 1, 1]);
});
test('color is filtered before taking the configured number of games', () => {
    const dataset = parse([pgn('B', 'Alex'), pgn('Alex', 'B'), pgn('Alex', 'C')].join('\n\n'));
    assert.equal(core.selectGames(dataset, 1, 'white')[0].id, 'local:1');
    assert.equal(core.selectGames(dataset, 1, 'black')[0].id, 'local:0');
});
test('PGN without Event tags and tag-looking comments split into the correct games', () => {
    const text = [pgn().replace('[Event "Synthetic"]\n', '').replace('e4 e5', 'e4 {\n[Event "Comment"]\n} e5'), pgn('Alex', 'C').replace('[Event "Synthetic"]\n', '')].join('\n\n');
    assert.equal(parse(text).games.length, 2);
});
test('illegal SAN, empty games, conflicting results and unsupported variants are rejected', () => {
    for (const text of [pgn('Alex', 'B', '*', '1. e4 e5 2. Qh9'), pgn('Alex', 'B', '*', ''),
        pgn('Alex', 'B', '1-0').replace(/1-0$/, '0-1'), pgn('Alex', 'B', '*', '1. e4', '[Variant "Chess960"]')]) {
        const data = parse(text); assert.equal(data.games.length, 0); assert.equal(data.rejected.length, 1);
    }
});
test('starting FEN, side to move and fullmove number survive replay', () => {
    const start = '4k3/8/8/8/8/8/4P3/4K3 b - - 0 30';
    const game = parse(pgn('B', 'Alex', '*', '30... Kd7 31. e4', `[SetUp "1"]\n[FEN "${start}"]`)).games[0];
    assert.equal(game.startingFen, start);
    const replay = core.replay(game, Chess); assert.equal(replay.moves[0].color, 'b'); assert.equal(replay.positions[0], start);
    assert.equal(core.phase(start), 'endgame');
});
test('castling, en passant and promotion use the same legal replay', () => {
    const fixtures = [
        pgn('Alex', 'B', '*', '1. O-O O-O-O', '[SetUp "1"]\n[FEN "r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1"]'),
        pgn('Alex', 'B', '*', '1. e4 a6 2. e5 d5 3. exd6'),
        pgn('Alex', 'B', '*', '40. a8=Q+ Kh7', '[SetUp "1"]\n[FEN "7k/P7/8/8/8/8/8/7K w - - 0 40"]')
    ];
    for (const text of fixtures) { const data = parse(text); assert.equal(data.rejected.length, 0); assert.equal(core.replay(data.games[0], Chess).moves.length, data.games[0].plyCount); }
});
test('local games are not merged by identical moves; online provider IDs deduplicate', () => {
    const text = `${pgn()}\n\n${pgn()}`;
    assert.equal(parse(text).games.length, 2);
    const online = parse(text, { provider: 'lichess', importedGames: [{ id: 'same' }, { id: 'same' }] });
    assert.equal(online.games.length, 1); assert.equal(online.rejected[0].reason, 'Duplicate provider ID');
});
test('unknown or ambiguous player names never produce attributed wins', () => {
    assert.equal(parse(pgn(), { username: '' }).stats.wins, 0);
    const data = parse(pgn('Alex', 'Alex', '1-0')); assert.equal(data.games[0].identityStatus, 'ambiguous'); assert.equal(data.stats.unidentified, 1);
});
test('favorable changes are zero loss for either color and missing scores are unavailable', () => {
    const cp = n => ({ status: 'complete', cp: n, mate: null });
    assert.equal(core.loss(cp(0), cp(200), 'w').cp, 0);
    assert.equal(core.loss(cp(0), cp(-200), 'b').cp, 0);
    assert.equal(core.loss(cp(100), cp(-50), 'w').cp, 150);
    assert.equal(core.loss(cp(-100), cp(50), 'b').cp, 150);
    assert.equal(core.loss({ status: 'unavailable' }, cp(0), 'w'), null);
});
test('mate transitions remain separate from centipawn loss', () => {
    const before = { status: 'complete', cp: 100, mate: null };
    const after = { status: 'complete', cp: null, mate: -3 };
    assert.deepEqual(core.loss(before, after, 'w'), { cp: null, mateTransition: 'allowed_forced_mate' });
    assert.equal(core.loss({ ...after, mate: 2 }, before, 'w').mateTransition, 'lost_forced_mate');
});
test('phase uses full moves rather than 15 plies', () => {
    assert.equal(core.phase(core.START_FEN.replace('0 1', '0 15')), 'opening');
    assert.equal(core.phase(core.START_FEN.replace('0 1', '0 16')), 'middlegame');
});
test('import limits fail explicitly instead of silently truncating', () => {
    assert.throws(() => parse(Array(101).fill(pgn()).join('\n\n')), /100 games/);
    assert.throws(() => parse(' '.repeat(1048577) + pgn()), /1 MiB/);
});
