import { Chess } from '../../assets/vendor/chess.js/chess-1.4.0.esm.js';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const clone = value => JSON.parse(JSON.stringify(value));

function applyUci(chess, uci) {
    if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(String(uci || ''))) return null;
    try {
        return chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || 'q' });
    } catch {
        return null;
    }
}

export class TrainingSession {
    #snapshot;
    #line;
    #game;
    #cursor = 0;
    #stats = { attempts: 0, correct: 0, errors: 0, hints: 0, reveals: 0 };
    #completed = false;

    constructor(repertoire, { lineIndex = 0 } = {}) {
        if (!repertoire || !Array.isArray(repertoire.lines) || !repertoire.lines.length) {
            throw new TypeError('A saved repertoire is required for training.');
        }
        this.#snapshot = Object.freeze(clone(repertoire));
        this.#line = Object.freeze(clone(repertoire.lines[Math.max(0, Math.min(lineIndex, repertoire.lines.length - 1))]));
        this.#game = new Chess(repertoire.initialFen || START_FEN);
    }

    get snapshot() { return this.#snapshot; }
    get fen() { return this.#game.fen(); }
    get cursor() { return this.#cursor; }
    get completed() { return this.#completed; }
    get userColor() { return this.#snapshot.color === 'black' ? 'b' : 'w'; }
    get expected() { return this.#line[this.#cursor] || null; }

    state() {
        const accuracy = this.#stats.attempts ? Math.round((this.#stats.correct / this.#stats.attempts) * 100) : 100;
        return Object.freeze({
            repertoireId: this.#snapshot.id,
            repertoireName: this.#snapshot.name,
            cursor: this.#cursor,
            totalPlies: this.#line.length,
            completed: this.#completed,
            userColor: this.userColor,
            turn: this.#game.turn(),
            fen: this.fen,
            expected: this.expected ? Object.freeze(clone(this.expected)) : null,
            stats: Object.freeze({ ...this.#stats, accuracy })
        });
    }

    advanceCaissa() {
        const moves = [];
        while (!this.#completed && this.expected && this.#game.turn() !== this.userColor) {
            const expected = this.expected;
            const applied = applyUci(this.#game, expected.uci);
            if (!applied) throw new Error('The saved repertoire contains an invalid response.');
            moves.push(Object.freeze({ ...clone(expected), san: applied.san, fenAfter: this.#game.fen() }));
            this.#cursor += 1;
            if (this.#cursor >= this.#line.length) this.#completed = true;
        }
        return Object.freeze(moves);
    }

    attempt(uci) {
        if (this.#completed) return Object.freeze({ ok: false, status: 'complete', state: this.state() });
        if (this.#game.turn() !== this.userColor) {
            return Object.freeze({ ok: false, status: 'waiting-for-caissa', state: this.state() });
        }
        this.#stats.attempts += 1;
        const expected = this.expected;
        const probe = new Chess(this.#game.fen());
        const legalProbe = applyUci(probe, uci);
        if (!legalProbe) {
            this.#stats.errors += 1;
            return Object.freeze({
                ok: false,
                status: 'illegal',
                assessment: 'Illegal move — the position is unchanged.',
                expected: Object.freeze(clone(expected)),
                state: this.state()
            });
        }
        if (String(uci).toLowerCase() !== String(expected?.uci || '').toLowerCase()) {
            this.#stats.errors += 1;
            return Object.freeze({
                ok: false,
                status: 'repertoire-deviation',
                assessment: `Repertoire deviation: ${legalProbe.san} is legal, but this line expects ${expected?.san || expected?.uci}.`,
                expected: Object.freeze(clone(expected)),
                state: this.state()
            });
        }
        const applied = applyUci(this.#game, expected.uci);
        if (!applied) throw new Error('The expected repertoire move is invalid.');
        this.#stats.correct += 1;
        this.#cursor += 1;
        if (this.#cursor >= this.#line.length) this.#completed = true;
        return Object.freeze({
            ok: true,
            status: this.#completed ? 'complete' : 'correct',
            move: Object.freeze({ ...clone(expected), san: applied.san, fenAfter: this.#game.fen() }),
            state: this.state()
        });
    }

    hint() {
        if (!this.expected || this.#completed) return null;
        this.#stats.hints += 1;
        return Object.freeze({
            from: this.expected.from || this.expected.uci.slice(0, 2),
            to: this.expected.to || this.expected.uci.slice(2, 4),
            san: this.expected.san,
            uci: this.expected.uci
        });
    }

    reveal() {
        if (!this.expected || this.#completed || this.#game.turn() !== this.userColor) return null;
        const expected = this.expected;
        const applied = applyUci(this.#game, expected.uci);
        if (!applied) throw new Error('The expected repertoire move is invalid.');
        this.#stats.attempts += 1;
        this.#stats.errors += 1;
        this.#stats.reveals += 1;
        this.#cursor += 1;
        if (this.#cursor >= this.#line.length) this.#completed = true;
        return Object.freeze({
            ...clone(expected),
            san: applied.san,
            fenAfter: this.#game.fen(),
            state: this.state()
        });
    }

    result() {
        return Object.freeze({ ...this.#stats, completed: this.#completed });
    }
}

export default TrainingSession;
