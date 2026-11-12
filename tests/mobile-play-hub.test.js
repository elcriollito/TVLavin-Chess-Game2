import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { load } from 'cheerio';

const root = path.resolve(import.meta.dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

test('Play Hub publishes exactly the four approved destinations in order', () => {
  const $ = load(read('play-hub.html'));
  const cards = $('[data-play-hub-destination]');
  assert.deepEqual(cards.toArray().map(card => ({
    id: $(card).attr('data-play-hub-destination'),
    route: $(card).attr('href'),
    title: $(card).find('strong').text()
  })), [
    { id: 'play', route: '/play/games', title: 'Play' },
    { id: 'online', route: '/online', title: 'CAISSA Online' },
    { id: 'playchess', route: '/play-online/playchess', title: 'Playchess' },
    { id: 'fics', route: '/fics', title: 'FICS' }
  ]);
  assert.equal(cards.length, 4);
  assert.equal($('h1').text(), 'Choose how you want to play');
  assert.equal($('[data-caissa-mobile2-header-host]').length, 1);
  assert.equal($('#mobileNavToggle, #mainNav, .caissa-standalone-mobile-toggle').length, 0);
});

test('Mobile 2.0 route contract assigns Home and Play Hub parents explicitly', () => {
  const document = {
    documentElement: { dataset: {} },
    readyState: 'loading',
    addEventListener() {},
    querySelectorAll() { return []; },
    getElementById() { return null; },
    querySelector() { return null; }
  };
  const context = {
    document,
    location: { pathname: '/play-hub' },
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    addEventListener() {}
  };
  context.globalThis = context;
  vm.runInNewContext(read('js/mobile2-destination-header.js'), context);
  const routes = context.CaissaMobile2DestinationHeader.routes;

  assert.equal(routes['/play-hub'].backHref, '/');
  for (const route of ['/play/games', '/online', '/play-online/playchess', '/fics']) {
    assert.equal(routes[route].backHref, '/play-hub', route);
  }
  for (const route of ['/puzzles', '/play/bots', '/play/coach']) {
    assert.equal(routes[route].backHref, '/', route);
  }
});

test('all Play Hub routes are locally owned without changing desktop Home navigation', () => {
  const server = read('server.js');
  const vercel = JSON.parse(read('vercel.json'));
  const home = load(read('home.html'));

  assert.match(server, /pathname === '\/play-hub'/);
  assert.ok(vercel.rewrites.some(rule => rule.source === '/play-hub' && rule.destination === '/play-hub.html'));
  assert.equal(home('[data-mobile-destination="play"]').attr('href'), '/play-hub');
  assert.equal(home('.sidebar a[href="/play"]').length, 1);
});

test('Online, Playchess and FICS use the shared isolated mobile header', () => {
  const pages = ['online.html', 'playchess.html', 'index.html'];
  for (const page of pages) {
    const $ = load(read(page));
    assert.equal($('[data-caissa-mobile2-header-host]').length, 1, page);
    assert.equal($('script[src*="mobile2-destination-header.js"]').length, 1, page);
    assert.equal($('link[href*="mobile2-destination-header.css"]').length, 1, page);
  }
  assert.match(read('css/online.css'), /\.online-menu-shell\{display:none!important\}/);
  assert.match(read('css/playchess.css'), /\.playchess-mobile-disclosure/);
  assert.match(read('css/mobile2-destination-header.css'), /data-caissa-mobile2-destination="fics"/);
});
