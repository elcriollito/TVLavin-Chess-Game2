import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const policySource = fs.readFileSync(new URL('../js/legacy-canonical-section-route-policy.js', import.meta.url), 'utf8');

function loadPolicy(pathname = '/') {
  const context = { URL, location: { origin: 'http://localhost', pathname } };
  vm.runInNewContext(policySource, context);
  return context.LegacyCanonicalSectionRoutePolicy;
}

test('LegacyCanonicalSectionRoutePolicy@1.0.0 owns the canonical historical surfaces', () => {
  const policy = loadPolicy();
  assert.equal(policy.contractId, 'LegacyCanonicalSectionRoutePolicy@1.0.0');
  assert.deepEqual({ ...policy.routes }, {
    '/academy': 'academy', '/insights': 'insights', '/fics': 'fics', '/analyze': 'analyze', '/spectator-tv': 'spectator',
    '/arena': 'arena', '/cheater-insight': 'cheater-insight', '/game-library': 'library',
    '/history': 'history', '/dos-chess': 'dosChess'
  });
  assert.equal(policy.routeForSection('fics'), '/fics');
  assert.equal(policy.routeForSection('spectator'), '/spectator-tv');
  assert.equal(policy.routeForSection('insights'), '/insights');
  assert.equal(policy.surfaceForSection('library'), 'game-library');
  assert.equal(policy.routeForSection('play'), null);
});

test('canonical pathname wins without accepting descendants or lookalikes', () => {
  const policy = loadPolicy('/fics');
  assert.equal(policy.resolve().section, 'fics');
  assert.equal(policy.resolve('/spectator-tv?section=play#ignored').section, 'spectator');
  for (const path of ['/fics/child', '/spectator-tv-extra', '/play', '/']) assert.equal(policy.resolve(path), null);
});

test('Play builder excludes the legacy route policy and historical runtime owners', () => {
  for (const file of ['play-v2.html', 'play-v2-public-beta.html', 'play-v2-promotion-qa.html', 'play-v2-ipad-analyze-diagnostic.html']) {
    const html = fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
    assert.doesNotMatch(html, /legacy-canonical-section-route-policy|fics-client|spectator-tv-(?:state|catalog|section)/i, file);
  }
});
