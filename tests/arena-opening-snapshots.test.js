import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { Chess } from 'chess.js';

globalThis.Chess = Chess;
await import('../js/arena-opening-snapshots.js');
await import('../js/arena-match-series.js');

const openings = globalThis.CaissaArenaOpeningSnapshots;
const series = globalThis.CaissaArenaMatchSeries;
const participantA = { id: 'a', name: 'Engine A', providerId: 'a' };
const participantB = { id: 'b', name: 'Engine B', providerId: 'b' };
const catalog = JSON.parse(fs.readFileSync(new URL('../data/eco/eco_codes.json', import.meta.url), 'utf8'));

function eco(code) {
  const row = catalog.find(candidate => candidate.code === code);
  assert.ok(row, `${code} exists in the canonical catalog`);
  return openings.createEcoSnapshot(row, Chess);
}

test('standard start snapshot is canonical and immutable', () => {
  const snapshot = openings.createStandardSnapshot();
  assert.equal(snapshot.resultingFen, openings.STANDARD_START_FEN);
  assert.equal(snapshot.type, 'standard');
  assert.equal(Object.isFrozen(snapshot), true);
});

test('canonical B90 ECO line resolves through legal SAN to its exact six-field FEN', () => {
  const snapshot = eco('B90');
  assert.equal(snapshot.openingName, 'Sicilian Defense');
  assert.equal(snapshot.variationName, 'Najdorf');
  assert.equal(snapshot.sanMoves.join(' '), 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6');
  assert.equal(snapshot.resultingFen, 'rnbqkb1r/1p2pppp/p2p1n2/8/3NP3/2N5/PPP2PPP/R1BQKB1R w KQkq - 0 6');
});

test('ECO resolution preserves castling rights, en passant, and Black to move', () => {
  const castling = openings.createEcoSnapshot({ code: 'C60', name: 'Ruy Lopez', moves: '1. e4 e5 2. Nf3 Nc6 3. Bb5' }, Chess);
  assert.equal(castling.resultingFen.split(' ')[2], 'KQkq');
  assert.equal(castling.resultingFen.split(' ')[1], 'b');
  const enPassant = openings.createEcoSnapshot({ code: 'A00', name: 'EP fixture', moves: '1. e4 c5 2. e5 d5' }, Chess);
  assert.equal(enPassant.resultingFen.split(' ')[3], 'd6');
});

test('invalid ECO move is rejected atomically and malformed rows are skipped in search', () => {
  const bad = { code: 'A00', name: 'Broken', moves: '1. e4 illegal' };
  assert.throws(() => openings.createEcoSnapshot(bad, Chess), /invalid move/);
  assert.deepEqual(openings.searchCatalog([bad], '', Chess), []);
});

test('snapshot is detached and deeply immutable', () => {
  const row = { code: 'B20', name: 'Sicilian Defense', moves: '1. e4 c5' };
  const snapshot = openings.createEcoSnapshot(row, Chess);
  row.name = 'Mutated';
  assert.equal(snapshot.openingName, 'Sicilian Defense');
  assert.equal(Object.isFrozen(snapshot.sanMoves), true);
  assert.throws(() => snapshot.sanMoves.push('Nf3'), TypeError);
});

test('custom FEN reuses six-field validation without state mutation on rejection', () => {
  const valid = '8/8/8/8/8/8/2k5/K7 b - - 17 42';
  assert.equal(openings.createFenSnapshot(valid, Chess).resultingFen, valid);
  assert.throws(() => openings.createFenSnapshot('8/8/8', Chess), /invalid/);
});

test('one-position opening set derives one or two games from playBothColors', () => {
  const position = eco('B20');
  assert.equal(openings.createOpeningSet({ positions: [position], playBothColors: false }).gameCount, 1);
  assert.equal(openings.createOpeningSet({ positions: [position], playBothColors: true }).gameCount, 2);
});

test('three positions with both colors produce six paired deterministic schedule items', () => {
  const opening = openings.createOpeningSet({ positions: [eco('B20'), eco('C60'), eco('D85')], playBothColors: true });
  const config = series.createConfigSnapshot({ participantA, participantB, gameCount: 99, opening, startingFen: opening.positions[0].resultingFen });
  const schedule = series.buildSchedule(config);
  assert.equal(config.gameCount, 6);
  assert.deepEqual(schedule.map(game => `${game.white.id}/${game.black.id}`), ['a/b', 'b/a', 'a/b', 'b/a', 'a/b', 'b/a']);
  assert.deepEqual(schedule.map(game => game.startingFen), [
    opening.positions[0].resultingFen, opening.positions[0].resultingFen,
    opening.positions[1].resultingFen, opening.positions[1].resultingFen,
    opening.positions[2].resultingFen, opening.positions[2].resultingFen
  ]);
});

test('playBothColors off alternates engine assignments across positions', () => {
  const opening = openings.createOpeningSet({ positions: [eco('B20'), eco('C60'), eco('D85')], playBothColors: false });
  const config = series.createConfigSnapshot({ participantA, participantB, opening, startingFen: opening.positions[0].resultingFen });
  assert.deepEqual(series.buildSchedule(config).map(game => game.white.id), ['a', 'b', 'a']);
});

test('prepared and completed game records retain their immutable opening metadata', () => {
  const snapshot = eco('C60');
  const controller = new series.MatchSeriesController({ idFactory: prefix => `${prefix}-1` });
  const game = controller.start({ participantA, participantB, gameCount: 1, opening: snapshot, startingFen: snapshot.resultingFen });
  assert.equal(game.opening.eco, 'C60');
  assert.equal(game.startingFen.split(' ')[1], 'b');
  assert.equal(Object.isFrozen(game.opening), true);
  controller.markRunning(game.generation);
  assert.equal(controller.reachedMoveLimit(0, game.generation), false);
  controller.complete(game.generation, { result: '1/2-1/2', termination: 'stalemate' });
  assert.equal(controller.games[0].opening.resultingFen, snapshot.resultingFen);
});

test('same-opening two-game series keeps FEN and swaps only engine colors', () => {
  const snapshot = eco('B90');
  const config = series.createConfigSnapshot({ participantA, participantB, gameCount: 2, opening: snapshot, startingFen: snapshot.resultingFen });
  const schedule = series.buildSchedule(config);
  assert.equal(schedule[0].startingFen, schedule[1].startingFen);
  assert.equal(schedule[0].startingFen.split(' ')[1], schedule[1].startingFen.split(' ')[1]);
  assert.equal(schedule[0].white.id, schedule[1].black.id);
});

test('catalog search covers ECO code, opening, and variation', () => {
  assert.equal(openings.searchCatalog(catalog, 'B90', Chess)[0].snapshot.eco, 'B90');
  assert.equal(openings.searchCatalog(catalog, 'Najdorf', Chess)[0].snapshot.eco, 'B90');
  assert.ok(openings.searchCatalog(catalog, "King's Indian", Chess).length > 0);
});
