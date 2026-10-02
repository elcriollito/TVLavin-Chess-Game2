import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { load } from 'cheerio';

const source = fs.readFileSync(new URL('../js/caissa-primary-navigation.js', import.meta.url), 'utf8');

function loadNavigation() {
  const window = {};
  const document = { querySelectorAll: () => [] };
  vm.runInNewContext(source, { window, document });
  return window.CaissaPrimaryNavigation;
}

test('CaissaGlobalNavigationOrderPolicy@1.15.0 owns the primary, More, and social destinations', () => {
  const navigation = loadNavigation();
  assert.equal(navigation.contractId, 'CaissaGlobalNavigationOrderPolicy@1.15.0');
  assert.deepEqual(
    Array.from(navigation.inventory.more, (item) => item.label),
    ['Blog', 'Support CAISSA', 'Help', 'About', 'Share an Idea / Contact & Feedback']
  );
  assert.deepEqual(Array.from(navigation.groupLabels), [
    'Play & Compete', 'Learn & Improve', 'Analyze & Watch', 'Tools'
  ]);
  assert.deepEqual(Array.from(navigation.inventory.primary, item => item.label), [
    'Play', 'CAISSA Classic', 'FICS', 'Playchess', 'Fritz',
    'Puzzles', 'Academy', 'Endgame Trainer', 'Endgame Library', 'Endgame Tablebase',
    'Insights', 'Analyze', 'CAISSA PGN Reader', 'Chess TV', 'Lichess TV', 'Live Blitz', 'Live Tournaments', 'Engine Arena',
    'Cheater Insight', 'Polyglot Tool', 'Opening Database', 'ECO Codes',
    'Game Library', 'History', 'DOS Chess', 'Vault'
  ]);
  assert.deepEqual(Array.from(navigation.inventory.social, item => item.label), [
    'Facebook', 'CAISSA Chess YouTube', 'CAISSA Discord'
  ]);
  assert.equal(navigation.inventory.all.filter(item => item.id === 'play').length, 1);
  assert.equal(navigation.inventory.all.filter(item => item.id === 'playchess').length, 1);
  assert.equal(navigation.inventory.all.filter(item => item.id === 'puzzles').length, 1);
  assert.equal(navigation.inventory.all.filter(item => item.id === 'interactive-diagrams').length, 0);
  assert.equal(navigation.inventory.all.filter(item => item.id === 'lichess-tv').length, 1);
  assert.equal(navigation.inventory.all.filter(item => item.id === 'live-blitz').length, 1);
  assert.equal(navigation.inventory.all.filter(item => item.id === 'live-tournaments').length, 1);
  assert.deepEqual(Array.from(navigation.inventory.groups[0], item => item.label), [
    'Play', 'CAISSA Classic', 'FICS', 'Playchess', 'Fritz'
  ]);
  assert.deepEqual(Array.from(navigation.inventory.groups[1], item => item.label), [
    'Puzzles', 'Academy', 'Endgame Trainer', 'Endgame Library', 'Endgame Tablebase'
  ]);
  const social = load(navigation.renderSocialFooter());
  assert.equal(social('.nav-social-link').length, 3);
  assert.equal(social('.nav-label').length, 0);
  assert.equal(social('.fa-youtube').length, 1);
  assert.equal(navigation.inventory.all.some(item => item.label === 'Play Online' || item.id === 'play-online'), false);
});

test('all renderers consume the owner without CSS or private-array reordering', () => {
  const standalone = fs.readFileSync(new URL('../js/caissa-standalone-sidebar.js', import.meta.url), 'utf8');
  assert.match(standalone, /window\.CaissaPrimaryNavigation/);
  assert.doesNotMatch(standalone, /const\s+(?:groups|navigationItems|items)\s*=\s*\[/);
  assert.doesNotMatch(source, /\.sort\(|style\.order|order:/);
  assert.match(source, /data-caissa-navigation-order-ready/);
  const css = fs.readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
  assert.match(css, /data-caissa-primary-groups[^}]+visibility:\s*hidden/s);
  assert.doesNotMatch(css, /data-caissa-primary-groups[^}]+\border\s*:/s);
  assert.match(source, /link\.href = '\/'/);
  assert.match(standalone, /href="\/" class="nav-logo"/);
});
