/** @type {import('../../../../schema/knowledge-unit.js').KnowledgeUnit} */
export const protectedPassedPawn = {
    id: 'ku:endgames:pawn-transformations:protected-passed-pawn', slug: 'protected-passed-pawn', domain: 'endgames',
    status: 'published', schemaVersion: '1.1.0', contentVersion: '1.1.0',
    education: {
        knowledgeType: 'principle', endgameFamily: 'pawn-endgames',
        themes: ['passed-pawns', 'pawn-structure', 'pawn-support', 'king-activity'],
        skills: ['pattern-recognition', 'planning', 'calculation'], difficulty: 'developing',
        expectedLearnerLevel: 'foundation-rules-aware',
        prerequisites: ['ku:endgames:pawn-foundations:activate-the-king'],
        learningObjectives: [
            'Identify the passed pawn and the pawn that protects it.',
            'Evaluate the passer as a restriction anchor while checking attacks on its support base.'
        ],
        masteryCriteria: [
            'Identifies passer, support base, and restricted king squares in four of five diagrams.',
            'Distinguishes a stable protected passer from an attackable chain and selects a king-improving plan in three of four tasks.'
        ]
    },
    localization: {
        defaultLocale: 'en-US', availableLocales: ['en-US'], translationStatus: { 'en-US': 'ready' },
        content: { 'en-US': {
            title: 'Use the protected passed pawn',
            summary: 'Treat a mutually supported passer as a restriction anchor while the king improves.',
            explanation: 'A protected passed pawn is defended by another pawn and has no opposing pawn able to stop it on its file or adjacent files. Its strategic value often comes from restricting the enemy king, not from racing forward immediately. The supporting pawn is also a base that may be attacked. Keep the passer secure, activate the king, and advance only when the structure remains sound. A protected passer is an asset, not an automatic win.',
            keyIdeas: [
                'The advanced pawn restricts while the supporting pawn maintains the chain.',
                'Restriction can create time for king activity even when immediate promotion is impossible.'
            ],
            misconceptions: [
                'A protected passed pawn does not always win; the support base, king placement, and remaining pawn play matter.',
                'Pushing the passer is not automatically best when it abandons protection or releases the enemy king.'
            ],
            practicalRules: [
                'Often keep the protected passer as an anchor while improving the king.',
                'Advance only when the support base remains safe or concrete calculation justifies changing the chain.'
            ],
            decisionProcess: [
                'Identify the passed pawn and the pawn that supports it.',
                'Determine which enemy king routes the pawn pair restricts.',
                'Check whether the support base can be attacked.',
                'Activate the king while preserving useful restriction.',
                'Advance only when the transformed structure remains secure.'
            ],
            coachingPrompts: [
                'Which pawn is passed, and which pawn protects it?',
                'Which king squares does the protected pair deny?',
                'Which candidate improves the king without loosening the pawn chain?',
                'Can the defender attack the supporting pawn?',
                'Compare king improvement with a pawn advance, then verify the chain.',
                'Did the move preserve restriction or release the enemy king?'
            ],
            reflectionPrompts: [
                'Why can restriction be more valuable than immediate speed?',
                'What change would turn the supporting pawn into a vulnerable base?'
            ]
        } }
    },
    positions: [
        {
            id: 'pos:protected-passer:restriction-anchor',
            fen: '8/8/8/3P1k2/2K1P3/8/8/8 w - - 0 1',
            sideToMove: 'white', role: 'clean-demonstration',
            expectedConcepts: ['protected-passed-pawn', 'support-base', 'king-restriction'],
            principalIdeas: [{ moves: ['Kd4'], purpose: 'Improve the king while the e-pawn continues to support the advanced d-pawn.' }],
            validation: { structural: 'valid', educational: 'verified', notes: 'The mutual support and denied king approach are structurally verified; no forced-win claim is made.' }
        },
        {
            id: 'pos:protected-passer:attackable-base',
            fen: '8/8/8/3P4/2K1P3/5k2/8/8 b - - 0 1',
            sideToMove: 'black', role: 'contrast',
            expectedConcepts: ['attackable-support-base', 'protected-passer-exception'],
            principalIdeas: [{ moves: ['Kxe4'], purpose: 'Attack the support base and demonstrate the boundary of the protected-passer heuristic.' }],
            validation: { structural: 'valid', educational: 'verified', notes: 'The defender can legally capture the support base; this is a deliberate near-miss.' }
        }
    ],
    learningObjects: {
        demonstrations: [{ id: 'demo:protected-passer:anchor', positionId: 'pos:protected-passer:restriction-anchor' }],
        guidedPractice: [{ id: 'guided:protected-passer:map', positionId: 'pos:protected-passer:restriction-anchor', prompt: 'Name the passer, base, and restricted routes.' }],
        exercises: [{ id: 'exercise:protected-passer:base', positionId: 'pos:protected-passer:attackable-base', task: 'Test whether the chain is stable before planning king activity.' }],
        checksForUnderstanding: [{ id: 'check:protected-passer:value', prompt: 'Explain restriction value without claiming an automatic win.' }],
        assessments: [{ id: 'assessment:protected-passer:four-of-five', criterionId: 'protected-passer-map-4-of-5' }],
        reviewItems: []
    },
    activityItems: activityItemsFor('ku:endgames:pawn-transformations:protected-passed-pawn'),
    relationships: [
        { type: 'contrast', targetId: 'ku:endgames:pawn-transformations:outside-passed-pawn', reason: 'A protected passer gains value from mutual support and restriction; an outside passer gains value from distance and diversion.' },
        { type: 'progression', targetId: 'ku:endgames:pawn-transformations:pawn-breakthrough', reason: 'Understanding support chains prepares the learner to calculate which pawn sacrifice leaves a surviving passer.' },
        { type: 'recommendation', targetId: 'ku:endgames:pawn-transformations:pawn-breakthrough', reason: 'Breakthrough is the next transformation task after recognizing a stable support structure.' },
        { type: 'remediation', targetId: 'ku:endgames:pawn-foundations:activate-the-king', reason: 'Learners who push the anchor without improving their king should revisit king activity.' },
        { type: 'remediation', targetId: 'ku:endgames:pawn-foundations:convert-with-king-support', reason: 'Learners who release the defender through poor move order should revisit coordinated conversion.' }
    ],
    integrations: {
        capabilities: ['academy-compatible', 'deterministic-coaching-prompts', 'mastery-criteria', 'training-memory-theme-link'],
        coaching: { policy: 'deterministic-prompt-only', conceptIds: ['protected-passed-pawn', 'support-base', 'king-restriction'], hintOrder: ['observation', 'structural-recognition', 'candidate-identification', 'calculation-direction', 'decision-process', 'reflection'] },
        trainingMemory: { themeIds: ['passed-pawns', 'pawn-structure', 'pawn-support'] },
        mastery: { criterionIds: ['protected-passer-map-4-of-5', 'protected-passer-plan-3-of-4'] },
        recommendation: { nextUnitIds: ['ku:endgames:pawn-transformations:pawn-breakthrough'], remediationUnitIds: ['ku:endgames:pawn-foundations:activate-the-king', 'ku:endgames:pawn-foundations:convert-with-king-support'] },
        academy: { compatible: true }
    },
    editorial: {
        owner: 'CAISSA Curriculum', reviewer: 'CAISSA Season 9 Review', createdAt: '2026-07-23', updatedAt: '2026-07-25',
        reviewStatus: 'approved',
        provenance: { kind: 'caissa-original', notes: 'Original CAISSA restriction-first treatment contrasting a stable anchor with an exposed support base.', inspirationReferences: [] },
        copyrightNotes: 'No source prose, annotations, or commercial exercise sequence was copied.',
        originalityDeclaration: 'This unit was independently scoped, sequenced, and written for CAISSA.',
        verificationState: 'verified'
    }
};
import { activityItemsFor } from '../../../../authoring/evaluable-endgame-activities.js';
