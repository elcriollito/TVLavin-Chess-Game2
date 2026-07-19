import test from 'node:test';
import assert from 'node:assert/strict';
import { extractPositionFeatures, FEATURE_EXTRACTION_VERSION } from '../../js/endgame-trainer/endgame-position-features.js';
import { scoreEndgamePosition, SCORING_VERSION } from '../../js/endgame-trainer/endgame-position-scorer.js';
import { classifyExercise, CLASSIFIER_VERSION } from '../../js/endgame-trainer/endgame-exercise-classifier.js';
import { compareEndgameCandidates, selectBestEndgameCandidate, SELECTOR_VERSION } from '../../js/endgame-trainer/endgame-candidate-selector.js';
import { positionKey } from '../../js/endgame-trainer/endgame-fen-utils.js';
import { ChessRulesFacade } from '../../js/endgame-trainer/chess-rules-facade.js';
import { SCORING_FIXTURES as F } from './scoring-fixtures.js';

const codes = (rules) => rules.map((item) => item.code);

test('feature extraction is deterministic and independently matches geometry', () => {
    const first = extractPositionFeatures(F.kqkReasonable.fen, F.kqkReasonable);
    const second = extractPositionFeatures(F.kqkReasonable.fen, F.kqkReasonable);
    assert.deepEqual(first, second);
    assert.equal(first.version, FEATURE_EXTRACTION_VERSION);
    assert.equal(first.pieceCount, 3);
    assert.equal(first.sideToMove, 'white');
    assert.equal(first.kingDistance, 6); // c2 to h8, Chebyshev.
    assert.equal(first.minimumPieceDistance, 2); // c2 to e4.
    assert.equal(first.occupiedBoundingBoxArea, 42); // c..h by ranks 2..8.
    assert.equal(first.clusteringRatio, 3 / 42);
    assert.equal(first.immediateCaptureCount, 0);
});

test('one-ply features identify hanging majors and promotion without using scorer as oracle', () => {
    const queen = extractPositionFeatures(F.queenHanging.fen, F.queenHanging);
    const rook = extractPositionFeatures(F.rookHanging.fen, F.rookHanging);
    const promotion = extractPositionFeatures(F.promotionInOne.fen, F.promotionInOne);
    assert.equal(queen.immediateCaptureCount, 1);
    assert.equal(queen.hangingMajorPieceCount, 1);
    assert.equal(rook.immediateCaptureCount, 1);
    assert.equal(rook.hangingMajorPieceCount, 1);
    assert.equal(promotion.promotionInOneCount, 4); // q/r/b/n choices.
    assert.equal(promotion.uniquePromotionOpportunityCount, 1);
    assert.deepEqual(promotion.pawnAdvanceDistance.white, [1]);
    const promotionMoves = ChessRulesFacade.fromFen(F.promotionInOne.fen).legalMoves({ verbose: true }).filter((move) => move.promotion);
    assert.equal(new Set(promotionMoves.map((move) => `${move.from}-${move.to}`)).size, 1);
    const penalty = scoreEndgamePosition(F.promotionInOne.fen, F.promotionInOne).penalties.find((item) => item.code === 'promotion-in-one-not-requested');
    assert.equal(penalty.weight, -28);
    assert.equal(penalty.observed, 1);
});

test('SAN check detection covers normal, mate, promotion and capture checks', () => {
    const cases = [
        [F.promotionWithCheck.fen, ['g8=R+', 'g8=Q+']],
        [F.captureWithCheck.fen, ['Rxa7+']],
        [F.captureMate.fen, ['Qxg7#']]
    ];
    for (const [fen, expected] of cases) {
        const sans = ChessRulesFacade.fromFen(fen).legalMoves({ verbose: true }).filter((move) => /[+#]$/.test(move.san)).map((move) => move.san);
        for (const san of expected) assert.ok(sans.includes(san), `${san}: ${sans}`);
        assert.equal(extractPositionFeatures(fen).checkingMoveCount, sans.length);
    }
});

test('capture features count only legal captures and deduplicate major targets', () => {
    const pinned = extractPositionFeatures(F.pinnedMajorNotCapturable.fen);
    assert.equal(pinned.hangingMajorPieceCount, 0);
    const mate = extractPositionFeatures(F.captureMate.fen);
    const legalCaptures = ChessRulesFacade.fromFen(F.captureMate.fen).legalMoves({ verbose: true }).filter((move) => move.captured);
    assert.equal(mate.immediateCaptureCount, legalCaptures.length);
    assert.ok(legalCaptures.some((move) => move.san === 'Qxg7#'));
});

test('opposition, clustering, dispersion and FEN errors are descriptive', () => {
    assert.equal(extractPositionFeatures(F.opposition.fen, F.opposition).oppositionPattern, 'direct');
    const clustered = extractPositionFeatures(F.clustered.fen, F.clustered);
    assert.ok(clustered.clusteringRatio >= 0.5);
    assert.ok(extractPositionFeatures(F.dispersed.fen, F.dispersed).occupiedBoundingBoxArea > 42);
    assert.equal(extractPositionFeatures('bad fen').error.code, 'invalid-fen');
});

test('category clustering thresholds preserve pedagogical interaction and reject artificial packing', () => {
    for (const fixture of [F.kpkReasonable, F.kpkpReasonable, F.opposition]) {
        assert.ok(!codes(scoreEndgamePosition(fixture.fen, fixture).penalties).includes('excessive-clustering'));
    }
    assert.ok(codes(scoreEndgamePosition(F.clustered.fen, F.clustered).penalties).includes('excessive-clustering'));
    assert.equal(scoreEndgamePosition(F.kqkReasonable.fen, F.kqkReasonable).accepted, true);
});

test('scorer is deterministic, bounded, versioned and explainable', () => {
    for (const fixture of Object.values(F).filter((item) => item.categoryId)) {
        const options = { categoryId: fixture.categoryId, strongSide: fixture.strongSide };
        const first = scoreEndgamePosition(fixture.fen, options);
        const second = scoreEndgamePosition(fixture.fen, options);
        assert.deepEqual(first, second);
        assert.ok(first.score >= 0 && first.score <= 100);
        assert.equal(first.version, SCORING_VERSION);
        for (const item of [...first.penalties, ...first.bonuses]) {
            assert.equal(typeof item.code, 'string'); assert.equal(typeof item.weight, 'number');
            assert.ok('observed' in item); assert.equal(typeof item.message, 'string');
        }
        const reconstructed = Math.max(0, Math.min(100, 50 + [...first.penalties, ...first.bonuses].reduce((sum, item) => sum + item.weight, 0)));
        assert.equal(first.score, reconstructed);
    }
});

test('general and category penalties are applied to manual fixtures', () => {
    assert.ok(codes(scoreEndgamePosition(F.queenHanging.fen, F.queenHanging).penalties).includes('immediate-major-capture'));
    assert.ok(codes(scoreEndgamePosition(F.rookHanging.fen, F.rookHanging).penalties).includes('immediate-major-capture'));
    assert.ok(codes(scoreEndgamePosition(F.promotionInOne.fen, F.promotionInOne).penalties).includes('promotion-in-one-not-requested'));
    assert.ok(codes(scoreEndgamePosition(F.checkmate.fen, F.checkmate).penalties).includes('terminal-position'));
    assert.ok(codes(scoreEndgamePosition(F.stalemate.fen, F.stalemate).penalties).includes('no-legal-moves'));
    assert.ok(codes(scoreEndgamePosition(F.insufficient.fen, F.insufficient).penalties).includes('insufficient-material'));
    assert.ok(codes(scoreEndgamePosition(F.clustered.fen, F.clustered).penalties).includes('excessive-clustering'));
    assert.ok(codes(scoreEndgamePosition(F.dispersed.fen, F.dispersed).penalties).includes('excessive-dispersion'));
    assert.equal(extractPositionFeatures(F.onlyOneLegalMove.fen, F.onlyOneLegalMove).legalMoveCount, 1);
    assert.ok(codes(scoreEndgamePosition(F.onlyOneLegalMove.fen, F.onlyOneLegalMove).penalties).includes('only-one-legal-move'));
});

test('bonuses reflect explicit interaction rules rather than legality alone', () => {
    const kpk = scoreEndgamePosition(F.kpkReasonable.fen, F.kpkReasonable);
    assert.ok(codes(kpk.bonuses).includes('reasonable-mobility'));
    assert.ok(codes(kpk.bonuses).includes('king-activity-structure'));
    const opposition = scoreEndgamePosition(F.opposition.fen, F.opposition);
    assert.ok(codes(opposition.bonuses).includes('opposition-pattern-present'));
});

test('repeated positions are penalized deterministically', () => {
    const key = positionKey(F.kqkReasonable.fen);
    const fresh = scoreEndgamePosition(F.kqkReasonable.fen, F.kqkReasonable);
    const repeated = scoreEndgamePosition(F.kqkReasonable.fen, { ...F.kqkReasonable, recentPositionKeys: [key] });
    assert.equal(repeated.score, Math.max(0, fresh.score - 20));
    assert.ok(codes(repeated.penalties).includes('repeated-position'));
});

test('classifier stays descriptive, bounded and free of WDL verdict labels', () => {
    for (const fixture of [F.kqkReasonable, F.kpkReasonable, F.kpkpReasonable, F.opposition]) {
        const scoring = scoreEndgamePosition(fixture.fen, fixture);
        const result = classifyExercise(fixture.fen, scoring.features, scoring);
        assert.equal(result.version, CLASSIFIER_VERSION);
        assert.ok(result.confidence >= 0 && result.confidence <= 1);
        assert.doesNotMatch(JSON.stringify(result), /exact-win|exact-draw|exact-loss|winning-position|losing-position|forced-win|hold-the-draw/);
    }
});

test('classifier priority is low-quality, major-piece practice, opposition, then pawn category', () => {
    const oppositionScoring = scoreEndgamePosition(F.opposition.fen, F.opposition);
    assert.equal(classifyExercise(F.opposition.fen, oppositionScoring.features, oppositionScoring).type, 'opposition-pattern');
    const balanced = scoreEndgamePosition(F.kpkpReasonable.fen, F.kpkpReasonable);
    const withOpposition = { ...balanced.features, oppositionPattern: 'direct' };
    assert.equal(classifyExercise(F.kpkpReasonable.fen, withOpposition, balanced).type, 'opposition-pattern');
    assert.equal(classifyExercise(F.opposition.fen, oppositionScoring.features, { ...oppositionScoring, accepted: false }).type, 'low-quality-candidate');
    const mate = scoreEndgamePosition(F.kqkReasonable.fen, F.kqkReasonable);
    assert.equal(classifyExercise(F.kqkReasonable.fen, mate.features, { ...mate, accepted: false }).type, 'low-quality-candidate');
});

test('selector is reproducible, threshold-aware and uses explicit fallback', () => {
    const options = { categoryId: 'KPK', seed: 'selector-repeat', candidateCount: 10, minimumScore: 55 };
    assert.deepEqual(selectBestEndgameCandidate(options), selectBestEndgameCandidate(options));
    const fallback = selectBestEndgameCandidate({ categoryId: 'KQK', seed: 'fb-0', candidateCount: 1, minimumScore: 100 });
    assert.equal(fallback.ok, true);
    assert.equal(fallback.fallbackUsed, true);
    assert.equal(fallback.candidatesAccepted, 0);
    assert.deepEqual(fallback.warnings, [{ code: 'no-candidate-met-threshold' }]);
    assert.equal(fallback.version, SELECTOR_VERSION);
});

test('selector repetition handling and tie-break remain stable', () => {
    const base = { categoryId: 'KRK', seed: 'tie-break', candidateCount: 20, minimumScore: 0 };
    const first = selectBestEndgameCandidate(base);
    const repeated = selectBestEndgameCandidate({ ...base, recentPositionKeys: [first.selected.positionKey] });
    assert.equal(first.ok, true); assert.equal(repeated.ok, true);
    assert.notEqual(repeated.selected.positionKey, first.selected.positionKey);
    assert.deepEqual(repeated, selectBestEndgameCandidate({ ...base, recentPositionKeys: [first.selected.positionKey] }));
});

test('candidate comparator follows every tie-break with controlled fixtures', () => {
    const candidate = (score, penalties, diversity, generationIndex, key) => ({
        scoring: { score, penalties: Array.from({ length: penalties }, () => ({})) },
        diversity, generationIndex, positionKey: key
    });
    assert.ok(compareEndgameCandidates(candidate(90, 1, 1, 0, 'a'), candidate(80, 0, 1, 0, 'a')) < 0);
    assert.ok(compareEndgameCandidates(candidate(90, 0, 1, 0, 'a'), candidate(90, 1, 1, 0, 'a')) < 0);
    assert.ok(compareEndgameCandidates(candidate(90, 0, 1, 0, 'a'), candidate(90, 0, 0, 0, 'a')) < 0);
    assert.ok(compareEndgameCandidates(candidate(90, 0, 1, 1, 'a'), candidate(90, 0, 1, 2, 'a')) < 0);
    assert.ok(compareEndgameCandidates(candidate(90, 0, 1, 1, 'a'), candidate(90, 0, 1, 1, 'b')) < 0);
});

test('external result mutation cannot contaminate thresholds or later calls', () => {
    const options = { categoryId: 'KPK', strongSide: 'white' };
    const first = scoreEndgamePosition(F.kpkReasonable.fen, options);
    const expected = scoreEndgamePosition(F.kpkReasonable.fen, options);
    first.penalties.push({ code: 'external', weight: -100 });
    first.bonuses.length = 0;
    first.features.pieceCount = 99;
    assert.deepEqual(scoreEndgamePosition(F.kpkReasonable.fen, options), expected);
    assert.throws(() => { expected.bonuses[0].weight = 999; }, TypeError);
});

test('selector option failures are structured and loops are bounded', () => {
    const cases = [
        [{ categoryId: 'BAD' }, 'unknown-category'],
        [{ categoryId: 'KQK', candidateCount: 0 }, 'invalid-candidate-count'],
        [{ categoryId: 'KQK', candidateCount: 101 }, 'invalid-candidate-count'],
        [{ categoryId: 'KQK', minimumScore: -1 }, 'invalid-minimum-score'],
        [{ categoryId: 'KQK', recentPositionKeys: 'bad' }, 'invalid-recent-position-keys']
    ];
    for (const [options, code] of cases) assert.equal(selectBestEndgameCandidate(options).error.code, code);
    assert.equal(selectBestEndgameCandidate({ categoryId: 'KQK', candidateCount: 100 }).candidatesEvaluated, 100);
    assert.equal(selectBestEndgameCandidate({ categoryId: 'KQK', candidateCount: 1 }).candidatesEvaluated, 1);
    assert.equal(selectBestEndgameCandidate({ categoryId: 'KQK', generatorOptions: { rng: () => 0.5 } }).error.code, 'no-candidate-available');
});
