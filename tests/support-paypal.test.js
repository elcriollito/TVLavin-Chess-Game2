import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { load } from 'cheerio';

const root = path.resolve(import.meta.dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const buttonId = 'CV3QSCB3RPGVL';

function catalogs() {
  const document = { documentElement: { lang: 'en' }, querySelectorAll: () => [], addEventListener() {} };
  const window = {
    document,
    navigator: { languages: ['en-US'], language: 'en-US' },
    localStorage: { getItem: () => null, setItem() {} },
    dispatchEvent() {},
    CustomEvent: class CustomEvent {}
  };
  vm.runInNewContext(read('js/caissa-i18n.js'), { window, document });
  return window.CaissaI18n.catalogs;
}

test('Support CAISSA is a first-party localized route with one accessible PayPal boundary', () => {
  const $ = load(read('support.html'));
  const vercel = JSON.parse(read('vercel.json'));

  assert.equal($('html').attr('lang'), 'en');
  assert.equal($('h1').length, 1);
  assert.equal($('link[rel="canonical"]').attr('href'), 'https://www.caissa-chess.org/support');
  assert.equal($('[data-caissa-standalone-sidebar][data-active="support"]').length, 1);
  assert.equal($(`#paypal-container-${buttonId}`).length, 1);
  assert.equal($('#paypal-support-region[role="region"][data-caissa-i18n-aria-label="support.paymentRegion"]').length, 1);
  assert.equal($('#paypal-support-status[role="status"][aria-live="polite"]').length, 1);
  assert.equal($('script[src^="https://www.paypal.com/sdk/js"]').length, 0, 'SDK must be route-controlled, not parser-loaded');
  assert.equal($('script[src^="/js/support-paypal.js"]').length, 1);
  assert.ok(vercel.rewrites.some(rule => rule.source === '/support' && rule.destination === '/support.html'));
  assert.match(read('server.js'), /pathname === '\/support'/);
  assert.equal((read('public/sitemap.xml').match(/\/support<\/loc>/g) || []).length, 1);
});

test('Support keys have exact EN ES PT parity and preserve the Portuguese freeze rule', () => {
  const all = catalogs();
  const keys = Object.keys(all.en).filter(key => key === 'nav.item.support' || key.startsWith('support.')).sort();

  assert.equal(Object.keys(all.en).length, 621);
  assert.equal(Object.keys(all.es).length, 621);
  assert.equal(Object.keys(all.pt).length, 621);
  assert.equal(keys.length, 14);
  assert.deepEqual(Object.keys(all.es).filter(key => key === 'nav.item.support' || key.startsWith('support.')).sort(), keys);
  assert.deepEqual(Object.keys(all.pt).filter(key => key === 'nav.item.support' || key.startsWith('support.')).sort(), keys);
  for (const locale of ['en', 'es', 'pt']) {
    for (const key of keys) assert.ok(all[locale][key].trim(), `${locale}:${key}`);
  }
  assert.match(read('docs/i18n/PORTUGUESE_FREEZE.md'), /SUP-002[\s\S]*607 to 621 keys with exact parity/);
});

test('Hosted Button uses the approved public configuration and fails closed', () => {
  const controller = read('js/support-paypal.js');

  assert.equal((controller.match(new RegExp(buttonId, 'g')) || []).length, 1);
  assert.match(controller, /https:\/\/www\.paypal\.com\/sdk\/js/);
  assert.match(controller, /components['"],\s*['"]hosted-buttons/);
  assert.match(controller, /currency['"],\s*['"]USD/);
  assert.match(controller, /HostedButtons/);
  assert.match(controller, /hostedButtonId/);
  assert.match(controller, /\.render\(containerSelector\)/);
  assert.match(controller, /routePattern\.test\(global\.location\.pathname\)/);
  assert.match(controller, /script\.addEventListener\('error', failClosed/);
  assert.match(controller, /Promise\.resolve\(result\)[\s\S]*\.catch\(failClosed\)/);
  assert.match(controller, /global\.setTimeout\(failClosed, 20000\)/);
  assert.doesNotMatch(controller, /client-secret|access[_-]?token|business[_-]?id|paypal\.Buttons\s*\(/i);
});

test('PayPal network policy is scoped only to /support and stays least-privilege', () => {
  const vercel = JSON.parse(read('vercel.json'));
  const support = vercel.headers.find(rule => rule.source === '/support');
  const global = vercel.headers.find(rule => rule.source === '/(.*)');
  const supportCsp = support.headers.find(header => header.key === 'Content-Security-Policy').value;
  const globalCsp = global.headers.find(header => header.key === 'Content-Security-Policy').value;

  assert.ok(support);
  for (const directive of ['script-src', 'style-src', 'img-src', 'connect-src', 'child-src', 'frame-src']) {
    assert.match(supportCsp, new RegExp(`${directive}[^;]*https:\\/\\/\\*\\.paypal\\.com`), directive);
  }
  assert.match(supportCsp, /form-action 'self' https:\/\/\*\.paypal\.com/);
  assert.match(supportCsp, /object-src 'none'/);
  assert.doesNotMatch(supportCsp, /'unsafe-eval'/);
  assert.doesNotMatch(globalCsp, /paypal|venmo/i);
  assert.equal(support.headers.find(header => header.key === 'Cross-Origin-Opener-Policy').value, 'same-origin-allow-popups');
  assert.equal(support.headers.find(header => header.key === 'Referrer-Policy').value, 'strict-origin-when-cross-origin');
});

test('PayPal runtime and Hosted Button identity do not leak to unrelated product surfaces', () => {
  const candidates = fs.readdirSync(root).filter(name => name.endsWith('.html') && name !== 'support.html');
  for (const file of candidates) {
    const source = read(file);
    assert.doesNotMatch(source, /support-paypal\.js|www\.paypal\.com\/sdk\/js|CV3QSCB3RPGVL/, file);
  }
});
