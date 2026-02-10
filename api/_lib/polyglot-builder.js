import { Chess } from 'chess.js';
import { Polyglot } from 'chess-openings';

const MAX_WEIGHT = 65535;
const PROMOTION_MAP = { n: 1, b: 2, r: 3, q: 4 };
const ALLOWED_PGN_MIME = new Set([
    'application/x-chess-pgn',
    'application/vnd.chess-pgn',
    'text/plain',
    'application/octet-stream'
]);

const polyglotHasher = new Polyglot('[caissa-polyglot-hasher]');

export const DEFAULT_OPTIONS = {
    maxPly: 160,
    minCount: 1,
    normalize: 'cap',
    side: 'both'
};

export function sanitizeBaseFileName(inputName = 'caissa-book') {
    const justName = String(inputName).split(/[\\/]/).pop() || 'caissa-book';
    const noExt = justName.replace(/\.[^.]+$/, '');
    const cleaned = noExt
        .toLowerCase()
        .replace(/[^a-z0-9._-]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 64);
    return cleaned || 'caissa-book';
}

export function validatePgnMetadata(fileName, contentType) {
    const normalizedType = String(contentType || '').toLowerCase().trim();
    const lowerName = String(fileName || '').toLowerCase();
    const hasPgnExtension = lowerName.endsWith('.pgn');
    const mimeAllowed = !normalizedType || ALLOWED_PGN_MIME.has(normalizedType);

    if (!hasPgnExtension) {
        return { ok: false, error: 'Only .pgn files are accepted' };
    }

    if (!mimeAllowed) {
        return { ok: false, error: 'Unsupported file type. Please upload a PGN file' };
    }

    return { ok: true };
}

export function normalizeBuildOptions(rawOptions = {}) {
    const maxPlyInput = Number.parseInt(rawOptions.maxPly, 10);
    const minCountInput = Number.parseInt(rawOptions.minCount, 10);
    const normalizeInput = String(rawOptions.normalize || DEFAULT_OPTIONS.normalize).toLowerCase();
    const sideInput = String(rawOptions.side || DEFAULT_OPTIONS.side).toLowerCase();

    return {
        maxPly: Number.isFinite(maxPlyInput) ? Math.max(1, Math.min(1024, maxPlyInput)) : DEFAULT_OPTIONS.maxPly,
        minCount: Number.isFinite(minCountInput) ? Math.max(1, Math.min(1000, minCountInput)) : DEFAULT_OPTIONS.minCount,
        normalize: normalizeInput === 'none' ? 'none' : 'cap',
        side: ['both', 'white', 'black'].includes(sideInput) ? sideInput : DEFAULT_OPTIONS.side
    };
}

export function buildPolyglotBookFromPgn(pgnText, rawOptions = {}, timeoutMs = 90000) {
    const startedAt = Date.now();
    const deadline = startedAt + timeoutMs;
    const options = normalizeBuildOptions(rawOptions);
    const games = splitPgnIntoGames(pgnText);

    if (games.length === 0) {
        throw new Error('No PGN games were found in the uploaded file');
    }

    const aggregated = new Map();
    let parsedGames = 0;
    let totalMovesSeen = 0;
    let totalMovesConsidered = 0;

    for (const gameText of games) {
        enforceDeadline(deadline);

        const moves = parseGameMoves(gameText);
        if (!moves || moves.length === 0) continue;

        parsedGames += 1;
        totalMovesSeen += moves.length;

        const replay = new Chess();
        const halfMoveLimit = Math.min(options.maxPly, moves.length);

        for (let idx = 0; idx < halfMoveLimit; idx += 1) {
            enforceDeadline(deadline);

            const move = moves[idx];
            const turn = replay.turn();
            if (shouldIncludeSide(turn, options.side)) {
                const fenBeforeMove = replay.fen();
                const key = polyglotKeyFromFen(fenBeforeMove);
                const encodedMove = encodePolyglotMove(move);
                const mapKey = `${key.toString(16)}:${encodedMove}`;
                const record = aggregated.get(mapKey);

                if (record) {
                    record.count += 1;
                } else {
                    aggregated.set(mapKey, {
                        key,
                        move: encodedMove,
                        count: 1
                    });
                }
                totalMovesConsidered += 1;
            }

            replay.move({
                from: move.from,
                to: move.to,
                promotion: move.promotion
            });
        }
    }

    if (parsedGames === 0) {
        throw new Error('Could not parse any valid PGN games');
    }

    const filtered = [];
    for (const value of aggregated.values()) {
        if (value.count < options.minCount) continue;
        filtered.push({
            key: value.key,
            move: value.move,
            weight: normalizeWeight(value.count, options.normalize),
            learn: 0
        });
    }

    if (filtered.length === 0) {
        throw new Error('No opening moves matched the current filters');
    }

    filtered.sort((a, b) => {
        if (a.key < b.key) return -1;
        if (a.key > b.key) return 1;
        return a.move - b.move;
    });

    const outputBuffer = encodeEntriesToPolyglotBuffer(filtered);
    const elapsedMs = Date.now() - startedAt;

    return {
        buffer: outputBuffer,
        summary: {
            gamesFound: games.length,
            gamesParsed: parsedGames,
            inputMoves: totalMovesSeen,
            movesUsed: totalMovesConsidered,
            entriesWritten: filtered.length,
            outputBytes: outputBuffer.length,
            elapsedMs,
            options
        }
    };
}

function splitPgnIntoGames(pgnText) {
    const normalized = String(pgnText || '').replace(/\r\n/g, '\n').trim();
    if (!normalized) return [];

    if (/\[Event\s+"/.test(normalized)) {
        return normalized
            .split(/\n(?=\[Event\s+")/g)
            .map(part => part.trim())
            .filter(Boolean);
    }

    return [normalized];
}

function parseGameMoves(gamePgn) {
    try {
        const chess = new Chess();
        chess.loadPgn(gamePgn, { strict: false });
        return chess.history({ verbose: true });
    } catch {
        return null;
    }
}

function shouldIncludeSide(turn, sideOption) {
    if (sideOption === 'both') return true;
    if (sideOption === 'white') return turn === 'w';
    return turn === 'b';
}

function polyglotKeyFromFen(fen) {
    const key = polyglotHasher.getKey(fen);
    if (!key) {
        throw new Error('Failed to hash a board position');
    }
    const buffer = key.toBuffer();
    const high = buffer.readUInt32BE(0);
    const low = buffer.readUInt32BE(4);
    return (BigInt(high) << 32n) | BigInt(low);
}

function encodePolyglotMove(move) {
    let from = move.from;
    let to = move.to;

    if (from === 'e1' && to === 'g1') to = 'h1';
    if (from === 'e1' && to === 'c1') to = 'a1';
    if (from === 'e8' && to === 'g8') to = 'h8';
    if (from === 'e8' && to === 'c8') to = 'a8';

    const fromIndex = squareToIndex(from);
    const toIndex = squareToIndex(to);
    const promotionIndex = PROMOTION_MAP[move.promotion] || 0;

    return fromIndex | (toIndex << 6) | (promotionIndex << 12);
}

function squareToIndex(square) {
    const file = square.charCodeAt(0) - 97;
    const rank = Number.parseInt(square[1], 10) - 1;
    return (rank * 8) + file;
}

function normalizeWeight(count, normalizeMode) {
    if (normalizeMode === 'none') {
        return Math.min(count, MAX_WEIGHT);
    }
    return Math.min(count, MAX_WEIGHT);
}

function encodeEntriesToPolyglotBuffer(entries) {
    const output = Buffer.alloc(entries.length * 16);

    for (let idx = 0; idx < entries.length; idx += 1) {
        const entry = entries[idx];
        const offset = idx * 16;

        const high = Number((entry.key >> 32n) & 0xffffffffn);
        const low = Number(entry.key & 0xffffffffn);
        output.writeUInt32BE(high >>> 0, offset);
        output.writeUInt32BE(low >>> 0, offset + 4);
        output.writeUInt16BE(entry.move, offset + 8);
        output.writeUInt16BE(entry.weight, offset + 10);
        output.writeUInt32BE(entry.learn >>> 0, offset + 12);
    }

    return output;
}

function enforceDeadline(deadlineMs) {
    if (Date.now() > deadlineMs) {
        throw new Error('Build timed out. Try a smaller PGN or lower Max Ply');
    }
}
