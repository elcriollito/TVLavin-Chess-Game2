import { Chess } from 'chess.js';
import { ChessRulesFacade } from './chess-rules-facade.js';
import { getEndgameCategory, materialFor } from './endgame-material-catalog.js';
import { boardFromFen, countPieces, hasPawnOnInvalidRank, kingsAreAdjacent, materialSignature } from './endgame-fen-utils.js';

function addUnique(list, code) { if (!list.includes(code)) list.push(code); }

function expectedSignature(category, strongSide) {
    const material = materialFor(category, strongSide);
    if (!material) return null;
    return materialSignature([
        ...material.white.map((type, index) => ({ type, color: 'white', square: `a${index + 1}` })),
        ...material.black.map((type, index) => ({ type, color: 'black', square: `h${index + 1}` }))
    ]);
}
function checkSideState(fen, board, errors) {
    try {
        const chess = new Chess(fen, { skipValidation: true });
        const whiteKing = board.find((piece) => piece.type === 'k' && piece.color === 'white');
        const blackKing = board.find((piece) => piece.type === 'k' && piece.color === 'black');
        if (!whiteKing || !blackKing) return;
        const whiteInCheck = chess.isAttacked(whiteKing.square, 'b');
        const blackInCheck = chess.isAttacked(blackKing.square, 'w');
        if (whiteInCheck && blackInCheck) addUnique(errors, 'both-kings-in-check');
        const sideToMove = fen.trim().split(/\s+/)[1];
        if ((sideToMove === 'w' && blackInCheck) || (sideToMove === 'b' && whiteInCheck)) {
            addUnique(errors, 'impossible-side-state');
        }
    } catch {
        // Structural errors are reported elsewhere; do not infer reachability.
    }
}

export function validateEndgamePosition(fen, options = {}) {
    const errors = [];
    const warnings = [];
    const metadata = {};
    let board;
    try {
        board = boardFromFen(fen);
    } catch {
        return { valid: false, errors: ['invalid-fen'], warnings, metadata };
    }

    const whiteKings = board.filter((piece) => piece.type === 'k' && piece.color === 'white').length;
    const blackKings = board.filter((piece) => piece.type === 'k' && piece.color === 'black').length;
    if (whiteKings === 0) addUnique(errors, 'missing-white-king');
    if (blackKings === 0) addUnique(errors, 'missing-black-king');
    if (whiteKings > 1) addUnique(errors, 'multiple-white-kings');
    if (blackKings > 1) addUnique(errors, 'multiple-black-kings');
    if (kingsAreAdjacent(board)) addUnique(errors, 'kings-adjacent');
    if (hasPawnOnInvalidRank(board)) addUnique(errors, 'pawn-on-invalid-rank');

    const category = options.categoryId ? getEndgameCategory(options.categoryId) : null;
    if (options.categoryId && !category) addUnique(errors, 'unknown-category');
    if (category && countPieces(board) !== category.exactPieceCount) addUnique(errors, 'wrong-piece-count');
    const signature = materialSignature(board);
    if (category && signature !== expectedSignature(category, options.strongSide || 'white')) {
        addUnique(errors, 'material-signature-mismatch');
    }

    checkSideState(fen, board, errors);
    const facadeValidation = ChessRulesFacade.validateFen(fen);
    let facade = null;
    if (!facadeValidation.valid) {
        addUnique(errors, 'invalid-fen');
    } else {
        facade = ChessRulesFacade.fromFen(fen);
        metadata.normalizedFen = facade.fen();
        metadata.sideToMove = facade.sideToMove();
        metadata.legalMoveCount = facade.legalMoveCount();
        metadata.inCheck = facade.isCheck();
        if (metadata.legalMoveCount === 0) addUnique(errors, 'no-legal-moves');
        if (facade.isGameOver()) addUnique(errors, 'game-already-over');
    }

    metadata.pieceCount = countPieces(board);
    metadata.materialSignature = signature;
    metadata.operationallyLegal = errors.length === 0;
    metadata.historicallyReachable = null;
    warnings.push('historical-reachability-not-verified');
    return { valid: errors.length === 0, errors, warnings, metadata };
}
