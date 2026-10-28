import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { Chess } from 'chess.js';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('mobile Review/Edit keeps the essential controls visible and moves secondary actions into More', async () => {
  const [html, css] = await Promise.all([
    read('scanner/index.html'),
    read('scanner/scanner-experience.css')
  ]);

  assert.match(html, /id="editWhiteTurnBtn"/);
  assert.match(html, /id="editBlackTurnBtn"/);
  assert.match(html, /id="clearSquareBtn"/);
  assert.match(html, /id="correctOrientationBtn"[^>]*aria-label="Correct Orientation: A1 to H8"[\s\S]*?A1 &#8596; H8/);
  assert.match(html, /id="editMoreBtn"[^>]*aria-controls="editMorePanel"/);
  assert.match(html, /id="editMorePanel" hidden[\s\S]*id="editCastlingBtn"[\s\S]*id="clearBoardBtn"/);
  assert.match(html, /class="coordinate-visibility-control" id="editCoordinatesVisibilityBtn"/);
  assert.match(css, /\.coordinate-visibility-control\{display:none!important\}/);
});

test('active-color editing changes only the FEN side-to-move field', async () => {
  const source = await read('scanner/scanner-fen.js');
  const window = {};
  vm.runInNewContext(source, { window });
  const original = 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq e3 4 10';
  const changed = window.CaissaScannerFen.setSideToMove(original, 'b');
  const before = original.split(' ');
  const after = changed.split(' ');

  assert.equal(after[1], 'b');
  assert.deepEqual([after[0], ...after.slice(2)], [before[0], ...before.slice(2)]);
});

test('workspace removes the visible Analyze CTA and exposes an honest Stockfish summary', async () => {
  const html = await read('scanner/index.html');
  assert.match(html, /id="analyzeBtn"[^>]*hidden[^>]*tabindex="-1"[^>]*aria-hidden="true"/);
  assert.match(html, /<strong>Stockfish 18<\/strong><small>White perspective<\/small>/);
  assert.match(html, /id="primaryEvaluation">&mdash;<\/strong>/);
  assert.match(html, /id="primaryEvaluationDepth">&mdash;<\/strong>/);
  assert.match(html, /id="primaryBestMove">&mdash;<\/strong>/);
  assert.match(html, /id="primaryEvaluationState">Engine off<\/span>/);
  assert.match(html, /id="engineToggle"[^>]*role="switch"/);
  assert.match(html, /id="arrowsToggle"[^>]*checked/);
});

test('MultiPV 1 alone drives the White-perspective primary evaluation summary and stale searches are ignored', async () => {
  const source = await read('scanner/scanner-analysis.js');
  const searches = [];
  let generation = 0;
  const engine = {
    ready: true,
    start: async () => true,
    setMultiPV(value) { assert.equal(value, 3); },
    startAnalysisAttributed(fen, callback) {
      const id = ++generation;
      searches.push({ fen, callback, id });
      return id;
    },
    stopAnalysis() {}
  };
  const window = { Chess, EngineRegistry: { createAnalyzeEngine: () => engine } };
  vm.runInNewContext(source, { window });
  const node = () => ({ textContent: '' });
  const primaryEvaluation = node();
  const primaryEvaluationDepth = node();
  const primaryBestMove = node();
  const primaryEvaluationState = node();
  const analysis = window.CaissaScannerAnalysis.create({
    board: { classList: { toggle() {}, remove() {} } },
    fenTools: { render() {}, squareName: (row, col) => String.fromCharCode(97 + col) + (8 - row) },
    panel: {}, status: node(), fenOutput: node(), moveHint: node(),
    lineEls: Array.from({ length: 3 }, () => ({ score: node(), depth: node(), pv: node() })),
    primaryEvaluation, primaryEvaluationDepth, primaryBestMove, primaryEvaluationState
  });
  const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

  await analysis.start(fen);
  searches[0].callback({ multipv: 2, depth: 11, score: -0.3, pv: ['d2d4'] }, searches[0].id);
  assert.equal(primaryEvaluation.textContent, '\u2014');
  searches[0].callback({ multipv: 1, depth: 13, score: 0.42, pv: ['e2e4', 'e7e5'] }, searches[0].id);
  assert.equal(primaryEvaluation.textContent, '+0.42');
  assert.equal(primaryEvaluationDepth.textContent, '13');
  assert.equal(primaryBestMove.textContent, 'e4');
  assert.equal(primaryEvaluationState.textContent, 'Analyzing');

  await analysis.start(fen);
  searches[0].callback({ multipv: 1, depth: 18, mate: 3, pv: ['d2d4'] }, searches[0].id);
  assert.equal(primaryEvaluation.textContent, '\u2014');
  searches[1].callback({ multipv: 1, depth: 18, mate: -2, pv: ['e2e4'] }, searches[1].id);
  assert.equal(primaryEvaluation.textContent, '-M2');

  analysis.stop();
  assert.equal(primaryEvaluation.textContent, '\u2014');
  assert.equal(primaryEvaluationState.textContent, 'Engine off');
});
