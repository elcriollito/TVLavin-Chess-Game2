import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const ignore = fs.readFileSync('.vercelignore', 'utf8')
  .split(/\r?\n/)
  .map(line => line.trim())
  .filter(line => line && !line.startsWith('#'));

function hasRule(rule) {
  return ignore.includes(rule);
}

test('operator database material and private security documentation are excluded', () => {
  assert.equal(hasRule('supabase/**'), true);
  assert.equal(hasRule('docs/**'), true);
  assert.equal(hasRule('scripts/**'), true);
  assert.equal(hasRule('tests/**'), true);
  assert.equal(hasRule('.wrangler/**'), true);
  assert.equal(hasRule('.codex/**'), true);
});

test('local environment, credential, database, and dump artifacts are denied', () => {
  for (const rule of [
    '.env', '.env.*', '*.pfx', '*.pem', '*.key', '*.cer',
    '*.sqlite', '*.sqlite3', '*.db', '*.dump', '*.backup', '*.pgdump', '*.sql.gz',
    '*credentials*', '*credential*', '*secrets*'
  ]) assert.equal(hasRule(rule), true, rule);
});

test('environment exclusions have no deployable exception', () => {
  assert.equal(ignore.some(rule => rule.startsWith('!.env')), false);
});

test('runtime roots are not denied by broad deployment rules', () => {
  for (const forbiddenRule of ['api/**', 'js/**', 'css/**', 'assets/**', 'public/**', 'middleware.js', 'server.js']) {
    assert.equal(hasRule(forbiddenRule), false, forbiddenRule);
  }
});

test('large local OpeningDB build intermediates are not deployment assets', () => {
  assert.equal(hasRule('data/openingdb/shards_build/**'), true);
  assert.equal(hasRule('data/openingdb/subshards_build/**'), true);
  const config = fs.readFileSync('vercel.json', 'utf8');
  assert.match(config, /downloads\.caissa-chess\.org\/openingdb/);
});

test('SEC-005 routes remain present and exact-default-off gated', () => {
  for (const route of [
    'api/user/identity-migration/challenge.js',
    'api/user/identity-migration/activate.js'
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
  assert.equal(hasRule('scripts/**'), true);
  assert.equal(hasRule('supabase/**'), true);
});
