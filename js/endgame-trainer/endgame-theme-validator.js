import { ChessRulesFacade } from './chess-rules-facade.js';
import { extractPositionFeatures } from './endgame-position-features.js';
import { squareDistance } from './endgame-fen-utils.js';

export const THEME_VALIDATOR_VERSION = '1.0.0';
const DEFENSE_THEMES = new Set(['defensive-opposition', 'stop-promotion', 'active-rook', 'checking-distance', 'side-check-defense', 'philidor-like', 'rook-activity', 'practical-resistance', 'passive-defense']);
const ATTACK_THEMES = new Set(['key-squares', 'pawn-breakthrough', 'promotion-technique', 'rook-box', 'queen-box', 'bring-the-king', 'avoid-stalemate', 'finishing-technique', 'rook-behind-pawn', 'king-cut-off', 'lucena-like']);

const result = (valid, errors, metadata) => Object.freeze({ valid, errors: Object.freeze(errors), metadata: Object.freeze(metadata), version: THEME_VALIDATOR_VERSION });
const reject = (errors, metadata) => result(false, [...new Set(errors)], metadata);

/** Post-legality validation: confirms that the authored exercise and board geometry agree. */
export function validateEndgameTheme(fen, options = {}) {
    const { categoryId, theme = null, trainingRole = null, strongSide = null, studentColor = 'white', scoring = null, enforceWhiteBeta = false } = options;
    let game;
    try { game = ChessRulesFacade.fromFen(fen); } catch { return reject(['invalid-fen'], { theme, studentColor }); }
    const features = options.features ?? extractPositionFeatures(fen, { categoryId, strongSide });
    if (!features?.ok) return reject(['invalid-fen'], { theme, studentColor });
    const pieces = game.pieces(), errors = [];
    const pawns = pieces.filter(piece => piece.type === 'p');
    const studentKing = pieces.find(piece => piece.type === 'k' && piece.color === studentColor);
    const opponent = studentColor === 'white' ? 'black' : 'white';
    const opponentKing = pieces.find(piece => piece.type === 'k' && piece.color === opponent);
    const attackingSide = DEFENSE_THEMES.has(theme) || trainingRole === 'defense' ? opponent : ATTACK_THEMES.has(theme) || trainingRole === 'attack' ? studentColor : strongSide;
    const attackingPawn = pawns.find(piece => piece.color === attackingSide);
    const pawnDistance = attackingPawn ? (attackingPawn.color === 'white' ? 8 - Number(attackingPawn.square[1]) : Number(attackingPawn.square[1]) - 1) : null;
    const promotionSquare = attackingPawn ? `${attackingPawn.square[0]}${attackingPawn.color === 'white' ? 8 : 1}` : null;

    if (enforceWhiteBeta && studentColor !== 'white') errors.push('beta-student-must-be-white');
    if (enforceWhiteBeta && game.sideToMove() !== studentColor) errors.push('student-not-to-move');
    if (trainingRole === 'attack' && strongSide !== studentColor) errors.push('attacking-side-mismatch');
    if (trainingRole === 'defense' && strongSide === studentColor) errors.push('defending-side-mismatch');
    if (scoring && !scoring.accepted) errors.push('instructional-score-below-threshold');
    if (features.terminal || features.legalMoveCount < 2) errors.push('no-meaningful-practice');
    if (features.hangingMajorPieceCount || features.immediatePawnCaptureCount) errors.push('immediate-material-resolution');
    if (features.immediateMateCount) errors.push('trivial-immediate-mate');
    if (features.uniquePromotionOpportunityCount) errors.push('trivial-immediate-promotion');

    if (['opposition', 'defensive-opposition'].includes(theme) && features.oppositionPattern === 'none') errors.push('opposition-not-present');
    if (theme === 'key-squares' && (!attackingPawn || attackingPawn.color !== studentColor || squareDistance(studentKing.square, attackingPawn.square) > 2)) errors.push('key-square-geometry-missing');
    if (theme === 'king-activity' && features.kingDistance > 4) errors.push('kings-not-interacting');
    if (theme === 'pawn-breakthrough' && (categoryId !== 'KPKP' || features.averagePieceDistance > 4.5)) errors.push('breakthrough-geometry-missing');
    if (theme === 'promotion-technique' && (!attackingPawn || attackingPawn.color !== studentColor || pawnDistance < 2 || pawnDistance > 4)) errors.push('promotion-technique-missing');
    if (theme === 'stop-promotion') {
        if (!attackingPawn || attackingPawn.color === studentColor || pawnDistance > 3) errors.push('passed-pawn-threat-missing');
        else if (!studentKing || squareDistance(studentKing.square, promotionSquare) > pawnDistance + 1) errors.push('no-practical-defensive-chance');
    }
    if (['rook-box', 'queen-box', 'bring-the-king', 'avoid-stalemate', 'finishing-technique'].includes(theme) && !['KQK', 'KRK'].includes(categoryId)) errors.push('mating-material-mismatch');
    if (theme && ['rook-behind-pawn', 'king-cut-off', 'active-rook', 'checking-distance', 'side-check-defense', 'lucena-like', 'philidor-like', 'rook-activity', 'practical-resistance'].includes(theme)) {
        const rook = features.rookPawn;
        if (!rook) errors.push('rook-theme-geometry-missing');
        else {
            if (theme === 'rook-behind-pawn' && !rook.rookBehindPawn) errors.push('rook-not-behind-pawn');
            if (theme === 'king-cut-off' && rook.kingCutOffFiles < 2 && rook.kingCutOffRanks < 2) errors.push('king-not-cut-off');
            if (['active-rook', 'rook-activity', 'practical-resistance'].includes(theme) && !rook.sideCheckAvailability && !rook.frontalCheckAvailability && rook.defendingRookActivity < 3) errors.push('active-defense-missing');
            if (theme === 'checking-distance' && rook.checkingDistance < 2) errors.push('checking-distance-missing');
            if (theme === 'side-check-defense' && !rook.sideCheckAvailability) errors.push('side-check-missing');
            if (theme === 'lucena-like' && !rook.bridgeBuildingPotential) errors.push('bridge-geometry-missing');
            if (theme === 'philidor-like' && !(rook.pawnRankProgress === 4 && rook.defendingRookActivity >= 3)) errors.push('philidor-geometry-missing');
        }
    }
    const metadata = { theme, trainingRole, studentColor, attackingSide, defendingSide: attackingSide === 'white' ? 'black' : 'white', evaluation: scoring?.score ?? null, sideToMove: game.sideToMove(), educationallyValid: errors.length === 0 };
    return errors.length ? reject(errors, metadata) : result(true, [], metadata);
}
