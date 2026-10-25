import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { load } from 'cheerio';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

for (const page of [
  { file: 'privacy.html', route: '/privacy', title: 'Privacy Policy' },
  { file: 'terms.html', route: '/terms', title: 'Terms of Service' }
]) {
  test(`${page.route} is an indexable, accessible canonical legal document`, () => {
    const source = read(page.file);
    const $ = load(source);
    assert.equal($('html').attr('lang'), 'en');
    assert.equal($('main').attr('id'), 'legal-content');
    assert.equal($('h1').length, 1);
    assert.match($('h1').text(), new RegExp(page.title));
    assert.ok($('h2').length >= 10);
    assert.equal($('a.skip-link[href="#legal-content"]').length, 1);
    assert.equal($('link[rel="canonical"]').attr('href'), `https://www.caissa-chess.org${page.route}`);
    assert.equal($('meta[name="robots"]').attr('content'), 'index, follow');
    assert.equal($('meta[name="viewport"]').attr('content'), 'width=device-width, initial-scale=1');
    assert.equal($('nav[aria-label="Legal navigation"]').length, 1);
    assert.equal($('nav[aria-label="Footer"]').length, 1);
    assert.doesNotMatch(source, /Lorem ipsum|legal@example/i);
  });
}

test('routes, sitemap and entry-page footer links expose both legal documents', () => {
  const vercel = JSON.parse(read('vercel.json'));
  for (const route of ['/privacy', '/terms']) {
    assert.ok(vercel.rewrites.some(item => item.source === route && item.destination === `${route}.html`));
    assert.ok(read('server.js').includes(`pathname === '${route}'`));
    assert.ok(read('public/sitemap.xml').includes(`<loc>https://www.caissa-chess.org${route}</loc>`));
    for (const entry of ['home.html', 'signin.html', 'signup.html']) {
      assert.ok(read(entry).includes(`href="${route}"`), `${entry} must link ${route}`);
    }
  }
});

test('Scanner disclosure preserves consent and human-certification truth', () => {
  for (const source of [read('privacy.html'), read('terms.html')]) {
    assert.match(source, /raw-unverified/);
    assert.match(source, /not automatically (?:certified|accepted)/i);
    assert.match(source, /not automatically used/i);
    assert.match(source, /human review/i);
  }
});
