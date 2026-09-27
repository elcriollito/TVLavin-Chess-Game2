export const START_FEN = '6r1/3k4/8/KP6/8/8/2R5/8 w - - 0 1';

// API move categories describe the resulting position from the opponent's perspective.
export function moverOutcome(category) {
    if (category === 'loss') return 'win';
    if (category === 'win') return 'loss';
    if (category === 'cursed-win' || category === 'blessed-loss' || category === 'draw') return 'draw';
    return 'unknown';
}

export function positionOutcome(category) {
    if (category === 'win') return 'win';
    if (category === 'loss') return 'loss';
    if (['cursed-win', 'blessed-loss', 'draw'].includes(category)) return 'draw';
    return 'unknown';
}

export function resultLabel(category, turn) {
    const result = positionOutcome(category);
    if (result === 'unknown') return 'Result unavailable';
    if (result === 'draw') return 'Theoretical draw';
    const winner = (result === 'win') === (turn === 'w') ? 'White' : 'Black';
    return `${winner} wins`;
}

export function outcomeChange(before, after) {
    const oldScore = { win: 2, draw: 1, loss: 0 }[positionOutcome(before)];
    const newScore = { win: 2, draw: 1, loss: 0 }[moverOutcome(after)];
    if (oldScore === undefined || newScore === undefined) return 'Result is uncertain for this move.';
    if (newScore < oldScore) return oldScore === 2 ? 'This move lost the theoretical win.' : 'This move lost the theoretical draw.';
    return newScore === 2 ? 'The win is preserved.' : newScore === 1 ? 'The draw is preserved.' : 'The position remains lost with perfect play.';
}
