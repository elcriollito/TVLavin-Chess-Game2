import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
    nodeSha256, reviewablePoolContent, validateEvidenceRecord, validateReviewBundle
} from '../../scripts/endgame-verification-contracts.mjs';
import { createOfflineTablebaseAdapter } from '../../scripts/endgame-tablebase-adapter.mjs';
import { runEngineReview } from '../../scripts/endgame-engine-review.mjs';

const json = async (path) => JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'));
const source = await json('../../endgame-pools/authoring/pools/caissa-king-pawn-decisions-1.0.0.json');
const review = await json('../../endgame-pools/private/reviews/caissa-king-pawn-decisions-1.0.0.review.json');

test('formal review bundle binds every approval to exact reviewable content', () => {
    assert.equal(validateReviewBundle(source, review).valid, true);
    assert.equal(review.reviewedContentDigest, nodeSha256(reviewablePoolContent(source)));
});

test('content mutation makes approvals stale and blocks publication', () => {
    const changed = structuredClone(source);
    changed.positions[0].hintStages[0].text += ' changed';
    assert.throws(() => validateReviewBundle(changed, review), (error) =>
        error.code === 'review-validation-failed' && error.errors.includes('stale-review-approval'));
});

test('verification evidence contract requires typed input and output identity', () => {
    assert.equal(validateEvidenceRecord({
        evidenceSchemaVersion: '1.0.0',
        positionId: 'p1',
        positionContentFingerprint: 'sha256-input',
        evidenceType: 'human-chess-review',
        evidenceVersion: '1.0.0',
        toolOrReviewer: 'role:chess-reviewer',
        result: { approved: true },
        inputFingerprint: 'sha256-input',
        outputFingerprint: 'sha256-output'
    }), true);
    assert.equal(validateEvidenceRecord({ evidenceSchemaVersion: '1.0.0' }), false);
});

test('engine tool fails explicitly when no approved executable is configured', async () => {
    await assert.rejects(runEngineReview({ fen: source.positions[0].fen }), { code: 'engine-unavailable' });
});

test('offline tablebase adapter reports unavailable and supports deterministic fixtures', async () => {
    await assert.rejects(createOfflineTablebaseAdapter().verify({
        fen: source.positions[0].fen, positionFingerprint: 'sha256-p', pieceCount: 4
    }), { code: 'tablebase-unavailable' });
    const adapter = createOfflineTablebaseAdapter({
        probe: async () => ({ wdl: 'draw', dtz: 0, bestMoves: ['d4e4'] }),
        version: 'fixture-1'
    });
    const result = await adapter.verify({
        fen: source.positions[0].fen, positionFingerprint: 'sha256-p', pieceCount: 4
    });
    assert.equal(result.wdl, 'draw');
    assert.equal(result.verificationMethod, 'offline-syzygy-probe');
});
