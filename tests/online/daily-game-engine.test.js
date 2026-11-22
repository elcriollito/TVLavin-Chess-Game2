import test from 'node:test';
import assert from 'node:assert/strict';
import { applyAuthoritativeDailyMove, START_FEN } from '../../api/_lib/online-game-engine.js';

function game(overrides = {}) {
    return {
        id: '00000000-0000-4000-8000-000000000001', status: 'active', pool: 'daily',
        white_clerk_id: 'white', black_clerk_id: 'black', white_display_name: 'White', black_display_name: 'Black',
        white_user_id: 'w', black_user_id: 'b', initial_fen: START_FEN, fen: START_FEN,
        moves: [], pgn: '', ply: 0, turn: 'white', version: 1, days_per_move: 7,
        move_deadline_at: '2026-11-27T12:00:00Z', white_can_mate: true, black_can_mate: true,
        created_at: '2026-11-20T12:00:00Z', ...overrides
    };
}

test('Daily move uses the legal engine and atomically projects the next deadline', () => {
    const result = applyAuthoritativeDailyMove(game(), 'white', {
        from: 'e2', to: 'e4', promotion: null, expectedVersion: 1
    }, Date.parse('2026-11-20T12:00:00Z'));
    assert.equal(result.ok, true);
    assert.equal(result.value.move.san, 'e4');
    assert.equal(result.value.nextDeadlineAt, '2026-11-27T12:00:00.000Z');
    assert.match(result.value.pgn, /\[TimeControl "7\/86400"\]/);
});

test('Daily move rejects stale, illegal, unauthorized and expired requests', () => {
    assert.equal(applyAuthoritativeDailyMove(game(), 'other', { from: 'e2', to: 'e4', expectedVersion: 1 }, Date.now()).code,
        'NOT_A_PARTICIPANT');
    assert.equal(applyAuthoritativeDailyMove(game(), 'white', { from: 'e2', to: 'e4', expectedVersion: 2 }, Date.now()).code,
        'STALE_VERSION');
    assert.equal(applyAuthoritativeDailyMove(game(), 'white', { from: 'e2', to: 'e5', expectedVersion: 1 }, Date.parse('2026-11-20T12:00:00Z')).code,
        'ILLEGAL_MOVE');
    const expired = applyAuthoritativeDailyMove(game(), 'white', { from: 'e2', to: 'e4', expectedVersion: 1 },
        Date.parse('2026-11-27T12:00:00Z'));
    assert.equal(expired.timeout.result, '0-1');
});
