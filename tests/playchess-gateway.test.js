import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { load } from 'cheerio';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('Playchess gateway has the credited, accessible public embed', () => {
  const page = load(read('playchess.html'));
  assert.equal(page('link[rel="canonical"]').attr('href'), 'https://www.caissa-chess.org/play-online/playchess');
  assert.equal(page('iframe').attr('src'), 'https://play.chessbase.com/en/Play');
  assert.match(page('iframe').attr('title'), /Playchess guest chess board/i);
  assert.match(page('.playchess-disclosure').text(), /operated by ChessBase GmbH/i);
  assert.match(page('.playchess-fallback').text(), /could not be displayed/i);
  assert.equal(page('a[href="https://play.chessbase.com/en/Play"]').length, 2);
  assert.match(page('.playchess-banner').text(), /Coming Soon/);
  assert.doesNotMatch(page('.playchess-banner').text(), /countdown|register now|join tournament/i);
});

test('Playchess is isolated to its route and appears once in navigation', () => {
  const window = {};
  vm.runInNewContext(read('js/caissa-primary-navigation.js'), { window, document: { querySelectorAll: () => [] } });
  const matches = window.CaissaPrimaryNavigation.inventory.all.filter(item => item.label === 'Playchess Guest');
  assert.equal(matches.length, 1);
  assert.equal(matches[0].route, '/play-online/playchess');
  assert.equal((read('playchess.html').match(/play\.chessbase\.com/g) || []).length > 0, true);
  for (const path of ['play-v2-unavailable.html', 'yahoo-classic.html', 'index.html']) {
    assert.doesNotMatch(read(path), /play\.chessbase\.com/i, `${path} must not load Playchess`);
  }
  const vercel = JSON.parse(read('vercel.json'));
  assert.ok(vercel.rewrites.some(rule => rule.source === '/play-online/playchess' && rule.destination === '/playchess.html'));
  assert.match(read('server.js'), /pathname === '\/play-online\/playchess'/);
});

test('gateway CSS maximizes width without page-level horizontal overflow', () => {
  const css = read('css/playchess.css');
  assert.match(css, /width:\s*min\(100%, 1440px\)/);
  assert.match(css, /overflow-x:\s*hidden/);
  assert.match(css, /\.playchess-embed-shell iframe[\s\S]*width:\s*100%[\s\S]*height:\s*100%/);
  assert.match(css, /@media \(max-width: 800px\)/);
  assert.match(css, /@media \(max-width: 480px\)/);
});
