import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../js/caissa-primary-navigation.js', import.meta.url), 'utf8');

function loadNavigation() {
  const window = {};
  const document = { querySelectorAll: () => [] };
  vm.runInNewContext(source, { window, document });
  return window.CaissaPrimaryNavigation;
}

test('CaissaGlobalNavigationOrderPolicy@1.11.0 owns one immutable 34-destination order', () => {
  const navigation = loadNavigation();
  assert.equal(navigation.contractId, 'CaissaGlobalNavigationOrderPolicy@1.11.0');
  assert.deepEqual(Array.from(navigation.groupLabels), [
    'Play & Compete', 'Learn & Improve', 'Analyze & Watch', 'Tools'
  ]);
  assert.deepEqual(Array.from(navigation.inventory.primary, item => item.label), [
    'Play', 'CAISSA Classic', 'FICS', 'Playchess', 'Fritz',
    'Tactics', 'Interactive Diagrams', 'Academy', 'Endgame Trainer', 'Endgame Practice', 'Endgame Library',
    'Insights', 'Analyze', 'Spectator TV', 'Lichess TV', 'Live Blitz', 'Live Tournaments', 'Lichess Broadcasts', 'Game Replayer', 'Arena',
    'Cheater Insight', 'CAISSA PGN Replayer', 'Polyglot Tool', 'Opening Database', 'ECO Codes',
    'Game Library', 'History', 'DOS Chess', 'Vault', 'Blog'
  ]);
  assert.deepEqual(Array.from(navigation.inventory.connect, item => item.label), [
    'Facebook', 'CAISSA Chess YouTube', 'CAISSA Discord', 'Share an Idea / Contact & Feedback'
  ]);
  assert.equal(navigation.inventory.all.filter(item => item.id === 'play').length, 1);
  assert.equal(navigation.inventory.all.filter(item => item.id === 'playchess').length, 1);
  assert.equal(navigation.inventory.all.filter(item => item.id === 'tactics').length, 1);
  assert.equal(navigation.inventory.all.filter(item => item.id === 'interactive-diagrams').length, 1);
  assert.equal(navigation.inventory.all.filter(item => item.id === 'lichess-tv').length, 1);
  assert.equal(navigation.inventory.all.filter(item => item.id === 'live-blitz').length, 1);
  assert.equal(navigation.inventory.all.filter(item => item.id === 'live-tournaments').length, 1);
  assert.deepEqual(Array.from(navigation.inventory.groups[0], item => item.label), [
    'Play', 'CAISSA Classic', 'FICS', 'Playchess', 'Fritz'
  ]);
  assert.deepEqual(Array.from(navigation.inventory.groups[1], item => item.label), [
    'Tactics', 'Interactive Diagrams', 'Academy', 'Endgame Trainer', 'Endgame Practice', 'Endgame Library'
  ]);
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
  assert.match(source, /link\.href = '\/play'/);
  assert.match(standalone, /href="\/play" class="nav-logo"/);
});
