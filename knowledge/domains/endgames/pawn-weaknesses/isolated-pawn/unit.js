/** @type {import('../../../../schema/knowledge-unit.js').KnowledgeUnit} */
export const isolatedPawn = {
    id: 'ku:endgames:pawn-weaknesses:isolated-pawn', slug: 'isolated-pawn', domain: 'endgames',
    status: 'published', schemaVersion: '1.1.0', contentVersion: '1.1.0',
    education: {
        knowledgeType: 'technique', endgameFamily: 'pawn-endgames',
        themes: ['isolated-pawn', 'fixed-weakness', 'restraint', 'king-activity'],
        skills: ['pattern-recognition', 'planning', 'calculation'], difficulty: 'developing', expectedLearnerLevel: 'foundation-rules-aware',
        prerequisites: ['ku:endgames:pawn-weaknesses:fix-pawn-weakness'],
        learningObjectives: ['Classify a pawn as isolated by the absence of friendly pawns on neighboring files.', 'Compare restraint and attack with the isolated pawn’s activity and exchange resources.'],
        masteryCriteria: ['Classifies isolated and non-isolated pawns correctly in four of five structures.', 'Finds an attack route or rejects an unsafe attack when activity compensates in three of four tasks.']
    },
    localization: {
        defaultLocale: 'en-US', availableLocales: ['en-US'], translationStatus: { 'en-US': 'ready' },
        content: { 'en-US': {
            title: 'Exploit an isolated pawn',
            summary: 'Restrain a pawn without neighboring support, then test whether it is truly attackable.',
            explanation: 'An isolated pawn has no friendly pawn on either neighboring file. That exact classification explains why another pawn cannot defend it, but not whether it is lost. The pawn may advance, create a passer, gain space, or distract the king. Restrain its useful advance, map the king route, and compare the attack with the activity the defender receives.',
            keyIdeas: ['Isolation is an exact structural relation; weakness is a position-dependent evaluation.', 'Restraint prevents the isolated pawn from trading its weakness for activity.'],
            misconceptions: ['An isolated pawn is not automatically losing.', 'A neighboring piece or active king can compensate even though no pawn can provide support.'],
            practicalRules: ['Isolated pawns are often easier to attack in simplified endings when their advance is restrained.', 'Do not chase the pawn if its advance creates a dangerous race or entry route.'],
            decisionProcess: ['Check both neighboring files for friendly pawns.', 'Test safe advances and exchanges.', 'Identify a restraining square.', 'Map the attacking king route.', 'Evaluate defender activity and races.', 'Choose restraint, attack, or transformation.'],
            coachingPrompts: ['Which friendly pawns occupy neighboring files?', 'Is the pawn isolated and also fixed?', 'Which candidate restrains its advance?', 'What activity does the defender gain while your king attacks?', 'Use support, escape, restraint, route, and activity to choose the plan.', 'Did the attack win a target or release useful counterplay?'],
            reflectionPrompts: ['What compensation can make an isolated pawn harmless or strong?', 'Which structural exchange would remove the isolation?']
        } }
    },
    positions: [
        { id: 'pos:isolated-pawn:restrained', fen: '8/8/3k4/3p4/3P4/2K5/P7/8 w - - 0 1', sideToMove: 'white', role: 'clean-demonstration', expectedConcepts: ['isolated-pawn', 'restraint', 'attack-route'], principalIdeas: [{ moves: ['Kb4'], purpose: 'Approach the isolated fixed pawn while retaining restraint.' }], validation: { structural: 'valid', educational: 'verified', notes: 'No black pawns occupy neighboring files; the legal approach is verified.' } },
        { id: 'pos:isolated-pawn:active-counterplay', fen: '8/8/5k2/4p3/8/3K4/P7/8 b - - 0 1', sideToMove: 'black', role: 'contrast', expectedConcepts: ['isolated-pawn-activity', 'advance-resource', 'race-check'], principalIdeas: [{ moves: ['e4+'], purpose: 'Use the isolated pawn actively rather than wait for a static attack.' }], validation: { structural: 'valid', educational: 'verified', notes: 'The legal checking advance demonstrates compensation without claiming a final result.' } }
    ],
    learningObjects: {
        demonstrations: [{ id: 'demo:isolated-pawn:classify-and-restrain', positionId: 'pos:isolated-pawn:restrained' }],
        guidedPractice: [{ id: 'guided:isolated-pawn:route', positionId: 'pos:isolated-pawn:restrained', prompt: 'Classify the pawn, then map a restrained king approach.' }],
        exercises: [{ id: 'exercise:isolated-pawn:activity', positionId: 'pos:isolated-pawn:active-counterplay', task: 'Decide whether activity compensates for isolation.' }],
        checksForUnderstanding: [{ id: 'check:isolated-pawn:definition', prompt: 'Define isolation without making a result claim.' }],
        assessments: [{ id: 'assessment:isolated-pawn:three-of-four', criterionId: 'isolated-plan-3-of-4' }],
        reviewItems: []
    },
    activityItems: activityItemsFor('ku:endgames:pawn-weaknesses:isolated-pawn'),
    relationships: [
        { type: 'contrast', targetId: 'ku:endgames:pawn-weaknesses:backward-pawn', reason: 'An isolated pawn lacks neighboring pawn support; a backward pawn may have neighbors but cannot advance safely.' },
        { type: 'progression', targetId: 'ku:endgames:pawn-weaknesses:backward-pawn', reason: 'Backward-pawn diagnosis adds blocked advance and liberation to the weakness-classification process.' },
        { type: 'remediation', targetId: 'ku:endgames:pawn-weaknesses:fix-pawn-weakness', reason: 'If the learner attacks while the pawn can advance, revisit fixing the target.' },
        { type: 'related', targetId: 'ku:endgames:pawn-foundations:activate-the-king', reason: 'King access determines whether structural isolation can be exploited.' }
    ],
    integrations: {
        capabilities: ['academy-compatible', 'deterministic-coaching-prompts', 'mastery-criteria', 'training-memory-theme-link'],
        coaching: { policy: 'deterministic-prompt-only', conceptIds: ['isolated-pawn', 'restraint', 'activity'], hintOrder: ['observation', 'classification', 'candidate-identification', 'calculation-direction', 'decision-process', 'reflection'] },
        trainingMemory: { themeIds: ['isolated-pawn', 'fixed-weakness'] }, mastery: { criterionIds: ['isolated-classify-4-of-5', 'isolated-plan-3-of-4'] },
        recommendation: { nextUnitIds: ['ku:endgames:pawn-weaknesses:backward-pawn'], remediationUnitIds: ['ku:endgames:pawn-weaknesses:fix-pawn-weakness'] }, academy: { compatible: true }
    },
    editorial: {
        owner: 'CAISSA Curriculum', reviewer: 'CAISSA Season 9 Review', createdAt: '2026-07-23', updatedAt: '2026-07-25', reviewStatus: 'approved',
        provenance: { kind: 'caissa-original', notes: 'Original CAISSA support-escape-restraint-route-activity sequence.', inspirationReferences: [] },
        copyrightNotes: 'No source prose, annotations, or commercial exercise sequence was copied.', originalityDeclaration: 'This unit was independently scoped, sequenced, and written for CAISSA.', verificationState: 'verified'
    }
};
import { activityItemsFor } from '../../../../authoring/evaluable-endgame-activities.js';
