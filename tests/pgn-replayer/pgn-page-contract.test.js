import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { load } from 'cheerio';

const read = path => fs.readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('owns a distinct canonical route and keeps the classic free replayer intact', () => {
  const page = load(read('pgn-replayer.html'));
  assert.equal(page('title').text(), 'Open and Replay PGN Files | CAISSA Chess');
  assert.equal(page('link[rel="canonical"]').attr('href'), 'https://www.caissa-chess.org/pgn-replayer');
  assert.equal(page('[data-caissa-standalone-sidebar][data-active="pgn-replayer"]').length, 1);
  assert.equal(page('link[href^="/styles.css"]').length, 1);
  assert.equal(page('link[href^="/styles.css"]').index() < page('link[href^="/css/caissa-standalone-sidebar.css"]').index(), true);
  assert.equal(page('h1').text(), 'PGN Replayer');
  assert.equal(page('iframe').length, 0);
  assert.doesNotMatch(read('pgn-replayer.html'), /pgn\.chessbase\.com|Credits:|checkout/i);
  assert.match(read('game-replayer.html'), /capablanca-games-1901-1941\.pgn/);
  const vercel = JSON.parse(read('vercel.json'));
  assert.ok(vercel.rewrites.some(rule => rule.source === '/pgn-replayer' && rule.destination === '/pgn-replayer.html'));
  assert.ok(vercel.rewrites.some(rule => rule.source === '/watch/game-replayer' && rule.destination === '/game-replayer.html'));
  assert.match(read('server.js'), /pathname === '\/pgn-replayer'/);
  assert.equal((read('public/sitemap.xml').match(/\/pgn-replayer<\/loc>/g) || []).length, 1);
});

test('uses Games, Notation, Albums order and a board-first accessible shell', () => {
  const page = load(read('pgn-replayer.html'));
  assert.deepEqual(page('[data-pgn-tab]').map((_, node) => page(node).text().replace(/\s+/g, ' ').trim().replace(/\s*\(\)$/, '')).get(), ['Games', 'Notation', 'Albums']);
  for (const key of ['first', 'previous', 'play', 'next', 'last', 'flip', 'focus', 'engine']) {
    const control = page(`[data-pgn-${key}]`);
    assert.equal(control.length, 1, `${key} control missing`);
    assert.ok(control.attr('aria-label'), `${key} accessible name missing`);
  }
  assert.equal(page('[data-pgn-open]').length, 2);
  assert.equal(page('[data-pgn-paste]').length, 2);
  assert.equal(page('.pgn-toolbar-imports-mobile [data-pgn-open]').length, 1);
  assert.equal(page('.pgn-toolbar-imports-mobile [data-pgn-paste]').length, 1);
  assert.match(page('meta[http-equiv="Content-Security-Policy"]').attr('content'), /worker-src 'self'/);
  assert.doesNotMatch(page('meta[http-equiv="Content-Security-Policy"]').attr('content'), /unsafe-eval|unsafe-inline/);
  assert.doesNotMatch(page('meta[http-equiv="Content-Security-Policy"]').attr('content'), /frame-ancestors/);
  const vercel = JSON.parse(read('vercel.json'));
  assert.ok(vercel.headers.some(rule => rule.headers?.some(header => header.key === 'Content-Security-Policy' && /frame-ancestors 'self'/.test(header.value))));
});

test('replaces redundant Change PGN with a lazy local engine that defaults off', () => {
  const page = load(read('pgn-replayer.html'));
  const runtime = read('js/pgn-replayer/pgn-replayer-page.js');
  const engine = read('js/pgn-replayer/pgn-engine.js');
  assert.equal(page('[data-pgn-open-secondary]').length, 0);
  assert.doesNotMatch(page('.pgn-toolbar').text(), /Change PGN/i);
  assert.equal(page('[data-pgn-engine]').attr('aria-pressed'), 'false');
  assert.equal(page('[data-pgn-engine-state]').text(), 'Off');
  assert.equal(page('#pgn-engine-title').text(), 'Stockfish analysis');
  assert.equal(page('#pgn-engine-mobile-title').text(), 'Stockfish analysis');
  assert.equal(page('[data-pgn-engine-panel]').length, 2);
  assert.equal(page('[data-pgn-engine-panel][data-state="off"]').length, 2);
  assert.equal(page('script[src*="pgn-replayer-page.js"]').attr('type'), 'module');
  assert.match(runtime, /new PgnAnalysisEngine/);
  assert.doesNotMatch(runtime, /caissa_pgn_engine|localStorage.*engine/i);
  assert.match(engine, /DEFAULT_WORKER_URL = '\/assets\/vendor\/stockfish\/18\.0\.0\/stockfish-18-lite-single\.js'/);
  assert.match(engine, /setoption name MultiPV value 2/);
  assert.doesNotMatch(engine, /setoption name Threads/);
  assert.match(engine, /workerUrl\.origin !== baseUrl\.origin/);
  const vercel = JSON.parse(read('vercel.json'));
  const workerHeaders = vercel.headers.find(rule => rule.source === '/assets/vendor/stockfish/18.0.0/:path*')?.headers || [];
  const workerCsp = workerHeaders.find(header => header.key === 'Content-Security-Policy')?.value || '';
  assert.match(workerCsp, /script-src 'self' 'wasm-unsafe-eval'/);
  assert.doesNotMatch(workerCsp, /script-src[^;]*'unsafe-eval'/);
  assert.equal(page('#pgn-panel-notation > .pgn-notation-scroll').length, 1);
  assert.equal(page('#pgn-panel-notation > .pgn-engine-panel--desktop').length, 1);
  assert.equal(page('.pgn-board-column > .pgn-toolbar + .pgn-engine-panel--mobile').length, 1);
  assert.match(read('css/pgn-replayer.css'), /\.pgn-engine-panel \{[^}]*height: 123px;[^}]*flex: 0 0 123px/);
});

test('pins the local single-threaded Stockfish 18 browser distribution', () => {
  const digest = path => createHash('sha256').update(fs.readFileSync(new URL(`../../${path}`, import.meta.url))).digest('hex');
  assert.equal(digest('assets/vendor/stockfish/18.0.0/stockfish-18-lite-single.js'), '2278005057f381491f1c9bb3e44c9f5920b3a00bef9759e33cc6582769a1f1fe');
  assert.equal(digest('assets/vendor/stockfish/18.0.0/stockfish-18-lite-single.wasm'), 'a8fbc05ec6920b56d7485826dcb02c5ffd2826bcbf751cf973046f237a9096f1');
  assert.match(read('assets/vendor/stockfish/18.0.0/Copying.txt'), /GNU GENERAL PUBLIC LICENSE[\s\S]*Version 3/);
  assert.match(read('engine/STOCKFISH-NOTICE.md'), /Stockfish\.js 18 lite single-threaded/);
});

test('keeps game information above notation and reserves safe album access states', () => {
  const page = load(read('pgn-replayer.html'));
  assert.equal(page('#pgn-panel-notation [data-pgn-game-info]').length, 1);
  assert.equal(page('#pgn-panel-notation [data-pgn-game-info]').index() < page('#pgn-panel-notation [data-pgn-notation]').index(), true);
  assert.equal(page('#pgn-panel-albums [data-pgn-albums]').length, 1);
  assert.deepEqual(page('.pgn-album-status-key [data-access]').map((_, node) => page(node).text()).get(), ['Free', '1 credit', 'Owned']);
  const runtime = read('js/pgn-replayer/pgn-replayer-page.js');
  assert.match(runtime, /album\.access === 'owned'/);
  assert.match(runtime, /album\.access === 'available'/);
  assert.doesNotMatch(runtime, /debit|checkout|purchase|reserve.*credit/i);
});

test('publishes the authorized Capablanca collection as a free same-origin album', () => {
  const runtime = read('js/pgn-replayer/pgn-replayer-page.js');
  const provenance = JSON.parse(read('public/data/pgn/capablanca-games-1901-1941.provenance.json'));
  assert.match(runtime, /id: 'capablanca-games-1901-1941'/);
  assert.match(runtime, /title: 'José Raúl Capablanca'/);
  assert.match(runtime, /games: 597/);
  assert.match(runtime, /access: 'free'/);
  assert.match(runtime, /source: '\/data\/pgn\/capablanca-games-1901-1941\.pgn'/);
  assert.match(runtime, /details: 'Player game collection · PGN'/);
  assert.equal(provenance.gameCount, 597);
  assert.match(provenance.publicUseAuthorization, /repository owner supplied and authorized/i);
  assert.equal(provenance.validationSummary.legalGames, 597);
  assert.equal(provenance.validationSummary.parserErrors, 0);
});

test('welcome guidance is compact and remembered without storing PGN content', () => {
  const page = read('js/pgn-replayer/pgn-replayer-page.js');
  const styles = read('css/pgn-replayer.css');
  assert.match(page, /caissa_pgn_welcome_seen/);
  assert.match(page, /elements\.empty\.hidden = hasSeenWelcome/);
  assert.match(styles, /\.pgn-empty-board \{[^}]*width: min\(420px, calc\(100% - 32px\)\)/);
});

test('navigation publishes the new tool once without replacing the classic route', () => {
  const window = {};
  vm.runInNewContext(read('js/caissa-primary-navigation.js'), { window, document: { querySelectorAll: () => [] } });
  const inventory = window.CaissaPrimaryNavigation.inventory;
  assert.equal(inventory.primary.filter(item => item.id === 'pgn-replayer').length, 1);
  assert.equal(inventory.primary.find(item => item.id === 'pgn-replayer').route, '/pgn-replayer');
  assert.equal(Array.from(inventory.groups[2], item => item.id).includes('pgn-replayer'), true);
  assert.equal(Array.from(inventory.groups[3], item => item.id).includes('pgn-replayer'), false);
  assert.equal(inventory.primary.filter(item => item.id === 'game-replayer').length, 1);
  assert.equal(inventory.primary.find(item => item.id === 'game-replayer').route, '/watch/game-replayer');
});

test('private PGN content never enters analytics, logs, or browser persistence', () => {
  const page = read('js/pgn-replayer/pgn-replayer-page.js');
  const worker = read('js/pgn-replayer/pgn-worker.js');
  assert.doesNotMatch(page + worker, /analytics|track\s*\(|XMLHttpRequest|WebSocket|console\./i);
  assert.equal((page.match(/fetch\s*\(/g) || []).length, 1);
  assert.match(page, /credentials: 'same-origin'/);
  assert.doesNotMatch(page, /localStorage\.setItem\([^,]+,\s*(?:text|file|collection|game|source)/i);
  assert.match(page, /caissa_pgn_orientation/);
  assert.match(page, /caissa_pgn_speed/);
  assert.match(page, /try\s*\{[\s\S]*window\.localStorage\?\.getItem/);
  assert.match(page, /try\s*\{[\s\S]*window\.localStorage\?\.setItem/);
  assert.doesNotMatch(page, /innerHTML|insertAdjacentHTML|document\.write/);
});

test('focus view targets the sidebar class rendered by the shared shell', () => {
  const sidebar = read('js/caissa-standalone-sidebar.js');
  const styles = read('css/pgn-replayer.css');
  assert.match(sidebar, /classList\.add\('caissa-standalone-sidebar-host'\)/);
  assert.match(styles, /body\.pgn-focus-mode \.caissa-standalone-sidebar-host/);
  assert.doesNotMatch(styles, /caissa-standalone-sidebar-shell/);
});

test('board geometry keeps all eight ranks and files at every responsive size', () => {
  const styles = read('css/pgn-replayer.css');
  const board = read('js/pgn-replayer/pgn-board.js');
  assert.match(styles, /\.pgn-chessboard \.board-b72b1 \{[^}]*display: flex;[^}]*height: 100%/);
  assert.match(styles, /\.pgn-chessboard \.row-5277c \{[^}]*display: flex;[^}]*flex: 1 1 12\.5%/);
  assert.match(styles, /\.pgn-chessboard \.square-55d63 \{[^}]*width: 12\.5% !important;[^}]*height: 100% !important/);
  assert.match(styles, /\.pgn-chessboard \.piece-417db \{[^}]*width: 100% !important;[^}]*height: 100% !important/);
  assert.match(styles, /body\.pgn-replayer-page > \.piece-417db \{[^}]*display: none !important/);
  assert.match(board, /this\.widget\.position\(fen \|\| 'start', false\)/);
  assert.match(board, /querySelectorAll\('body\.pgn-replayer-page > \.piece-417db'\)/);
});

test('mobile controls stay in two compact rows without viewport-scrolling notation', () => {
  const page = load(read('pgn-replayer.html'));
  const runtime = read('js/pgn-replayer/pgn-replayer-page.js');
  const styles = read('css/pgn-replayer.css');
  const firstRow = page('.pgn-toolbar-imports-mobile button, .pgn-toolbar-playback button')
    .map((_, node) => page(node).attr('data-pgn-open') !== undefined ? 'open'
      : page(node).attr('data-pgn-paste') !== undefined ? 'paste'
        : Object.keys(node.attribs).find(key => key.startsWith('data-pgn-'))?.replace('data-pgn-', ''))
    .get();

  assert.deepEqual(firstRow, ['open', 'paste', 'first', 'previous', 'play', 'next', 'last']);
  assert.equal(page('.pgn-toolbar-source [data-pgn-engine]').length, 1);
  assert.equal(page('.pgn-toolbar-view [data-pgn-speed]').length, 1);
  assert.equal(page('.pgn-toolbar-view [data-pgn-flip]').length, 1);
  assert.equal(page('.pgn-toolbar-view [data-pgn-focus] .pgn-control-label').text(), 'Zoom');
  assert.equal(page('.pgn-board-column > .pgn-toolbar + .pgn-engine-panel--mobile').length, 1);
  assert.equal(page('.pgn-board-column + .pgn-panel').length, 1);
  assert.match(styles, /grid-template-columns: repeat\(7, minmax\(0, 1fr\)\)/);
  assert.match(styles, /\.pgn-engine-panel--desktop \{ display: none; \}/);
  assert.match(styles, /\.pgn-engine-panel--mobile \{ display: block;[^}]*width: min\(100%, 760px\)/);
  assert.match(runtime, /enginePanels: root\.querySelectorAll/);
  assert.match(runtime, /engineLineGroups: root\.querySelectorAll/);
  assert.match(runtime, /function keepActiveMoveVisible\(selected\)/);
  assert.doesNotMatch(runtime, /scrollIntoView/);
});

test('vendored parser is pinned, licensed, and isolated to the Worker', () => {
  assert.match(read('package.json'), /"@mliebelt\/pgn-parser": "1\.4\.19"/);
  assert.match(read('assets/vendor/pgn-parser/LICENSE'), /Apache License/);
  assert.match(read('js/pgn-replayer/pgn-worker.js'), /pgn-parser-1\.4\.19\.umd\.js/);
  assert.match(read('js/pgn-replayer/pgn-worker.js'), /chess-1\.4\.0\.esm\.js/);
  assert.match(read('js/pgn-replayer/pgn-replayer-page.js'), /type: 'module'/);
  assert.doesNotMatch(read('pgn-replayer.html'), /pgn-parser-1\.4\.19/);
});
