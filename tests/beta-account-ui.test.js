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
  await assert.rejects(
    readFile(new URL('../scanner/beta/index.html', import.meta.url), 'utf8'),
    error => error?.code === 'ENOENT'
  );
  const protectedDocument = await readFile(new URL('../api/_private/scanner-beta-index.html', import.meta.url), 'utf8');
  assert.match(protectedDocument, /CAISSA Scanner Internal Beta/);
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

test('Scanner activity migration binds canonical records to users and keeps summary RPC service-only', async () => {
  const migration = await readFile(new URL('../supabase/migrations/20260919173153_scanner_beta_user_activity_summary.sql', import.meta.url), 'utf8');
  for (const table of ['scanner_beta_scans', 'scanner_beta_feedback', 'scanner_beta_scan_failures']) {
    assert.match(migration, new RegExp(`alter table public\\.${table}[\\s\\S]+add column user_id uuid references public\\.users`));
  }
  assert.match(migration, /create function public\.get_scanner_beta_activity_summary\(p_user_id uuid\)/);
  assert.match(migration, /add column submitted_at timestamptz not null default now\(\)/);
  assert.match(migration, /count\(distinct d\.scan_id\)/);
  assert.match(migration, /where s\.user_id=p_user_id/);
  assert.match(migration, /where f\.user_id=p_user_id/);
  assert.match(migration, /d\.submitted_at >= date_trunc\('day',now\(\)\)/);
  assert.match(migration, /revoke all on function[\s\S]+from public, anon, authenticated/);
  assert.match(migration, /get_scanner_beta_activity_summary\(uuid\) to service_role/);
  assert.match(migration, /SCAN_OWNER_CONFLICT/);
  assert.match(migration, /SCAN_DISPOSITION_CONFLICT/);
  assert.match(migration, /SCANNER_BETA_ACTIVITY_SCOPE_IMMUTABLE/);
  assert.equal((migration.match(/pg_advisory_xact_lock/g) || []).length, 3);
});
