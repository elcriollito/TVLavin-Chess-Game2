import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { load } from 'cheerio';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

function navigation() {
  const window = {};
  const document = { querySelectorAll: () => [] };
  vm.runInNewContext(read('js/caissa-primary-navigation.js'), { window, document });
  return window.CaissaPrimaryNavigation;
}

test('one immutable 1.12.0 model is shared by every shell adapter', () => {
  const api = navigation();
  assert.equal(api.contractId, 'CaissaGlobalNavigationOrderPolicy@1.12.0');
  assert.equal(api.inventory.primary.length + api.inventory.connect.length, 34);
  assert.deepEqual(Object.keys(api.adapters), ['modernStandalone', 'application', 'trainer']);
  for (const adapter of Object.values(api.adapters)) {
    assert.equal(adapter.inventory, api.inventory);
    assert.equal(adapter.groupLabels, api.groupLabels);
    assert.ok(Object.isFrozen(adapter.definition));
    assert.ok(Object.isFrozen(adapter.definition.slots));
  }
  assert.equal(api.adapters.application.definition.mode, 'application');
  assert.equal(api.adapters.trainer.definition.id, 'trainer-board-first');
});

test('shared group rendering is labelled, non-interactive and has one exact active item', () => {
  const api = navigation();
  const html = api.adapters.modernStandalone.renderGroups({ activeKey: 'fritz' });
  const $ = load(`<nav aria-label="CAISSA main navigation">${html}</nav>`);
  assert.equal($('.nav-group[aria-labelledby] > .nav-destination-list[role="list"]').length, 4);
  assert.deepEqual($('.nav-group-heading').map((_, element) => $(element).text().trim()).get(),
    ['Play & Compete', 'Learn & Improve', 'Analyze & Watch', 'Tools']);
  assert.equal($('.nav-group-heading').is('a,button,[tabindex]'), false);
  assert.equal($('[role="listitem"]').length, 30);
  assert.equal($('[aria-current="page"]').length, 1);
  assert.equal($('[aria-current="page"]').text().trim(), 'Fritz');
  assert.equal(api.adapters.modernStandalone.renderGroups({ activeKey: 'unknown' }).includes('aria-current'), false);
});

test('external semantics and auth or Premium ownership stay outside canonical data', () => {
  const api = navigation();
  const $ = load(api.adapters.modernStandalone.renderConnect());
  assert.equal($('[role="list"]').length, 1);
  assert.equal($('a[target="_blank"][rel="noopener noreferrer"]').length, 3);
  assert.equal($('a[href^="mailto:"]').length, 1);
  assert.equal(JSON.stringify(api.inventory).includes('sidebarSignIn'), false);
  assert.equal(JSON.stringify(api.inventory).includes('isPremium'), false);
  assert.equal(api.adapters.application.definition.slots.actions, 'application-owned');
});

test('canonical fallback seam is accessible and byte deterministic', () => {
  const api = navigation();
  const first = api.renderFallbackNavigation({ adapter: api.adapters.application, activeKey: 'academy' });
  const second = api.renderFallbackNavigation({ adapter: api.adapters.application, activeKey: 'academy' });
  assert.equal(first, second);
  const $ = load(first);
  assert.equal($('nav[aria-label="CAISSA main navigation"]').length, 1);
  assert.equal($('[role="listitem"]').length, 36);
  assert.equal($('[aria-current="page"]').length, 1);
  assert.equal($('[aria-current="page"]').text().trim(), 'Academy');
  assert.throws(() => api.renderFallbackNavigation({ adapter: {}, activeKey: 'play' }), /canonical shell adapter/);
});

test('modern renderer delegates destinations and drawer behavior without private owners', () => {
  const standalone = read('js/caissa-standalone-sidebar.js');
  assert.match(standalone, /navigation\.adapters\.modernStandalone/);
  assert.match(standalone, /navigation\.createDrawerController/);
  assert.doesNotMatch(standalone, /const\s+(?:groups|navigationItems|items)\s*=\s*\[/);
  assert.doesNotMatch(standalone, /matchMedia|addEventListener\('keydown'/);
  assert.doesNotMatch(standalone, /localStorage|isPremium|CAISSA_AUTH/);
});
