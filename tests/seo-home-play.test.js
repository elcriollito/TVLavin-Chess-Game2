import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { load } from 'cheerio';

const root = path.resolve(import.meta.dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const origin = 'https://www.caissa-chess.org';

function metadata(relative) {
  const $ = load(read(relative));
  return {
    title: $('title').text(),
    description: $('meta[name="description"]').attr('content'),
    canonical: $('link[rel="canonical"]').attr('href'),
    ogTitle: $('meta[property="og:title"]').attr('content'),
    ogDescription: $('meta[property="og:description"]').attr('content'),
    ogUrl: $('meta[property="og:url"]').attr('content'),
    twitterTitle: $('meta[name="twitter:title"]').attr('content'),
    twitterDescription: $('meta[name="twitter:description"]').attr('content'),
    twitterUrl: $('meta[name="twitter:url"]').attr('content'),
    schemas: $('script[type="application/ld+json"]').toArray().map(node => JSON.parse($(node).text()))
  };
}

test('Home and Play expose distinct complete metadata in their initial HTML', () => {
  const home = metadata('home.html');
  assert.equal(home.title, 'CAISSA Chess — Play, Train, Analyze & Explore');
  assert.equal(home.canonical, `${origin}/`);
  assert.equal(home.ogUrl, `${origin}/`);
  assert.equal(home.twitterUrl, `${origin}/`);
  assert.equal(home.ogTitle, home.title);
  assert.equal(home.twitterTitle, home.title);
  assert.equal(home.ogDescription, home.description);
  assert.equal(home.twitterDescription, home.description);
  assert.equal(home.schemas[0]['@type'], 'WebSite');
  assert.equal(home.schemas[0]['@id'], `${origin}/#website`);

  const play = metadata('play-v2-public-beta.html');
  assert.equal(play.title, 'Play Chess Online | CAISSA Chess');
  assert.equal(play.canonical, `${origin}/play`);
  assert.equal(play.ogUrl, `${origin}/play`);
  assert.equal(play.twitterUrl, `${origin}/play`);
  assert.equal(play.ogTitle, play.title);
  assert.equal(play.twitterTitle, play.title);
  assert.equal(play.ogDescription, play.description);
  assert.equal(play.twitterDescription, play.description);
  assert.equal(play.schemas[0]['@type'], 'WebPage');
  assert.equal(play.schemas[0].url, `${origin}/play`);
  assert.equal(play.schemas[0].isPartOf['@id'], `${origin}/#website`);
});

test('canonical discovery files expose Home first and never publish physical aliases', () => {
  const sitemap = read('public/sitemap.xml');
  const locations = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1]);
  assert.equal(locations[0], `${origin}/`);
  assert.equal(locations.filter(value => value === `${origin}/`).length, 1);
  assert.equal(locations.filter(value => value === `${origin}/play`).length, 1);
  assert.equal(locations.some(value => /\/(?:index|home)\.html$/.test(value)), false);
  assert.equal(read('public/robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${origin}/sitemap.xml\n`);
});

test('physical Home documents permanently consolidate on the root URL', () => {
  const vercel = JSON.parse(read('vercel.json'));
  for (const source of ['/index.html', '/home.html']) {
    assert.deepEqual(vercel.redirects.find(rule => rule.source === source), {
      source,
      destination: '/',
      permanent: true
    });
  }
});

test('shared navigation treats root as Home and Play as a separate destination', () => {
  const generatedPlay = load(read('play-v2-public-beta.html'));
  assert.equal(generatedPlay('a.nav-logo[href="/"]').length, 1);
  assert.equal(generatedPlay('a.nav-logo[href="/play"]').length, 0);
  assert.equal(generatedPlay('a[data-nav-key="home"][href="/"]').length, 1);
  assert.equal(generatedPlay('a[data-nav-key="play"][href="/play"]').length, 1);
});
