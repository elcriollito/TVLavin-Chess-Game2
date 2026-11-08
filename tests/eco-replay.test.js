import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { Chess } from 'chess.js';

const read = (relativePath) => readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');
const json = (relativePath) => JSON.parse(read(relativePath));
const context = { window: null };
context.window = context;
context.globalThis = context;
vm.runInNewContext(read('js/eco-replay.js'), context, { filename: 'js/eco-replay.js' });
const replayApi = context.CaissaEcoReplay;

test('E45-E57 build immutable legal snapshots and end at the pinned final FEN', () => {
  const openings = json('data/openings.json');
  const details = json('data/eco/eco_details.json');

  for (let suffix = 45; suffix <= 57; suffix += 1) {
    const code = `E${suffix}`;
    const defining = openings
      .filter((row) => row.eco === code && Array.isArray(row.moves))
      .sort((a, b) => a.moves.length - b.moves.length)[0];
    const detail = details.find((row) => row.code === code);
    const result = replayApi.createReplay(Chess, defining?.moves, { canonicalFinalFen: detail?.fen });

    assert.equal(result.available, true, `${code}: ${result.reason}`);
    assert.equal(result.frames.length, defining.moves.length + 1);
    assert.equal(result.frames[0].fen, replayApi.STANDARD_START_FEN);
    assert.equal(result.frames.at(-1).fen, detail.fen);
    assert.equal(result.finalFen, detail.fen);
    assert.equal(Object.isFrozen(result), true);
    assert.equal(Object.isFrozen(result.frames), true);
    assert.ok(result.frames.every(Object.isFrozen));
  }
});

test('representative A/B/C/D/E families replay from the start and default to their final frame', () => {
  const openings = json('data/openings.json');
  const details = json('data/eco/eco_details.json');

  for (const code of ['A00', 'B20', 'C60', 'D37', 'E45']) {
    const defining = openings
      .filter((row) => row.eco === code && Array.isArray(row.moves))
      .sort((a, b) => a.moves.length - b.moves.length)[0];
    const detail = details.find((row) => row.code === code);
    const result = replayApi.createReplay(Chess, defining?.moves, { canonicalFinalFen: detail?.fen });

    assert.equal(result.available, true, `${code}: ${result.reason}`);
    assert.equal(result.frames.at(-1).ply, result.totalPlies);
    assert.equal(result.frames.at(-1).fen, result.finalFen);
  }
});

test('snapshot navigation preserves exact positions for captures, castling, en passant, and promotion', () => {
  const scenarios = [
    ['capture', ['e4', 'd5', 'exd5']],
    ['castling', ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'O-O']],
    ['en passant', ['e4', 'a6', 'e5', 'd5', 'exd6']]
  ];

  for (const [name, moves] of scenarios) {
    const result = replayApi.createReplay(Chess, moves);
    assert.equal(result.available, true, `${name}: ${result.reason}`);
    const beforeLast = result.frames.at(-2).fen;
    const last = result.frames.at(-1).fen;
    assert.notEqual(last, beforeLast);
    assert.equal(result.frames.at(-2).fen, beforeLast, `${name} previous frame must remain immutable`);
  }

  const promotion = replayApi.createReplay(Chess, ['a8=Q+'], {
    startFen: '7k/P7/8/8/8/8/8/4K3 w - - 0 1'
  });
  assert.equal(promotion.available, true, promotion.reason);
  assert.match(promotion.finalFen, /^Q6k\//);
});

test('invalid sequences and mismatched stored positions fail closed without partial frames', () => {
  const illegal = replayApi.createReplay(Chess, ['e4', 'e5', 'Ke2', 'Nc6', 'Ke8']);
  assert.equal(illegal.available, false);
  assert.match(illegal.reason, /Illegal or unverifiable move at ply 5/);
  assert.deepEqual(Array.from(illegal.frames), []);

  const mismatch = replayApi.createReplay(Chess, ['e4'], {
    canonicalFinalFen: replayApi.STANDARD_START_FEN
  });
  assert.equal(mismatch.available, false);
  assert.match(mismatch.reason, /does not match/);
  assert.deepEqual(Array.from(mismatch.frames), []);
});

test('frame labels are human-readable and expose the current ply', () => {
  const result = replayApi.createReplay(Chess, ['d4', 'Nf6']);
  assert.equal(replayApi.formatFrame(result.frames[0], result.totalPlies), 'Starting position — Ply 0 of 2');
  assert.equal(replayApi.formatFrame(result.frames[1], result.totalPlies), '1. d4 — Ply 1 of 2');
  assert.equal(replayApi.formatFrame(result.frames[2], result.totalPlies), '1... Nf6 — Ply 2 of 2');
});

test('ECO shell loads replay validation before page logic and exposes accessible controls', () => {
  const html = read('eco.html');
  assert.doesNotMatch(html, /Coming soon/);
  assert.match(html, /id="ecoReplayStatus"[^>]*role="status"[^>]*aria-live="polite"/);
  assert.match(html, /data-action="start"[^>]*aria-label="Go to first position"/);
  assert.match(html, /data-action="prev"[^>]*aria-label="Go to previous move"/);
  assert.match(html, /data-action="next"[^>]*aria-label="Go to next move"/);
  assert.match(html, /data-action="end"[^>]*aria-label="Go to last position"/);
  assert.ok(html.indexOf('/js/eco-replay.js') < html.indexOf('/js/eco-page.js'));

  const runtime = read('js/eco-page.js');
  for (const action of ['start', 'prev', 'next', 'end', 'flip']) {
    assert.match(runtime, new RegExp(`action === '${action}'`));
  }
  assert.match(runtime, /loadContinuationsAndStats\(finalFen/);
});
