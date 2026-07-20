import { boardFromFen, boardToFen } from './endgame-fen-utils.js';

const TEMPLATES = [
    ['lucena-like', '2K5/2P1k3/8/8/8/8/r7/3R4 w - - 0 1', 'white', 'Build a bridge and promote the pawn.', 'attack', 'intermediate'],
    ['philidor-like', '8/8/r5k1/4P3/6K1/8/1R6/8 b - - 0 1', 'white', 'Keep the rook active and test the defensive setup.', 'defense', 'intermediate'],
    ['rook-behind-pawn', '6r1/5k2/8/3P4/3K4/8/8/3R4 w - - 0 1', 'white', 'Keep the rook active behind the pawn.', 'attack', 'foundational'],
    ['king-cut-off', '8/6k1/8/2P5/2K5/8/R7/4r3 w - - 0 1', 'white', 'Cut off the defending king and improve the rook.', 'attack', 'intermediate'],
    ['side-check-defense', '8/8/6k1/3P4/3K4/7r/R7/8 b - - 0 1', 'white', 'Use side checks to hold the position.', 'defense', 'advanced'],
    ['rook-pawn-exception', '8/P5k1/8/6K1/8/8/R7/7r b - - 0 1', 'white', 'Keep checking distance against the rook pawn.', 'defense', 'advanced'],
    ['sixth-rank-pawn', '8/6k1/3P4/3K4/8/8/R7/7r w - - 0 1', 'white', 'Coordinate king and rook around the advanced pawn.', 'attack', 'intermediate'],
    ['seventh-rank-pawn', '8/3P2k1/3K4/8/8/8/R7/7r b - - 0 1', 'white', 'Stop the pawn without allowing the king to escape checks.', 'defense', 'advanced'],
    ['passive-defense', '8/5k2/8/4P3/4K3/8/R7/6r1 w - - 0 1', 'white', 'Improve the rook before advancing the pawn.', 'attack', 'foundational'],
    ['active-defense', '8/8/5k2/2P5/2K5/8/R7/4r3 b - - 0 1', 'white', 'Use active rook checks to contain the pawn.', 'defense', 'intermediate']
].map(([theme, fen, strongSide, objective, trainingRole, difficulty], index) => Object.freeze({
    id: `KRPvKR-${String(index + 1).padStart(2, '0')}`,
    categoryId: 'KRPvKR', theme, fen, strongSide, objective, trainingRole, difficulty,
    recommendedPrerequisites: Object.freeze(['KRK', 'KPK'])
}));

export const KRPVKR_TEMPLATES = Object.freeze(TEMPLATES);

export function getKrpvkrTemplate(idOrTheme) {
    return KRPVKR_TEMPLATES.find(template => template.id === idOrTheme || template.theme === idOrTheme) || null;
}

export function reflectKrpvkrTemplate(template) {
    if (!template || template.categoryId !== 'KRPvKR') return null;
    const reflectedBoard = boardFromFen(template.fen).map(piece => ({
        ...piece,
        square: `${piece.square[0]}${9 - Number(piece.square[1])}`,
        color: piece.color === 'white' ? 'black' : 'white'
    }));
    const sideToMove = template.fen.split(' ')[1] === 'w' ? 'black' : 'white';
    return Object.freeze({
        ...template,
        id: `${template.id}-R`,
        fen: boardToFen(reflectedBoard, sideToMove),
        strongSide: template.strongSide === 'white' ? 'black' : 'white',
        reflected: true
    });
}

export function matchesKrpvkrTemplateTheme(template, features) {
    const geometry = features?.rookPawn;
    if (!template || !geometry) return false;
    if (template.theme === 'lucena-like') return geometry.pawnRankProgress === 6 && geometry.attackingKingDistanceToPawn <= 1 && geometry.promotionSquareControl && (geometry.kingCutOffFiles >= 2 || geometry.kingCutOffRanks >= 2);
    if (template.theme === 'philidor-like') return geometry.pawnRankProgress === 4 && features.sideToMove !== geometry.strongSide && geometry.defendingRookActivity >= 3;
    if (template.theme === 'rook-behind-pawn') return geometry.rookBehindPawn;
    if (template.theme === 'king-cut-off') return geometry.kingCutOffFiles >= 2 || geometry.kingCutOffRanks >= 2;
    if (template.theme === 'side-check-defense') return geometry.sideCheckAvailability;
    if (template.theme === 'rook-pawn-exception') return geometry.rookPawn;
    if (template.theme === 'sixth-rank-pawn') return geometry.pawnRankProgress === 5;
    if (template.theme === 'seventh-rank-pawn') return geometry.pawnRankProgress === 6;
    if (template.theme === 'passive-defense') return geometry.defendingKingDistanceToPromotionSquare <= 1 && geometry.defendingRookActivity >= 3;
    if (template.theme === 'active-defense') return features.sideToMove !== geometry.strongSide && geometry.defendingRookActivity >= 3;
    return false;
}
