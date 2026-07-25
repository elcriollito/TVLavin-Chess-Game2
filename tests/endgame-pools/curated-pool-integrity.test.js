import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
    sha256Digest, verifyManifest, verifyPoolDigest
} from '../../js/endgame-trainer/v2/curated-pool-integrity.js';

const json = async (path) => JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'));
const pool = await json('../../public/data/endgame-pools/caissa-king-pawn-decisions/1.0.0.json');
const manifest = await json('../../public/data/endgame-pools/manifest-1.0.0.json');

test('manifest and pool SHA-256 values reproduce exactly', async () => {
    assert.equal(await verifyManifest(manifest), true);
    assert.equal(await verifyPoolDigest(pool, manifest.pools[0].contentDigest), true);
    assert.match(await sha256Digest(pool), /^sha256-[a-f0-9]{64}$/);
});

test('cryptographic checks detect pool and manifest mutation', async () => {
    const changedPool = structuredClone(pool);
    changedPool.label += ' changed';
    assert.equal(await verifyPoolDigest(changedPool, manifest.pools[0].contentDigest), false);
    const changedManifest = structuredClone(manifest);
    changedManifest.pools[0].positionCount += 1;
    assert.equal(await verifyManifest(changedManifest), false);
});
