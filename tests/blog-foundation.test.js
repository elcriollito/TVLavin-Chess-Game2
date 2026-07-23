import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { load } from 'cheerio';

const root = path.resolve(import.meta.dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const registry = JSON.parse(read('data/blog-articles.json'));
const schema = JSON.parse(read('data/blog-article.schema.json'));
const sitemap = read('public/sitemap.xml');
const published = registry.articles.filter(article => article.status === 'published');
const drafts = registry.articles.filter(article => article.status !== 'published');
const required = schema.required;
const production = 'https://www.caissa-chess.org';

test('blog index has unique crawlable metadata and one H1', () => {
  const $ = load(read('blog/index.html'));
  assert.equal($('h1').length, 1);
  assert.match($('title').text(), /CAISSA Chess Blog/);
  assert.ok($('meta[name="description"]').attr('content')?.length >= 80);
  assert.equal($('link[rel="canonical"]').attr('href'), `${production}/blog`);
  assert.equal($('meta[name="robots"]').attr('content'), 'index, follow');
  assert.ok($('script[type="application/ld+json"]').length >= 2);
});

test('official navigation uses native blog and official social accounts', () => {
  for (const file of ['index.html', 'js/caissa-standalone-sidebar.js', 'endgame-trainer.html']) {
    const source = read(file);
    assert.ok(source.includes('/blog'), `${file} is missing /blog`);
    assert.ok(source.includes('https://www.facebook.com/CaissaChessOrg/'), `${file} is missing Facebook`);
    assert.ok(source.includes('https://www.youtube.com/@CaissaChessOrg'), `${file} is missing YouTube`);
    assert.ok(!source.includes('tvlavin.blogspot.com'), `${file} still exposes Blogspot in navigation`);
  }
});

test('every article satisfies the complete content model', () => {
  const slugs = new Set();
  for (const article of registry.articles) {
    for (const field of required) assert.ok(Object.hasOwn(article, field), `${article.slug || 'article'} lacks ${field}`);
    assert.match(article.slug, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    assert.ok(article.seoTitle.length >= 30 && article.seoTitle.length <= 60);
    assert.ok(article.description.length >= 80 && article.description.length <= 160);
    assert.ok(!slugs.has(article.slug), `duplicate slug: ${article.slug}`);
    slugs.add(article.slug);
    assert.equal(article.author, 'CAISSA Chess Editorial');
    assert.ok(['draft', 'published'].includes(article.status));
  }
});

test('only published articles have public pages and sitemap entries', () => {
  assert.ok(sitemap.includes(`${production}/blog`));
  for (const article of published) {
    const relative = `blog/${article.slug}/index.html`;
    assert.ok(fs.existsSync(path.join(root, relative)), `missing page for ${article.slug}`);
    assert.ok(sitemap.includes(`${production}/blog/${article.slug}`), `missing sitemap URL for ${article.slug}`);
  }
  for (const article of drafts) {
    assert.ok(!fs.existsSync(path.join(root, `blog/${article.slug}/index.html`)), `draft route exists: ${article.slug}`);
    assert.ok(!sitemap.includes(`${production}/blog/${article.slug}`), `draft appears in sitemap: ${article.slug}`);
  }
});

test('published article pages carry complete visible and structured metadata', () => {
  const seenTitles = new Set();
  const seenDescriptions = new Set();
  for (const article of published) {
    const $ = load(read(`blog/${article.slug}/index.html`));
    const title = $('title').text();
    const description = $('meta[name="description"]').attr('content');
    const canonical = $('link[rel="canonical"]').attr('href');
    assert.equal($('h1').length, 1);
    assert.equal($('article').length, 1);
    assert.ok($('.blog-byline').text().includes('Last updated'));
    assert.equal(canonical, `${production}/blog/${article.slug}`);
    assert.ok(!seenTitles.has(title), `duplicate title: ${title}`);
    assert.ok(!seenDescriptions.has(description), `duplicate description: ${description}`);
    seenTitles.add(title);
    seenDescriptions.add(description);
    assert.ok($('meta[property="og:title"]').length);
    assert.ok($('meta[name="twitter:card"]').length);
    assert.equal($('article img[width][height]').length, 1);
    assert.equal($('meta[property="article:section"]').attr('content'), article.category);
    assert.equal($('meta[property="article:tag"]').length, article.tags.length);
    const data = $('script[type="application/ld+json"]').toArray().map(node => JSON.parse($(node).html()));
    assert.ok(data.some(item => item['@type'] === 'BlogPosting'));
    assert.ok(data.some(item => item['@type'] === 'BreadcrumbList'));
  }
});
