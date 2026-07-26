#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const PRODUCTION_ORIGIN = 'https://www.caissa-chess.org';
export const PRODUCTION_HOST = 'www.caissa-chess.org';
export const INDEXNOW_ENDPOINT = 'https://api.indexnow.org/indexnow';
export const KEY_FILE = 'public/caissa-indexnow-2026.txt';
export const MAX_URLS = 10_000;

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const exactRouteFiles = new Map([
  ['index.html', '/'],
  ['about.html', '/about'],
  ['blog/index.html', '/blog'],
  ['database.html', '/database'],
  ['eco.html', '/eco'],
  ['endgame-library.html', '/endgame-library'],
  ['endgame-practice.html', '/endgame-practice'],
  ['endgame-trainer.html', '/endgame-trainer'],
  ['help.html', '/help'],
  ['opening-database.html', '/opening-database'],
  ['polyglot.html', '/tools/polyglot'],
  ['premium.html', '/premium'],
  ['yahoo-classic.html', '/yahoo-classic']
]);

export function readKey({ root = repositoryRoot } = {}) {
  const key = readFileSync(resolve(root, KEY_FILE), 'utf8');
  if (!/^[A-Za-z0-9-]{8,128}$/.test(key)) {
    throw new Error('IndexNow key file must contain exactly one valid 8–128 character key.');
  }
  return key;
}

export function normalizeCanonicalUrl(value) {
  let url;
  try {
    url = new URL(value, PRODUCTION_ORIGIN);
  } catch {
    throw new Error(`Invalid URL: ${value}`);
  }
  if (url.protocol !== 'https:' || url.host !== PRODUCTION_HOST) {
    throw new Error(`Only canonical URLs on ${PRODUCTION_ORIGIN} are allowed: ${value}`);
  }
  if (url.search || url.hash) throw new Error(`Query strings and fragments are not allowed: ${value}`);
  if (url.pathname !== '/') url.pathname = url.pathname.replace(/\/+$/, '');
  if (
    /^\/(?:api|signin|signup)(?:\/|$)/.test(url.pathname)
    || /^\/(?:assets|css|data|fonts|images|js|public)(?:\/|$)/.test(url.pathname)
    || /\.(?:css|gif|ico|jpe?g|js|json|png|svg|txt|webp|xml)$/i.test(url.pathname)
  ) throw new Error(`Non-canonical public page URL is not allowed: ${value}`);
  return url.href;
}

export function uniqueCanonicalUrls(values) {
  const urls = [...new Set(values.map(normalizeCanonicalUrl))];
  if (!urls.length) throw new Error('At least one changed canonical URL is required.');
  if (urls.length > MAX_URLS) throw new Error(`IndexNow accepts at most ${MAX_URLS} URLs per batch.`);
  return urls;
}

function git(args, { root = repositoryRoot } = {}) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' });
}

function articleMapAt(ref, options) {
  try {
    const registry = JSON.parse(git(['show', `${ref}:data/blog-articles.json`], options));
    return new Map(registry.articles
      .filter(article => article.status === 'published')
      .map(article => [article.slug, JSON.stringify(article)]));
  } catch {
    return new Map();
  }
}

export function mapChangedFileToUrl(path) {
  const normalized = path.replaceAll('\\', '/');
  if (exactRouteFiles.has(normalized)) return exactRouteFiles.get(normalized);
  const article = /^blog\/([a-z0-9]+(?:-[a-z0-9]+)*)\/index\.html$/.exec(normalized);
  return article ? `/blog/${article[1]}` : null;
}

export function parseChangedPaths(nameStatusOutput) {
  const entries = nameStatusOutput.split('\0');
  const paths = [];
  for (let index = 0; index < entries.length - 1;) {
    const status = entries[index++];
    if (!status) continue;
    if (status.startsWith('R') || status.startsWith('C')) {
      paths.push(entries[index++], entries[index++]);
    } else {
      paths.push(entries[index++]);
    }
  }
  return paths;
}

export function detectChangedCanonicalUrls(base, to = 'HEAD', options = {}) {
  if (!/^[A-Za-z0-9._~^/-]+$/.test(base) || !/^[A-Za-z0-9._~^/-]+$/.test(to)) {
    throw new Error('Git refs contain unsupported characters.');
  }
  const paths = parseChangedPaths(git(['diff', '--name-status', '-z', `${base}..${to}`], options));
  const urls = paths.map(mapChangedFileToUrl).filter(Boolean);
  if (paths.includes('data/blog-articles.json')) {
    urls.push('/blog');
    const before = articleMapAt(base, options);
    const after = articleMapAt(to, options);
    for (const slug of new Set([...before.keys(), ...after.keys()])) {
      if (before.get(slug) !== after.get(slug)) urls.push(`/blog/${slug}`);
    }
  }
  return uniqueCanonicalUrls(urls);
}

export function createPayload(urls, key) {
  return {
    host: PRODUCTION_HOST,
    key,
    keyLocation: `${PRODUCTION_ORIGIN}/${key}.txt`,
    urlList: uniqueCanonicalUrls(urls)
  };
}

export function parseArgs(args) {
  const result = { dryRun: false, urls: [], base: null, to: 'HEAD' };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--dry-run') result.dryRun = true;
    else if (arg === '--url') result.urls.push(args[++index]);
    else if (arg === '--from-git') result.base = args[++index];
    else if (arg === '--to') result.to = args[++index];
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (result.urls.some(value => !value) || result.base === undefined || !result.to) {
    throw new Error('Missing value for a command argument.');
  }
  if (!result.urls.length && !result.base) {
    throw new Error('Use --url or --from-git to select changed canonical URLs.');
  }
  return result;
}

async function verifyProduction(payload, fetchImpl, signal) {
  const keyResponse = await fetchImpl(payload.keyLocation, {
    headers: { 'User-Agent': 'CAISSA-Chess-IndexNow/1.0' },
    redirect: 'error',
    signal
  });
  if (keyResponse.status !== 200 || (await keyResponse.text()) !== payload.key) {
    throw new Error('Public IndexNow key verification failed; aborting submission.');
  }
  for (const url of payload.urlList) {
    const response = await fetchImpl(url, {
      method: 'HEAD',
      headers: { 'User-Agent': 'CAISSA-Chess-IndexNow/1.0' },
      redirect: 'manual',
      signal
    });
    if (!(response.ok || [301, 302, 307, 308, 404, 410].includes(response.status))) {
      throw new Error(`Production URL is not ready (${response.status}): ${url}`);
    }
  }
}

export async function submitIndexNow({
  urls,
  dryRun = false,
  fetchImpl = globalThis.fetch,
  key = readKey(),
  timeoutMs = 15_000,
  log = console.log,
  errorLog = console.error
}) {
  const payload = createPayload(urls, key);
  log(`IndexNow ${dryRun ? 'dry run' : 'submission'}: ${payload.urlList.length} canonical URL(s)`);
  for (const url of payload.urlList) log(`- ${url}`);
  log('Key: [redacted]');
  if (dryRun) {
    log('Dry run complete; no network requests were sent.');
    return { ok: true, dryRun: true, status: null, urls: payload.urlList };
  }

  const signal = AbortSignal.timeout(timeoutMs);
  try {
    await verifyProduction(payload, fetchImpl, signal);
    const response = await fetchImpl(INDEXNOW_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'User-Agent': 'CAISSA-Chess-IndexNow/1.0'
      },
      body: JSON.stringify(payload),
      signal
    });
    if ([200, 202].includes(response.status)) {
      log(`IndexNow accepted the batch (${response.status}).`);
      return { ok: true, dryRun: false, status: response.status, urls: payload.urlList };
    }
    const retryAfter = response.headers?.get?.('retry-after');
    const guidance = response.status === 400 ? 'invalid request'
      : response.status === 403 ? 'key verification rejected'
        : response.status === 422 ? 'host, key, or URL validation failed'
          : response.status === 429 ? `rate limited${retryAfter ? `; retry after ${retryAfter}` : ''}`
            : response.status >= 500 ? 'IndexNow service error; retry later' : 'unexpected response';
    errorLog(`IndexNow rejected the batch (${response.status}: ${guidance}).`);
    return { ok: false, dryRun: false, status: response.status, urls: payload.urlList };
  } catch (error) {
    const message = error?.name === 'TimeoutError' ? 'IndexNow request timed out.' : error.message;
    errorLog(message.replaceAll(key, '[redacted]'));
    return { ok: false, dryRun: false, status: null, urls: payload.urlList };
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const detected = args.base ? detectChangedCanonicalUrls(args.base, args.to) : [];
  const result = await submitIndexNow({ urls: [...args.urls, ...detected], dryRun: args.dryRun });
  if (!result.ok) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
