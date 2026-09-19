import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('account Beta entry is server-discovered and removed for unauthorized or signed-out accounts', async () => {
  const source = await readFile(new URL('../js/caissa-ui-auth.js', import.meta.url), 'utf8');
  assert.match(source, /fetch\('\/api\/beta\/access'/);
  assert.match(source, /result\?\.authorized !== true/);
  assert.match(source, /data-caissa-beta-entry/);
  assert.match(source, /_removeBetaEntries/);
  assert.match(source, /href = '\/beta'/);
});

test('deployment rewrites protect canonical and direct Scanner documents', async () => {
  const config = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
  const rewrites = new Map(config.rewrites.map(item => [item.source, item.destination]));
  assert.equal(rewrites.get('/beta'), '/api/beta/page');
  assert.equal(rewrites.get('/scanner/beta'), '/api/beta/scanner');
  assert.equal(rewrites.get('/scanner/beta/index.html'), '/api/beta/scanner');
  const middleware = await readFile(new URL('../middleware.js', import.meta.url), 'utf8');
  assert.match(middleware, /normalizedPath === '\/scanner\/beta\/index\.html'/);
  assert.match(middleware, /Response\.redirect\(new URL\('\/scanner\/beta'/);
});

test('beta schema is normalized, private by default, and seeds Scanner without deleting lifecycle history', async () => {
  const migration = await readFile(new URL('../supabase/migrations/20260919171415_caissa_beta_program_v1.sql', import.meta.url), 'utf8');
  for (const table of ['user_entitlements', 'beta_experiments', 'beta_audit_events']) {
    assert.match(migration, new RegExp(`create table public\\.${table}`));
    assert.match(migration, new RegExp(`alter table public\\.${table} force row level security`));
  }
  assert.match(migration, /revoke all on public\.user_entitlements, public\.beta_experiments, public\.beta_audit_events from public, anon, authenticated/);
  assert.match(migration, /'scanner', 'scanner', 'CAISSA Scanner'/);
  assert.match(migration, /'internal-beta', true, '\/scanner\/beta', 'global-beta'/);
  assert.doesNotMatch(migration, /delete from public\.beta_experiments/i);
});
