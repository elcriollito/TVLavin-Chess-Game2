import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { load } from 'cheerio';
import { LICHESS_TV_FRAME_URL, LICHESS_TV_OFFICIAL_URL, LICHESS_TV_SANDBOX, LICHESS_TV_LOADED_COPY, isApprovedLichessTvFrameUrl } from '../js/lichess-tv-parent.js';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const frameUrl = 'https://lichess.org/tv/frame?theme=brown&bg=dark';
const description = 'Watch the Top Rated live chess game selected by Lichess through an independent gateway on CAISSA Chess.';

function navigation() {
  const window = {};
  vm.runInNewContext(read('js/caissa-primary-navigation.js'), { window, document: { querySelectorAll: () => [] } });
  return window.CaissaPrimaryNavigation;
}

test('public page freezes truthful metadata, copy, accessibility, and analytics ownership', () => {
  const html = read('lichess-tv.html');
  const page = load(html);
  assert.equal(page('title').text(), 'Watch Lichess TV Live | CAISSA Chess');
  assert.equal(page('meta[name="description"]').attr('content'), description);
  assert.equal(page('link[rel="canonical"]').attr('href'), 'https://www.caissa-chess.org/watch/lichess-tv');
  assert.equal(page('meta[property="og:url"]').attr('content'), 'https://www.caissa-chess.org/watch/lichess-tv');
  assert.equal(page('meta[property="og:title"]').attr('content'), 'Watch Lichess TV Live | CAISSA Chess');
  assert.equal(page('meta[property="og:description"]').attr('content'), description);
  assert.equal(page('meta[name="twitter:title"]').attr('content'), 'Watch Lichess TV Live | CAISSA Chess');
  assert.equal(page('meta[name="twitter:description"]').attr('content'), description);
  assert.equal(page('meta[name="keywords"]').length, 0);
  assert.doesNotMatch(page('meta[name="robots"]').attr('content') || '', /noindex/i);
  assert.equal(page('main').length, 1);
  assert.equal(page('h1').length, 1);
  assert.equal(page('h1').text(), 'Watch High-Rated Chess Live');
  assert.equal(page('[data-caissa-standalone-sidebar][data-active="lichess-tv"]').length, 1);
  assert.equal(page('[data-lichess-tv-status][role="status"][aria-live="polite"]').length, 1);
  assert.equal(page('[data-lichess-tv-error][role="alert"]').length, 1);
  assert.equal(page('[data-lichess-tv-retry]').text(), 'Retry Lichess TV frame');
  assert.equal(page(`a[href="${LICHESS_TV_OFFICIAL_URL}"]`).length >= 2, true);
  assert.match(page('.lichess-tv-disclosure').text(), /operated by Lichess/);
  assert.match(page('.lichess-tv-disclosure').text(), /independent gateway/);
  assert.match(page('.lichess-tv-disclosure').text(), /does not select or operate/);
  assert.match(page('.lichess-tv-disclosure').text(), /loaded viewer does not allow CAISSA Chess to verify/);
  assert.match(page('.lichess-tv-broadcast-boundary').text(), /LBC-0\.1/);
  assert.equal(page('script[src^="/js/caissa-vercel-analytics.js"]').length, 1);
  assert.equal(page('script[src^="https://"]').length, 0);
  assert.equal(page('iframe').length, 0, 'the controller owns iframe creation');
  assert.doesNotMatch(html, /postMessage|WebSocket|EventSource|setInterval|channel selector/i);
});

test('controller accepts only the exact Top Rated frame and owns conservative states', () => {
  assert.equal(LICHESS_TV_FRAME_URL, frameUrl);
  assert.equal(LICHESS_TV_SANDBOX, 'allow-scripts allow-same-origin');
  assert.match(LICHESS_TV_LOADED_COPY, /viewer loaded/i);
  assert.match(LICHESS_TV_LOADED_COPY, /availability is controlled by Lichess/i);
  assert.equal(isApprovedLichessTvFrameUrl(frameUrl), true);
  for (const candidate of [
    'http://lichess.org/tv/frame?theme=brown&bg=dark',
    'https://www.lichess.org/tv/frame?theme=brown&bg=dark',
    'https://lichess.org:444/tv/frame?theme=brown&bg=dark',
    'https://user:pass@lichess.org/tv/frame?theme=brown&bg=dark',
    'https://lichess.org/tv/frame?bg=dark&theme=brown',
    'https://lichess.org/tv/frame?theme=brown&bg=dark&channel=rapid',
    'https://lichess.org/tv/rapid/frame?theme=brown&bg=dark',
    'https://lichess.org/tv/frame?theme=brown&bg=dark#x',
    '//lichess.org/tv/frame?theme=brown&bg=dark',
    'https%3A//lichess.org/tv/frame?theme=brown&bg=dark'
  ]) assert.equal(isApprovedLichessTvFrameUrl(candidate), false, candidate);
  const source = read('js/lichess-tv-parent.js');
  assert.match(source, /next\.title = 'Lichess TV Top Rated live chess game'/);
  assert.match(source, /next\.referrerPolicy = 'no-referrer'/);
  assert.match(source, /next\.loading = 'eager'/);
  assert.match(source, /replaceChildren\(next\)/);
  assert.match(source, /\{ once: true \}/);
  assert.match(source, /clearTimeout\(timer\)/);
  assert.doesNotMatch(source, /allow-forms|allow-popups|allow-top-navigation|allowfullscreen|clipboard|autoplay|camera|microphone|geolocation|postMessage|fetch\(|WebSocket|EventSource|setInterval/);
});

test('navigation, route, sitemap, inventory, and CSP expose exactly one bounded gateway', () => {
  const api = navigation();
  assert.equal(api.contractId, 'CaissaGlobalNavigationOrderPolicy@1.11.0');
  assert.deepEqual(Array.from(api.inventory.groups[2], item => item.label), [
    'Insights', 'Analyze', 'Spectator TV', 'Lichess TV', 'Live Blitz', 'Live Tournaments', 'Lichess Broadcasts', 'Game Replayer', 'Arena'
  ]);
  const matches = api.inventory.all.filter(item => item.id === 'lichess-tv');
  assert.equal(matches.length, 1);
  assert.equal(matches[0].route, '/watch/lichess-tv');
  const vercel = JSON.parse(read('vercel.json'));
  assert.ok(vercel.rewrites.some(rule => rule.source === '/watch/lichess-tv' && rule.destination === '/lichess-tv.html'));
  assert.match(read('server.js'), /pathname === '\/watch\/lichess-tv'/);
  assert.equal((read('public/sitemap.xml').match(/<loc>https:\/\/www\.caissa-chess\.org\/watch\/lichess-tv<\/loc>/g) || []).length, 1);
  const inventory = JSON.parse(read('config/caissa-public-route-inventory.json'));
  assert.equal(inventory.primaryNavigation.filter(item => item.id === 'lichess-tv').length, 1);
  const pageCsp = load(read('lichess-tv.html'))('meta[http-equiv="Content-Security-Policy"]').attr('content');
  assert.match(pageCsp, /frame-src https:\/\/lichess\.org;/);
  assert.doesNotMatch(pageCsp, /(?:script-src|connect-src|worker-src|style-src|img-src)[^;]*lichess\.org/);
  const globalCsp = vercel.headers.find(rule => rule.source === '/(.*)').headers.find(header => header.key === 'Content-Security-Policy').value;
  assert.match(globalCsp, /frame-src[^;]*https:\/\/lichess\.org/);
  assert.doesNotMatch(globalCsp, /(?:script-src|worker-src|style-src|img-src)[^;]*lichess\.org/);
  assert.equal((globalCsp.match(/https:\/\/lichess\.org/g) || []).length, 2, 'one inherited connect-src occurrence and one new frame-src occurrence');
  assert.doesNotMatch(globalCsp, /\*\.lichess\.org/);
});

test('Lichess TV runtime remains isolated from every unrelated public surface', () => {
  const isolated = [
    'index.html', 'play-v2-unavailable.html', 'yahoo-classic.html', 'endgame-trainer.html',
    'playchess.html', 'fritz.html', 'tactics.html', 'live-blitz.html', 'live-tournaments.html',
    'game-replayer.html', 'interactive-diagrams.html'
  ];
  for (const path of isolated) {
    assert.doesNotMatch(read(path), /lichess\.org\/tv\/frame|lichess-tv-parent|data-lichess-tv-frame/i, path);
  }
  const pageAndRuntime = read('lichess-tv.html') + read('js/lichess-tv-parent.js');
  assert.doesNotMatch(pageAndRuntime, /chessbase|fics-client|stockfish|chess-engine-worker|broadcast\/embed/i);
  const scannerTest = read('tests/supply-chain-script-tags.test.js');
  assert.match(scannerTest, /iframe/);
});

test('responsive shell is aspect-ratio and viewport-height bounded without transforms', () => {
  const css = read('css/lichess-tv.css');
  assert.match(css, /\.lichess-tv-shell\s*\{[^}]*width:\s*min\([^;]*100%[^;]*dvh[^;]*\)[^}]*aspect-ratio:\s*10\s*\/\s*11/s);
  assert.match(css, /\.lichess-tv-shell \[data-lichess-tv-frame-mount\], \.lichess-tv-shell iframe[^}]*width:\s*100%[^}]*height:\s*100%/s);
  assert.match(css, /overflow-x:\s*hidden/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.doesNotMatch(css, /transform\s*:\s*scale/);
});
