import { Chess } from '../../assets/vendor/chess.js/chess-1.4.0.esm.js';

export const labelFor = tag => tag === 'mate' ? 'Checkmate'
    : tag.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, letter => letter.toUpperCase()).replace(/(\d)/, ' $1');

export function poolFor(puzzles, { category, theme = '', target = 1800, difficulty = 'normal' }) {
    const bounds = difficulty === 'easier' ? [target - 450, target - 100]
        : difficulty === 'challenge' ? [target, target + 400] : [target - 200, target + 200];
    return puzzles.filter(puzzle => puzzle.rating >= bounds[0] && puzzle.rating <= bounds[1]
        && (theme ? puzzle.themes.includes(theme) : category.some(tag => puzzle.themes.includes(tag))));
}

export class PuzzleSession {
    constructor(puzzle) {
        this.puzzle = puzzle;
        this.moves = puzzle.moves.split(' ');
        this.game = new Chess(puzzle.fen);
        this.playUci(this.moves[0]); // Lichess FEN precedes the opponent's setup move.
        this.index = 1;
        this.solved = false;
        this.revealed = false;
        this.continuing = false;
    }

    playUci(uci) {
        const move = this.game.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || 'q' });
        if (!move) throw new Error(`Illegal source move in puzzle ${this.puzzle.id}: ${uci}`);
        return move;
    }

    attempt(from, to, promotion = 'q') {
        if (this.solved && !this.continuing) return { status: 'complete' };
        if (this.continuing) {
            try { return { status: 'continued', moves: [this.game.move({ from, to, promotion: String(promotion || 'q').toLowerCase() })] }; }
            catch { return { status: 'illegal' }; }
        }
        const expected = this.moves[this.index];
        const uci = `${from}${to}${String(promotion || 'q').toLowerCase()}`;
        const match = expected && (uci === expected || (uci.slice(0, 4) === expected && expected.length === 4));
        // Lichess explicitly permits alternative mates in one.
        if (!match && this.moves.length === 2 && this.puzzle.themes.includes('mateIn1')) {
            const copy = new Chess(this.game.fen());
            try {
                const candidate = copy.move({ from, to, promotion: String(promotion || 'q').toLowerCase() });
                if (candidate && copy.isCheckmate()) {
                    const played = this.game.move({ from, to, promotion: String(promotion || 'q').toLowerCase() });
                    this.index = this.moves.length;
                    this.solved = true;
                    return { status: 'solved', moves: [played] };
                }
            } catch { /* An illegal attempt leaves the position intact. */ }
        }
        if (!match) return { status: 'incorrect' };
        const played = [this.playUci(expected)];
        this.index += 1;
        if (this.index < this.moves.length) {
            played.push(this.playUci(this.moves[this.index]));
            this.index += 1;
        }
        this.solved = this.index >= this.moves.length;
        return { status: this.solved ? 'solved' : 'correct', moves: played };
    }

    reveal() {
        if (this.solved) return [];
        const played = [];
        while (this.index < this.moves.length) played.push(this.playUci(this.moves[this.index++]));
        this.solved = true;
        this.revealed = true;
        return played;
    }
}
