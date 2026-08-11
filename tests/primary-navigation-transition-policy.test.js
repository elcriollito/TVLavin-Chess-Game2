import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('CaissaPrimaryNavigationTransitionPolicy@1.0.0 is generation-based and timer-free', () => {
  const source = read('js/caissa-primary-navigation-transition-policy.js');
  assert.match(source, /CaissaPrimaryNavigationTransitionPolicy@1\.0\.0/);
  assert.match(source, /generation \+= 1/);
  assert.match(source, /data-caissa-navigation-pending/);
  assert.match(source, /data-caissa-surface/);
  assert.match(source, /Loading \$\{destination\}/);
  assert.match(source, /role', 'status'/);
  assert.match(source, /aria-live', 'polite'/);
  assert.match(source, /function fail/);
  assert.match(source, /Return to Play/);
  assert.doesNotMatch(source, /setTimeout|setInterval|location\.reload/);
});

test('canonical navigation inventory contains no root section-query destinations', () => {
  const source = read('js/caissa-primary-navigation.js');
  for (const route of ['/insights', '/analyze', '/arena', '/cheater-insight', '/game-library', '/history', '/dos-chess']) {
    assert.match(source, new RegExp(`route: '${route.replace('/', '\\/')}'`));
  }
  assert.doesNotMatch(source, /route: '\/\?section=(?:insights|analyze|arena|cheater-insight|library|history|dosChess)'/);
});

test('server and Vercel route every canonical legacy surface to its existing shell', () => {
  const server = read('server.js');
  const config = JSON.parse(read('vercel.json'));
  for (const route of ['/insights', '/fics', '/analyze', '/spectator-tv', '/arena', '/cheater-insight', '/game-library', '/history', '/dos-chess']) {
    assert.match(server, new RegExp(route.replace('/', '\\/')));
    assert.ok(config.rewrites.some(rule => rule.source === route && rule.destination === '/index.html'), route);
  }
});
