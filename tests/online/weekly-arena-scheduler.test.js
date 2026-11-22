import test from 'node:test';
import assert from 'node:assert/strict';
import {
    SATURDAYS_OF_CHESS,
    generateWeeklyOccurrences,
    isWeeklyArenaEnabled,
    planWeeklyLifecycle,
    validateWeeklyAdminAction,
    zonedParts
} from '../../api/_lib/online-weekly-scheduler.js';

test('official weekly Arenas require explicit gates in Preview and Production', () => {
    const env = { CAISSA_ONLINE_TOURNAMENTS: '1', CAISSA_ONLINE_WEEKLY_ARENAS: '1' };
    assert.equal(isWeeklyArenaEnabled('preview', env), true);
    assert.equal(isWeeklyArenaEnabled('production', env), true);
    assert.equal(isWeeklyArenaEnabled('internal', env), false);
    assert.equal(isWeeklyArenaEnabled('production', { CAISSA_ONLINE_TOURNAMENTS: '1' }), false);
});

test('weekly scheduler generates both slots for four Saturdays without duplicates', () => {
    const rows = generateWeeklyOccurrences(SATURDAYS_OF_CHESS, Date.parse('2026-11-20T12:00:00Z'), 4);
    assert.equal(rows.length, 8);
    assert.equal(new Set(rows.map(row => row.occurrenceKey)).size, 8);
    assert.deepEqual(rows.slice(0, 2).map(row => row.startsAt), [
        '2026-11-28T16:00:00.000Z', '2026-11-29T00:00:00.000Z'
    ]);
});

test('weekly scheduler preserves 11 AM and 7 PM through DST transitions', () => {
    for (const now of ['2027-03-12T12:00:00Z', '2027-11-05T12:00:00Z']) {
        const rows = generateWeeklyOccurrences(SATURDAYS_OF_CHESS, Date.parse(now), 2);
        for (const row of rows) {
            const local = zonedParts(Date.parse(row.startsAt), SATURDAYS_OF_CHESS.timeZone);
            assert.equal(local.weekday, 6);
            assert.equal([11, 19].includes(local.hour), true);
            assert.equal(local.minute, 0);
        }
    }
});

test('weekly lifecycle recovers deterministically from delayed execution', () => {
    const occurrence = generateWeeklyOccurrences(
        SATURDAYS_OF_CHESS, Date.parse('2026-11-20T12:00:00Z'), 1
    )[0];
    assert.equal(planWeeklyLifecycle(occurrence, 20, 0, Date.parse(occurrence.registrationOpensAt) - 1), 'scheduled');
    assert.equal(planWeeklyLifecycle(occurrence, 20, 0, Date.parse(occurrence.startsAt) - 1), 'registration_open');
    assert.equal(planWeeklyLifecycle(occurrence, 3, 0, Date.parse(occurrence.startsAt)), 'cancelled');
    assert.equal(planWeeklyLifecycle(occurrence, 4, 0, Date.parse(occurrence.startsAt)), 'active');
    assert.equal(planWeeklyLifecycle(occurrence, 20, 2, Date.parse(occurrence.endsAt)), 'finishing');
    assert.equal(planWeeklyLifecycle(occurrence, 20, 0, Date.parse(occurrence.endsAt)), 'completed');
});

test('weekly organizer operations accept only bounded future configuration', () => {
    assert.deepEqual(validateWeeklyAdminAction('skip', {
        localDate: '2026-11-28', slotId: 'morning', reason: 'Holiday'
    }), { ok: true, value: { localDate: '2026-11-28', slotId: 'morning', reason: 'Holiday' } });
    assert.equal(validateWeeklyAdminAction('skip', {
        localDate: '2026-11-21', slotId: 'morning'
    }).code, 'WEEKLY_INVALID_SKIP');
    assert.equal(validateWeeklyAdminAction('update', {
        capacity: 101, minimumPlayers: 4, registrationLeadDays: 7, rated: false
    }).code, 'WEEKLY_INVALID_CONFIGURATION');
    assert.equal(validateWeeklyAdminAction('update', {
        capacity: 100, minimumPlayers: 4, registrationLeadDays: 7, rated: true
    }, {}).code, 'WEEKLY_INVALID_CONFIGURATION');
    assert.equal(validateWeeklyAdminAction('update', {
        capacity: 100, minimumPlayers: 4, registrationLeadDays: 7, rated: true
    }, { CAISSA_ONLINE_TOURNAMENT_RATED: '1' }).ok, true);
});
