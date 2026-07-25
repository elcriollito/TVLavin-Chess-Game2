/** @type {import('../../../../schema/knowledge-unit.js').KnowledgeUnit} */
export const keySquares = {
    id: 'ku:endgames:pawn-foundations:key-squares',
    slug: 'key-squares',
    domain: 'endgames',
    status: 'published',
    schemaVersion: '1.1.0',
    contentVersion: '1.1.0',
    education: {
        knowledgeType: 'decision-rule',
        endgameFamily: 'pawn-endgames',
        themes: ['key-squares', 'king-activity', 'pawn-support'],
        skills: ['board-geometry', 'planning', 'pattern-recognition'],
        difficulty: 'developing',
        expectedLearnerLevel: 'foundation-rules-aware',
        prerequisites: ['ku:endgames:pawn-foundations:activate-the-king', 'ku:endgames:pawn-foundations:direct-opposition'],
        learningObjectives: [
            'Identify the target squares associated with a defined non-rook pawn position.',
            'Choose a king route toward a target square before advancing the pawn.'
        ],
        masteryCriteria: [
            'Distinguishes a target-square position from a near-miss in four of five diagrams and explains why one premature pawn move changes king access.'
        ]
    },
    localization: {
        defaultLocale: 'en-US', availableLocales: ['en-US'], translationStatus: { 'en-US': 'ready' },
        content: {
            'en-US': {
                title: 'Reach the key squares',
                summary: 'Turn general king activity into a concrete target for supporting a pawn.',
                explanation: 'A key square is a target from which the attacking king can support a defined pawn objective despite the defending king’s resistance. The relevant targets depend on the pawn’s file, rank, and surrounding geometry; they are not permanent marks on the board. Opposition may help the king gain access, but opposition and key squares answer different questions: one describes king geometry, while the other identifies where the king wants to arrive.',
                keyIdeas: [
                    'A useful target gives king activity a concrete purpose.',
                    'Recalculate targets when the pawn advances or the geometry changes.'
                ],
                misconceptions: [
                    'The square directly in front of the pawn is not always the only useful target.',
                    'Reaching opposition is not enough if it does not lead toward a relevant target square.'
                ],
                practicalRules: [
                    'Name the target before calculating the route.',
                    'Test whether an immediate pawn move removes a king-entry option.'
                ],
                decisionProcess: [
                    'Fix the pawn’s current file and rank.',
                    'Identify the target squares relevant to that structure.',
                    'Compare king routes and opposition resources.',
                    'Advance only after checking that the target remains reachable.'
                ],
                coachingPrompts: [
                    'Which square would let the king support progress?',
                    'What makes a square a target in this pawn structure?',
                    'Which route approaches the target without spending the pawn tempo?',
                    'Apply structure, target, route, then advance.',
                    'Which access option did the chosen move preserve?'
                ],
                reflectionPrompts: [
                    'How is a key square different from opposition?',
                    'What changed when the pawn advanced one rank?'
                ]
            }
        }
    },
    positions: [
        {
            id: 'pos:key-squares:central-pawn-route',
            fen: '8/3k4/8/8/3P4/3K4/8/8 w - - 0 1',
            sideToMove: 'white',
            role: 'clean-demonstration',
            expectedConcepts: ['target-square', 'king-route-before-pawn'],
            principalIdeas: [{ moves: ['Kc3'], purpose: 'Approach a supporting target while retaining the current pawn structure.' }],
            validation: { structural: 'valid', educational: 'verified', notes: 'The position isolates target selection; exact outcome remains outside repository structural validation.' }
        },
        {
            id: 'pos:key-squares:opposition-contrast',
            fen: '8/4k3/8/3P4/2K5/8/8/8 w - - 0 1',
            sideToMove: 'white',
            role: 'contrast',
            expectedConcepts: ['target-square', 'opposition-is-not-target'],
            principalIdeas: [{ moves: ['Kc5'], purpose: 'Approach the target area rather than naming opposition as the objective.' }],
            validation: { structural: 'valid', educational: 'verified', notes: 'Contrast separates the desired destination from a temporary king relationship.' }
        }
    ],
    learningObjects: {
        demonstrations: [{ id: 'demo:key-squares:map-targets', positionId: 'pos:key-squares:central-pawn-route' }],
        guidedPractice: [{ id: 'guided:key-squares:route', positionId: 'pos:key-squares:central-pawn-route', prompt: 'Mark the target before choosing the route.' }],
        exercises: [{ id: 'exercise:key-squares:contrast', positionId: 'pos:key-squares:opposition-contrast', task: 'Choose between pursuing geometry and pursuing the target.' }],
        checksForUnderstanding: [{ id: 'check:key-squares:boundary', prompt: 'Explain why targets must be recalculated after a structural change.' }],
        assessments: [{ id: 'assessment:key-squares:four-of-five', criterionId: 'key-square-4-of-5' }],
        reviewItems: []
    },
    activityItems: activityItemsFor('ku:endgames:pawn-foundations:key-squares'),
    relationships: [
        { type: 'contrast', targetId: 'ku:endgames:pawn-foundations:direct-opposition', reason: 'Opposition describes temporary king geometry; key squares describe the destination that geometry may help reach.' },
        { type: 'progression', targetId: 'ku:endgames:pawn-foundations:convert-with-king-support', reason: 'After identifying the target, the learner must coordinate king and pawn move order.' },
        { type: 'recommendation', targetId: 'ku:endgames:pawn-foundations:convert-with-king-support', reason: 'Supported conversion is the next independent application of target-square planning.' },
        { type: 'remediation', targetId: 'ku:endgames:pawn-foundations:direct-opposition', reason: 'If the route fails because the opposing king blocks entry, revisit opposition and side to move.' }
    ],
    integrations: {
        capabilities: ['academy-compatible', 'deterministic-coaching-prompts', 'mastery-criteria', 'training-memory-theme-link'],
        coaching: { policy: 'deterministic-prompt-only', conceptIds: ['target-square', 'king-route-before-pawn'], hintOrder: ['observation', 'recall', 'direction', 'decision-process', 'reflection'] },
        trainingMemory: { themeIds: ['key-squares', 'king-activity'] },
        mastery: { criterionIds: ['key-square-4-of-5'] },
        recommendation: { nextUnitIds: ['ku:endgames:pawn-foundations:convert-with-king-support'], remediationUnitIds: ['ku:endgames:pawn-foundations:direct-opposition'] },
        academy: { compatible: true }
    },
    editorial: {
        owner: 'CAISSA Curriculum', reviewer: 'CAISSA Season 9 Review', createdAt: '2026-07-23', updatedAt: '2026-07-25',
        reviewStatus: 'approved',
        provenance: { kind: 'caissa-original', notes: 'Original CAISSA structure-target-route-advance teaching sequence for a universal pawn-ending concept.', inspirationReferences: [] },
        copyrightNotes: 'No source wording, annotations, or diagram collection was copied.',
        originalityDeclaration: 'This unit was independently scoped, sequenced, and written for CAISSA.',
        verificationState: 'verified'
    }
};
import { activityItemsFor } from '../../../../authoring/evaluable-endgame-activities.js';
