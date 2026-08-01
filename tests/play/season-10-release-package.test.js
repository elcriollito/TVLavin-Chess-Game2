import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { season10ReleasePackage as P } from '../../docs/releases/season-10-release-package-manifest.js';
import { season10CommitRange as R } from '../../docs/releases/season-10-commit-range-manifest.js';
import { season10ReleaseReadiness as A } from '../../docs/releases/season-10-release-readiness-manifest.js';

const stable = value => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value;
const digest = value => crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');

test('package manifest is exact, frozen, deterministic, JSON-safe, and Stage 0 only', () => {
    const keys = ['schemaVersion','releaseName','releaseVersion','season','status','recommendedStage','originBaseline','sourceHead','packagingCommit','commitRange','commitCount','readinessClassification','defaults','featureGates','includedSubsystems','excludedActivations','blockers','rollback','verification','integrity'];
    assert.deepEqual(Object.keys(P), keys); assert(Object.isFrozen(P)); assert(Object.isFrozen(P.featureGates));
    assert.doesNotThrow(() => JSON.stringify(P)); assert.equal(P.schemaVersion, 'Season10ReleasePackage@1.0.0');
    assert.equal(P.releaseVersion, '10.0.0'); assert.equal(P.status, 'prepared-not-deployed');
    assert.equal(P.recommendedStage, 'stage-0-package'); assert.equal(P.readinessClassification, 'READY WITH BLOCKERS');
});

test('all 57 baseline commits are complete, unique, chronological, non-merge records', () => {
    const actual = execFileSync('git', ['log','--reverse','--format=%H|%s',`${P.originBaseline}..5132b34010339acf715e9359dfc239d861778755`], { encoding: 'utf8' }).trim().split(/\r?\n/);
    assert.equal(R.count, 57); assert.equal(R.commits.length, 57); assert.equal(new Set(R.commits.map(item => item.hash)).size, 57);
    assert.deepEqual(R.commits.map(item => `${item.hash}|${item.subject}`), actual);
    assert.equal(execFileSync('git', ['rev-list','--count','--merges',`${P.originBaseline}..5132b34010339acf715e9359dfc239d861778755`], { encoding: 'utf8' }).trim(), '0');
    for (const item of R.commits) assert.deepEqual(Object.keys(item), ['hash','shortHash','subject','task','category','productionImpact','activationState','rollbackCoupling','testEvidence']);
});

test('defaults, feature gates, exclusions, blockers, and rollback cannot be weakened', () => {
    assert.deepEqual(P.defaults, { homepage: 'classic', normalPlay: 'legacy', simplifiedPlay: 'qa-only' });
    assert.equal(P.featureGates.players, 'blocked'); assert.equal(P.featureGates.analyticsTransport, 'disabled');
    assert(P.excludedActivations.includes('public-beta')); assert(P.excludedActivations.includes('players-runtime'));
    assert.deepEqual(P.blockers.P1, A.blockers.filter(item => item.priority === 'P1').map(item => item.id));
    assert.deepEqual(P.blockers.P2, A.blockers.filter(item => item.priority === 'P2').map(item => item.id));
    assert.deepEqual(P.blockers.P3, A.blockers.filter(item => item.priority === 'P3').map(item => item.id));
    assert.equal(P.rollback.previousDeploymentId, 'unknown'); assert.equal(P.rollback.productionBaseline, P.originBaseline);
});

test('canonical checksum and release identity reproduce without timestamps', () => {
    const copy = JSON.parse(JSON.stringify(P)); copy.integrity.checksum = ''; copy.integrity.releaseId = '';
    const checksum = digest(copy); assert.equal(checksum, P.integrity.checksum);
    assert.equal(P.integrity.releaseId, `rel-season-10-${checksum.slice(0, 16)}`);
    assert.equal(P.integrity.timestampPolicy, 'none');
});

test('artifact inventory SHA-256 checksums reproduce from exact UTF-8 files', () => {
    const integrity = JSON.parse(fs.readFileSync('docs/releases/season-10-package-integrity.json', 'utf8'));
    assert.equal(integrity.schemaVersion, 'Season10PackageIntegrity@1.0.0');
    assert.equal(integrity.releaseId, P.integrity.releaseId); assert.equal(integrity.timestampPolicy, 'none');
    assert.equal(new Set(integrity.artifacts.map(item => item.path)).size, integrity.artifacts.length);
    for (const item of integrity.artifacts) assert.equal(crypto.createHash('sha256').update(fs.readFileSync(item.path)).digest('hex'), item.sha256, item.path);
});

test('release artifacts are complete, bounded, and registered nowhere in production', () => {
    const artifacts = ['SEASON_10_RELEASE_READINESS_AUDIT.md','season-10-release-readiness-manifest.js','season-10-release-package-manifest.js','season-10-commit-range-manifest.js','SEASON_10_CHANGELOG.md','SEASON_10_USER_RELEASE_NOTES.md','SEASON_10_TECHNICAL_RELEASE_NOTES.md','SEASON_10_STAGE_0_DEPLOYMENT_PLAN.md'];
    for (const file of artifacts) assert(fs.statSync(`docs/releases/${file}`).size > 0, file);
    for (const page of ['index.html','yahoo-classic.html']) { const html = fs.readFileSync(page, 'utf8');
        assert.doesNotMatch(html, /season-10-(?:release-package|commit-range)-manifest/); }
});

test('packaging has no runtime, dependency, environment, secret, tag, push, or deployment side effect', () => {
    const changed = execFileSync('git', ['diff','--name-only','5132b34010339acf715e9359dfc239d861778755'], { encoding: 'utf8' });
    for (const file of ['index.html','yahoo-classic.html','server.js','vercel.json','package-lock.json','docs/architecture/PLAY_CURRENT_STATE_AUDIT.md','docs/architecture/CAISSA_SIMPLIFIED_PLAY_ARCHITECTURE.md','docs/architecture/PLAY_MIGRATION_AND_COMPATIBILITY_PLAN.md']) assert(!changed.includes(file), file);
    const sources = ['season-10-release-package-manifest.js','season-10-commit-range-manifest.js'].map(file => fs.readFileSync(`docs/releases/${file}`, 'utf8')).join('\n');
    assert.doesNotMatch(sources, /process\.env|document\.|localStorage|sessionStorage|fetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|https?:\/\//);
    assert.doesNotMatch(sources, /(?:token|secret|password)\s*:/i);
    assert.equal(execFileSync('git', ['rev-parse','season-10.0.0^{}'], { encoding: 'utf8' }).trim(), '7cec9ea60289d32435849ffde736041f739126d6');
    assert.equal(execFileSync('git', ['cat-file','-t','season-10.0.0'], { encoding: 'utf8' }).trim(), 'tag');
    assert.equal(execFileSync('git', ['ls-remote','--tags','origin','refs/tags/season-10.0.0'], { encoding: 'utf8' }).trim(), '');
});
