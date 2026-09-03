import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const write = (relative, value) => fs.writeFileSync(path.join(root, relative), value);
const registry = JSON.parse(read('data/blog-articles.json'));
const schema = JSON.parse(read('data/blog-article.schema.json'));
const origin = 'https://www.caissa-chess.org';
const published = registry.articles.filter(article => article.status === 'published');
const escape = value => String(value).replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[character]));
const renderInline = value => {
  const source = String(value);
  const linkPattern = /\[([^\]]+)\]\((\/(?:[a-z0-9][a-z0-9/-]*)?)\)/gi;
  let output = '';
  let cursor = 0;
  for (const match of source.matchAll(linkPattern)) {
    output += escape(source.slice(cursor, match.index));
    output += `<a href="${escape(match[2])}">${escape(match[1])}</a>`;
    cursor = match.index + match[0].length;
  }
  return output + escape(source.slice(cursor));
};
const isoDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
const displayDate = value => new Intl.DateTimeFormat('en-US', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`));

function validate() {
  const slugs = new Set();
  for (const article of registry.articles) {
    for (const field of schema.required) {
      if (!Object.hasOwn(article, field)) throw new Error(`${article.slug || 'Article'} lacks required field: ${field}`);
    }
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(article.slug)) throw new Error(`Invalid slug: ${article.slug}`);
    if (slugs.has(article.slug)) throw new Error(`Duplicate slug: ${article.slug}`);
    if (article.author !== 'CAISSA Chess Editorial') throw new Error(`Invalid author: ${article.slug}`);
    if (!isoDate(article.publishedDate) || article.modifiedDate && !isoDate(article.modifiedDate)) throw new Error(`Invalid date: ${article.slug}`);
    if (!Array.isArray(article.body) || article.body.length < 3) throw new Error(`Article body is too thin: ${article.slug}`);
    if (!article.body.some(section => section.subheading)) throw new Error(`Article needs at least one H3: ${article.slug}`);
    if (!article.featuredImage.startsWith('/') || !article.relatedCaissaRoute.startsWith('/')) throw new Error(`Routes must be site-relative: ${article.slug}`);
    if (!Number.isInteger(article.featuredImageWidth) || !Number.isInteger(article.featuredImageHeight)) throw new Error(`Image dimensions are required: ${article.slug}`);
  }
}

function articleCard(article, featured = false) {
  return `<article class="blog-card${featured ? ' blog-card-featured' : ''}">
    <img src="${escape(article.featuredImage)}" alt="${escape(article.featuredImageAlt)}" width="${article.featuredImageWidth}" height="${article.featuredImageHeight}" loading="${featured ? 'eager' : 'lazy'}" decoding="async">
    <div class="blog-card-copy">
      <p class="blog-card-meta"><span>${escape(article.category)}</span> · <time datetime="${article.publishedDate}">${displayDate(article.publishedDate)}</time></p>
      <h3><a href="/blog/${article.slug}">${escape(article.title)}</a></h3>
      <p>${escape(article.excerpt)}</p>
    </div>
  </article>`;
}

function renderIndex() {
  let html = read('blog/index.html');
  const featured = published[0]
    ? articleCard(published[0], true)
    : `<div class="blog-empty"><i class="fas fa-feather-pointed" aria-hidden="true"></i><h3>Editorial stories are on the way</h3><p>We are preparing original, carefully reviewed articles. Until then, explore the chess tools already available on CAISSA.</p></div>`;
  const recentArticles = published.slice(1);
  const recent = recentArticles.length
    ? `<div class="blog-grid">${recentArticles.map(article => articleCard(article)).join('')}</div>`
    : '<p class="blog-empty-inline">No articles have been published yet.</p>';
  html = html.replace(/<!-- BLOG_FEATURED_START -->[\s\S]*?<!-- BLOG_FEATURED_END -->/, `<!-- BLOG_FEATURED_START -->\n${featured}\n        <!-- BLOG_FEATURED_END -->`);
  html = html.replace(/<!-- BLOG_RECENT_START -->[\s\S]*?<!-- BLOG_RECENT_END -->/, `<!-- BLOG_RECENT_START -->\n${recent}\n        <!-- BLOG_RECENT_END -->`);
  write('blog/index.html', html);
}

function renderArticle(article) {
  const canonical = `${origin}/blog/${article.slug}`;
  const related = article.relatedArticleSlugs.map(slug => published.find(candidate => candidate.slug === slug)).filter(Boolean);
  const introduction = (article.introduction || []).map(paragraph => `<p>${renderInline(paragraph)}</p>`).join('');
  const sections = article.body.map(section => {
    const orderedList = section.orderedList?.length
      ? `<ol>${section.orderedList.map(item => `<li>${renderInline(item)}</li>`).join('')}</ol>`
      : '';
    return `<section><h2>${escape(section.heading)}</h2>${section.subheading ? `<h3>${escape(section.subheading)}</h3>` : ''}${section.paragraphs.map(paragraph => `<p>${renderInline(paragraph)}</p>`).join('')}${orderedList}</section>`;
  }).join('');
  const modified = article.modifiedDate
    ? `<span>Last updated <time datetime="${article.modifiedDate}">${displayDate(article.modifiedDate)}</time></span>` : '';
  const relatedHtml = related.length ? `<section class="blog-related"><h2>Related articles</h2><ul>${related.map(item => `<li><a href="/blog/${item.slug}">${escape(item.title)}</a></li>`).join('')}</ul></section>` : '';
  const jsonLd = {
    '@context': 'https://schema.org', '@type': 'BlogPosting', headline: article.title,
    description: article.description, image: `${origin}${article.featuredImage}`, datePublished: article.publishedDate,
    dateModified: article.modifiedDate || article.publishedDate, mainEntityOfPage: canonical,
    articleSection: article.category, keywords: article.tags.join(', '),
    author: { '@type': 'Organization', name: article.author },
    publisher: { '@type': 'Organization', name: 'CAISSA Chess', url: `${origin}/` }
  };
  const breadcrumbs = {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'CAISSA Chess', item: `${origin}/` },
      { '@type': 'ListItem', position: 2, name: 'Blog', item: `${origin}/blog` },
      { '@type': 'ListItem', position: 3, name: article.title, item: canonical }
    ]
  };
  const cta = article.ctaHeading && article.ctaText && article.ctaLabel
    ? `<aside class="blog-cta"><h2>${escape(article.ctaHeading)}</h2><p>${renderInline(article.ctaText)}</p><a class="blog-cta-button" href="${escape(article.relatedCaissaRoute)}">${escape(article.ctaLabel)}</a></aside>`
    : `<aside class="blog-cta"><h2>Continue with CAISSA Chess</h2><p>Learn more <a href="${escape(article.relatedCaissaRoute)}">about CAISSA Chess</a>, or put your own ideas into practice over the board.</p><a class="blog-cta-button" href="${origin}/">Explore CAISSA Chess</a></aside>`;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escape(article.seoTitle)}</title><meta name="description" content="${escape(article.description)}"><meta name="author" content="${escape(article.author)}"><meta name="robots" content="index, follow"><link rel="canonical" href="${canonical}">
  <meta property="og:type" content="article"><meta property="og:url" content="${canonical}"><meta property="og:title" content="${escape(article.title)}"><meta property="og:description" content="${escape(article.description)}"><meta property="og:image" content="${origin}${escape(article.featuredImage)}"><meta property="og:image:alt" content="${escape(article.featuredImageAlt)}">
  <meta property="article:published_time" content="${article.publishedDate}"><meta property="article:modified_time" content="${article.modifiedDate || article.publishedDate}"><meta property="article:section" content="${escape(article.category)}">${article.tags.map(tag => `<meta property="article:tag" content="${escape(tag)}">`).join('')}
  <meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${escape(article.title)}"><meta name="twitter:description" content="${escape(article.description)}"><meta name="twitter:image" content="${origin}${escape(article.featuredImage)}">
  <link rel="icon" href="/favicon.ico"><link rel="stylesheet" href="/styles.css?v=2.0.16"><link rel="stylesheet" href="/css/caissa-standalone-sidebar.css?v=1.0.1"><link rel="stylesheet" href="/css/blog.css?v=1.0.0"><link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" crossorigin="anonymous" referrerpolicy="no-referrer">
  <script type="application/ld+json">${JSON.stringify(jsonLd)}</script><script type="application/ld+json">${JSON.stringify(breadcrumbs)}</script><script src="/js/caissa-vercel-analytics.js?v=1.0.0" defer></script></head>
  <body><div class="caissa-standalone-layout"><div data-caissa-standalone-sidebar data-active="blog"></div><main class="blog-shell blog-article-shell">
  <nav class="blog-breadcrumbs" aria-label="Breadcrumb"><ol><li><a href="/">CAISSA Chess</a></li><li><a href="/blog">Blog</a></li><li aria-current="page">${escape(article.title)}</li></ol></nav>
  <article><header class="blog-article-header"><p class="blog-kicker">${escape(article.category)}</p><h1>${escape(article.title)}</h1><p class="blog-deck">${escape(article.excerpt)}</p><div class="blog-byline"><span>By ${escape(article.author)}</span><span>Published <time datetime="${article.publishedDate}">${displayDate(article.publishedDate)}</time></span>${modified}</div><img src="${escape(article.featuredImage)}" alt="${escape(article.featuredImageAlt)}" width="${article.featuredImageWidth}" height="${article.featuredImageHeight}" decoding="async"></header>
  <div class="blog-prose">${introduction}${sections}${cta}${relatedHtml}</div></article>
  <footer class="blog-footer"><p>&copy; 2026 CAISSA Chess.</p><p><a href="/blog">Back to the blog</a></p></footer></main></div><script src="/js/caissa-i18n.js?v=1.0.0"></script><script src="/js/caissa-primary-navigation.js?v=1.0.2"></script><script src="/js/caissa-standalone-sidebar.js?v=1.1.0"></script></body></html>`;
  const directory = path.join(root, 'blog', article.slug);
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, 'index.html'), html);
}

function updateSitemap() {
  let xml = read('public/sitemap.xml').replace(/\n?\s*<!-- BLOG_ARTICLES_START -->[\s\S]*?<!-- BLOG_ARTICLES_END -->/g, '');
  const entries = published.map(article => `  <url><loc>${origin}/blog/${article.slug}</loc><lastmod>${article.modifiedDate || article.publishedDate}</lastmod><changefreq>monthly</changefreq><priority>0.6</priority></url>`).join('\n');
  xml = xml.replace('</urlset>', `  <!-- BLOG_ARTICLES_START -->\n${entries}\n  <!-- BLOG_ARTICLES_END -->\n</urlset>`);
  write('public/sitemap.xml', xml);
}

validate();
renderIndex();
for (const article of published) renderArticle(article);
updateSitemap();
console.log(`Built CAISSA blog with ${published.length} published article(s).`);
