import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { Chess } from 'chess.js';

const require = createRequire(import.meta.url);
const parser = require('@mliebelt/pgn-parser');

function loadScript(relative, extras = {}) {
  const context = vm.createContext({ console, Date, TextEncoder, ...extras });
  vm.runInContext(fs.readFileSync(new URL(relative, import.meta.url), 'utf8'), context);
  return context;
}

const pgn = loadScript('../js/arena-match-pgn.js').CaissaArenaMatchPgn;
const core = loadScript('../js/pgn-replayer/pgn-core.js').CaissaPgnCore;
const parse = source => core.parseCollection(source, { parse: parser.parse, Chess });
const START = pgn.STANDARD_START_FEN;

function game(overrides = {}) {
  return {
    gameId: 'game-1', round: 1,
    white: { id: 'sf18', name: 'Stockfish 18 Lite' },
    black: { id: 'sf19', name: 'Stockfish 19 Lite' },
    startingFen: START,
    opening: { type: 'standard', openingName: 'Standard Position', resultingFen: START },
    timeControl: { mode: 'blitz', preset: '3+2' },
    moves: [{ move: 'e4', uci: 'e2e4' }, { move: 'e5', uci: 'e7e5' }, { move: 'Nf3', uci: 'g1f3' }],
    result: '1-0', termination: 'checkmate', startedAt: new Date(2026, 8, 24).getTime(),
    ...overrides
  };
}

function series(games = [game()], overrides = {}) {
  return {
    seriesId: 'series-safe-token', state: 'COMPLETED', games,
    config: {
      title: 'Stockfish 18 vs 19 Test', gameCount: games.length,
      startingFen: START, timeControl: { mode: 'blitz', preset: '3+2' },
      opening: { type: 'standard', openingName: 'Standard Position', resultingFen: START },
      savePgn: true
    },
    ...overrides
  };
}

test('serializes the seven required PGN headers and CAISSA site', () => {
  const output = pgn.serializeGamePgn(game(), { series: series() });
  for (const tag of ['Event', 'Site', 'Date', 'Round', 'White', 'Black', 'Result', 'TimeControl']) assert.match(output, new RegExp(`\\[${tag} "`));
  assert.match(output, /\[Site "CAISSA Chess"\]/);
});

test('uses exact engine display identities', () => {
  const output = pgn.serializeGamePgn(game(), { series: series() });
  assert.match(output, /\[White "Stockfish 18 Lite"\]/);
  assert.match(output, /\[Black "Stockfish 19 Lite"\]/);
});

for (const [preset, expected] of [['1+0', '60+0'], ['1+1', '60+1'], ['3+2', '180+2'], ['5+3', '300+3'], ['10+5', '600+5'], ['60+30', '3600+30']]) {
  test(`maps ${preset} to PGN TimeControl ${expected}`, () => {
    const output = pgn.serializeGamePgn(game({ timeControl: { mode: 'blitz', preset } }));
    assert.match(output, new RegExp(`\\[TimeControl "${expected.replace('+', '\\+')}"\\]`));
  });
}

test('serializes fixed depth without claiming a clock', () => {
  const output = pgn.serializeGamePgn(game({ timeControl: { mode: 'fixed-depth', preset: '16' } }));
  assert.match(output, /\[TimeControl "-"\]/);
  assert.match(output, /\[CaissaDepth "16"\]/);
});

test('serializes only accepted SAN moves and not ECO setup moves', () => {
  const output = pgn.serializeGamePgn(game({
    moves: [{ move: 'Ba4' }],
    opening: { type: 'eco', eco: 'C60', openingName: 'Ruy Lopez', sanMoves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6'], resultingFen: 'r1bqkbnr/1ppp1ppp/p1n5/1B2p3/B3P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 4' },
    startingFen: 'r1bqkbnr/1ppp1ppp/p1n5/1B2p3/B3P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 4'
  }));
  assert.match(output, /\n\n4\. Ba4 1-0\n$/);
  assert.doesNotMatch(output.split('\n\n')[1], /e4|e5|Nf3|Nc6|Bb5|a6/);
});

test('adds exact ECO, Opening, Variation, SetUp, and FEN headers', () => {
  const fen = 'rnbqkbnr/pp1ppppp/8/2p5/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 2';
  const output = pgn.serializeGamePgn(game({ startingFen: fen, opening: { type: 'eco', eco: 'B20', openingName: 'Sicilian Defense', variationName: 'Bowdler Attack', resultingFen: fen } }));
  assert.match(output, /\[ECO "B20"\]/);
  assert.match(output, /\[Opening "Sicilian Defense: Bowdler Attack"\]/);
  assert.match(output, /\[Variation "Bowdler Attack"\]/);
  assert.match(output, /\[SetUp "1"\]/);
  assert.match(output, new RegExp(`\\[FEN "${fen}"\\]`));
});

test('omits SetUp and FEN for the standard initial position', () => {
  const output = pgn.serializeGamePgn(game());
  assert.doesNotMatch(output, /\[SetUp /);
  assert.doesNotMatch(output, /\[FEN /);
});

test('honors black-to-move fullmove numbering', () => {
  const fen = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 9';
  const output = pgn.serializeGamePgn(game({ startingFen: fen, opening: { type: 'fen', resultingFen: fen }, moves: [{ move: 'Nc6' }, { move: 'Nf3' }], result: '*' }));
  assert.match(output, /\n\n9\.\.\. Nc6 10\. Nf3 \*\n$/);
});

test('keeps header Result and final movetext token identical', () => {
  for (const result of ['1-0', '0-1', '1/2-1/2', '*']) {
    const output = pgn.serializeGamePgn(game({ result, moves: [] }));
    assert.match(output, new RegExp(`\\[Result "${result.replaceAll('*', '\\*')}"\\]`));
    assert.ok(output.trim().endsWith(result));
  }
});

test('records stopped unfinished games truthfully', () => {
  const output = pgn.serializeGamePgn(game({ result: '*', termination: 'stopped' }));
  assert.match(output, /\[Result "\*"\]/);
  assert.match(output, /\[CaissaTermination "stopped"\]/);
});

test('records time forfeits and the exact winner truthfully', () => {
  const output = pgn.serializeGamePgn(game({ result: '0-1', termination: 'time-forfeit', moves: [{ move: 'e4' }] }));
  assert.match(output, /\[CaissaTermination "time-forfeit"\]/);
  assert.match(output, /1\. e4 0-1/);
  assert.doesNotMatch(output, /bestmove/i);
});

test('records move-limit draws truthfully', () => {
  const output = pgn.serializeGamePgn(game({ result: '1/2-1/2', termination: 'move-limit' }));
  assert.match(output, /\[CaissaTermination "move-limit"\]/);
  assert.ok(output.trim().endsWith('1/2-1/2'));
});

test('escapes quotes, backslashes, and line breaks in PGN headers', () => {
  const output = pgn.serializeGamePgn(game({ white: { name: 'A "quoted" \\ engine\nname' } }));
  assert.match(output, /\[White "A \\"quoted\\" \\\\ engine name"\]/);
});

test('serializes multiple series games with a blank separator', () => {
  const games = [game(), game({ gameId: 'game-2', round: 2, result: '0-1' })];
  const output = pgn.serializeSeriesPgn(series(games));
  assert.equal((output.match(/\[Event /g) || []).length, 2);
  assert.match(output, /1-0\n\n\[Event /);
});

test('adds optional series association headers', () => {
  const output = pgn.serializeGamePgn(game({ round: 2 }), { series: series([game(), game({ round: 2 })]) });
  assert.match(output, /\[CaissaSeriesId "series-safe-token"\]/);
  assert.match(output, /\[CaissaGame "2"\]/);
  assert.match(output, /\[CaissaSeriesGames "2"\]/);
});

test('adds balanced opening set and position index headers', () => {
  const setSeries = series([game({ opening: { type: 'eco', eco: 'B90', openingName: 'Sicilian Defense', variationName: 'Najdorf', setId: 'set-1', order: 3 } })]);
  setSeries.config.opening = { type: 'set', id: 'set-1', title: 'Najdorf Lab', gameCount: 6 };
  const output = pgn.serializeSeriesPgn(setSeries);
  assert.match(output, /\[CaissaOpeningSet "Najdorf Lab"\]/);
  assert.match(output, /\[CaissaOpeningIndex "3"\]/);
});

test('produces deterministic sanitized download filenames', () => {
  assert.equal(pgn.sanitizeFilename('SF18 / SF19: Test #1'), 'sf18-sf19-test-1.pgn');
  assert.equal(pgn.sanitizeFilename(''), 'caissa-match.pgn');
});

test('uses a stable numeric Round fallback', () => {
  const output = pgn.serializeGamePgn(game({ round: 'not-round' }), { index: 4 });
  assert.match(output, /\[Round "5"\]/);
});

test('emits local calendar date in PGN format', () => {
  assert.equal(pgn.pgnDate(new Date(2026, 0, 3, 23, 59)), '2026.01.03');
});

test('round-trips standard PGN through the existing CAISSA Reader parser', () => {
  const collection = parse(pgn.serializeGamePgn(game(), { series: series() }));
  assert.equal(collection.games.length, 1);
  assert.deepEqual(Array.from(collection.games[0].mainline, move => move.san), ['e4', 'e5', 'Nf3']);
  assert.equal(collection.games[0].headers.CaissaTermination, 'checkmate');
});

test('round-trips black-to-move custom FEN through the existing Reader parser', () => {
  const fen = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 9';
  const output = pgn.serializeGamePgn(game({ startingFen: fen, opening: { type: 'fen', resultingFen: fen }, moves: [{ move: 'Nc6' }, { move: 'Nf3' }], result: '*' }));
  const collection = parse(output);
  assert.equal(collection.games[0].startFen, fen);
  assert.deepEqual(Array.from(collection.games[0].mainline, move => move.san), ['Nc6', 'Nf3']);
  assert.equal(collection.games[0].mainline[0].moveNumber, 9);
});

test('round-trips a multi-game series through the existing Reader parser', () => {
  const games = [game(), game({ gameId: 'game-2', round: 2, white: { name: 'Stockfish 19 Lite' }, black: { name: 'Stockfish 18 Lite' }, result: '0-1' })];
  const collection = parse(pgn.serializeSeriesPgn(series(games)));
  assert.equal(collection.games.length, 2);
  assert.equal(collection.games[1].headers.Round, '2');
  assert.equal(collection.games[1].headers.Result, '0-1');
});

test('rejects missing games and empty series instead of fabricating records', () => {
  assert.throws(() => pgn.serializeGamePgn(null), /required/);
  assert.throws(() => pgn.serializeSeriesPgn(series([])), /No Match Lab games/);
});
