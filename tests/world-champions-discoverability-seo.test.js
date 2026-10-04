import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { load } from 'cheerio';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const origin = 'https://www.caissa-chess.org';
const archiveUrl = `${origin}/game-library/champions`;
const title = 'World Chess Champions Archive | CAISSA Chess';
const description = 'Explore the history of the World Chess Championship, from Steinitz to Gukesh, with title reigns, championship matches, game replays and PGN collections.';
const championNames = [
  'Wilhelm Steinitz', 'Emanuel Lasker', 'José Raúl Capablanca', 'Alexander Alekhine',
  'Max Euwe', 'Mikhail Botvinnik', 'Vasily Smyslov', 'Mikhail Tal',
  'Tigran Petrosian', 'Boris Spassky', 'Bobby Fischer', 'Anatoly Karpov',
  'Garry Kasparov', 'Vladimir Kramnik', 'Viswanathan Anand', 'Magnus Carlsen',
  'Ding Liren', 'Gukesh Dommaraju'
];

function navigation() {
  const window = {};
  vm.runInNewContext(read('js/caissa-primary-navigation.js'), {
    window,
    document: { querySelectorAll: () => [] }
  });
  return window.CaissaPrimaryNavigation;
}

test('World Champions ships complete canonical social metadata and one indexable H1', () => {
  const $ = load(read('game-library-champions.html'));
  assert.equal($('title').text(), title);
  assert.equal($('meta[name="description"]').attr('content'), description);
  assert.equal($('meta[name="robots"]').attr('content'), 'index, follow');
  assert.equal($('link[rel="canonical"]').length, 1);
  assert.equal($('link[rel="canonical"]').attr('href'), archiveUrl);
  assert.equal($('meta[property="og:title"]').attr('content'), title);
  assert.equal($('meta[property="og:description"]').attr('content'), description);
  assert.equal($('meta[property="og:url"]').attr('content'), archiveUrl);
  assert.equal($('meta[name="twitter:card"]').attr('content'), 'summary_large_image');
  assert.equal($('meta[name="twitter:title"]').attr('content'), title);
  assert.equal($('meta[name="twitter:description"]').attr('content'), description);
  assert.equal($('meta[name="twitter:url"]').attr('content'), archiveUrl);
  assert.equal($('h1').length, 1);
  assert.match($('.archive-deck').text(), /Wilhelm Steinitz.*Gukesh Dommaraju/);
});

test('CollectionPage and breadcrumb structured data are factual and internally linked', () => {
  const $ = load(read('game-library-champions.html'));
  const scripts = $('script[type="application/ld+json"]').toArray().map(node => JSON.parse($(node).text()));
  assert.equal(scripts.length, 1);
  const graph = scripts[0]['@graph'];
  const collection = graph.find(item => item['@type'] === 'CollectionPage');
  const breadcrumb = graph.find(item => item['@type'] === 'BreadcrumbList');
  assert.equal(collection.name, 'World Chess Champions Archive');
  assert.equal(collection.description, description);
  assert.equal(collection.url, archiveUrl);
  assert.equal(collection.isPartOf['@id'], `${origin}/#website`);
  assert.equal(collection.breadcrumb['@id'], `${archiveUrl}#breadcrumb`);
  assert.deepEqual(breadcrumb.itemListElement.map(item => item.item), [
    `${origin}/`, archiveUrl
  ]);
  assert.equal(JSON.stringify(scripts).includes('birthDate'), false);
  assert.equal(JSON.stringify(scripts).includes('Person'), false);
});

test('all 18 champions and major reign context exist in initial crawlable HTML', () => {
  const $ = load(read('game-library-champions.html'));
  const entries = $('.sr-only[aria-label="World Chess Champions covered by this archive"] li');
  assert.equal(entries.length, 18);
  const copy = entries.text();
  for (const name of championNames) assert.match(copy, new RegExp(name));
  assert.match(copy, /1886–1894/);
  assert.match(copy, /1993/);
  assert.match(copy, /2024–present/);
});

test('public navigation replaces legacy Game Library with one active World Champions destination', () => {
  const api = navigation();
  const ids = Array.from(api.inventory.primary, item => item.id);
  assert.equal(ids.includes('library'), false);
  assert.equal(ids.filter(id => id === 'world-champions').length, 1);
  const championsIndex = ids.indexOf('world-champions');
  assert.equal(api.inventory.primary[championsIndex].route, '/game-library/champions');
  assert.equal(api.inventory.primary[championsIndex].label, 'World Champions');
  assert.equal(api.inventory.primary[championsIndex - 1].id, 'eco');
  assert.equal(api.inventory.primary[championsIndex + 1].id, 'history');
  const archive = load(read('game-library-champions.html'));
  assert.equal(archive('[data-caissa-standalone-sidebar][data-active="world-champions"]').length, 1);
  assert.equal(archive('a[href="/game-library"]').length, 0);
});

test('Home promotes World Champions and has no visible legacy Game Library destination', () => {
  const $ = load(read('home.html'));
  const card = $('a.wide-card[href="/game-library/champions"]');
  assert.equal(card.length, 1);
  assert.equal(card.find('h3').text().trim(), 'World Champions');
  assert.equal(card.find('p').text().trim(), 'Explore champions, title reigns, championship matches and historic PGN collections.');
  assert.equal($('a[href="/game-library"]').length, 0);
});

test('legacy Library stays functional but noindex and outside navigation and sitemap', () => {
  const library = load(read('game-library.html'));
  const vercel = JSON.parse(read('vercel.json'));
  const api = navigation();
  assert.equal(library('meta[name="robots"]').attr('content'), 'noindex, follow');
  assert.equal(library('#libraryPanel[data-game-library-workspace]').length, 1);
  assert.ok(vercel.rewrites.some(rule => rule.source === '/game-library' && rule.destination === '/game-library.html'));
  assert.equal(api.inventory.primary.some(item => item.route === '/game-library'), false);
  assert.equal(read('public/sitemap.xml').includes(`<loc>${origin}/game-library</loc>`), false);
});

test('sitemap publishes only the archive while replay remains noindex and undiscoverable', () => {
  const sitemap = read('public/sitemap.xml');
  assert.equal((sitemap.match(new RegExp(`<loc>${archiveUrl}<\\/loc>`, 'g')) || []).length, 1);
  assert.equal(sitemap.includes('/game-library/champions/replay'), false);
  const replay = load(read('championship-replay.html'));
  assert.match(replay('meta[name="robots"]').attr('content'), /(?:^|,\s*)noindex(?:,|$)/);
  assert.equal(replay('link[rel="canonical"]').length, 0);
  assert.equal(navigation().inventory.primary.some(item => item.route === '/game-library/champions/replay'), false);
  assert.equal(load(read('home.html'))('a[href="/game-library/champions/replay"]').length, 0);
});
