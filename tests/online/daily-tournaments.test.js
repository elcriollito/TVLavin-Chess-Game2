import test from 'node:test';
import assert from 'node:assert/strict';
import {
    adjudicateDailyDeadline,
    buildDailyGroups,
    buildDoubleRoundRobinPairings,
    calculateDailyStandings,
    isDailyEnabled,
    nextDailyDeadline,
    selectDailyQualifiers,
    validateDailyCreation
} from '../../api/_lib/online-daily.js';

test('Daily requires explicit gates in Preview and Production', () => {
    const env = { CAISSA_ONLINE_TOURNAMENTS: '1', CAISSA_ONLINE_DAILY: '1' };
    assert.equal(isDailyEnabled('preview', env), true);
    assert.equal(isDailyEnabled('production', env), true);
    assert.equal(isDailyEnabled('internal', env), false);
    assert.equal(isDailyEnabled('production', { CAISSA_ONLINE_TOURNAMENTS: '1' }), false);
});

test('Daily creation accepts 1, 3, 5, and 7 days and rejects invalid capacity', () => {
    const now = Date.parse('2026-11-20T12:00:00Z');
    for (const daysPerMove of [1, 3, 5, 7]) {
        const result = validateDailyCreation({
            name: 'Daily Championship', description: 'Seven days means seven days per move.',
            daysPerMove, groupSize: 4, qualifiersPerGroup: 2, capacity: 100,
            startsAt: '2026-11-25T12:00:00Z'
        }, now);
        assert.equal(result.ok, true);
        assert.equal(result.value.registrationClosesAt, result.value.startsAt);
    }
    for (const capacity of [-1, 3, 4.5, 101]) {
        assert.equal(validateDailyCreation({
            name: 'Daily Championship', daysPerMove: 7, groupSize: 4, capacity,
            startsAt: '2026-11-25T12:00:00Z'
        }, now).code, 'INVALID_TOURNAMENT_CAPACITY');
    }
    assert.equal(validateDailyCreation({
        name: 'Daily Championship', daysPerMove: 7, groupSize: 6, capacity: 4,
        startsAt: '2026-11-25T12:00:00Z'
    }, now).code, 'DAILY_GROUP_EXCEEDS_CAPACITY');
    assert.equal(validateDailyCreation({
        name: 'Daily Championship', daysPerMove: 7, groupSize: 3,
        qualifiersPerGroup: 3, capacity: 4, startsAt: '2026-11-25T12:00:00Z'
    }, now).code, 'INVALID_DAILY_ADVANCEMENT');
    assert.equal(validateDailyCreation({
        name: 'Daily Championship', daysPerMove: 7, groupSize: 4, capacity: 16,
        durationMinutes: 60, startsAt: '2026-11-25T12:00:00Z'
    }, now).code, 'INVALID_DAILY_FIELDS');
    assert.equal(validateDailyCreation({
        name: 'Daily Championship', daysPerMove: 7, groupSize: 4, capacity: 16,
        registrationClosesAt: '2026-11-24T12:00:00Z', startsAt: '2026-11-25T12:00:00Z'
    }, now).code, 'DAILY_REGISTRATION_MANAGED');
});

test('Daily deadline advances exactly by the selected days', () => {
    assert.equal(nextDailyDeadline(Date.parse('2026-11-20T10:15:00Z'), 7), '2026-11-27T10:15:00.000Z');
});

test('Daily groups and double round robin are deterministic and bounded', () => {
    const players = Array.from({ length: 10 }, (_, index) => ({
        id: `p${index + 1}`, rating: 2000 - index, joinedAt: `2026-11-20T00:00:${String(index).padStart(2, '0')}Z`
    }));
    const groups = buildDailyGroups(players, 4);
    assert.deepEqual(groups.map(group => group.members.length), [3, 3, 4]);
    const pairings = buildDoubleRoundRobinPairings(groups[2]);
    assert.equal(pairings.length, 12);
    assert.equal(pairings.filter(row => row.whiteUserId === groups[2].members[0].id).length, 3);
    assert.equal(pairings.filter(row => row.blackUserId === groups[2].members[0].id).length, 3);
});

test('Daily standings ignore duplicate game ids and apply deterministic tie breaks', () => {
    const members = [
        { id: 'a', displayName: 'A', seed: 1 },
        { id: 'b', displayName: 'B', seed: 2 },
        { id: 'c', displayName: 'C', seed: 3 }
    ];
    const games = [
        { id: 'g1', whiteUserId: 'a', blackUserId: 'b', result: '1-0' },
        { id: 'g1', whiteUserId: 'a', blackUserId: 'b', result: '1-0' },
        { id: 'g2', whiteUserId: 'b', blackUserId: 'c', result: '1-0' },
        { id: 'g3', whiteUserId: 'c', blackUserId: 'a', result: '1-0' }
    ];
    const standings = calculateDailyStandings(members, games);
    assert.equal(standings.every(row => row.points === 1), true);
    assert.deepEqual(selectDailyQualifiers(standings, 2), ['a', 'b']);
});

test('Daily timeout is server-time based and respects mating potential', () => {
    const game = {
        pool: 'daily', status: 'active', turn: 'white',
        move_deadline_at: '2026-11-20T12:00:00Z', black_can_mate: true
    };
    assert.equal(adjudicateDailyDeadline(game, Date.parse('2026-11-20T11:59:59Z')), null);
    assert.deepEqual(adjudicateDailyDeadline(game, Date.parse('2026-11-20T12:00:00Z')),
        { result: '0-1', termination: 'timeout' });
    assert.equal(adjudicateDailyDeadline({ ...game, black_can_mate: false }, Date.parse('2026-11-20T12:00:00Z')).result,
        '1/2-1/2');
});
