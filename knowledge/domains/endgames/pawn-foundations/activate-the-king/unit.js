/** @type {import('../../../../schema/knowledge-unit.js').KnowledgeUnit} */
export const activateTheKing = {
    id: 'ku:endgames:pawn-foundations:activate-the-king',
    slug: 'activate-the-king',
    domain: 'endgames',
    status: 'published',
    schemaVersion: '1.0.0',
    contentVersion: '1.0.0',
    education: {
        knowledgeType: 'principle',
        endgameFamily: 'pawn-endgames',
        themes: ['king-activity', 'tempo'],
        skills: ['planning', 'calculation'],
        difficulty: 'foundation',
        expectedLearnerLevel: 'foundation-rules-aware',
        prerequisites: [],
        learningObjectives: [
            'Compare a king-improving move with an immediate pawn move before choosing a plan.',
            'Identify when the king can approach the critical area without abandoning a concrete pawn threat.'
        ],
        masteryCriteria: [
            'Selects a useful king approach in four of five varied king-and-pawn positions and names the tactical exception check before moving.'
        ]
    },
    localization: {
        defaultLocale: 'en-US',
        availableLocales: ['en-US'],
        translationStatus: { 'en-US': 'ready' },
        content: {
            'en-US': {
                title: 'Activate the king',
                summary: 'Improve the king’s access before spending pawn moves that cannot be recovered.',
                explanation: 'In reduced material, the king often changes from a protected piece into the main worker. A pawn move uses a tempo and permanently changes the structure; a king move may gain access, escort a pawn, or restrict the opposing king. Compare both plans before advancing. King activation is a practical priority, not an automatic command: an immediate race, capture, or promotion threat can make a pawn move more urgent.',
                keyIdeas: [
                    'King distance is a practical resource in an endgame.',
                    'Pawn moves are irreversible, while king routes often preserve choices.'
                ],
                misconceptions: [
                    'Activating the king does not mean walking toward the center without checking threats.',
                    'Delaying every pawn move is not safer; a concrete tempo can be decisive in a race.'
                ],
                practicalRules: [
                    'Before pushing, ask what useful square the king could reach with the same tempo.',
                    'Check captures, races, and promotion threats before following the king-activity heuristic.'
                ],
                decisionProcess: [
                    'Identify the square or pawn the king needs to influence.',
                    'Compare the shortest safe king route with the immediate pawn move.',
                    'Check whether the opponent has a forcing capture, race, or entry.',
                    'Choose the move that improves access without losing the concrete position.'
                ],
                coachingPrompts: [
                    'Which part of the board must your king influence?',
                    'What does king activity mean in this position?',
                    'Which direction improves access while staying near the pawn?',
                    'Compare one king move with one pawn move using the four-step process.',
                    'After your choice, which option did you preserve?'
                ],
                reflectionPrompts: [
                    'What concrete threat would justify advancing the pawn before improving the king?',
                    'Which king square would make the next decision easier?'
                ]
            }
        }
    },
    positions: [
        {
            id: 'pos:activate-king:central-route',
            fen: '8/7k/8/8/8/3P4/2K5/8 w - - 0 1',
            sideToMove: 'white',
            role: 'clean-demonstration',
            expectedConcepts: ['king-route', 'irreversible-pawn-tempo'],
            principalIdeas: [{ moves: ['Kc3'], purpose: 'Improve king access while keeping both pawn advances available.' }],
            validation: { structural: 'valid', educational: 'verified', notes: 'The move is legal; the instructional claim is a bounded planning comparison, not an exact-result claim.' }
        },
        {
            id: 'pos:activate-king:transfer-flank',
            fen: 'k7/8/8/8/8/4P3/5K2/8 w - - 0 1',
            sideToMove: 'white',
            role: 'transfer',
            expectedConcepts: ['king-route', 'threat-check'],
            principalIdeas: [{ moves: ['Kf3'], purpose: 'Begin a safe approach before deciding when to advance.' }],
            validation: { structural: 'valid', educational: 'verified', notes: 'Transfer changes file and approach direction without changing the planning question.' }
        }
    ],
    learningObjects: {
        demonstrations: [{ id: 'demo:activate-king:compare-tempi', positionId: 'pos:activate-king:central-route' }],
        guidedPractice: [{ id: 'guided:activate-king:route', positionId: 'pos:activate-king:transfer-flank', prompt: 'Name the target square before selecting a move.' }],
        exercises: [{ id: 'exercise:activate-king:king-or-pawn', positionId: 'pos:activate-king:central-route', task: 'Compare one king move and one pawn move.' }],
        checksForUnderstanding: [{ id: 'check:activate-king:exception', prompt: 'Name one forcing event that can override king activation.' }],
        assessments: [{ id: 'assessment:activate-king:varied-five', criterionId: 'active-route-4-of-5' }],
        reviewItems: []
    },
    relationships: [
        { type: 'related', targetId: 'ku:endgames:pawn-foundations:rule-of-the-square', reason: 'Square counting checks whether king activation can affect a pawn race.' },
        { type: 'progression', targetId: 'ku:endgames:pawn-foundations:direct-opposition', reason: 'After choosing to activate, the learner needs a precise king-versus-king access pattern.' },
        { type: 'recommendation', targetId: 'ku:endgames:pawn-foundations:direct-opposition', reason: 'Direct opposition is the normal next study for active king entry.' }
    ],
    integrations: {
        capabilities: ['academy-compatible', 'deterministic-coaching-prompts', 'mastery-criteria', 'recommendation-entry-unit', 'training-memory-theme-link'],
        coaching: { policy: 'deterministic-prompt-only', conceptIds: ['king-route', 'irreversible-pawn-tempo'], hintOrder: ['observation', 'recall', 'direction', 'decision-process', 'reflection'] },
        trainingMemory: { themeIds: ['king-activity', 'tempo'] },
        mastery: { criterionIds: ['active-route-4-of-5'] },
        recommendation: { nextUnitIds: ['ku:endgames:pawn-foundations:direct-opposition'], remediationUnitIds: ['ku:endgames:pawn-foundations:rule-of-the-square'] },
        academy: { compatible: true }
    },
    editorial: {
        owner: 'CAISSA Curriculum',
        reviewer: 'CAISSA Season 9 Review',
        createdAt: '2026-07-23',
        updatedAt: '2026-07-23',
        reviewStatus: 'approved',
        provenance: { kind: 'caissa-original', notes: 'Original CAISSA planning sequence for the universal endgame role of the king.', inspirationReferences: [] },
        copyrightNotes: 'No source prose, annotations, diagram collection, or exercise order was copied.',
        originalityDeclaration: 'This unit was independently scoped, sequenced, and written for CAISSA.',
        verificationState: 'verified'
    }
};
