import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const read = file => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const inventory = JSON.parse(read('config/caissa-public-route-inventory.json'));

test('CaissaPublicRouteInventory@1.0.0 is complete, unique, and ordered', () => {
  const vercel = JSON.parse(read('vercel.json'));
  const sitemap = read('public/sitemap.xml');
  const routeIsOwned = canonicalPath => vercel.rewrites.some(rule => {
    const pattern = rule.source
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      .replace(/:[^/]+/g, '[^/]+');
    return new RegExp(`^${pattern}$`).test(canonicalPath);
  });
  assert.equal(inventory.contractId, 'CaissaPublicRouteInventory@1.0.0');
  assert.deepEqual(inventory.primaryNavigation.slice(0, 5).map(item => item.label), ['Play', 'CAISSA Classic', 'FICS', 'Playchess', 'Fritz']);
  assert.equal(inventory.primaryNavigation[5].label, 'Tactics');
  assert.equal(inventory.primaryNavigation[13].label, 'Live Blitz');
  assert.equal(inventory.primaryNavigation[14].label, 'Game Replayer');
  assert.deepEqual(inventory.primaryNavigation.map(item => item.navigationPosition), Array.from({ length: 29 }, (_, index) => index + 1));
  assert.equal(new Set(inventory.primaryNavigation.map(item => item.id)).size, 29);
  assert.equal(new Set(inventory.primaryNavigation.map(item => item.navigationPosition)).size, 29);
  const canonicalPages = [...inventory.primaryNavigation, ...inventory.publicCanonicalRoutes]
    .filter(item => item.type === 'internal-page');
  assert.equal(new Set(canonicalPages.map(item => item.canonicalPath)).size, canonicalPages.length,
    'incompatible page records duplicate a canonical URL');
  for (const item of canonicalPages) {
    assert.ok(routeIsOwned(item.canonicalPath) || sitemap.includes(`<loc>https://www.caissa-chess.org${item.canonicalPath}</loc>`),
      `${item.canonicalPath} has no routing owner`);
  }
  for (const item of [...inventory.primaryNavigation, ...inventory.publicCanonicalRoutes, ...inventory.redirectsAndAliases, ...inventory.protectedRoutes]) {
    for (const field of ['id', 'label', 'owner', 'type', 'status']) assert.ok(item[field], `${item.id || 'record'} lacks ${field}`);
  }
  assert.equal(inventory.externalDestinations.length, 4);
  for (const item of inventory.externalDestinations) {
    assert.equal(item.explicitClickRequired, true);
    if (item.target === '_blank') assert.equal(item.rel, 'noopener noreferrer');
  }
});

test('redirects and protected families remain owned and fail closed', () => {
  const vercel = JSON.parse(read('vercel.json'));
  const middleware = read('middleware.js');
  for (const redirect of inventory.redirectsAndAliases) {
    const owner = vercel.redirects.find(rule => rule.source === redirect.redirectFrom);
    assert.ok(owner, redirect.redirectFrom);
    assert.equal(owner.destination, redirect.redirectTo);
    assert.equal(redirect.expectedStatus, owner.permanent ? 308 : 307);
  }
  for (const redirect of inventory.redirectsAndAliases.filter(item => item.redirectFrom.startsWith('/play/beta'))) {
    assert.match(middleware, new RegExp(`\\['${redirect.redirectFrom.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}', '${redirect.redirectTo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'\\]`));
  }
  for (const token of ['/play-v2.html', '/play-v2-public-beta.html', '/play-v2-invite.html', '/play-v2-promotion-qa.html', '/play-v2-ipad-analyze-diagnostic.html']) {
    assert.match(middleware, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(middleware, /PLAY_BETA_ENDPOINT_UNAVAILABLE/);
  const protectedRewrites = new Map(vercel.rewrites.map(rule => [rule.source, rule.destination]));
  for (const source of ['/play/beta/:path*', '/play-v2.html', '/play-v2-public-beta.html', '/play-v2-invite.html', '/play-v2-promotion-qa.html', '/play-v2-ipad-analyze-diagnostic.html']) {
    assert.equal(protectedRewrites.get(source), '/play-v2-unavailable.html', `${source} is no longer fail-closed`);
  }
});

test('JSON and Markdown regenerate byte-for-byte without drift', () => {
  const beforeJson = read('config/caissa-public-route-inventory.json');
  const beforeMarkdown = read('docs/architecture/CAISSA_PUBLIC_ROUTE_AND_NAVIGATION_INVENTORY.md');
  const result = spawnSync(process.execPath, ['scripts/build-caissa-public-route-inventory.mjs'], { cwd: new URL('..', import.meta.url), encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(read('config/caissa-public-route-inventory.json'), beforeJson);
  assert.equal(read('docs/architecture/CAISSA_PUBLIC_ROUTE_AND_NAVIGATION_INVENTORY.md'), beforeMarkdown);
  assert.match(beforeMarkdown, new RegExp(`Primary navigation entries: ${inventory.counts.primaryNavigationEntries}`));
  assert.match(beforeMarkdown, /Any task that adds, removes, renames, redirects, protects, or reorders/);
});
