import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';
import { Chess } from 'chess.js';
import { PGN_PLAYER_OFFERS } from '../../api/_lib/pgn-player-offers.js';

const require = createRequire(import.meta.url);
const parser = require('@mliebelt/pgn-parser');

function loadCore() {
  const context = vm.createContext({ TextEncoder, console });
  const source = fs.readFileSync(new URL('../../js/pgn-replayer/pgn-core.js', import.meta.url), 'utf8');
  vm.runInContext(source, context);
  return context.CaissaPgnCore;
}

test('all 82 free player albums contain a game the CAISSA runtime can replay', { timeout: 20_000 }, () => {
  const core = loadCore();
  const offers = Object.values(PGN_PLAYER_OFFERS);
  assert.equal(offers.length, 82);

  for (const offer of offers) {
    const source = fs.readFileSync(offer.filePath, 'utf8');
    const starts = [...source.matchAll(/^\[Event\s+"/gm)].map(match => match.index);
    let playable = false;
    for (let index = 0; index < Math.min(starts.length, 100); index += 1) {
      const sample = source.slice(starts[index], starts[index + 1] ?? source.length);
      try {
        if (core.parseCollection(sample, { parse: parser.parse, Chess }).games.length > 0) {
          playable = true;
          break;
        }
      } catch (_) {
        // Continue until the archive yields one legal game or the bounded sample is exhausted.
      }
    }
    assert.equal(playable, true, `${offer.title}: no playable game found in the first 100 records`);
  }
});
