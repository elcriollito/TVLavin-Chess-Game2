import { Chess } from '../../../assets/vendor/chess.js/chess-1.4.0.esm.js';

const PROMOTION = /^[qrbn]$/u;

export class EndgameAnalysisPosition {
    #game = null;
    #originFen = null;
    #positions = [];
    #moves = [];
    #cursor = -1;

    load(fen) {
        this.#game = new Chess(fen);
        this.#originFen = this.#game.fen();
        this.#positions = [this.#originFen];
        this.#moves = [];
        this.#cursor = 0;
        return this.snapshot();
    }

    clear() {
        this.#game = null;
        this.#originFen = null;
        this.#positions = [];
        this.#moves = [];
        this.#cursor = -1;
    }

    get active() { return Boolean(this.#game); }
    get fen() { return this.#game?.fen() ?? null; }
    get originFen() { return this.#originFen; }
    get turn() { return this.#game?.turn() ?? null; }
    get cursor() { return this.#cursor; }
    get lastIndex() { return this.#positions.length - 1; }

    loadHistory(moves, cursor = moves?.length) {
        if (!Array.isArray(moves) || !moves.length) throw new TypeError('analysis-history-unavailable');
        this.load(moves[0].before);
        for (const expected of moves) {
            const result = this.attempt({
                from: expected.from,
                to: expected.to,
                promotion: expected.promotion || 'q',
            });
            if (!result.ok || (expected.after && result.fen !== expected.after)) {
                this.clear();
                throw new Error('analysis-history-invalid');
            }
        }
        const selected = cursor ?? moves.length;
        if (!Number.isInteger(selected) || selected < 0 || selected > this.lastIndex) {
            this.clear();
            throw new RangeError('analysis-history-cursor-invalid');
        }
        return this.navigate(selected);
    }

    navigate(index) {
        if (!this.#game || !Number.isInteger(index) || index < 0 || index >= this.#positions.length) return null;
        this.#cursor = index;
        this.#game = new Chess(this.#positions[index]);
        return this.snapshot();
    }

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
            const truncated = this.#positions.length - this.#cursor - 1;
            this.#positions.splice(this.#cursor + 1);
            this.#moves.splice(this.#cursor);
            this.#positions.push(this.#game.fen());
            this.#moves.push(Object.freeze({ ...move }));
            this.#cursor += 1;
            return Object.freeze({
                ok: true,
                status: 'accepted',
                fen: this.#game.fen(),
                move: Object.freeze({ ...move }),
                turn: this.#game.turn(),
                gameOver: this.#game.isGameOver(),
                cursor: this.#cursor,
                lastIndex: this.lastIndex,
                truncated,
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
            cursor: this.#cursor,
            lastIndex: this.lastIndex,
            positionCount: this.#positions.length,
            atStart: this.#cursor === 0,
            atEnd: this.#cursor === this.lastIndex,
            history: Object.freeze(this.#moves.slice(0, this.#cursor)),
            timeline: Object.freeze(this.#moves.slice()),
        });
    }
}
