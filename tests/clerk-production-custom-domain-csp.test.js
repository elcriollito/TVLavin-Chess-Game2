import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const config = JSON.parse(fs.readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
const developmentOrigin = 'https://*.clerk.accounts.dev';
const productionOrigin = 'https://clerk.caissa-chess.org';
const clerkRoutes = [
  '/(.*)',
  '/pgn-replayer',
  '/online/:path*',
  '/online',
  '/play',
  '/play/:path*'
];

function policyFor(source) {
  const route = config.headers.find(item => item.source === source);
  assert.ok(route, `missing Vercel header rule for ${source}`);
  const policy = route.headers.find(item => item.key === 'Content-Security-Policy')?.value;
  assert.ok(policy, `missing CSP for ${source}`);
  return policy;
}

function directives(policy) {
  return new Map(policy.split(';').map(raw => raw.trim()).filter(Boolean).map(raw => {
    const [name, ...sources] = raw.split(/\s+/);
    return [name, sources];
  }));
}

test('every Clerk-enabled Vercel CSP allows the exact Production custom domain', () => {
  for (const source of clerkRoutes) {
    const policy = policyFor(source);
    assert.match(policy, /https:\/\/clerk\.caissa-chess\.org(?:\s|;)/, `${source} omits Clerk Production`);
    assert.doesNotMatch(policy, /https:\/\/\*\.caissa-chess\.org/, `${source} grants an unnecessary wildcard`);

    for (const [directive, origins] of directives(policy)) {
      if (!origins.includes(developmentOrigin)) continue;
      assert.ok(origins.includes(productionOrigin), `${source} ${directive} omits Clerk Production`);
    }
  }
});

test('the global and Online policies permit Clerk Production network access', () => {
  for (const source of ['/(.*)', '/online/:path*', '/online']) {
    const policy = directives(policyFor(source));
    assert.ok(policy.get('connect-src')?.includes(productionOrigin), `${source} blocks Clerk Production API calls`);
    assert.ok(policy.get('frame-src')?.includes(productionOrigin), `${source} blocks Clerk Production frames`);
  }

  assert.ok(directives(policyFor('/(.*)')).get('script-src')?.includes(productionOrigin));
  for (const source of ['/online/:path*', '/online']) {
    const policy = directives(policyFor(source));
    assert.ok(policy.get('script-src')?.includes(productionOrigin));
    assert.ok(policy.get('script-src-elem')?.includes(productionOrigin));
  }
});
