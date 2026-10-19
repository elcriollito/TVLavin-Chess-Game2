import { Chess } from '../../../assets/vendor/chess.js/chess-1.4.0.esm.js';

const PROMOTION = /^[qrbn]$/u;

export class EndgameAnalysisPosition {
    #game = null;
    #originFen = null;

    load(fen) {
        this.#game = new Chess(fen);
        this.#originFen = this.#game.fen();
        return this.snapshot();
    }

    clear() {
        this.#game = null;
        this.#originFen = null;
    }

    get active() { return Boolean(this.#game); }
    get fen() { return this.#game?.fen() ?? null; }
    get originFen() { return this.#originFen; }
    get turn() { return this.#game?.turn() ?? null; }

    attempt({ from, to, promotion = 'q' } = {}) {
        if (!this.#game) return Object.freeze({ ok: false, status: 'inactive', fen: null, move: null });
        const before = this.#game.fen();
        const normalizedPromotion = String(promotion || 'q').toLowerCase();
        if (!PROMOTION.test(normalizedPromotion)) {
            return Object.freeze({ ok: false, status: 'illegal', fen: before, move: null });
        }
        try {
            const move = this.#game.move({ from, to, promotion: normalizedPromotion });
            if (!move) throw new Error('illegal-analysis-move');
            return Object.freeze({
                ok: true,
                status: 'accepted',
                fen: this.#game.fen(),
                move: Object.freeze({ ...move }),
                turn: this.#game.turn(),
                gameOver: this.#game.isGameOver(),
            });
        } catch {
            return Object.freeze({ ok: false, status: 'illegal', fen: before, move: null });
        }
    }

    snapshot() {
        if (!this.#game) return null;
        return Object.freeze({
            fen: this.#game.fen(),
            originFen: this.#originFen,
            turn: this.#game.turn(),
            gameOver: this.#game.isGameOver(),
            history: Object.freeze(this.#game.history({ verbose: true }).map(move => Object.freeze({ ...move }))),
        });
    }
}
