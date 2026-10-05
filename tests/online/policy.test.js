import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { calculateRatingPair, RATING_POLICY } from '../../api/_lib/online-rating.js';
import { assignColors, canMatch, ratingWindow } from '../../api/_lib/online-matchmaking.js';
import { formatClock, projectOnlineClock } from '../../js/online/online-clock.js';
import { calculateStandings, selectMultiboardGames, tournamentPoints } from '../../js/online/online-tournaments.js';

test('CAISSA Elo policy is deterministic, symmetric for equal ratings, and bounded', () => {
    const result = calculateRatingPair({ rating: 1500, games: 0 }, { rating: 1500, games: 0 }, '1-0');
    assert.equal(result.algorithm, 'caissa-elo-v1');
    assert.deepEqual([result.white.delta, result.black.delta], [20, -20]);
    assert.equal(RATING_POLICY.abortedRated, false);
});

test('matchmaking widens predictably and never pairs incompatible pools', () => {
    assert.equal(ratingWindow(0), 100);
    assert.equal(ratingWindow(45_000), 250);
    assert.equal(ratingWindow(999_000), 600);
    const base = { state: 'queued', pool: 'blitz', rated: false, baseMs: 180_000, incrementMs: 2_000, createdAt: 0 };
    assert.equal(canMatch({ ...base, userId: 'a', rating: 1400 }, { ...base, userId: 'b', rating: 1600 }, 45_000), true);
    assert.equal(canMatch({ ...base, userId: 'a', rating: 1400 }, { ...base, userId: 'b', pool: 'rapid', rating: 1400 }, 45_000), false);
    assert.deepEqual(assignColors({ userId: 'a' }, { userId: 'b' }, 0.2), { whiteUserId: 'a', blackUserId: 'b' });
});

test('client clock interpolation and multiboard selection are presentation-only', () => {
    const clock = projectOnlineClock({ status: 'active', turn: 'black', white_time_ms: 60_000, black_time_ms: 60_000, clock_started_at: '2026-01-01T00:00:00Z' }, Date.parse('2026-01-01T00:00:02Z'));
    assert.equal(clock.blackMs, 58_000);
    assert.equal(formatClock(19_950), '19.9');
    assert.deepEqual(selectMultiboardGames([{ id: 2, status: 'completed', fen: 'x' }, { id: 1, status: 'active', fen: 'x', featured: true }]).map(item => item.id), [1]);
});

test('tournament scoring ranks by points then wins deterministically', () => {
    assert.equal(tournamentPoints('1/2-1/2', 'black'), 0.5);
    const standings = calculateStandings([
        { id: 'a', displayName: 'Alex' }, { id: 'b', displayName: 'Bea' }, { id: 'c', displayName: 'Cory' }
    ], [
        { whiteUserId: 'a', blackUserId: 'b', result: '1-0' },
        { whiteUserId: 'b', blackUserId: 'c', result: '1/2-1/2' },
        { whiteUserId: 'c', blackUserId: 'a', result: '1/2-1/2' }
    ]);
    assert.deepEqual(standings.map(row => [row.id, row.score]), [['a', 1.5], ['c', 1], ['b', 0.5]]);
});

test('migration keeps writes behind service-role RPCs and private Realtime authorization', () => {
    const sql = fs.readFileSync(new URL('../../supabase/migrations/20261005204209_caissa_online_native_v1.sql', import.meta.url), 'utf8');
    for (const table of ['profiles', 'ratings', 'matchmaking_tickets', 'games', 'game_events', 'presence', 'rate_limits', 'challenges', 'tournaments']) {
        assert.match(sql, new RegExp(`alter table public\\.caissa_online_${table} enable row level security`, 'i'));
    }
    assert.match(sql, /revoke all on function public\.caissa_online_commit_move[\s\S]+from public, anon, authenticated/i);
    assert.match(sql, /grant execute on function public\.caissa_online_commit_move[\s\S]+to service_role/i);
    assert.match(sql, /grant usage on schema caissa_online_private to service_role/i);
    assert.match(sql, /grant execute on function public\.caissa_online_check_rate_limit[\s\S]+to service_role/i);
    assert.match(sql, /if exists\(select 1 from public\.caissa_online_game_events where game_id = p_game_id and event_id = p_event_id\)/i);
    assert.match(sql, /rating_processed_at is not null or v_game\.result is null then return/i);
    assert.match(sql, /v_actor is distinct from v_challenge\.challenged_user_id/i);
    assert.match(sql, /pg_advisory_xact_lock[\s\S]+701001/i);
    assert.match(sql, /if v_ticket\.id is null then[\s\S]+returning \* into v_ticket/i);
    assert.match(sql, /select \* into v_opponent[\s\S]+limit 1 for update skip locked/i);
    assert.match(sql, /if v_game\.clock_started_at is not null[\s\S]+elsif p_reason = 'agreement'/i);
    assert.match(sql, /caissa_online_private\.timeout_result/i);
    assert.match(sql, /jsonb_array_length\(moves\) <= 6000/i);
    assert.match(sql, /realtime\.broadcast_changes/i);
    assert.match(sql, /realtime\.topic\(\)\) like 'online-game:%'[\s\S]+game\.id::text = split_part/i);
    assert.doesNotMatch(sql, /alter table realtime\.messages enable row level security/i);
});
