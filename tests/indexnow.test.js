import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  createPayload,
  KEY_FILE,
  mapChangedFileToUrl,
  normalizeCanonicalUrl,
  parseChangedPaths,
  parseArgs,
  PRODUCTION_HOST,
  PRODUCTION_ORIGIN,
  readKey,
  submitIndexNow,
  uniqueCanonicalUrls
} from '../scripts/submit-indexnow.mjs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const key = readKey();
const canonical = `${PRODUCTION_ORIGIN}/yahoo-classic`;

function response(status, body = '', headers = {}) {
  return {
    status,
    ok: status >= 200 && status < 300,
    text: async () => body,
    headers: { get: name => headers[name.toLowerCase()] || null }
  };
}

function liveFetchForStatus(status) {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (calls.length === 1) return response(200, key);
    if (calls.length === 2) return response(200);
    return response(status, '', status === 429 ? { 'retry-after': '120' } : {});
  };
  return { calls, fetchImpl };
}

test('existing public key file is exact, valid and conventionally named', () => {
  assert.equal(KEY_FILE, `public/${key}.txt`);
  assert.match(key, /^[A-Za-z0-9-]{8,128}$/);
  assert.equal(Buffer.from(read(KEY_FILE)).includes(0xef), false);
  assert.equal(read(KEY_FILE), key);
});

test('robots is minimal and retains the canonical sitemap directive', () => {
  const robots = read('public/robots.txt');
  assert.equal(robots, `User-agent: *\nAllow: /\n\nSitemap: ${PRODUCTION_ORIGIN}/sitemap.xml\n`);
  assert.doesNotMatch(robots, /IndexNow|key file|Crawl-delay/i);
});

test('Vercel exposes the key at its conventional root URL', () => {
  const config = JSON.parse(read('vercel.json'));
  assert.ok(config.rewrites.some(rule =>
    rule.source === `/${key}.txt` && rule.destination === `/${KEY_FILE}`
  ));
  assert.match(read('server.js'), /'\.txt': 'text\/plain; charset=utf-8'/);
});

test('canonical URL normalization deduplicates and removes trailing slashes', () => {
  assert.deepEqual(uniqueCanonicalUrls([
    canonical,
    `${canonical}/`,
    '/eco/',
    `${PRODUCTION_ORIGIN}/eco`
  ]), [canonical, `${PRODUCTION_ORIGIN}/eco`]);
});

test('non-production, preview, query, fragment and non-page URLs are rejected', () => {
  for (const value of [
    'http://www.caissa-chess.org/eco',
    'https://caissa-chess.org/eco',
    'https://example.com/eco',
    'https://project.vercel.app/eco',
    `${canonical}?section=play`,
    `${canonical}#lobby`,
    `${PRODUCTION_ORIGIN}/api/wallet`,
    `${PRODUCTION_ORIGIN}/signin`,
    `${PRODUCTION_ORIGIN}/assets/example.webp`,
    `${PRODUCTION_ORIGIN}/sitemap.xml`
  ]) assert.throws(() => normalizeCanonicalUrl(value), value);
});

test('route mapping covers standalone pages and generated blog articles', () => {
  assert.equal(mapChangedFileToUrl('index.html'), '/');
  assert.equal(mapChangedFileToUrl('polyglot.html'), '/tools/polyglot');
  assert.equal(mapChangedFileToUrl('opening-database.html'), '/opening-database');
  assert.equal(mapChangedFileToUrl('blog/example-article/index.html'), '/blog/example-article');
  assert.equal(mapChangedFileToUrl('public/sitemap.xml'), null);
  assert.equal(mapChangedFileToUrl('css/blog.css'), null);
});

test('Git change parsing includes added, modified, removed and renamed paths', () => {
  const output = [
    'A', 'eco.html',
    'M', 'index.html',
    'D', 'blog/removed-article/index.html',
    'R100', 'about.html', 'help.html',
    ''
  ].join('\0');
  assert.deepEqual(parseChangedPaths(output), [
    'eco.html',
    'index.html',
    'blog/removed-article/index.html',
    'about.html',
    'help.html'
  ]);
});

test('batch payload uses the production host, matching key location and unique URLs', () => {
  const payload = createPayload([canonical, `${canonical}/`], key);
  assert.deepEqual(payload, {
    host: PRODUCTION_HOST,
    key,
    keyLocation: `${PRODUCTION_ORIGIN}/${key}.txt`,
    urlList: [canonical]
  });
});

test('CLI requires an explicit URL or Git comparison', () => {
  assert.throws(() => parseArgs([]), /--url or --from-git/);
  assert.deepEqual(parseArgs(['--dry-run', '--url', canonical]), {
    dryRun: true,
    urls: [canonical],
    base: null,
    to: 'HEAD'
  });
  assert.deepEqual(parseArgs(['--from-git', 'origin/main', '--to', 'HEAD']), {
    dryRun: false,
    urls: [],
    base: 'origin/main',
    to: 'HEAD'
  });
});

test('dry run performs no network requests and redacts the key', async () => {
  let calls = 0;
  const logs = [];
  const result = await submitIndexNow({
    urls: [canonical],
    dryRun: true,
    key,
    fetchImpl: async () => { calls += 1; },
    log: value => logs.push(value)
  });
  assert.equal(result.ok, true);
  assert.equal(calls, 0);
  assert.ok(logs.includes('Key: [redacted]'));
  assert.equal(logs.join('\n').includes(key), false);
});

for (const status of [200, 202]) {
  test(`HTTP ${status} is accepted after production verification`, async () => {
    const { calls, fetchImpl } = liveFetchForStatus(status);
    const result = await submitIndexNow({ urls: [canonical], key, fetchImpl, log: () => {} });
    assert.equal(result.ok, true);
    assert.equal(result.status, status);
    assert.equal(calls.length, 3);
    const payload = JSON.parse(calls[2].options.body);
    assert.deepEqual(payload.urlList, [canonical]);
  });
}

for (const status of [400, 403, 422, 429, 500]) {
  test(`HTTP ${status} fails clearly without exposing the key`, async () => {
    const { fetchImpl } = liveFetchForStatus(status);
    const errors = [];
    const result = await submitIndexNow({
      urls: [canonical],
      key,
      fetchImpl,
      log: () => {},
      errorLog: value => errors.push(value)
    });
    assert.equal(result.ok, false);
    assert.equal(result.status, status);
    assert.equal(errors.join('\n').includes(key), false);
  });
}

test('key verification mismatch aborts before submission', async () => {
  let calls = 0;
  const result = await submitIndexNow({
    urls: [canonical],
    key,
    fetchImpl: async () => {
      calls += 1;
      return response(200, 'wrong-key');
    },
    log: () => {},
    errorLog: () => {}
  });
  assert.equal(result.ok, false);
  assert.equal(calls, 1);
});

test('timeouts fail without leaking the key', async () => {
  const errors = [];
  const result = await submitIndexNow({
    urls: [canonical],
    key,
    fetchImpl: async () => {
      const error = new Error(`timeout involving ${key}`);
      error.name = 'TimeoutError';
      throw error;
    },
    log: () => {},
    errorLog: value => errors.push(value)
  });
  assert.equal(result.ok, false);
  assert.equal(errors.join('\n').includes(key), false);
  assert.match(errors[0], /timed out/);
});
