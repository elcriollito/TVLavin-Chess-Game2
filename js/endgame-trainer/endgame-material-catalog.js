const CATEGORIES = {
    KQK: {
        id: 'KQK', internalName: 'king-queen-versus-king', exactPieceCount: 3,
        materialByStrongSide: {
            white: { white: ['k', 'q'], black: ['k'] },
            black: { white: ['k'], black: ['k', 'q'] }
        },
        allowedStrongSides: ['white', 'black'], allowedSidesToMove: ['white', 'black'],
        allowsPawns: false, description: 'King and queen against a lone king.',
        provisionalObjective: 'Practice coordinating king and queen without asserting a tablebase result.'
    },
    KRK: {
        id: 'KRK', internalName: 'king-rook-versus-king', exactPieceCount: 3,
        materialByStrongSide: {
            white: { white: ['k', 'r'], black: ['k'] },
            black: { white: ['k'], black: ['k', 'r'] }
        },
        allowedStrongSides: ['white', 'black'], allowedSidesToMove: ['white', 'black'],
        allowsPawns: false, description: 'King and rook against a lone king.',
        provisionalObjective: 'Practice rook-and-king coordination without asserting a tablebase result.'
    },
    KPK: {
        id: 'KPK', internalName: 'king-pawn-versus-king', exactPieceCount: 3,
        materialByStrongSide: {
            white: { white: ['k', 'p'], black: ['k'] },
            black: { white: ['k'], black: ['k', 'p'] }
        },
        allowedStrongSides: ['white', 'black'], allowedSidesToMove: ['white', 'black'],
        allowsPawns: true, description: 'King and pawn against a lone king.',
        provisionalObjective: 'Practice king-and-pawn technique without assigning WDL.'
    },
    KPKP: {
        id: 'KPKP', internalName: 'king-pawn-versus-king-pawn', exactPieceCount: 4,
        materialByStrongSide: {
            white: { white: ['k', 'p'], black: ['k', 'p'] },
            black: { white: ['k', 'p'], black: ['k', 'p'] }
        },
        allowedStrongSides: ['white', 'black'], allowedSidesToMove: ['white', 'black'],
        allowsPawns: true, description: 'King and pawn against king and pawn.',
        provisionalObjective: 'Practice pawn-race structure without assigning WDL.'
    }
};

function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
    return value;
}

export const ENDGAME_MATERIAL_CATALOG = deepFreeze(CATEGORIES);

export function getEndgameCategory(categoryId) {
    return ENDGAME_MATERIAL_CATALOG[categoryId] || null;
}

export function materialFor(category, strongSide) {
    return category?.materialByStrongSide?.[strongSide] || null;
}
