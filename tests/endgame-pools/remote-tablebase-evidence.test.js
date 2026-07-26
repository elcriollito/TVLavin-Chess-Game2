import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
    ALLOWED_REVIEW_DECISIONS, REMOTE_PROVIDER, compareEvidence, fetchRemoteTablebase,
    normalizeTablebaseResponse, sha256, validateRemoteEligibility
} from '../../scripts/endgame-remote-tablebase.mjs';
import { isProtectedPublicPath } from '../../scripts/build-public-release.mjs';

const FEN = '8/8/5k2/8/3K4/8/P7/8 w - - 0 1';
const DIGEST = `sha256-${'a'.repeat(64)}`;
const response = (body, { status = 200, contentType = 'application/json' } = {}) => ({
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ 'content-type': contentType }),
    json: async () => body
});
const winFixture = {
    category: 'win', dtz: 1, checkmate: false, stalemate: false, insufficient_material: false,
    moves: [
        { uci: 'd4d5', san: 'Kd5', category: 'loss', dtz: -1, zeroing: false },
        { uci: 'd4c5', san: 'Kc5', category: 'loss', dtz: -3, zeroing: false },
        { uci: 'd4e4', san: 'Ke4', category: 'draw', dtz: 0, zeroing: false }
    ]
};

test('provider contract is fixed, private, HTTPS, and bounded', () => {
    assert.equal(REMOTE_PROVIDER.providerId, 'lichess-syzygy-remote');
    assert.equal(REMOTE_PROVIDER.baseUrl, 'https://tablebase.lichess.ovh');
    assert.equal(REMOTE_PROVIDER.maximumPieceCount, 8);
    assert.equal(REMOTE_PROVIDER.completePieceCoverage, 7);
    assert.equal(REMOTE_PROVIDER.runtimeEligibility, false);
    assert.deepEqual(REMOTE_PROVIDER.supportedVariants, ['standard']);
});

test('eligibility accepts supported standard positions and rejects unsafe input', () => {
    assert.equal(validateRemoteEligibility(FEN).status, 'eligible');
    assert.equal(validateRemoteEligibility('not fen').status, 'invalid-fen');
    assert.equal(validateRemoteEligibility('8/8/8/8/8/8/4k3/4K3 w - - 0 1').status, 'invalid-fen');
    assert.equal(validateRemoteEligibility('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1').status, 'invalid-fen');
    assert.equal(validateRemoteEligibility(FEN, { variant: 'atomic' }).status, 'unsupported-variant');
    assert.equal(validateRemoteEligibility('4k3/pppp4/8/8/8/8/PPPP4/4K3 w - - 0 1').status, 'unsupported-piece-count');
});

test('normalization validates moves and binds request, response, position, and evidence digests', () => {
    const evidence = normalizeTablebaseResponse({
        positionId: 'p1', fen: FEN, positionContentDigest: DIGEST,
        body: winFixture, retrievedAt: '2026-07-25T00:00:00.000Z'
    });
    assert.equal(evidence.category, 'win');
    assert.deepEqual(evidence.wdlPreservingMoves, ['d4d5', 'd4c5']);
    assert.deepEqual(evidence.dtzOptimalMoves, ['d4d5']);
    assert.equal(evidence.moves[0].resultingFen, '8/8/5k2/3K4/8/8/P7/8 b - - 1 1');
    assert.match(evidence.requestDigest, /^sha256-[a-f0-9]{64}$/);
    assert.equal(evidence.responseDigest, sha256(winFixture));
    assert.equal(evidence.localTablebaseVerified, false);
    assert.equal(evidence.humanReviewedRemoteEvidence, false);
});

test('normalization covers draw, loss, cursed win, blessed loss, and optional fields', () => {
    for (const category of ['draw', 'loss', 'cursed-win', 'blessed-loss']) {
        const body = { category, moves: [{ uci: 'd4d5', san: 'Kd5', category: 'draw' }] };
        assert.equal(normalizeTablebaseResponse({
            positionId: category, fen: FEN, positionContentDigest: DIGEST, body,
            retrievedAt: '2026-07-25T00:00:00.000Z'
        }).category, category);
    }
});

test('malformed payload and illegal or mismatched provider moves fail closed', () => {
    assert.throws(() => normalizeTablebaseResponse({
        positionId: 'p', fen: FEN, positionContentDigest: DIGEST, body: {},
        retrievedAt: '2026-07-25T00:00:00.000Z'
    }), { code: 'invalid-response' });
    assert.throws(() => normalizeTablebaseResponse({
        positionId: 'p', fen: FEN, positionContentDigest: DIGEST,
        body: { category: 'win', moves: [{ uci: 'a2a8', san: 'a8=Q', category: 'loss' }] },
        retrievedAt: '2026-07-25T00:00:00.000Z'
    }), { code: 'invalid-move' });
    assert.throws(() => normalizeTablebaseResponse({
        positionId: 'p', fen: FEN, positionContentDigest: DIGEST,
        body: { category: 'win', moves: [{ uci: 'd4d5', san: 'Ke5', category: 'loss' }] },
        retrievedAt: '2026-07-25T00:00:00.000Z'
    }), { code: 'move-validation-failed' });
});

test('network adapter rejects redirect/content-type, retries bounded failures, and supports success', async () => {
    let calls = 0;
    const success = await fetchRemoteTablebase(FEN, { retries: 0, fetchImpl: async () => response(winFixture) });
    assert.equal(success.httpStatus, 200);
    await assert.rejects(fetchRemoteTablebase(FEN, {
        retries: 0, fetchImpl: async () => response({}, { status: 302 })
    }), { code: 'redirect-rejected' });
    await assert.rejects(fetchRemoteTablebase(FEN, {
        retries: 0, fetchImpl: async () => response({}, { contentType: 'text/html' })
    }), { code: 'invalid-content-type' });
    await assert.rejects(fetchRemoteTablebase(FEN, {
        retries: 0, fetchImpl: async () => response({}, { status: 400 })
    }), { code: 'provider-http-error' });
    await fetchRemoteTablebase(FEN, {
        retries: 2, fetchImpl: async () => {
            calls += 1;
            return calls < 3 ? response({}, { status: 503 }) : response(winFixture);
        }
    });
    assert.equal(calls, 3);
});

test('comparison separates technical observation from mandatory human interpretation', () => {
    const position = { objective: { type: 'only-move' } };
    const evidence = normalizeTablebaseResponse({
        positionId: 'p', fen: FEN, positionContentDigest: DIGEST, body: winFixture,
        retrievedAt: '2026-07-25T00:00:00.000Z'
    });
    const comparison = compareEvidence(position, {
        authoredExpectedMoveUci: 'd4e4', authoredAcceptedAlternativesUci: [], bestMove: 'd4d5'
    }, evidence);
    assert.equal(comparison.technicalClassification, 'authored-move-tablebase-invalid');
    assert.equal(comparison.requiresHumanInterpretation, true);
    assert.equal(ALLOWED_REVIEW_DECISIONS.length, 10);
});

test('eight committed review packets bind evidence and leave every human decision empty', async () => {
    const directory = resolve('endgame-pools/private/review-packets');
    const files = (await readdir(directory)).filter((file) => file.endsWith('.json') && file !== 'index.json');
    assert.equal(files.length, 8);
    for (const file of files) {
        const packet = JSON.parse(await readFile(resolve(directory, file), 'utf8'));
        assert.match(packet.positionContentDigest, /^sha256-[a-f0-9]{64}$/);
        assert.match(packet.engineEvidenceSummary.engineEvidenceDigest, /^sha256-[a-f0-9]{64}$/);
        assert.match(packet.tablebaseEvidenceSummary.remoteEvidenceDigest, /^sha256-[a-f0-9]{64}$/);
        const { packetDigest, ...packetBase } = packet;
        assert.equal(packetDigest, sha256(packetBase));
        assert.deepEqual(
            Object.values(packet.reviewTemplate).slice(0, 4),
            [null, null, null, null]
        );
        assert.deepEqual(packet.allowedReviewDecisions, ALLOWED_REVIEW_DECISIONS);
        assert.equal(packet.tablebaseEvidenceSummary.localTablebaseVerified, false);
        assert.equal(packet.tablebaseEvidenceSummary.humanReviewedRemoteEvidence, false);
    }
});

test('remote evidence, packets, tooling, tests, and reports remain protected', () => {
    for (const path of [
        'endgame-pools/private/remote-tablebase/kp-opposition-near-miss.json',
        'endgame-pools/private/review-packets/kp-opposition-near-miss.json',
        'scripts/endgame-remote-tablebase.mjs',
        'tests/endgame-pools/remote-tablebase-evidence.test.js',
        'docs/verification/SEASON_10_5A_HUMAN_CHESS_REVIEW_PACKET_SUMMARY.md'
    ]) assert.equal(isProtectedPublicPath(path), true, path);
});
