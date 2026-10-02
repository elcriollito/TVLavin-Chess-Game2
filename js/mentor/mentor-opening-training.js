import { Chess } from '../../assets/vendor/chess.js/chess-1.4.0.esm.js';

// Transient validation only. Live moves belong to the page's existing game.
export function prepareOpeningLine({ rootFen, moves, title = 'Opening line', source = 'explorer' } = {}) {
    if (typeof rootFen !== 'string' || rootFen.trim().split(/\s+/).length !== 6 ||
        !['eco', 'explorer'].includes(source) || !Array.isArray(moves) || !moves.length || moves.length > 512) {
        throw new Error('Select a legal opening line with at least one move.');
    }
    const chess = new Chess(rootFen), line = [];
    for (const raw of moves) {
        let move;
        try {
            move = typeof raw === 'string'
                ? chess.move(raw)
                : chess.move({ from: raw.from, to: raw.to, promotion: raw.promotion });
        } catch {}
        if (!move) throw new Error('This opening line contains an illegal move.');
        line.push(Object.freeze({
            from: move.from,
            to: move.to,
            promotion: move.promotion || null,
            san: move.san,
            color: move.color,
            before: move.before,
            after: move.after
        }));
    }
    return Object.freeze({
        rootFen: new Chess(rootFen).fen(),
        moves: Object.freeze(line),
        title: String(title).slice(0, 160),
        source
    });
}

export function createOpeningTraining() {
    let line = null, phase = 'empty', step = 0, previewIndex = 0, side = 'both', feedback = null;
    const read = () => Object.freeze({
        phase,
        step,
        total: line?.moves.length || 0,
        previewIndex,
        side,
        title: line?.title || '',
        source: line?.source || null,
        rootFen: line?.rootFen || null,
        feedback,
        visibleMoves: Object.freeze(line ? line.moves.slice(0, phase === 'study' ? line.moves.length : step) : [])
    });
    const finish = () => {
        if (step === line.moves.length) {
            phase = 'complete';
            feedback = Object.freeze({ kind: 'correct', text: '✓ Opening line completed. Practise again or return to study.' });
        }
    };
    return Object.freeze({
        read,
        load(snapshot, index = 0) {
            const next = prepareOpeningLine(snapshot);
            line = next;
            phase = 'study';
            step = 0;
            previewIndex = Math.max(0, Math.min(Number.isInteger(index) ? index : 0, line.moves.length));
            side = 'both';
            feedback = null;
            return true;
        },
        preview(index) {
            if (!line || phase !== 'study') return null;
            previewIndex = Math.max(0, Math.min(index, line.moves.length));
            return line.moves.slice(0, previewIndex);
        },
        start(color = 'both') {
            if (!line || !['white', 'black', 'both'].includes(color) ||
                !line.moves.some(move => color === 'both' || move.color === color[0])) return false;
            step = 0;
            side = color;
            phase = 'guess';
            feedback = null;
            return true;
        },
        automatic() {
            if (phase !== 'guess' || step >= line.moves.length) return null;
            const move = line.moves[step];
            if (side === 'both' || move.color === side[0]) return null;
            step++;
            finish();
            return move;
        },
        guess({ from, to, promotion } = {}) {
            if (phase !== 'guess') return null;
            const expected = line.moves[step];
            if (expected.from !== from || expected.to !== to || expected.promotion !== (promotion?.toLowerCase() || null)) {
                feedback = Object.freeze({ kind: 'wrong', text: 'Not the move in this opening line. Try again.' });
                return Object.freeze({ correct: false });
            }
            step++;
            feedback = Object.freeze({ kind: 'correct', text: `✓ ${expected.san} — correct for this line.` });
            phase = 'next';
            finish();
            return Object.freeze({ correct: true, move: expected });
        },
        illegal() {
            if (phase === 'guess') feedback = Object.freeze({ kind: 'wrong', text: 'That move is not legal in this position. Try another square.' });
        },
        retry() {
            if (phase !== 'guess' || feedback?.kind !== 'wrong') return false;
            feedback = null;
            return true;
        },
        next() {
            if (phase !== 'next') return false;
            phase = 'guess';
            feedback = null;
            return true;
        },
        study() {
            if (!line) return false;
            phase = 'study';
            step = 0;
            feedback = null;
            return true;
        },
        clear() {
            line = null;
            phase = 'empty';
            step = 0;
            previewIndex = 0;
            side = 'both';
            feedback = null;
        }
    });
}
