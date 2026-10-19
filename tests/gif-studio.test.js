import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { encodeGif, MAX_GIF_FRAMES, rgbaToIndices } from '../js/gif-studio/gif-encoder.js';
import { EXAMPLE_PGN, MAX_PLIES, parseGame, frameRange, fenSquares } from '../js/gif-studio/game-model.js';

const root = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

class FakeChess {
  loadPgn(source) { if (!source.includes('1. e4 e5')) throw new Error('invalid'); }
  history() { return [
    { san: 'e4', from: 'e2', to: 'e4', before: 'start', after: 'after-e4' },
    { san: 'e5', from: 'e7', to: 'e5', before: 'after-e4', after: 'after-e5' }
  ]; }
  getHeaders() { return { White: '<Alice>', Black: 'Bob', Result: '1-0' }; }
}

test('imports a PGN into a consistent, read-only timeline', () => {
  const game = parseGame('1. e4 e5', FakeChess);
  assert.deepEqual(game.positions, ['start', 'after-e4', 'after-e5']);
  assert.equal(game.plies, 2);
  assert.equal(game.white, '<Alice>');
  assert.equal(game.moves[1].san, 'e5');
});

test('rejects unsupported URLs and maliciously large inputs with actionable errors', () => {
  assert.throws(() => parseGame('https://www.chess.com/game/live/123', FakeChess), /URL import is planned/);
  assert.throws(() => parseGame('a'.repeat(256 * 1024 + 1), FakeChess), /too large/);
  assert.throws(() => parseGame('invalid', FakeChess), /could not be loaded/);
});

test('supports only bounded contiguous position ranges', () => {
  assert.deepEqual(frameRange(7, 2, 4), [2, 3, 4]);
  assert.throws(() => frameRange(7, 4, 4), /end must follow/);
  assert.throws(() => frameRange(7, -1, 4), /end must follow/);
  assert.throws(() => frameRange(7, 0, 8), /end must follow/);
});

test('reads FEN board including promotions and empty squares', () => {
  const grid = fenSquares('4k3/8/2Q5/8/8/8/8/4K3 w - - 0 1');
  assert.equal(grid[2][2].type, 'Q');
  assert.equal(grid[2][2].color, 'w');
  assert.equal(grid[0][4].color, 'b');
  assert.equal(grid[3][4], null);
  assert.throws(() => fenSquares('invalid'), /Invalid/);
});

test('encodes real GIF89a images with frame delays and bounded memory', async () => {
  const rgba = new Uint8Array(64 * 64 * 4);
  for (let i = 0; i < rgba.length; i += 4) { rgba[i] = 255; rgba[i + 3] = 255; }
  assert.equal(rgbaToIndices(rgba, 64, 64)[0], 0xe0);
  const blob = await encodeGif({ width: 64, height: 64, frameCount: 2, frameAt: () => rgba, durationAt: i => i ? 1300 : 500 });
  assert.equal(blob.type, 'image/gif');
  const buffer = new Uint8Array(await blob.arrayBuffer());
  assert.equal(new TextDecoder().decode(buffer.subarray(0, 6)), 'GIF89a');
  assert.equal(buffer[buffer.length - 1], 0x3b);
  assert.ok(buffer.length > 100);
  await assert.rejects(() => encodeGif({ width: 1000, height: 64, frameCount: 2, frameAt: () => rgba }), RangeError);
  await assert.rejects(() => encodeGif({ width: 64, height: 64, frameCount: MAX_GIF_FRAMES + 1, frameAt: () => rgba }), RangeError);
});

test('the page is an isolated board-first surface with genuine export controls', () => {
  const html = root('gif-maker.html');
  assert.match(html, /data-caissa-standalone-sidebar/);
  assert.match(html, /data-gif-studio/);
  assert.match(html, /data-gif-create/);
  assert.match(html, /data-gif-download/);
  assert.match(html, /data-gif-panel="export"/);
  assert.match(html, /noindex,nofollow/);
  assert.doesNotMatch(html, /src="https:\/\/www\.chess\.com/);
  assert.ok(EXAMPLE_PGN.includes('Rd8#'));
  assert.equal(MAX_PLIES, 180);
});

import {
  SETUP_PRESETS, createDraft, draftFen, editDraft, moveDraftPiece, pieceAt,
  createPositionGame, commitDraft, appendLegalMove, moveLabel
} from '../js/gif-studio/setup-model.js';

class FakePositionChess {
  constructor(fen) {
    this.current = fen || SETUP_PRESETS.start;
    if (!/^[prnbqkPRNBQK1-8/]+ [wb] (?:-|[KQkq]+) (?:-|[a-h][36]) \d+ \d+$/.test(this.current)) {
      throw new Error('invalid');
    }
  }
  fen() { return this.current; }
  move({ from, to, promotion }) {
    if (from === 'd4' && to === 'd5') {
      this.current = this.current.replace('3P4/4K3', '8/3PK3').replace('8/8/8/3PK3', '8/3P4/8/4K3');
      this.current = '8/8/4k3/3P4/8/4K3/8/8 b - - 0 1';
      return { san: 'd5', from, to };
    }
    if (from === 'd3' && to === 'd4') {
      this.current = '8/8/4k3/8/3P4/4K3/8/8 b - - 0 1';
      return { san: 'd4', from, to };
    }
    throw new Error('Illegal move');
  }
}

test('Setup Position keeps draft separate, supports arbitrary placement and moving existing pieces', () => {
  let draft = createDraft(SETUP_PRESETS.pawn);
  assert.equal(pieceAt(draft, 'd4').type, 'P');
  const unchanged = draftFen(draft);
  draft = moveDraftPiece(draft, 'd4', 'd3');
  assert.equal(pieceAt(draft, 'd4'), null);
  assert.equal(pieceAt(draft, 'd3').type, 'P');
  assert.match(draftFen(draft), /^8\/8\/4k3\/8\/8\/3PK3\/8\/8 w/);
  assert.equal(unchanged, SETUP_PRESETS.pawn);
  draft = editDraft(draft, 'd3', null);
  assert.equal(pieceAt(draft, 'd3'), null);
  draft = editDraft(draft, 'd3', 'wP');
  assert.equal(pieceAt(draft, 'd3').color, 'w');
  assert.throws(() => editDraft(draft, 'a0', 'wQ'), /square/);
  assert.throws(() => editDraft(draft, 'a1', 'evil'), /Unknown piece/);
});

test('FEN import requires valid chess and creates a replayable zero-move line', () => {
  const fen = SETUP_PRESETS.pawn;
  const session = createPositionGame(fen, FakePositionChess, { source: 'fen' });
  assert.equal(session.startFen, fen);
  assert.deepEqual(session.positions, [fen]);
  assert.equal(session.plies, 0);
  assert.throws(() => createPositionGame('invalid', FakePositionChess), /Invalid FEN/);
  assert.throws(() => commitDraft(createDraft('8/8/8/8/8/8/8/8 w - - 0 1'), FakePositionChess), /exactly one/);
});

test('Recording legal moves produces SAN and can branch from an earlier position', () => {
  const original = createPositionGame(SETUP_PRESETS.pawn, FakePositionChess);
  const after = appendLegalMove(original, 0, 'd4', 'd5', 'q', FakePositionChess);
  assert.equal(after.plies, 1);
  assert.equal(after.moves[0].san, 'd5');
  assert.equal(after.positions[0], SETUP_PRESETS.pawn);
  assert.equal(original.plies, 0, 'source game remains untouched');
  assert.equal(moveLabel(after.startFen, 0, 'd5'), '1. d5');
  assert.equal(moveLabel('8/8/8/8/8/8/8/K6k b - - 0 14', 0, 'Kb2'), '14... Kb2');
  assert.throws(() => appendLegalMove(original, 0, 'd4', 'd6', 'q', FakePositionChess), /Illegal move/);
  assert.throws(() => appendLegalMove(original, 9, 'd4', 'd5', 'q', FakePositionChess), /no position/);
  const rewrite = appendLegalMove(after, 0, 'd4', 'd5', 'q', FakePositionChess);
  assert.equal(rewrite.plies, 1);
});

test('GIF workspace has 4 tabs, FEN input, real canvas interaction and persistent FOOT', () => {
  const html = root('gif-maker.html');
  const css = root('css/gif-studio.css');
  const js = root('js/gif-studio/studio-page.js');
  assert.match(html, /data-gif-fen/);
  assert.match(html, /data-gif-load-fen/);
  assert.match(html, /data-gif-tab="setup"/);
  assert.match(html, /data-gif-apply-position/);
  assert.match(html, /data-gif-moves/);
  assert.match(html, /data-gif-drag-piece/);
  assert.match(html, /<footer class="gif-panel-foot">[\s\S]*data-gif-first[\s\S]*data-gif-create/);
  assert.doesNotMatch(html.match(/<section class="gif-board-region"[\s\S]*?<\/section>/)?.[0] || '', /data-gif-first/);
  assert.match(css, /\.gif-panel-body \{[^}]*overflow-y: auto/);
  assert.match(js, /setPointerCapture/);
  assert.match(js, /requestAnimationFrame/);
  assert.match(js, /appendLegalMove/);
});
