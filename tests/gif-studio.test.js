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
