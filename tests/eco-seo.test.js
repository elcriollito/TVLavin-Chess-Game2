import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { load } from 'cheerio';

const root = path.resolve(import.meta.dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const productionUrl = 'https://www.caissa-chess.org/eco';
const expectedTitle = 'Chess ECO Codes Database — Openings A00–E99 | CAISSA';
const expectedDescription = 'Explore chess ECO codes from A00 to E99, identify openings and variations, and connect each code with CAISSA’s free opening database.';

test('ECO page exposes unique, aligned search and social metadata', () => {
  const $ = load(read('eco.html'));

  assert.equal($('title').length, 1);
  assert.equal($('title').text(), expectedTitle);
  assert.equal($('meta[name="description"]').attr('content'), expectedDescription);
  assert.equal($('link[rel="canonical"]').attr('href'), productionUrl);
  assert.equal($('meta[name="robots"]').attr('content'), 'index,follow');
  assert.equal($('meta[property="og:title"]').attr('content'), expectedTitle);
  assert.equal($('meta[property="og:description"]').attr('content'), expectedDescription);
  assert.equal($('meta[property="og:url"]').attr('content'), productionUrl);
  assert.equal($('meta[name="twitter:title"]').attr('content'), expectedTitle);
  assert.equal($('meta[name="twitter:description"]').attr('content'), expectedDescription);
});

test('ECO page has one descriptive H1 and useful initial-HTML copy', () => {
  const $ = load(read('eco.html'));
  const intro = $('.eco-intro').text().replace(/\s+/g, ' ').trim();
  const explainer = $('.eco-explainer').text().replace(/\s+/g, ' ').trim();
  const introWords = intro.split(/\s+/).length;
  const explainerWords = explainer.split(/\s+/).length;

  assert.equal($('h1').length, 1);
  assert.equal($('h1').text().trim(), 'Chess ECO Codes Database');
  assert.match(intro, /Encyclopaedia of Chess Openings/);
  assert.match(intro, /\(ECO\)/);
  assert.ok(introWords >= 35 && introWords <= 70, `intro has ${introWords} words`);
  assert.equal($('.eco-intro a[href="/opening-database"]').text().trim(), 'Explore the CAISSA Opening Database');
  assert.equal($('#eco-explainer-title').text().trim(), 'How ECO Codes Organize Chess Openings');
  assert.ok(explainerWords >= 120 && explainerWords <= 220, `explainer has ${explainerWords} words`);
  assert.match(explainer, /A00–E99/);
  assert.match(explainer, /transposition/i);
});

test('ECO structured data and reciprocal opening-database link are valid', () => {
  const $ = load(read('eco.html'));
  const schemas = $('script[type="application/ld+json"]').toArray().map(node => JSON.parse($(node).text()));
  assert.deepEqual(schemas.map(schema => schema['@type']), ['WebPage', 'BreadcrumbList']);
  assert.equal(schemas[0].url, productionUrl);
  assert.equal(schemas[1].itemListElement.at(-1).item, productionUrl);

  const openingDatabase = load(read('opening-database.html'));
  assert.equal(openingDatabase('.openingdb-eco-reference a[href="/eco"]').length, 1);
});

test('ECO canonical is listed once and crawling remains allowed', () => {
  const sitemap = read('public/sitemap.xml');
  const escaped = productionUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  assert.equal((sitemap.match(new RegExp(`<loc>${escaped}</loc>`, 'g')) || []).length, 1);
  assert.match(read('public/robots.txt'), /User-agent:\s*\*\s*[\r\n]+Allow:\s*\//);
  assert.match(read('public/robots.txt'), /Sitemap:\s*https:\/\/www\.caissa-chess\.org\/sitemap\.xml/);
});
