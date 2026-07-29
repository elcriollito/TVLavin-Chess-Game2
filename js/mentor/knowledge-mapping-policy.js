(function installKnowledgeMappingPolicy(global) {
    'use strict';
    const SCHEMA_VERSION = '1.0.0';
    const RELEASE_ID = 'rel-58b238dfdda8f295fdab023cead6bf069aceefbee74a64a5cd71af2202480a84';
    const CONCEPTS = Object.freeze([
        'tactical-awareness', 'material-safety', 'king-safety', 'development',
        'calculation', 'candidate-moves', 'simplification', 'transition-awareness',
        'endgame-awareness', 'passed-pawn', 'promotion-race', 'defensive-awareness', 'unknown'
    ]);
    const RULES = Object.freeze([
        { conceptId: 'promotion-race', categories: ['endgame'], tags: ['mate-transition'],
            phase: 'endgame', score: 0.72, exactUnitKey: null },
        { conceptId: 'passed-pawn', categories: ['endgame'], tags: ['material-change'],
            phase: 'endgame', score: 0.75, exactUnitKey: 'exchange-into-passer' },
        { conceptId: 'simplification', categories: ['transition'], tags: ['phase-transition'],
            phase: 'endgame', score: 0.82, exactUnitKey: null },
        { conceptId: 'king-safety', categories: ['opening'], tags: ['mate-transition'],
            score: 0.84, exactUnitKey: null },
        { conceptId: 'material-safety', categories: ['tactical'], tags: ['material-change'],
            score: 0.86, exactUnitKey: null },
        { conceptId: 'tactical-awareness', categories: ['tactical'],
            tags: ['mate-transition'], score: 0.9, exactUnitKey: null },
        { conceptId: 'defensive-awareness', categories: ['terminal'],
            tags: ['terminal'], score: 0.84, exactUnitKey: null },
        { conceptId: 'candidate-moves', categories: ['decision', 'strategic'],
            tags: ['best-move-divergence'], score: 0.7, exactUnitKey: null },
        { conceptId: 'transition-awareness', categories: ['transition'],
            tags: ['phase-transition'], score: 0.76, exactUnitKey: null },
        { conceptId: 'endgame-awareness', categories: ['endgame'],
            tags: [], phase: 'endgame', score: 0.62, exactUnitKey: null }
    ].map(Object.freeze));
    const UNITS = Object.freeze({
        'exchange-into-passer': Object.freeze({
            id: 'ku:endgames:pawn-exchanges:exchange-into-passer', contentVersion: '1.1.0',
            title: 'Exchange into a passed pawn',
            publicUrl: '/endgame-library?unit=endgames%2Fexchange-into-passer'
        }),
        'favorable-king-ending': Object.freeze({
            id: 'ku:endgames:pawn-exchanges:favorable-king-ending', contentVersion: '1.1.0',
            title: 'Simplify into a favorable king ending',
            publicUrl: '/endgame-library?unit=endgames%2Ffavorable-king-ending'
        })
    });
    const SCAFFOLDS = Object.freeze({
        'tactical-awareness': ['scan-forcing-moves-v1', 'compare-tactical-change-v1'],
        'material-safety': ['count-attackers-defenders-v1', 'compare-material-change-v1'],
        'king-safety': ['inspect-king-lines-v1', 'explain-king-exposure-v1'],
        'candidate-moves': ['name-candidates-v1', 'compare-reference-v1'],
        'simplification': ['compare-resulting-position-v1', 'explain-transition-v1'],
        'transition-awareness': ['identify-phase-change-v1', 'explain-transition-v1'],
        'endgame-awareness': ['activate-endgame-thinking-v1', 'explain-endgame-shift-v1'],
        'passed-pawn': ['identify-surviving-pawn-v1', 'explain-passer-creation-v1'],
        'promotion-race': ['count-tempi-v1', 'explain-race-geometry-v1']
    });
    global.CaissaKnowledgeMappingPolicy = Object.freeze({
        schemaVersion: SCHEMA_VERSION, releaseId: RELEASE_ID, concepts: CONCEPTS,
        rules: RULES, units: UNITS, scaffolds: SCAFFOLDS,
        limits: Object.freeze({ evidence: 15, concepts: 3, results: 12 }),
        confidenceBands: Object.freeze({ low: 0.59, medium: 0.79, high: 1 })
    });
})(typeof window !== 'undefined' ? window : globalThis);
