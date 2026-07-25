/** @type {import('../../../../schema/knowledge-unit.js').KnowledgeUnit} */
export const pawnMajority = {
    id: 'ku:endgames:pawn-weaknesses:pawn-majority', slug: 'pawn-majority', domain: 'endgames',
    status: 'published', schemaVersion: '1.1.0', contentVersion: '1.2.0',
    education: {
        knowledgeType: 'technique', endgameFamily: 'pawn-endgames',
        themes: ['pawn-majority', 'passed-pawns', 'pawn-races', 'pawn-structure'],
        skills: ['calculation', 'move-order', 'planning'], difficulty: 'developing',
        expectedLearnerLevel: 'foundation-rules-aware',
        prerequisites: ['ku:endgames:pawn-foundations:rule-of-the-square'],
        learningObjectives: ['Identify a local pawn majority and its candidate pawn.', 'Calculate whether mobilization and exchanges create a viable passed pawn.'],
        masteryCriteria: ['Identifies the majority and candidate pawn in four of five mixed-wing structures.', 'Calculates the resulting passer or rejects a damaging push in three of four tasks without a final hint.']
    },
    localization: {
        defaultLocale: 'en-US', availableLocales: ['en-US'], translationStatus: { 'en-US': 'ready' },
        content: { 'en-US': {
            title: 'Mobilize a pawn majority',
            summary: 'Turn a mobile numerical advantage on one wing into a calculated passed-pawn plan.',
            explanation: 'A pawn majority is a local numerical advantage, not a result. It becomes useful when its pawns can move together, exchanges leave a passer, and the enemy king cannot stop the plan. The candidate pawn is usually the pawn without an opposing pawn on its file, but the position decides the move order. Count, test mobility, calculate exchanges, and compare pawn moves with king improvement.',
            keyIdeas: ['A usable majority combines numbers, mobility, and a favorable resulting race.', 'Candidate-pawn choice preserves the pawns that can recapture toward a passer.'],
            misconceptions: ['A numerical majority does not automatically create a passed pawn.', 'Pushing the most advanced pawn first can allow blockade or exchange away the advantage.'],
            practicalRules: ['Majorities are often valuable when they remain mobile and connected.', 'Before mobilizing, verify the resulting passer with king-distance and race calculations.'],
            decisionProcess: ['Count pawns on each wing.', 'Test whether the majority can move.', 'Identify the candidate pawn.', 'Calculate exchanges and the resulting passer.', 'Apply king-distance checks.', 'Compare mobilization with king improvement.'],
            coachingPrompts: ['On which wing is the numerical majority?', 'Is that majority mobile or blocked?', 'Which pawn is the candidate?', 'What remains after the likely exchanges?', 'Use count, mobility, candidate, exchange, and race before deciding.', 'Did the move preserve the majority’s ability to create a passer?'],
            reflectionPrompts: ['Which blockade would make the majority merely numerical?', 'When would king improvement be more urgent than mobilization?']
        } }
    },
    positions: [
        { id: 'pos:pawn-majority:mobile-three-two', fen: '8/8/5k2/5pp1/5PPP/3K4/8/8 w - - 0 1', sideToMove: 'white', role: 'clean-demonstration', expectedConcepts: ['pawn-majority', 'candidate-pawn', 'mobility'], principalIdeas: [{ moves: ['h5'], purpose: 'Mobilize the candidate while preserving neighboring recaptures.' }], validation: { structural: 'valid', educational: 'verified', notes: 'The three-versus-two count and legal first move are verified; no forced-win claim is made.' } },
        { id: 'pos:pawn-majority:blocked-near-miss', fen: '8/8/6k1/5pp1/5PPP/6K1/8/8 w - - 0 1', sideToMove: 'white', role: 'contrast', expectedConcepts: ['blocked-majority', 'king-improvement', 'premature-push'], principalIdeas: [{ moves: ['Kf3'], purpose: 'Improve the king instead of treating the blocked count as an immediate pawn break.' }], validation: { structural: 'valid', educational: 'verified', notes: 'The pawn count is unchanged but king placement and locked contacts materially alter usability.' } }
    ],
    learningObjects: {
        demonstrations: [{ id: 'demo:pawn-majority:count-and-candidate', positionId: 'pos:pawn-majority:mobile-three-two' }],
        guidedPractice: [{ id: 'guided:pawn-majority:exchange-map', positionId: 'pos:pawn-majority:mobile-three-two', prompt: 'Name the candidate and map likely exchanges.' }],
        exercises: [{ id: 'exercise:pawn-majority:blocked', positionId: 'pos:pawn-majority:blocked-near-miss', task: 'Explain why the numerical majority is not yet usable.' }],
        checksForUnderstanding: [{ id: 'check:pawn-majority:usable', prompt: 'Name the three conditions that make a majority usable.' }],
        assessments: [{ id: 'assessment:pawn-majority:three-of-four', criterionId: 'majority-calculate-3-of-4' }],
        reviewItems: []
    },
    activityItems: activityItemsFor('ku:endgames:pawn-weaknesses:pawn-majority'),
    relationships: [
        { type: 'recommendation', targetId: 'ku:endgames:pawn-exchanges:exchange-into-passer', reason: 'After mobilizing a majority, calculate the concrete capture order that determines the surviving passer.' },
        { type: 'related', targetId: 'ku:endgames:pawn-transformations:outside-passed-pawn', reason: 'A mobile wing majority may create the distant passer used for diversion.' },
        { type: 'contrast', targetId: 'ku:endgames:pawn-transformations:pawn-breakthrough', reason: 'Majority play normally preserves connected mobility; breakthrough deliberately sacrifices material to transform locked contacts.' },
        { type: 'progression', targetId: 'ku:endgames:pawn-weaknesses:fix-pawn-weakness', reason: 'After learning to mobilize one structure, learners study how to stop an opposing structure from escaping.' },
        { type: 'remediation', targetId: 'ku:endgames:pawn-foundations:rule-of-the-square', reason: 'Race errors require renewed king-distance and pawn-square calculation.' }
    ],
    integrations: {
        capabilities: ['academy-compatible', 'deterministic-coaching-prompts', 'mastery-criteria', 'training-memory-theme-link'],
        coaching: { policy: 'deterministic-prompt-only', conceptIds: ['pawn-majority', 'candidate-pawn', 'mobility'], hintOrder: ['observation', 'classification', 'candidate-identification', 'calculation-direction', 'decision-process', 'reflection'] },
        trainingMemory: { themeIds: ['pawn-majority', 'passed-pawns'] }, mastery: { criterionIds: ['majority-identify-4-of-5', 'majority-calculate-3-of-4'] },
        recommendation: { nextUnitIds: ['ku:endgames:pawn-weaknesses:fix-pawn-weakness'], remediationUnitIds: ['ku:endgames:pawn-foundations:rule-of-the-square'] }, academy: { compatible: true }
    },
    editorial: {
        owner: 'CAISSA Curriculum', reviewer: 'CAISSA Season 9 Review', createdAt: '2026-07-23', updatedAt: '2026-07-25', reviewStatus: 'approved',
        provenance: { kind: 'caissa-original', notes: 'Original CAISSA count-mobility-candidate-exchange-race sequence.', inspirationReferences: [] },
        copyrightNotes: 'No source prose, annotations, or commercial exercise sequence was copied.', originalityDeclaration: 'This unit was independently scoped, sequenced, and written for CAISSA.', verificationState: 'verified'
    }
};
import { activityItemsFor } from '../../../../authoring/evaluable-endgame-activities.js';
