/** @type {import('../../../../schema/knowledge-unit.js').KnowledgeUnit} */
export const fixPawnWeakness = {
    id: 'ku:endgames:pawn-weaknesses:fix-pawn-weakness', slug: 'fix-pawn-weakness', domain: 'endgames',
    status: 'published', schemaVersion: '1.1.0', contentVersion: '1.1.0',
    education: {
        knowledgeType: 'principle', endgameFamily: 'pawn-endgames',
        themes: ['fixed-weakness', 'restraint', 'pawn-structure', 'king-activity'],
        skills: ['planning', 'move-order', 'calculation'], difficulty: 'developing', expectedLearnerLevel: 'foundation-rules-aware',
        prerequisites: ['ku:endgames:pawn-foundations:activate-the-king'],
        learningObjectives: ['Distinguish a fixed target from a pawn that can escape by advancing or exchanging.', 'Restrain a target before improving the king and attacking it.'],
        masteryCriteria: ['Identifies the target’s advance or exchange escape in four of five positions.', 'Chooses restraint before attack and explains the counterplay check in three of four tasks.']
    },
    localization: {
        defaultLocale: 'en-US', availableLocales: ['en-US'], translationStatus: { 'en-US': 'ready' },
        content: { 'en-US': {
            title: 'Fix the target before attacking',
            summary: 'Remove a pawn’s escape before committing the king to attack it.',
            explanation: 'A pawn is a dependable target only when it cannot solve its problem by advancing, exchanging, or creating counterplay. Fixing uses pawn contact, king control, or a blockade to stabilize the weakness. Attacking too early may release it. Restrain first when the target can escape, improve the king without loosening your own structure, and transform instead when restraint gives the opponent too much activity.',
            keyIdeas: ['Fixing turns temporary vulnerability into a stable planning target.', 'The attacker must preserve flexibility while removing the defender’s pawn breaks.'],
            misconceptions: ['An exposed-looking pawn is not fixed if it can advance or exchange safely.', 'Fixing is not automatically best when a concrete transformation creates a clearer advantage.'],
            practicalRules: ['Often restrain a weakness before sending the king to attack it.', 'Recheck pawn breaks whenever king movement changes the structure.'],
            decisionProcess: ['Identify the potential target.', 'List its advance and exchange escapes.', 'Restrict those escapes.', 'Improve the king without releasing the target.', 'Attack only when the target is stable.', 'Recalculate counterplay and transformation options.'],
            coachingPrompts: ['Which pawn appears to be the target?', 'Is it fixed or only temporarily vulnerable?', 'Which restraining candidate removes its escape?', 'What counterplay follows an immediate attack?', 'Use target, escape, restraint, improvement, and counterplay before committing.', 'Did the move stabilize the target or help it escape?'],
            reflectionPrompts: ['Which pawn break would make the target disappear?', 'When would transforming the structure be stronger than preserving the weakness?']
        } }
    },
    positions: [
        { id: 'pos:fix-weakness:restrained-target', fen: '8/8/3k4/3p4/3P4/2K5/8/8 w - - 0 1', sideToMove: 'white', role: 'clean-demonstration', expectedConcepts: ['fixed-weakness', 'restraint', 'king-route'], principalIdeas: [{ moves: ['Kb4'], purpose: 'Approach the fixed pawn while maintaining the restraining pawn contact.' }], validation: { structural: 'valid', educational: 'verified', notes: 'The locked pawn contact and legal king approach are verified without a final-result claim.' } },
        { id: 'pos:fix-weakness:escape-available', fen: '8/8/3k4/3p4/8/2K5/4P3/8 b - - 0 1', sideToMove: 'black', role: 'contrast', expectedConcepts: ['temporary-target', 'advance-escape', 'classification-boundary'], principalIdeas: [{ moves: ['d4'], purpose: 'Demonstrate that the alleged target can advance and is not fixed.' }], validation: { structural: 'valid', educational: 'verified', notes: 'The legal escape distinguishes temporary vulnerability from a fixed target.' } }
    ],
    learningObjects: {
        demonstrations: [{ id: 'demo:fix-weakness:restrain', positionId: 'pos:fix-weakness:restrained-target' }],
        guidedPractice: [{ id: 'guided:fix-weakness:escape-list', positionId: 'pos:fix-weakness:escape-available', prompt: 'List every advance and exchange escape before attacking.' }],
        exercises: [{ id: 'exercise:fix-weakness:approach', positionId: 'pos:fix-weakness:restrained-target', task: 'Choose a king route that preserves restraint.' }],
        checksForUnderstanding: [{ id: 'check:fix-weakness:fixed-versus-temporary', prompt: 'State what makes a target fixed rather than temporary.' }],
        assessments: [{ id: 'assessment:fix-weakness:three-of-four', criterionId: 'fix-before-attack-3-of-4' }],
        reviewItems: []
    },
    activityItems: activityItemsFor('ku:endgames:pawn-weaknesses:fix-pawn-weakness'),
    relationships: [
        { type: 'progression', targetId: 'ku:endgames:pawn-weaknesses:isolated-pawn', reason: 'Once restraint is understood, learners can apply it to a pawn without neighboring support.' },
        { type: 'progression', targetId: 'ku:endgames:pawn-weaknesses:backward-pawn', reason: 'Fixing prepares learners to distinguish a restrained backward pawn from one that can break free.' },
        { type: 'related', targetId: 'ku:endgames:pawn-transformations:protected-passed-pawn', reason: 'Both units examine pawn-chain stability, but one preserves an asset while the other stabilizes a target.' },
        { type: 'remediation', targetId: 'ku:endgames:pawn-foundations:activate-the-king', reason: 'Premature pawn attacks often reveal that the learner has no useful king route.' }
    ],
    integrations: {
        capabilities: ['academy-compatible', 'deterministic-coaching-prompts', 'mastery-criteria', 'training-memory-theme-link'],
        coaching: { policy: 'deterministic-prompt-only', conceptIds: ['fixed-weakness', 'restraint', 'escape'], hintOrder: ['observation', 'classification', 'candidate-identification', 'calculation-direction', 'decision-process', 'reflection'] },
        trainingMemory: { themeIds: ['fixed-weakness', 'restraint'] }, mastery: { criterionIds: ['target-escape-4-of-5', 'fix-before-attack-3-of-4'] },
        recommendation: { nextUnitIds: ['ku:endgames:pawn-weaknesses:isolated-pawn', 'ku:endgames:pawn-weaknesses:backward-pawn'], remediationUnitIds: ['ku:endgames:pawn-foundations:activate-the-king'] }, academy: { compatible: true }
    },
    editorial: {
        owner: 'CAISSA Curriculum', reviewer: 'CAISSA Season 9 Review', createdAt: '2026-07-23', updatedAt: '2026-07-25', reviewStatus: 'approved',
        provenance: { kind: 'caissa-original', notes: 'Original CAISSA target-escape-restraint-approach-counterplay sequence.', inspirationReferences: [] },
        copyrightNotes: 'No source prose, annotations, or commercial exercise sequence was copied.', originalityDeclaration: 'This unit was independently scoped, sequenced, and written for CAISSA.', verificationState: 'verified'
    }
};
import { activityItemsFor } from '../../../../authoring/evaluable-endgame-activities.js';
