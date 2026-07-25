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

test('consumer exposes only an allowlisted immutable version', () => {
    assert.equal(getCuratedPoolDescriptor(options.poolId, options.poolVersion)?.positionCount, 10);
    assert.equal(getCuratedPoolDescriptor('../private', 'latest'), null);
});

test('consumer validates, freezes, and caches one artifact fetch per session', async () => {
    clearCuratedPoolCacheForTests();
    let calls = 0;
    const fetchImpl = async () => {
        calls += 1;
        return { ok: true, json: async () => structuredClone(artifact) };
    };
    const first = await loadCuratedPool({ ...options, fetchImpl });
    const second = await loadCuratedPool({ ...options, fetchImpl });
    assert.equal(first, second);
    assert.equal(calls, 1);
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
        ...options, fetchImpl: async () => ({ ok: true, json: async () => altered })
    }), { code: 'release-mismatch' });
});

test('selection is deterministic, seeded, bounded, and has no repeats', () => {
    const first = selectCuratedPositions(artifact, { count: 5, seed: 'stable-seed' });
    const replay = selectCuratedPositions(artifact, { count: 5, seed: 'stable-seed' });
    const other = selectCuratedPositions(artifact, { count: 5, seed: 'other-seed' });
    assert.deepEqual(first.map(({ positionId }) => positionId), replay.map(({ positionId }) => positionId));
    assert.equal(new Set(first.map(({ positionId }) => positionId)).size, 5);
    assert.notDeepEqual(first.map(({ positionId }) => positionId), other.map(({ positionId }) => positionId));
});
