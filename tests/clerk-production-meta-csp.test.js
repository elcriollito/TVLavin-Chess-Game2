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
    .filter(entry => entry.isFile() && entry.name.endsWith('.html') && !/^play-v2(?:-|\.)/.test(entry.name))
    .flatMap(entry => {
      const html = fs.readFileSync(new URL(entry.name, projectRoot), 'utf8');
      const match = html.match(/<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]+)"/);
      if (!match || !match[1].includes(developmentOrigin)) return [];
      return [{ file: entry.name, policy: match[1] }];
    });
}

test('every Clerk-enabled HTML meta CSP allows the exact Production custom domain', () => {
  const policies = clerkMetaPolicies();
  assert.equal(policies.length, 16, 'unexpected directly-served Clerk HTML meta CSP inventory');

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

test('sign-in and the invitation-only sign-up handoff permit exact Clerk origins', () => {
  const policies = new Map(clerkMetaPolicies().map(item => [item.file, directives(item.policy)]));

  const signin = policies.get('signin.html');
  assert.ok(signin, 'signin.html Clerk meta CSP missing');
  assert.ok(signin.get('script-src')?.includes(productionOrigin));
  assert.ok(signin.get('connect-src')?.includes(productionOrigin));
  const signup = policies.get('signup.html');
  assert.ok(signup, 'signup.html Clerk meta CSP missing');
  assert.ok(signup.get('script-src')?.includes(productionOrigin));
  assert.ok(signup.get('connect-src')?.includes(productionOrigin));
  assert.ok(signup.get('frame-src')?.includes('https://challenges.cloudflare.com'));
  const source = fs.readFileSync(new URL('js/signup-page.js', projectRoot), 'utf8');
  assert.match(source, /getAll\('__clerk_ticket'\)/);
  assert.match(source, /REGISTRATION_CANDIDATE\?\.enabled !== true/);
});
