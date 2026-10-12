import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const projectRoot = new URL('../', import.meta.url);
const developmentOrigin = 'https://*.clerk.accounts.dev';
const productionOrigin = 'https://clerk.caissa-chess.org';

function directives(policy) {
  return new Map(policy.split(';').map(raw => raw.trim()).filter(Boolean).map(raw => {
    const [name, ...sources] = raw.split(/\s+/);
    return [name, sources];
  }));
}

function clerkMetaPolicies() {
  return fs.readdirSync(projectRoot, { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith('.html'))
    .flatMap(entry => {
      const html = fs.readFileSync(new URL(entry.name, projectRoot), 'utf8');
      const match = html.match(/<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]+)"/);
      if (!match || !match[1].includes(developmentOrigin)) return [];
      return [{ file: entry.name, policy: match[1] }];
    });
}

test('every Clerk-enabled HTML meta CSP allows the exact Production custom domain', () => {
  const policies = clerkMetaPolicies();
  assert.equal(policies.length, 20, 'unexpected Clerk-enabled HTML meta CSP inventory');

  for (const { file, policy } of policies) {
    assert.doesNotMatch(policy, /https:\/\/\*\.caissa-chess\.org/, `${file} grants an unnecessary wildcard`);
    for (const [directive, origins] of directives(policy)) {
      if (!origins.includes(developmentOrigin)) continue;
      assert.ok(origins.includes(productionOrigin), `${file} ${directive} blocks Clerk Production`);
      assert.equal(
        origins.filter(origin => origin === productionOrigin).length,
        1,
        `${file} ${directive} duplicates Clerk Production`,
      );
    }
  }
});

test('sign-in and sign-up meta policies permit the Production Clerk UI module', () => {
  const policies = new Map(clerkMetaPolicies().map(item => [item.file, directives(item.policy)]));

  for (const file of ['signin.html', 'signup.html']) {
    const policy = policies.get(file);
    assert.ok(policy, `${file} Clerk meta CSP missing`);
    assert.ok(policy.get('script-src')?.includes(productionOrigin), `${file} script-src blocks Clerk Production`);
    assert.ok(policy.get('script-src-elem')?.includes(productionOrigin), `${file} script-src-elem blocks Clerk Production`);
    assert.ok(policy.get('connect-src')?.includes(productionOrigin), `${file} connect-src blocks Clerk Production`);
    assert.ok(policy.get('frame-src')?.includes(productionOrigin), `${file} frame-src blocks Clerk Production`);
  }
});
