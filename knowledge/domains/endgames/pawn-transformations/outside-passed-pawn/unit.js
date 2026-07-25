/** @type {import('../../../../schema/knowledge-unit.js').KnowledgeUnit} */
export const outsidePassedPawn = {
    id: 'ku:endgames:pawn-transformations:outside-passed-pawn', slug: 'outside-passed-pawn', domain: 'endgames',
    status: 'published', schemaVersion: '1.1.0', contentVersion: '1.1.0',
    education: {
        knowledgeType: 'principle', endgameFamily: 'pawn-endgames',
        themes: ['passed-pawns', 'diversion', 'pawn-races', 'king-activity'],
        skills: ['board-geometry', 'calculation', 'planning'], difficulty: 'developing',
        expectedLearnerLevel: 'foundation-rules-aware',
        prerequisites: ['ku:endgames:pawn-foundations:rule-of-the-square'],
        learningObjectives: [
            'Recognize an outside passed pawn by its distance from the remaining pawn structure.',
            'Calculate the enemy king chase and return route before using the passer as a diversion.'
        ],
        masteryCriteria: [
            'Correctly classifies a genuine outside passer in four of five mixed structures.',
            'Calculates chase, return, and opposite-wing penetration in three of four tasks without a final-move hint.'
        ]
    },
    localization: {
        defaultLocale: 'en-US', availableLocales: ['en-US'], translationStatus: { 'en-US': 'ready' },
        content: { 'en-US': {
            title: 'Create an outside passed pawn',
            summary: 'Use distance to divert the enemy king and open an entry on the opposite wing.',
            explanation: 'An outside passed pawn is separated from the remaining pawn mass and can force the enemy king to travel away from another target. Distance is useful only when the calculations work: the king must need to chase, the passer must last long enough, and the attacking king must gain something before the defender returns. The farthest pawn is therefore not automatically winning. Treat diversion as a concrete race joined to a plan on the other wing.',
            keyIdeas: [
                'An outside passer creates value by stretching the defender across two distant tasks.',
                'The chase and the return route are both part of the calculation.'
            ],
            misconceptions: [
                'The pawn farthest from the center is not necessarily outside relative to the remaining structure.',
                'A remote passer does not win automatically when the enemy king can consume it and return in time.'
            ],
            practicalRules: [
                'An outside passer often distracts the king when the opposite wing contains a reachable target.',
                'Improve the king first when pushing immediately gives the defender time to return.'
            ],
            decisionProcess: [
                'Identify the passer most distant from the remaining pawns.',
                'Calculate whether the enemy king must chase it.',
                'Calculate the king’s capture and return route.',
                'Identify the penetration target on the opposite wing.',
                'Compare pushing now with improving the king first.'
            ],
            coachingPrompts: [
                'Which passer is farthest from the remaining pawn structure?',
                'What makes its distance a potential diversion?',
                'Which candidate starts the diversion, and which improves the king first?',
                'Must the enemy king chase, and where would it finish?',
                'Calculate chase, return, target, and timing before pushing.',
                'What did the diversion make available on the opposite wing?'
            ],
            reflectionPrompts: [
                'Which return square decides whether the diversion succeeds?',
                'How would moving the attacking king first change the race?'
            ]
        } }
    },
    positions: [
        {
            id: 'pos:outside-passer:successful-diversion',
            fen: '8/8/5k2/8/P2K1P2/8/8/8 w - - 0 1',
            sideToMove: 'white', role: 'clean-demonstration',
            expectedConcepts: ['outside-passed-pawn', 'diversion', 'opposite-wing-entry'],
            principalIdeas: [{ moves: ['a5'], purpose: 'Advance the remote passer and ask whether the king must leave the kingside target.' }],
            validation: { structural: 'valid', educational: 'verified', notes: 'Distance and legal chase geometry are verified; the position teaches calculation rather than asserting a universal result.' }
        },
        {
            id: 'pos:outside-passer:defender-returns',
            fen: '8/8/2k5/8/P2K1P2/8/8/8 w - - 0 1',
            sideToMove: 'white', role: 'contrast',
            expectedConcepts: ['outside-passer-near-miss', 'king-return-route'],
            principalIdeas: [{ moves: ['a5'], purpose: 'Test the tempting push against a much shorter chase and return route.' }],
            validation: { structural: 'valid', educational: 'verified', notes: 'The defender starts close to the outside pawn, materially changing the race.' }
        }
    ],
    learningObjects: {
        demonstrations: [{ id: 'demo:outside-passer:diversion', positionId: 'pos:outside-passer:successful-diversion' }],
        guidedPractice: [{ id: 'guided:outside-passer:route', positionId: 'pos:outside-passer:successful-diversion', prompt: 'Trace chase, capture, return, and penetration routes.' }],
        exercises: [{ id: 'exercise:outside-passer:return', positionId: 'pos:outside-passer:defender-returns', task: 'Decide whether pushing creates enough time.' }],
        checksForUnderstanding: [{ id: 'check:outside-passer:definition', prompt: 'Distinguish an outside passer from an ordinary passer by the remaining structure.' }],
        assessments: [{ id: 'assessment:outside-passer:three-of-four', criterionId: 'outside-passer-calculate-3-of-4' }],
        reviewItems: []
    },
    activityItems: activityItemsFor('ku:endgames:pawn-transformations:outside-passed-pawn'),
    relationships: [
        { type: 'contrast', targetId: 'ku:endgames:pawn-transformations:protected-passed-pawn', reason: 'An outside passer relies on distance and diversion rather than mutual pawn support and restriction.' },
        { type: 'progression', targetId: 'ku:endgames:pawn-transformations:pawn-breakthrough', reason: 'Breakthrough calculation applies race geometry to the creation of a new passer.' },
        { type: 'recommendation', targetId: 'ku:endgames:pawn-transformations:pawn-breakthrough', reason: 'After calculating an existing outside passer, learn to create a passer through transformation.' },
        { type: 'remediation', targetId: 'ku:endgames:pawn-foundations:rule-of-the-square', reason: 'Learners who omit the chase or return count should revisit pawn-square geometry.' },
        { type: 'related', targetId: 'ku:endgames:pawn-foundations:activate-the-king', reason: 'The diversion has purpose only when the attacking king can exploit the opposite wing.' }
    ],
    integrations: {
        capabilities: ['academy-compatible', 'deterministic-coaching-prompts', 'mastery-criteria', 'training-memory-theme-link'],
        coaching: { policy: 'deterministic-prompt-only', conceptIds: ['outside-passed-pawn', 'diversion', 'return-route'], hintOrder: ['observation', 'structural-recognition', 'candidate-identification', 'calculation-direction', 'decision-process', 'reflection'] },
        trainingMemory: { themeIds: ['passed-pawns', 'diversion', 'pawn-races'] },
        mastery: { criterionIds: ['outside-passer-classify-4-of-5', 'outside-passer-calculate-3-of-4'] },
        recommendation: { nextUnitIds: ['ku:endgames:pawn-transformations:pawn-breakthrough'], remediationUnitIds: ['ku:endgames:pawn-foundations:rule-of-the-square'] },
        academy: { compatible: true }
    },
    editorial: {
        owner: 'CAISSA Curriculum', reviewer: 'CAISSA Season 9 Review', createdAt: '2026-07-23', updatedAt: '2026-07-25',
        reviewStatus: 'approved',
        provenance: { kind: 'caissa-original', notes: 'Original CAISSA chase-return-target sequence with a close-king near-miss.', inspirationReferences: [] },
        copyrightNotes: 'No source prose, annotations, or commercial exercise sequence was copied.',
        originalityDeclaration: 'This unit was independently scoped, sequenced, and written for CAISSA.',
        verificationState: 'verified'
    }
};
import { activityItemsFor } from '../../../../authoring/evaluable-endgame-activities.js';
