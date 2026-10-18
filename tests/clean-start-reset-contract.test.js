import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const reset = fs.readFileSync('tools/clean-start/production-account-reset.sql', 'utf8');
const preflight = fs.readFileSync('tools/clean-start/production-account-preflight.sql', 'utf8');
const postflight = fs.readFileSync('tools/clean-start/production-account-postflight.sql', 'utf8');
const runbook = fs.readFileSync('docs/runbooks/CAISSA_CLEAN_START_RELEASE.md', 'utf8');
const labFixture = fs.readFileSync('tools/clean-start/test/production-account-reset-lab-fixture.sql', 'utf8');
const labAssertions = fs.readFileSync('tools/clean-start/test/production-account-reset-lab-assertions.sql', 'utf8');
const labRunner = fs.readFileSync('tools/clean-start/test/run-production-account-reset-lab.ps1', 'utf8');

test('reset is transactionally guarded by exact cluster, project, ledger, manifest, and recovery evidence', () => {
    assert.match(reset, /begin isolation level serializable/i);
    assert.match(reset, /pg_advisory_xact_lock/);
    assert.match(reset, /jczauvkfkweuvdpurpem/);
    assert.match(reset, /current_database\(\) <> 'postgres'/);
    assert.match(reset, /pg_control_system\(\)/);
    assert.match(reset, /7581440907192989109/);
    assert.match(reset, /CAISSA_CLEAN_START_WRONG_CLUSTER/);
    assert.match(reset, /8a9e642bcf09f0d1c2c121900261e4de/);
    assert.match(reset, /CAISSA_CLEAN_START_MANIFEST_DIVERGED/);
    assert.match(reset, /CAISSA_CLEAN_START_ACCOUNT_FK_GRAPH_DIVERGED/);
    assert.match(reset, /7eaa482811ddab5b65dc4637f461307b/);
    assert.match(reset, /CAISSA_CLEAN_START_IDENTITY_SURFACE_DIVERGED/);
    assert.match(reset, /709c54cf9d16bd4467d8e7b5adb326b9/);
    assert.match(reset, /CAISSA_CLEAN_START_UNMODELED_IDENTITY_SURFACE/);
    assert.match(reset, /CAISSA_CLEAN_START_CERTIFIED_BASELINE_DIVERGED/);
    assert.match(reset, /actual_manifest->>'users'\)::bigint <> 14/);
    assert.match(reset, /actual_manifest->>'caissa_public_identities'\)::bigint <> 14/);
    assert.match(reset, /actual_manifest->>'users_credits_total'\)::bigint <> 65/);
    assert.match(reset, /actual_manifest->>'user_entitlements'\)::bigint <> 1/);
    assert.match(reset, /actual_manifest->>'user_entitlements_active'\)::bigint <> 1/);
    assert.match(reset, /expected_manifest_b64/);
    assert.match(reset, /convert_from[\s\S]+decode[\s\S]+base64/i);
    assert.match(reset, /backup_sha256/);
    assert.match(reset, /restore_attestation_sha256/);
    assert.match(reset, /retain_until/);
    assert.match(reset, /commit;/i);
});

test('reset does not use broad schema destruction and preserves retained Scanner rows detached', () => {
    assert.doesNotMatch(reset, /drop\s+(?:schema|table)|truncate|db\s+reset/i);
    assert.match(reset, /update public\.scanner_beta_scans\s+set user_id = null/i);
    assert.match(reset, /update public\.scanner_beta_scan_failures\s+set user_id = null/i);
    assert.match(reset, /update public\.scanner_beta_feedback\s+set user_id = null/i);
    assert.match(reset, /client_metadata[\s\S]*- 'selectedImage'/);
    assert.match(reset, /delete from public\.users;/i);
    assert.match(reset, /delete from public\.beta_audit_events;/i);
    assert.match(reset, /delete from public\.caissa_online_rate_limits;/i);
    assert.match(reset, /delete from public\.identity_enrollment_decisions;/i);
    assert.match(reset, /delete from public\.library_sync_log|library_sync_log[\s\S]*delete from public\.users/i);
    assert.match(reset, /delete from public\.mentor_operation_results;/i);
    assert.match(reset, /update public\.credit_reservations[\s\S]*consumed_event_id = null/i);
    assert.match(reset, /update public\.credit_events[\s\S]*reservation_id = null/i);
    assert.match(reset, /active_entitlements/);
});

test('every certified account dependency is present in preflight, reset, and postflight coverage', () => {
    const relations = [
        'beta_audit_events', 'caissa_online_challenges', 'caissa_online_game_events',
        'caissa_online_games', 'caissa_online_matchmaking_tickets', 'caissa_online_presence',
        'caissa_online_profiles', 'caissa_online_rate_limits', 'caissa_online_ratings',
        'caissa_online_tournament_games', 'caissa_online_tournament_participants',
        'caissa_online_tournaments', 'caissa_public_identities', 'credit_events',
        'credit_reservations', 'economic_usage_events', 'identity_bindings',
        'identity_enrollment_decisions', 'identity_manual_recovery_previews',
        'identity_migration_audit', 'identity_migration_challenges', 'insight_datasets',
        'insight_reports', 'library_collections', 'library_positions', 'library_sync_log',
        'mentor_operation_results', 'puzzle_training_attempts', 'puzzle_training_progress',
        'scanner_beta_feedback', 'scanner_beta_scan_failures', 'scanner_beta_scans',
        'scanner_beta_square_corrections', 'scanner_beta_square_predictions',
        'stripe_events', 'user_entitlements'
    ];
    for (const relation of relations) {
        assert.match(preflight, new RegExp(`public\\.${relation}`), `preflight omits ${relation}`);
        assert.match(reset, new RegExp(`public\\.${relation}`), `reset omits ${relation}`);
        assert.match(postflight, new RegExp(`public\\.${relation}`), `postflight omits ${relation}`);
    }
});

test('preflight and postflight are explicitly read-only', () => {
    for (const source of [preflight, postflight]) {
        assert.match(source, /begin isolation level repeatable read read only/i);
        assert.match(source, /rollback;/i);
        assert.doesNotMatch(source, /\b(?:insert|update|delete|truncate|drop|alter|create)\b/i);
        assert.match(source, /pg_control_system\(\)/);
        assert.match(source, /system_identifier/);
    }
});

test('runbook preserves required ordering and keeps notice off until reset completes', () => {
    const staging = runbook.indexOf('## 1. Staging certification');
    const backup = runbook.indexOf('## 2. Restricted Production backup');
    const resetPhase = runbook.indexOf('## 3. Coordinated Production reset');
    const production = runbook.indexOf('## 4. First Production registration and postflight');
    assert.ok(staging < backup && backup < resetPhase && resetPhase < production);
    assert.match(runbook, /reset notice disabled/i);
    assert.match(runbook, /CAISSA_ACCOUNT_RESET_NOTICE=enabled/);
    assert.match(runbook, /Keep Google OAuth disabled/);
    assert.match(runbook, /Do not touch Clerk Development or Vercel users/);
});

test('synthetic reset fixture mirrors the pinned ledger and retained evidence contract', () => {
    assert.match(labFixture, /LAB_LEDGER_FIXTURE_DIVERGED/);
    assert.match(labFixture, /8a9e642bcf09f0d1c2c121900261e4de/);
    assert.match(labFixture, /references public\.users\(id\) on delete set null/i);
    assert.match(labFixture, /references public\.users\(id\) on delete cascade/i);
    assert.match(labAssertions, /LAB_SCANNER_CORPUS_NOT_RETAINED/);
    assert.match(labFixture, /public\.beta_audit_events/);
    assert.match(labFixture, /public\.library_sync_log/);
    assert.match(labFixture, /public\.mentor_operation_results/);
    assert.match(labAssertions, /LAB_PAYMENT_BASELINE_DIVERGED/);
    assert.match(labAssertions, /LAB_GLOBAL_CATALOG_NOT_RETAINED/);
    assert.match(labAssertions, /CAISSA_CLEAN_START_RESET_LAB_PASS/);
    assert.match(labRunner, /tmp-clean-start-pg-lab/);
    assert.match(labRunner, /pg_dump\.exe/);
    assert.match(labRunner, /pg_restore\.exe/);
    assert.match(labRunner, /synthetic restore manifest diverged/);
    assert.match(labRunner, /CAISSA_CLEAN_START_ACCOUNT_FK_GRAPH_DIVERGED/);
    assert.match(labRunner, /CAISSA_CLEAN_START_CERTIFIED_BASELINE_DIVERGED/);
    assert.match(labRunner, /CAISSA_CLEAN_START_WRONG_CLUSTER/);
    assert.match(labRunner, /7581440907192989109/);
    assert.match(labRunner, /Refusing to remove unexpected lab path/);
    assert.match(labRunner, /pg_ctl\.exe["']?\s+-D[\s\S]+-m fast[\s\S]+-w stop/);
});
