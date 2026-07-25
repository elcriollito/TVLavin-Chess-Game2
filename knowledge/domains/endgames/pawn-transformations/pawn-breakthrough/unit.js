/** @type {import('../../../../schema/knowledge-unit.js').KnowledgeUnit} */
export const pawnBreakthrough = {
    id: 'ku:endgames:pawn-transformations:pawn-breakthrough', slug: 'pawn-breakthrough', domain: 'endgames',
    status: 'published', schemaVersion: '1.1.0', contentVersion: '1.1.0',
    education: {
        knowledgeType: 'technique', endgameFamily: 'pawn-endgames',
        themes: ['pawn-breakthrough', 'pawn-structure', 'passed-pawns', 'pawn-races'],
        skills: ['pattern-recognition', 'move-order', 'calculation'], difficulty: 'intermediate',
        expectedLearnerLevel: 'foundation-rules-aware',
        prerequisites: [
            'ku:endgames:pawn-transformations:protected-passed-pawn',
            'ku:endgames:pawn-transformations:outside-passed-pawn'
        ],
        learningObjectives: [
            'Identify forcing pawn contacts where a sacrifice can transform a blocked structure into a passer.',
            'Calculate candidate breaks and the final pawn race instead of copying a visual pattern.'
        ],
        masteryCriteria: [
            'Lists at least two candidate pawn breaks and calculates the correct move order in four of five structures.',
            'Rejects a visually similar false breakthrough and creates the surviving passer in three of four independent tasks without a final hint.'
        ]
    },
    localization: {
        defaultLocale: 'en-US', availableLocales: ['en-US'], translationStatus: { 'en-US': 'ready' },
        content: { 'en-US': {
            title: 'Break through the pawn chain',
            summary: 'Calculate a sacrificial transformation that leaves a surviving passed pawn.',
            explanation: 'A breakthrough is not merely a pawn sacrifice. It is a forced structural transformation in which pawn advances and captures deflect the opposing pawns so that another pawn survives as a passer. Familiar shapes are candidate generators, not proofs. The exact truth belongs to the legal sequence, side to move, capture choices, and final race. Test forcing breaks first, compare replies, and reject the idea when no surviving passer is created.',
            keyIdeas: [
                'The sacrificed pawn succeeds only because another pawn inherits a clear route.',
                'Move order and side to move can turn a known pattern into a false breakthrough.'
            ],
            misconceptions: [
                'A pawn sacrifice is not a breakthrough when it creates no forced surviving passer.',
                'A memorized three-against-three shape does not remove the need to calculate every capture choice.'
            ],
            practicalRules: [
                'Test forcing pawn breaks before quiet moves when the pawn chains are locked in contact.',
                'Treat the pattern as promising only provided the final passer wins the verified pawn race.'
            ],
            decisionProcess: [
                'Identify locked pawn contact points.',
                'List forcing pawn advances and captures.',
                'Calculate each legal reply rather than following a memorized pattern.',
                'Determine which sacrifice creates the surviving passer.',
                'Verify the final pawn race and side-to-move dependency.'
            ],
            coachingPrompts: [
                'Where are the pawn chains locked in direct contact?',
                'Which pawn could be deflected from guarding a neighboring file?',
                'What forcing advances must be compared?',
                'Which candidate sacrifice could leave a different pawn alive?',
                'Calculate reply, recapture, surviving passer, and final race.',
                'After the sacrifice, which pawn actually retains a clear route?'
            ],
            reflectionPrompts: [
                'What exact reply would refute the apparent breakthrough?',
                'Why is the surviving passer—not the sacrifice—the defining feature?'
            ]
        } }
    },
    positions: [
        {
            id: 'pos:pawn-breakthrough:three-versus-three',
            fen: '8/ppp5/8/PPP5/8/8/8/4K2k w - - 0 1',
            sideToMove: 'white', role: 'clean-demonstration',
            expectedConcepts: ['pawn-breakthrough', 'deflection', 'surviving-passer'],
            principalIdeas: [{ moves: ['b6', 'axb6', 'c6', 'bxc6', 'a6'], purpose: 'Deflect both neighboring pawns so the a-pawn survives with a clear route.' }],
            validation: { structural: 'valid', educational: 'verified', notes: 'The complete principal sequence is structurally legal and verifies the surviving passer; broader result claims stop at that boundary.' }
        },
        {
            id: 'pos:pawn-breakthrough:black-to-move-near-miss',
            fen: '8/ppp5/8/PPP5/8/8/8/4K2k b - - 0 1',
            sideToMove: 'black', role: 'contrast',
            expectedConcepts: ['side-to-move-dependency', 'false-breakthrough', 'candidate-comparison'],
            principalIdeas: [{ moves: ['b6'], purpose: 'Change the contact structure before White can execute the demonstration sequence.' }],
            validation: { structural: 'valid', educational: 'verified', notes: 'The same pawn placement with the opposite move is materially different and prevents rote transfer.' }
        }
    ],
    learningObjects: {
        demonstrations: [{ id: 'demo:pawn-breakthrough:deflection', positionId: 'pos:pawn-breakthrough:three-versus-three' }],
        guidedPractice: [{ id: 'guided:pawn-breakthrough:candidates', positionId: 'pos:pawn-breakthrough:three-versus-three', prompt: 'List all forcing advances before calculating one.' }],
        exercises: [{ id: 'exercise:pawn-breakthrough:side-to-move', positionId: 'pos:pawn-breakthrough:black-to-move-near-miss', task: 'Explain why pattern recognition alone is insufficient.' }],
        checksForUnderstanding: [{ id: 'check:pawn-breakthrough:definition', prompt: 'State what must survive for a sacrifice to count as a breakthrough.' }],
        assessments: [{ id: 'assessment:pawn-breakthrough:three-of-four', criterionId: 'breakthrough-transfer-3-of-4' }],
        reviewItems: [{ id: 'review:pawn-breakthrough:exact-versus-heuristic', prompt: 'Separate the verified line from the pattern-based candidate heuristic.' }]
    },
    activityItems: activityItemsFor('ku:endgames:pawn-transformations:pawn-breakthrough'),
    relationships: [
        { type: 'remediation', targetId: 'ku:endgames:pawn-transformations:protected-passed-pawn', reason: 'If the learner cannot identify the pawn that will support or survive, revisit pawn-chain roles.' },
        { type: 'remediation', targetId: 'ku:endgames:pawn-transformations:outside-passed-pawn', reason: 'If the learner creates a passer but misjudges its race, revisit diversion and return-route calculation.' },
        { type: 'related', targetId: 'ku:endgames:pawn-foundations:rule-of-the-square', reason: 'The final surviving passer must still be checked with exact pawn-race geometry.' },
        { type: 'related', targetId: 'ku:endgames:pawn-transformations:reserve-tempo', reason: 'Both techniques are side-to-move sensitive, but breakthrough transforms structure rather than merely transferring obligation.' }
    ],
    integrations: {
        capabilities: ['academy-compatible', 'deterministic-coaching-prompts', 'mastery-criteria', 'training-memory-theme-link'],
        coaching: { policy: 'deterministic-prompt-only', conceptIds: ['pawn-breakthrough', 'deflection', 'surviving-passer'], hintOrder: ['observation', 'structural-recognition', 'candidate-identification', 'calculation-direction', 'decision-process', 'reflection'] },
        trainingMemory: { themeIds: ['pawn-breakthrough', 'pawn-structure', 'pawn-races'] },
        mastery: { criterionIds: ['breakthrough-candidates-4-of-5', 'breakthrough-transfer-3-of-4'] },
        recommendation: { remediationUnitIds: ['ku:endgames:pawn-transformations:protected-passed-pawn', 'ku:endgames:pawn-transformations:outside-passed-pawn'] },
        academy: { compatible: true }
    },
    editorial: {
        owner: 'CAISSA Curriculum', reviewer: 'CAISSA Season 9 Review', createdAt: '2026-07-23', updatedAt: '2026-07-25',
        reviewStatus: 'approved',
        provenance: { kind: 'caissa-original', notes: 'Original CAISSA candidate-reply-survivor sequence using a public-domain geometric motif with independently written instruction.', inspirationReferences: [{ kind: 'traditional-chess-pattern', title: 'Three-versus-three pawn breakthrough motif' }] },
        copyrightNotes: 'Traditional chess geometry is factual; all wording, sequencing, prompts, and learning objects are original.',
        originalityDeclaration: 'This unit was independently scoped, sequenced, and written for CAISSA.',
        verificationState: 'verified'
    }
};
import { activityItemsFor } from '../../../../authoring/evaluable-endgame-activities.js';
