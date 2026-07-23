/** @type {import('../../../../schema/knowledge-unit.js').KnowledgeUnit} */
export const directOpposition = {
    id: 'ku:endgames:pawn-foundations:direct-opposition',
    slug: 'direct-opposition',
    domain: 'endgames',
    status: 'published',
    schemaVersion: '1.0.0',
    contentVersion: '1.1.0',
    education: {
        knowledgeType: 'pattern',
        endgameFamily: 'pawn-endgames',
        themes: ['opposition', 'tempo', 'king-activity'],
        skills: ['pattern-recognition', 'calculation'],
        difficulty: 'foundation',
        expectedLearnerLevel: 'foundation-rules-aware',
        prerequisites: ['ku:endgames:pawn-foundations:activate-the-king'],
        learningObjectives: [
            'Recognize direct opposition when two kings face each other with one square between them.',
            'Explain how the side to move changes which king must yield access.'
        ],
        masteryCriteria: [
            'Correctly identifies the presence and holder of direct opposition in four of five mixed-turn diagrams and chooses a legal access-preserving king move in three guided cases.'
        ]
    },
    localization: {
        defaultLocale: 'en-US',
        availableLocales: ['en-US'],
        translationStatus: { 'en-US': 'ready' },
        content: {
            'en-US': {
                title: 'Recognize direct opposition',
                summary: 'Read king-to-king geometry and the move to understand who must give way.',
                explanation: 'Direct opposition occurs when the kings face along one rank or file with exactly one square between them. Because neither king may step next to the other, the side that must move often yields a route. This geometry matters only in context: pawn moves, edge squares, and alternate king routes can change what the tempo achieves. First recognize the pattern, then calculate the available king moves.',
                keyIdeas: [
                    'Geometry and side to move are both part of opposition.',
                    'Opposition controls access; it is not itself a declaration of the final result.'
                ],
                misconceptions: [
                    'Kings facing each other at any distance are not automatically in direct opposition.',
                    'Having opposition does not guarantee success when the needed entry square is unavailable.'
                ],
                practicalRules: [
                    'Confirm one square lies between the kings before naming direct opposition.',
                    'After recognizing it, list the legal king exits rather than assuming a result.'
                ],
                decisionProcess: [
                    'Locate both kings and the line connecting them.',
                    'Count the square between them and verify direct geometry.',
                    'Identify whose turn it is.',
                    'Calculate which access square opens after the moving king yields.'
                ],
                coachingPrompts: [
                    'How many squares lie between the kings?',
                    'What two facts define direct opposition?',
                    'Which king is required to move now?',
                    'Use the geometry-turn-access process before choosing a square.',
                    'Which route opened after the king moved?'
                ],
                reflectionPrompts: [
                    'How would the position’s meaning change if the turn changed?',
                    'Why is opposition an access tool rather than a result label?'
                ]
            }
        }
    },
    positions: [
        {
            id: 'pos:direct-opposition:file',
            fen: '8/8/4k3/8/4K3/8/P7/8 w - - 0 1',
            sideToMove: 'white',
            role: 'clean-demonstration',
            expectedConcepts: ['direct-opposition', 'side-to-move'],
            principalIdeas: [{ moves: ['Kd4'], purpose: 'Yield sideways and observe which access line changes.' }],
            validation: { structural: 'valid', educational: 'verified', notes: 'The kings form exact file opposition; no final-result claim is made.' }
        },
        {
            id: 'pos:direct-opposition:near-miss',
            fen: '8/8/5k2/8/3K4/8/P7/8 w - - 0 1',
            sideToMove: 'white',
            role: 'contrast',
            expectedConcepts: ['diagonal-near-miss', 'recognition-boundary'],
            principalIdeas: [{ moves: ['Ke4'], purpose: 'Move toward a direct relationship while distinguishing the starting geometry.' }],
            validation: { structural: 'valid', educational: 'verified', notes: 'The diagonal king placement is a deliberate non-example of direct opposition.' }
        }
    ],
    learningObjects: {
        demonstrations: [{ id: 'demo:opposition:file-geometry', positionId: 'pos:direct-opposition:file' }],
        guidedPractice: [{ id: 'guided:opposition:turn-and-access', positionId: 'pos:direct-opposition:file', prompt: 'Name geometry, turn, and opened route.' }],
        exercises: [{ id: 'exercise:opposition:near-miss', positionId: 'pos:direct-opposition:near-miss', task: 'Decide whether direct opposition exists before moving.' }],
        checksForUnderstanding: [{ id: 'check:opposition:definition', prompt: 'State both conditions for direct opposition.' }],
        assessments: [{ id: 'assessment:opposition:mixed-turn-five', criterionId: 'opposition-4-of-5' }],
        reviewItems: []
    },
    relationships: [
        { type: 'progression', targetId: 'ku:endgames:pawn-foundations:key-squares', reason: 'Opposition becomes purposeful when it helps the king reach a target square.' },
        { type: 'recommendation', targetId: 'ku:endgames:pawn-foundations:key-squares', reason: 'Key squares are the next application of controlled king access.' },
        { type: 'recommendation', targetId: 'ku:endgames:pawn-transformations:reserve-tempo', reason: 'Reserve tempi extend side-to-move control by preserving a pawn move until opposition becomes critical.' },
        { type: 'progression', targetId: 'ku:endgames:pawn-transformations:reserve-tempo', reason: 'After reading opposition geometry, learners can use a stored pawn move to transfer the move obligation.' },
        { type: 'remediation', targetId: 'ku:endgames:pawn-foundations:activate-the-king', reason: 'If the learner sees the pattern but cannot choose a route, revisit the purpose of king activity.' }
    ],
    integrations: {
        capabilities: ['academy-compatible', 'deterministic-coaching-prompts', 'mastery-criteria', 'training-memory-theme-link'],
        coaching: { policy: 'deterministic-prompt-only', conceptIds: ['direct-opposition', 'side-to-move'], hintOrder: ['observation', 'recall', 'direction', 'decision-process', 'reflection'] },
        trainingMemory: { themeIds: ['opposition', 'tempo'] },
        mastery: { criterionIds: ['opposition-4-of-5'] },
        recommendation: { nextUnitIds: ['ku:endgames:pawn-foundations:key-squares', 'ku:endgames:pawn-transformations:reserve-tempo'], remediationUnitIds: ['ku:endgames:pawn-foundations:activate-the-king'] },
        academy: { compatible: true }
    },
    editorial: {
        owner: 'CAISSA Curriculum', reviewer: 'CAISSA Season 9 Review', createdAt: '2026-07-23', updatedAt: '2026-07-23',
        reviewStatus: 'approved',
        provenance: { kind: 'caissa-original', notes: 'Original CAISSA recognition-to-access sequence for universal king geometry.', inspirationReferences: [] },
        copyrightNotes: 'No commercial wording, annotations, or curated diagram sequence was used.',
        originalityDeclaration: 'This unit was independently scoped, sequenced, and written for CAISSA.',
        verificationState: 'verified'
    }
};
