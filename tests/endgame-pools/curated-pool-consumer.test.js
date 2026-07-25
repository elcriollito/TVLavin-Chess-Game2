import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
    clearCuratedPoolCacheForTests,
    getCuratedPoolDescriptor,
    loadCuratedPool,
    selectCuratedPositions
} from '../../js/endgame-trainer/v2/curated-pool-consumer.js';

const artifact = JSON.parse(await readFile(new URL(
    '../../public/data/endgame-pools/caissa-king-pawn-decisions/1.0.0.json',
    import.meta.url
), 'utf8'));
const options = { poolId: artifact.poolId, poolVersion: artifact.poolVersion };
const manifest = JSON.parse(await readFile(new URL(
    '../../public/data/endgame-pools/manifest-1.0.0.json',
    import.meta.url
), 'utf8'));
const routeFetch = (pool = artifact, publishedManifest = manifest, onCall = () => {}) =>
    async (url) => {
        onCall(url);
        return {
            ok: true,
            json: async () => structuredClone(url.includes('manifest') ? publishedManifest : pool)
        };
    };

test('consumer exposes only an allowlisted immutable version', () => {
    assert.equal(getCuratedPoolDescriptor(options.poolId, options.poolVersion)?.positionCount, 10);
    assert.equal(getCuratedPoolDescriptor('../private', 'latest'), null);
});

test('consumer validates, freezes, and caches one artifact fetch per session', async () => {
    clearCuratedPoolCacheForTests();
    let calls = 0;
    const fetchImpl = routeFetch(artifact, manifest, () => { calls += 1; });
    const first = await loadCuratedPool({ ...options, fetchImpl });
    const second = await loadCuratedPool({ ...options, fetchImpl });
    assert.equal(first, second);
    assert.equal(calls, 2);
    assert.equal(Object.isFrozen(first.positions[0].provenance), true);
});

test('consumer rejects arbitrary pools, mismatched version, and altered fingerprints', async () => {
    clearCuratedPoolCacheForTests();
    await assert.rejects(loadCuratedPool({
        poolId: 'arbitrary', poolVersion: '1.0.0', fetchImpl: async () => ({ ok: true })
    }), { code: 'pool-unavailable' });
    const altered = structuredClone(artifact);
    altered.positions[0].fen = artifact.positions[1].fen;
    await assert.rejects(loadCuratedPool({
        ...options, fetchImpl: routeFetch(altered)
    }), { code: 'release-mismatch' });
});

test('consumer rejects digest and manifest membership mismatch neutrally', async () => {
    clearCuratedPoolCacheForTests();
    const alteredManifest = structuredClone(manifest);
    alteredManifest.pools[0].runtimePath = '/data/endgame-pools/other.json';
    await assert.rejects(loadCuratedPool({
        ...options, fetchImpl: routeFetch(artifact, alteredManifest)
    }), { code: 'manifest-mismatch' });

    clearCuratedPoolCacheForTests();
    const descriptorDigestArtifact = structuredClone(artifact);
    descriptorDigestArtifact.description += ' changed';
    descriptorDigestArtifact.contentFingerprint = artifact.contentFingerprint;
    await assert.rejects(loadCuratedPool({
        ...options, fetchImpl: routeFetch(descriptorDigestArtifact)
    }));
});

test('selection is deterministic, seeded, bounded, and has no repeats', () => {
    const first = selectCuratedPositions(artifact, { count: 5, seed: 'stable-seed' });
    const replay = selectCuratedPositions(artifact, { count: 5, seed: 'stable-seed' });
    const other = selectCuratedPositions(artifact, { count: 5, seed: 'other-seed' });
    assert.deepEqual(first.map(({ positionId }) => positionId), replay.map(({ positionId }) => positionId));
    assert.equal(new Set(first.map(({ positionId }) => positionId)).size, 5);
    assert.notDeepEqual(first.map(({ positionId }) => positionId), other.map(({ positionId }) => positionId));
});
