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

test('legal pages publish only the official privacy contact', () => {
  for (const source of [read('privacy.html'), read('terms.html')]) {
    assert.match(source, /mailto:privacy@caissa-chess\.org/);
    assert.doesNotMatch(source, /@gmail\.com/i);
  }
});

test('privacy draft matches current analytics, Google identity, and payment activation state', () => {
  const source = read('privacy.html');
  assert.match(source, /Microsoft Clarity is not loaded by the current production pages/);
  assert.doesNotMatch(source, /enable optional Clarity analytics/);
  assert.match(source, /https:\/\/www\.googleapis\.com\/auth\/userinfo\.email/);
  assert.match(source, /https:\/\/www\.googleapis\.com\/auth\/userinfo\.profile/);
  assert.match(source, /no production Stripe configuration or enabled credit-store flag/i);
});

test('legal decision register preserves every unresolved publication decision', () => {
  const source = read('docs/AUTH-004B-LEGAL-DECISION-REGISTER.md');
  for (const item of [
    'Individual operator identification', 'Privacy contact and legal notices',
    'Data retention and deletion', 'Minimum age and parental consent',
    'International data transfers', 'Payment, subscription and refund terms',
    'Suspension and appeal procedure', 'Liability provisions',
    'Governing law and disputes', 'Material policy updates'
  ]) assert.match(source, new RegExp(item));
  for (const classification of [
    'FACTUALLY VERIFIED', 'LEGAL REVIEW REQUIRED', 'HUMAN DECISION REQUIRED'
  ]) assert.match(source, new RegExp(classification));
});
