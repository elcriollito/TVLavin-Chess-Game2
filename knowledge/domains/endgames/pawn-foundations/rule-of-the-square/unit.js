/** @type {import('../../../../schema/knowledge-unit.js').KnowledgeUnit} */
export const ruleOfTheSquare = {
    id: 'ku:endgames:pawn-foundations:rule-of-the-square',
    slug: 'rule-of-the-square',
    domain: 'endgames',
    status: 'published',
    schemaVersion: '1.0.0',
    contentVersion: '1.2.0',
    education: {
        knowledgeType: 'decision-rule',
        endgameFamily: 'pawn-endgames',
        themes: ['pawn-races', 'king-activity'],
        skills: ['board-geometry', 'calculation'],
        difficulty: 'foundation',
        expectedLearnerLevel: 'foundation-rules-aware',
        prerequisites: [],
        learningObjectives: [
            'Construct the pawn square from the pawn to its promotion rank.',
            'Decide whether the defending king can enter that square on its move.'
        ],
        masteryCriteria: [
            'Correctly applies the square test in four of five structurally valid positions without a hint.'
        ]
    },
    localization: {
        defaultLocale: 'en-US',
        availableLocales: ['en-US'],
        translationStatus: { 'en-US': 'ready' },
        content: {
            'en-US': {
                title: 'The pawn’s square',
                summary: 'Use board geometry to estimate whether a king can catch a lone advancing pawn.',
                explanation: 'Imagine a square whose side runs from the pawn to its promotion rank. Extend the same distance sideways. If the defending king can step into that area on its turn, the king can usually approach in time; if it cannot, the pawn usually outruns the king. Rebuild the square after every pawn move and calculate when checks, captures, or supporting kings change the race.',
                keyIdeas: [
                    'The remaining distance to promotion sets the square’s width.',
                    'Whose turn it is can move the boundary by one tempo.'
                ],
                misconceptions: [
                    'The rule is not a verdict when another piece, a checking move, or an occupied promotion path changes the race.'
                ],
                practicalRules: [
                    'Count the pawn’s remaining moves, then compare that count with the king’s shortest route.'
                ],
                decisionProcess: [
                    'Locate the promotion square.',
                    'Build the geometric square.',
                    'Account for the side to move.',
                    'Check for tactical exceptions before deciding.'
                ],
                coachingPrompts: [
                    'Where is the nearest boundary of the pawn’s square for the defending king?'
                ],
                reflectionPrompts: [
                    'Which single tempo would reverse your conclusion?'
                ]
            }
        }
    },
    positions: [{
        id: 'pos:rule-square:a-pawn-white-king-outside',
        fen: 'k7/8/8/8/p7/8/8/7K w - - 0 1',
        sideToMove: 'white',
        role: 'recognition-example',
        expectedConcepts: ['pawn-square-boundary', 'tempo'],
        principalIdeas: [{ moves: ['Kh2'], purpose: 'Test whether the king’s shortest route reaches the square after the pawn advances.' }],
        validation: {
            structural: 'valid',
            educational: 'verified',
            notes: 'Repository validation proves legal structure only; the bounded teaching claim was reviewed separately.'
        }
    }],
    learningObjects: {
        demonstrations: [{ id: 'demo:construct-square', positionId: 'pos:rule-square:a-pawn-white-king-outside' }],
        guidedPractice: [],
        exercises: [],
        checksForUnderstanding: [{ id: 'check:identify-boundary', promptKey: 'decisionProcess.1' }],
        assessments: [],
        reviewItems: []
    },
    relationships: [
        { type: 'progression', targetId: 'ku:endgames:pawn-foundations:activate-the-king', reason: 'After measuring whether a king can catch a pawn, the learner can plan how to improve that king.' },
        { type: 'recommendation', targetId: 'ku:endgames:pawn-foundations:activate-the-king', reason: 'King activation is the normal next unit for turning geometric recognition into a plan.' },
        { type: 'recommendation', targetId: 'ku:endgames:pawn-transformations:outside-passed-pawn', reason: 'Outside-passer play applies square counting to a chase, return route, and opposite-wing target.' },
        { type: 'progression', targetId: 'ku:endgames:pawn-transformations:outside-passed-pawn', reason: 'After learning a single pawn race boundary, learners can calculate a remote passer as part of a two-wing plan.' }
    ],
    integrations: {
        capabilities: [
            'academy-compatible',
            'deterministic-coaching-prompts',
            'mastery-criteria',
            'recommendation-entry-unit',
            'training-memory-theme-link'
        ],
        coaching: { policy: 'deterministic-prompt-only', conceptIds: ['pawn-square-boundary'] },
        trainingMemory: { themeIds: ['king-activity'] },
        mastery: { criterionIds: ['square-test-4-of-5'] },
        recommendation: { entryUnit: true, nextUnitIds: ['ku:endgames:pawn-foundations:activate-the-king', 'ku:endgames:pawn-transformations:outside-passed-pawn'] },
        academy: { compatible: true }
    },
    editorial: {
        owner: 'CAISSA Curriculum',
        reviewer: 'CAISSA Season 9 Review',
        createdAt: '2026-07-22',
        updatedAt: '2026-07-23',
        reviewStatus: 'approved',
        provenance: {
            kind: 'caissa-original',
            notes: 'Original CAISSA explanation and instructional sequence for a universal chess concept.',
            inspirationReferences: []
        },
        copyrightNotes: 'No source prose, annotations, exercise sequence, or curated position collection was copied.',
        originalityDeclaration: 'This Knowledge Unit was independently structured and written for CAISSA.',
        verificationState: 'verified'
    }
};
