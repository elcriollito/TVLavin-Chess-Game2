export const ENDGAME_V2_FLAG = 'trainerV2';
export const ENDGAME_V2_SESSION_SIZE = 5;
export const ENDGAME_SESSION_SCHEMA = 'caissa:endgame-session';
export const ENDGAME_SESSION_SCHEMA_VERSION = '2.0.0';
export const ENDGAME_MODE_CONTRACT_VERSION = '1.0.0';
export const QUICK_CHALLENGE_SCORE_VERSION = 'challenge-score-v1-preview';
export const ENDGAME_SOURCE_TYPES = Object.freeze([
    'curated-pool', 'knowledge-activity', 'educational-generator', 'custom-position'
]);
export const ENDGAME_OBJECTIVES = Object.freeze({
    'only-move': Object.freeze({
        id: 'only-move', version: '1.0.0',
        evaluator: 'authored-exact-legal-move',
        success: 'The legal move equals the authored move.',
        failure: 'A different legal move is submitted.',
        terminal: 'One legal move is submitted or the item is skipped.',
        timeout: 'none'
    }),
    'authored-move': Object.freeze({
        id: 'authored-move', version: '1.0.0',
        evaluator: 'authored-exact-legal-move',
        success: 'The legal move equals an explicitly authored accepted move.',
        failure: 'A different legal move is submitted.',
        terminal: 'One legal move is submitted or the item is skipped.',
        timeout: 'none'
    })
});
export const ENDGAME_V2_MODES = Object.freeze([
    Object.freeze({
        id: 'quick-challenge', contractVersion: ENDGAME_MODE_CONTRACT_VERSION, label: 'Quick Challenge',
        description: 'Solve five curated endgame positions.', defaultConfiguration: Object.freeze({ poolId: 'caissa-king-pawn-decisions', poolVersion: '1.1.0' }),
        positionSource: 'curated-pool', sessionLengthPolicy: Object.freeze({ type: 'fixed', count: 5 }),
        timerPolicy: 'local-monotonic-count-up', hintPolicy: 'one-authored-hint',
        scoringPolicy: QUICK_CHALLENGE_SCORE_VERSION, evidencePolicy: 'none',
        persistencePolicy: 'ephemeral', eligibility: 'all-local-users', availability: 'available'
    }),
    Object.freeze({
        id: 'knowledge-practice', contractVersion: ENDGAME_MODE_CONTRACT_VERSION, label: 'Knowledge Practice',
        description: 'Study released endgame lessons.', defaultConfiguration: Object.freeze({}),
        positionSource: 'knowledge-activity', sessionLengthPolicy: Object.freeze({ type: 'existing-runtime' }),
        timerPolicy: 'existing-runtime', hintPolicy: 'existing-runtime', scoringPolicy: 'existing-runtime',
        evidencePolicy: 'existing-consent-contract', persistencePolicy: 'existing-consent-contract',
        eligibility: 'existing-runtime', availability: 'route', href: '/endgame-library'
    }),
    Object.freeze({
        id: 'endgame-run', contractVersion: ENDGAME_MODE_CONTRACT_VERSION, label: 'Endgame Run',
        description: 'A longer challenge format.', defaultConfiguration: Object.freeze({}),
        positionSource: 'curated-pool', sessionLengthPolicy: Object.freeze({ type: 'unavailable' }),
        timerPolicy: 'unavailable', hintPolicy: 'unavailable', scoringPolicy: 'unavailable',
        evidencePolicy: 'none', persistencePolicy: 'none', eligibility: 'future',
        availability: 'coming-soon'
    }),
    Object.freeze({
        id: 'custom-lab', contractVersion: ENDGAME_MODE_CONTRACT_VERSION, label: 'Custom Lab',
        description: 'Use the configurable trainer.', defaultConfiguration: Object.freeze({}),
        positionSource: 'educational-generator', sessionLengthPolicy: Object.freeze({ type: 'existing-runtime' }),
        timerPolicy: 'existing-runtime', hintPolicy: 'existing-runtime', scoringPolicy: 'existing-runtime',
        evidencePolicy: 'v1-training-memory', persistencePolicy: 'v1-training-memory',
        eligibility: 'existing-runtime', availability: 'route', href: '/endgame-trainer?legacy=1'
    })
]);

const GUIDED_STUDY_PARAMS = Object.freeze(['studyUnit', 'release', 'activity', 'reviewFrom']);

export function shouldActivateEndgameV2(search = '') {
    const params = new URLSearchParams(search);
    if (GUIDED_STUDY_PARAMS.some((name) => params.has(name))) return false;
    return !params.has(ENDGAME_V2_FLAG) || params.get(ENDGAME_V2_FLAG) === '1';
}

export function createQuickChallengeSession(items) {
    if (!Array.isArray(items) || items.length !== ENDGAME_V2_SESSION_SIZE) {
        throw new TypeError(`Quick Challenge requires exactly ${ENDGAME_V2_SESSION_SIZE} items.`);
    }
    const ids = items.map((item) => item.id);
    if (new Set(ids).size !== ids.length) throw new TypeError('Quick Challenge item ids must be unique.');
    return Object.freeze(items.map((item) => Object.freeze({
        ...item,
        source: item.source ? Object.freeze({ ...item.source }) : null
    })));
}

export function validateModeId(modeId) {
    return ENDGAME_V2_MODES.some(({ id }) => id === modeId);
}

export function validatePositionSource(sourceType) {
    return ENDGAME_SOURCE_TYPES.includes(sourceType);
}

export function validateObjectiveId(objectiveId) {
    return Object.hasOwn(ENDGAME_OBJECTIVES, objectiveId);
}

export function validatePoolVersion(poolId, poolVersion) {
    return poolVersion === '1.0.0' && [
        'caissa-quick-challenge-technical-pilot',
        'caissa-king-pawn-decisions'
    ].includes(poolId);
}

export function createEndgameSession({ sessionId, sourceId, sourceVersion, poolId, poolVersion, now }) {
    if (!sessionId || typeof sessionId !== 'string') throw new TypeError('A stable session id is required.');
    const timestamp = Number(now);
    if (!Number.isFinite(timestamp)) throw new TypeError('A finite session timestamp is required.');
    return Object.freeze({
        type: ENDGAME_SESSION_SCHEMA, schemaVersion: ENDGAME_SESSION_SCHEMA_VERSION,
        sessionId, modeId: 'quick-challenge', modeContractVersion: ENDGAME_MODE_CONTRACT_VERSION,
        sourceType: 'curated-pool', sourceId, sourceVersion, poolId, poolVersion,
        status: 'configured', startedAt: null, endedAt: null, sessionTarget: 5,
        currentItemIndex: -1, completedItems: 0, failedItems: 0, skippedItems: 0,
        unavailableItems: 0, currentStreak: 0, bestStreak: 0,
        scoreState: Object.freeze({ version: QUICK_CHALLENGE_SCORE_VERSION, points: 0, trustLevel: 'local-unverified' }),
        timerState: Object.freeze({ policy: 'local-monotonic-count-up', elapsedMs: 0, itemElapsedMs: 0, trustLevel: 'local-unverified' }),
        hintState: Object.freeze({ policy: 'one-authored-hint', usedThisItem: false, assistedItems: 0 }),
        trustLevel: 'local-unverified', persistenceEligibility: 'none', createdAt: timestamp
    });
}

export function validateEndgameSession(session) {
    return Boolean(session && session.type === ENDGAME_SESSION_SCHEMA &&
        session.schemaVersion === ENDGAME_SESSION_SCHEMA_VERSION &&
        validateModeId(session.modeId) && validatePositionSource(session.sourceType) &&
        session.persistenceEligibility === 'none');
}

export function scoreQuickChallengeResult({ correct, hintUsed, unavailable = false }) {
    if (unavailable) return 0;
    if (!correct) return 0;
    return hintUsed ? 50 : 100;
}

export function formatElapsedTime(milliseconds) {
    const seconds = Math.max(0, Math.floor(Number(milliseconds || 0) / 1000));
    const minutes = Math.floor(seconds / 60);
    return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}
