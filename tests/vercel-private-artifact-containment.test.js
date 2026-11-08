import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const ignore = fs.readFileSync('.vercelignore', 'utf8')
  .split(/\r?\n/)
  .map(line => line.trim())
  .filter(line => line && !line.startsWith('#'));
const manifest = JSON.parse(fs.readFileSync('PUBLIC_RELEASE_ARTIFACT_MANIFEST.json', 'utf8'));
const publicPaths = manifest.files.map(item => item.path);
const publicPathSet = new Set(publicPaths);

function hasManifestPrefix(prefix) {
  return publicPaths.some(path => path === prefix || path.startsWith(`${prefix}/`));
}

test('Vercel upload policy is default-deny and manifest-derived', () => {
  assert.equal(ignore[0], '*');
  assert.equal(manifest.policy, 'exact-path-and-sha256');
  assert.equal(manifest.files.every(item => /^[0-9a-f]{64}$/.test(item.sha256)), true);
});

test('operator database material and private security documentation are excluded', () => {
  for (const prefix of ['supabase', 'docs', 'scripts', 'tests', '.wrangler', '.codex']) {
    assert.equal(hasManifestPrefix(prefix), false, prefix);
  }
});

test('local environment, credential, database, and dump artifacts are denied', () => {
  for (const path of publicPaths) {
    assert.doesNotMatch(path, /(^|\/)\.env(?:\.|$)|\.(?:pfx|pem|key|cer|sqlite|sqlite3|db|dump|backup|pgdump|sql\.gz)$|credentials?|secrets?/i);
  }
});

test('runtime roots retain exact manifest-approved files', () => {
  for (const prefix of ['api/', 'js/', 'css/', 'assets/', 'public/']) {
    assert.equal(publicPaths.some(path => path.startsWith(prefix)), true, prefix);
  }
  assert.equal(publicPathSet.has('middleware.js'), true);
  assert.equal(publicPathSet.has('server.js'), true);
});

test('large local OpeningDB build intermediates are not deployment assets', () => {
  assert.equal(hasManifestPrefix('data/openingdb/shards_build'), false);
  assert.equal(hasManifestPrefix('data/openingdb/subshards_build'), false);
  const config = fs.readFileSync('vercel.json', 'utf8');
  assert.match(config, /downloads\.caissa-chess\.org\/openingdb/);
});

test('SEC-005 routes remain present and exact-default-off gated', () => {
  for (const route of [
    'api/user/identity-migration/challenge.js',
    'api/user/identity-migration/activate.js',
    'api/user/identity-migration/owner/start.js',
    'api/user/identity-migration/owner/prove.js',
    'api/user/identity-migration/owner/complete.js'
  ]) {
    assert.equal(fs.existsSync(route), true, route);
    const source = fs.readFileSync(route, 'utf8');
    assert.match(source, /const environment = dependencies\.env \|\| process\.env/);
    assert.match(source, /isIdentityMigrationEnforced\(environment\)/);
  }
  const gate = fs.readFileSync('api/_lib/identity-resolution.js', 'utf8');
  assert.match(gate, /const MIGRATION_MODE = 'enforced'/);
  assert.match(gate, /env\.CAISSA_IDENTITY_MIGRATION_MODE === MIGRATION_MODE/);
});

test('private recovery CLI and bootstrap remain repository-only', () => {
  assert.equal(fs.existsSync('scripts/recover-clerk-identity.mjs'), true);
  assert.equal(fs.existsSync('supabase/bootstrap/caissa-production-bootstrap.sql'), true);
  assert.equal(publicPathSet.has('scripts/recover-clerk-identity.mjs'), false);
  assert.equal(publicPathSet.has('supabase/bootstrap/caissa-production-bootstrap.sql'), false);
});
