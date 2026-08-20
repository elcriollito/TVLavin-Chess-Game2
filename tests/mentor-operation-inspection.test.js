import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration=fs.readFileSync('supabase/migrations/20260820231423_mentor_safe_operation_inspection.sql','utf8');
const script=fs.readFileSync('scripts/inspect-mentor-operation.mjs','utf8');

test('inspection RPC is bounded, stable, fixed-path and service-role only',()=>{
  assert.match(migration,/inspect_mentor_operation\(p_operation_id uuid\)/);
  assert.match(migration,/language sql\s+stable\s+security definer\s+set search_path = pg_catalog/i);
  assert.match(migration,/revoke all on function public\.inspect_mentor_operation\(uuid\) from public, anon, authenticated/i);
  assert.match(migration,/grant execute on function public\.inspect_mentor_operation\(uuid\) to service_role/i);
  const body=migration.split('$inspect_mentor_operation$')[1];
  assert.doesNotMatch(body,/\b(insert|update|delete|truncate|execute|dynamic sql)\b/i);
});

test('RPC projection excludes identity, chess, AI content and cryptographic material',()=>{
  const forbidden=/\b(user_id|clerk_id|email|username|profile|oauth|pgn|fen|moves|prompt|response|ciphertext|plaintext_bytes|auth_tag|\biv\b|api[_ ]?key|token|raw_url|error_payload)\b/i;
  assert.doesNotMatch(migration,forbidden);
  assert.doesNotMatch(script,forbidden);
  for(const field of ['capabilityId','state','requestedAmount','reservedAmount','providerAttemptState','valueDeliveryState','resultCode','eventKind','delta','unit','quantity','provider','model','replayCount','deliveredAt']) assert.match(migration,new RegExp(`'${field}'`));
});

test('inspector keeps destination, project, service-role and UUID guards and uses only RPC',()=>{
  assert.match(script,/operationId/);
  assert.match(script,/\^\[0-9a-f\]\{8\}/);
  assert.match(script,/\['production','preview'\]/);
  assert.match(script,/SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(script,/hostname!==`\$\{projectRef\}\.supabase\.co`/);
  assert.match(script,/db\.rpc\('inspect_mentor_operation'/);
  assert.doesNotMatch(script,/db\.from\(/);
});
