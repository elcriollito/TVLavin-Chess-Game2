import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { load } from 'cheerio';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

function loadInventory() {
  const window = {};
  const document = { querySelectorAll: () => [] };
  vm.runInNewContext(read('js/caissa-primary-navigation.js'), { window, document });
  return window.CaissaPrimaryNavigation.inventory;
}

test('canonical primary navigation inventory is unique and stable', () => {
  const inventory = loadInventory();
  const labels = inventory.all.map(({ label }) => label);
  assert.equal(new Set(labels).size, labels.length);
  assert.deepEqual(
    Array.from(inventory.primary, ({ id }) => id),
    [
      'yahooClassic', 'play', 'mentor', 'academy', 'endgame-trainer', 'endgame-library',
      'insights', 'fics', 'analyze', 'spectator', 'arena',
      'cheater-insight', 'polyglot', 'opening-database', 'eco', 'library',
      'history', 'dosChess', 'vault', 'blog'
    ]
  );
  for (const label of ['Endgame Library', 'Analyze', 'Help', 'Settings', 'About']) {
    assert.ok(labels.includes(label), `${label} is missing`);
  }
});

test('main application and trainer consume the canonical inventory', () => {
  for (const path of ['index.html', 'yahoo-classic.html']) {
    const app = load(read(path));
    assert.equal(app('[data-caissa-primary-groups][data-navigation-mode="application"]').length, 1);
    assert.equal(app('[data-caissa-primary-support][data-navigation-mode="application"]').length, 1);
    assert.equal(app('script[src^="js/caissa-primary-navigation.js"]').length, 1);
  }

  const trainer = load(read('endgame-trainer.html'));
  assert.equal(trainer('[data-caissa-primary-groups][data-active="endgame-trainer"]').length, 1);
  assert.equal(trainer('[data-caissa-primary-support]').length, 1);
  assert.equal(trainer('script[src^="/js/caissa-primary-navigation.js"]').length, 1);
});

test('standalone renderer consumes the canonical inventory without a private list', () => {
  const source = read('js/caissa-standalone-sidebar.js');
  assert.match(source, /window\.CaissaPrimaryNavigation/);
  assert.doesNotMatch(source, /const groups\s*=/);
  assert.match(source, /renderSupport/);
});

test('Endgame Library uses the standard sidebar shell and keeps its content contract', () => {
  const page = load(read('endgame-library.html'));
  assert.equal(page('.caissa-standalone-layout').length, 1);
  assert.equal(page('[data-caissa-standalone-sidebar][data-active="endgame-library"]').length, 1);
  assert.equal(page('#library-main.caissa-standalone-content').length, 1);
  assert.equal(page('.library-header').length, 0);
  for (const selector of ['#library-filters', '#library-results', '#unit-detail', '#result-count']) {
    assert.equal(page(selector).length, 1, `${selector} missing`);
  }
});

test('About reuses its approved destination inside the standard shell', () => {
  const page = load(read('about.html'));
  assert.equal(page('[data-caissa-standalone-sidebar][data-active="about"]').length, 1);
  assert.equal(page('link[rel="canonical"]').attr('href'), 'https://www.caissa-chess.org/about');
  assert.match(page('main').text(), /About CAISSA Chess/);
});

test('Help and Settings use real navigation actions', () => {
  const inventory = loadInventory();
  assert.equal(inventory.support.find(({ id }) => id === 'help').route, '/?action=help');
  assert.equal(inventory.support.find(({ id }) => id === 'settings').route, '/?action=settings');
  const navigation = read('js/caissa-navigation.js');
  assert.match(navigation, /openRequestedAction\(\)/);
  assert.match(navigation, /document\.getElementById\('helpModal'\)/);
  assert.match(navigation, /document\.getElementById\('menuModal'\)/);
});

test('explicit section routing remains ahead of the Classic default', () => {
  const navigation = read('js/caissa-navigation.js');
  const explicit = navigation.indexOf("urlParams.has('section')");
  const fallback = navigation.indexOf("|| 'yahooClassic'", explicit);
  assert.ok(explicit >= 0 && fallback > explicit);
  assert.match(read('middleware.js'), /searchParams\.get\('section'\) !== 'yahooClassic'/);
});

test('all standalone shell pages load the canonical source before the renderer', () => {
  const pages = [
    'endgame-library.html', 'about.html', 'eco.html', 'opening-database.html',
    'polyglot.html', 'vault.html', 'blog/index.html'
  ];
  for (const path of pages) {
    const html = read(path);
    assert.ok(
      html.indexOf('caissa-primary-navigation.js') < html.indexOf('caissa-standalone-sidebar.js'),
      `${path} loads scripts out of order`
    );
  }
});
