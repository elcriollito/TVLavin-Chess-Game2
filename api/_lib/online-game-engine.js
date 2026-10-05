import { Chess } from 'chess.js';

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
export const MAX_GAME_PLIES = 6000;

export function applyAuthoritativeMove(game, actorClerkId, intent, now = Date.now()) {
    if (!game || game.status !== 'active') return reject('GAME_NOT_ACTIVE');
    const color = participantColor(game, actorClerkId);
    if (!color) return reject('NOT_A_PARTICIPANT');
    if (game.turn !== color) return reject('NOT_YOUR_TURN');
    if (Number(intent.expectedVersion) !== Number(game.version)) return reject('STALE_VERSION');

    const clock = projectClock(game, now);
    if (clock.timedOut) {
        return Object.freeze({ ok: false, code: 'TIME_EXPIRED', timeout: clock.timeoutResult });
    }

    let chess;
    try { chess = replayCanonicalGame(game); }
    catch (_) { return reject('CORRUPT_CANONICAL_POSITION'); }
    if (Number(game.ply || 0) >= MAX_GAME_PLIES) return reject('GAME_LIMIT_REACHED');

    let move;
    try {
        move = chess.move({ from: intent.from, to: intent.to, promotion: intent.promotion || 'q' });
    } catch (_) {
        move = null;
    }
    if (!move) return reject('ILLEGAL_MOVE');

    const termination = determineTermination(chess);
    const result = termination ? resultFor(chess, termination) : null;
    const nextTurn = chess.turn() === 'w' ? 'white' : 'black';
    const matingPotential = timeoutMatingPotential(chess);
    const moveRecord = Object.freeze({
        ply: Number(game.ply || 0) + 1,
        from: move.from,
        to: move.to,
        promotion: move.promotion || null,
        san: move.san,
        uci: `${move.from}${move.to}${move.promotion || ''}`,
        color,
        serverTimestamp: new Date(now).toISOString()
    });
    const pgn = buildPgn(game, moveRecord, result);
    return Object.freeze({
        ok: true,
        value: Object.freeze({
            move: moveRecord,
            fen: chess.fen(),
            turn: nextTurn,
            result,
            termination,
            pgn,
            whiteCanMate: matingPotential.white,
            blackCanMate: matingPotential.black,
            clock
        })
    });
}

function replayCanonicalGame(game) {
    const chess = new Chess(game.initial_fen || START_FEN);
    const moves = Array.isArray(game.moves) ? game.moves : [];
    if (moves.length > MAX_GAME_PLIES || Number(game.ply || 0) > MAX_GAME_PLIES) {
        throw new Error('Stored move history exceeds the supported game bound.');
    }
    for (const item of moves) {
        const applied = chess.move({ from: item.from, to: item.to, promotion: item.promotion || 'q' });
        if (!applied) throw new Error('Stored move history is not replayable.');
    }
    if (chess.fen() !== game.fen) throw new Error('Stored position does not match move history.');
    return chess;
}

export function projectClock(game, now = Date.now()) {
    let whiteMs = Math.max(0, Number(game.white_time_ms));
    let blackMs = Math.max(0, Number(game.black_time_ms));
    if (game.status !== 'active' || !game.clock_started_at) {
        return Object.freeze({ whiteMs, blackMs, elapsedMs: 0, timedOut: false, timeoutResult: null });
    }
    const started = Date.parse(game.clock_started_at);
    const elapsedMs = Number.isFinite(started) ? Math.max(0, Math.floor(now - started)) : 0;
    if (game.turn === 'white') whiteMs = Math.max(0, whiteMs - elapsedMs);
    else blackMs = Math.max(0, blackMs - elapsedMs);
    const timedOut = game.turn === 'white' ? whiteMs <= 0 : blackMs <= 0;
    return Object.freeze({
        whiteMs,
        blackMs,
        elapsedMs,
        timedOut,
        timeoutResult: timedOut ? Object.freeze({
            result: timeoutResult(game),
            termination: 'timeout'
        }) : null
    });
}

export function timeoutMatingPotential(chess) {
    const pieces = chess.board().flat().filter(Boolean);
    return Object.freeze({
        white: colorCanPossiblyMate(pieces, 'w'),
        black: colorCanPossiblyMate(pieces, 'b')
    });
}

function colorCanPossiblyMate(pieces, color) {
    const own = pieces.filter(piece => piece.color === color && piece.type !== 'k');
    if (!own.length) return false;
    if (own.some(piece => ['p', 'r', 'q'].includes(piece.type)) || own.length >= 2) return true;
    // A lone bishop or knight cannot mate a bare king. An opposing piece can
    // participate in a legal self-blocking mating position, so retain a win.
    return pieces.some(piece => piece.color !== color && piece.type !== 'k');
}

function timeoutResult(game) {
    if (game.turn === 'white') return game.black_can_mate === false ? '1/2-1/2' : '0-1';
    return game.white_can_mate === false ? '1/2-1/2' : '1-0';
}

export function participantColor(game, clerkId) {
    if (clerkId === game.white_clerk_id) return 'white';
    if (clerkId === game.black_clerk_id) return 'black';
    return null;
}

function determineTermination(chess) {
    if (chess.isCheckmate()) return 'checkmate';
    if (chess.isStalemate()) return 'stalemate';
    if (chess.isThreefoldRepetition()) return 'repetition';
    if (chess.isInsufficientMaterial()) return 'insufficient-material';
    if (chess.isDraw()) return 'draw';
    return null;
}

function resultFor(chess, termination) {
    if (termination !== 'checkmate') return '1/2-1/2';
    return chess.turn() === 'w' ? '0-1' : '1-0';
}

function buildPgn(game, move, result) {
    const chess = new Chess(game.initial_fen || START_FEN);
    chess.header(
        'Event', game.tournament_id ? 'CAISSA Online Tournament' : 'CAISSA Online',
        'Site', 'caissa-chess.org',
        'Date', new Date(game.created_at || Date.now()).toISOString().slice(0, 10).replaceAll('-', '.'),
        'Round', '-',
        'White', game.white_display_name || 'White',
        'Black', game.black_display_name || 'Black',
        'Result', result || '*',
        'TimeControl', `${Math.floor(Number(game.base_ms) / 1000)}+${Math.floor(Number(game.increment_ms) / 1000)}`,
        'CAISSAProtocol', String(game.protocol_version || '1.0.0')
    );
    for (const item of [...(Array.isArray(game.moves) ? game.moves : []), move]) {
        const applied = chess.move({ from: item.from, to: item.to, promotion: item.promotion || 'q' });
        if (!applied) throw new Error('Stored move history is not replayable.');
    }
    return chess.pgn({ maxWidth: 88, newline: '\n' });
}

function reject(code) {
    return Object.freeze({ ok: false, code });
}
