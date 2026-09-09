/**
 * Analyze V2 Setup Position draft model.
 * Plain placement metadata only: no Chess, board, PGN, FEN, or engine ownership.
 */
(function installAnalyzeSetupDraft(global) {
    'use strict';

    const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    const FILES = 'abcdefgh';
    const PIECES = new Set(['wP', 'wB', 'wN', 'wR', 'wQ', 'wK', 'bP', 'bB', 'bN', 'bR', 'bQ', 'bK']);
    const CASTLING_KEYS = Object.freeze(['K', 'Q', 'k', 'q']);

    const clonePosition = position => Object.fromEntries(Object.entries(position || {}));

    function parsePlacement(placement) {
        const ranks = String(placement || '').split('/');
        if (ranks.length !== 8) return { ok: false, error: 'FEN must contain exactly eight ranks.' };
        const position = {};
        for (let rankIndex = 0; rankIndex < ranks.length; rankIndex += 1) {
            let fileIndex = 0;
            for (const token of ranks[rankIndex]) {
                if (/^[1-8]$/.test(token)) {
                    fileIndex += Number(token);
                    continue;
                }
                if (!/^[prnbqkPRNBQK]$/.test(token) || fileIndex > 7) {
                    return { ok: false, error: `Invalid piece placement on rank ${8 - rankIndex}.` };
                }
                const color = token === token.toUpperCase() ? 'w' : 'b';
                position[`${FILES[fileIndex]}${8 - rankIndex}`] = `${color}${token.toUpperCase()}`;
                fileIndex += 1;
            }
            if (fileIndex !== 8) return { ok: false, error: `Rank ${8 - rankIndex} must contain eight squares.` };
        }
        return { ok: true, position };
    }

    function placementToFen(position) {
        const ranks = [];
        for (let rank = 8; rank >= 1; rank -= 1) {
            let empty = 0;
            let output = '';
            for (const file of FILES) {
                const piece = position[`${file}${rank}`];
                if (!piece) {
                    empty += 1;
                    continue;
                }
                if (empty) output += String(empty);
                empty = 0;
                const symbol = piece[1];
                output += piece[0] === 'w' ? symbol : symbol.toLowerCase();
            }
            if (empty) output += String(empty);
            ranks.push(output);
        }
        return ranks.join('/');
    }

    function parseFen(fen, { requireKings = false } = {}) {
        const fields = String(fen || '').trim().split(/\s+/);
        if (fields.length !== 6) return { ok: false, error: 'FEN must contain all six fields.' };
        const [placement, turn, castling, enPassant, halfmoveText, fullmoveText] = fields;
        const parsedPlacement = parsePlacement(placement);
        if (!parsedPlacement.ok) return parsedPlacement;
        if (!/^[wb]$/.test(turn)) return { ok: false, error: 'Side to move must be w or b.' };
        if (!/^(?:-|K?Q?k?q?)$/.test(castling) || castling === '') {
            return { ok: false, error: 'Castling rights must use KQkq order or -.' };
        }
        if (!/^(?:-|[a-h][36])$/.test(enPassant)) return { ok: false, error: 'Invalid en passant square.' };
        if (!/^\d+$/.test(halfmoveText)) return { ok: false, error: 'Halfmove clock must be zero or greater.' };
        if (!/^[1-9]\d*$/.test(fullmoveText)) return { ok: false, error: 'Fullmove number must be one or greater.' };

        const pieces = Object.values(parsedPlacement.position);
        const whiteKings = pieces.filter(piece => piece === 'wK').length;
        const blackKings = pieces.filter(piece => piece === 'bK').length;
        if (requireKings && (whiteKings !== 1 || blackKings !== 1)) {
            return { ok: false, error: 'Position must contain exactly one White king and one Black king.' };
        }
        return {
            ok: true,
            value: {
                position: parsedPlacement.position,
                turn,
                castling: new Set(castling === '-' ? [] : castling.split('')),
                enPassant,
                halfmove: Number(halfmoveText),
                fullmove: Number(fullmoveText)
            }
        };
    }

    function create({ fen = START_FEN } = {}) {
        let parsed = parseFen(fen);
        if (!parsed.ok) parsed = parseFen(START_FEN);
        let state = parsed.value;

        const api = {
            position() {
                return clonePosition(state.position);
            },
            getPiece(square) {
                return state.position[square] || null;
            },
            setPiece(square, piece) {
                if (!/^[a-h][1-8]$/.test(square) || !PIECES.has(piece)) return false;
                state.position[square] = piece;
                state.enPassant = '-';
                state.halfmove = 0;
                return true;
            },
            movePiece(source, target) {
                if (!/^[a-h][1-8]$/.test(source) || !/^[a-h][1-8]$/.test(target)) return false;
                const piece = state.position[source];
                if (!piece) return false;
                delete state.position[source];
                state.position[target] = piece;
                state.enPassant = '-';
                state.halfmove = 0;
                return true;
            },
            removePiece(square) {
                if (!state.position[square]) return false;
                delete state.position[square];
                state.enPassant = '-';
                state.halfmove = 0;
                return true;
            },
            setTurn(turn) {
                if (!/^[wb]$/.test(turn)) return false;
                state.turn = turn;
                return true;
            },
            setCastling(key, enabled) {
                if (!CASTLING_KEYS.includes(key)) return false;
                if (enabled) state.castling.add(key);
                else state.castling.delete(key);
                return true;
            },
            hasCastling(key) {
                return state.castling.has(key);
            },
            replaceFen(nextFen, options = {}) {
                const next = parseFen(nextFen, options);
                if (!next.ok) return next;
                state = next.value;
                return { ok: true, fen: api.toFen() };
            },
            clear() {
                state = {
                    position: {}, turn: 'w', castling: new Set(), enPassant: '-', halfmove: 0, fullmove: 1
                };
                return api.toFen();
            },
            reset() {
                state = parseFen(START_FEN).value;
                return api.toFen();
            },
            toFen() {
                const castling = CASTLING_KEYS.filter(key => state.castling.has(key)).join('') || '-';
                return `${placementToFen(state.position)} ${state.turn} ${castling} ${state.enPassant} ${state.halfmove} ${state.fullmove}`;
            },
            validate({ requireKings = true } = {}) {
                return parseFen(api.toFen(), { requireKings });
            }
        };
        return api;
    }

    global.CaissaAnalyzeSetupDraft = Object.freeze({ START_FEN, create, parseFen });
})(window);
