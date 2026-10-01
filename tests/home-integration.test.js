import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { load } from 'cheerio';
import middleware from '../middleware.js';

const root = path.resolve(import.meta.dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

function loadNavigation() {
  const window = {};
  const document = { querySelectorAll: () => [] };
  vm.runInNewContext(read('js/caissa-primary-navigation.js'), { window, document });
  return window.CaissaPrimaryNavigation;
}

function loadHomeContract() {
  const context = {};
  context.globalThis = context;
  vm.runInNewContext(read('js/home/home.js'), context);
  return context.CaissaHomeContract;
}

test('root is a non-redirecting Home rewrite in Vercel and the local server', () => {
  const vercel = JSON.parse(read('vercel.json'));
  assert.equal(vercel.redirects.some(rule => rule.source === '/'), false);
  assert.deepEqual(vercel.rewrites.find(rule => rule.source === '/'), {
    source: '/',
    destination: '/home.html'
  });
  const rootHeaders = vercel.headers.find(rule => rule.source === '/')?.headers || [];
  assert.match(rootHeaders.find(header => header.key === 'Cache-Control')?.value || '', /no-store/);

  const server = read('server.js');
  assert.match(server, /filePath = '\.\/home\.html'/);
  assert.doesNotMatch(server, /pathname === '\/'[\s\S]{0,150}Location: '\/play'/);
});
test('middleware yields root requests to Home while retaining legacy root aliases', async () => {
  assert.equal(middleware(new Request('https://www.caissa-chess.org/')), undefined);
  assert.equal(middleware(new Request('https://www.caissa-chess.org/?utm_source=release')), undefined);

  const classic = middleware(new Request('https://www.caissa-chess.org/?section=yahooClassic'));
  assert.equal(classic.status, 308);
  assert.equal(new URL(classic.headers.get('location')).pathname, '/yahoo-classic');

  const help = middleware(new Request('https://www.caissa-chess.org/?action=help'));
  assert.equal(help.status, 308);
  assert.equal(new URL(help.headers.get('location')).pathname, '/help');
});

test('Home owns canonical metadata and preserves the approved product boundaries', () => {
  const $ = load(read('home.html'));
  assert.equal($('link[rel="canonical"]').attr('href'), 'https://www.caissa-chess.org/');
  assert.equal($('meta[name="robots"]').attr('content'), 'index, follow');
  assert.equal($('#all-tools-groups').length, 1);
  assert.equal($('#chat-title').text(), 'CAISSA Chat');
  assert.equal($('.chat-panel').text().includes('Coming next'), true);
  assert.equal($('script[src*="mentor"]').length, 0);
  assert.equal($('a[href*="/mentor"]').length, 0);
  assert.equal($('a[href="/yahoo-classic"].desktop-only').length, 1);
  assert.equal($('[data-tool]').toArray().every(node => ($(node).attr('href') || '').startsWith('/')), true);
  assert.equal($('a[href^="https://www.caissa-chess.org"]').length, 0);
});

test('All tools is sourced from the existing primary navigation contract', () => {
  const navigation = loadNavigation();
  const internal = navigation.inventory.primary.filter(item => item.route.startsWith('/'));
  const vercel = JSON.parse(read('vercel.json'));
  const owned = new Set(vercel.rewrites.map(rule => rule.source));
  const shellRoutes = new Set(['/fics', '/analyze', '/spectator-tv', '/arena', '/cheater-insight', '/history', '/dos-chess', '/academy']);

  assert.equal(internal.length, 26);
  for (const item of internal) {
    assert.ok(owned.has(item.route) || shellRoutes.has(item.route) || item.route === '/play', `${item.label} has no route owner`);
  }
  assert.match(read('js/home/home.js'), /CaissaPrimaryNavigation/);
  assert.match(read('js/home/home.js'), /inventory\?\.groups/);
});

test('Home auth and progress presentation distinguishes loading, guest, connected, empty and error', () => {
  const contract = loadHomeContract();
  assert.equal(contract.classifyAuth(null), 'loading');
  assert.equal(contract.classifyAuth({ isLoaded: true, status: 'signed-out' }), 'guest');
  assert.equal(contract.classifyAuth({ isLoaded: true, status: 'unavailable' }), 'error');
  assert.equal(contract.classifyAuth({ isLoaded: true, status: 'authenticated', isSignedIn: true, userId: 'user_1' }), 'signed-in');

  assert.deepEqual(
    { ...contract.normalizePuzzleProgress({ progress: { rating: 1800, solved: 0, failed: 0 } }) },
    { state: 'empty', solved: 0, failed: 0, attempts: 0 }
  );
  assert.deepEqual(
    { ...contract.normalizePuzzleProgress({ progress: { rating: 1824.4, solved: 3, failed: 1 } }) },
    { state: 'ready', rating: 1824, solved: 3, failed: 1, attempts: 4 }
  );
  assert.equal(contract.normalizePuzzleProgress({ progress: { rating: 1800, solved: -1, failed: 0 } }).state, 'error');

  const source = read('js/home/home.js');
  assert.match(source, /import\('\/js\/puzzles\/account-progress-api\.js'\)/);
  assert.match(source, /caissa\.home\.recent-tools\.v1/);
  assert.doesNotMatch(source, /recent games|continue position|streak|accuracy/i);
});

test('tool-shell brand provides a Home return path without replacing tool menus', () => {
  const navigationSource = read('js/caissa-primary-navigation.js');
  const standaloneSource = read('js/caissa-standalone-sidebar.js');
  assert.match(navigationSource, /brand\.setAttribute\('href', '\/'\)/);
  assert.match(navigationSource, /shell\.returnHome/);
  assert.match(standaloneSource, /<a href="\/" class="nav-logo"/);
  assert.equal(loadNavigation().inventory.primary[0].route, '/play');
});

