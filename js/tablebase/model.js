export const START_FEN = '6r1/3k4/8/KP6/8/8/2R5/8 w - - 0 1';

const CATEGORY_PROFILE = Object.freeze({
    win: Object.freeze({ outcome: 'win', exact: true }),
    loss: Object.freeze({ outcome: 'loss', exact: true }),
    draw: Object.freeze({ outcome: 'draw', exact: true }),
    'cursed-win': Object.freeze({ outcome: 'draw', exact: true, withoutFifty: 'win' }),
    'blessed-loss': Object.freeze({ outcome: 'draw', exact: true, withoutFifty: 'loss' }),
    'maybe-win': Object.freeze({ outcome: 'unknown', exact: false, possible: ['win', 'draw'] }),
    'maybe-loss': Object.freeze({ outcome: 'unknown', exact: false, possible: ['draw', 'loss'] }),
    'syzygy-win': Object.freeze({ outcome: 'unknown', exact: false, possible: ['win', 'draw'] }),
    'syzygy-loss': Object.freeze({ outcome: 'unknown', exact: false, possible: ['draw', 'loss'] }),
    unknown: Object.freeze({ outcome: 'unknown', exact: false })
});

export function categoryProfile(category) {
    return CATEGORY_PROFILE[category] || CATEGORY_PROFILE.unknown;
}

// API move categories describe the resulting position from the opponent's perspective.
export function moverOutcome(category) {
    const outcome = positionOutcome(category);
    if (outcome === 'win') return 'loss';
    if (outcome === 'loss') return 'win';
    return outcome;
}

export function positionOutcome(category) {
    return categoryProfile(category).outcome;
}

export function resultLabel(category, turn) {
    const result = positionOutcome(category);
    if (result === 'unknown') return 'Outcome uncertain';
    if (result === 'draw') return ['cursed-win', 'blessed-loss'].includes(category)
        ? 'Draw with the 50-move rule' : 'Theoretical draw';
    const winner = (result === 'win') === (turn === 'w') ? 'White' : 'Black';
    return `${winner} wins`;
}

export function resultExplanation(category) {
    if (category === 'cursed-win') {
        return 'The side to move can win without the 50-move rule, but the current halfmove clock makes this a draw with that rule.';
    }
    if (category === 'blessed-loss') {
        return 'The side to move would lose without the 50-move rule, but the current halfmove clock saves the draw.';
    }
    if (category === 'maybe-win' || category === 'syzygy-win') {
        return 'The provider can only narrow this to a win or draw; CAISSA will not grade it as an exact win.';
    }
    if (category === 'maybe-loss' || category === 'syzygy-loss') {
        return 'The provider can only narrow this to a draw or loss; CAISSA will not grade it as an exact draw or loss.';
    }
    if (category === 'unknown') return 'The provider cannot determine an exact result for this position.';
    return 'Exact result with perfect play and the current halfmove clock.';
}

export function outcomeChange(beforeCategory, afterCategory) {
    const before = categoryProfile(beforeCategory);
    const afterOutcome = moverOutcome(afterCategory);
    const oldScore = { win: 2, draw: 1, loss: 0 }[before.outcome];
    const newScore = { win: 2, draw: 1, loss: 0 }[afterOutcome];
    if (!before.exact || !categoryProfile(afterCategory).exact || oldScore === undefined || newScore === undefined) {
        return 'Provider data is not exact enough to grade this move.';
    }
    const fiftyRuleDraw = ['cursed-win', 'blessed-loss'].includes(beforeCategory);
    if (newScore < oldScore) {
        if (oldScore === 2) return 'This move lost the theoretical win.';
        return fiftyRuleDraw ? 'This move lost the draw available under the 50-move rule.'
            : 'This move lost the theoretical draw.';
    }
    if (newScore > oldScore) return newScore === 2 ? 'This move reaches a win.' : 'This move reaches a draw.';
    if (newScore === 2) return 'The win is preserved.';
    if (newScore === 1) return fiftyRuleDraw ? 'The draw under the 50-move rule is preserved.' : 'The draw is preserved.';
    return 'The position remains lost with perfect play.';
}

export function exactTrainingMoves(result) {
    if (!result || !categoryProfile(result.category).exact) return [];
    const target = positionOutcome(result.category);
    return result.moves.filter(move => categoryProfile(move.category).exact && moverOutcome(move.category) === target);
}

export function parseSetupDraft(fen) {
    const [placement, turn = 'w', , , halfmove = '0', fullmove = '1'] = String(fen).trim().split(/\s+/);
    const pieces = {};
    const ranks = placement.split('/');
    if (ranks.length !== 8) throw new Error('Invalid FEN placement');
    for (let rankIndex = 0; rankIndex < 8; rankIndex += 1) {
        let fileIndex = 0;
        for (const token of ranks[rankIndex]) {
            if (/^[1-8]$/.test(token)) { fileIndex += Number(token); continue; }
            if (!/^[prnbqkPRNBQK]$/.test(token) || fileIndex > 7) throw new Error('Invalid FEN placement');
            pieces[`${String.fromCharCode(97 + fileIndex)}${8 - rankIndex}`] = token;
            fileIndex += 1;
        }
        if (fileIndex !== 8) throw new Error('Invalid FEN placement');
    }
    return { pieces, turn: turn === 'b' ? 'b' : 'w', halfmove: Number(halfmove) || 0, fullmove: Number(fullmove) || 1 };
}

export function setupDraftFen(draft) {
    const ranks = [];
    for (let rank = 8; rank >= 1; rank -= 1) {
        let empty = 0;
        let row = '';
        for (let file = 0; file < 8; file += 1) {
            const piece = draft.pieces[`${String.fromCharCode(97 + file)}${rank}`];
            if (!piece) { empty += 1; continue; }
            if (empty) { row += String(empty); empty = 0; }
            row += piece;
        }
        if (empty) row += String(empty);
        ranks.push(row);
    }
    const turn = draft.turn === 'b' ? 'b' : 'w';
    const halfmove = Math.max(0, Math.min(150, Math.trunc(Number(draft.halfmove) || 0)));
    const fullmove = Math.max(1, Math.trunc(Number(draft.fullmove) || 1));
    // Free placement has no move history, so castling and en-passant rights are deliberately cleared.
    return `${ranks.join('/')} ${turn} - - ${halfmove} ${fullmove}`;
}

export function updateSetupSquare(draft, square, piece = null) {
    const pieces = { ...draft.pieces };
    if (piece) pieces[square] = piece;
    else delete pieces[square];
    return { ...draft, pieces };
}

export function moveSetupPiece(draft, from, to) {
    const piece = draft.pieces[from];
    if (!piece || from === to) return draft;
    const next = updateSetupSquare(draft, from, null);
    return updateSetupSquare(next, to, piece);
}
