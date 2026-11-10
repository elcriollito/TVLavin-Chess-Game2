import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { load } from 'cheerio';

const root = path.resolve(import.meta.dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

function expansionCatalogs() {
  const document = { documentElement: { lang: 'en' }, querySelectorAll: () => [] };
  const window = { document, CaissaI18n: { getLocale: () => 'en' } };
  vm.runInNewContext(read('js/caissa-expansion-i18n.js'), { window, document, URL });
  return window.CaissaExpansionI18n.catalogs;
}

test('Downloads page has unique metadata, structured data and accurate release states', () => {
  const $ = load(read('downloads.html'));
  const schemas = $('script[type="application/ld+json"]').toArray().map(node => JSON.parse($(node).text()));
  assert.equal($('h1').length, 1);
  assert.equal($('link[rel="canonical"]').attr('href'), 'https://www.caissa-chess.org/downloads');
  assert.deepEqual(schemas.map(schema => schema['@type']), ['CollectionPage', 'BreadcrumbList']);
  const text = $('body').text().replace(/\s+/g, ' ');
  assert.match(text, /Unsigned release/);
  assert.match(text, /Version 0\.3\.1/);
  assert.match(text, /Future application/);
  assert.match(text, /Not released/);
  assert.doesNotMatch(text, /v1\.0\.0|certified safe|VirusTotal PASS/i);
});

test('Downloads routes, legacy redirects, navigation and sitemap are canonical', () => {
  const vercel = JSON.parse(read('vercel.json'));
  const server = read('server.js');
  const navigation = read('js/caissa-primary-navigation.js');
  const sitemap = read('public/sitemap.xml');
  for (const source of ['/vault', '/vault/', '/vault.html']) {
    assert.ok(vercel.redirects.some(route => route.source === source && route.destination === '/downloads' && route.permanent));
  }
  assert.ok(vercel.rewrites.some(route => route.source === '/downloads' && route.destination === '/downloads.html'));
  assert.match(server, /\/downloads\.html/);
  assert.match(server, /writeHead\(308/);
  assert.match(navigation, /label:\s*'Downloads'/);
  assert.match(navigation, /route:\s*'\/downloads'/);
  assert.equal((sitemap.match(/<loc>https:\/\/www\.caissa-chess\.org\/downloads<\/loc>/g) || []).length, 1);
  assert.equal(sitemap.includes('<loc>https://www.caissa-chess.org/vault</loc>'), false);
});

test('Downloads and Polyglot expansion keys have exact EN ES PT parity and complete markup coverage', () => {
  const catalogs = expansionCatalogs();
  const keys = Object.fromEntries(['en', 'es', 'pt'].map(locale => [locale, Object.keys(catalogs[locale]).sort()]));
  assert.deepEqual(keys.es, keys.en);
  assert.deepEqual(keys.pt, keys.en);
  for (const locale of ['en', 'es', 'pt']) {
    for (const [key, value] of Object.entries(catalogs[locale])) assert.ok(String(value).trim(), `${locale}:${key}`);
  }
  for (const html of ['downloads.html', 'polyglot.html']) {
    const $ = load(read(html));
    $('[data-caissa-i18n], [data-caissa-i18n-aria-label]').each((_index, node) => {
      const key = $(node).attr('data-caissa-i18n') || $(node).attr('data-caissa-i18n-aria-label');
      if (key.startsWith('downloads.') || ['polyglot.portableNote', 'polyglot.downloadPortable', 'polyglot.allDownloads', 'polyglot.cancel'].includes(key)) {
        assert.ok(catalogs.en[key], `${html}:${key}`);
      }
    });
  }
});

test('Downloads page declares local privacy and links only the exact approved portable release', () => {
  const $ = load(read('downloads.html'));
  assert.match($('.download-card-online').text(), /PGN stays on your device/);
  assert.equal($('.is-future a').length, 0);
  assert.equal($('a[href="/tools/polyglot"]').length >= 1, true);
  assert.equal($('#book-creator').length, 1);
  assert.equal($('#book-creator a').length, 3);
  assert.equal(
    $('#book-creator .download-button-primary').attr('href'),
    'https://github.com/elcriollito/CAISSA-Book-Creator/releases/download/v0.3.1/CAISSA-Book-Creator-v0.3.1-portable-unsigned-release-candidate.zip'
  );
  assert.match($('#book-creator').text(), /b227fa1a0dd272d80d6da3c13733f2aa2d4d64bd14d02aec3dac3008e444e63b/);
  assert.match($('#book-creator').text(), /UNVERIFIED/);
  assert.equal($('a[href*="v0.2.0"]').length, 0);
  assert.equal(read('polyglot.html').includes('href="/downloads#book-creator"'), true);
  assert.doesNotMatch(read('polyglot.html'), /downloads\.caissa-chess\.org\/apps\/caissa-book-creator/);
});
