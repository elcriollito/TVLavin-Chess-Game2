import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { season10PostDeploymentVerification as V } from '../../docs/releases/season-10-post-deployment-verification-manifest.js';

test('post-deployment manifest is frozen, exact, JSON-safe, and bound to Stage 0', () => {
    assert.equal(V.schemaVersion, 'Season10PostDeploymentVerification@1.0.0');
    assert.equal(V.status, 'verified-with-external-gates');
    assert.equal(V.stage, 'stage-0');
    assert(Object.isFrozen(V)); assert(Object.isFrozen(V.deployment));
    assert.doesNotThrow(() => JSON.stringify(V));
    assert.equal(V.verifiedCommit, '7cec9ea60289d32435849ffde736041f739126d6');
    assert.equal(V.deployment.state, 'READY');
});

test('defaults, gates, findings, and rollback preserve release boundaries', () => {
    assert.deepEqual(V.defaults, { homepage: 'classic', normalPlay: 'legacy', simplifiedPlay: 'qa-only' });
    assert.equal(V.featureGates.players, 'blocked');
    assert.equal(V.featureGates.analyticsTransport, 'disabled');
    assert.deepEqual(V.findings.P0, []); assert.deepEqual(V.findings.P1DeploymentRegressions, []);
    assert.equal(V.rollback.previousDeploymentState, 'READY');
    assert.equal(V.rollback.actionTaken, false);
    assert.deepEqual(V.mutations, { deployment: false, aliases: false, defaults: false, runtime: false, analyticsTransport: false });
});

test('verification artifacts are release-only and not registered in production pages', () => {
    const names = ['docs/releases/SEASON_10_POST_DEPLOYMENT_VERIFICATION.md', 'docs/releases/season-10-post-deployment-verification-manifest.js'];
    names.forEach(name => assert(fs.statSync(name).size > 0, name));
    for (const page of ['index.html', 'yahoo-classic.html']) {
        assert.doesNotMatch(fs.readFileSync(page, 'utf8'), /season-10-post-deployment-verification/i);
    }
    const changed = execFileSync('git', ['diff', '--name-only', V.verifiedCommit], { encoding: 'utf8' });
    for (const protectedFile of ['index.html','yahoo-classic.html','server.js','vercel.json','package-lock.json','docs/architecture/PLAY_CURRENT_STATE_AUDIT.md','docs/architecture/CAISSA_SIMPLIFIED_PLAY_ARCHITECTURE.md','docs/architecture/PLAY_MIGRATION_AND_COMPATIBILITY_PLAN.md']) {
        assert(!changed.includes(protectedFile), protectedFile);
    }
});

test('local release tag remains annotated at the deployed commit and absent from origin', () => {
    assert.equal(execFileSync('git', ['rev-parse', 'season-10.0.0^{}'], { encoding: 'utf8' }).trim(), V.verifiedCommit);
    assert.match(execFileSync('git', ['cat-file', '-t', 'season-10.0.0'], { encoding: 'utf8' }).trim(), /^tag$/);
    const remote = execFileSync('git', ['ls-remote', '--tags', 'origin', 'refs/tags/season-10.0.0'], { encoding: 'utf8' }).trim();
    assert.equal(remote, '');
});
