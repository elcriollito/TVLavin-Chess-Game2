function fullmoveNumber(move) {
    const fields = String(move?.before || '').trim().split(/\s+/u);
    const number = Number(fields[5]);
    if (!Number.isInteger(number) || number < 1) throw new TypeError('endgame-move-fullmove-unavailable');
    return number;
}

export function pairEndgameMoves(moves = []) {
    const rows = [];
    let current = null;
    for (const [index, move] of moves.entries()) {
        if (!['w', 'b'].includes(move?.color) || !move?.san) throw new TypeError('endgame-move-invalid');
        const number = fullmoveNumber(move);
        if (!current || current.number !== number) {
            current = { number, white: null, black: null };
            rows.push(current);
        }
        const side = move.color === 'w' ? 'white' : 'black';
        if (current[side]) throw new TypeError('endgame-move-side-duplicate');
        current[side] = Object.freeze({
            color: move.color,
            san: move.san,
            cursor: index + 1,
            move,
        });
    }
    return Object.freeze(rows.map(row => Object.freeze({ ...row })));
}
