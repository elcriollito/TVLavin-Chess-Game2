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
      'play', 'yahooClassic', 'fics', 'playchess', 'fritz',
      'tactics', 'academy', 'endgame-trainer', 'endgame-practice', 'endgame-library',
      'insights', 'analyze', 'spectator', 'live-blitz', 'game-replayer', 'arena',
      'cheater-insight', 'polyglot', 'opening-database', 'eco', 'library',
      'history', 'dosChess', 'vault', 'blog'
    ]
  );
  assert.equal(inventory.primary.length, 25);
  assert.equal(inventory.connect.length, 4);
  for (const label of ['Endgame Practice', 'Endgame Library', 'Analyze', 'Help', 'About']) {
    assert.ok(labels.includes(label), `${label} is missing`);
  }
  assert.ok(!labels.includes('Settings'), 'game-specific Settings must not be global navigation');
  const discord = inventory.connect.find(({ id }) => id === 'discord');
  assert.equal(discord.label, 'CAISSA Discord');
  assert.equal(discord.route, 'https://discord.gg/TM7GJPUVfr');
  assert.equal(discord.newTab, true);
  const publicDiscordInvites = Array.from(inventory.connect, ({ route }) => (
    route.match(/^https:\/\/(?:discord\.gg\/|discord\.com\/invite\/)([^/?#]+)/i)?.[0]
  )).filter(Boolean);
  assert.deepEqual(publicDiscordInvites, ['https://discord.gg/TM7GJPUVfr']);
  assert.doesNotMatch(read('js/caissa-primary-navigation.js'), /g5vTsSrDA|qqhycag|xbFpAtbUK/);
  assert.equal(inventory.primary.find(({ id }) => id === 'fics').route, '/fics');
  assert.equal(inventory.primary.find(({ id }) => id === 'spectator').route, '/spectator-tv');
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

test('Help is first-class and legacy Settings opens contextual Play options', () => {
  const inventory = loadInventory();
  assert.equal(inventory.support.find(({ id }) => id === 'help').route, '/help');
  assert.equal(inventory.support.some(({ id }) => id === 'settings'), false);
  const navigation = read('js/caissa-navigation.js');
  assert.match(navigation, /openRequestedAction\(\)/);
  assert.match(navigation, /window\.location\.replace\('\/help'\)/);
  assert.match(navigation, /currentSection !== 'play'/);
  assert.match(navigation, /document\.getElementById\('menuModal'\)/);
});

test('explicit section routing remains ahead of the Classic default', () => {
  const navigation = read('js/caissa-navigation.js');
  const explicit = navigation.indexOf("urlParams.has('section')");
  const fallback = navigation.indexOf("|| 'yahooClassic'", explicit);
  assert.ok(explicit >= 0 && fallback > explicit);
  const middleware = read('middleware.js');
  const classicRedirect = middleware.indexOf("searchParams.get('section') === 'yahooClassic'");
  const playRedirect = middleware.indexOf("new URL('/play', url)");
  assert.ok(classicRedirect >= 0 && playRedirect > classicRedirect);
});

test('all standalone shell pages load the canonical source before the renderer', () => {
  const pages = [
    'endgame-library.html', 'about.html', 'help.html', 'eco.html', 'opening-database.html',
    'polyglot.html', 'vault.html', 'blog/index.html', 'playchess.html', 'fritz.html', 'tactics.html', 'live-blitz.html'
  ];
  for (const path of pages) {
    const html = read(path);
    assert.ok(
      html.indexOf('caissa-primary-navigation.js') < html.indexOf('caissa-standalone-sidebar.js'),
      `${path} loads scripts out of order`
    );
  }
});
