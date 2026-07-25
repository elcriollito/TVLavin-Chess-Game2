import { createQuickChallengeSession } from './endgame-v2-contracts.js';

export const QUICK_CHALLENGE_FIXTURE_POOL_ID = 'caissa-quick-challenge-technical-pilot';
export const QUICK_CHALLENGE_FIXTURE_POOL_VERSION = '1.0.0';
export const QUICK_CHALLENGE_FIXTURE_POOL_FINGERPRINT = 'qc10.1:5:6b445474';

const SOURCE_RELEASE = 'endgame-knowledge-v1';

export const QUICK_CHALLENGE_FIXTURES = createQuickChallengeSession([
    {
        id: 'pawn-tension-independent-clarify',
        title: 'Clarify at the right moment',
        fen: '8/8/5k2/4p3/3P4/3K4/8/8 w - - 0 1',
        sideToMove: 'white',
        objective: 'Find the only move.', objectiveId: 'only-move', difficulty: 'foundation',
        verificationState: 'legal-authored-answer', integrity: 'qc01-7fb14d2e', repeatPolicy: 'once-per-session', trustLevel: 'local-unverified',
        expectedMove: 'd4e5',
        expectedSan: 'dxe5+',
        hint: 'Look for the pawn capture that changes the structure with tempo.',
        source: { release: SOURCE_RELEASE, unit: 'pawn-tension', activity: 'independent-clarify' }
    },
    {
        id: 'favorable-ending-liquidate',
        title: 'Choose the favorable exchange',
        fen: '8/8/3k4/3p4/2P1P3/3K4/8/8 w - - 0 1',
        sideToMove: 'white',
        objective: 'Find the only move.', objectiveId: 'only-move', difficulty: 'foundation',
        verificationState: 'legal-authored-answer', integrity: 'qc02-2e359491', repeatPolicy: 'once-per-session', trustLevel: 'local-unverified',
        expectedMove: 'c4d5',
        expectedSan: 'cxd5',
        hint: 'Consider which pawn exchange leaves the cleaner king ending.',
        source: { release: SOURCE_RELEASE, unit: 'favorable-king-ending', activity: 'independent-liquidate' }
    },
    {
        id: 'pawn-majority-activate-king',
        title: 'Activate before advancing',
        fen: '8/8/6k1/5pp1/5PPP/6K1/8/8 w - - 0 1',
        sideToMove: 'white',
        objective: 'Find the only move.', objectiveId: 'only-move', difficulty: 'foundation',
        verificationState: 'legal-authored-answer', integrity: 'qc03-6ba92a1f', repeatPolicy: 'once-per-session', trustLevel: 'local-unverified',
        expectedMove: 'g3f3',
        expectedSan: 'Kf3',
        hint: 'Improve the king before committing the pawn majority.',
        source: { release: SOURCE_RELEASE, unit: 'pawn-majority', activity: 'independent-activate' }
    },
    {
        id: 'exchange-passer-capture',
        title: 'Exchange into a passer',
        fen: '8/8/6k1/2p1p3/2PP4/2K5/8/8 b - - 0 1',
        sideToMove: 'black',
        objective: 'Find the only move.', objectiveId: 'only-move', difficulty: 'foundation',
        verificationState: 'legal-authored-answer', integrity: 'qc04-d324ca83', repeatPolicy: 'once-per-session', trustLevel: 'local-unverified',
        expectedMove: 'e5d4',
        expectedSan: 'exd4+',
        hint: 'The forcing capture creates the structural advantage.',
        source: { release: SOURCE_RELEASE, unit: 'exchange-into-passer', activity: 'independent-capture' }
    },
    {
        id: 'pawn-breakthrough-reserve',
        title: 'Begin the breakthrough',
        fen: '8/ppp5/8/PPP5/8/8/8/4K2k b - - 0 1',
        sideToMove: 'black',
        objective: 'Find the only move.', objectiveId: 'only-move', difficulty: 'foundation',
        verificationState: 'legal-authored-answer', integrity: 'qc05-0f706c9d', repeatPolicy: 'once-per-session', trustLevel: 'local-unverified',
        expectedMove: 'b7b6',
        expectedSan: 'b6',
        hint: 'Start with the central pawn of the three-pawn front.',
        source: { release: SOURCE_RELEASE, unit: 'pawn-breakthrough', activity: 'independent-breakthrough' }
    }
]);

export function getQuickChallengeSession() {
    return QUICK_CHALLENGE_FIXTURES;
}

export function validateQuickChallengeFixturePool(items, {
    poolId = QUICK_CHALLENGE_FIXTURE_POOL_ID,
    poolVersion = QUICK_CHALLENGE_FIXTURE_POOL_VERSION,
    fingerprint = QUICK_CHALLENGE_FIXTURE_POOL_FINGERPRINT
} = {}) {
    if (poolId !== QUICK_CHALLENGE_FIXTURE_POOL_ID ||
        poolVersion !== QUICK_CHALLENGE_FIXTURE_POOL_VERSION ||
        fingerprint !== QUICK_CHALLENGE_FIXTURE_POOL_FINGERPRINT ||
        !Array.isArray(items) || items.length !== QUICK_CHALLENGE_FIXTURES.length) return false;
    return items.every((item, index) => {
        const expected = QUICK_CHALLENGE_FIXTURES[index];
        return item?.id === expected.id && item.fen === expected.fen &&
            item.expectedMove === expected.expectedMove && item.objectiveId === expected.objectiveId &&
            item.integrity === expected.integrity && item.trustLevel === 'local-unverified';
    });
}
