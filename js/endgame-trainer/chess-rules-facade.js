import { Chess } from 'chess.js';

export class ChessRulesError extends Error {
    constructor(code, cause) {
        super(code, { cause });
        this.name = 'ChessRulesError';
        this.code = code;
    }
}

function asRulesError(code, operation) {
    try {
        return operation();
    } catch (error) {
        throw new ChessRulesError(code, error);
    }
}

/** Isolates the endgame domain from the chess.js public API. */
export class ChessRulesFacade {
    #chess;

    constructor(fen) {
        this.#chess = fen === undefined ? new Chess() : asRulesError('invalid-fen', () => new Chess(fen));
    }

    static fromFen(fen) {
        return new ChessRulesFacade(fen);
    }

    static validateFen(fen) {
        try {
            const chess = new Chess(fen);
            return { valid: true, fen: chess.fen(), error: null };
        } catch {
            return { valid: false, fen: null, error: { code: 'invalid-fen' } };
        }
    }

    loadFen(fen) {
        asRulesError('invalid-fen', () => this.#chess.load(fen));
        return this.fen();
    }

    fen() { return this.#chess.fen(); }
    sideToMove() { return this.#chess.turn() === 'w' ? 'white' : 'black'; }
    legalMoves(options = {}) { return this.#chess.moves(options); }
    legalMoveCount() { return this.#chess.moves().length; }
    isCheck() { return this.#chess.isCheck(); }
    isCheckmate() { return this.#chess.isCheckmate(); }
    isStalemate() { return this.#chess.isStalemate(); }
    isDraw() { return this.#chess.isDraw(); }
    isInsufficientMaterial() { return this.#chess.isInsufficientMaterial(); }
    isGameOver() { return this.#chess.isGameOver(); }
    move(move, options) { return asRulesError('invalid-move', () => this.#chess.move(move, options)); }
    undo() { return this.#chess.undo(); }

    pieces() {
        return this.#chess.board().flatMap((rank) => rank.filter(Boolean).map((piece) => ({
            square: piece.square,
            type: piece.type,
            color: piece.color === 'w' ? 'white' : 'black'
        })));
    }
}
