import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { season10Closure as C } from '../../docs/releases/season-10-closure-manifest.js';

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();

test('closure manifest has exact frozen identity and is JSON-safe', () => {
    const keys = ['schemaVersion','season','releaseVersion','releaseId','packageChecksum','productionCommit','productionDeploymentId','rollbackDeploymentId','localVerificationCommit','closureCommitPolicy','defaults','featureStates','definitionOfDone','risks','deferredWork','frozenDecisions','nextSeason','laterSeasons','status'];
    assert.deepEqual(Object.keys(C), keys); assert.equal(C.schemaVersion, 'Season10Closure@1.0.0');
    assert.equal(C.releaseId, 'rel-season-10-cb911f49e9fc8070'); assert.equal(C.status, 'closed-stage-0-verified');
    assert(Object.isFrozen(C)); assert(Object.isFrozen(C.featureStates)); assert.doesNotThrow(() => JSON.stringify(C));
});

test('production and rollback identity match verified release evidence', async () => {
    const { season10ReleasePackage: P } = await import('../../docs/releases/season-10-release-package-manifest.js');
    const { season10PostDeploymentVerification: V } = await import('../../docs/releases/season-10-post-deployment-verification-manifest.js');
    assert.equal(C.releaseVersion, P.releaseVersion); assert.equal(C.releaseId, P.integrity.releaseId);
    assert.equal(C.packageChecksum, P.integrity.checksum); assert.equal(C.productionCommit, V.verifiedCommit);
    assert.equal(C.productionDeploymentId, V.deployment.id); assert.equal(C.rollbackDeploymentId, V.rollback.previousDeploymentId);
});

test('Git chain, divergence, and local-only annotated tag remain truthful before or after closure commit', () => {
    assert.equal(git('rev-list','--count','eb0511043dd397ac6ff50f05b4e67a84144b5d78..543f4691e3624d8093153e35292f49a9fbba29e3'), '59');
    assert.equal(git('rev-list','--count','--merges','eb0511043dd397ac6ff50f05b4e67a84144b5d78..543f4691e3624d8093153e35292f49a9fbba29e3'), '0');
    assert.equal(git('rev-parse','season-10.0.0^{}'), C.productionCommit); assert.equal(git('cat-file','-t','season-10.0.0'), 'tag');
    assert.equal(git('ls-remote','--tags','origin','refs/tags/season-10.0.0'), '');
    const ahead = Number(git('rev-list','--count','origin/main..HEAD')); const behind = Number(git('rev-list','--count','HEAD..origin/main'));
    assert([1, 2].includes(ahead)); assert.equal(behind, 0);
    if (ahead === 2) assert.equal(git('log','-1','--format=%s'), C.closureCommitPolicy.message);
});

test('defaults, gates, native multiplayer, FICS separation, and risks fail closed', () => {
    assert.deepEqual(C.defaults, { homepage: 'classic', normalPlay: 'legacy', simplifiedPlay: 'qa-only' });
    assert.equal(C.featureStates.players, 'production-blocked'); assert.equal(C.featureStates.analyticsTransport, 'disabled');
    assert.equal(C.featureStates.nativeMultiplayer, 'deferred'); assert.equal(C.featureStates.ficsForPlayV2, 'prohibited');
    assert.deepEqual(Object.fromEntries(Object.entries(C.risks).map(([key, value]) => [key, value.length])), { P1: 4, P2: 6, P3: 1 });
    assert(C.frozenDecisions.includes('no-fics-provider-or-fallback')); assert(C.frozenDecisions.includes('no-fictitious-player-network'));
});

test('Definition of Done is complete without claiming Players or manual certification', () => {
    assert.equal(Object.keys(C.definitionOfDone).length, 12);
    assert.equal(C.definitionOfDone.sharedShell, 'complete-with-gate');
    assert.equal(C.definitionOfDone.mobileUsable, 'complete-with-gate');
    assert(!Object.values(C.definitionOfDone).includes('not-complete'));
    assert.equal(C.nextSeason.firstTask, 'SEASON 11.0.1 — PUBLIC BETA READINESS AUDIT');
    assert.equal(C.laterSeasons[0].ficsProvider, false);
});

test('closure artifacts are release-only, passive, private, and absent from runtime registration', () => {
    const artifacts = ['docs/releases/SEASON_10_FINAL_CLOSURE_REPORT.md','docs/releases/SEASON_10_TO_SEASON_11_HANDOFF.md','docs/releases/season-10-closure-manifest.js'];
    artifacts.forEach(path => assert(fs.statSync(path).size > 0, path));
    for (const page of ['index.html','yahoo-classic.html']) assert.doesNotMatch(fs.readFileSync(page, 'utf8'), /season-10-closure|SEASON_10_FINAL_CLOSURE|SEASON_10_TO_SEASON_11/i);
    const source = artifacts.map(path => fs.readFileSync(path, 'utf8')).join('\n');
    assert.doesNotMatch(source, /process\.env|localStorage|sessionStorage|document\.cookie|fetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket/);
    assert.doesNotMatch(source, /(?:api[_-]?key|password|bearer)\s*[:=]/i);
    const changed = git('diff','--name-only',C.localVerificationCommit);
    for (const path of ['index.html','yahoo-classic.html','server.js','vercel.json','package-lock.json','docs/architecture/PLAY_CURRENT_STATE_AUDIT.md','docs/architecture/CAISSA_SIMPLIFIED_PLAY_ARCHITECTURE.md','docs/architecture/PLAY_MIGRATION_AND_COMPATIBILITY_PLAN.md']) assert(!changed.includes(path), path);
});
