/** @type {import('../../../../schema/knowledge-unit.js').KnowledgeUnit} */
export const backwardPawn = {
    id: 'ku:endgames:pawn-weaknesses:backward-pawn', slug: 'backward-pawn', domain: 'endgames',
    status: 'published', schemaVersion: '1.0.0', contentVersion: '1.0.0',
    education: {
        knowledgeType: 'technique', endgameFamily: 'pawn-endgames',
        themes: ['backward-pawn', 'fixed-weakness', 'restraint', 'pawn-breakthrough'],
        skills: ['pattern-recognition', 'planning', 'calculation'], difficulty: 'intermediate', expectedLearnerLevel: 'foundation-rules-aware',
        prerequisites: ['ku:endgames:pawn-weaknesses:fix-pawn-weakness'],
        learningObjectives: ['Identify a pawn that cannot advance safely despite neighboring pawn structure.', 'Choose between restraining and attacking the pawn or calculating its liberating break.'],
        masteryCriteria: ['Distinguishes backward from isolated pawns and names the unsafe advance in four of five structures.', 'Finds or rejects a liberating break and selects fix-versus-transform correctly in three of four tasks.']
    },
    localization: {
        defaultLocale: 'en-US', availableLocales: ['en-US'], translationStatus: { 'en-US': 'ready' },
        content: { 'en-US': {
            title: 'Exploit a backward pawn',
            summary: 'Target a pawn held behind its neighbors—or calculate the break that frees it.',
            explanation: 'A backward pawn is held behind neighboring pawns because advancing would lose it or damage the structure. Unlike an isolated pawn, it may have friendly pawns on adjacent files; its problem is safe mobility and the weak square in front. Restrain the liberating break before attacking. If the break works concretely, transform the structure instead of preserving a static label.',
            keyIdeas: ['Backwardness is defined by unsafe advance within a neighboring pawn structure.', 'The square in front and the liberating pawn break are central planning facts.'],
            misconceptions: ['A pawn is not backward merely because it stands behind another pawn.', 'A backward pawn is not permanently weak when a safe break can liberate it.'],
            practicalRules: ['Backward pawns often require restraint before a king attack.', 'Transformation may be stronger than prolonged attack when a pawn break produces useful activity or a passer.'],
            decisionProcess: ['Identify neighboring pawn support.', 'Test whether the pawn can advance safely.', 'Identify the weak front square and attack route.', 'Calculate every liberating break.', 'Compare continued restraint with transformation.', 'Check king access and resulting races.'],
            coachingPrompts: ['Which pawn stands behind its neighboring structure?', 'Is its problem isolation or an unsafe advance?', 'Which candidate restrains or enables the liberating break?', 'What structure results after the break and exchanges?', 'Use support, advance, front square, break, and race to choose.', 'Was preserving the weakness stronger than transforming it?'],
            reflectionPrompts: ['What exact fact makes the advance unsafe?', 'Which change would liberate the pawn and erase the backward classification?']
        } }
    },
    positions: [
        { id: 'pos:backward-pawn:fixed-chain', fen: '8/8/3k4/2pp4/2P5/3P4/3K4/8 w - - 0 1', sideToMove: 'white', role: 'clean-demonstration', expectedConcepts: ['backward-pawn', 'front-square', 'restraint'], principalIdeas: [{ moves: ['Kc3'], purpose: 'Approach the backward d5 pawn while monitoring its freeing advance.' }], validation: { structural: 'valid', educational: 'verified', notes: 'The neighboring pawn structure and legal king route are verified; no forced capture is claimed.' } },
        { id: 'pos:backward-pawn:liberating-break', fen: '8/8/3k4/2p5/1P6/3P4/3K4/8 b - - 0 1', sideToMove: 'black', role: 'contrast', expectedConcepts: ['liberating-break', 'temporary-backwardness', 'structural-transformation'], principalIdeas: [{ moves: ['c4'], purpose: 'Advance and transform the contact rather than accept a permanent backward target.' }], validation: { structural: 'valid', educational: 'verified', notes: 'The legal break materially changes the structure and defines the exception boundary.' } }
    ],
    learningObjects: {
        demonstrations: [{ id: 'demo:backward-pawn:front-square', positionId: 'pos:backward-pawn:fixed-chain' }],
        guidedPractice: [{ id: 'guided:backward-pawn:break-check', positionId: 'pos:backward-pawn:liberating-break', prompt: 'Classify the pawn, then calculate its freeing break.' }],
        exercises: [{ id: 'exercise:backward-pawn:fix-or-transform', positionId: 'pos:backward-pawn:fixed-chain', task: 'Compare preserving the target with changing the structure.' }],
        checksForUnderstanding: [{ id: 'check:backward-pawn:contrast', prompt: 'Distinguish backwardness from isolation using support and safe advance.' }],
        assessments: [{ id: 'assessment:backward-pawn:three-of-four', criterionId: 'backward-transform-3-of-4' }],
        reviewItems: [{ id: 'review:pawn-weaknesses:fix-or-transform', conceptIds: ['pawn-majority', 'fixed-weakness', 'isolated-pawn', 'backward-pawn', 'pawn-breakthrough'] }]
    },
    relationships: [
        { type: 'contrast', targetId: 'ku:endgames:pawn-weaknesses:isolated-pawn', reason: 'A backward pawn can have neighboring pawn support but lacks a safe advance; isolation is defined by absent neighboring pawns.' },
        { type: 'related', targetId: 'ku:endgames:pawn-transformations:pawn-breakthrough', reason: 'A liberating break transforms a weakness only when concrete calculation supports the resulting structure.' },
        { type: 'remediation', targetId: 'ku:endgames:pawn-weaknesses:fix-pawn-weakness', reason: 'If the target escapes before the attack, revisit restraint and escape analysis.' },
        { type: 'remediation', targetId: 'ku:endgames:pawn-transformations:pawn-breakthrough', reason: 'If every pawn break is treated as sound, revisit the requirement for a verified surviving structural gain.' }
    ],
    integrations: {
        capabilities: ['academy-compatible', 'deterministic-coaching-prompts', 'mastery-criteria', 'training-memory-theme-link'],
        coaching: { policy: 'deterministic-prompt-only', conceptIds: ['backward-pawn', 'front-square', 'liberating-break'], hintOrder: ['observation', 'classification', 'candidate-identification', 'calculation-direction', 'decision-process', 'reflection'] },
        trainingMemory: { themeIds: ['backward-pawn', 'fixed-weakness', 'pawn-breakthrough'] }, mastery: { criterionIds: ['backward-classify-4-of-5', 'backward-transform-3-of-4'] },
        recommendation: { remediationUnitIds: ['ku:endgames:pawn-weaknesses:fix-pawn-weakness', 'ku:endgames:pawn-transformations:pawn-breakthrough'] }, academy: { compatible: true }
    },
    editorial: {
        owner: 'CAISSA Curriculum', reviewer: 'CAISSA Season 9 Review', createdAt: '2026-07-23', updatedAt: '2026-07-23', reviewStatus: 'approved',
        provenance: { kind: 'caissa-original', notes: 'Original CAISSA support-advance-front-square-break-transformation sequence.', inspirationReferences: [] },
        copyrightNotes: 'No source prose, annotations, or commercial exercise sequence was copied.', originalityDeclaration: 'This unit was independently scoped, sequenced, and written for CAISSA.', verificationState: 'verified'
    }
};
