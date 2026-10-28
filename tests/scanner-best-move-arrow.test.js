import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import { Chess } from 'chess.js';

const read = (file) => fs.readFile(new URL(`../${file}`, import.meta.url), 'utf8');

async function arrowApi() {
  const window = { Chess };
  vm.runInNewContext(await read('scanner/scanner-best-move-arrow.js'), { window });
  return window.CaissaScannerBestMoveArrow;
}

test('best move arrow accepts the legal first UCI move and rejects invalid PV data', async () => {
  const api = await arrowApi();
  const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  assert.deepEqual({ ...api.resolvePrimaryMove(fen, ['e2e4', 'e7e5']) }, {
    uci: 'e2e4', from: 'e2', to: 'e4', promotion: null
  });
  assert.equal(api.resolvePrimaryMove(fen, ['e7e5']), null);
  assert.equal(api.resolvePrimaryMove(fen, ['e2e4q']), null);
  assert.equal(api.resolvePrimaryMove(fen, ['not-uci']), null);
  assert.equal(api.resolvePrimaryMove(fen, []), null);
  assert.equal(api.resolvePrimaryMove('7k/P7/8/8/8/8/8/K7 w - - 0 1', ['a7a8']), null);
});

test('best move arrow legality supports captures, castling, promotions, and checking moves', async () => {
  const api = await arrowApi();
  const cases = [
    ['4k3/8/8/8/8/8/4p3/4K3 w - - 0 1', 'e1e2'],
    ['r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1', 'e1g1'],
    ['7k/P7/8/8/8/8/8/K7 w - - 0 1', 'a7a8q'],
    ['4k3/8/8/8/8/8/4R3/4K3 w - - 0 1', 'e2e7']
  ];
  for (const [fen, uci] of cases) assert.equal(api.resolvePrimaryMove(fen, [uci])?.uci, uci);
});

test('scanner analysis rejects stale generations before updating the primary arrow', async () => {
  const source = await read('scanner/scanner-analysis.js');
  const searches = [];
  let generation = 0;
  const engine = {
    ready: true,
    start: async () => true,
    setMultiPV() {},
    startAnalysisAttributed(fen, callback) {
      const id = ++generation;
      searches.push({ fen, callback, id });
      return id;
    },
    stopAnalysis() {}
  };
  const window = { Chess, EngineRegistry: { createAnalyzeEngine: () => engine } };
  vm.runInNewContext(source, { window });
  let squareHandler = null;
  const shown = [];
  const arrow = {
    clear() {}, refresh() {}, setPosition() {}, setEngineActive() {},
    showPrimaryVariation(value) { shown.push(value); }
  };
  const analysis = window.CaissaScannerAnalysis.create({
    board: { classList: { toggle() {}, remove() {} } },
    fenTools: {
      render(_board, _fen, _flipped, handler) { squareHandler = handler; },
      squareName: (row, col) => String.fromCharCode(97 + col) + (8 - row)
    },
    panel: {}, status: {}, fenOutput: {}, moveHint: {},
    lineEls: Array.from({ length: 3 }, () => ({ score: {}, depth: {}, pv: {} })),
    arrow
  });
  const initial = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  await analysis.start(initial);
  searches[0].callback({ multipv: 1, depth: 8, score: .2, pv: ['e2e4'] }, searches[0].id);
  assert.equal(shown.at(-1).pv[0], 'e2e4');

  squareHandler(6, 4);
  squareHandler(4, 4);
  assert.equal(searches.length, 2);
  const countBeforeStale = shown.length;
  searches[0].callback({ multipv: 1, depth: 18, score: .4, pv: ['d2d4'] }, searches[0].id);
  assert.equal(shown.length, countBeforeStale);
  searches[1].callback({ multipv: 1, depth: 8, score: .1, pv: ['e7e5'] }, searches[1].id);
  assert.equal(shown.at(-1).pv[0], 'e7e5');
});
