import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const artifactPath = 'supabase/staging-only/20261023211619_caissa_staging_synthetic_identity_provisioning.sql';
const sql = fs.readFileSync(artifactPath, 'utf8');
const teardownPath = 'supabase/staging-only/20261023211620_caissa_staging_synthetic_identity_teardown.sql';
const teardown = fs.readFileSync(teardownPath, 'utf8');
const postgresRunner = fs.readFileSync('tests/run-staging-synthetic-identity-postgres.mjs', 'utf8');
const sync = fs.readFileSync('api/user/sync.js', 'utf8');

test('staging fixture provisioning stays outside the ordinary migration and HTTP route surfaces', () => {
    assert.equal(fs.existsSync('supabase/migrations/20261023211619_caissa_staging_synthetic_identity_provisioning.sql'), false);
    assert.match(sql, /intentionally outside supabase\/migrations/i);
    assert.match(sql, /create schema if not exists caissa_staging_private/i);
    assert.doesNotMatch(sql, /grant\s+execute/i);
    assert.match(sql, /revoke all on schema caissa_staging_private from public, anon, authenticated, service_role/i);

    for (const path of fs.readdirSync('api', { recursive: true })) {
        if (typeof path !== 'string' || !path.endsWith('.js')) continue;
        const source = fs.readFileSync(`api/${path}`, 'utf8');
        assert.doesNotMatch(source, /caissa_staging_private|provision_synthetic_identity/i, `${path} exposes staging provisioning`);
    }
});

test('the contract is fail-closed to the exact hosted Staging database', () => {
    assert.match(sql, /project reference aqizagaskicotorfpwfn/i);
    assert.match(sql, /7678069749886157684/);
    assert.match(sql, /pg_catalog\.pg_control_system\(\)/i);
    assert.match(sql, /CAISSA_STAGING_PROJECT_MISMATCH/i);
    assert.match(sql, /assert_staging_project\(\)/i);
    assert.match(sql, /perform caissa_staging_private\.assert_staging_project\(\)/i);
    assert.match(sql, /pg_advisory_xact_lock\(767806974988615768\)/i);
    assert.match(sql, /create table caissa_staging_private\.installation_guard/i);
});

test('the contract binds two bounded A/B slots to exact subjects and UUIDs without historical or email matching', () => {
    assert.match(sql, /primary key \(run_id, external_subject\)/i);
    assert.match(sql, /fixture_slot text not null check \(fixture_slot in \('A', 'B'\)\)/i);
    assert.match(sql, /unique \(run_id, fixture_slot\)/i);
    assert.match(sql, /expected_synthetic_run_id/i);
    assert.match(sql, /CAISSA_STAGING_SYNTHETIC_RUN_V1/i);
    assert.match(sql, /extensions\.digest\([\s\S]*'sha256'/i);
    assert.match(sql, /RUN_MANIFEST_MISMATCH/i);
    assert.match(sql, /unique \(external_subject\)/i);
    assert.match(sql, /unique \(user_id\)/i);
    assert.match(sql, /HISTORICAL_OR_BOUND_IDENTITY/i);
    assert.match(sql, /u\.id = p_user_id or u\.clerk_id = p_external_subject/i);
    assert.match(sql, /b\.user_id = p_user_id or b\.external_subject = p_external_subject/i);
    assert.doesNotMatch(sql, /where\s+(?:lower\s*\()?\s*(?:u\.)?email\s*=/i);
    assert.doesNotMatch(sql, /LEGACY_BACKFILL/i);
});

test('provisioning creates a new Development binding plus an explicit verified ownership decision', () => {
    assert.match(sql, /insert into public\.users\(id, clerk_id, email\)/i);
    assert.match(sql, /'clerk', 'legacy_development', p_external_subject, 'ACTIVE'/i);
    assert.match(sql, /'NEW_ACCOUNT'/i);
    assert.match(sql, /'staging_synthetic', true/i);
    assert.match(sql, /insert into public\.caissa_identity_ownership_reviews/i);
    assert.match(sql, /'VERIFIED', 'NEW_ACCOUNT'/i);
    assert.match(sql, /FIXTURE_ALREADY_PROVISIONED/i);
    assert.match(sql, /FIXTURE_PARTIAL_STATE_REVIEW_REQUIRED/i);
});

test('cleanup is exact, protected-dependency aware, and can restore the pre-run data baseline', () => {
    assert.match(sql, /CLEAN STAGING SYNTHETIC FIXTURE/i);
    assert.match(sql, /v_user\.created_at < v_authorization\.authorized_at/i);
    assert.match(sql, /v_user\.is_premium is true/i);
    assert.match(sql, /v_user\.stripe_customer_id is not null/i);
    assert.match(sql, /other\.id <> v_binding\.id/i);
    assert.match(sql, /when foreign_key_violation/i);
    assert.match(sql, /finalize_synthetic_identity_cleanup/i);
    assert.match(sql, /external private run ledger/i);
});

test('the exact Staging schema baseline is restored only after guarded zero-residue teardown', () => {
    assert.equal(fs.existsSync('supabase/migrations/20261023211620_caissa_staging_synthetic_identity_teardown.sql'), false);
    assert.match(teardown, /intentionally outside supabase\/migrations/i);
    assert.match(teardown, /aqizagaskicotorfpwfn/i);
    assert.match(teardown, /7678069749886157684/);
    assert.match(teardown, /CAISSA_STAGING_PROJECT_MISMATCH/i);
    assert.match(teardown, /CAISSA_STAGING_FIXTURE_AUTHORIZATIONS_NOT_EMPTY/i);
    assert.match(teardown, /CAISSA_STAGING_FIXTURE_BINDING_RESIDUE/i);
    assert.match(teardown, /CAISSA_STAGING_PRIVATE_SCHEMA_UNEXPECTED_RELATION/i);
    assert.match(teardown, /CAISSA_STAGING_PRIVATE_SCHEMA_UNEXPECTED_FUNCTION/i);
    assert.match(teardown, /pg_advisory_xact_lock\(767806974988615768\)/i);
    assert.match(teardown, /drop function if exists caissa_staging_private\.authorize_synthetic_identity/i);
    assert.match(teardown, /drop table if exists caissa_staging_private\.synthetic_identity_authorizations/i);
    assert.match(teardown, /drop schema if exists caissa_staging_private;/i);
    assert.doesNotMatch(teardown, /drop schema[^;]*cascade/i);
    assert.match(postgresRunner, /waitForLifecycleLock/i);
    assert.match(postgresRunner, /CAISSA_STAGING_FIXTURE_AUTHORIZATIONS_NOT_EMPTY/i);
    assert.match(postgresRunner, /CAISSA_STAGING_SYNTHETIC_IDENTITY_TEARDOWN_RACE_PASS/i);
});

test('ordinary Development sync remains fail-closed and Production-only approval is unchanged', () => {
    assert.match(sync, /auth\.authority === 'production'/i);
    assert.match(sync, /isIdentityMigrationEnforced\(env\)/i);
    assert.doesNotMatch(sync, /legacy_development[\s\S]*provisionApprovedIdentity/i);
});
