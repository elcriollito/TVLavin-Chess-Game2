/** @type {import('../../../../schema/knowledge-unit.js').KnowledgeUnit} */
export const convertWithKingSupport = {
    id: 'ku:endgames:pawn-foundations:convert-with-king-support',
    slug: 'convert-with-king-support',
    domain: 'endgames',
    status: 'published',
    schemaVersion: '1.0.0',
    contentVersion: '1.0.0',
    education: {
        knowledgeType: 'technique',
        endgameFamily: 'pawn-endgames',
        themes: ['pawn-support', 'key-squares', 'king-activity', 'tempo'],
        skills: ['move-order', 'calculation', 'planning'],
        difficulty: 'developing',
        expectedLearnerLevel: 'foundation-rules-aware',
        prerequisites: ['ku:endgames:pawn-foundations:activate-the-king', 'ku:endgames:pawn-foundations:key-squares'],
        learningObjectives: [
            'Coordinate king improvement and pawn advancement without surrendering a needed entry square.',
            'Use square counting, target squares, and side to move to choose an independent move order.'
        ],
        masteryCriteria: [
            'Solves four of five varied king-support move-order tasks without the final hint and explains why an immediate pawn advance is safe or premature.'
        ]
    },
    localization: {
        defaultLocale: 'en-US', availableLocales: ['en-US'], translationStatus: { 'en-US': 'ready' },
        content: {
            'en-US': {
                title: 'Convert with king support',
                summary: 'Coordinate king access and pawn timing instead of pushing by habit.',
                explanation: 'Conversion begins when separate ideas become one move-order decision. The king seeks a useful supporting square, the pawn preserves or uses tempi, and square counting checks races. Improve the king when that preserves access; advance when the pawn move creates progress without giving the defending king a decisive route. This technique does not promise a win in every position. It organizes calculation in positions where king support is the central task.',
                keyIdeas: [
                    'The king and pawn have different jobs, and move order coordinates them.',
                    'A pawn advance is strongest when the king already controls the squares the pawn cannot.'
                ],
                misconceptions: [
                    'A passed pawn should not be pushed automatically when its king still needs an entry route.',
                    'Placing the king in front is not sufficient if the move order loses a tempo or allows a bypass.'
                ],
                practicalRules: [
                    'State the king’s target and the pawn’s next job before choosing which piece moves.',
                    'Recheck the pawn square and opponent’s entry after every irreversible advance.'
                ],
                decisionProcess: [
                    'Identify the current king target and the pawn’s promotion route.',
                    'Check opposition, side to move, and the defender’s nearest entry.',
                    'Compare the best king-improving move with the best pawn advance.',
                    'Choose the order that preserves support, then recalculate after the move.'
                ],
                coachingPrompts: [
                    'What job belongs to the king and what job belongs to the pawn?',
                    'Which earlier concepts help compare the two candidate moves?',
                    'Which direction preserves the king’s access?',
                    'Use target, opposition, comparison, and recalculation before deciding.',
                    'Why was the pawn move safe now—or why was it still premature?'
                ],
                reflectionPrompts: [
                    'Which earlier concept changed your move order?',
                    'What defender entry would make your plan fail?'
                ]
            }
        }
    },
    positions: [
        {
            id: 'pos:king-support:central-coordination',
            fen: '8/4k3/8/3K4/4P3/8/8/8 w - - 0 1',
            sideToMove: 'white',
            role: 'clean-demonstration',
            expectedConcepts: ['king-pawn-jobs', 'supported-move-order'],
            principalIdeas: [{ moves: ['Kc6'], purpose: 'Improve king access before deciding whether the pawn should advance.' }],
            validation: { structural: 'valid', educational: 'verified', notes: 'The sequence demonstrates coordination only; no unverified forced-result claim is attached.' }
        },
        {
            id: 'pos:king-support:transfer-side-entry',
            fen: '8/2k5/8/4K3/4P3/8/8/8 w - - 0 1',
            sideToMove: 'white',
            role: 'transfer',
            expectedConcepts: ['defender-entry', 'supported-move-order'],
            principalIdeas: [{ moves: ['Kd5'], purpose: 'Keep the king connected to the pawn while accounting for the defender’s side entry.' }],
            validation: { structural: 'valid', educational: 'verified', notes: 'Transfer requires recalculating the king route against a changed defender approach.' }
        }
    ],
    learningObjects: {
        demonstrations: [{ id: 'demo:king-support:assign-jobs', positionId: 'pos:king-support:central-coordination' }],
        guidedPractice: [{ id: 'guided:king-support:compare', positionId: 'pos:king-support:transfer-side-entry', prompt: 'Compare the best king move with the best pawn move.' }],
        exercises: [{ id: 'exercise:king-support:move-order', positionId: 'pos:king-support:central-coordination', task: 'Choose and justify the first move without a final-move hint.' }],
        checksForUnderstanding: [{ id: 'check:king-support:recalculate', prompt: 'Name what must be recalculated after the pawn advances.' }],
        assessments: [{ id: 'assessment:king-support:four-of-five', criterionId: 'supported-conversion-4-of-5' }],
        reviewItems: [{ id: 'review:king-support:concept-chain', conceptIds: ['pawn-square-boundary', 'king-route', 'direct-opposition', 'target-square'] }]
    },
    relationships: [
        { type: 'remediation', targetId: 'ku:endgames:pawn-foundations:key-squares', reason: 'If the learner advances without a king destination, revisit target-square identification.' },
        { type: 'remediation', targetId: 'ku:endgames:pawn-foundations:activate-the-king', reason: 'If king and pawn jobs are confused, revisit the purpose and exceptions of king activity.' },
        { type: 'related', targetId: 'ku:endgames:pawn-foundations:rule-of-the-square', reason: 'Square counting checks whether the chosen move order survives a pawn race.' },
        { type: 'recommendation', targetId: 'ku:endgames:pawn-foundations:direct-opposition', reason: 'Review opposition when conversion attempts repeatedly lose king access on the move.' }
    ],
    integrations: {
        capabilities: ['academy-compatible', 'deterministic-coaching-prompts', 'mastery-criteria', 'training-memory-theme-link'],
        coaching: { policy: 'deterministic-prompt-only', conceptIds: ['king-pawn-jobs', 'supported-move-order'], hintOrder: ['observation', 'recall', 'direction', 'decision-process', 'reflection'] },
        trainingMemory: { themeIds: ['pawn-support', 'key-squares', 'king-activity'] },
        mastery: { criterionIds: ['supported-conversion-4-of-5'] },
        recommendation: { remediationUnitIds: ['ku:endgames:pawn-foundations:key-squares', 'ku:endgames:pawn-foundations:activate-the-king'] },
        academy: { compatible: true }
    },
    editorial: {
        owner: 'CAISSA Curriculum', reviewer: 'CAISSA Season 9 Review', createdAt: '2026-07-23', updatedAt: '2026-07-23',
        reviewStatus: 'approved',
        provenance: { kind: 'caissa-original', notes: 'Original CAISSA integration sequence joining target, access, move comparison, and recalculation.', inspirationReferences: [] },
        copyrightNotes: 'No source prose, annotations, or commercial exercise organization was copied.',
        originalityDeclaration: 'This unit was independently scoped, sequenced, and written for CAISSA.',
        verificationState: 'verified'
    }
};
