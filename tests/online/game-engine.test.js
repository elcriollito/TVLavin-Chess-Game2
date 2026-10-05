import test from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import {
    applyAuthoritativeMove, projectClock, START_FEN, timeoutMatingPotential
} from '../../api/_lib/online-game-engine.js';

const NOW = Date.parse('2026-10-05T16:00:10.000Z');

function game(overrides = {}) {
    return {
        id: 'game-1', status: 'active', fen: START_FEN, initial_fen: START_FEN,
        moves: [], pgn: '', ply: 0, turn: 'white', version: 1,
        white_clerk_id: 'user_white', black_clerk_id: 'user_black',
        white_display_name: 'White', black_display_name: 'Black',
        white_time_ms: 180_000, black_time_ms: 180_000,
        white_can_mate: true, black_can_mate: true,
        base_ms: 180_000, increment_ms: 2_000,
        clock_started_at: '2026-10-05T16:00:00.000Z', created_at: '2026-10-05T16:00:00.000Z',
        ...overrides
    };
}

test('server rejects non-participants, wrong turns, stale versions, and illegal moves', () => {
    assert.equal(applyAuthoritativeMove(game(), 'intruder', { from: 'e2', to: 'e4', expectedVersion: 1 }, NOW).code, 'NOT_A_PARTICIPANT');
    assert.equal(applyAuthoritativeMove(game(), 'user_black', { from: 'e7', to: 'e5', expectedVersion: 1 }, NOW).code, 'NOT_YOUR_TURN');
    assert.equal(applyAuthoritativeMove(game(), 'user_white', { from: 'e2', to: 'e4', expectedVersion: 2 }, NOW).code, 'STALE_VERSION');
    assert.equal(applyAuthoritativeMove(game(), 'user_white', { from: 'e2', to: 'e5', expectedVersion: 1 }, NOW).code, 'ILLEGAL_MOVE');
});

test('server validates and projects an ordinary legal move with PGN', () => {
    const result = applyAuthoritativeMove(game(), 'user_white', { from: 'e2', to: 'e4', expectedVersion: 1 }, NOW);
    assert.equal(result.ok, true);
    assert.equal(result.value.move.san, 'e4');
    assert.equal(result.value.turn, 'black');
    assert.match(result.value.pgn, /1\. e4/);
    assert.equal(result.value.clock.whiteMs, 170_000);
    assert.deepEqual(
        { white: result.value.whiteCanMate, black: result.value.blackCanMate },
        { white: true, black: true }
    );
});

test('server supports castling, en passant, and underpromotion through chess.js', () => {
    const castle = applyAuthoritativeMove(game({
        fen: 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1', initial_fen: 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1'
    }), 'user_white', { from: 'e1', to: 'g1', expectedVersion: 1 }, NOW);
    assert.equal(castle.value.move.san, 'O-O');

    const passant = applyAuthoritativeMove(game({
        fen: '8/8/8/3pP3/8/8/8/4K2k w - d6 0 1', initial_fen: '8/8/8/3pP3/8/8/8/4K2k w - d6 0 1'
    }), 'user_white', { from: 'e5', to: 'd6', expectedVersion: 1 }, NOW);
    assert.equal(passant.ok, true);
    assert.match(passant.value.move.san, /^exd6/);

    const promotion = applyAuthoritativeMove(game({
        fen: '8/P7/8/8/8/8/7k/4K3 w - - 0 1', initial_fen: '8/P7/8/8/8/8/7k/4K3 w - - 0 1'
    }), 'user_white', { from: 'a7', to: 'a8', promotion: 'n', expectedVersion: 1 }, NOW);
    assert.equal(promotion.ok, true);
    assert.match(promotion.value.move.san, /=N/);
});

test('server recognizes checkmate and produces a final result', () => {
    const setup = new Chess();
    const history = ['f3', 'e5', 'g4'].map(san => {
        const move = setup.move(san);
        return { from: move.from, to: move.to, promotion: move.promotion, san: move.san };
    });
    const result = applyAuthoritativeMove(game({ fen: setup.fen(), moves: history, ply: 3, turn: 'black', version: 4 }),
        'user_black', { from: 'd8', to: 'h4', expectedVersion: 4 }, NOW);
    assert.equal(result.value.termination, 'checkmate');
    assert.equal(result.value.result, '0-1');
    assert.match(result.value.pgn, /0-1$/);
});

test('server recognizes stalemate, insufficient material, and threefold repetition', () => {
    const stalemate = applyAuthoritativeMove(game({
        fen: 'k7/8/1QK5/8/8/8/8/8 w - - 0 1', initial_fen: 'k7/8/1QK5/8/8/8/8/8 w - - 0 1'
    }), 'user_white', { from: 'b6', to: 'c7', expectedVersion: 1 }, NOW);
    assert.equal(stalemate.value.termination, 'stalemate');
    assert.equal(stalemate.value.result, '1/2-1/2');

    const insufficient = applyAuthoritativeMove(game({
        fen: '7k/8/8/8/8/8/1b6/K7 w - - 0 1', initial_fen: '7k/8/8/8/8/8/1b6/K7 w - - 0 1'
    }), 'user_white', { from: 'a1', to: 'b2', expectedVersion: 1 }, NOW);
    assert.equal(insufficient.value.termination, 'insufficient-material');

    const replay = new Chess();
    const history = ['Nf3', 'Nf6', 'Ng1', 'Ng8', 'Nf3', 'Nf6', 'Ng1'].map(san => {
        const move = replay.move(san);
        return { from: move.from, to: move.to, promotion: move.promotion, san: move.san };
    });
    const repetition = applyAuthoritativeMove(game({ fen: replay.fen(), moves: history, ply: 7, turn: 'black', version: 8 }),
        'user_black', { from: 'f6', to: 'g8', expectedVersion: 8 }, NOW);
    assert.equal(repetition.value.termination, 'repetition');
    assert.equal(repetition.value.result, '1/2-1/2');
});

test('server rejects a FEN that does not match the durable move history', () => {
    const corrupt = applyAuthoritativeMove(game({ moves: [{ from: 'e2', to: 'e4' }], ply: 1 }),
        'user_white', { from: 'd2', to: 'd4', expectedVersion: 1 }, NOW);
    assert.equal(corrupt.code, 'CORRUPT_CANONICAL_POSITION');
});

test('clock projection uses only the server anchor and detects expiration', () => {
    const active = projectClock(game(), NOW);
    assert.deepEqual({ whiteMs: active.whiteMs, blackMs: active.blackMs, timedOut: active.timedOut }, { whiteMs: 170_000, blackMs: 180_000, timedOut: false });
    const expired = projectClock(game({ white_time_ms: 9_000 }), NOW);
    assert.equal(expired.timedOut, true);
    assert.equal(expired.timeoutResult.result, '0-1');
    const drawnFlag = projectClock(game({ white_time_ms: 9_000, black_can_mate: false }), NOW);
    assert.equal(drawnFlag.timeoutResult.result, '1/2-1/2');
});

test('timeout mating potential distinguishes a bare king from possible mating material', () => {
    const bareKings = timeoutMatingPotential(new Chess('4k3/8/8/8/8/8/8/4K3 w - - 0 1'));
    assert.deepEqual(bareKings, { white: false, black: false });
    const loneBishop = timeoutMatingPotential(new Chess('4k3/8/8/8/8/8/8/3BK3 w - - 0 1'));
    assert.deepEqual(loneBishop, { white: false, black: false });
    const rook = timeoutMatingPotential(new Chess('4k3/8/8/8/8/8/8/3RK3 w - - 0 1'));
    assert.equal(rook.white, true);
});
