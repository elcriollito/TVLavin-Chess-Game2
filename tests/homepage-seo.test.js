import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { load } from 'cheerio';

const root = path.resolve(import.meta.dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const expectedTitle = 'CAISSA Chess — Play, Train, Analyze & Explore';
const canonical = 'https://www.caissa-chess.org/';
const sections = [
  'play', 'fics', 'history', 'dosChess', 'insights', 'help', 'spectator',
  'library', 'settings', 'cheater-insight', 'academy', 'arena', 'analyze',
  'mentor', 'yahooClassic'
];

test('homepage search and social metadata are aligned on the Home document', () => {
  const $ = load(read('home.html'));

  assert.equal($('title').length, 1);
  assert.equal($('title').text(), expectedTitle);
  assert.ok(expectedTitle.length >= 40 && expectedTitle.length < 70);
  assert.equal($('meta[property="og:title"]').attr('content'), expectedTitle);
  assert.equal($('meta[name="twitter:title"]').attr('content'), expectedTitle);
  assert.equal($('link[rel="canonical"]').attr('href'), canonical);
  assert.equal($('meta[property="og:url"]').attr('content'), canonical);
  assert.equal($('meta[name="twitter:url"]').attr('content'), canonical);
  assert.equal($('meta[name="robots"]').attr('content'), 'index, follow');
});
test('homepage structured data parses and retains the canonical site identity', () => {
  const $ = load(read('home.html'));
  const schemas = $('script[type="application/ld+json"]').toArray()
    .map(node => JSON.parse($(node).text()));

  assert.deepEqual(schemas.map(schema => schema['@type']), ['WebSite', 'Organization']);
  assert.equal(schemas[0]['@id'], `${canonical}#website`);
  assert.equal(schemas[0].name, 'CAISSA Chess');
  assert.equal(schemas[0].url, canonical);
  assert.equal(schemas[0].publisher['@id'], `${canonical}#organization`);
  assert.equal(schemas[1]['@id'], `${canonical}#organization`);
});

test('application-state parameter URLs stay out of the sitemap', () => {
  const sitemap = read('public/sitemap.xml');

  for (const section of sections) {
    assert.ok(!sitemap.includes(`?section=${section}`), `sitemap exposes ${section}`);
  }
  assert.ok(!sitemap.includes('<loc>https://www.caissa-chess.org/?'), 'sitemap exposes a homepage query URL');
});

test('the tool shell no longer claims the Home canonical URL', () => {
  const shell = load(read('index.html'));
  assert.equal(shell('link[rel="canonical"]').length, 0);
  assert.equal(shell('meta[property="og:url"]').length, 0);
  assert.equal(shell('meta[name="twitter:url"]').length, 0);
  assert.match(read('js/legacy-canonical-section-route-policy.js'), /applyDocumentMetadata/);
});

test('revised homepage title is unique across repository HTML', () => {
  const htmlFiles = [];
  const walk = directory => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === '.vercel') continue;
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(absolute);
      else if (entry.name.endsWith('.html')) htmlFiles.push(absolute);
    }
  };
  walk(root);

  const matches = htmlFiles.filter(file => load(fs.readFileSync(file, 'utf8'))('title').text() === expectedTitle);
  assert.deepEqual(matches.map(file => path.relative(root, file)), ['home.html']);
});
