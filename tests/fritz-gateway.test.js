import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { load } from 'cheerio';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const source = 'https://fritz.chessbase.com';
const description = 'Play chess against the Fritz computer online for free. Choose your level and start directly in your browser with no download required.';

test('Fritz gateway exposes exact SEO, embed, attribution, and fallback', () => {
  const page = load(read('fritz.html'));
  assert.equal(page('title').text(), 'Play Chess Against Computer Free | CAISSA Chess');
  assert.equal(page('meta[name="description"]').attr('content'), description);
  assert.equal(page('meta[property="og:title"]').attr('content'), 'Play Chess Against Computer Free | CAISSA Chess');
  assert.equal(page('meta[property="og:description"]').attr('content'), description);
  assert.equal(page('meta[name="twitter:title"]').attr('content'), 'Play Chess Against Computer Free | CAISSA Chess');
  assert.equal(page('meta[name="twitter:description"]').attr('content'), description);
  assert.equal(page('link[rel="canonical"]').attr('href'), 'https://www.caissa-chess.org/play-online/fritz');
  assert.equal(page('h1').length, 1);
  assert.equal(page('h1').text(), 'Play Chess Against Fritz');
  assert.equal(page('iframe').attr('src'), source);
  assert.equal(page('iframe').attr('title'), 'Play chess against Fritz by ChessBase');
  assert.equal(page('head iframe').length, 0);
  assert.equal(page('meta[name="keywords"]').length, 0);
  assert.doesNotMatch(page('meta[name="robots"]').attr('content') || '', /noindex/i);
  assert.match(page('.fritz-disclosure').text(), /operated and provided by ChessBase GmbH/i);
  assert.match(page('.fritz-disclosure').text(), /does not operate the Fritz engine or ChessBase service/i);
  assert.equal(page(`a[href="${source}"]`).length, 2);
  assert.match(page('.fritz-fallback').text(), /could not be displayed/i);
  assert.match(page('.fritz-banner').text(), /Coming Soon/);
  assert.doesNotMatch(page('.fritz-banner').text(), /countdown|register now|join tournament|participants?|players? registered|\b20\d{2}\b/i);
});

test('Fritz is fifth exactly once and its route owners are deterministic', () => {
  const window = {};
  vm.runInNewContext(read('js/caissa-primary-navigation.js'), { window, document: { querySelectorAll: () => [] } });
  const playGroup = window.CaissaPrimaryNavigation.inventory.groups[0];
  assert.deepEqual(Array.from(playGroup, item => item.label), ['Play', 'CAISSA Classic', 'FICS', 'Playchess', 'Fritz']);
  assert.equal(window.CaissaPrimaryNavigation.inventory.all.filter(item => item.label === 'Fritz').length, 1);
  assert.equal(playGroup[4].route, '/play-online/fritz');
  const vercel = JSON.parse(read('vercel.json'));
  assert.ok(vercel.rewrites.some(rule => rule.source === '/play-online/fritz' && rule.destination === '/fritz.html'));
  assert.match(read('server.js'), /pathname === '\/play-online\/fritz'/);
  assert.equal((read('public/sitemap.xml').match(/<loc>https:\/\/www\.caissa-chess\.org\/play-online\/fritz<\/loc>/g) || []).length, 1);
});

test('Fritz frame permission and resources remain isolated', () => {
  const page = load(read('fritz.html'));
  const metaCsp = page('meta[http-equiv="Content-Security-Policy"]').attr('content') || '';
  assert.match(metaCsp, /frame-src https:\/\/fritz\.chessbase\.com;/);
  assert.doesNotMatch(metaCsp, /\*\.chessbase\.com|wss:/);
  for (const path of ['play-v2-unavailable.html', 'playchess.html', 'yahoo-classic.html', 'index.html']) {
    assert.doesNotMatch(read(path), /fritz\.chessbase\.com/i, `${path} must not load Fritz`);
  }
  assert.doesNotMatch(read('fritz.html'), /fics-client|stockfish|chess-engine-worker/i);
});

test('Fritz layout maximizes width without page-level overflow', () => {
  const css = read('css/fritz.css');
  assert.match(css, /width:\s*min\(100%, 1440px\)/);
  assert.match(css, /overflow-x:\s*hidden/);
  assert.match(css, /\.fritz-embed-shell iframe[^}]*width:\s*100%[^}]*height:\s*100%/s);
  assert.match(css, /@media \(max-width: 800px\)/);
  assert.match(css, /@media \(max-width: 480px\)/);
});
