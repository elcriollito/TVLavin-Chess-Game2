import { Chess } from '../assets/vendor/chess.js/chess-1.4.0.esm.js';
import { getPolyglotRandomArray } from './polyglot-random.js';

export const DEFAULT_POLYGLOT_OPTIONS = Object.freeze({
    maxPly: 160,
    minCount: 1,
    side: 'both',
    memoryBudgetBytes: 128 * 1024 * 1024
});

export const MAX_GAME_TEXT_BYTES = 8 * 1024 * 1024;
const MAX_WEIGHT = 65535;
const ESTIMATED_RECORD_BYTES = 112;
const PROMOTION_MAP = Object.freeze({ n: 1, b: 2, r: 3, q: 4 });
const PIECE_INDEX = Object.freeze({
    p: 0, P: 1,
    n: 2, N: 3,
    b: 4, B: 5,
    r: 6, R: 7,
    q: 8, Q: 9,
    k: 10, K: 11
});

export function normalizePolyglotOptions(rawOptions = {}) {
    const maxPly = Number.parseInt(rawOptions.maxPly, 10);
    const minCount = Number.parseInt(rawOptions.minCount, 10);
    const memoryBudgetBytes = Number.parseInt(rawOptions.memoryBudgetBytes, 10);
    const side = String(rawOptions.side || DEFAULT_POLYGLOT_OPTIONS.side).toLowerCase();

    return {
        maxPly: Number.isFinite(maxPly) ? Math.max(1, Math.min(1024, maxPly)) : DEFAULT_POLYGLOT_OPTIONS.maxPly,
        minCount: Number.isFinite(minCount) ? Math.max(1, Math.min(1000, minCount)) : DEFAULT_POLYGLOT_OPTIONS.minCount,
        side: ['both', 'white', 'black'].includes(side) ? side : DEFAULT_POLYGLOT_OPTIONS.side,
        memoryBudgetBytes: Number.isFinite(memoryBudgetBytes)
            ? Math.max(32 * 1024 * 1024, Math.min(256 * 1024 * 1024, memoryBudgetBytes))
            : DEFAULT_POLYGLOT_OPTIONS.memoryBudgetBytes
    };
}

export function sanitizePolyglotBaseName(inputName = 'caissa-book') {
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

export function polyglotKeyFromFen(fen) {
    const parts = String(fen || '').trim().split(/\s+/);
    if (parts.length < 4) throw new Error('Invalid FEN for Polyglot hashing');

    const random = getPolyglotRandomArray();
    const board = parseFenBoard(parts[0]);
    let key = 0n;

    for (let square = 0; square < board.length; square += 1) {
        const piece = board[square];
        if (!piece) continue;
        const pieceIndex = PIECE_INDEX[piece];
        if (pieceIndex === undefined) throw new Error(`Unsupported FEN piece: ${piece}`);
        key ^= random[(pieceIndex * 64) + square];
    }

    const castling = parts[2];
    if (castling.includes('K')) key ^= random[768];
    if (castling.includes('Q')) key ^= random[769];
    if (castling.includes('k')) key ^= random[770];
    if (castling.includes('q')) key ^= random[771];

    const epSquare = parts[3];
    if (epSquare !== '-' && hasPolyglotEnPassantCapture(board, parts[1], epSquare)) {
        key ^= random[772 + (epSquare.charCodeAt(0) - 97)];
    }

    // The Polyglot side key is present when White is to move.
    if (parts[1] === 'w') key ^= random[780];
    return key;
}

export function encodePolyglotMove(move) {
    let from = move.from;
    let to = move.to;

    if (from === 'e1' && to === 'g1') to = 'h1';
    if (from === 'e1' && to === 'c1') to = 'a1';
    if (from === 'e8' && to === 'g8') to = 'h8';
    if (from === 'e8' && to === 'c8') to = 'a8';

    const promotion = PROMOTION_MAP[move.promotion] || 0;
    return squareToIndex(to) | (squareToIndex(from) << 6) | (promotion << 12);
}

export class PolyglotBookBuilder {
    constructor(rawOptions = {}, runtime = {}) {
        this.options = normalizePolyglotOptions(rawOptions);
        this.deadlineAt = Number.isFinite(runtime.deadlineAt) ? runtime.deadlineAt : null;
        this.records = new Map();
        this.summary = {
            gamesFound: 0,
            gamesParsed: 0,
            gamesSkipped: 0,
            inputMoves: 0,
            movesUsed: 0,
            entriesWritten: 0,
            outputBytes: 0,
            estimatedMemoryBytes: 0,
            errors: []
        };
        this.startedAt = performanceNow();
    }

    addGame(gamePgn) {
        this.enforceDeadline();
        this.summary.gamesFound += 1;
        const gameNumber = this.summary.gamesFound;
        let countedAsParsed = false;

        if (utf8Length(gamePgn) > MAX_GAME_TEXT_BYTES) {
            this.skipGame(gameNumber, 'Game text exceeded the 8 MiB per-game safety limit');
            return false;
        }

        try {
            const parsed = new Chess();
            parsed.loadPgn(String(gamePgn || ''), { strict: false });
            const moves = parsed.history({ verbose: true });
            if (!moves.length) {
                this.skipGame(gameNumber, 'No legal mainline moves were found');
                return false;
            }

            while (parsed.undo()) {
                // Rewind to the actual PGN starting position, including valid FEN starts.
            }
            const replay = new Chess(parsed.fen());
            const limit = Math.min(this.options.maxPly, moves.length);
            this.summary.gamesParsed += 1;
            countedAsParsed = true;
            this.summary.inputMoves += moves.length;

            for (let index = 0; index < limit; index += 1) {
                this.enforceDeadline();
                const move = moves[index];
                const turn = replay.turn();
                if (shouldIncludeSide(turn, this.options.side)) {
                    this.addRecord(polyglotKeyFromFen(replay.fen()), encodePolyglotMove(move));
                    this.summary.movesUsed += 1;
                }

                const applied = replay.move({ from: move.from, to: move.to, promotion: move.promotion });
                if (!applied) throw new Error(`Could not replay move ${index + 1}`);
            }
            return true;
        } catch (error) {
            if (error?.code === 'POLYGLOT_MEMORY_BUDGET') throw error;
            if (countedAsParsed) this.summary.gamesParsed = Math.max(0, this.summary.gamesParsed - 1);
            this.skipGame(gameNumber, error instanceof Error ? error.message : 'Malformed PGN');
            return false;
        }
    }

    addRecord(key, move) {
        const id = `${key.toString(16).padStart(16, '0')}:${move}`;
        const current = this.records.get(id);
        if (current) {
            current.count = Math.min(MAX_WEIGHT, current.count + 1);
            return;
        }

        const nextEstimatedBytes = (this.records.size + 1) * ESTIMATED_RECORD_BYTES;
        if (nextEstimatedBytes > this.options.memoryBudgetBytes) {
            const error = new Error('This PGN creates too many unique book records for the online memory budget. Use CAISSA Book Creator Portable.');
            error.code = 'POLYGLOT_MEMORY_BUDGET';
            throw error;
        }

        this.records.set(id, { key, move, count: 1 });
        this.summary.estimatedMemoryBytes = nextEstimatedBytes;
    }

    enforceDeadline() {
        if (this.deadlineAt !== null && Date.now() > this.deadlineAt) {
            throw new Error('Build timed out. Try a smaller PGN or lower maximum plies.');
        }
    }

    skipGame(gameNumber, reason) {
        this.summary.gamesSkipped += 1;
        if (this.summary.errors.length < 20) {
            this.summary.errors.push({ game: gameNumber, reason: String(reason || 'Malformed PGN').slice(0, 240) });
        }
    }

    progress() {
        return {
            gamesFound: this.summary.gamesFound,
            gamesParsed: this.summary.gamesParsed,
            gamesSkipped: this.summary.gamesSkipped,
            movesUsed: this.summary.movesUsed,
            uniqueRecords: this.records.size,
            estimatedMemoryBytes: this.summary.estimatedMemoryBytes
        };
    }

    finish() {
        if (this.summary.gamesParsed === 0) {
            throw new Error('Could not parse any valid PGN games');
        }

        const entries = [];
        for (const record of this.records.values()) {
            if (record.count < this.options.minCount) continue;
            entries.push({ key: record.key, move: record.move, weight: Math.min(record.count, MAX_WEIGHT), learn: 0 });
        }

        if (!entries.length) throw new Error('No opening moves matched the current filters');
        entries.sort((left, right) => left.key < right.key ? -1 : left.key > right.key ? 1 : left.move - right.move);

        const buffer = encodePolyglotEntries(entries);
        this.summary.entriesWritten = entries.length;
        this.summary.outputBytes = buffer.byteLength;
        this.summary.elapsedMs = Math.round(performanceNow() - this.startedAt);
        this.summary.options = { ...this.options };
        return { buffer, summary: { ...this.summary } };
    }
}

export class PgnStreamSplitter {
    constructor(onGame) {
        this.onGame = onGame;
        this.pending = '';
        this.lines = [];
        this.seenMovetext = false;
        this.completedResult = false;
        this.braceComment = false;
        this.variationDepth = 0;
    }

    push(text) {
        const normalized = `${this.pending}${String(text || '')}`.replace(/\r\n?/g, '\n');
        const lines = normalized.split('\n');
        this.pending = lines.pop() || '';
        for (const line of lines) this.consumeLine(line);
    }

    finish() {
        if (this.pending) this.consumeLine(this.pending);
        this.pending = '';
        this.emitCurrent();
    }

    consumeLine(line) {
        const isHeader = !this.braceComment && this.variationDepth === 0 && /^\s*\[[A-Za-z0-9_]+\s+"(?:[^"\\]|\\.)*"\]\s*$/.test(line);
        const analyzed = isHeader ? '' : this.mainlineText(line);
        const hasMovetext = analyzed.trim().length > 0;

        if ((isHeader && this.seenMovetext) || (this.completedResult && (isHeader || hasMovetext))) {
            this.emitCurrent();
        }

        this.lines.push(line);
        if (hasMovetext) {
            this.seenMovetext = true;
            if (/(?:^|\s)(?:1-0|0-1|1\/2-1\/2|\*)(?=\s|$)/.test(analyzed)) this.completedResult = true;
        }
    }

    mainlineText(line) {
        let output = '';
        let semicolonComment = false;
        for (const char of line) {
            if (semicolonComment) continue;
            if (this.braceComment) {
                if (char === '}') this.braceComment = false;
                continue;
            }
            if (char === ';' && this.variationDepth === 0) {
                semicolonComment = true;
                continue;
            }
            if (char === '{') {
                this.braceComment = true;
                continue;
            }
            if (char === '(') {
                this.variationDepth += 1;
                continue;
            }
            if (char === ')' && this.variationDepth > 0) {
                this.variationDepth -= 1;
                continue;
            }
            if (this.variationDepth === 0) output += char;
        }
        return output;
    }

    emitCurrent() {
        const game = this.lines.join('\n').trim();
        this.lines = [];
        this.seenMovetext = false;
        this.completedResult = false;
        this.braceComment = false;
        this.variationDepth = 0;
        if (game) this.onGame(game);
    }
}

export function buildPolyglotBookFromText(pgnText, options = {}, runtime = {}) {
    const builder = new PolyglotBookBuilder(options, runtime);
    const splitter = new PgnStreamSplitter(game => builder.addGame(game));
    splitter.push(String(pgnText || ''));
    splitter.finish();
    return builder.finish();
}

function parseFenBoard(placement) {
    const board = new Array(64).fill(null);
    const ranks = placement.split('/');
    if (ranks.length !== 8) throw new Error('Invalid FEN board');

    for (let fenRank = 0; fenRank < 8; fenRank += 1) {
        let file = 0;
        for (const token of ranks[fenRank]) {
            if (/^[1-8]$/.test(token)) {
                file += Number(token);
            } else {
                if (PIECE_INDEX[token] === undefined || file > 7) throw new Error('Invalid FEN board');
                const rank = 7 - fenRank;
                board[(rank * 8) + file] = token;
                file += 1;
            }
        }
        if (file !== 8) throw new Error('Invalid FEN board');
    }
    return board;
}

function hasPolyglotEnPassantCapture(board, turn, epSquare) {
    if (!/^[a-h][36]$/.test(epSquare)) return false;
    const file = epSquare.charCodeAt(0) - 97;
    const pawnRank = turn === 'w' ? 4 : 3;
    const pawn = turn === 'w' ? 'P' : 'p';
    return [file - 1, file + 1].some(candidate => candidate >= 0 && candidate < 8 && board[(pawnRank * 8) + candidate] === pawn);
}

function squareToIndex(square) {
    if (!/^[a-h][1-8]$/.test(String(square || ''))) throw new Error(`Invalid chess square: ${square}`);
    return ((Number(square[1]) - 1) * 8) + (square.charCodeAt(0) - 97);
}

function shouldIncludeSide(turn, side) {
    return side === 'both' || (side === 'white' && turn === 'w') || (side === 'black' && turn === 'b');
}

function encodePolyglotEntries(entries) {
    const bytes = new ArrayBuffer(entries.length * 16);
    const view = new DataView(bytes);
    entries.forEach((entry, index) => {
        const offset = index * 16;
        view.setBigUint64(offset, entry.key, false);
        view.setUint16(offset + 8, entry.move, false);
        view.setUint16(offset + 10, entry.weight, false);
        view.setUint32(offset + 12, entry.learn, false);
    });
    return bytes;
}

function utf8Length(value) {
    return new TextEncoder().encode(String(value || '')).byteLength;
}

function performanceNow() {
    return typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now();
}
