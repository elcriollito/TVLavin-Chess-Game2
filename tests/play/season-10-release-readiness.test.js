import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { season10ReleaseReadiness as R } from '../../docs/releases/season-10-release-readiness-manifest.js';

test('readiness contract is frozen, JSON-safe, exact, and accounts for all local commits', () => {
    assert.equal(R.schemaVersion, 'Season10ReleaseReadiness@1.0.0'); assert(Object.isFrozen(R)); assert(Object.isFrozen(R.blockers));
    assert.doesNotThrow(() => JSON.stringify(R)); assert.equal(R.commitCount, 56); assert.equal(R.commitIds.length, 56);
    assert.equal(new Set(R.commitIds).size, 56); assert.equal(R.baseline, '1442b88562199fa23faf9f22884b9aa025216cf0');
    const actual = execFileSync('git', ['log','--reverse','--format=%h','origin/main..1442b88562199fa23faf9f22884b9aa025216cf0'], { encoding: 'utf8' }).trim().split(/\r?\n/);
    assert.deepEqual(actual, [...R.commitIds]);
});

test('classification and defaults fail closed without overstating production readiness', () => {
    assert.equal(R.classification, 'READY WITH BLOCKERS'); assert.equal(R.productionEligibility, 'blocked');
    assert.deepEqual(R.defaults, { homepage: 'classic', play: 'legacy', simplifiedPlay: 'qa-only', players: 'blocked', analyticsTransport: 'disabled' });
    assert.equal(R.recommendedStage, 'stage-0'); assert(R.blockers.some(item => item.id === 'analytics-consent-and-sink'));
    assert(R.blockers.some(item => item.id === 'players-production-eligibility'));
    assert.deepEqual([...new Set(R.blockers.map(item => item.priority))], ['P1','P2','P3']);
});

test('release artifacts are audit-only and cannot mutate runtime, environment, routes, transport, or deployment', () => {
    const manifest = fs.readFileSync('docs/releases/season-10-release-readiness-manifest.js', 'utf8');
    const audit = fs.readFileSync('docs/releases/SEASON_10_RELEASE_READINESS_AUDIT.md', 'utf8');
    for (const source of [manifest, audit]) assert.doesNotMatch(source, /process\.env\s*=|localStorage|sessionStorage|document\.cookie|fetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|registerSink\s*\(/);
    for (const page of ['index.html','yahoo-classic.html']) assert.doesNotMatch(fs.readFileSync(page, 'utf8'), /season-10-release-readiness-manifest/);
    const changed = execFileSync('git', ['diff','--name-only','1442b88562199fa23faf9f22884b9aa025216cf0'], { encoding: 'utf8' });
    for (const file of ['server.js','vercel.json','package-lock.json','docs/architecture/PLAY_CURRENT_STATE_AUDIT.md','docs/architecture/CAISSA_SIMPLIFIED_PLAY_ARCHITECTURE.md','docs/architecture/PLAY_MIGRATION_AND_COMPATIBILITY_PLAN.md']) assert(!changed.includes(file), file);
});
