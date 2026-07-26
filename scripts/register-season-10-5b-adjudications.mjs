import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ChessRulesFacade } from '../js/endgame-trainer/chess-rules-facade.js';
import { stableStringify } from '../js/endgame-trainer/v2/curated-pool-validator.js';
import {
    nodeSha256, reviewablePoolContent
} from './endgame-verification-contracts.mjs';
import {
    ALLOWED_REVIEW_DECISIONS, sha256
} from './endgame-remote-tablebase.mjs';

export const ADJUDICATION_BUNDLE_SCHEMA_VERSION = '1.0.0';
export const REVIEWER_REFERENCE = 'reviewer:alexander:season-10.5b';
export const REVIEW_REVISION = '1';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = resolve(ROOT, 'endgame-pools/authoring/pools/caissa-king-pawn-decisions-1.0.0.json');
const targetPath = resolve(ROOT, 'endgame-pools/authoring/pools/caissa-king-pawn-decisions-1.1.0.json');
const reviewPath = resolve(ROOT, 'endgame-pools/private/reviews/caissa-king-pawn-decisions-1.1.0.review.json');
const bundlePath = resolve(ROOT, 'endgame-pools/private/human-adjudications/season-10.5b-king-pawn-decisions.json');
const reusePath = resolve(ROOT, 'endgame-pools/private/evidence/caissa-king-pawn-decisions-1.1.0.remote-tablebase-reuse.json');
const packetDirectory = resolve(ROOT, 'endgame-pools/private/review-packets');

export const APPROVED_DECISIONS = Object.freeze({
    'kp-safe-king-approach': {
        reviewDecision: 'accepted-alternative-required',
        expectedMove: 'Kf3', acceptedAlternatives: ['Ke2', 'Kg2', 'Kg3'],
        rationale: 'The authored move Kf3 is theoretically winning and clearly satisfies the instructional goal of activating the king while remaining coordinated with the pawn. However, tablebase evidence shows that Kf3 is not unique. Ke2, Kg2, and Kg3 also preserve the win and demonstrate the same safe king-coordination concept, so they should be accepted alternatives. The winning moves e4, Ke1, Kf1, and Kg1 are not accepted for this activity because they do not demonstrate the specific learner objective of choosing an active king route near the pawn.',
        digests: ['sha256-f48e37ab1bbc07c9e8d3dffc995f57e51af94f74d5299917833fdda8720f2976', 'sha256-1e066c601a30b70ea109c32a673414cede9eb792af9a68626b276825088639bb', 'sha256-b60e0e35e8d7a323b2810d2791873287b340e1333d9cb3c1f48f2c79d6f7c42b']
    },
    'kp-restrained-approach': {
        reviewDecision: 'accepted-alternative-required',
        expectedMove: 'Kb4', acceptedAlternatives: ['Kb3', 'Kd3'],
        rationale: 'The authored move Kb4 is theoretically valid and satisfies the instructional goal of approaching the fixed pawn without releasing the restraint. Kb3, which is also the Stockfish preference, demonstrates the same safe route. Kd3 should additionally be accepted because it approaches the fixed pawn directly while preserving the locked pawn structure. The tablebase-preserving moves Kb2, Kc2, and Kd2 are not accepted for this activity because they retreat and do not clearly demonstrate the intended concept of improving the king’s approach toward the fixed weakness.',
        digests: ['sha256-50358003e133d2a766b3680d669717eda9c08468f13354ce0dc7c3219c739c73', 'sha256-35bac4a28016dc88a4fdd734e686416ed08e0e80180c6e213aee4b83bae31fba', 'sha256-c1f1db0a6752b5acc33792be39fd1ec9e07ae43fcb1a08efda9767a65d501549']
    },
    'kp-key-square-approach': {
        reviewDecision: 'position-valid-but-not-only-move',
        expectedMove: 'Kc5', acceptedAlternatives: ['Kd4'], objectiveLabel: 'Find an authored move.',
        rationale: 'The authored move Kc5 is pedagogically valid because it activates the king, maintains coordination with the pawn, and approaches the useful key-square zone. However, tablebase evidence proves that Kc5 is not the only move that preserves the theoretical result. Kd4 should also be accepted because it directly supports the pawn and demonstrates the same king-coordination concept. The activity should therefore be changed from only-move to authored-move while preserving Kc5 as the principal instructional answer. Other tablebase-preserving moves are not accepted because they do not demonstrate the specific learner objective as clearly.',
        digests: ['sha256-36e2cc23e01b579c145f68a0aa683a6a02f07273c727e21fa7180a952cfd61ca', 'sha256-09bd4d4c8b2af224cf92703b587d31e83f0adb7014f62638370e7bd381b3831a', 'sha256-8d84f8758ec08145542f13af8b7b38656309fff84bb0f7e0a0cf7c1516fd81d2']
    },
    'kp-breakthrough-side-to-move': {
        reviewDecision: 'position-valid-but-not-only-move',
        expectedMove: 'b6', acceptedAlternatives: [], objectiveLabel: 'Play the thematic central-pawn breakthrough.',
        rationale: 'The authored move b6 is pedagogically valid because the activity is designed to test recognition of the thematic central-pawn breakthrough in the three-pawn formation. However, the available tablebase evidence does not support an only-move claim: a6, c6, and several king moves also preserve the reported remote category. The activity should therefore change from only-move to authored-move and explicitly ask for the thematic central breakthrough. No alternatives are added because the other preserving moves do not demonstrate the specific instructional concept being assessed. The remote result is partial and provides no DTZ ordering, so this decision does not claim that b6 is the uniquely best move in the full chess position.',
        digests: ['sha256-da8f978676c0adf91f1bc56ae5e8e888f0991c10e51d2d4a73976f3794aca94a', 'sha256-de891d78878e6a9d19cd5fbc94b61320ea59f160871df917cbe6fa4d40e8304c', 'sha256-a5c46e9e2c53f16c7148d81d1dd7765cf82513faceacd4de5bb72f6199df6f60']
    },
    'kp-outside-passer-diversion': {
        reviewDecision: 'position-needs-correction',
        expectedMove: 'f5', acceptedAlternatives: ['a5'], objectiveLabel: 'Find an authored move.',
        rationale: 'The position remains pedagogically useful, but the authored primary move should be corrected. With the black king already located on the queenside, f5 demonstrates the outside-passer diversion more clearly than a5 because it advances the pawn farthest from the defending king and tests whether the king can reach the opposite wing. Tablebase evidence confirms that both f5 and a5 preserve the theoretical win, so a5 should remain an accepted alternative rather than being marked incorrect. The activity must change from only-move to authored-move because several pawn and king moves also preserve the win. King moves are not accepted for this activity because they do not demonstrate the specific outside-passer diversion being assessed.',
        digests: ['sha256-39b739776c0dc1e721e3d619e7f9ca7904606518c0245383377fc74d465f76c1', 'sha256-9fde01b1b265f8b9513ab417d3ae3309e51728557bd0dbcc335df85d54136fe8', 'sha256-4048b7ec02a949f3560d81f289e9d4e55b51ae6bb36c030a9c55003c12a75d78']
    },
    'kp-opposition-near-miss': {
        reviewDecision: 'position-needs-correction',
        expectedMove: 'Kd5', acceptedAlternatives: ['Kc5'], objectiveLabel: 'Find an authored move.',
        hint: 'Advance the king while preserving the winning king geometry.',
        correct: 'Correct. The king advances on a route that preserves the winning opposition geometry.',
        incorrect: 'Compare the forward king routes before stepping toward the opposing king.',
        rationale: 'The authored move Ke4 must be replaced because tablebase evidence shows that it does not preserve the theoretical win. Kd5 should become the principal answer because it is the Stockfish preference and advances the king while maintaining the winning king geometry. Kc5 must also be accepted because tablebase evidence confirms that it preserves the win through a second valid forward route. The activity should change from only-move to authored-move because two moves satisfy the chess requirement. The position remains useful for teaching king-route calculation and opposition geometry, but it must no longer present Ke4 or claim a unique winning move.',
        digests: ['sha256-997ea00de823dffd5fa7fc0d588a700a6fb8908d9742016a9e0a22a29da6a6f5', 'sha256-7aef1d4d4d2b42cb940856c1ca7a1754d3ecd75226875963c473628006e04198', 'sha256-e896d4a6346df13aa3f5817be661bf9889f0ed99144f92e50d812ed4e9fd7c96']
    },
    'kp-coordinate-support': {
        reviewDecision: 'position-needs-correction',
        expectedMove: 'Ke6', acceptedAlternatives: ['Kf6'], objectiveLabel: 'Find an authored move.',
        hint: 'Move the king ahead while keeping a clear support route for the pawn.',
        correct: 'Correct. The king moves ahead and remains ready to escort the pawn.',
        incorrect: 'Look for a forward king move that keeps the pawn securely supported.',
        rationale: 'The authored move Kd5 must be replaced because tablebase evidence shows that it does not preserve the theoretical win. Ke6 should become the principal answer because it is the Stockfish preference, is DTZ-optimal, and places the king ahead of the pawn while maintaining a direct supporting route. Kf6 must also be accepted because it is likewise DTZ-optimal and demonstrates the same active king-and-pawn coordination. The activity should change from only-move to authored-move because more than one move satisfies the intended chess and instructional requirement. Kf5 and Kf4 preserve the win but do not demonstrate the forward escorting concept as clearly.',
        digests: ['sha256-50d8e785332d770dd75862892b141dadc772a9523dea1f2f6767e16e8c6bca8d', 'sha256-e5c4c7c1f200949c3ece104bb879f07c9f0910f55954c9df1b61887c609a1813', 'sha256-473231eb64958acdf2cd91664f4c3958e547641550216a1c3a67b7617777e27a']
    },
    'kp-majority-improve-first': {
        reviewDecision: 'objective-needs-rewording',
        expectedMove: 'hxg5', acceptedAlternatives: ['fxg5', 'gxf5'],
        objectiveLabel: 'Transform the pawn majority before the opponent can hold the structure.',
        hint: 'Look for the pawn capture that transforms the blocked majority immediately.',
        correct: 'Correct. The pawn exchange activates the majority and preserves the win.',
        incorrect: 'The king move is too slow here. Calculate the immediate pawn exchanges.',
        rationale: 'The authored move Kf3 must be removed because tablebase evidence shows that it does not preserve the theoretical win. The current instruction to improve the king before committing the pawn majority is therefore inaccurate for this position. Hxg5 should become the principal answer because it is the Stockfish preference, is DTZ-optimal, and immediately transforms the pawn majority. Fxg5 must also be accepted because it is DTZ-optimal and demonstrates the same immediate transformation. Gxf5 should be accepted because it likewise preserves the win and activates the majority through a pawn exchange. The activity should change from only-move to authored-move and should teach that the pawn majority must be transformed immediately rather than preceded by Kf3. The tablebase-preserving king retreats are not accepted because they do not demonstrate the instructional concept being assessed.',
        digests: ['sha256-07e68159f7980f378adad82110aee1e131eeb9bfcbc61d0335b236e35a9857cf', 'sha256-236ee62fe63ab9aa7d6675f6e6bdfd84863d00a1dd107929ee30a85f5939ffd1', 'sha256-8354d317de963986736e8c6057c3001c1179f3d0e5d33442f55d490f9f6c48d5']
    }
});

const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));
const writeJson = async (path, value) => {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
};
const moveLan = (fen, move) => ChessRulesFacade.fromFen(fen).move(move).lan;

export function registerDecision(packet, decision, {
    reviewerReference = REVIEWER_REFERENCE,
    reviewRevision = REVIEW_REVISION
} = {}) {
    if (!packet || packet.reviewTemplate?.reviewDecision !== null)
        throw Object.assign(new Error('packet-already-adjudicated'), { code: 'packet-already-adjudicated' });
    if (!ALLOWED_REVIEW_DECISIONS.includes(decision.reviewDecision))
        throw Object.assign(new Error('invalid-review-decision'), { code: 'invalid-review-decision' });
    if (!decision.rationale || reviewerReference !== REVIEWER_REFERENCE || reviewRevision !== REVIEW_REVISION)
        throw Object.assign(new Error('incomplete-human-review'), { code: 'incomplete-human-review' });
    const actual = [
        packet.positionContentDigest,
        packet.engineEvidenceSummary.engineEvidenceDigest,
        packet.tablebaseEvidenceSummary.remoteEvidenceDigest
    ];
    if (actual.some((value, index) => value !== decision.digests[index]))
        throw Object.assign(new Error('stale-human-review'), { code: 'stale-human-review' });
    return {
        positionId: packet.positionId,
        packetId: packet.packetId,
        packetDigest: packet.packetDigest,
        packetStateBefore: 'unresolved',
        packetStateAfter: 'adjudicated',
        reviewDecision: decision.reviewDecision,
        reviewRationale: decision.rationale,
        reviewerReference,
        reviewRevision,
        reviewedPositionDigest: decision.digests[0],
        reviewedEngineEvidenceDigest: decision.digests[1],
        reviewedTablebaseEvidenceDigest: decision.digests[2]
    };
}

function applyDecision(position, decision) {
    const changedObjective = position.objective.type === 'only-move';
    const updated = structuredClone(position);
    updated.expectedMove = decision.expectedMove;
    updated.acceptedAlternatives = [...decision.acceptedAlternatives];
    if (changedObjective) {
        updated.objective = {
            ...updated.objective,
            type: 'authored-move',
            label: decision.objectiveLabel || 'Find an authored move.'
        };
        updated.difficulty.onlyMove = false;
    }
    if (decision.hint) updated.hintStages[0].text = decision.hint;
    if (decision.correct) updated.feedback.correct = decision.correct;
    if (decision.incorrect) updated.feedback.incorrect = decision.incorrect;
    updated.verification = {
        ...updated.verification,
        engineReviewed: false,
        tablebaseVerified: false,
        humanAdjudicated: true,
        engineEvidenceAvailable: true,
        engineEvidenceHumanReviewed: true,
        remoteTablebaseEvidenceAvailable: true,
        localTablebaseVerified: false
    };
    updated.editorial = {
        ...updated.editorial,
        reviewBasis: 'Season 10.5B human adjudication bound to Stockfish and remote tablebase evidence',
        notes: 'Approved authored instructional scope; machine-equivalent moves are accepted only when explicitly listed.'
    };
    moveLan(updated.fen, updated.expectedMove);
    const normalized = new Set([moveLan(updated.fen, updated.expectedMove)]);
    for (const alternative of updated.acceptedAlternatives) {
        const lan = moveLan(updated.fen, alternative);
        if (normalized.has(lan)) throw new Error(`duplicate-approved-move:${position.positionId}`);
        normalized.add(lan);
    }
    return updated;
}

export async function registerSeason105B() {
    const source = await readJson(sourcePath);
    const registrations = [];
    for (const position of source.positions) {
        const decision = APPROVED_DECISIONS[position.positionId];
        if (!decision) continue;
        const packet = await readJson(resolve(packetDirectory, `${position.positionId}.json`));
        registrations.push(registerDecision(packet, decision));
    }
    if (registrations.length !== 8) throw new Error('incomplete-adjudication-bundle');
    const bundleBase = {
        bundleSchemaVersion: ADJUDICATION_BUNDLE_SCHEMA_VERSION,
        bundleId: 'caissa-human-adjudications:season-10.5b:king-pawn-decisions',
        poolId: source.poolId,
        sourcePoolVersion: '1.0.0',
        targetPoolVersion: '1.1.0',
        reviewerReference: REVIEWER_REFERENCE,
        reviewRevision: REVIEW_REVISION,
        decisions: registrations
    };
    const bundle = { ...bundleBase, bundleDigest: sha256(bundleBase) };
    const target = structuredClone(source);
    target.poolVersion = '1.1.0';
    target.label = 'King and Pawn Endgames — Human Adjudicated';
    target.description = 'Ten curated king-and-pawn decisions incorporating Season 10.5B human adjudications.';
    target.compatibility = {
        classification: 'content-compatible-new-score-cohort',
        previousVersion: '1.0.0',
        scoreComparisonAcrossVersions: false
    };
    target.changelog = [
        'Registered eight digest-bound human adjudications.',
        'Corrected three primary moves, expanded authored alternatives, and removed six unsupported only-move claims.',
        'Preserved all FENs, provenance, scoring boundaries, and position membership.'
    ];
    target.positions = target.positions.map((position) =>
        APPROVED_DECISIONS[position.positionId]
            ? applyDecision(position, APPROVED_DECISIONS[position.positionId])
            : structuredClone(position));
    target.verificationEvidenceSummary = {
        humanAdjudicatedCount: 8,
        engineEvidenceAvailableCount: 10,
        engineEvidenceHumanReviewedCount: 8,
        remoteTablebaseEvidenceAvailableCount: 8,
        localTablebaseVerifiedCount: 0
    };
    const existingReview = await readJson(resolve(ROOT, 'endgame-pools/private/reviews/caissa-king-pawn-decisions-1.0.0.review.json'));
    const adjudicated = new Set(Object.keys(APPROVED_DECISIONS));
    const review = {
        reviewWorkflowVersion: '1.0.0',
        poolId: target.poolId,
        poolVersion: target.poolVersion,
        reviewedContentDigest: nodeSha256(reviewablePoolContent(target)),
        positionReviews: target.positions.map((position) => {
            const prior = existingReview.positionReviews.find((entry) => entry.positionId === position.positionId);
            if (!adjudicated.has(position.positionId)) return { ...prior };
            return {
                positionId: position.positionId,
                reviewStatus: 'publish-ready',
                authorReview: prior.authorReview,
                chessReview: {
                    reviewerReference: REVIEWER_REFERENCE,
                    reviewRole: 'chess-reviewer',
                    reviewRevision: REVIEW_REVISION
                },
                editorialApproval: {
                    reviewerReference: REVIEWER_REFERENCE,
                    reviewRole: 'editorial-approver',
                    reviewRevision: REVIEW_REVISION
                }
            };
        })
    };
    const reuseBase = {
        evidenceReuseSchemaVersion: '1.0.0',
        poolId: target.poolId,
        poolVersion: target.poolVersion,
        providerId: 'lichess-syzygy-remote',
        providerVersion: '1.0.0',
        reuseBasis: 'exact-fen-and-provider-request-identity-unchanged',
        localTablebaseVerified: false,
        records: []
    };
    for (const position of target.positions.filter(({ positionId }) => APPROVED_DECISIONS[positionId])) {
        const remote = await readJson(resolve(ROOT, `endgame-pools/private/remote-tablebase/${position.positionId}.json`));
        const expectedLan = moveLan(position.fen, position.expectedMove);
        const alternativeLans = position.acceptedAlternatives.map((move) => moveLan(position.fen, move));
        for (const move of [expectedLan, ...alternativeLans]) {
            if (!remote.moves.some(({ uci }) => uci === move) || !remote.wdlPreservingMoves.includes(move))
                throw new Error(`approved-move-not-supported-by-tablebase:${position.positionId}:${move}`);
        }
        const revisedPositionContentDigest = sha256({
            positionId: position.positionId,
            fen: position.fen,
            objective: position.objective,
            expectedMove: position.expectedMove,
            acceptedAlternatives: position.acceptedAlternatives
        });
        const recordBase = {
            positionId: position.positionId,
            exactFen: position.fen,
            revisedPositionContentDigest,
            reusedRemoteEvidenceDigest: remote.evidenceDigest,
            reusedRequestDigest: remote.requestDigest,
            approvedMoveLans: [expectedLan, ...alternativeLans],
            wdlPreservingMoves: remote.wdlPreservingMoves,
            dtzOptimalMoves: remote.dtzOptimalMoves,
            humanAdjudicationPacketDigest: registrations.find((entry) => entry.positionId === position.positionId).packetDigest,
            remoteTablebaseEvidenceAvailable: true,
            localTablebaseVerified: false
        };
        reuseBase.records.push({ ...recordBase, reuseRecordDigest: sha256(recordBase) });
    }
    const reuse = { ...reuseBase, evidenceReuseDigest: sha256(reuseBase) };
    await Promise.all([
        writeJson(bundlePath, bundle),
        writeJson(targetPath, target),
        writeJson(reviewPath, review),
        writeJson(reusePath, reuse)
    ]);
    return { bundle, target, review, reuse };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const result = await registerSeason105B();
    console.log(stableStringify({
        bundleDigest: result.bundle.bundleDigest,
        decisions: result.bundle.decisions.length,
        target: `${result.target.poolId}@${result.target.poolVersion}`
    }));
}
