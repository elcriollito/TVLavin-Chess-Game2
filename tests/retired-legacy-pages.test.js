import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const read = path => fs.readFileSync(new URL(path, root), 'utf8');
const exists = path => fs.existsSync(new URL(path, root));

const retirements = Object.freeze([
  ['/puzzles/chessbase-tactics', '/puzzles'],
  ['/endgame-practice', '/endgame-trainer'],
  ['/watch/game-replayer', '/pgn-replayer'],
  ['/watch/lichess-broadcasts', '/watch/live-tournaments']
]);

test('retired routes permanently redirect to maintained products without rewrite loops', () => {
  const config = JSON.parse(read('vercel.json'));
  for (const [source, destination] of retirements) {
    const redirect = config.redirects.find(rule => rule.source === source);
    assert.deepEqual(redirect, { source, destination, permanent: true });
    assert.equal(config.rewrites.some(rule => rule.source === source), false);
    assert.notEqual(source, destination);
  }
});

test('retired pages leave navigation and sitemap while replacement products remain', () => {
  const window = {};
  vm.runInNewContext(read('js/caissa-primary-navigation.js'), { window, document: { querySelectorAll: () => [] } });
  const ids = Array.from(window.CaissaPrimaryNavigation.inventory.primary, item => item.id);
  for (const id of ['interactive-diagrams', 'tactics', 'endgame-practice', 'game-replayer', 'lichess-broadcasts']) assert.equal(ids.includes(id), false);
  for (const id of ['puzzles', 'endgame-trainer', 'pgn-replayer', 'live-tournaments']) assert.equal(ids.includes(id), true);
  const sitemap = read('public/sitemap.xml');
  assert.doesNotMatch(sitemap, /\/learn\/interactive-diagrams<\/loc>/);
  for (const [source, destination] of retirements) {
    assert.doesNotMatch(sitemap, new RegExp(`${source.replaceAll('/', '\\/')}<\\/loc>`));
    assert.match(sitemap, new RegExp(`${destination.replaceAll('/', '\\/')}<\\/loc>`));
  }
});

test('Interactive Diagrams is unsupported without an alias, redirect, or replacement relationship', () => {
  const config = JSON.parse(read('vercel.json'));
  for (const source of ['/learn/interactive-diagrams', '/learn/interactive-diagrams/']) {
    assert.equal(config.redirects.some(rule => rule.source === source), false, source);
    assert.equal(config.rewrites.some(rule => rule.source === source), false, source);
  }
  assert.doesNotMatch(read('server.js'), /learn\/interactive-diagrams/);
  assert.equal(exists('puzzles.html'), true);
  assert.equal(exists('js/puzzles/page.js'), true);
});

test('page-specific files are removed while reusable Lichess modules and shared PGN data remain', () => {
  for (const path of [
    'interactive-diagrams.html', 'integrations/chessbase-interactive-diagrams.html',
    'css/interactive-diagrams.css', 'css/chessbase-interactive-diagrams-wrapper.css',
    'js/interactive-diagrams-parent.js', 'js/interactive-diagrams-containment.js',
    'js/interactive-diagrams-manifest.js', 'js/interactive-diagrams-position-adapter.js',
    'js/interactive-diagrams-bootstrap.js', 'js/interactive-diagrams-wrapper.js',
    'scripts/build-interactive-diagrams-manifest.mjs',
    'tactics.html', 'css/tactics.css',
    'endgame-practice.html', 'css/endgame-practice.css', 'js/endgame-practice-page.js',
    'game-replayer.html', 'css/game-replayer.css', 'js/game-replayer-parent.js',
    'integrations/chessbase-pgn-replayer.html', 'css/chessbase-pgn-replayer-wrapper.css', 'js/chessbase-pgn-replayer-wrapper.js',
    'lichess-broadcasts.html', 'css/lichess-broadcasts.css'
  ]) assert.equal(exists(path), false, path);
  for (const path of [
    'js/lichess-broadcasts-config.js', 'js/lichess-broadcasts-parent.js',
    'puzzles.html', 'endgame-trainer.html', 'pgn-replayer.html', 'live-tournaments.html',
    'public/data/pgn/free/world-championship.pgn'
  ]) assert.equal(exists(path), true, path);
});
