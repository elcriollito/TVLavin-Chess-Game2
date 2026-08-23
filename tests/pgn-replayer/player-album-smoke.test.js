import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { Chess } from '../../assets/vendor/chess.js/chess-1.4.0.esm.js';
import { PGN_PLAYER_OFFERS } from '../../api/_lib/pgn-player-offers.js';

function loadProductionRuntime() {
  const context = vm.createContext({ TextEncoder, console });
  const parserSource = fs.readFileSync(new URL('../../assets/vendor/pgn-parser/pgn-parser-1.4.19.umd.js', import.meta.url), 'utf8');
  const coreSource = fs.readFileSync(new URL('../../js/pgn-replayer/pgn-core.js', import.meta.url), 'utf8');
  vm.runInContext(parserSource, context);
  vm.runInContext(coreSource, context);
  assert.equal(typeof context.PgnParser?.parse, 'function');
  assert.equal(typeof context.CaissaPgnCore?.parseCollection, 'function');
  return { core: context.CaissaPgnCore, parser: context.PgnParser };
}

const runtime = loadProductionRuntime();
const offers = Object.values(PGN_PLAYER_OFFERS);

test('the trusted free-player catalog contains exactly 82 unique local albums', () => {
  assert.equal(offers.length, 82);
  assert.equal(new Set(offers.map(offer => offer.id)).size, 82);
});

for (const offer of offers) {
  test(`opens a legal first game from ${offer.title} (${offer.id})`, { timeout: 5_000 }, () => {
    assert.equal(fs.existsSync(offer.filePath), true, `${offer.title}: archive is not located`);
    const source = fs.readFileSync(offer.filePath, 'utf8');
    assert.match(source, /^\s*\[Event\s+"/m, `${offer.title}: Event header missing`);
    assert.match(source, /^\[White\s+"/m, `${offer.title}: White header missing`);
    assert.match(source, /^\[Black\s+"/m, `${offer.title}: Black header missing`);
    const starts = [...source.matchAll(/^\[Event\s+"/gm)].map(match => match.index);
    let openedGame = null;
    for (let index = 0; index < Math.min(starts.length, 100); index += 1) {
      const sample = source.slice(starts[index], starts[index + 1] ?? source.length);
      try {
        const collection = runtime.core.parseCollection(sample, { parse: runtime.parser.parse, Chess });
        if (collection.games.length > 0 && collection.games[0].mainline.length > 0) {
          openedGame = collection.games[0];
          break;
        }
      } catch (_) {
        // Continue until the archive yields one legal game or the bounded sample is exhausted.
      }
    }
    assert.ok(openedGame, `${offer.title}: no playable game found in the first 100 records`);
    const firstMove = openedGame.mainline[0];
    assert.match(openedGame.label, /\S+\s+—\s+\S+/);
    assert.match(firstMove.san, /\S/);
    assert.match(firstMove.from, /^[a-h][1-8]$/);
    assert.match(firstMove.to, /^[a-h][1-8]$/);
    assert.notEqual(firstMove.fenAfter, firstMove.fenBefore, `${offer.title}: first move did not change the board`);
  });
}
