import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildAllPools, buildPublishedPool } from '../../scripts/build-endgame-pools.mjs';
import { stableStringify } from '../../js/endgame-trainer/v2/curated-pool-validator.js';

const source = JSON.parse(await readFile(new URL(
    '../../endgame-pools/authoring/pools/caissa-king-pawn-decisions-1.0.0.json',
    import.meta.url
), 'utf8'));
const committed = await readFile(new URL(
    '../../public/data/endgame-pools/caissa-king-pawn-decisions/1.0.0.json',
    import.meta.url
), 'utf8');

test('builder is deterministic and preserves explicit pool version', () => {
    const first = buildPublishedPool(source);
    const second = buildPublishedPool(structuredClone(source));
    assert.equal(stableStringify(first), stableStringify(second));
    assert.equal(`${stableStringify(first)}\n`, committed);
    assert.equal(first.poolVersion, '1.0.0');
    assert.equal(first.contentFingerprint, 'epool-fnv1a32-7f150692');
});

test('published output excludes editorial notes and source ownership fields', () => {
    const artifact = buildPublishedPool(source);
    const bytes = stableStringify(artifact);
    assert.doesNotMatch(bytes, /reviewedByRole|reviewBasis|\"notes\"/);
    assert.match(bytes, /immutable-knowledge-activity/);
});

test('check mode proves committed artifacts and registry are current', async () => {
    const result = await buildAllPools({ check: true });
    assert.deepEqual(result, {
        poolCount: 1,
        positionCount: 10,
        fingerprints: ['epool-fnv1a32-7f150692']
    });
});

test('pool has no duplicate membership and explicit noncompetitive eligibility', () => {
    const artifact = buildPublishedPool(source);
    assert.equal(new Set(artifact.positionIds).size, artifact.positionCount);
    assert.equal(artifact.scoringEligibility, 'preview-score-only');
    assert.equal(artifact.personalBestEligibility, false);
    assert.equal(artifact.futureLeaderboardEligibility, false);
});
