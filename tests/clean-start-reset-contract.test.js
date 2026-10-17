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
    assert.match(reset, /active_entitlements/);
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
    assert.match(labAssertions, /LAB_PAYMENT_EVIDENCE_NOT_DETACHED/);
    assert.match(labAssertions, /CAISSA_CLEAN_START_RESET_LAB_PASS/);
    assert.match(labRunner, /tmp-clean-start-pg-lab/);
    assert.match(labRunner, /CAISSA_CLEAN_START_WRONG_CLUSTER/);
    assert.match(labRunner, /7581440907192989109/);
    assert.match(labRunner, /Refusing to remove unexpected lab path/);
    assert.match(labRunner, /pg_ctl\.exe["']?\s+-D[\s\S]+-m fast[\s\S]+-w stop/);
});
