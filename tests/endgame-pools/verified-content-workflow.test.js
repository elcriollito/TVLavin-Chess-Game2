import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
    nodeSha256, reviewablePoolContent, validateEvidenceRecord, validateReviewBundle
} from '../../scripts/endgame-verification-contracts.mjs';
import { createOfflineTablebaseAdapter } from '../../scripts/endgame-tablebase-adapter.mjs';
import { runEngineReview, verifyEngineBinary } from '../../scripts/endgame-engine-review.mjs';
import { provisionSyzygy } from '../../scripts/provision-syzygy.mjs';
import { mkdtemp, readFile as readPrivateFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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
    await assert.rejects(verifyEngineBinary({
        executable: process.execPath,
        identity: {
            nodePlatform: process.platform,
            nodeArchitecture: process.arch,
            binarySha256: '0'.repeat(64)
        }
    }), { code: 'engine-checksum-mismatch' });
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

test('real normalized engine evidence is private and records honest discrepancies', async () => {
    const evidence = JSON.parse(await readPrivateFile(new URL(
        '../../endgame-pools/private/evidence/caissa-king-pawn-decisions-1.0.0.stockfish-18.json',
        import.meta.url
    ), 'utf8'));
    assert.equal(evidence.records.length, 10);
    assert.equal(evidence.records.filter(({ resultClassification }) => resultClassification === 'confirmed').length, 2);
    assert.equal(evidence.records.filter(({ resultClassification }) =>
        resultClassification === 'requires-human-review').length, 4);
    assert.equal(evidence.records.filter(({ resultClassification }) =>
        resultClassification === 'authored-answer-questioned').length, 4);
    assert.ok(evidence.records.every((record) =>
        record.engineIdentity.engineVersion === '18' &&
        /^sha256-[a-f0-9]{64}$/.test(record.evidenceDigest) &&
        validateEvidenceRecord(record)));
});

test('Syzygy provisioning verifies an explicit inventory and rejects checksum drift', async () => {
    const target = await mkdtemp(join(tmpdir(), 'caissa-syzygy-'));
    const content = new TextEncoder().encode('fixture-table');
    const crypto = await import('node:crypto');
    const digest = crypto.createHash('sha256').update(content).digest('hex');
    const fetchImpl = async () => ({ ok: true, arrayBuffer: async () => content.buffer });
    const result = await provisionSyzygy({
        targetDirectory: target,
        inventory: { coverage: 'test-only', files: [{ name: 'KvK.rtbw', url: 'https://example.invalid/KvK.rtbw', sha256: digest }] },
        fetchImpl
    });
    assert.equal(result.installed.length, 1);
    await assert.rejects(provisionSyzygy({
        targetDirectory: await mkdtemp(join(tmpdir(), 'caissa-syzygy-bad-')),
        inventory: { files: [{ name: 'KvK.rtbw', url: 'https://example.invalid/KvK.rtbw', sha256: '0'.repeat(64) }] },
        fetchImpl
    }), { code: 'syzygy-checksum-mismatch' });
});
