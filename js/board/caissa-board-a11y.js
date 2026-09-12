import { FILES, isSquare } from './caissa-board-state.js';

const PIECE_NAMES = Object.freeze({
    P: 'pawn', N: 'knight', B: 'bishop', R: 'rook', Q: 'queen', K: 'king'
});

export function describePiece(piece) {
    if (!piece) return 'empty';
    return `${piece.color} ${PIECE_NAMES[piece.type] || 'piece'}`;
}

export function squareAccessibleLabel(square, piece, orientation) {
    if (!isSquare(square)) return 'Invalid square';
    const contents = piece ? `${describePiece(piece)} on ${square}` : `${square}, empty`;
    return `${contents}. File ${square[0]}, rank ${square[1]}. ${orientation} orientation.`;
}

export function boardAccessibleDescription(orientation, interactive, readOnly) {
    const interaction = interactive && !readOnly
        ? 'Use arrow keys to navigate, Enter or Space to select, and Escape to cancel.'
        : 'This board is read only.';
    return `${orientation} orientation. ${interaction}`;
}

export function visualCoordinates(square, orientation) {
    if (!isSquare(square)) return null;
    const fileIndex = FILES.indexOf(square[0]);
    const rankIndex = Number(square[1]) - 1;
    return orientation === 'black'
        ? Object.freeze({ x: 7 - fileIndex, y: rankIndex })
        : Object.freeze({ x: fileIndex, y: 7 - rankIndex });
}

export function squareFromVisualPoint(x, y, orientation) {
    const visualFile = Math.max(0, Math.min(7, Math.floor(x)));
    const visualRank = Math.max(0, Math.min(7, Math.floor(y)));
    const fileIndex = orientation === 'black' ? 7 - visualFile : visualFile;
    const rank = orientation === 'black' ? visualRank + 1 : 8 - visualRank;
    return `${FILES[fileIndex]}${rank}`;
}

export function navigateSquare(square, key, orientation) {
    if (!isSquare(square)) return orientation === 'black' ? 'h8' : 'a1';
    let file = FILES.indexOf(square[0]);
    let rank = Number(square[1]) - 1;
    const horizontal = orientation === 'black' ? -1 : 1;
    const vertical = orientation === 'black' ? -1 : 1;
    if (key === 'ArrowRight') file += horizontal;
    if (key === 'ArrowLeft') file -= horizontal;
    if (key === 'ArrowUp') rank += vertical;
    if (key === 'ArrowDown') rank -= vertical;
    file = Math.max(0, Math.min(7, file));
    rank = Math.max(0, Math.min(7, rank));
    return `${FILES[file]}${rank + 1}`;
}
