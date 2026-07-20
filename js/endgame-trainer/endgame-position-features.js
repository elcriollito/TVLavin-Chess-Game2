import { ChessRulesFacade, ChessRulesError } from './chess-rules-facade.js';
import { materialSignature, squareDistance } from './endgame-fen-utils.js';

export const FEATURE_EXTRACTION_VERSION = '1.0.0';

function coordinates(square) { return [square.charCodeAt(0) - 97, Number(square[1]) - 1]; }
function average(values) { return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0; }

function opposition(kings) {
    if (kings.length !== 2) return 'none';
    const [aFile, aRank] = coordinates(kings[0].square);
    const [bFile, bRank] = coordinates(kings[1].square);
    const aligned = aFile === bFile || aRank === bRank;
    const distance = squareDistance(kings[0].square, kings[1].square);
    if (!aligned || distance < 2 || distance % 2 !== 0) return 'none';
    return distance === 2 ? 'direct' : 'distant';
}

function rookPawnFeatures(pieces, moves, strongSide) {
    const pawn = pieces.find(piece => piece.type === 'p');
    if (!pawn) return null;
    const attacker = strongSide || pawn.color;
    const defender = attacker === 'white' ? 'black' : 'white';
    const attackingRook = pieces.find(piece => piece.type === 'r' && piece.color === attacker);
    const defendingRook = pieces.find(piece => piece.type === 'r' && piece.color === defender);
    const attackingKing = pieces.find(piece => piece.type === 'k' && piece.color === attacker);
    const defendingKing = pieces.find(piece => piece.type === 'k' && piece.color === defender);
    if (!attackingRook || !defendingRook || !attackingKing || !defendingKing) return null;
    const [pawnFile, pawnRank] = coordinates(pawn.square);
    const [attackingRookFile, attackingRookRank] = coordinates(attackingRook.square);
    const [defendingRookFile, defendingRookRank] = coordinates(defendingRook.square);
    const [attackingKingFile, attackingKingRank] = coordinates(attackingKing.square);
    const [defendingKingFile, defendingKingRank] = coordinates(defendingKing.square);
    const promotionSquare = `${pawn.square[0]}${attacker === 'white' ? 8 : 1}`;
    const progress = attacker === 'white' ? pawnRank : 7 - pawnRank;
    const behind = attackingRookFile === pawnFile && (attacker === 'white' ? attackingRookRank < pawnRank : attackingRookRank > pawnRank);
    const defenderBehind = defendingRookFile === pawnFile && (attacker === 'white' ? defendingRookRank > pawnRank : defendingRookRank < pawnRank);
    const sideCheck = Math.abs(defendingRookRank - attackingKingRank) <= 1 && Math.abs(defendingRookFile - attackingKingFile) >= 2;
    const frontalCheck = defendingRookFile === pawnFile && Math.abs(defendingRookRank - pawnRank) >= 2;
    return {
        strongSide: attacker,
        pawnRankProgress: progress,
        pawnFile: pawn.square[0],
        rookBehindPawn: behind,
        defendingRookBehindPawn: defenderBehind,
        attackingKingDistanceToPawn: squareDistance(attackingKing.square, pawn.square),
        defendingKingDistanceToPromotionSquare: squareDistance(defendingKing.square, promotionSquare),
        kingCutOffFiles: Math.abs(defendingKingFile - pawnFile),
        kingCutOffRanks: Math.abs(defendingKingRank - pawnRank),
        checkingDistance: squareDistance(defendingRook.square, attackingKing.square),
        defendingRookActivity: Math.max(Math.abs(defendingRookFile - pawnFile), Math.abs(defendingRookRank - pawnRank)),
        attackingRookActivity: Math.max(Math.abs(attackingRookFile - defendingKingFile), Math.abs(attackingRookRank - defendingKingRank)),
        sideCheckAvailability: sideCheck,
        frontalCheckAvailability: frontalCheck,
        promotionSquareControl: attackingKingFile === pawnFile && squareDistance(attackingKing.square, promotionSquare) <= 1,
        bridgeBuildingPotential: progress >= 5 && squareDistance(attackingKing.square, pawn.square) <= 1 && (Math.abs(defendingKingFile - pawnFile) >= 2 || Math.abs(defendingKingRank - pawnRank) >= 2),
        rookPawn: pawnFile === 0 || pawnFile === 7,
        connectednessApplicable: false,
        immediateRookTradePossibility: moves.some(move => move.captured === 'r'),
        immediatePawnLossRisk: moves.some(move => move.captured === 'p')
    };
}

/** Extracts deterministic, descriptive geometry and one-ply move features. */
export function extractPositionFeatures(fen, options = {}) {
    let game;
    try { game = ChessRulesFacade.fromFen(fen); } catch (error) {
        if (error instanceof ChessRulesError) return { ok: false, error: { code: 'invalid-fen' } };
        return { ok: false, error: { code: 'invalid-fen' } };
    }
    const pieces = game.pieces();
    const kings = pieces.filter((piece) => piece.type === 'k');
    const moves = game.legalMoves({ verbose: true });
    const pairDistances = [];
    for (let left = 0; left < pieces.length; left += 1) {
        for (let right = left + 1; right < pieces.length; right += 1) {
            pairDistances.push(squareDistance(pieces[left].square, pieces[right].square));
        }
    }
    const points = pieces.map((piece) => coordinates(piece.square));
    const files = points.map(([file]) => file);
    const ranks = points.map(([, rank]) => rank);
    const area = pieces.length
        ? (Math.max(...files) - Math.min(...files) + 1) * (Math.max(...ranks) - Math.min(...ranks) + 1)
        : 0;
    const captures = moves.filter((move) => Boolean(move.captured));
    const capturedSquares = new Set(captures.map((move) => move.to));
    const pawnDistances = { white: [], black: [] };
    let blockedPawnCount = 0;
    for (const pawn of pieces.filter((piece) => piece.type === 'p')) {
        const [, rank] = coordinates(pawn.square);
        pawnDistances[pawn.color].push(pawn.color === 'white' ? 7 - rank : rank);
        const forwardRank = Number(pawn.square[1]) + (pawn.color === 'white' ? 1 : -1);
        const forwardSquare = `${pawn.square[0]}${forwardRank}`;
        if (pieces.some((piece) => piece.square === forwardSquare)) blockedPawnCount += 1;
    }
    const promotionMoves = moves.filter((move) => Boolean(move.promotion));
    const uniquePromotionOpportunities = new Set(promotionMoves.map((move) => `${move.from}-${move.to}`));
    const checkingMoves = moves.filter((move) => /[+#]$/.test(move.san));
    const immediateMateMoves = moves.filter((move) => /#$/.test(move.san));
    const pawnDistanceValues = [...pawnDistances.white, ...pawnDistances.black];

    const rookPawn = options.categoryId === 'KRPvKR' ? rookPawnFeatures(pieces, moves, options.strongSide) : null;
    return {
        ok: true,
        version: FEATURE_EXTRACTION_VERSION,
        categoryId: options.categoryId || null,
        pieceCount: pieces.length,
        sideToMove: game.sideToMove(),
        materialSignature: materialSignature(pieces),
        legalMoveCount: moves.length,
        inCheck: game.isCheck(),
        terminal: game.isGameOver(),
        insufficientMaterial: game.isInsufficientMaterial(),
        kingDistance: kings.length === 2 ? squareDistance(kings[0].square, kings[1].square) : null,
        minimumPieceDistance: pairDistances.length ? Math.min(...pairDistances) : 0,
        averagePieceDistance: average(pairDistances),
        occupiedBoundingBoxArea: area,
        // Piece density inside the smallest occupied rectangle.
        clusteringRatio: area > 0 ? pieces.length / area : 0,
        immediateCaptureCount: captures.length,
        immediatePawnCaptureCount: captures.filter((move) => move.captured === 'p').length,
        hangingMajorPieceCount: pieces.filter((piece) =>
            piece.color !== game.sideToMove() && ['q', 'r'].includes(piece.type) && capturedSquares.has(piece.square)
        ).length,
        checkingMoveCount: checkingMoves.length,
        immediateMateCount: immediateMateMoves.length,
        promotionInOneCount: promotionMoves.length,
        uniquePromotionOpportunityCount: uniquePromotionOpportunities.size,
        // Remaining single-square advances to promotion, measured per pawn color.
        pawnAdvanceDistance: {
            white: [...pawnDistances.white], black: [...pawnDistances.black],
            minimum: pawnDistanceValues.length ? Math.min(...pawnDistanceValues) : null,
            average: pawnDistanceValues.length ? average(pawnDistanceValues) : null
        },
        kingsOnEdgeCount: kings.filter((piece) => /^[ah]|[18]$/.test(piece.square)).length,
        kingsInCornerCount: kings.filter((piece) => ['a1', 'a8', 'h1', 'h8'].includes(piece.square)).length,
        oppositionPattern: opposition(kings),
        blockedPawnCount,
        rookPawn
    };
}
