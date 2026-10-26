import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(import.meta.dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

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

function publicHtmlFiles(directory = root) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'docs' || entry.name === 'artifacts') return [];
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return publicHtmlFiles(absolute);
    return entry.name.endsWith('.html') ? [path.relative(root, absolute)] : [];
  });
}

test('retired Support route redirects permanently to Help in both hosting contracts', () => {
  const vercel = JSON.parse(read('vercel.json'));
  for (const source of ['/support', '/support/', '/support.html']) {
    assert.ok(vercel.redirects.some(rule => rule.source === source && rule.destination === '/help' && rule.permanent === true));
  }
  assert.ok(!vercel.rewrites.some(rule => rule.source === '/support' || rule.source === '/support/'));
  assert.ok(!vercel.headers.some(rule => rule.source === '/support' || rule.source === '/support/'));

  const server = read('server.js');
  assert.match(server, /\['\/support', '\/help'\]/);
  assert.match(server, /\['\/support\.html', '\/help'\]/);
  assert.doesNotMatch(server, /filePath\s*=\s*['"]\.\/support\.html['"]/);
  assert.doesNotMatch(read('public/sitemap.xml'), /www\.caissa-chess\.org\/support/);
});

test('PayPal implementation and contribution UI artifacts are removed', () => {
  for (const relative of ['support.html', 'js/support-paypal.js', 'css/support-page.css']) {
    assert.equal(fs.existsSync(path.join(root, relative)), false, relative);
  }

  const activeSources = [
    'vercel.json',
    'server.js',
    'public/sitemap.xml',
    'js/caissa-primary-navigation.js',
    'js/caissa-i18n.js',
    'api/_lib/play-v2-public-beta-document.js',
    ...publicHtmlFiles()
  ];
  for (const relative of activeSources) {
    const source = read(relative);
    assert.doesNotMatch(source, /paypal(?:objects)?|venmo|CV3QSCB3RPGVL|support-paypal|hosted[- ]?button/i, relative);
    assert.doesNotMatch(source, /Support CAISSA|Apoya a CAISSA|Apoie a CAISSA/, relative);
  }
});

test('navigation and EN ES PT catalogs expose no retired contribution destination', () => {
  const navigation = read('js/caissa-primary-navigation.js');
  assert.match(navigation, /CaissaGlobalNavigationOrderPolicy@1\.22\.0/);
  assert.doesNotMatch(navigation, /id: 'support'|route: '\/support'/);

  const all = catalogs();
  const counts = ['en', 'es', 'pt'].map(locale => Object.keys(all[locale]).length);
  assert.equal(new Set(counts).size, 1, `catalog counts differ: ${counts.join(', ')}`);
  for (const locale of ['en', 'es', 'pt']) {
    const retired = Object.keys(all[locale]).filter(key => key === 'nav.item.support' || key.startsWith('support.'));
    assert.deepEqual(retired, [], locale);
    assert.ok(all[locale]['nav.item.help'], `${locale}:nav.item.help`);
  }
});

test('historical PayPal audit evidence is retained outside the active product', () => {
  const historical = read('docs/support/PAYPAL_HOSTED_BUTTON_AUDIT.md');
  assert.match(historical, /CV3QSCB3RPGVL/);
  assert.match(historical, /PayPal/);
});

test('PayPal-specific CSP permissions are absent without changing global payment restrictions', () => {
  const vercel = read('vercel.json');
  assert.doesNotMatch(vercel, /paypal|paypalobjects|venmo/i);
  assert.match(vercel, /payment=\(\)/);
  assert.match(vercel, /object-src 'none'/);
});
