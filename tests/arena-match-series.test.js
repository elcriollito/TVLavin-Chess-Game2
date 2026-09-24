import assert from 'node:assert/strict';
import test from 'node:test';

await import('../js/arena-match-series.js');

const {
  STATES,
  MatchSeriesController,
  buildSchedule,
  createConfigSnapshot,
  fullMovesToPly,
  validateGameCount
} = globalThis.CaissaArenaMatchSeries;

const participantA = { id: 'sf19', providerId: 'sf19', name: 'Stockfish 19 Lite' };
const participantB = { id: 'sf18', providerId: 'sf18', name: 'Stockfish 18 Lite' };

function createHarness(overrides = {}) {
  let serial = 0;
  const controller = new MatchSeriesController({ idFactory: prefix => `${prefix}-${++serial}` });
  const game = controller.start({
    title: 'Generation Cup', participantA, participantB, gameCount: 1,
    moveLimitFullMoves: null, startingFen: 'start-fen',
    opening: { type: 'standard' }, timeControl: { mode: 'blitz', preset: '3+2' },
    savePgn: true, ...overrides
  });
  return { controller, game };
}

function runGame(controller, game, result = '1/2-1/2', termination = 'stalemate') {
  assert.equal(controller.markRunning(game.generation), true);
  assert.equal(controller.recordMove(game.generation, { uci: 'e2e4' }), true);
  assert.equal(controller.complete(game.generation, { result, termination }), true);
}

test('1-game schedule preserves the selected Game 1 colors', () => {
  const { controller, game } = createHarness();
  assert.equal(controller.schedule.length, 1);
  assert.equal(game.white.id, participantA.id);
  assert.equal(game.black.id, participantB.id);
  runGame(controller, game, '1-0', 'checkmate');
  assert.equal(controller.state, STATES.COMPLETED);
});

test('2-game schedule swaps colors exactly once', () => {
  const { controller, game } = createHarness({ gameCount: 2 });
  runGame(controller, game);
  const second = controller.advance();
  assert.equal(second.white.id, participantB.id);
  assert.equal(second.black.id, participantA.id);
});

test('6-game schedule alternates deterministically', () => {
  const config = createConfigSnapshot({ participantA, participantB, gameCount: 6, startingFen: 'fen' });
  const colors = buildSchedule(config).map(game => `${game.white.id}/${game.black.id}`);
  assert.deepEqual(colors, ['sf19/sf18', 'sf18/sf19', 'sf19/sf18', 'sf18/sf19', 'sf19/sf18', 'sf18/sf19']);
});

test('odd schedules keep the color difference at one', () => {
  const config = createConfigSnapshot({ participantA, participantB, gameCount: 5, startingFen: 'fen' });
  const schedule = buildSchedule(config);
  const aWhite = schedule.filter(game => game.white.id === participantA.id).length;
  const bWhite = schedule.filter(game => game.white.id === participantB.id).length;
  assert.equal(Math.abs(aWhite - bWhite), 1);
});

test('custom game count is bounded to whole numbers from 1 through 100', () => {
  assert.equal(validateGameCount(20), 20);
  assert.equal(validateGameCount('100'), 100);
  for (const invalid of [0, 101, 1.5, '', 'six']) assert.throws(() => validateGameCount(invalid), RangeError);
});

test('standard score tracks points and W-D-L by participant across colors', () => {
  const { controller, game } = createHarness({ gameCount: 3 });
  runGame(controller, game, '1-0', 'checkmate');
  let next = controller.advance();
  runGame(controller, next, '1-0', 'checkmate');
  next = controller.advance();
  runGame(controller, next, '1/2-1/2', 'stalemate');
  assert.deepEqual(controller.score.sf19, {
    id: 'sf19', name: participantA.name, points: 1.5, wins: 1, draws: 1, losses: 1
  });
  assert.deepEqual(controller.score.sf18, {
    id: 'sf18', name: participantB.name, points: 1.5, wins: 1, draws: 1, losses: 1
  });
  assert.equal(controller.score.completed, 3);
  assert.equal(controller.score.remaining, 0);
});

test('full-move limits convert to exact ply limits', () => {
  assert.equal(fullMovesToPly(40), 80);
  assert.equal(fullMovesToPly('60'), 120);
  assert.equal(fullMovesToPly('none'), null);
  assert.throws(() => fullMovesToPly(0), RangeError);
});

test('move limit produces a draw record with move-limit termination', () => {
  const { controller, game } = createHarness({ moveLimitFullMoves: 1 });
  controller.markRunning(game.generation);
  assert.equal(controller.reachedMoveLimit(1, game.generation), false);
  assert.equal(controller.reachedMoveLimit(2, game.generation), true);
  controller.complete(game.generation, { result: '1/2-1/2', termination: 'move-limit' });
  assert.equal(controller.games[0].result, '1/2-1/2');
  assert.equal(controller.games[0].termination, 'move-limit');
});

test('stop retains completed games and marks only the unfinished game stopped', () => {
  const { controller, game } = createHarness({ gameCount: 4 });
  runGame(controller, game, '1-0', 'checkmate');
  const second = controller.advance();
  controller.markRunning(second.generation);
  controller.stop();
  assert.equal(controller.state, STATES.STOPPED);
  assert.equal(controller.score.completed, 1);
  assert.equal(controller.games[0].result, '1-0');
  assert.equal(controller.games[1].result, '*');
  assert.equal(controller.games[1].termination, 'stopped');
});

test('stale callbacks from a prior game generation are rejected', () => {
  const { controller, game } = createHarness({ gameCount: 2 });
  runGame(controller, game);
  const second = controller.advance();
  controller.markRunning(second.generation);
  assert.equal(controller.recordMove(game.generation, { uci: 'a2a4' }), false);
  assert.equal(controller.complete(game.generation, { result: '1-0', termination: 'checkmate' }), false);
  assert.equal(controller.games[1].moves.length, 0);
});

test('configuration snapshot is deeply immutable and detached from the UI input', () => {
  const opening = { type: 'fen', selection: 'original-fen' };
  const { controller } = createHarness({ gameCount: 2, opening });
  opening.selection = 'mutated-fen';
  assert.equal(controller.config.opening.selection, 'original-fen');
  assert.equal(Object.isFrozen(controller.config), true);
  assert.equal(Object.isFrozen(controller.config.opening), true);
  assert.throws(() => { controller.config.gameCount = 99; }, TypeError);
});

test('completed game moves survive preparation of the next game', () => {
  const { controller, game } = createHarness({ gameCount: 2 });
  runGame(controller, game);
  controller.advance();
  assert.deepEqual(controller.games[0].moves, [{ uci: 'e2e4' }]);
});

test('a new series gets new identities and clears prior score and games', () => {
  const { controller, game } = createHarness();
  const firstSeriesId = controller.seriesId;
  const firstGameId = game.gameId;
  runGame(controller, game, '1-0', 'checkmate');
  const next = controller.start({ participantA, participantB, gameCount: 1, startingFen: 'new-fen' });
  assert.notEqual(controller.seriesId, firstSeriesId);
  assert.notEqual(next.gameId, firstGameId);
  assert.equal(controller.games.length, 1);
  assert.equal(controller.score.completed, 0);
  assert.equal(controller.score.sf19.points, 0);
});
