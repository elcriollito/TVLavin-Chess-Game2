import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const bootstrap = read('js/caissa-vercel-analytics.js');
const ANALYTICS_REFERENCE = /\/js\/caissa-vercel-analytics\.js(?:\?[^"']*)?/g;

const publicEntrypoints = [
  'index.html', 'yahoo-classic.html', 'about.html', 'help.html', 'blog/index.html',
  'blog/what-is-a-polyglot-opening-book/index.html',
  'blog/who-is-caissa-goddess-of-chess/index.html',
  'blog/yahoo-chess-spirit-caissa-classic/index.html',
  'eco.html', 'database.html', 'opening-database.html', 'polyglot.html', 'vault.html',
  'premium.html', 'roadmap.html', 'signin.html', 'signup.html', 'library.html',
  'endgame-library.html', 'endgame-trainer.html', 'endgame-practice.html',
  'play-v2-public-beta.html'
];

const blockedEntrypoints = [
  'DEBUG_BOARD.html', 'DIAGNOSTIC.html', 'LAUNCH_CHESS_GAME.html', 'TEST_ENGINE.html',
  'endgame-board-harness.html', 'endgame-engine-harness.html',
  'endgame-trainer-integration-harness.html', 'play-v2.html', 'play-v2-invite.html',
  'play-v2-promotion-qa.html', 'play-v2-ipad-analyze-diagnostic.html',
  'play-v2-unavailable.html', 'test-hash.html', 'test-pgn-load.html'
];

function environment({ hostname = 'www.caissa-chess.org', protocol = 'https:' } = {}) {
  const scripts = [];
  const existingById = new Map();
  const history = { pushState() {}, replaceState() {} };
  let workers = 0;
  let sockets = 0;
  const document = {
    head: { appendChild: element => { scripts.push(element); existingById.set(element.id, element); } },
    createElement: tag => ({ tagName: tag.toUpperCase() }),
    getElementById: id => existingById.get(id) || null,
    querySelector: selector => selector.includes('/_vercel/insights/script.js')
      ? scripts.find(script => script.src === '/_vercel/insights/script.js') || null
      : null
  };
  const window = {
    location: { hostname, protocol, origin: `${protocol}//${hostname}` },
    history,
    Worker: function Worker() { workers += 1; },
    WebSocket: function WebSocket() { sockets += 1; }
  };
  const originalPushState = history.pushState;
  const originalReplaceState = history.replaceState;
  vm.runInNewContext(bootstrap, { window, document, URL, Set, Object });
  return {
    window, scripts,
    workerCount: () => workers,
    socketCount: () => sockets,
    originalPushState, originalReplaceState
  };
}

test('official same-origin bootstrap initializes once on exact production hosts', () => {
  for (const hostname of ['www.caissa-chess.org', 'caissa-chess.org']) {
    const result = environment({ hostname });
    assert.equal(result.scripts.length, 1);
    assert.equal(result.scripts[0].src, '/_vercel/insights/script.js');
    assert.equal(result.scripts[0].defer, true);
    assert.equal(result.window.CaissaVercelAnalytics.initialize(), false);
    assert.equal(result.scripts.length, 1);
    assert.equal(result.window.vaq.length, 1);
    assert.equal(result.window.vaq[0][0], 'beforeSend');
  }
});

test('non-production hosts and insecure origins emit no telemetry bootstrap', () => {
  for (const hostname of ['localhost', '127.0.0.1', 'preview.vercel.app', 'caissa-chess.org.example.com']) {
    const result = environment({ hostname });
    assert.equal(result.scripts.length, 0, hostname);
    assert.equal(result.window.va, undefined, hostname);
  }
  assert.equal(environment({ protocol: 'http:' }).scripts.length, 0);
});

test('privacy sanitizer sends pathname only', () => {
  const { window } = environment();
  const sanitize = window.CaissaVercelAnalytics.sanitizeEvent;
  const cases = [
    ['/analyze', '/analyze'],
    ['/analyze?fen=%3Cmasked%3E', '/analyze'],
    ['/analyze?pgn=%3Cmasked%3E', '/analyze'],
    ['/analyze?handoff=%3Cmasked%3E', '/analyze'],
    ['/signin?redirect_url=%3Cmasked%3E', '/signin'],
    ['/play?debug=1&simplified=1&mode=bots#debug', '/play'],
    ['/endgame-library?activity=lesson&unit=sample&reviewFrom=play&previewEntry=practice', '/endgame-library']
  ];
  for (const [input, expected] of cases) {
    const result = sanitize({ type: 'pageview', url: `https://www.caissa-chess.org${input}` });
    assert.equal(result.url, `https://www.caissa-chess.org${expected}`, input);
  }
});

test('private endgame and credential-bearing callbacks are blocked', () => {
  const sanitize = environment().window.CaissaVercelAnalytics.sanitizeEvent;
  for (const suffix of [
    '?objectiveArtifact=%3Cmasked%3E', '?privateEndgameRun=%3Cmasked%3E', '?endgameRun=%3Cmasked%3E',
    '?access_token=%3Cmasked%3E', '?refresh_token=%3Cmasked%3E', '?token=%3Cmasked%3E',
    '?session_id=%3Cmasked%3E', '?code=%3Cmasked%3E', '?api_key=%3Cmasked%3E',
    '?password=%3Cmasked%3E', '?verification=%3Cmasked%3E', '?callback=%3Cmasked%3E'
  ]) assert.equal(sanitize({ type: 'pageview', url: `https://www.caissa-chess.org/analyze${suffix}` }), null, suffix);
  assert.equal(sanitize({ type: 'pageview', url: 'https://www.caissa-chess.org/auth/callback' }), null);
});

test('analytics bootstrap is passive and does not own navigation', () => {
  const result = environment();
  assert.equal(result.workerCount(), 0);
  assert.equal(result.socketCount(), 0);
  assert.equal(result.window.history.pushState, result.originalPushState);
  assert.equal(result.window.history.replaceState, result.originalReplaceState);
  assert.doesNotMatch(bootstrap, /Stockfish|fics|new\s+Worker|new\s+WebSocket|clock-service|game-lifecycle/i);
});

test('every public entrypoint has exactly one Vercel bootstrap and blocked documents have zero', () => {
  for (const path of publicEntrypoints) {
    assert.equal((read(path).match(ANALYTICS_REFERENCE) || []).length, 1, path);
  }
  for (const path of blockedEntrypoints) {
    assert.equal((read(path).match(ANALYTICS_REFERENCE) || []).length, 0, path);
  }
  assert.match(read('scripts/build-blog.mjs'), /caissa-vercel-analytics\.js/);
  assert.match(read('scripts/build-play-v2.mjs'), /publicBetaHtml[\s\S]+caissa-vercel-analytics\.js/);
});

test('Clarity is retired from production documents and active CSP', () => {
  for (const path of publicEntrypoints) assert.doesNotMatch(read(path), /caissa-clarity\.js|clarity\.ms/i, path);
  assert.doesNotMatch(read('vercel.json'), /clarity\.ms/i);
  assert.doesNotMatch(read('scripts/build-blog.mjs'), /caissa-clarity\.js/i);
  assert.match(read('js/caissa-clarity.js'), /clarity\.ms/);
});

test('public disclosure documents the pathname-only contract without obsolete consent UI', () => {
  const about = read('about.html');
  assert.match(about, /Vercel Web Analytics/);
  assert.match(about, /query parameters and URL fragments are removed before transmission/);
  assert.doesNotMatch(about, /Microsoft Clarity|data-caissa-analytics-consent/);
});

test('CSP remains same-origin compatible without Clarity allowances', () => {
  const config = JSON.parse(read('vercel.json'));
  const globalCsp = config.headers.find(rule => rule.source === '/(.*)').headers.find(header => header.key === 'Content-Security-Policy').value;
  const playCsp = config.headers.find(rule => rule.source === '/play').headers.find(header => header.key === 'Content-Security-Policy').value;
  assert.match(globalCsp, /script-src 'self'/);
  assert.match(globalCsp, /connect-src 'self'/);
  assert.doesNotMatch(globalCsp, /clarity\.ms/);
  assert.match(playCsp, /script-src 'self';/);
  assert.match(playCsp, /connect-src 'self';/);
  assert.match(playCsp, /worker-src 'self';/);
});
