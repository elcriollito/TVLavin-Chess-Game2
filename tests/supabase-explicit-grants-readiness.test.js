import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const migration = fs.readFileSync(
    new URL('../supabase/migrations/20261022235500_identity_migration_challenge_service_read.sql', import.meta.url),
    'utf8'
);
const runtime = fs.readFileSync(
    new URL('../api/_lib/identity-migration.js', import.meta.url),
    'utf8'
);

test('pending migration handoff has the narrow explicit table grant required by PostgREST', () => {
    assert.match(runtime, /\.from\('identity_migration_challenges'\)[\s\S]*\.select\(/);
    assert.match(
        migration,
        /revoke all on table public\.identity_migration_challenges\s+from public, anon, authenticated, service_role;/i
    );
    assert.match(migration, /grant select on table public\.identity_migration_challenges\s+to service_role;/i);
    assert.doesNotMatch(
        migration,
        /grant\s+(?:all|insert|update|delete)[^;]*identity_migration_challenges[^;]*to\s+service_role/i
    );
});

test('browser roles and PUBLIC retain no direct challenge-table authority', () => {
    assert.match(
        migration,
        /revoke all on table public\.identity_migration_challenges\s+from public, anon, authenticated, service_role;/i
    );
    assert.doesNotMatch(migration, /grant[^;]*identity_migration_challenges[^;]*to\s+(?:public|anon|authenticated)/i);
});
