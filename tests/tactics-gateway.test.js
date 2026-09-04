import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { load } from 'cheerio';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const source = 'https://livetactics.chessbase.com';
const title = 'Free Chess Tactics and Puzzles | CAISSA Chess';
const description = 'Solve free chess tactics and puzzles online with the ChessBase Tactics trainer, available directly in your browser through CAISSA Chess.';

test('Tactics gateway exposes exact SEO, embed, attribution, and fallback', () => {
  const page = load(read('tactics.html'));
  assert.equal(page('title').text(), title);
  assert.equal(page('meta[name="description"]').attr('content'), description);
  assert.equal(page('meta[property="og:title"]').attr('content'), title);
  assert.equal(page('meta[property="og:description"]').attr('content'), description);
  assert.equal(page('meta[name="twitter:title"]').attr('content'), title);
  assert.equal(page('meta[name="twitter:description"]').attr('content'), description);
  assert.equal(page('link[rel="canonical"]').attr('href'), 'https://www.caissa-chess.org/puzzles/chessbase-tactics');
  assert.equal(page('h1').length, 1);
  assert.equal(page('h1').text(), 'Solve Chess Tactics Online');
  assert.equal(page('iframe').attr('src'), source);
  assert.equal(page('iframe').attr('title'), 'Solve chess tactics with ChessBase');
  assert.equal(page('head iframe').length, 0);
  assert.equal(page('meta[name="keywords"]').length, 0);
  assert.doesNotMatch(page('meta[name="robots"]').attr('content') || '', /noindex/i);
  assert.match(page('.tactics-heading p').text(), /free chess tactics and puzzles online/i);
  assert.doesNotMatch(page('main').text(), /no registration|tactics elo/i);
  assert.match(page('.tactics-disclosure').text(), /operated and provided by ChessBase GmbH/i);
  assert.match(page('.tactics-disclosure').text(), /separate from any future native CAISSA Puzzles Platform/i);
  assert.equal(page(`a[href="${source}"]`).length, 2);
});

test('Tactics is first in Learn & Improve and route ownership is deterministic', () => {
  const window = {};
  vm.runInNewContext(read('js/caissa-primary-navigation.js'), { window, document: { querySelectorAll: () => [] } });
  const navigation = window.CaissaPrimaryNavigation;
  assert.equal(navigation.contractId, 'CaissaGlobalNavigationOrderPolicy@1.13.0');
  assert.deepEqual(Array.from(navigation.inventory.groups[1], item => item.label), ['Tactics', 'Interactive Diagrams', 'Academy', 'Endgame Trainer', 'Endgame Practice', 'Endgame Library']);
  assert.equal(navigation.inventory.all.filter(item => item.id === 'tactics').length, 1);
  assert.equal(navigation.inventory.primary.length, 30);
  const vercel = JSON.parse(read('vercel.json'));
  assert.ok(vercel.rewrites.some(rule => rule.source === '/puzzles/chessbase-tactics' && rule.destination === '/tactics.html'));
  assert.match(read('server.js'), /pathname === '\/puzzles\/chessbase-tactics'/);
  assert.equal((read('public/sitemap.xml').match(/<loc>https:\/\/www\.caissa-chess\.org\/puzzles\/chessbase-tactics<\/loc>/g) || []).length, 1);
});

test('Tactics frame permission and resources remain isolated', () => {
  const page = load(read('tactics.html'));
  const csp = page('meta[http-equiv="Content-Security-Policy"]').attr('content') || '';
  assert.match(csp, /frame-src https:\/\/livetactics\.chessbase\.com;/);
  assert.doesNotMatch(csp, /\*\.chessbase\.com|wss:/);
  for (const path of ['play-v2-unavailable.html', 'playchess.html', 'fritz.html', 'yahoo-classic.html', 'index.html']) {
    assert.doesNotMatch(read(path), /livetactics\.chessbase\.com/i, `${path} must not load Tactics`);
  }
  assert.doesNotMatch(read('tactics.html'), /fics-client|stockfish|chess-engine-worker|https:\/\/tactics\.chessbase\.com/i);
  const globalCsp = JSON.parse(read('vercel.json')).headers[0].headers.find(item => item.key === 'Content-Security-Policy').value;
  assert.match(globalCsp, /frame-src[^;]*https:\/\/livetactics\.chessbase\.com/);
  assert.doesNotMatch(globalCsp, /script-src[^;]*livetactics\.chessbase\.com/);
});

test('Tactics layout maximizes width without page-level overflow', () => {
  const css = read('css/tactics.css');
  assert.match(css, /width:\s*min\(100%, 1440px\)/);
  assert.match(css, /overflow-x:\s*hidden/);
  assert.match(css, /\.tactics-embed-shell iframe[^}]*width:\s*100%[^}]*height:\s*100%/s);
  assert.match(css, /@media \(max-width: 800px\)/);
  assert.match(css, /@media \(max-width: 480px\)/);
});
