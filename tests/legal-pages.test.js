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

test('legal-page internal and contact links resolve to approved destinations', () => {
  const allowedRoutes = new Set(['/', '/privacy', '/terms', '/about']);
  for (const file of ['privacy.html', 'terms.html']) {
    const $ = load(read(file));
    for (const element of $('a[href]').toArray()) {
      const href = $(element).attr('href');
      if (href.startsWith('#')) {
        assert.equal($(`#${href.slice(1)}`).length, 1, `${file} missing ${href}`);
      } else if (href.startsWith('mailto:')) {
        assert.match(href, /^mailto:privacy@caissa-chess\.org(?:\?|$)/);
      } else if (href.startsWith('https://')) {
        assert.equal(new URL(href).hostname, 'www.caissa-chess.org');
      } else {
        assert.ok(allowedRoutes.has(href), `${file} has unapproved local link ${href}`);
      }
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

test('privacy draft accurately discloses Scanner snapshots, non-atomic image binding and quarantine', () => {
  const source = read('privacy.html');
  assert.match(source, /records a derived scan snapshot even if you do not submit feedback/i);
  assert.match(source, /not one atomic transaction/i);
  assert.match(source, /private image object can remain without a completed feedback record/i);
  assert.match(source, /Historical private-beta Scanner images and records remain quarantined from training/i);
  assert.doesNotMatch(source, /ordinary recognition images are never (?:stored|retained)/i);
});

test('privacy draft discloses supported AI providers and BYO-key handling', () => {
  const source = read('privacy.html');
  for (const provider of ['Together AI', 'OpenAI', 'Anthropic', "Meta's Llama API"]) {
    assert.match(source, new RegExp(provider.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(source, /forwards it to that provider for the request/i);
  assert.match(source, /does not intentionally store it in the application database or browser storage/i);
});

test('legal drafts do not overpromise automated retention, deletion, notice or appeals', () => {
  const privacy = read('privacy.html');
  const terms = read('terms.html');
  assert.match(privacy, /does not currently operate one automated retention or deletion schedule/i);
  assert.match(privacy, /does not currently provide a universal automated export or deletion feature/i);
  assert.match(privacy, /current site does not yet automate that notice or re-consent process/i);
  assert.match(terms, /Restoration is not guaranteed/i);
  assert.match(terms, /current site does not yet automate notice or re-acceptance/i);
});

test('legal pages publish only the official privacy contact', () => {
  for (const source of [read('privacy.html'), read('terms.html')]) {
    assert.match(source, /mailto:privacy@caissa-chess\.org/);
    assert.doesNotMatch(source, /@gmail\.com/i);
  }
});

test('privacy draft matches current analytics, Google identity, and free-project status', () => {
  const source = read('privacy.html');
  assert.match(source, /Microsoft Clarity is not loaded by the current production pages/);
  assert.doesNotMatch(source, /enable optional Clarity analytics/);
  assert.match(source, /https:\/\/www\.googleapis\.com\/auth\/userinfo\.email/);
  assert.match(source, /https:\/\/www\.googleapis\.com\/auth\/userinfo\.profile/);
  assert.match(source, /free personal project/i);
  assert.match(source, /does not currently charge for services/i);
  assert.match(source, /No payment processor, paid subscription, renewal or refund program is active/i);
  assert.doesNotMatch(source, /Stripe-backed checkout code exists/i);
});

test('legal drafts accurately describe the individual operator and noncommercial status', () => {
  const privacy = read('privacy.html');
  const terms = read('terms.html');
  for (const source of [privacy, terms]) {
    assert.match(source, /operated by one individual/i);
    assert.match(source, /No company, limited liability company or corporation/i);
    assert.match(source, /does not (?:currently )?(?:charge users|charge for services)/i);
    assert.match(source, /commercial subscriptions/i);
    assert.match(source, /commercial revenue/i);
  }
  assert.match(terms, /internal feature controls/i);
  assert.match(terms, /Before any commercial feature is activated/i);
});

test('privacy draft states verified transfer facts without promising single-country storage', () => {
  const source = read('privacy.html');
  assert.match(source, /East US \(North Virginia\)/i);
  assert.match(source, /Standard Contractual Clauses/i);
  assert.match(source, /has not completed a jurisdiction-by-jurisdiction transfer assessment/i);
  assert.doesNotMatch(source, /information (?:always|only) remains in the United States/i);
});

test('legal drafts state the approved 16-plus policy and accurately describe candidate activation', () => {
  const privacy = read('privacy.html');
  const terms = read('terms.html');
  for (const source of [privacy, terms]) {
    assert.match(source, /at least 16 years old to create a new CAISSA account/i);
    assert.match(source, /CAISSA Junior/i);
    assert.match(source, /verifiable parental consent/i);
    assert.match(source, /account-free chess content and tools may remain publicly accessible/i);
    assert.match(source, /registration remains paused/i);
  }
  assert.match(privacy, /technical candidate asks only for birth month and year/i);
  assert.match(terms, /prepared and tested a data-minimizing age-screening candidate/i);
  assert.match(privacy + terms, /not active in production/i);
});

test('age-policy audit preserves a data-minimizing, fail-closed implementation boundary', () => {
  const source = read('docs/AUTH-004B-AGE-POLICY-AND-CLERK-AUDIT.md');
  assert.match(source, /before any Clerk request/i);
  assert.match(source, /birth month and year/i);
  assert.match(source, /does not retain those values/i);
  assert.match(source, /before email or OAuth/i);
  assert.match(source, /Direct email, API, invitation and OAuth account creation remain blocked/i);
  assert.match(source, /Human Release Gate/i);
});

test('retention, transfer and Florida audit records only aggregate, verified evidence', () => {
  const source = read('docs/AUTH-004B-RETENTION-TRANSFER-FLORIDA-AUDIT.md');
  assert.match(source, /97 Scanner beta scan rows/i);
  assert.match(source, /92 Scanner beta feedback rows/i);
  assert.match(source, /96 objects/i);
  assert.match(source, /no Storage lifecycle rule/i);
  assert.match(source, /us-east-1/i);
  assert.match(source, /zero Stripe event rows/i);
  assert.match(source, /cannot conclude that the project is exempt/i);
  assert.match(source, /No rows or objects were opened, changed or deleted/i);
});

test('legal decision register preserves every tracked material decision', () => {
  const source = read('docs/AUTH-004B-LEGAL-DECISION-REGISTER.md');
  for (const item of [
    'Individual operator and Florida status', 'Privacy contact and legal notices',
    'Data retention and deletion', 'Minimum age and parental consent',
    'International data transfers', 'Current and future commercial status',
    'Suspension and appeal procedure', 'Liability provisions',
    'Governing law and disputes', 'Material policy updates'
  ]) assert.match(source, new RegExp(item));
  for (const classification of [
    'FACTUALLY VERIFIED', 'LEGAL REVIEW REQUIRED', 'HUMAN DECISION REQUIRED',
    'HUMAN DECISION APPROVED / TECHNICAL CANDIDATE TESTED'
  ]) assert.match(source, new RegExp(classification));
  assert.match(source, /provisional minimum age of 16/i);
  assert.doesNotMatch(source, /D\. Minimum age and parental consent \| HUMAN DECISION REQUIRED/);
});
