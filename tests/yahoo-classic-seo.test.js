import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { load } from 'cheerio';
import publicAuthConfig from '../api/public-auth-config.js';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const production = 'https://www.caissa-chess.org';
const canonical = `${production}/yahoo-classic`;
const title = 'Yahoo Chess Alternative — Classic Online Chess Rooms | CAISSA';
const description = 'Enter CAISSA Classic, an independent Yahoo Chess-inspired experience with social rooms, visible tables, challenges, spectating and a retro chess atmosphere.';

test('standalone CAISSA Classic initial HTML has unique route metadata', () => {
  const $ = load(read('yahoo-classic.html'));
  assert.equal($('title').length, 1);
  assert.equal($('title').text(), title);
  assert.equal($('meta[name="title"]').attr('content'), title);
  assert.equal($('meta[name="description"]').attr('content'), description);
  assert.equal($('link[rel="canonical"]').length, 1);
  assert.equal($('link[rel="canonical"]').attr('href'), canonical);
  assert.equal($('meta[property="og:url"]').attr('content'), canonical);
  assert.equal($('meta[property="og:title"]').attr('content'), title);
  assert.equal($('meta[name="twitter:url"]').attr('content'), canonical);
  assert.equal($('meta[name="twitter:title"]').attr('content'), title);
  assert.match($('meta[property="og:image"]').attr('content'), /^https:\/\/www\.caissa-chess\.org\//);
});

test('standalone route exposes useful semantics and preserves the application', () => {
  const $ = load(read('yahoo-classic.html'));
  assert.equal($('.yc-landing-intro h1').length, 1);
  assert.equal($('.yc-landing-intro h1').text().trim(), 'CAISSA Classic — A Yahoo Chess-Inspired Online Lobby');
  assert.match($('.yc-landing-intro').text(), /independent online chess experience/);
  assert.match($('.yc-landing-disclaimer').text(), /not affiliated with, sponsored by, or endorsed by Yahoo/);
  assert.equal($('a[href="/blog/yahoo-chess-spirit-caissa-classic"]').length, 1);
  assert.equal($('a[href="/about"]').length >= 1, true);
  assert.equal($('a[href="/blog"]').length >= 1, true);
  assert.equal($('#yahooClassicSection').length, 1);
  assert.equal($('#ycCreateTableToggle').length, 1);
  assert.equal($('#ycActivityFeed').length, 1);
  assert.equal($('.yc-rating-legend').length, 1);
  assert.equal($('.yc-tab[data-room="CAISSA Lobby"]').length, 1);
});

test('route schemas parse and agree with visible metadata', () => {
  const $ = load(read('yahoo-classic.html'));
  const schemas = $('script[type="application/ld+json"]').toArray().map(node => JSON.parse($(node).text()));
  assert.deepEqual(schemas.map(schema => schema['@type']), ['WebPage', 'BreadcrumbList']);
  assert.equal(schemas[0].name, title);
  assert.equal(schemas[0].description, description);
  assert.equal(schemas[0].url, canonical);
  assert.equal(schemas[1].itemListElement.at(-1).item, canonical);
});

test('homepage metadata remains unchanged and distinct', () => {
  const home = load(read('index.html'));
  const classic = load(read('yahoo-classic.html'));
  assert.equal(home('title').text(), 'CAISSA Chess – Play Online, Stockfish Analysis & Training');
  assert.equal(home('link[rel="canonical"]').attr('href'), `${production}/`);
  assert.notEqual(home('title').text(), classic('title').text());
  assert.notEqual(home('meta[name="description"]').attr('content'), classic('meta[name="description"]').attr('content'));
});

test('canonical route and legacy query state consolidate without sitemap duplication', () => {
  const sitemap = read('public/sitemap.xml');
  const vercel = JSON.parse(read('vercel.json'));
  const server = read('server.js');
  assert.equal((sitemap.match(new RegExp(`<loc>${canonical}</loc>`, 'g')) || []).length, 1);
  assert.ok(!sitemap.includes(`${canonical}/`));
  assert.ok(!sitemap.includes('?section=yahooClassic'));
  assert.ok(vercel.rewrites.some(rule => rule.source === '/yahoo-classic' && rule.destination === '/yahoo-classic.html'));
  assert.ok(vercel.rewrites.some(rule =>
    rule.source === '/'
    && rule.destination === '/api/public-auth-config?classicRedirect=1'
    && rule.has?.some(condition => condition.key === 'section' && condition.value === 'yahooClassic')
  ));
  assert.match(server, /searchParams\.get\('section'\) === 'yahooClassic'/);
  assert.match(server, /pathname === '\/yahoo-classic'[\s\S]*filePath = '\.\/yahoo-classic\.html'/);
});

test('legacy query redirect returns a clean permanent canonical location', () => {
  const headers = new Map();
  let statusCode;
  let ended = false;
  const response = {
    setHeader: (name, value) => headers.set(name.toLowerCase(), value),
    status: code => {
      statusCode = code;
      return response;
    },
    end: () => {
      ended = true;
      return response;
    }
  };
  publicAuthConfig({ method: 'GET', url: '/api/public-auth-config?classicRedirect=1&section=yahooClassic' }, response);
  assert.equal(statusCode, 308);
  assert.equal(headers.get('location'), '/yahoo-classic');
  assert.equal(ended, true);
});

test('public auth configuration retains its normal non-redirect response', () => {
  let statusCode;
  let payload;
  const response = {
    status: code => {
      statusCode = code;
      return response;
    },
    json: value => {
      payload = value;
      return response;
    }
  };
  publicAuthConfig({ method: 'GET', url: '/api/public-auth-config' }, response);
  assert.equal(statusCode, 200);
  assert.equal(typeof payload, 'object');
  assert.equal(Object.hasOwn(payload, 'clerkPublishableKey'), true);
  assert.equal(Object.hasOwn(payload, 'registrationTracking'), true);
});

test('public copy makes no prohibited affiliation claim', () => {
  const text = load(read('yahoo-classic.html'))('#yahooClassicSection').text().replace(/\s+/g, ' ');
  for (const claim of [
    'official Yahoo Chess',
    'Yahoo Chess has returned',
    'authorized successor',
    'Yahoo partnership',
    'Yahoo-owned',
    'exact clone',
    'official recreation'
  ]) assert.ok(!text.includes(claim), claim);
});
