const clone = value => structuredClone(value);
const deepFreeze = value => {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
        Object.freeze(value);
        for (const child of Object.values(value)) deepFreeze(child);
    }
    return value;
};

export const ESSENTIAL_CANON_ROUTE_ID = 'essential-canon-pilot';
export const PILOT_PROGRESS_EVENTS = deepFreeze([
    'learn-started', 'learn-checkpoint-viewed', 'learn-recognition-correct',
    'learn-recognition-incorrect', 'learn-completed', 'recall-started',
    'recall-correct', 'recall-incorrect', 'recall-completed',
    'lesson-completed', 'needs-review'
]);

const positions = [
    ['ks-learn-01', 'et11b2-r1', 'c10-key-square-gateway', 'learn', '4k3/8/3K4/4P3/8/8/8/8 b - - 0 1', 'black', 'white', 'theoretical-win', '9223cbac6f32737d2098b394e9d8ec8dd61aeeaaa56fd73fdb13a5b9c8fc7cd2', 'White king d6 and pawn e5; Black king e8; Black to move.'],
    ['ks-recall-valid-01', 'et11b2-r1', 'c10-key-square-gateway', 'recall-valid', '8/3k4/1K6/8/2P5/8/8/8 w - - 0 1', 'white', 'white', 'relationship-valid', '49e656f5254b0449a5a0591def531989a86e68bf8fa3ea4cbb50016b270e877a', 'White king b6 and pawn c4; Black king d7; White to move.'],
    ['ks-recall-invalid-01', 'et11b2-r1', 'c10-key-square-gateway', 'recall-invalid', '8/5k2/8/5K2/5P2/8/8/8 b - - 0 1', 'black', 'white', 'relationship-invalid-now', '0db055fc172e4316584320d34614d30f84b5343fc3b920feb662df84c6472dde', 'White king f5 and pawn f4; Black king f7; Black to move.'],
    ['ph-learn-02', 'et11b2r1-r2', 'c10-philidor-wall', 'learn', '2k5/8/5r2/2K5/2P5/8/8/7R b - - 0 1', 'black', 'black', 'setup-valid', '5d6d4031ea0782b77eb1071f28daee869236a2f9ceb850fbf25bde3f8e56a0cb', 'Black king c8 and rook f6 defend against White king c5, rook h1, pawn c4; Black to move.'],
    ['ph-recall-valid-01', 'et11b2-r1', 'c10-philidor-wall', 'recall-valid', 'r7/8/8/5p2/5k2/1R6/5K2/8 w - - 0 1', 'white', 'white', 'setup-valid', '7d749610231132c12cfd48168f8b303d53135d85fa53411e0bbb658567c02ad8', 'White king f2 and rook b3 defend against Black king f4, rook a8, pawn f5; White to move.'],
    ['ph-recall-invalid-01', 'et11b2-r1', 'c10-philidor-wall', 'recall-invalid', '2k5/6r1/8/2K5/2P5/8/8/7R b - - 0 1', 'black', 'black', 'setup-invalid-now', '8e896a781bd69862353e146f5f28f2c5302b4caf0dfb4ef0109f411c69b24cf8', 'Black king c8 and rook g7 defend against White king c5, rook h1, pawn c4; Black to move.']
].map(([positionId, version, lessonId, role, fen, sideToMove, userColor, theoreticalClass, hash, accessibilityDescription]) => ({
    positionId, version, lessonId, role, fen, sideToMove, userColor, orientation: userColor,
    materialFamily: lessonId.includes('key-square') ? 'KPK' : 'KRPvKR',
    materialSignature: lessonId.includes('key-square') ? 'K+P vs K' : 'K+R+P vs K+R',
    theoreticalClass, theoreticalConditions: 'Applies to the displayed, reviewed geometry only.',
    recognitionTarget: role.includes('invalid') ? 'current setup validity' : 'current geometric feature',
    teachingPurpose: 'Authored pattern recognition without engine grading.',
    bindingConditions: role === 'recall-invalid' ? (lessonId.includes('key-square') ? 'Never infer draw from current occupancy.' : 'Never infer final loss from current barrier validity.') : 'Do not generalize beyond the displayed geometry.',
    runtimeEngineRequired: false, accessibilityDescription, ownerApproval: 'approved',
    reviewStatus: 'human-reviewed', hash, status: 'runtime-frozen'
}));

const checkpoint = (checkpointId, sequenceOrder, title, explanation, interaction, accessibilityText, prompt = null) =>
    ({ checkpointId, sequenceOrder, title, explanation, interaction, accessibilityText, prompt });

const keyCheckpoints = [
    checkpoint('ks-learn-cp1', 1, 'Locate the pawn\'s key squares', 'Key squares depend on pawn file and rank. For the pawn on e5, locate the reviewed zone.', 'highlight-concept', 'The white pawn is on e5. Its reviewed key-square zone is d6, e6, and f6.'),
    checkpoint('ks-learn-cp2', 2, 'Compare king placement', 'White\'s king occupies d6, while the defending king and side to move remain part of the evaluation.', 'choose-region', 'White\'s king stands on d6, inside the reviewed zone; Black\'s king remains part of the evaluation.'),
    checkpoint('ks-learn-cp3', 3, 'Add opposition and tempo', 'Geometry and tempo must be considered together.', 'answer-recognition', 'Black moves first here. That matters even though White has the reviewed king placement.', { text: 'Must geometry and side to move both be considered?', options: ['Yes', 'No'], correctAnswer: 'Yes' }),
    checkpoint('ks-learn-cp4', 4, 'Use the narrow rule', 'A key square guides this position; it is not an automatic shortcut for every pawn ending.', 'answer-recognition', 'This locked position supports promotion, but the claim does not extend to rook pawns or unrelated king placements.', { text: 'Does this rule automatically decide every pawn ending?', options: ['Yes', 'No'], correctAnswer: 'No' })
];
const philidorCheckpoints = [
    checkpoint('ph-learn-cp1', 1, 'Identify the barrier', 'Black\'s rook on f6 controls the sixth rank in this reconstructed setup.', 'highlight-concept', 'The rook controls the barrier rank while the attacking king remains on c5, below it.'),
    checkpoint('ph-learn-cp2', 2, 'Verify rook safety', 'A barrier works only while the rook is safe; Rf6 cannot be captured immediately.', 'answer-recognition', 'The rook is separated from the attacking king and cannot be captured immediately.', { text: 'Is the rook on f6 immediately capturable?', options: ['Yes', 'No'], correctAnswer: 'No' }),
    checkpoint('ph-learn-cp3', 3, 'Understand the waiting plan', 'Black can wait on e6, f6, or g6. The rook on h6 would be capturable.', 'choose-region', 'The defense has multiple safe waiting squares; h6 is excluded.'),
    checkpoint('ph-learn-cp4', 4, 'Recognize the transition trigger', 'Rear checks become relevant after the reviewed pawn advance changes the geometry.', 'observe-transition', 'Wait while this barrier restricts the king; switch only at the reviewed trigger.')
];

const cards = [
    ['recall-ks-valid-01', 'c10-key-square-gateway', 'ks-recall-valid-01', 'For the white pawn on c4, does the white king on b6 currently occupy a relevant key square?', ['Yes', 'No'], 'Yes', 'Correct. For this c4 pawn, b6 belongs to the reviewed key-square zone.', 'Not quite. Start from the pawn on c4; its reviewed zone includes b6.', 'Try again by locating the pawn first, then look two ranks ahead.'],
    ['recall-ks-invalid-01', 'c10-key-square-gateway', 'ks-recall-invalid-01', 'For the white pawn on f4, does the white king on f5 currently occupy a relevant key square?', ['Yes', 'No'], 'No', 'Correct. Here f5 is not in the reviewed zone. This does not classify the whole position as drawn.', 'Not quite. Judge only current key-square occupancy; this does not decide the full result.', 'Try again without choosing a win or draw result.'],
    ['recall-ph-valid-01', 'c10-philidor-wall', 'ph-recall-valid-01', 'Is White\'s displayed defensive setup currently using the reviewed Philidor-family barrier?', ['Setup valid', 'Setup invalid'], 'Setup valid', 'Correct. In this reconstructed position, White\'s rook forms the reviewed barrier.', 'Not quite. Read this board from White\'s defensive perspective.', 'Try again by checking the defending king and rook rank in this setup.'],
    ['recall-ph-invalid-01', 'c10-philidor-wall', 'ph-recall-invalid-01', 'Is Black\'s rook currently placed on the reviewed barrier rank in this position?', ['Setup valid', 'Setup invalid'], 'Setup invalid', 'Correct. The rook on g7 is not currently on the reviewed barrier. Black may still recover; this does not mean the position is lost.', 'Not quite. Judge the displayed setup, not the final result.', 'Try again by locating the defender-relative barrier; do not choose a win or loss result.']
].map(([cardId, lessonId, positionId, prompt, answerOptions, correctAnswer, feedbackCorrect, feedbackIncorrect, retryFeedback]) => ({ cardId, lessonId, positionId, prompt, answerType: 'authored-choice', answerOptions, correctAnswer, feedbackCorrect, feedbackIncorrect, retryFeedback, runtimeEngineRequired: false, status: 'runtime-frozen' }));

const lesson = ({ lessonId, publicTitle, materialFamily, difficulty, objective, coreRule, cue, mistake, exceptionText, positionIds, checkpoints, completionMessage }) => ({
    lessonId, publicTitle, internalTitle: publicTitle, routeId: ESSENTIAL_CANON_ROUTE_ID, canonTier: 'Canon 10', canonOrder: lessonId.includes('key-square') ? 1 : 2,
    materialFamily, materialSignature: materialFamily === 'KPK' ? 'K+P vs K' : 'K+R+P vs K+R', difficulty, practicalFrequency: 'essential', userRole: 'learner', primaryMode: 'learn', secondaryModes: ['recall'],
    learningObjective: objective, coreRule, recognitionCue: cue, commonMistake: mistake, criticalException: exceptionText,
    theoreticalTruth: 'Human-reviewed, position-specific theoretical classification.', engineTruthPolicy: 'No engine required or consulted.', teachingTruth: coreRule,
    positionIds, learnConfig: { checkpoints, completionMessage, replaySummary: cue }, recallConfig: { cards: cards.filter(card => card.lessonId === lessonId) },
    completionRule: { learn: 'four-checkpoints-and-required-recognition', recall: 'two-cards-answered', lesson: 'learn-and-one-recall-session' },
    progressConfig: { events: PILOT_PROGRESS_EVENTS }, accessibilityConfig: { boardDescription: true, liveFeedback: 'polite', keyboard: true },
    provenance: 'caissa-original-reconstruction', copyrightReview: 'approved-public-copy', humanReview: 'approved-position-version', runtimeRequirements: { engine: false, userMoves: false, proceduralGeneration: false }, version: 'et11b4-v1', status: 'pilot'
});

const lessons = [
    lesson({ lessonId: 'c10-key-square-gateway', publicTitle: 'Own the Key Squares', materialFamily: 'KPK', difficulty: 'foundation', objective: 'Recognize how pawn rank, king placement, opposition, and side to move determine access to the relevant key-square zone.', coreRule: 'Find the key squares for this pawn and rank, then evaluate both kings and the side to move.', cue: 'Locate the pawn, map its reviewed zone, compare both kings, and include the turn.', mistake: 'Pushing automatically or treating any forward king square as a guaranteed win.', exceptionText: 'Rook pawns are excluded. A king outside the zone does not by itself prove a draw.', positionIds: ['ks-learn-01', 'ks-recall-valid-01', 'ks-recall-invalid-01'], checkpoints: keyCheckpoints, completionMessage: 'Key-square pattern complete. You used the pawn, both kings, and the turn.' }),
    lesson({ lessonId: 'c10-philidor-wall', publicTitle: 'Hold the Third Rank', materialFamily: 'KRPvKR', difficulty: 'beginner', objective: 'Recognize this reviewed Philidor-family barrier, verify rook safety, and identify the transition to rear checks.', coreRule: 'In this reconstructed setup, keep a safe rook on the barrier rank until the pawn advance changes the geometry.', cue: 'Check the defending king, the barrier rank, rook safety, and the pawn trigger.', mistake: 'Checking too early or assuming every rook on the third rank creates the defense.', exceptionText: 'This claim applies only to the reviewed geometry; an invalid barrier does not prove a loss.', positionIds: ['ph-learn-02', 'ph-recall-valid-01', 'ph-recall-invalid-01'], checkpoints: philidorCheckpoints, completionMessage: 'Barrier pattern complete. You verified rook safety, waiting squares, and the transition trigger.' })
];

const EXPECTED_LOCKS = Object.fromEntries(positions.map(item => [item.positionId, `${item.version}|${item.fen}|${item.hash}`]));
const PROHIBITED = [/is this position drawn/i, /not on (?:the )?key square means draw/i, /is the defender losing/i, /invalid barrier means (?:the position is )?lost/i, /any rook on the third rank draws/i];
const PUBLIC_FIELDS = ['publicTitle', 'learningObjective', 'coreRule', 'recognitionCue', 'commonMistake', 'criticalException'];

export function validateEssentialCanonPilot(payload = { lessons, positions }) {
    const errors = [], lessonIds = new Set(), positionIds = new Set();
    if (payload.lessons?.length !== 2) errors.push('lesson-count');
    if (payload.positions?.length !== 6) errors.push('position-count');
    for (const item of payload.lessons ?? []) {
        if (!/^c10-[a-z0-9-]+$/.test(item.lessonId) || lessonIds.has(item.lessonId)) errors.push('lesson-id');
        lessonIds.add(item.lessonId);
        if (item.learnConfig?.checkpoints?.length !== 4) errors.push('checkpoint-count');
        if (item.recallConfig?.cards?.length !== 2) errors.push('recall-count');
        if (item.primaryMode !== 'learn' || item.secondaryModes?.join() !== 'recall') errors.push('mode');
        if (item.runtimeRequirements?.proceduralGeneration !== false) errors.push('procedural-mutation');
        for (const field of PUBLIC_FIELDS) if (!item[field]?.trim()) errors.push('public-copy');
    }
    for (const item of payload.positions ?? []) {
        if (positionIds.has(item.positionId) || !EXPECTED_LOCKS[item.positionId]) errors.push('position-id');
        positionIds.add(item.positionId);
        if (`${item.version}|${item.fen}|${item.hash}` !== EXPECTED_LOCKS[item.positionId]) errors.push('position-lock');
        if (!['learn', 'recall-valid', 'recall-invalid'].includes(item.role)) errors.push('position-role');
        if (!item.bindingConditions || item.runtimeEngineRequired !== false) errors.push('position-contract');
    }
    const publicCopy = JSON.stringify(payload);
    if (PROHIBITED.some(pattern => pattern.test(publicCopy))) errors.push('prohibited-wording');
    if (/(?:[a-z]:\\users\\|\/users\/)|reviewer contact|private research|private copyright/i.test(publicCopy)) errors.push('private-reference');
    return deepFreeze({ valid: errors.length === 0, errors: [...new Set(errors)] });
}

export const ESSENTIAL_CANON_PILOT = (() => {
    const payload = deepFreeze({ routeId: ESSENTIAL_CANON_ROUTE_ID, publicTitle: 'Essential Canon Pilot', lessons, positions });
    const validation = validateEssentialCanonPilot(payload);
    if (!validation.valid) throw new Error(`invalid-essential-canon-pilot:${validation.errors.join(',')}`);
    return payload;
})();

export function createPilotSession({ lessonId, mode, emit = () => {}, sessionId = `pilot-${Date.now()}` } = {}) {
    const lessonData = ESSENTIAL_CANON_PILOT.lessons.find(item => item.lessonId === lessonId);
    if (!lessonData || !['learn', 'recall'].includes(mode)) throw new TypeError('invalid-pilot-session');
    let generation = 1, state = mode === 'learn'
        ? { status: 'idle', index: 0, visited: [], answered: [], completed: false }
        : { status: 'idle', index: 0, answered: [], incorrect: [], completed: false };
    const sent = new Set();
    const send = (event, subjectId = event, metadata = {}) => {
        const key = `${sessionId}:${lessonId}:${event}:${subjectId}`;
        if (sent.has(key)) return false;
        sent.add(key); emit({ event, key, sessionId, lessonId, mode, ...metadata }); return true;
    };
    const snapshot = () => clone({ ...state, lesson: lessonData, current: mode === 'learn' ? lessonData.learnConfig.checkpoints[state.index] : lessonData.recallConfig.cards[state.index], generation });
    const start = () => { if (state.status === 'idle') { state.status = mode === 'learn' ? 'checkpoint-active' : 'card-active'; send(`${mode}-started`); if (mode === 'learn') view(); } return snapshot(); };
    const view = () => { if (mode !== 'learn') return snapshot(); const cp = lessonData.learnConfig.checkpoints[state.index]; if (!state.visited.includes(cp.checkpointId)) state.visited.push(cp.checkpointId); send('learn-checkpoint-viewed', cp.checkpointId, { checkpointId: cp.checkpointId }); return snapshot(); };
    const completeLearn = () => { const required = lessonData.learnConfig.checkpoints.filter(cp => cp.interaction === 'answer-recognition').every(cp => state.answered.includes(cp.checkpointId)); if (state.visited.length === 4 && required) { state.status = 'lesson-complete'; state.completed = true; send('learn-completed'); } };
    return {
        getSnapshot: snapshot,
        start,
        answer(value, token = generation) {
            if (token !== generation || state.completed) return snapshot();
            const current = mode === 'learn' ? lessonData.learnConfig.checkpoints[state.index] : lessonData.recallConfig.cards[state.index];
            if (mode === 'learn') {
                if (!current.prompt) return snapshot();
                const correct = value === current.prompt.correctAnswer; send(correct ? 'learn-recognition-correct' : 'learn-recognition-incorrect', `${current.checkpointId}:${state.answered.length}`, { checkpointId: current.checkpointId });
                if (correct && !state.answered.includes(current.checkpointId)) state.answered.push(current.checkpointId);
                state.status = 'checkpoint-answered'; return { ...snapshot(), correct, feedback: correct ? 'Correct. Continue with the narrow rule.' : 'Not quite. Recheck the displayed geometry and wording.' };
            }
            const attempt = state.answered.filter(id => id === current.cardId).length + state.incorrect.filter(id => id === current.cardId).length + 1;
            const correct = value === current.correctAnswer;
            send(correct ? 'recall-correct' : 'recall-incorrect', `${current.cardId}:${attempt}`, { cardId: current.cardId });
            if (correct) { if (!state.answered.includes(current.cardId)) state.answered.push(current.cardId); state.status = 'card-answered'; }
            else { state.incorrect.push(current.cardId); state.status = 'retry'; send('needs-review', current.cardId, { subjectId: current.cardId }); }
            return { ...snapshot(), correct, feedback: correct ? current.feedbackCorrect : state.incorrect.filter(id => id === current.cardId).length > 1 ? current.retryFeedback : current.feedbackIncorrect };
        },
        next() {
            if (state.completed) return snapshot();
            if (mode === 'learn') {
                const cp = lessonData.learnConfig.checkpoints[state.index];
                if (cp.prompt && !state.answered.includes(cp.checkpointId)) return snapshot();
                if (state.index < 3) { state.index += 1; state.status = 'checkpoint-active'; view(); } else completeLearn();
            } else {
                const card = lessonData.recallConfig.cards[state.index]; if (!state.answered.includes(card.cardId)) return snapshot();
                if (state.index < 1) { state.index += 1; state.status = 'card-active'; }
                else { state.completed = true; state.status = 'lesson-complete'; send('recall-completed'); }
            }
            return snapshot();
        },
        previous() { if (mode === 'learn' && state.index > 0) { state.index -= 1; state.status = 'checkpoint-active'; view(); } return snapshot(); },
        restart() { generation += 1; const completed = state.completed; state = mode === 'learn' ? { status: 'checkpoint-active', index: 0, visited: [], answered: [], completed } : { status: 'card-active', index: 0, answered: [], incorrect: [], completed }; if (mode === 'learn') view(); return snapshot(); },
        replay() { return this.restart(); },
        dispose() { generation += 1; state.status = 'disposed'; return snapshot(); }
    };
}
