import test from 'node:test';
import assert from 'node:assert/strict';
import { ChessRulesFacade } from '../../js/endgame-trainer/chess-rules-facade.js';
import {
    ENDGAME_SESSION_SCHEMA_VERSION,
    ENDGAME_V2_MODES,
    createEndgameSession,
    createQuickChallengeSession,
    scoreQuickChallengeResult,
    shouldActivateEndgameV2,
    validateEndgameSession,
    validateModeId,
    validateObjectiveId,
    validatePoolVersion,
    validatePositionSource
} from '../../js/endgame-trainer/v2/endgame-v2-contracts.js';
import {
    QUICK_CHALLENGE_FIXTURES,
    QUICK_CHALLENGE_FIXTURE_POOL_FINGERPRINT,
    QUICK_CHALLENGE_FIXTURE_POOL_VERSION,
    validateQuickChallengeFixturePool
} from '../../js/endgame-trainer/v2/quick-challenge-fixture-pool.js';

test('V2 activation is exact, opt-in, and never replaces Guided Study', () => {
    assert.equal(shouldActivateEndgameV2(''), false);
    assert.equal(shouldActivateEndgameV2('?trainerV2=true'), false);
    assert.equal(shouldActivateEndgameV2('?trainerV2=1'), true);
    assert.equal(shouldActivateEndgameV2('?trainerV2=1&studyUnit=direct-opposition'), false);
    assert.equal(shouldActivateEndgameV2('?trainerV2=1&release=v1'), false);
});

test('mode contract exposes exactly four modes with only Quick Challenge operational in-shell', () => {
    assert.deepEqual(ENDGAME_V2_MODES.map(({ id }) => id), [
        'quick-challenge', 'knowledge-practice', 'endgame-run', 'custom-lab'
    ]);
    assert.equal(ENDGAME_V2_MODES[0].availability, 'available');
    assert.equal(ENDGAME_V2_MODES[2].availability, 'coming-soon');
    for (const mode of ENDGAME_V2_MODES) {
        for (const field of ['contractVersion', 'description', 'defaultConfiguration', 'positionSource',
            'sessionLengthPolicy', 'timerPolicy', 'hintPolicy', 'scoringPolicy', 'evidencePolicy',
            'persistencePolicy', 'eligibility', 'availability']) assert.ok(field in mode, `${mode.id}.${field}`);
    }
    assert.equal(validateModeId('forged-mode'), false);
    assert.equal(validatePositionSource('curated-pool'), true);
    assert.equal(validatePositionSource('remote-code'), false);
    assert.equal(validateObjectiveId('only-move'), true);
    assert.equal(validateObjectiveId('authored-move'), true);
    assert.equal(validateObjectiveId('win-somehow'), false);
    assert.equal(validatePoolVersion('caissa-quick-challenge-technical-pilot', '1.0.0'), true);
    assert.equal(validatePoolVersion('caissa-king-pawn-decisions', '1.0.0'), true);
    assert.equal(validatePoolVersion('caissa-quick-challenge-technical-pilot', 'latest'), false);
});

test('fixture pool is a fixed five-item legal technical pilot', () => {
    assert.equal(QUICK_CHALLENGE_FIXTURE_POOL_VERSION, '1.0.0');
    assert.equal(QUICK_CHALLENGE_FIXTURE_POOL_FINGERPRINT, 'qc10.1:5:6b445474');
    assert.equal(QUICK_CHALLENGE_FIXTURES.length, 5);
    for (const item of QUICK_CHALLENGE_FIXTURES) {
        const rules = ChessRulesFacade.fromFen(item.fen);
        assert.equal(rules.sideToMove(), item.sideToMove);
        const played = rules.move({
            from: item.expectedMove.slice(0, 2),
            to: item.expectedMove.slice(2, 4),
            promotion: item.expectedMove.slice(4) || undefined
        });
        assert.equal(played.san, item.expectedSan);
        assert.equal(item.objective, 'Find the only move.');
        assert.equal(item.objectiveId, 'only-move');
        assert.equal(item.repeatPolicy, 'once-per-session');
        assert.equal(item.trustLevel, 'local-unverified');
        assert.match(item.integrity, /^qc0[1-5]-/);
        assert.ok(item.source.release);
        assert.equal(Object.isFrozen(item.source), true);
    }
    assert.equal(validateQuickChallengeFixturePool(QUICK_CHALLENGE_FIXTURES), true);
    assert.equal(validateQuickChallengeFixturePool(
        QUICK_CHALLENGE_FIXTURES.map((item, index) => index ? item : { ...item, expectedMove: 'a1a2' })
    ), false);
});

test('session schema 2.0.0 is minimal, serializable, and validates allowlists', () => {
    const session = createEndgameSession({
        sessionId: 'session-test', sourceId: 'fingerprint', sourceVersion: '1.0.0',
        poolId: 'pool', poolVersion: '1.0.0', now: 10
    });
    assert.equal(ENDGAME_SESSION_SCHEMA_VERSION, '2.0.0');
    assert.equal(validateEndgameSession(session), true);
    assert.equal(JSON.parse(JSON.stringify(session)).schemaVersion, '2.0.0');
    assert.equal(validateEndgameSession({ ...session, schemaVersion: '99.0.0' }), false);
    assert.equal(validateEndgameSession({ ...session, persistenceEligibility: 'cloud' }), false);
});

test('session shape rejects duplicates and score labels assistance honestly', () => {
    assert.throws(() => createQuickChallengeSession(QUICK_CHALLENGE_FIXTURES.slice(0, 4)));
    assert.throws(() => createQuickChallengeSession([
        ...QUICK_CHALLENGE_FIXTURES.slice(0, 4), QUICK_CHALLENGE_FIXTURES[0]
    ]));
    assert.equal(scoreQuickChallengeResult({ correct: true, hintUsed: false }), 100);
    assert.equal(scoreQuickChallengeResult({ correct: true, hintUsed: true }), 50);
    assert.equal(scoreQuickChallengeResult({ correct: false, hintUsed: false }), 0);
    assert.equal(scoreQuickChallengeResult({ correct: true, hintUsed: false, unavailable: true }), 0);
});
