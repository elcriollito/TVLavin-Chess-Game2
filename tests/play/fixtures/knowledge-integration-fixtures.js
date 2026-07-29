export const knowledgeEvidenceFixtures = Object.freeze([
    ['tactical mate transition', 'tactical', ['tactical', 'mate-transition'], 'tactical-awareness', 'high', null],
    ['hanging material', 'tactical', ['tactical', 'material-change'], 'material-safety', 'high', null],
    ['opening king safety', 'opening', ['opening', 'mate-transition'], 'king-safety', 'high', null],
    ['development issue', 'opening', ['opening'], null, null, null],
    ['quiet strategic shift', 'strategic', [], null, null, null],
    ['queen exchange transition', 'transition', ['transition', 'phase-transition'], 'simplification', 'high', null],
    ['passed-pawn endgame', 'endgame', ['endgame', 'material-change'], 'passed-pawn', 'medium',
        null],
    ['promotion race', 'endgame', ['endgame', 'mate-transition'], 'promotion-race', 'medium', null],
    ['conflicting tactical/material', 'tactical', ['tactical', 'mate-transition', 'material-change'],
        'tactical-awareness', 'high', null],
    ['generic-only concept', 'decision', ['decision', 'best-move-divergence'], 'candidate-moves', 'medium', null],
    ['zero mapping', 'opening', ['opening'], null, null, null]
]);

export const replayAttemptFixtures = Object.freeze([
    { name: 'legal alternate replay attempt', comparison: 'legal-alternative',
        expectedConfidence: 0.65, visibleBeforeReveal: false },
    { name: 'reference-match attempt', comparison: 'reference-match',
        expectedConfidence: 0.9, visibleBeforeReveal: false }
]);
