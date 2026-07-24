import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { load } from 'cheerio';
import sharp from 'sharp';

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
  const inventory = read('js/caissa-primary-navigation.js');
  for (const expected of ['/blog', 'https://www.facebook.com/CaissaChessOrg/', 'https://www.youtube.com/@CaissaChessOrg']) {
    assert.ok(inventory.includes(expected), `canonical navigation is missing ${expected}`);
  }
  for (const file of ['index.html', 'js/caissa-standalone-sidebar.js', 'endgame-trainer.html']) {
    const source = read(file);
    assert.ok(
      source.includes('caissa-primary-navigation') || source.includes('CaissaPrimaryNavigation'),
      `${file} does not consume canonical navigation`
    );
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

test('Polyglot guide has complete metadata, education, links and safe claims', async () => {
  const slug = 'what-is-a-polyglot-opening-book';
  const article = registry.articles.find(item => item.slug === slug);
  assert.ok(article, 'Polyglot article is missing from registry');
  assert.equal(article.status, 'published');
  assert.equal(article.title, 'What Is a Polyglot Opening Book and How Do Chess Engines Use It?');
  assert.equal(article.seoTitle, 'Polyglot Opening Books: How Chess Engines Use BIN Files');
  assert.equal(article.description, 'Learn how Polyglot BIN opening books store positions, moves and weights, how compatible chess engines use them, and how to create one from PGN files.');

  const $ = load(read(`blog/${slug}/index.html`));
  const canonical = `${production}/blog/${slug}`;
  const headings = $('.blog-prose > section:not(.blog-related) > h2').toArray().map(node => $(node).text().trim());
  const requiredHeadings = [
    'What Is a Chess Engine Opening Book?',
    'What Makes a Polyglot Opening Book Different?',
    'What Is Stored Inside a Polyglot BIN File?',
    'How Chess Engines Use Book Moves',
    'What Do Opening Book Weights Mean?',
    'PGN vs Polyglot BIN',
    'How to Create a Polyglot Opening Book from PGN',
    'How Source Games Affect Book Quality',
    'Compatibility and Testing',
    'Create a Polyglot Opening Book with CAISSA'
  ];
  assert.equal($('h1').text().trim(), article.title);
  assert.deepEqual(headings, requiredHeadings);
  assert.equal($('link[rel="canonical"]').attr('href'), canonical);
  for (const href of ['/tools/polyglot', '/opening-database', '/eco', '/blog']) {
    assert.ok($(`a[href="${href}"]`).length >= 1, `missing crawlable link to ${href}`);
  }
  assert.equal($('.blog-cta-button[href="/tools/polyglot"]').text().trim(), 'Create a Polyglot Opening Book');

  const visible = $('body').text().replace(/\s+/g, ' ').trim();
  assert.doesNotMatch(visible, /every chess engine supports Polyglot|PGN and BIN are universally interchangeable|weights? guarantee the best move|processing is browser-only|generated books? (?:are|is) automatically tournament-ready|Polyglot is a chess engine/i);
  assert.match(visible, /does not replace analysis/i);
  assert.match(visible, /frequency reflects the source collection/i);
  assert.match(visible, /where assistance is permitted/i);

  const structured = $('script[type="application/ld+json"]').toArray().map(node => JSON.parse($(node).text()));
  const posting = structured.find(item => item['@type'] === 'BlogPosting');
  const breadcrumbs = structured.find(item => item['@type'] === 'BreadcrumbList');
  assert.equal(posting.headline, article.title);
  assert.equal(posting.description, article.description);
  assert.equal(posting.image, `${production}${article.featuredImage}`);
  assert.equal(posting.mainEntityOfPage, canonical);
  assert.equal(posting.articleSection, article.category);
  assert.match(posting.keywords, /Polyglot/);
  assert.equal(breadcrumbs.itemListElement.at(-1).item, canonical);

  const image = await sharp(path.join(root, article.featuredImage)).metadata();
  assert.equal(image.format, 'webp');
  assert.equal(image.width, article.featuredImageWidth);
  assert.equal(image.height, article.featuredImageHeight);
});

test('Polyglot guide is unique in sitemap, featured once and reciprocally linked', () => {
  const slug = 'what-is-a-polyglot-opening-book';
  const canonical = `${production}/blog/${slug}`;
  assert.equal((sitemap.match(new RegExp(`<loc>${canonical}</loc>`, 'g')) || []).length, 1);
  assert.ok(!sitemap.includes(`<loc>${canonical}/</loc>`));

  const index = load(read('blog/index.html'));
  assert.equal(index(`a[href="/blog/${slug}"]`).length, 1);
  assert.equal(index(`a[href="/blog/${slug}"]`).length, 1);
  assert.equal(index(`.blog-grid a[href="/blog/${slug}"]`).length, 1);
  assert.equal(index('a[href="/blog/who-is-caissa-goddess-of-chess"]').length, 1);

  const tool = load(read('polyglot.html'));
  assert.equal(tool(`a[href="/blog/${slug}"]`).length, 1);
  assert.match(tool(`a[href="/blog/${slug}"]`).text(), /Learn how Polyglot opening books work/);
});

test('Yahoo Chess history article has approved metadata, disclaimer and structure', async () => {
  const slug = 'yahoo-chess-spirit-caissa-classic';
  const article = registry.articles.find(item => item.slug === slug);
  assert.ok(article, 'Yahoo Chess history article is missing from registry');
  assert.equal(article.status, 'published');
  assert.equal(article.seoTitle, 'Yahoo Chess Alternative: Rediscover Classic Chess Rooms');
  assert.equal(article.description, "Remember Yahoo Chess rooms and see how independent CAISSA Classic brings social lobbies, visible tables and a retro chess atmosphere to today's players.");

  const $ = load(read(`blog/${slug}/index.html`));
  const canonical = `${production}/blog/${slug}`;
  const headings = $('.blog-prose > section:not(.blog-related) > h2').toArray().map(node => $(node).text().trim());
  assert.equal($('h1').text().trim(), 'The Spirit of Yahoo Chess Lives Again in CAISSA Classic');
  assert.deepEqual(headings, [
    'Why Yahoo Chess Meant More Than a Chessboard',
    'What Happened to Yahoo Chess?',
    'What Modern Chess Platforms Gained—and Lost',
    'Why Players Still Search for a Yahoo Chess Alternative',
    'What Is CAISSA Classic?',
    'Inside the CAISSA Classic Lobby',
    'A Familiar Feeling, Not a Copy',
    'Who Is CAISSA Classic For?',
    'How to Enter CAISSA Classic',
    'Preserving the Human Side of Online Chess',
    'Enter CAISSA Classic'
  ]);
  assert.equal($('link[rel="canonical"]').attr('href'), canonical);
  assert.equal($('.blog-cta-button[href="/yahoo-classic"]').text().trim(), 'Enter CAISSA Classic');

  const visible = $('body').text().replace(/\s+/g, ' ').trim();
  assert.match(visible, /CAISSA Chess is an independent project/);
  assert.match(visible, /not affiliated with, endorsed by, sponsored by, or an official successor to Yahoo or Yahoo Chess/);
  assert.match(visible, /names belong to their respective rights holders/);
  assert.doesNotMatch(visible, /official Yahoo Chess return|Yahoo Chess is back|CAISSA (?:Classic|Chess) is (?:an )?authorized successor|CAISSA (?:Classic|Chess) is (?:an )?exact Yahoo Chess clone|CAISSA (?:Classic|Chess) is the new Yahoo Chess|officially restored Yahoo rooms|CAISSA (?:Classic|Chess) is endorsed by Yahoo|replacement owned by Yahoo/i);
  assert.doesNotMatch(visible, /Yahoo logo/i);
  assert.equal($('.blog-prose a[href="/"]').text().trim(), 'CAISSA Chess homepage');
  assert.doesNotMatch($('.blog-prose').text(), /\[[^\]]+\]\([^)]+\)/);

  const publicImageReferences = [
    article.featuredImage,
    $('meta[property="og:image"]').attr('content'),
    $('meta[name="twitter:image"]').attr('content')
  ].join(' ');
  assert.doesNotMatch(publicImageReferences, /yahoo|logo/i);

  const structured = $('script[type="application/ld+json"]').toArray().map(node => JSON.parse($(node).text()));
  const posting = structured.find(item => item['@type'] === 'BlogPosting');
  const breadcrumbs = structured.find(item => item['@type'] === 'BreadcrumbList');
  assert.equal(posting.headline, article.title);
  assert.equal(posting.description, article.description);
  assert.equal(posting.mainEntityOfPage, canonical);
  assert.equal(posting.image, `${production}${article.featuredImage}`);
  assert.equal(posting.articleSection, 'Online Chess History');
  assert.match(posting.keywords, /Yahoo Chess/);
  assert.equal(breadcrumbs.itemListElement.at(-1).item, canonical);

  const image = await sharp(path.join(root, article.featuredImage)).metadata();
  assert.equal(image.format, 'webp');
  assert.equal(image.width, 1440);
  assert.equal(image.height, 960);
});

test('Yahoo Chess article is uniquely featured, indexed and reciprocally linked', () => {
  const slug = 'yahoo-chess-spirit-caissa-classic';
  const canonical = `${production}/blog/${slug}`;
  assert.equal((sitemap.match(new RegExp(`<loc>${canonical}</loc>`, 'g')) || []).length, 1);
  assert.ok(!sitemap.includes(`<loc>${canonical}/</loc>`));

  const index = load(read('blog/index.html'));
  assert.equal(index(`a[href="/blog/${slug}"]`).length, 1);
  assert.equal(index('.blog-card-featured a').attr('href'), `/blog/${slug}`);
  assert.equal(index(`.blog-grid a[href="/blog/${slug}"]`).length, 0);
  assert.equal(index('a[href="/blog/what-is-a-polyglot-opening-book"]').length, 1);
  assert.equal(index('a[href="/blog/who-is-caissa-goddess-of-chess"]').length, 1);

  const shell = load(read('index.html'));
  assert.equal(shell(`a[href="/blog/${slug}"]`).length, 1);
  assert.equal(shell(`a[href="/blog/${slug}"]`).text().trim(), 'Read the story behind CAISSA Classic');
});

test('Yahoo Classic uses its dedicated standalone canonical document', () => {
  const shell = load(read('yahoo-classic.html'));
  const server = read('server.js');
  assert.equal(shell('link[rel="canonical"]').attr('href'), `${production}/yahoo-classic`);
  assert.equal(shell('meta[property="og:url"]').attr('content'), `${production}/yahoo-classic`);
  assert.ok(shell('#yahooClassicSection').text().includes('CAISSA Classic Chess'));
  assert.ok(sitemap.includes(`<loc>${production}/yahoo-classic</loc>`));
  assert.ok(!sitemap.includes('?section=yahooClassic'));
  assert.match(server, /pathname === '\/yahoo-classic'[\s\S]*filePath = '\.\/yahoo-classic\.html'/);
});
