import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { load } from 'cheerio';

const root = path.resolve(import.meta.dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

function loadContract() {
  const context = {};
  context.globalThis = context;
  vm.runInNewContext(read('js/home/mobile-home.js'), context);
  return context.CaissaMobileHome;
}

test('mobile Home exposes the nine approved destinations in product order', () => {
  const $ = load(read('home.html'));
  const cards = $('[data-mobile-home] [data-mobile-destination]');
  assert.deepEqual(cards.toArray().map(card => $(card).attr('data-mobile-destination')), [
    'play', 'puzzles', 'bots', 'coach', 'analyze', 'scanner', 'opening-explorer', 'watch-games', 'settings'
  ]);
  assert.equal(cards.length, 9);
  assert.equal($('[data-mobile-destination="play"]').attr('href'), '/play/games');
  assert.equal($('[data-mobile-destination="puzzles"]').attr('href'), '/puzzles');
  assert.equal($('[data-mobile-destination="bots"]').attr('href'), '/play/bots');
  assert.equal($('[data-mobile-destination="coach"]').attr('href'), '/play/coach');
  assert.equal($('[data-mobile-destination="analyze"]').attr('href'), '/analyze');
  assert.equal($('[data-mobile-destination="scanner"]').attr('href'), '/scanner');
  assert.equal($('[data-mobile-destination="opening-explorer"]').attr('href'), '/opening-database');
  assert.deepEqual($('.mobile-submenu-options a').toArray().map(link => $(link).attr('href')), [
    '/watch/lichess-tv', '/spectator-tv'
  ]);
  assert.equal($('[data-mobile-destination="settings"]').is('button'), true);
  assert.equal($('[data-mobile-home] a[href="/yahoo-classic"]').length, 0);
});

test('mobile Home uses isolated primitives and the existing CAISSA knight identity', () => {
  const $ = load(read('home.html'));
  assert.equal($('.mobile-shell').length, 1);
  assert.equal($('.mobile-header').length, 1);
  assert.equal($('.mobile-hero img[src="/icon-512.png"]').attr('alt'), 'CAISSA blue knight');
  assert.equal($('.mobile-card-list').length, 1);
  assert.equal($('.mobile-card').length, 9);
  assert.equal($('.mobile-submenu').length, 1);
  assert.equal($('.mobile-sheet').length, 1);
  assert.equal($('.mobile-settings-entry').length, 1);
  assert.equal($('.sidebar').length, 1, 'desktop navigation remains present');
  assert.equal($('.dashboard').length, 1, 'desktop dashboard remains present');
  assert.match(read('css/home/mobile-home.css'), /@media \(max-width: 720px\)/);
  assert.match(read('css/home/mobile-home.css'), /\.sidebar,[\s\S]*\.shell,[\s\S]*\.mobile-nav/);
});

test('mobile Settings uses categories and only the supported locale preference', () => {
  const $ = load(read('home.html'));
  const categories = $('#mobile-settings [data-mobile-settings-view]').toArray()
    .map(button => $(button).attr('data-mobile-settings-view'));
  assert.deepEqual(categories, [
    'account', 'board', 'appearance', 'engine-coach', 'language', 'notation', 'accessibility', 'advanced'
  ]);
  assert.deepEqual($('#mobile-language option').toArray().map(option => $(option).attr('value')), ['en', 'es', 'pt']);
  assert.equal($('#mobile-language').attr('data-caissa-locale-select'), '');
  assert.equal($('#mobile-settings input[type="checkbox"]').length, 0);
  assert.equal($('#mobile-settings input[type="radio"]').length, 0);
});

test('mobile Home JavaScript contract matches the rendered routing contract', () => {
  const contract = loadContract();
  assert.deepEqual(Array.from(contract.destinations, item => item.id), [
    'play', 'puzzles', 'bots', 'coach', 'analyze', 'scanner', 'opening-explorer', 'watch-games', 'settings'
  ]);
  assert.equal(contract.destinations[0].route, '/play/games');
  assert.equal(contract.destinations[2].route, '/play/bots');
  assert.equal(contract.destinations[3].route, '/play/coach');
  assert.deepEqual(Array.from(contract.destinations[7].routes), ['/watch/lichess-tv', '/spectator-tv']);
  assert.deepEqual(Array.from(contract.settingsCategories), [
    'account', 'board', 'appearance', 'engine-coach', 'language', 'notation', 'accessibility', 'advanced'
  ]);
});
