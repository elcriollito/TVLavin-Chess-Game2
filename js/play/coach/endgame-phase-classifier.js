(function installEndgamePhaseClassifier(global) {
    'use strict';
    const SCHEMA_VERSION = '1.0.0';
    const VALUES = Object.freeze({ n: 3, b: 3, r: 5, q: 9 });
    const freeze = value => {
        if (value && typeof value === 'object' && !Object.isFrozen(value)) {
            Object.values(value).forEach(freeze); Object.freeze(value);
        }
        return value;
    };
    function classify(input = {}) {
        let chess;
        try { chess = new global.Chess(input.fen); } catch (_) {
            return freeze({ schemaVersion: SCHEMA_VERSION, phase: 'unknown', confidence: 'low',
                material: null, facts: freeze([]), reasonCode: 'INVALID_POSITION' });
        }
        const pieces = chess.board().flat().filter(Boolean);
        const side = color => pieces.filter(piece => piece.color === color);
        const materialFor = color => side(color).reduce((sum, piece) => sum + (VALUES[piece.type] || 0), 0);
        const pawns = pieces.filter(piece => piece.type === 'p');
        const nonKings = pieces.filter(piece => piece.type !== 'k');
        const nonPawnMaterial = pieces.reduce((sum, piece) => sum + (VALUES[piece.type] || 0), 0);
        const queens = pieces.filter(piece => piece.type === 'q').length;
        const rooks = pieces.filter(piece => piece.type === 'r').length;
        const minors = pieces.filter(piece => piece.type === 'b' || piece.type === 'n').length;
        const material = freeze({ white: materialFor('w'), black: materialFor('b'),
            totalNonPawnMaterial: nonPawnMaterial, queensPresent: queens > 0,
            rooksPresent: rooks > 0, minorPiecesPresent: minors > 0, pawnCount: pawns.length,
            pieceCount: pieces.length });
        let phase = 'middlegame'; let confidence = 'medium'; let reasonCode = 'MATERIAL_MIDDLEGAME';
        if (nonKings.length > 0 && nonKings.every(piece => piece.type === 'p')) {
            phase = 'pawn-ending'; confidence = 'high'; reasonCode = 'KINGS_AND_PAWNS_ONLY';
        } else if (queens === 0 && rooks === 0 && nonPawnMaterial <= 6 && pieces.length <= 10) {
            phase = 'simplified-endgame'; confidence = 'high'; reasonCode = 'LOW_NONPAWN_MATERIAL';
        } else if (queens === 0 && nonPawnMaterial <= 10 && pieces.length <= 14) {
            phase = 'endgame'; confidence = 'medium'; reasonCode = 'REDUCED_MATERIAL';
        } else if (queens === 0 || nonPawnMaterial <= 14) {
            phase = 'transition'; confidence = 'medium'; reasonCode = 'QUEENLESS_OR_REDUCED';
        } else if ((Number(input.ply) || 0) <= 16 && pieces.length >= 24) {
            phase = 'opening'; confidence = 'high'; reasonCode = 'EARLY_FULL_MATERIAL';
        }
        return freeze({ schemaVersion: SCHEMA_VERSION, phase, confidence, material,
            facts: freeze([reasonCode, queens ? 'QUEENS_PRESENT' : 'QUEENS_ABSENT',
                rooks ? 'ROOKS_PRESENT' : 'ROOKS_ABSENT']), reasonCode });
    }
    global.CaissaEndgamePhaseClassifier = freeze({ schemaVersion: SCHEMA_VERSION, classify });
})(typeof window !== 'undefined' ? window : globalThis);
