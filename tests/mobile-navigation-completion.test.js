import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { load } from 'cheerio';

const root = path.resolve(import.meta.dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

function loadHeaderContract(pathname = '/analyze', width = Infinity) {
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
    location: { pathname },
    matchMedia: query => ({ matches: width <= Number(query.match(/(\d+)px/)[1]), addEventListener() {} }),
    addEventListener() {}
  };
  context.globalThis = context;
  vm.runInNewContext(read('js/mobile2-destination-header.js'), context);
  return context.CaissaMobile2DestinationHeader;
}

test('shared Mobile 2.0 header owns exactly the three completed top-level routes', () => {
  const contract = loadHeaderContract();
  const expected = [
    ['/analyze', 'analyze', 'Analyze'],
    ['/opening-database', 'opening-explorer', 'Opening Explorer'],
    ['/watch/lichess-tv', 'watch-games', 'Watch Games']
  ];
  for (const [route, id, title] of expected) {
    assert.equal(contract.owns(route), true, route);
    assert.deepEqual(
      { id: contract.routes[route].id, title: contract.routes[route].title,
        backHref: contract.routes[route].backHref, backLabel: contract.routes[route].backLabel },
      { id, title, backHref: '/', backLabel: 'CAISSA Mobile Home' }
    );
  }
  assert.equal(contract.owns('/scanner'), false);
  assert.equal(contract.owns('/settings'), false);
  assert.equal(contract.contractId, 'CaissaMobile2DestinationHeader@1.2.0');
});

test('Analyze reuses the existing SPA header host and shared assets', () => {
  const $ = load(read('index.html'));
  assert.equal($('.header-minimal[data-caissa-mobile2-header-host]').length, 1);
  assert.equal($('script[src*="mobile2-destination-header.js?v=1.2.0"]').length, 1);
  assert.equal($('link[href*="mobile2-destination-header.css?v=1.2.0"]').length, 1);
  assert.match(read('css/mobile2-destination-header.css'), /data-caissa-mobile2-destination="analyze"/);
});

test('Opening Explorer and Watch Games mount one shared host before their approved content', () => {
  for (const [file, host, firstContent] of [
    ['opening-database.html', '.openingdb-mobile2-header', '.openingdb-page'],
    ['lichess-tv.html', '.lichess-tv-mobile2-header', '.lichess-tv-main']
  ]) {
    const $ = load(read(file));
    const version = file === 'lichess-tv.html' ? '1.2.1' : '1.2.0';
    assert.equal($(`${host}[data-caissa-mobile2-header-host]`).length, 1, file);
    assert.equal($(`script[src*="mobile2-destination-header.js?v=${version}"]`).length, 1, file);
    assert.equal($(`link[href*="mobile2-destination-header.css?v=${version}"]`).length, 1, file);
    assert.ok($(host).index() < $(firstContent).index(), file);
    assert.equal($('.caissa-standalone-mobile-toggle').length, 0, file);
  }
});

test('mobile-only host styles preserve desktop presentation and safe areas', () => {
  const shared = read('css/mobile2-destination-header.css');
  const opening = read('css/opening-database.css');
  const watch = read('css/lichess-tv.css');
  assert.match(shared, /min-height:\s*calc\(44px \+ env\(safe-area-inset-top/);
  assert.match(opening, /\.openingdb-mobile2-header\s*\{\s*display:\s*none/);
  assert.match(watch, /\.lichess-tv-mobile2-header\s*\{\s*display:\s*none/);
  assert.match(opening, /@media \(max-width: 768px\)[\s\S]*\.openingdb-mobile2-header\s*\{[\s\S]*display:\s*block/);
  assert.match(watch, /@media \(max-width: 800px\)[\s\S]*\.lichess-tv-mobile2-header\s*\{\s*display:\s*block/);
});

test('navigation isolation follows each destination breakpoint', () => {
  const destinations = [
    ['/opening-database', 768],
    ['/watch/lichess-tv', 800],
    ['/play-online/playchess', 800],
    ['/play/games', 768],
    ['/play/bots', 768],
    ['/play/coach', 768],
    ['/analyze', 768]
  ];
  for (const width of [390, 430, 640, 641, 768, 769, 800, 801, 1440]) {
    for (const [route, maxWidth] of destinations) {
      assert.equal(loadHeaderContract(route, width).isMobileNavigationIsolated(), width <= maxWidth, `${route} at ${width}px`);
    }
  }
});
