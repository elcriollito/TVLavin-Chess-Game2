import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { load } from 'cheerio';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const bytes = path => fs.readFileSync(new URL(`../${path}`, import.meta.url));
const title = 'Replay Chess Games Online | CAISSA Chess';
const description = 'Replay and study classic chess games online with an interactive board and a curated PGN collection from CAISSA Chess.';
const pgnPath = 'public/data/pgn/free/world-championship.pgn';
const pgnUrl = '/data/pgn/free/world-championship.pgn';

test('Game Replayer parent owns exact SEO, accessible isolation, fallback, and disclosure', () => {
  const page = load(read('game-replayer.html'));
  assert.equal(page('title').text(), title);
  assert.equal(page('meta[name="description"]').attr('content'), description);
  assert.equal(page('link[rel="canonical"]').attr('href'), 'https://www.caissa-chess.org/watch/game-replayer');
  assert.equal(page('meta[property="og:title"]').attr('content'), title);
  assert.equal(page('meta[property="og:description"]').attr('content'), description);
  assert.equal(page('meta[property="og:url"]').attr('content'), 'https://www.caissa-chess.org/watch/game-replayer');
  assert.equal(page('meta[name="twitter:title"]').attr('content'), title);
  assert.equal(page('meta[name="twitter:description"]').attr('content'), description);
  assert.equal(page('meta[name="keywords"]').length, 0);
  assert.doesNotMatch(page('meta[name="robots"]').attr('content') || '', /noindex/i);
  assert.equal(page('h1').length, 1);
  assert.equal(page('h1').text(), 'Replay and Study Chess Games');
  const frame = page('iframe');
  assert.equal(frame.attr('src'), '/integrations/chessbase-pgn-replayer.html');
  assert.equal(frame.attr('title'), 'Chess game replayer for the World Championship collection');
  assert.equal(frame.attr('sandbox'), 'allow-scripts allow-same-origin');
  assert.equal(frame.attr('referrerpolicy'), 'no-referrer');
  assert.match(page('.game-replayer-banner').text(), /CAISSA Weekend Tournament — Coming Soon/);
  assert.match(page('.game-replayer-disclosure').text(), /provided and operated by ChessBase/);
  assert.match(page('.game-replayer-disclosure').text(), /CAISSA Chess supplies the displayed PGN collection and does not operate ChessBase/);
  assert.match(page('.game-replayer-disclosure').text(), /985 factual game scores from World Championship matches/);
  assert.ok(page(`a[href="${pgnUrl}"]`).length >= 2);
});

test('wrapper is minimal, SRI-pinned, sandbox-compatible, and not navigation-visible', () => {
  const wrapper = load(read('integrations/chessbase-pgn-replayer.html'));
  assert.equal(wrapper('.cbreplay').attr('data-url'), pgnUrl);
  assert.equal(wrapper('script[src^="https://pgn.chessbase.com"]').length, 2);
  assert.equal(wrapper('link[href="https://pgn.chessbase.com/CBReplay.css"]').length, 1);
  for (const element of [...wrapper('script[src^="https://"]'), ...wrapper('link[href^="https://pgn.chessbase.com"]')]) {
    assert.match(wrapper(element).attr('integrity') || '', /^sha384-/);
    assert.equal(wrapper(element).attr('crossorigin'), 'anonymous');
  }
  assert.equal(wrapper('script[src*="jquery"]').attr('src'), 'https://pgn.chessbase.com/jquery-3.0.0.min.js');
  assert.equal(wrapper('script[src*="cbreplay.js"]').attr('src'), 'https://pgn.chessbase.com/cbreplay.js');
  assert.equal(wrapper('meta[name="robots"]').attr('content'), 'noindex, nofollow');
  assert.equal(wrapper('iframe').length, 0);
  assert.doesNotMatch(read('js/caissa-primary-navigation.js'), /integrations\/chessbase-pgn-replayer/);
});

test('World Championship collection is exact, safe, and deterministic', () => {
  const pgn = bytes(pgnPath);
  const manifest = JSON.parse(read('public/data/pgn/free/manifest.json'));
  const album = manifest.albums.find(item => item.id === 'smallchess-world-championship');
  assert.equal(album.games, 985);
  assert.equal(album.runtimePath, pgnUrl);
  assert.equal((pgn.toString('utf8').match(/^\[Event /gm) || []).length, 985);
  assert.equal(pgn.includes(Buffer.from('\r')), false);
  assert.doesNotMatch(pgn.toString('utf8'), /<\s*script|javascript:|onerror\s*=|https?:\/\//i);
});

test('navigation, routes, sitemap, CSP, and wrapper exclusion are coherent', () => {
  const window = {};
  vm.runInNewContext(read('js/caissa-primary-navigation.js'), { window, document: { querySelectorAll: () => [] } });
  const navigation = window.CaissaPrimaryNavigation;
  assert.equal(navigation.contractId, 'CaissaGlobalNavigationOrderPolicy@1.13.0');
  assert.equal(navigation.inventory.primary.length + navigation.inventory.connect.length, 34);
  assert.deepEqual(Array.from(navigation.inventory.groups[2], item => item.label), ['Insights', 'Analyze', 'CAISSA PGN Reader', 'Spectator TV', 'Lichess TV', 'Live Blitz', 'Live Tournaments', 'Lichess Broadcasts', 'Game Replayer', 'Arena']);
  assert.equal(navigation.inventory.all.filter(item => item.id === 'game-replayer').length, 1);
  const vercel = JSON.parse(read('vercel.json'));
  assert.ok(vercel.rewrites.some(rule => rule.source === '/watch/game-replayer' && rule.destination === '/game-replayer.html'));
  assert.equal((read('public/sitemap.xml').match(/<loc>https:\/\/www\.caissa-chess\.org\/watch\/game-replayer<\/loc>/g) || []).length, 1);
  const wrapperHeaders = vercel.headers.find(item => item.source === '/integrations/chessbase-pgn-replayer.html').headers;
  const csp = wrapperHeaders.find(item => item.key === 'Content-Security-Policy').value;
  assert.match(csp, /script-src 'self' 'unsafe-eval' https:\/\/pgn\.chessbase\.com;/);
  assert.match(csp, /img-src data: blob: https:\/\/pgn\.chessbase\.com;/);
  assert.doesNotMatch(csp, /\*\.chessbase\.com|worker-src|wss:/);
  const globalCsp = vercel.headers.find(item => item.source === '/(.*)').headers.find(item => item.key === 'Content-Security-Policy').value;
  assert.doesNotMatch(globalCsp, /unsafe-eval/);
});

test('provider runtime stays absent from unrelated application and gateway entrypoints', () => {
  for (const path of ['index.html', 'yahoo-classic.html', 'play-v2-unavailable.html', 'playchess.html', 'fritz.html', 'tactics.html', 'live-blitz.html', 'endgame-trainer.html']) {
    assert.doesNotMatch(read(path), /pgn\.chessbase\.com|cbreplay\.js/i, path);
  }
  assert.doesNotMatch(read('game-replayer.html'), /pgn\.chessbase\.com|jquery-3\.0\.0|cbreplay\.js/i);
});

test('parent and wrapper implement bounded typed ready/error/retry behavior', () => {
  const parent = read('js/game-replayer-parent.js');
  const wrapper = read('js/chessbase-pgn-replayer-wrapper.js');
  assert.match(parent, /CaissaGameReplayerStatus@1\.0\.0/);
  assert.match(parent, /event\.source !== frame\.contentWindow/);
  assert.match(parent, /event\.origin !== window\.location\.origin/);
  assert.match(parent, /15000/);
  assert.match(parent, /attempt=\$\{attempt\}/);
  assert.equal((parent.match(/retry\.addEventListener/g) || []).length, 1);
  assert.match(wrapper, /12000/);
  assert.match(wrapper, /caissa\.gpr\.ready/);
  assert.match(wrapper, /caissa\.gpr\.error/);
  assert.doesNotMatch(parent + wrapper, /innerHTML|document\.write/);
});

test('layout contains parent overflow and uses no transform scaling', () => {
  const css = read('css/game-replayer.css') + read('css/chessbase-pgn-replayer-wrapper.css');
  assert.match(css, /overflow-x:\s*hidden/);
  assert.match(css, /@media \(max-width:480px\)/);
  assert.match(css, /@media \(max-width:340px\)/);
  assert.doesNotMatch(css, /transform:\s*scale/i);
});
