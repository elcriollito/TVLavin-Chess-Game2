import { getEndgameCategory, materialFor } from './endgame-material-catalog.js';
import { positionKey, materialSignature } from './endgame-fen-utils.js';
import { extractPositionFeatures } from './endgame-position-features.js';

export const SCORING_VERSION = '1.0.0';
const CLUSTERING_BY_CATEGORY = Object.freeze({ KQK: 0.3, KRK: 0.3, KPK: 0.8, KPKP: 0.75 });
export const SCORING_THRESHOLDS = Object.freeze({
    KQK: 58, KRK: 58, KPK: 55, KPKP: 55,
    excessiveClustering: 0.3, clusteringByCategory: CLUSTERING_BY_CATEGORY,
    excessiveDispersionArea: 42
});

export class EndgameScoringError extends Error {
    constructor(code) { super(code); this.name = 'EndgameScoringError'; this.code = code; }
}
function rule(code, weight, observed, message) { return Object.freeze({ code, weight, observed, message }); }
function expectedSignature(category, strongSide) {
    const material = materialFor(category, strongSide || 'white');
    if (!material) return null;
    return materialSignature(['white', 'black'].flatMap((color) => material[color].map((type, index) => ({ color, type, square: `${color[0]}${index + 1}` }))));
}

export function scoreEndgamePosition(fen, options = {}) {
    const category = getEndgameCategory(options.categoryId);
    if (!category) throw new EndgameScoringError('unknown-category');
    if (options.recentPositionKeys !== undefined && !Array.isArray(options.recentPositionKeys)) {
        throw new EndgameScoringError('invalid-options');
    }
    const features = extractPositionFeatures(fen, { categoryId: category.id });
    if (!features.ok) throw new EndgameScoringError('invalid-fen');
    const penalties = [];
    const bonuses = [];
    const penalize = (code, weight, observed, message) => penalties.push(rule(code, weight, observed, message));
    const bonus = (code, weight, observed, message) => bonuses.push(rule(code, weight, observed, message));

    if (features.terminal) penalize('terminal-position', -50, true, 'The position is already terminal.');
    if (features.legalMoveCount === 0) penalize('no-legal-moves', -35, 0, 'No legal move is available.');
    if (features.immediateMateCount && !options.allowImmediateMate) penalize('immediate-mate-not-requested', -30, features.immediateMateCount, 'An immediate mate is available.');
    if (features.uniquePromotionOpportunityCount && !options.allowPromotionInOne) penalize('promotion-in-one-not-requested', -28, features.uniquePromotionOpportunityCount, 'A pawn can promote immediately.');
    if (features.hangingMajorPieceCount) penalize('immediate-major-capture', -30, features.hangingMajorPieceCount, 'A major piece can be captured immediately.');
    if (features.legalMoveCount === 1) penalize('only-one-legal-move', -18, 1, 'Only one legal move is available.');
    if (features.clusteringRatio > CLUSTERING_BY_CATEGORY[category.id]) penalize('excessive-clustering', -12, features.clusteringRatio, 'Pieces are excessively clustered.');
    if (features.occupiedBoundingBoxArea > SCORING_THRESHOLDS.excessiveDispersionArea) penalize('excessive-dispersion', -10, features.occupiedBoundingBoxArea, 'Pieces are widely dispersed.');
    if (features.blockedPawnCount && features.immediateCaptureCount === 0) penalize('blocked-pawn-with-low-interaction', -12, features.blockedPawnCount, 'A blocked pawn has little immediate interaction.');
    if (features.insufficientMaterial) penalize('insufficient-material', -45, true, 'The material is insufficient under chess rules.');
    if (features.materialSignature !== expectedSignature(category, options.strongSide)) penalize('material-signature-mismatch', -50, features.materialSignature, 'Material does not match the category.');
    if ((options.recentPositionKeys || []).includes(positionKey(fen))) penalize('repeated-position', -20, true, 'The position was recently used.');

    if (features.legalMoveCount >= 4 && features.legalMoveCount <= 25) bonus('reasonable-mobility', 10, features.legalMoveCount, 'The position offers several legal choices.');
    if (features.kingDistance >= 2 && features.kingDistance <= 5) bonus('useful-king-distance', 8, features.kingDistance, 'King spacing supports interaction.');
    if (features.minimumPieceDistance <= 3 && features.averagePieceDistance <= 5) bonus('clear-piece-interaction', 8, features.averagePieceDistance, 'Pieces are close enough to interact.');
    if (!features.terminal && features.legalMoveCount > 2 && !features.immediateMateCount) bonus('non-trivial-position', 8, true, 'The position is active and non-terminal.');
    if (features.oppositionPattern !== 'none') bonus('opposition-pattern-present', 8, features.oppositionPattern, 'The kings form a geometric opposition pattern.');

    if (['KQK', 'KRK'].includes(category.id)) {
        const defenderToMove = options.strongSide && features.sideToMove !== options.strongSide;
        if (defenderToMove && features.kingsInCornerCount && features.legalMoveCount <= 2) penalize('defender-overconfined', -14, features.legalMoveCount, 'The defending king is already highly confined.');
        if (features.averagePieceDistance > 5) penalize('attacking-king-disconnected', -12, features.averagePieceDistance, 'The attacking pieces are too disconnected.');
        if (features.occupiedBoundingBoxArea >= 12 && features.occupiedBoundingBoxArea <= 40) bonus('category-appropriate-spacing', 10, features.occupiedBoundingBoxArea, 'Spacing leaves room to practice coordination.');
    } else if (category.id === 'KPK') {
        if (features.immediatePawnCaptureCount) penalize('immediate-pawn-capture', -24, features.immediatePawnCaptureCount, 'The pawn can be captured immediately.');
        if (features.averagePieceDistance > 5) penalize('pawn-low-interaction', -15, features.averagePieceDistance, 'The pawn and kings are too dispersed.');
        if (features.kingDistance <= 4) bonus('king-activity-structure', 10, features.kingDistance, 'The kings are positioned for active play.');
    } else if (category.id === 'KPKP') {
        if (features.immediatePawnCaptureCount) penalize('trivial-pawn-capture', -18, features.immediatePawnCaptureCount, 'A pawn is immediately capturable.');
        if (features.averagePieceDistance > 5) penalize('pawns-low-interaction', -14, features.averagePieceDistance, 'Kings and pawns are too dispersed.');
        if (features.occupiedBoundingBoxArea <= 30) bonus('balanced-visual-structure', 10, features.occupiedBoundingBoxArea, 'The material occupies related board regions.');
    }

    const score = Math.max(0, Math.min(100, 50 + penalties.reduce((sum, item) => sum + item.weight, 0) + bonuses.reduce((sum, item) => sum + item.weight, 0)));
    const threshold = options.minimumScore ?? SCORING_THRESHOLDS[category.id];
    if (!Number.isFinite(threshold) || threshold < 0 || threshold > 100) throw new EndgameScoringError('invalid-options');
    return Object.freeze({ score, accepted: score >= threshold, penalties, bonuses, features, thresholds: { minimumScore: threshold }, version: SCORING_VERSION });
}
