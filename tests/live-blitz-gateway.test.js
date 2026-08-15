import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { load } from 'cheerio';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const source = 'https://liveblitz.chessbase.com';
const title = 'Watch Live Blitz Chess Online | CAISSA Chess';
const description = 'Watch a featured live blitz chess game from the Playchess community. Follow the board, clocks, and moves online through CAISSA Chess.';

test('Live Blitz gateway exposes exact SEO, embed, attribution, and fallback', () => {
  const page = load(read('live-blitz.html'));
  assert.equal(page('title').text(), title);
  assert.equal(page('meta[name="description"]').attr('content'), description);
  assert.equal(page('meta[property="og:title"]').attr('content'), title);
  assert.equal(page('meta[property="og:description"]').attr('content'), description);
  assert.equal(page('meta[name="twitter:title"]').attr('content'), title);
  assert.equal(page('meta[name="twitter:description"]').attr('content'), description);
  assert.equal(page('link[rel="canonical"]').attr('href'), 'https://www.caissa-chess.org/watch/live-blitz');
  assert.equal(page('h1').length, 1);
  assert.equal(page('h1').text(), 'Watch Live Blitz Chess');
  assert.equal(page('iframe').attr('src'), source);
  assert.equal(page('iframe').attr('title'), 'Watch live blitz chess from Playchess');
  assert.equal(page('head iframe').length, 0);
  assert.equal(page('meta[name="keywords"]').length, 0);
  assert.doesNotMatch(page('meta[name="robots"]').attr('content') || '', /noindex/i);
  assert.match(page('.live-blitz-heading p').text(), /when a live board is available/i);
  assert.match(page('.live-blitz-banner').text(), /CAISSA Weekend Tournament — Coming Soon/);
  assert.doesNotMatch(page('.live-blitz-banner').text(), /\b\d{1,2}:\d{2}\b|countdown|participants?\s*:/i);
  assert.match(page('.live-blitz-disclosure').text(), /operated and provided through the ChessBase Playchess network/i);
  assert.match(page('.live-blitz-disclosure').text(), /does not operate the featured game, players, clocks, or broadcast/i);
  assert.match(page('.live-blitz-disclosure').text(), /not a CAISSA tournament broadcast/i);
  assert.equal(page(`a[href="${source}"]`).length, 2);
});

test('Live Blitz is fourth in Analyze & Watch and route ownership is deterministic', () => {
  const window = {};
  vm.runInNewContext(read('js/caissa-primary-navigation.js'), { window, document: { querySelectorAll: () => [] } });
  const navigation = window.CaissaPrimaryNavigation;
  assert.equal(navigation.contractId, 'CaissaGlobalNavigationOrderPolicy@1.7.0');
  assert.deepEqual(Array.from(navigation.inventory.groups[2], item => item.label), ['Insights', 'Analyze', 'Spectator TV', 'Live Blitz', 'Live Tournaments', 'Game Replayer', 'Arena']);
  assert.equal(navigation.inventory.all.filter(item => item.id === 'live-blitz').length, 1);
  assert.equal(navigation.inventory.primary.length, 26);
  const vercel = JSON.parse(read('vercel.json'));
  assert.ok(vercel.rewrites.some(rule => rule.source === '/watch/live-blitz' && rule.destination === '/live-blitz.html'));
  assert.match(read('server.js'), /pathname === '\/watch\/live-blitz'/);
  assert.equal((read('public/sitemap.xml').match(/<loc>https:\/\/www\.caissa-chess\.org\/watch\/live-blitz<\/loc>/g) || []).length, 1);
});

test('Live Blitz frame permission and resources remain isolated', () => {
  const page = load(read('live-blitz.html'));
  const csp = page('meta[http-equiv="Content-Security-Policy"]').attr('content') || '';
  assert.match(csp, /frame-src https:\/\/liveblitz\.chessbase\.com;/);
  assert.doesNotMatch(csp, /\*\.chessbase\.com|wss:/);
  for (const path of ['play-v2-unavailable.html', 'playchess.html', 'fritz.html', 'tactics.html', 'yahoo-classic.html', 'index.html']) {
    assert.doesNotMatch(read(path), /liveblitz\.chessbase\.com/i, `${path} must not load Live Blitz`);
  }
  assert.doesNotMatch(read('live-blitz.html'), /fics-client|stockfish|chess-engine-worker|spectatorSocket/i);
  const globalCsp = JSON.parse(read('vercel.json')).headers[0].headers.find(item => item.key === 'Content-Security-Policy').value;
  assert.match(globalCsp, /frame-src[^;]*https:\/\/liveblitz\.chessbase\.com/);
  assert.doesNotMatch(globalCsp, /script-src[^;]*liveblitz\.chessbase\.com/);
  assert.doesNotMatch(globalCsp, /\*\.chessbase\.com/);
});

test('Live Blitz layout stays centered and responsive without transform scaling', () => {
  const css = read('css/live-blitz.css');
  assert.match(css, /width:\s*min\(100%, 720px\)/);
  assert.match(css, /overflow-x:\s*hidden/);
  assert.match(css, /\.live-blitz-embed-shell iframe[^}]*width:\s*100%[^}]*height:\s*100%/s);
  assert.match(css, /@media \(max-width: 800px\)/);
  assert.match(css, /@media \(max-width: 480px\)/);
  assert.doesNotMatch(css, /transform:\s*scale/i);
});
