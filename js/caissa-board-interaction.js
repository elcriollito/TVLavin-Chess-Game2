export const CAISSA_BOARD_INTERACTION_API_VERSION = '1.0';

export class CaissaBoardInteractionError extends Error {
    constructor(code, cause) {
        super(code, { cause });
        this.name = 'CaissaBoardInteractionError';
        this.code = code;
    }
}

const PROMOTIONS = Object.freeze(['q', 'r', 'b', 'n']);

function colorCode(color) { return color === 'white' ? 'w' : 'b'; }

export class CaissaBoardInteraction {
    #rules;
    #view;
    #onMove;
    #promotionResolver;
    #generation = 0;
    #pending = false;
    #disposed = false;

    constructor({ rules, boardView, onMove, promotionResolver } = {}) {
        this.#rules = rules;
        this.#view = boardView;
        this.#onMove = typeof onMove === 'function' ? onMove : () => true;
        this.#promotionResolver = typeof promotionResolver === 'function'
            ? promotionResolver
            : async () => 'q';
    }

    setRules(rules) { this.#assertAlive(); this.#rules = rules; this.invalidate(); }
    invalidate() { this.#generation += 1; this.#pending = false; }
    isPending() { return this.#pending; }

    legalMoves(square) {
        this.#assertAlive();
        try {
            return this.#rules.legalMoves({ square, verbose: true }).map((move) => ({
                from: move.from,
                to: move.to,
                promotion: move.promotion || null,
                capture: Boolean(move.captured),
                color: move.color === 'w' ? 'white' : 'black',
                lan: move.lan || `${move.from}${move.to}${move.promotion || ''}`
            }));
        } catch (error) {
            throw new CaissaBoardInteractionError('invalid-move', error);
        }
    }

    canStart(square, piece) {
        if (this.#disposed || this.#pending || !this.#view.canInteract()) return false;
        const expected = colorCode(this.#rules.sideToMove());
        const actual = typeof piece === 'string' ? piece.charAt(0).toLowerCase() :
            colorCode(this.#pieceAt(square)?.color);
        return actual === expected && this.legalMoves(square).length > 0;
    }

    select(square) {
        this.#assertAlive();
        if (!this.#view.canInteract() || this.#pending) return false;
        const piece = this.#pieceAt(square);
        if (!piece || piece.color !== this.#rules.sideToMove()) {
            this.#view.setSelectedSquare(null);
            return false;
        }
        const moves = this.legalMoves(square);
        if (!moves.length) {
            this.#view.setSelectedSquare(null);
            return false;
        }
        this.#view.setSelectedSquare(square, moves);
        return true;
    }

    async activate(square) {
        this.#assertAlive();
        if (!this.#view.canInteract() || this.#pending) return false;
        const selected = this.#view.getState().selectedSquare;
        if (!selected) return this.select(square);
        const candidate = this.legalMoves(selected).find((move) => move.to === square);
        if (candidate) return this.submit(candidate);
        return this.select(square);
    }

    beginDrop(from, to) {
        this.#assertAlive();
        if (!this.canStart(from)) return false;
        const candidate = this.legalMoves(from).find((move) => move.to === to);
        if (!candidate) return false;
        this.#view.setPendingVisualMove(candidate, true);
        void this.submit(candidate);
        return true;
    }

    async drop(from, to) { return this.beginDrop(from, to); }

    async submit(move) {
        this.#assertAlive();
        if (this.#pending || !this.#view.canInteract()) return false;
        const token = this.#generation;
        let promotion = move.promotion;
        if (this.#isPromotion(move)) {
            let resolverFailed = false;
            this.#pending = true;
            this.#view.setSubmitting(true, move);
            try {
                promotion = await this.#promotionResolver({
                    color: this.#rules.sideToMove(), from: move.from, to: move.to,
                    choices: [...PROMOTIONS]
                });
            } catch (error) {
                this.#view.reportError('promotion-cancelled', error);
                resolverFailed = true;
                promotion = null;
            }
            if (!this.#owns(token)) return false;
            if (!PROMOTIONS.includes(promotion)) {
                this.#pending = false;
                this.#view.setSubmitting(false);
                this.#view.setSelectedSquare(null);
                if (!resolverFailed) this.#view.reportError('promotion-cancelled');
                return false;
            }
        } else {
            this.#pending = true;
            this.#view.setSubmitting(true, move);
        }
        const intent = Object.freeze({
            from: move.from, to: move.to, promotion: promotion || null,
            lan: `${move.from}${move.to}${promotion || ''}`
        });
        try {
            const accepted = await this.#onMove(intent);
            if (!this.#owns(token)) return false;
            if (accepted === false) this.#view.rollbackPendingVisualMove();
            return accepted !== false;
        } catch (error) {
            if (this.#owns(token)) { this.#view.reportError('invalid-move', error); this.#view.rollbackPendingVisualMove(); }
            return false;
        } finally {
            if (this.#owns(token)) {
                this.#pending = false;
                this.#view.setSubmitting(false);
                this.#view.setSelectedSquare(null);
            }
        }
    }

    dispose() { if (!this.#disposed) { this.#disposed = true; this.invalidate(); this.#rules = null; this.#view = null; } }
    #owns(token) { return !this.#disposed && token === this.#generation; }
    #assertAlive() { if (this.#disposed) throw new CaissaBoardInteractionError('board-disposed'); }
    #pieceAt(square) { return this.#rules.pieces().find((piece) => piece.square === square); }
    #isPromotion(move) {
        const piece = this.#pieceAt(move.from);
        return piece?.type === 'p' && ((piece.color === 'white' && move.to[1] === '8') ||
            (piece.color === 'black' && move.to[1] === '1'));
    }
}
