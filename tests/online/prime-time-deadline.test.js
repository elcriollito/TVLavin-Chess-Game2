import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
    PRIME_TIME_SERIES,
    assertPrimeTimePlan,
    createPrimeTimeOperations,
    projectedPrimeTimeOccurrences
} from '../../scripts/prime-time-arenas-s001-plan.mjs';

const migrationUrl = new URL(
    '../../supabase/migrations/20261123023000_caissa_prime_time_deadline_s001.sql',
    import.meta.url
);
const hardeningUrl = new URL(
    '../../supabase/migrations/20261123031500_caissa_prime_time_deadline_race_hardening.sql',
    import.meta.url
);

test('Prime Time schedule groups 27 weekly slots into 14 stable official series', () => {
    assert.deepEqual(assertPrimeTimePlan(), {
        groupedSeries: 14,
        weeklyEvents: 27,
        fourWeekOccurrences: 108
    });
    assert.equal(PRIME_TIME_SERIES.length, 14);
    assert.equal(new Set(PRIME_TIME_SERIES.map(series => series.slug)).size, 14);
    assert.equal(PRIME_TIME_SERIES.some(series => series.weekdays.includes(6) && series.hour === 19), false);
    assert.equal(projectedPrimeTimeOccurrences().every(row => row.finishingPolicy === 'abort_at_deadline'), true);
});

test('operator dry-run payloads are unrated, disabled, capped and exact-duration', () => {
    const operations = createPrimeTimeOperations();
    assert.equal(operations.length, 14);
    for (const operation of operations) {
        assert.equal(operation.action, 'create');
        assert.match(operation.eventId, /^prime-time-s001:create:/u);
        assert.match(operation.payload.slug, /^caissa-prime-time-.+-s001$/u);
        assert.equal(operation.payload.timeZone, 'America/New_York');
        assert.equal(operation.payload.durationMinutes, 60);
        assert.equal(operation.payload.capacity, 64);
        assert.equal(operation.payload.minimumPlayers, 4);
        assert.equal(operation.payload.leadDays, 2);
        assert.equal(operation.payload.rated, false);
        assert.equal(operation.payload.lateJoin, true);
        assert.equal(operation.payload.enabled, false);
        assert.equal(operation.payload.endMode, 'never');
    }
});

test('deadline migration is policy-scoped, server-authoritative and service-only', async () => {
    const sql = await readFile(migrationUrl, 'utf8');
    const hardening = await readFile(hardeningUrl, 'utf8');
    assert.match(sql, /finishing_policy in \('finish_active_games','abort_at_deadline'\)/u);
    assert.match(sql, /termination='tournament_deadline'/u);
    assert.match(sql, /status='aborted',result=null/u);
    assert.match(sql, /set scored_at=null,white_points=null,black_points=null/u);
    assert.match(sql, /v_flag_at<v_tournament\.ends_at/u);
    assert.match(sql, /v_game\.completed_at>=v_tournament\.ends_at/u);
    assert.match(sql, /perform caissa_online_private\.arena_reconcile\(v_tournament_id\)/u);
    assert.match(sql, /pg_advisory_xact_lock/u);
    assert.match(sql, /order by game\.id[\s\S]+for update of link,game/u);
    assert.match(sql, /pointsAwarded',0/u);
    assert.match(hardening, /Arena time expired '\|\|chr\(8212\)\|\|' Game aborted\. No points awarded\./u);
    assert.match(sql, /revoke all on function caissa_online_private\.arena_apply_deadline/u);
    assert.match(sql, /grant execute on function caissa_online_private\.arena_apply_deadline[\s\S]+to service_role/u);
    assert.match(hardening, /game\.status='completed'[\s\S]+game\.completed_at,p_now\)>=v_tournament\.ends_at/u);
    assert.match(hardening, /previousStatus',v_game\.status,'previousResult',v_game\.result/u);
    assert.match(hardening, /create or replace function caissa_online_private\.arena_guard_write/u);
    assert.match(hardening, /v_now:=pg_catalog\.clock_timestamp\(\);[\s\S]+arena_guard_write\(v_tournament_id,v_now\)/u);
    assert.match(hardening, /v_game\.completed_at is null or v_game\.completed_at>=tournament\.ends_at/u);
    assert.match(hardening, /revoke all on function caissa_online_private\.arena_guard_write/u);
    assert.match(hardening, /grant execute on function caissa_online_private\.arena_guard_write[\s\S]+to service_role/u);
});

test('deadline policy excludes Daily and preserves standard Arena behavior', async () => {
    const sql = await readFile(migrationUrl, 'utf8');
    assert.match(sql, /v_tournament\.play_category<>'live'/u);
    assert.match(sql, /v_tournament\.finishing_policy<>'abort_at_deadline'/u);
    assert.match(sql, /v_slot->>'id'='evening'[\s\S]+else 'finish_active_games'/u);
    assert.match(sql, /v_series\.slug like 'caissa-prime-time-%-s001'/u);
    assert.match(sql, /else 'finish_active_games'/u);
    assert.doesNotMatch(sql, /update public\.caissa_online_tournament_series[\s\S]{0,200}saturdays-of-chess-s001/u);
});

test('all supported Prime Time controls are represented without Saturday 19:00 duplication', () => {
    const represented = new Set(PRIME_TIME_SERIES.map(series => series.controlId));
    assert.deepEqual([...represented].sort(), [
        'blitz-3-0', 'blitz-3-2', 'blitz-5-0', 'blitz-5-5',
        'bullet-1-0', 'bullet-1-1', 'bullet-2-1', 'rapid-10-0', 'rapid-10-5'
    ]);
    const weekly = projectedPrimeTimeOccurrences({ weeks: 1 });
    assert.equal(weekly.length, 27);
    assert.equal(weekly.some(row => row.weekday === 6 && row.hour === 19), false);
});
