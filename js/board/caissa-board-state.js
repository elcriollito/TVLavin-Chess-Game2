/**
 * Presentation-only chess position helpers for the CAISSA board renderer.
 *
 * This module intentionally does not validate chess legality, turns, checks,
 * move counters, or results. Product features remain the canonical owners of
 * those concepts.
 */

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
export const FILES = Object.freeze(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']);
export const RANKS = Object.freeze(['1', '2', '3', '4', '5', '6', '7', '8']);
export const SQUARES = Object.freeze(RANKS.flatMap(rank => FILES.map(file => `${file}${rank}`)));

const PIECE_TOKEN = /^[prnbqkPRNBQK]$/;
const SQUARE_TOKEN = /^[a-h][1-8]$/;
const PROMOTION_TOKEN = /^[qrbn]$/i;

export class CaissaBoardStateError extends Error {
    constructor(code, message) {
        super(message);
        this.name = 'CaissaBoardStateError';
        this.code = code;
    }
}

export function isSquare(value) {
    return typeof value === 'string' && SQUARE_TOKEN.test(value);
}

export function squareIndex(square) {
    if (!isSquare(square)) return -1;
    return (Number(square[1]) - 1) * 8 + FILES.indexOf(square[0]);
}

export function squareDistance(left, right) {
    const leftIndex = squareIndex(left);
    const rightIndex = squareIndex(right);
    if (leftIndex < 0 || rightIndex < 0) return Number.POSITIVE_INFINITY;
    return Math.abs((leftIndex % 8) - (rightIndex % 8))
        + Math.abs(Math.floor(leftIndex / 8) - Math.floor(rightIndex / 8));
}

function normalizeFenInput(fen) {
    if (fen === 'start') return START_FEN;
    if (typeof fen !== 'string' || !fen.trim()) {
        throw new CaissaBoardStateError('INVALID_FEN', 'A non-empty FEN string is required.');
    }
    return fen.trim().replace(/\s+/g, ' ');
}

function validateFenMetadata(parts) {
    if (parts.length === 1) return;
    if (parts.length !== 6) {
        throw new CaissaBoardStateError('INVALID_FEN_FIELDS', 'FEN must contain a placement or all six fields.');
    }
    if (!/^[wb]$/.test(parts[1])) throw new CaissaBoardStateError('INVALID_FEN_TURN', 'Invalid active color.');
    if (!/^(?:-|K?Q?k?q?)$/.test(parts[2]) || new Set(parts[2]).size !== parts[2].length) {
        throw new CaissaBoardStateError('INVALID_FEN_CASTLING', 'Invalid castling field.');
    }
    if (!/^(?:-|[a-h][36])$/.test(parts[3])) {
        throw new CaissaBoardStateError('INVALID_FEN_EN_PASSANT', 'Invalid en-passant field.');
    }
    if (!/^\d+$/.test(parts[4]) || !/^[1-9]\d*$/.test(parts[5])) {
        throw new CaissaBoardStateError('INVALID_FEN_COUNTERS', 'Invalid FEN counters.');
    }
}

export function parseFen(fen) {
    const normalized = normalizeFenInput(fen);
    const parts = normalized.split(' ');
    validateFenMetadata(parts);
    const ranks = parts[0].split('/');
    if (ranks.length !== 8) throw new CaissaBoardStateError('INVALID_FEN_RANKS', 'FEN requires eight ranks.');

    const entries = [];
    ranks.forEach((rankValue, rankOffset) => {
        let fileIndex = 0;
        for (const token of rankValue) {
            if (/^[1-8]$/.test(token)) {
                fileIndex += Number(token);
                continue;
            }
            if (!PIECE_TOKEN.test(token)) {
                throw new CaissaBoardStateError('INVALID_FEN_PIECE', `Invalid FEN token: ${token}`);
            }
            if (fileIndex >= 8) throw new CaissaBoardStateError('INVALID_FEN_WIDTH', 'A rank exceeds eight files.');
            const color = token === token.toUpperCase() ? 'white' : 'black';
            const type = token.toUpperCase();
            entries.push(Object.freeze({
                square: `${FILES[fileIndex]}${8 - rankOffset}`,
                color,
                type,
                code: `${color === 'white' ? 'w' : 'b'}${type}`
            }));
            fileIndex += 1;
        }
        if (fileIndex !== 8) throw new CaissaBoardStateError('INVALID_FEN_WIDTH', 'Each FEN rank must span eight files.');
    });

    return Object.freeze({
        fen: normalized,
        placement: parts[0],
        metadata: parts.length === 6 ? Object.freeze({
            activeColor: parts[1], castling: parts[2], enPassant: parts[3],
            halfmove: Number(parts[4]), fullmove: Number(parts[5])
        }) : null,
        entries: Object.freeze(entries.sort((a, b) => squareIndex(a.square) - squareIndex(b.square)))
    });
}
export function serializePlacement(pieces) {
    const bySquare = new Map();
    for (const piece of pieces) {
        if (!piece || !isSquare(piece.square) || !/^[wb][KQRBNP]$/.test(piece.code || '')) {
            throw new CaissaBoardStateError('INVALID_PIECE_STATE', 'Cannot serialize invalid presentation piece state.');
        }
        if (bySquare.has(piece.square)) {
            throw new CaissaBoardStateError('DUPLICATE_SQUARE', `Multiple pieces occupy ${piece.square}.`);
        }
        bySquare.set(piece.square, piece);
    }

    const ranks = [];
    for (let rank = 8; rank >= 1; rank -= 1) {
        let empty = 0;
        let value = '';
        for (const file of FILES) {
            const piece = bySquare.get(`${file}${rank}`);
            if (!piece) {
                empty += 1;
                continue;
            }
            if (empty) value += String(empty);
            empty = 0;
            value += piece.color === 'white' ? piece.type : piece.type.toLowerCase();
        }
        if (empty) value += String(empty);
        ranks.push(value);
    }
    return ranks.join('/');
}

function sortedEntries(entries) {
    return [...entries].sort((a, b) => squareIndex(a.square) - squareIndex(b.square) || a.code.localeCompare(b.code));
}

export function assignInitialPieceIdentities(entries) {
    const counts = new Map();
    return sortedEntries(entries).map(entry => {
        const count = (counts.get(entry.code) || 0) + 1;
        counts.set(entry.code, count);
        return { ...entry, id: `caissa-${entry.code}-${count}` };
    });
}

export function createIdentityAllocator(pieces = []) {
    const counts = new Map();
    for (const piece of pieces) {
        const match = String(piece.id || '').match(/^caissa-([wb][KQRBNP])-(\d+)$/);
        if (match) counts.set(match[1], Math.max(counts.get(match[1]) || 0, Number(match[2])));
    }
    return code => {
        const next = (counts.get(code) || 0) + 1;
        counts.set(code, next);
        return `caissa-${code}-${next}`;
    };
}

/**
 * Deterministically preserves same-square identities first, then pairs each
 * remaining target with the nearest same-code renderer piece. This maximizes
 * useful DOM retention for arbitrary FEN jumps without claiming chess history.
 */
export function reconcilePieces(currentPieces, targetEntries, allocateId = createIdentityAllocator(currentPieces)) {
    const current = [...currentPieces];
    const targets = sortedEntries(targetEntries);
    const claimedIds = new Set();
    const assignedTargets = new Set();
    const result = [];
    const moved = [];
    const added = [];

    for (const target of targets) {
        const exact = current.find(piece => !claimedIds.has(piece.id)
            && piece.square === target.square && piece.code === target.code);
        if (!exact) continue;
        claimedIds.add(exact.id);
        assignedTargets.add(target);
        result.push(exact);
    }

    for (const target of targets) {
        if (assignedTargets.has(target)) continue;
        const candidates = current
            .filter(piece => !claimedIds.has(piece.id) && piece.code === target.code)
            .sort((left, right) => squareDistance(left.square, target.square) - squareDistance(right.square, target.square)
                || squareIndex(left.square) - squareIndex(right.square)
                || left.id.localeCompare(right.id));
        const previous = candidates[0];
        if (previous) {
            const next = { ...previous, square: target.square };
            claimedIds.add(previous.id);
            result.push(next);
            moved.push({ id: previous.id, from: previous.square, to: target.square, piece: next });
        } else {
            const next = { ...target, id: allocateId(target.code) };
            result.push(next);
            added.push(next);
        }
    }

    const removed = current.filter(piece => !claimedIds.has(piece.id));
    return Object.freeze({
        pieces: Object.freeze(result.sort((a, b) => squareIndex(a.square) - squareIndex(b.square))),
        moved: Object.freeze(moved), added: Object.freeze(added), removed: Object.freeze(removed)
    });
}

function inferCastleRook(move, piece) {
    if (!move.castle) return null;
    if (move.castle && typeof move.castle === 'object') {
        return { from: move.castle.rookFrom, to: move.castle.rookTo };
    }
    if (piece.type !== 'K' || piece.square[1] !== move.to[1]) {
        throw new CaissaBoardStateError('INVALID_CASTLE', 'Castling requires a king and rook coordinates.');
    }
    const kingSide = FILES.indexOf(move.to[0]) > FILES.indexOf(piece.square[0]);
    return { from: `${kingSide ? 'h' : 'a'}${piece.square[1]}`, to: `${kingSide ? 'f' : 'd'}${piece.square[1]}` };
}

function captureSquareFor(move) {
    if (move.enPassant && typeof move.enPassant === 'object') return move.enPassant.captureSquare;
    if (move.enPassant) return `${move.to[0]}${move.from[1]}`;
    if (move.capture && typeof move.capture === 'object') return move.capture.square || move.to;
    if (typeof move.capture === 'string') return move.capture;
    return move.capture ? move.to : null;
}

export function applySemanticMove(currentPieces, move, allocateId = createIdentityAllocator(currentPieces)) {
    if (!move || !isSquare(move.from) || !isSquare(move.to) || move.from === move.to) {
        throw new CaissaBoardStateError('INVALID_MOVE_SHAPE', 'A semantic move requires distinct valid from/to squares.');
    }
    const source = currentPieces.find(piece => piece.square === move.from);
    if (!source) throw new CaissaBoardStateError('MISSING_SOURCE', `No presentation piece occupies ${move.from}.`);

    const destination = currentPieces.find(piece => piece.square === move.to);
    const captureSquare = captureSquareFor(move);
    if (destination && !captureSquare) {
        throw new CaissaBoardStateError('CAPTURE_SEMANTICS_REQUIRED', 'An occupied destination requires explicit capture semantics.');
    }
    if (captureSquare && !isSquare(captureSquare)) {
        throw new CaissaBoardStateError('INVALID_CAPTURE_SQUARE', 'Capture square is invalid.');
    }
    const captured = captureSquare ? currentPieces.find(piece => piece.square === captureSquare) : null;
    if (captureSquare && !captured) {
        throw new CaissaBoardStateError('MISSING_CAPTURE', `No presentation piece occupies ${captureSquare}.`);
    }
    if (captured && captured.color === source.color) {
        throw new CaissaBoardStateError('FRIENDLY_CAPTURE', 'Presentation reconciliation will not remove a same-color piece.');
    }

    const castleRook = inferCastleRook(move, source);
    const rook = castleRook ? currentPieces.find(piece => piece.square === castleRook.from) : null;
    if (castleRook && (!isSquare(castleRook.from) || !isSquare(castleRook.to)
        || !rook || rook.type !== 'R' || rook.color !== source.color)) {
        throw new CaissaBoardStateError('INVALID_CASTLE_ROOK', 'Castling rook presentation state is invalid.');
    }

    const promotion = move.promotion ? String(move.promotion).toUpperCase() : null;
    if (promotion && (source.type !== 'P' || !PROMOTION_TOKEN.test(promotion))) {
        throw new CaissaBoardStateError('INVALID_PROMOTION', 'Promotion requires a pawn and Q/R/B/N.');
    }

    const removed = [];
    const moved = [];
    const added = [];
    let pieces = currentPieces.filter(piece => {
        const shouldRemove = piece.id === source.id || piece.id === captured?.id || piece.id === rook?.id;
        if (piece.id === captured?.id) removed.push(piece);
        return !shouldRemove;
    });

    if (promotion) {
        removed.push(source);
        const code = `${source.color === 'white' ? 'w' : 'b'}${promotion}`;
        const promoted = { id: allocateId(code), code, color: source.color, type: promotion, square: move.to };
        pieces.push(promoted);
        added.push(promoted);
    } else {
        const movedSource = { ...source, square: move.to };
        pieces.push(movedSource);
        moved.push({ id: source.id, from: source.square, to: move.to, piece: movedSource });
    }

    if (rook) {
        const movedRook = { ...rook, square: castleRook.to };
        pieces.push(movedRook);
        moved.push({ id: rook.id, from: rook.square, to: castleRook.to, piece: movedRook });
    }

    const placement = serializePlacement(pieces);
    return Object.freeze({
        pieces: Object.freeze(pieces.sort((a, b) => squareIndex(a.square) - squareIndex(b.square))),
        moved: Object.freeze(moved), removed: Object.freeze(removed), added: Object.freeze(added), placement
    });
}
