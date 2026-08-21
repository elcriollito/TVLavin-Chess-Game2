import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration = fs.readFileSync('supabase/migrations/20260821210019_mentor_recent_operation_discovery.sql', 'utf8');
const script = fs.readFileSync('scripts/find-recent-mentor-operation.mjs', 'utf8');

test('discovery RPC is bounded, deterministic, and service-role-only', () => {
  assert.match(migration, /security definer/i);
  assert.match(migration, /set search_path = pg_catalog/i);
  assert.match(migration, /interval '15 minutes'/i);
  assert.match(migration, /limit 2/i);
  assert.match(migration, /limit 1/i);
  assert.match(migration, /revoke all .* from public, anon, authenticated/i);
  assert.match(migration, /grant execute .* to service_role/i);
  assert.doesNotMatch(migration, /execute\s+format|insert\s+into|update\s+public|delete\s+from/i);
});

test('administrative script exposes only bounded discovery fields', () => {
  assert.match(script, /count: 1/);
  assert.match(script, /operationId/);
  assert.match(script, /createdAt/);
  assert.doesNotMatch(script, /email|clerk|prompt|response|ciphertext|provider.payload/i);
});
