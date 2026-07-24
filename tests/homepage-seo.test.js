import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { load } from 'cheerio';

const root = path.resolve(import.meta.dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const expectedTitle = 'CAISSA Chess – Play Online, Stockfish Analysis & Training';
const canonical = 'https://www.caissa-chess.org/';
const sections = [
  'play', 'fics', 'history', 'dosChess', 'insights', 'help', 'spectator',
  'library', 'settings', 'cheater-insight', 'academy', 'arena', 'analyze',
  'mentor', 'yahooClassic'
];

test('homepage search and social titles are concise and aligned', () => {
  const $ = load(read('index.html'));

  assert.equal($('title').length, 1);
  assert.equal($('title').text(), expectedTitle);
  assert.ok(expectedTitle.length >= 50 && expectedTitle.length < 70);
  assert.equal($('meta[name="title"]').attr('content'), expectedTitle);
  assert.equal($('meta[property="og:title"]').attr('content'), expectedTitle);
  assert.equal($('meta[name="twitter:title"]').attr('content'), expectedTitle);
  assert.equal($('link[rel="canonical"]').attr('href'), canonical);
  assert.equal($('meta[property="og:url"]').attr('content'), canonical);
  assert.equal($('meta[name="twitter:url"]').attr('content'), canonical);
  assert.equal($('meta[name="robots"]').attr('content'), 'index, follow');
});

test('homepage structured data parses and retains the canonical application identity', () => {
  const $ = load(read('index.html'));
  const schemas = $('script[type="application/ld+json"]').toArray()
    .map(node => JSON.parse($(node).text()));

  assert.deepEqual(schemas.map(schema => schema['@type']), ['WebApplication', 'Organization']);
  assert.equal(schemas[0].name, 'CAISSA Chess');
  assert.equal(schemas[0].url, canonical);
});

test('application-state parameter URLs stay out of the sitemap', () => {
  const sitemap = read('public/sitemap.xml');

  for (const section of sections) {
    assert.ok(!sitemap.includes(`?section=${section}`), `sitemap exposes ${section}`);
  }
  assert.ok(!sitemap.includes('<loc>https://www.caissa-chess.org/?'), 'sitemap exposes a homepage query URL');
});

test('revised homepage title is unique across repository HTML', () => {
  const htmlFiles = [];
  const walk = directory => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(absolute);
      else if (entry.name.endsWith('.html')) htmlFiles.push(absolute);
    }
  };
  walk(root);

  const matches = htmlFiles.filter(file => load(fs.readFileSync(file, 'utf8'))('title').text() === expectedTitle);
  assert.deepEqual(matches.map(file => path.relative(root, file)), ['index.html']);
});
