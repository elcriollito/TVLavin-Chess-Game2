import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
    APPROVED_DECISIONS, REVIEWER_REFERENCE, REVIEW_REVISION, registerDecision
} from '../../scripts/register-season-10-5b-adjudications.mjs';
import { nodeSha256 } from '../../scripts/endgame-verification-contracts.mjs';
import { sha256 } from '../../scripts/endgame-remote-tablebase.mjs';
import { ChessRulesFacade } from '../../js/endgame-trainer/chess-rules-facade.js';
import { DEFAULT_CURATED_POOL, getCuratedPoolDescriptor } from '../../js/endgame-trainer/v2/curated-pool-consumer.js';

const json = async (path) => JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'));
const source100 = await json('../../endgame-pools/authoring/pools/caissa-king-pawn-decisions-1.0.0.json');
const source110 = await json('../../endgame-pools/authoring/pools/caissa-king-pawn-decisions-1.1.0.json');
const pool100 = await json('../../public/data/endgame-pools/caissa-king-pawn-decisions/1.0.0.json');
const pool110 = await json('../../public/data/endgame-pools/caissa-king-pawn-decisions/1.1.0.json');
const manifest = await json('../../public/data/endgame-pools/manifest-1.0.0.json');
const bundle = await json('../../endgame-pools/private/human-adjudications/season-10.5b-king-pawn-decisions.json');
const reuse = await json('../../endgame-pools/private/evidence/caissa-king-pawn-decisions-1.1.0.remote-tablebase-reuse.json');
const engine = await json('../../endgame-pools/private/evidence/caissa-king-pawn-decisions-1.1.0.stockfish-18.json');
const byId = (source, id) => source.positions.find((position) => position.positionId === id);
const expected = {
    'kp-safe-king-approach': ['Kf3', ['Ke2', 'Kg2', 'Kg3'], 'authored-move'],
    'kp-restrained-approach': ['Kb4', ['Kb3', 'Kd3'], 'authored-move'],
    'kp-key-square-approach': ['Kc5', ['Kd4'], 'authored-move'],
    'kp-breakthrough-side-to-move': ['b6', [], 'authored-move'],
    'kp-outside-passer-diversion': ['f5', ['a5'], 'authored-move'],
    'kp-opposition-near-miss': ['Kd5', ['Kc5'], 'authored-move'],
    'kp-coordinate-support': ['Ke6', ['Kf6'], 'authored-move'],
    'kp-majority-improve-first': ['hxg5', ['fxg5', 'gxf5'], 'authored-move']
};

test('all eight original unresolved packets register against exact approved bindings', async () => {
    assert.equal(bundle.decisions.length, 8);
    assert.equal(bundle.reviewerReference, REVIEWER_REFERENCE);
    assert.equal(bundle.reviewRevision, REVIEW_REVISION);
    const { bundleDigest, ...base } = bundle;
    assert.equal(bundleDigest, sha256(base));
    for (const [id, decision] of Object.entries(APPROVED_DECISIONS)) {
        const packet = await json(`../../endgame-pools/private/review-packets/${id}.json`);
        const registered = registerDecision(packet, decision);
        assert.equal(registered.packetStateBefore, 'unresolved');
        assert.equal(registered.packetStateAfter, 'adjudicated');
        assert.equal(registered.reviewerReference, REVIEWER_REFERENCE);
        assert.ok(registered.reviewRationale.length > 20);
    }
});

test('registration rejects forged, incomplete, duplicate, and stale decisions', async () => {
    const id = 'kp-safe-king-approach';
    const packet = await json(`../../endgame-pools/private/review-packets/${id}.json`);
    const decision = APPROVED_DECISIONS[id];
    assert.throws(() => registerDecision(packet, { ...decision, reviewDecision: 'invented' }), { code: 'invalid-review-decision' });
    assert.throws(() => registerDecision(packet, { ...decision, rationale: '' }), { code: 'incomplete-human-review' });
    assert.throws(() => registerDecision(packet, decision, { reviewerReference: 'forged', reviewRevision: '1' }), { code: 'incomplete-human-review' });
    assert.throws(() => registerDecision({ ...packet, reviewTemplate: { ...packet.reviewTemplate, reviewDecision: 'already' } }, decision), { code: 'packet-already-adjudicated' });
    for (let index = 0; index < 3; index += 1) {
        const stale = structuredClone(decision);
        stale.digests[index] = `sha256-${'0'.repeat(64)}`;
        assert.throws(() => registerDecision(packet, stale), { code: 'stale-human-review' });
    }
});

test('exactly the eight approved positions change and every approved move is legal and unique', () => {
    const changed = [];
    for (const original of source100.positions) {
        const revised = byId(source110, original.positionId);
        if (JSON.stringify(original) !== JSON.stringify(revised)) changed.push(original.positionId);
    }
    assert.deepEqual(changed.sort(), Object.keys(expected).sort());
    for (const [id, [primary, alternatives, objective]] of Object.entries(expected)) {
        const position = byId(source110, id);
        assert.equal(position.expectedMove, primary);
        assert.deepEqual(position.acceptedAlternatives, alternatives);
        assert.equal(position.objective.type, objective);
        assert.equal(position.difficulty.onlyMove, false);
        const rules = ChessRulesFacade.fromFen(position.fen);
        const normalized = [rules.move(primary).lan];
        for (const alternative of alternatives) {
            rules.loadFen(position.fen);
            normalized.push(rules.move(alternative).lan);
        }
        assert.equal(new Set(normalized).size, normalized.length);
    }
});

test('approved copy changes are exact and no corrected activity claims only-move', () => {
    assert.equal(byId(source110, 'kp-opposition-near-miss').hintStages[0].text,
        'Advance the king while preserving the winning king geometry.');
    assert.equal(byId(source110, 'kp-coordinate-support').feedback.correct,
        'Correct. The king moves ahead and remains ready to escort the pawn.');
    assert.equal(byId(source110, 'kp-majority-improve-first').objective.label,
        'Transform the pawn majority before the opponent can hold the structure.');
    assert.equal(byId(source110, 'kp-breakthrough-side-to-move').objective.label,
        'Play the thematic central-pawn breakthrough.');
    for (const id of Object.keys(expected)) assert.doesNotMatch(byId(source110, id).objective.label, /only move/i);
});

test('1.0.0 remains historical while 1.1.0 has a distinct immutable identity', () => {
    assert.equal(pool100.contentFingerprint, 'epool-fnv1a32-7f150692');
    assert.equal(nodeSha256(pool100), 'sha256-edf0ca70dccbafb2638e2661213e82d600214402aa7c3f305d4f836c87ba7984');
    assert.equal(pool110.poolVersion, '1.1.0');
    assert.equal(pool110.positionCount, 10);
    assert.notEqual(pool110.contentFingerprint, pool100.contentFingerprint);
    assert.notEqual(nodeSha256(pool110), nodeSha256(pool100));
    assert.equal(manifest.pools.length, 2);
    assert.ok(manifest.pools.some(({ poolVersion }) => poolVersion === '1.0.0'));
    assert.ok(manifest.pools.some(({ poolVersion }) => poolVersion === '1.1.0'));
    assert.equal(JSON.stringify(manifest).includes('latest'), false);
});

test('public summary is truthful and private evidence binds revised content', () => {
    assert.deepEqual(pool110.verificationSummary, {
        editoriallyApprovedCount: 10,
        engineEvidenceAvailableCount: 10,
        engineEvidenceHumanReviewedCount: 8,
        engineReviewedCount: 0,
        humanAdjudicatedCount: 8,
        legalityVerified: true,
        localTablebaseVerifiedCount: 0,
        remoteTablebaseEvidenceAvailableCount: 8,
        rulesVerified: true,
        tablebaseVerifiedCount: 0
    });
    assert.equal(reuse.records.length, 8);
    assert.equal(engine.records.length, 10);
    const engineById = new Map(engine.records.map((record) => [record.positionId, record]));
    for (const record of reuse.records)
        assert.equal(record.revisedPositionContentDigest, engineById.get(record.positionId).positionContentDigest);
});

test('Quick Challenge defaults only to allowlisted 1.1.0 while 1.0.0 remains addressable', () => {
    assert.deepEqual(DEFAULT_CURATED_POOL, {
        poolId: 'caissa-king-pawn-decisions', poolVersion: '1.1.0'
    });
    assert.ok(getCuratedPoolDescriptor('caissa-king-pawn-decisions', '1.0.0'));
    assert.ok(getCuratedPoolDescriptor('caissa-king-pawn-decisions', '1.1.0'));
    assert.equal(getCuratedPoolDescriptor('caissa-king-pawn-decisions', 'latest'), null);
});
