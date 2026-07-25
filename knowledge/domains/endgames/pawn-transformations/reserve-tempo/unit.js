/** @type {import('../../../../schema/knowledge-unit.js').KnowledgeUnit} */
export const reserveTempo = {
    id: 'ku:endgames:pawn-transformations:reserve-tempo',
    slug: 'reserve-tempo',
    domain: 'endgames',
    status: 'published',
    schemaVersion: '1.1.0',
    contentVersion: '1.2.0',
    education: {
        knowledgeType: 'technique',
        endgameFamily: 'pawn-endgames',
        themes: ['tempo', 'opposition', 'zugzwang', 'pawn-structure'],
        skills: ['move-order', 'calculation', 'planning'],
        difficulty: 'developing',
        expectedLearnerLevel: 'foundation-rules-aware',
        prerequisites: ['ku:endgames:pawn-foundations:direct-opposition'],
        learningObjectives: [
            'Recognize a harmless pawn move that can be preserved to transfer the move obligation.',
            'Compare spending and preserving a reserve tempo before changing the pawn structure.'
        ],
        masteryCriteria: [
            'Identifies the available reserve tempo and explains its move-order effect in four of five varied positions.',
            'Preserves or spends the waiting move correctly in three of four independent tasks without a final-move hint.'
        ]
    },
    localization: {
        defaultLocale: 'en-US', availableLocales: ['en-US'], translationStatus: { 'en-US': 'ready' },
        content: {
            'en-US': {
                title: 'Preserve a reserve tempo',
                summary: 'Save a harmless pawn move until changing the move obligation changes the king contest.',
                explanation: 'A reserve tempo is a pawn move that can wait without immediately changing the critical structure. In positions where the kings are contesting access, spending that move at the right moment may pass the move obligation back to the opponent. This is an exact move-order effect in a calculated position, not a universal promise of zugzwang. Preserve flexibility while the waiting move still matters, and recalculate the king geometry before using it.',
                keyIdeas: [
                    'A reserve tempo has value because it changes who must move in the critical position.',
                    'The pawn move is useful only if its structural cost does not outweigh its timing benefit.'
                ],
                misconceptions: [
                    'Every legal pawn move is not a reserve tempo; an irreversible push may surrender a square or create a target.',
                    'A waiting move does not automatically win opposition if the opponent has another useful move or route.'
                ],
                practicalRules: [
                    'Usually preserve harmless pawn flexibility until the king geometry makes the move obligation important.',
                    'Before spending a reserve tempo, check every reply and whether the intended opposition still matters.'
                ],
                decisionProcess: [
                    'Identify pawn moves that do not damage the current structure.',
                    'Check whether moving first changes opposition, access, or zugzwang.',
                    'Preserve the waiting move until transferring the move obligation has a concrete purpose.',
                    'Recalculate the king routes before spending it.'
                ],
                coachingPrompts: [
                    'Which pawn still has a harmless move available?',
                    'What structural feature makes that move a reserve tempo?',
                    'Which candidate keeps the waiting move and which candidate spends it?',
                    'When would changing whose turn it is alter the king contest?',
                    'Compare preserve, transfer, and recalculate before choosing.',
                    'What changed in the king geometry after the waiting move?'
                ],
                reflectionPrompts: [
                    'What would be lost by spending the pawn move one turn earlier?',
                    'Which defender resource would make the waiting move ineffective?'
                ]
            }
        }
    },
    positions: [
        {
            id: 'pos:reserve-tempo:waiting-move',
            fen: '8/8/3k4/8/3Kp3/4P3/P7/8 w - - 0 1',
            sideToMove: 'white', role: 'clean-demonstration',
            expectedConcepts: ['reserve-tempo', 'move-obligation', 'opposition'],
            principalIdeas: [{ moves: ['a3'], purpose: 'Use the preserved wing-pawn move without altering the central pawn contact.' }],
            validation: { structural: 'valid', educational: 'verified', notes: 'Legality and the transfer of the move are verified; no universal result claim is attached.' }
        },
        {
            id: 'pos:reserve-tempo:already-spent',
            fen: '8/8/3k4/8/3Kp3/P3P3/8/8 w - - 0 1',
            sideToMove: 'white', role: 'contrast',
            expectedConcepts: ['spent-reserve-tempo', 'move-order-consequence'],
            principalIdeas: [{ moves: ['Kxe4'], purpose: 'Show that the stored wing-pawn option is no longer available in the comparison position.' }],
            validation: { structural: 'valid', educational: 'verified', notes: 'The a-pawn has already advanced, materially changing the available waiting moves.' }
        }
    ],
    learningObjects: {
        demonstrations: [{ id: 'demo:reserve-tempo:transfer', positionId: 'pos:reserve-tempo:waiting-move' }],
        guidedPractice: [{ id: 'guided:reserve-tempo:compare', positionId: 'pos:reserve-tempo:waiting-move', prompt: 'Compare using the wing pawn now with preserving it.' }],
        exercises: [{ id: 'exercise:reserve-tempo:spent', positionId: 'pos:reserve-tempo:already-spent', task: 'Explain what move-order resource is missing.' }],
        checksForUnderstanding: [{ id: 'check:reserve-tempo:conditions', prompt: 'Name the timing benefit and the structural cost that must be checked.' }],
        assessments: [{ id: 'assessment:reserve-tempo:four-of-five', criterionId: 'reserve-tempo-recognition-4-of-5' }],
        reviewItems: []
    },
    activityItems: activityItemsFor('ku:endgames:pawn-transformations:reserve-tempo'),
    relationships: [
        { type: 'recommendation', targetId: 'ku:endgames:pawn-exchanges:pawn-tension', reason: 'After preserving a waiting move, compare the distinct choice of preserving unresolved pawn captures.' },
        { type: 'progression', targetId: 'ku:endgames:pawn-transformations:protected-passed-pawn', reason: 'After controlling move obligation, learners can study how pawn structure restricts king routes.' },
        { type: 'remediation', targetId: 'ku:endgames:pawn-foundations:direct-opposition', reason: 'Learners who cannot explain the transferred obligation should revisit opposition geometry and side to move.' },
        { type: 'related', targetId: 'ku:endgames:pawn-foundations:convert-with-king-support', reason: 'Both units compare irreversible pawn moves with king improvement.' }
    ],
    integrations: {
        capabilities: ['academy-compatible', 'deterministic-coaching-prompts', 'mastery-criteria', 'training-memory-theme-link'],
        coaching: { policy: 'deterministic-prompt-only', conceptIds: ['reserve-tempo', 'move-obligation'], hintOrder: ['observation', 'structural-recognition', 'candidate-identification', 'calculation-direction', 'decision-process', 'reflection'] },
        trainingMemory: { themeIds: ['tempo', 'opposition', 'zugzwang'] },
        mastery: { criterionIds: ['reserve-tempo-recognition-4-of-5', 'reserve-tempo-use-3-of-4'] },
        recommendation: { nextUnitIds: ['ku:endgames:pawn-transformations:protected-passed-pawn'], remediationUnitIds: ['ku:endgames:pawn-foundations:direct-opposition'] },
        academy: { compatible: true }
    },
    editorial: {
        owner: 'CAISSA Curriculum', reviewer: 'CAISSA Season 9 Review', createdAt: '2026-07-23', updatedAt: '2026-07-25',
        reviewStatus: 'approved',
        provenance: { kind: 'caissa-original', notes: 'Original CAISSA sequence separating stored pawn flexibility from the opposition geometry it modifies.', inspirationReferences: [] },
        copyrightNotes: 'No source prose, annotations, or commercial exercise sequence was copied.',
        originalityDeclaration: 'This unit was independently scoped, sequenced, and written for CAISSA.',
        verificationState: 'verified'
    }
};
import { activityItemsFor } from '../../../../authoring/evaluable-endgame-activities.js';
