import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const read = path => fs.readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

function playerTitles() {
  const base = [...read('js/pgn-replayer/pgn-album-catalog.js').matchAll(/"title":"([^"]+)"/g)].map(match => match[1]);
  const mentor = [...read('js/pgn-replayer/pgn-mentor-player-catalog.js').matchAll(/title: "([^"]+)"/g)].map(match => match[1]);
  return [...base, ...mentor, 'José Raúl Capablanca'];
}

function iconography() {
  const context = { window: {} };
  vm.runInNewContext(read('js/pgn-replayer/pgn-player-iconography.js'), context);
  return context.window.CaissaPgnPlayerIconography;
}

test('classifies all 82 player albums by world championship history', () => {
  const titles = playerTitles();
  const unique = new Set(titles);
  const profiles = iconography();
  const counts = titles.reduce((result, title) => {
    const status = profiles.describe(title).status;
    result[status] = (result[status] || 0) + 1;
    return result;
  }, {});

  assert.equal(titles.length, 82);
  assert.equal(unique.size, 82);
  assert.deepEqual(counts, {
    'open-world-champion': 22,
    'womens-world-champion': 8,
    'world-championship-challenger': 16,
    player: 36
  });
});

test('uses king, queen, rook, and knight for representative player histories', () => {
  const profiles = iconography();
  assert.equal(profiles.describe('Ding Liren').iconClass, 'fas fa-chess-king');
  assert.equal(profiles.describe('José Raúl Capablanca').iconClass, 'fas fa-chess-king');
  assert.equal(profiles.describe('Nona Gaprindashvili').iconClass, 'fas fa-chess-queen');
  assert.equal(profiles.describe('David Bronstein').iconClass, 'fas fa-chess-rook');
  assert.equal(profiles.describe('Michael Adams').iconClass, 'fas fa-chess-rook');
  assert.equal(profiles.describe('Vassily Ivanchuk').iconClass, 'fas fa-chess-rook');
  assert.equal(profiles.describe('Efim Geller').iconClass, 'fas fa-chess-knight');
  assert.equal(profiles.describe('Judit Polgar').iconClass, 'fas fa-chess-knight');
});

test('all player card sources consume the shared iconography and Capablanca uses the common subtitle', () => {
  const base = read('js/pgn-replayer/pgn-album-catalog.js');
  const mentor = read('js/pgn-replayer/pgn-mentor-player-catalog.js');
  const runtime = read('js/pgn-replayer/pgn-replayer-page.js');
  const importer = read('scripts/import-pgnmentor-player-collections.py');

  assert.match(base, /iconography\.decorate\(icon, card, album\.title\)/);
  assert.match(mentor, /iconography\.decorate\(icon, card, album\.title\)/);
  assert.match(runtime, /CaissaPgnPlayerIconography\.decorate\(icon, card, album\.title\)/);
  assert.match(importer, /iconography\.decorate\(icon, card, album\.title\)/);
  assert.match(runtime, /details: 'Player game collection · PGN'/);
});
