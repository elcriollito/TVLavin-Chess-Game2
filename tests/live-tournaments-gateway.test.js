import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { load } from 'cheerio';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const frameSource = 'https://live.chessbase.com/frame/Esports-World-Cup-Chess-Playoff-2026';

test('Live Tournaments exposes exact event, SEO, fallback, and attribution', () => {
  const page = load(read('live-tournaments.html'));
  assert.equal(page('title').text(), 'Watch Live Chess Tournaments | CAISSA Chess');
  assert.equal(page('meta[name="description"]').attr('content'), 'Watch a featured live chess tournament through the official ChessBase broadcast viewer, available from CAISSA Chess.');
  assert.equal(page('link[rel="canonical"]').attr('href'), 'https://www.caissa-chess.org/watch/live-tournaments');
  assert.equal(page('h1').length, 1);
  assert.equal(page('h1').text(), 'Watch a Featured Live Chess Tournament');
  assert.equal(page('iframe').length, 1);
  assert.equal(page('iframe').attr('src'), frameSource);
  assert.match(page('iframe').attr('title'), /Esports World Cup Chess Playoff/);
  assert.equal(page('head iframe').length, 0);
  assert.equal(page('meta[name="keywords"]').length, 0);
  assert.doesNotMatch(page('meta[name="robots"]').attr('content') || '', /noindex/i);
  assert.match(page('.live-tournaments-disclosure').text(), /provided and operated by ChessBase/);
  assert.match(page('.live-tournaments-disclosure').text(), /does not operate the tournament, pairings, players, boards, clocks, moves, results, or broadcast data/);
  assert.equal(page('[data-live-tournaments-error][role="alert"]').length, 1);
  assert.equal(page('[data-live-tournaments-retry]').length, 1);
});

test('event framing is exact and provider runtime remains cross-origin', () => {
  const page = load(read('live-tournaments.html'));
  const csp = page('meta[http-equiv="Content-Security-Policy"]').attr('content') || '';
  assert.match(csp, /frame-src https:\/\/live\.chessbase\.com;/);
  assert.doesNotMatch(csp, /\*\.chessbase\.com|wss:|connect-src[^;]*chessbase/i);
  assert.equal(page('script[src*="chessbase"], script[src*="jquery"], script[src*="CBReplay"]').length, 0);
  const source = read('live-tournaments.html') + read('js/live-tournaments-parent.js');
  assert.doesNotMatch(source, /class=["']cblive|data-event|data-date|WebSocket|EventSource|fetch\(|XMLHttpRequest|setInterval/i);
  assert.doesNotMatch(source, /URLSearchParams|location\.search|postMessage/i);
  const globalCsp = JSON.parse(read('vercel.json')).headers[0].headers.find(item => item.key === 'Content-Security-Policy').value;
  assert.match(globalCsp, /frame-src[^;]*https:\/\/live\.chessbase\.com/);
  assert.doesNotMatch(globalCsp, /script-src[^;]*live\.chessbase\.com|connect-src[^;]*live\.chessbase\.com/);
});

test('route, sitemap, and canonical navigation own one destination', () => {
  const window = {};
  vm.runInNewContext(read('js/caissa-primary-navigation.js'), { window, document: { querySelectorAll: () => [] } });
  const navigation = window.CaissaPrimaryNavigation;
  assert.equal(navigation.contractId, 'CaissaGlobalNavigationOrderPolicy@1.7.0');
  assert.deepEqual(Array.from(navigation.inventory.groups[2], item => item.label), ['Insights', 'Analyze', 'Spectator TV', 'Live Blitz', 'Live Tournaments', 'Game Replayer', 'Arena']);
  assert.equal(navigation.inventory.all.filter(item => item.id === 'live-tournaments').length, 1);
  const vercel = JSON.parse(read('vercel.json'));
  assert.ok(vercel.rewrites.some(rule => rule.source === '/watch/live-tournaments' && rule.destination === '/live-tournaments.html'));
  assert.match(read('server.js'), /pathname === '\/watch\/live-tournaments'/);
  assert.equal((read('public/sitemap.xml').match(/<loc>https:\/\/www\.caissa-chess\.org\/watch\/live-tournaments<\/loc>/g) || []).length, 1);
});

test('responsive frame is native-sized without transform scaling', () => {
  const css = read('css/live-tournaments.css');
  assert.match(css, /width:\s*min\(100%,900px\)/);
  assert.match(css, /height:\s*650px/);
  assert.match(css, /@media \(max-width:800px\)/);
  assert.match(css, /@media \(max-width:480px\)/);
  assert.doesNotMatch(css, /transform:\s*scale/i);
});
