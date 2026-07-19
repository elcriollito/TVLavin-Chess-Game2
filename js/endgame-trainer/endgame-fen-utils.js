const PIECE_ORDER = ['k', 'q', 'r', 'b', 'n', 'p'];

export function canonicalizeFen(fen) {
    const fields = String(fen || '').trim().split(/\s+/);
    if (fields.length !== 6) throw new Error('FEN must contain exactly six fields');
    const [placement, turn, castling, enPassant, halfmove, fullmove] = fields;
    boardFromFen(placement);
    if (!/^[wb]$/.test(turn)) throw new Error('Invalid FEN side-to-move field');
    if (!/^(?:-|K?Q?k?q?)$/.test(castling)) throw new Error('Invalid FEN castling field');
    if (!/^(?:-|[a-h][36])$/.test(enPassant)) throw new Error('Invalid FEN en passant field');
    if (!/^\d+$/.test(halfmove)) throw new Error('Invalid FEN halfmove clock');
    if (!/^[1-9]\d*$/.test(fullmove)) throw new Error('Invalid FEN fullmove number');
    return `${placement} ${turn} ${castling} ${enPassant} ${Number(halfmove)} ${Number(fullmove)}`;
}

export function positionKey(fen) {
    return canonicalizeFen(fen).split(' ').slice(0, 4).join(' ');
}

export function boardFromFen(fen) {
    const placement = String(fen || '').trim().split(/\s+/)[0];
    const ranks = placement.split('/');
    if (ranks.length !== 8) throw new Error('FEN placement must contain eight ranks');
    const board = [];
    for (let rankIndex = 0; rankIndex < 8; rankIndex += 1) {
        let file = 0;
        for (const token of ranks[rankIndex]) {
            if (/^[1-8]$/.test(token)) {
                file += Number(token);
            } else if (/^[prnbqkPRNBQK]$/.test(token) && file < 8) {
                board.push({
                    square: `${String.fromCharCode(97 + file)}${8 - rankIndex}`,
                    type: token.toLowerCase(),
                    color: token === token.toUpperCase() ? 'white' : 'black'
                });
                file += 1;
            } else {
                throw new Error('Invalid FEN placement token');
            }
        }
        if (file !== 8) throw new Error('Each FEN rank must contain eight squares');
    }
    return board;
}

export function countPieces(fenOrBoard) {
    return (Array.isArray(fenOrBoard) ? fenOrBoard : boardFromFen(fenOrBoard)).length;
}

export function materialSignature(board) {
    const pieces = Array.isArray(board) ? board : boardFromFen(board);
    const side = (color) => PIECE_ORDER.flatMap((type) =>
        pieces.filter((piece) => piece.color === color && piece.type === type).map(() => type.toUpperCase())
    ).join('');
    return `w:${side('white')}|b:${side('black')}`;
}

export function kingsAreAdjacent(board) {
    const kings = board.filter((piece) => piece.type === 'k');
    const white = kings.find((piece) => piece.color === 'white');
    const black = kings.find((piece) => piece.color === 'black');
    if (!white || !black) return false;
    return squareDistance(white.square, black.square) <= 1;
}

export function hasPawnOnInvalidRank(board) {
    return board.some((piece) => piece.type === 'p' && /[18]$/.test(piece.square));
}

export function squareDistance(a, b) {
    return Math.max(Math.abs(a.charCodeAt(0) - b.charCodeAt(0)), Math.abs(Number(a[1]) - Number(b[1])));
}

export function boardToFen(board, sideToMove = 'white') {
    if (!Array.isArray(board)) throw new Error('Board must be an array');
    if (!['white', 'black'].includes(sideToMove)) throw new Error('Invalid side to move');
    const bySquare = new Map();
    for (const piece of board) {
        if (!/^[a-h][1-8]$/.test(piece?.square || '')) throw new Error('Invalid piece square');
        if (!/^[prnbqk]$/.test(piece?.type || '')) throw new Error('Invalid piece type');
        if (!['white', 'black'].includes(piece?.color)) throw new Error('Invalid piece color');
        if (bySquare.has(piece.square)) throw new Error('Duplicate occupied square');
        bySquare.set(piece.square, piece);
    }
    const ranks = [];
    for (let rank = 8; rank >= 1; rank -= 1) {
        let empty = 0;
        let text = '';
        for (let file = 0; file < 8; file += 1) {
            const piece = bySquare.get(`${String.fromCharCode(97 + file)}${rank}`);
            if (!piece) { empty += 1; continue; }
            if (empty) { text += empty; empty = 0; }
            text += piece.color === 'white' ? piece.type.toUpperCase() : piece.type;
        }
        if (empty) text += empty;
        ranks.push(text);
    }
    return `${ranks.join('/')} ${sideToMove === 'white' ? 'w' : 'b'} - - 0 1`;
}
