import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = relative => fs.readFileSync(path.join(ROOT, relative), 'utf8');
const manifest = JSON.parse(read('public/data/pgn/players/manifest.json'));
const largeAlbums = manifest.albums.filter(album => album.games > 2000);

test('all archived player collections above 2,000 games are physically present and complete', () => {
  assert.equal(manifest.collectionCount, 65);
  assert.equal(manifest.runtimeDependencyOnSource, false);
  assert.equal(largeAlbums.length, 22);

  for (const album of largeAlbums) {
    const relative = `public${album.localPath}`;
    const absolute = path.join(ROOT, relative);
    assert.equal(fs.existsSync(absolute), true, `${album.title}: local PGN missing`);
    assert.equal(fs.statSync(absolute).size, album.bytes, `${album.title}: byte count mismatch`);
    const source = fs.readFileSync(absolute, 'utf8');
    const detectedGames = (source.match(/^\[Event\s+"/gm) || []).length;
    assert.equal(detectedGames, album.games, `${album.title}: game count mismatch`);
  }
});

test('PGN runtime capacity covers the largest archived player collection', () => {
  const largest = largeAlbums.reduce((current, album) => album.games > current.games ? album : current);
  assert.equal(largest.title, 'Magnus Carlsen');
  assert.equal(largest.games, 5097);

  const core = read('js/pgn-replayer/pgn-core.js');
  assert.match(core, /maxGames:\s*6000/);
  assert.match(core, /maxNodes:\s*750000/);
});

test('large-collection parser fixes are cache-busted through the page and Worker chain', () => {
  const page = read('pgn-replayer.html');
  const worker = read('js/pgn-replayer/pgn-worker.js');
  assert.match(page, /pgn-replayer-page\.js\?v=1\.1\.1/);
  assert.match(worker, /pgn-core\.js\?v=1\.1\.1/);
});
