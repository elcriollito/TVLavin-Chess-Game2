import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root = new URL('../', import.meta.url);
const read = relative => fs.readFileSync(new URL(relative, root), 'utf8');

test('application shell exposes a focusable localized main bypass', () => {
  const html = read('index.html');
  assert.match(html, /class="caissa-global-skip-link"[^>]+href="#mainContent"[^>]+tabindex="0"/);
  assert.match(html, /<main id="mainContent"[^>]+tabindex="-1"/);
  assert.equal((read('js/caissa-i18n.js').match(/'accessibility\.skipMain':/g) || []).length, 3);
});

test('Play setup summary keeps visible text as its accessible name', () => {
  const source = read('js/play/games-panel.js');
  assert.doesNotMatch(source, /data-games-setup-summary[^\n]+aria-label/);
  assert.doesNotMatch(source, /querySelector\('\[data-games-setup-summary\]'\)\?\.setAttribute\('aria-label'/);
});
