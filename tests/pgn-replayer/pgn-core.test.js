import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { Chess } from 'chess.js';

const require = createRequire(import.meta.url);
const parser = require('@mliebelt/pgn-parser');

function loadCore() {
  const context = vm.createContext({ TextEncoder, console });
  const source = fs.readFileSync(new URL('../../js/pgn-replayer/pgn-core.js', import.meta.url), 'utf8');
  vm.runInContext(source, context);
  return context.CaissaPgnCore;
}

const core = loadCore();
const parse = text => core.parseCollection(text, { parse: parser.parse, Chess });

const annotated = `[Event "Annotated"]
[Site "CAISSA"]
[Date "2026.08.21"]
[Round "1"]
[White "Alpha"]
[Black "Beta"]
[WhiteElo "2100"]
[BlackElo "2050"]
[Result "1-0"]
[ECO "C20"]

1. e4 $1 {King pawn} e5 (1... c5 $5 {Sicilian} 2. Nf3) 2. Nf3 Nc6 3. Bb5 a6 1-0

[Event "Second"]
[White "Gamma"]
[Black "Delta"]
[Result "*"]

1. d4 d5 2. c4 *`;

test('parses multiple games, legal positions, comments, NAGs, and variations', () => {
  const collection = parse(annotated);
  assert.equal(collection.schemaVersion, 'CaissaPgnCollection@1.0.0');
  assert.equal(collection.games.length, 2);
  assert.equal(collection.warnings.length, 0);
  assert.equal(collection.games[0].headers.Date, '2026.08.21');
  const e4 = collection.games[0].mainline[0];
  const e5 = collection.games[0].mainline[1];
  assert.equal(e4.san, 'e4');
  assert.equal(e4.fenBefore, core.START_FEN);
  assert.match(e4.fenAfter, /4P3/);
  assert.deepEqual(Array.from(e4.comments), ['King pawn']);
  assert.deepEqual(Array.from(e4.nags), ['$1']);
  assert.equal(e5.variations.length, 1);
  assert.equal(e5.variations[0][0].san, 'c5');
  assert.equal(e5.variations[0][0].fenBefore, e5.fenBefore);
  assert.equal(e5.variations[0][1].previousId, e5.variations[0][0].id);
});

test('skips a semantically damaged game while preserving playable games', () => {
  const source = `${annotated}\n\n[Event "Broken"]\n[White "X"]\n[Black "Y"]\n[Result "*"]\n\n1. e4 e5 2. Bh6 *`;
  const collection = parse(source);
  assert.equal(collection.games.length, 2);
  assert.equal(collection.warnings.length, 1);
  assert.equal(collection.warnings[0].game, 3);
  assert.match(collection.warnings[0].message, /Illegal|unsupported/);
});

test('treats active-looking tags and comments as inert strings', () => {
  const source = `[Event "<img src=x onerror=alert(1)>"]
[White "A"]
[Black "B"]
[Result "*"]

1. e4 {<script>alert(1)</script>} *`;
  const collection = parse(source);
  assert.equal(collection.games[0].headers.Event, '<img src=x onerror=alert(1)>');
  assert.equal(collection.games[0].mainline[0].comments[0], '<script>alert(1)</script>');
});

test('rejects empty, oversized, and game-less input with bounded errors', () => {
  assert.throws(() => parse(''), /empty/);
  assert.throws(() => core.parseCollection('x'.repeat(20), { parse: parser.parse, Chess }, { limits: { maxBytes: 8 } }), error => error.code === 'FILE_SIZE');
  assert.throws(() => parse('[Event "Only tags"]'), /PGN syntax|No chess games|playable game/);
});

test('supports a legal custom starting FEN', () => {
  const source = `[Event "FEN"]
[SetUp "1"]
[FEN "8/8/8/8/8/8/4K3/6k1 w - - 0 1"]
[White "A"]
[Black "B"]
[Result "*"]

1. Kf3 *`;
  const collection = parse(source);
  assert.equal(collection.games[0].startFen, '8/8/8/8/8/8/4K3/6k1 w - - 0 1');
  assert.equal(collection.games[0].mainline[0].san, 'Kf3');
});

test('parses the bundled Capablanca album as 597 playable games', { timeout: 20_000 }, () => {
  const source = fs.readFileSync(new URL('../../api/_private/pgn/capablanca-games-1901-1941.pgn', import.meta.url), 'utf8');
  const collection = parse(source);
  assert.equal(collection.games.length, 597);
  assert.equal(collection.warnings.length, 0);
  assert.equal(collection.summary.skippedGames, 0);
});
