import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { load } from 'cheerio';

const root = new URL('../', import.meta.url);
const source = await readFile(new URL('js/caissa-primary-navigation.js', root), 'utf8');
const documentStub = { querySelectorAll: () => [] };
const sandbox = { window: {}, document: documentStub };
vm.runInNewContext(source, sandbox);
const navigation = sandbox.window.CaissaPrimaryNavigation;
const expectedHeadings = ['Play & Compete', 'Learn & Improve', 'Analyze & Watch', 'Tools'];
const expectedLabels = [...navigation.inventory.primary, ...navigation.inventory.connect].map(item => item.label);

async function page(file) {
  return load(await readFile(new URL(file, root), 'utf8'));
}

test('application, Classic, Play, and Trainer adopt the shared sidebar family', async () => {
  for (const [file, adapter] of [
    ['index.html', 'application'],
    ['yahoo-classic.html', 'application'],
    ['play-v2-public-beta.html', 'application'],
    ['endgame-trainer.html', 'trainer']
  ]) {
    const $ = await page(file);
    assert.equal($('.caissa-shared-sidebar').length, 1, file);
    assert.equal($(`[data-caissa-primary-groups][data-caissa-sidebar-adapter="${adapter}"]`).length, 1, file);
    assert.deepEqual($('.nav-group-heading').slice(0, 4).map((_, el) => $(el).text().trim()).get(), expectedHeadings, file);
    assert.deepEqual($('[data-caissa-primary-groups] .nav-item .nav-label').map((_, el) => $(el).text().trim()).get(), expectedLabels, file);
    assert.equal($('[data-caissa-primary-groups] .nav-label').filter((_, el) => $(el).text().trim() === 'Settings').length, 0, file);
    assert.equal($('[data-caissa-primary-support] .nav-label').map((_, el) => $(el).text().trim()).get().join('|'), 'Support CAISSA|Help|About', file);
  }
});

test('fallbacks are deterministic and generated from the canonical 1.13.0 contract', async () => {
  assert.equal(navigation.contractId, 'CaissaGlobalNavigationOrderPolicy@1.13.0');
  assert.equal(expectedLabels.length, 34);
  assert.deepEqual(Array.from(navigation.inventory.primary.slice(-2), item => item.label), ['Vault', 'Blog']);
  assert.deepEqual(Array.from(navigation.inventory.connect, item => item.label), ['Facebook', 'CAISSA Chess YouTube', 'CAISSA Discord', 'Share an Idea / Contact & Feedback']);
  const generator = await readFile(new URL('scripts/build-navigation-fallbacks.mjs', root), 'utf8');
  assert.match(generator, /navigation\.adapters\[adapterName\]/);
  assert.doesNotMatch(generator, /Playchess|Live Blitz|CAISSA Discord/);
});

test('explicitly excluded surfaces do not import or render the shared sidebar', async () => {
  for (const file of ['signin.html', 'premium.html', 'play-v2-unavailable.html']) {
    const $ = await page(file);
    assert.equal($('.caissa-shared-sidebar, [data-caissa-primary-groups]').length, 0, file);
  }
});
