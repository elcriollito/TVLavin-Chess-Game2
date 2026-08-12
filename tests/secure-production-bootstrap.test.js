import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync('supabase/bootstrap/caissa-production-bootstrap.sql', 'utf8');
const lower = source.toLowerCase();
const tables = ['caissa_schema_meta', 'users', 'credit_events', 'stripe_events', 'library_positions', 'library_collections', 'library_sync_log'];

test('bootstrap is deliberate, transactional, versioned, and does not mask partial state', () => {
  assert.match(lower, /^-- caissa authoritative[\s\S]*\nbegin;/);
  assert.match(lower, /caissa_bootstrap_partial_or_unknown/);
  assert.match(lower, /caissa_bootstrap_already_applied/);
  assert.match(lower, /current_user <> 'postgres'/);
  assert.match(lower, /revoke create on schema public from public, anon, authenticated, service_role/);
  assert.match(lower, /bootstrap_version = '2026-08-11\.1'/);
  assert.match(lower, /commit;\s*$/);
  assert.doesNotMatch(lower, /create table if not exists/);
});

test('every application table has explicit RLS and browser-role revocation', () => {
  for (const table of tables) {
    assert.match(lower, new RegExp(`alter table public\\.${table} enable row level security`));
    assert.match(lower, new RegExp(`revoke all on table public\\.${table} from public, anon, authenticated, service_role`));
  }
  assert.doesNotMatch(lower, /create policy/);
  assert.doesNotMatch(lower, /grant all/);
});

test('credit RPCs are fixed-path definer functions with service-role-only execution', () => {
  for (const fn of ['consume_credits', 'add_credits']) {
    assert.match(lower, new RegExp(`create function public\\.${fn}[\\s\\S]*?security definer[\\s\\S]*?set search_path = pg_catalog`));
    assert.match(lower, new RegExp(`revoke all on function public\\.${fn}\\(text, integer, text\\) from public, anon, authenticated`));
    assert.match(lower, new RegExp(`grant execute on function public\\.${fn}\\(text, integer, text\\) to service_role`));
  }
});

test('economic inputs are positive and bounded by current product contracts', () => {
  assert.match(lower, /p_cost is null or p_cost not between 1 and 2/);
  assert.match(lower, /p_amount is null or p_amount not between 1 and 200/);
  assert.match(lower, /v_new_balance_bigint > 2147483647/);
  assert.match(lower, /users_credits_check check \(credits between 0 and 2147483647\)/);
});

test('bootstrap has no user, economic, library, Stripe, or SEC-005 seeds', () => {
  const schemaDefinition = lower.slice(0, lower.indexOf('create function public.consume_credits'));
  for (const table of ['users', 'credit_events', 'stripe_events', 'library_positions', 'library_collections', 'library_sync_log']) {
    assert.doesNotMatch(schemaDefinition, new RegExp(`insert into public\\.${table}\\b`));
  }
  assert.doesNotMatch(lower, /identity_bindings|identity_migration_challenges|identity_enrollment_decisions|identity_migration_audit|manual_clerk_identity/);
  assert.doesNotMatch(lower, /auth\.users/);
});

test('historical schemas remain historical and bootstrap is outside migration queue', () => {
  assert.equal(fs.existsSync('supabase/bootstrap/caissa-production-bootstrap.sql'), true);
  assert.equal(fs.readdirSync('supabase/migrations').some(name => name.includes('production_bootstrap')), false);
});
