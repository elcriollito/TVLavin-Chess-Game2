import test from 'node:test';
import assert from 'node:assert/strict';

import {
    classifyTournamentDirectoryRows,
    compareTournamentStarts,
    dedupeTournamentDirectoryRows,
    localCalendarDayKey
} from '../../js/online/tournament-directory.js';

const NOW = '2026-11-23T17:00:00-05:00';
const ZONE = 'America/New_York';

function row(id, startsAt, status, extra = {}) {
    return { id, name: id, startsAt, status, ...extra };
}

test('Current contains only eligible tournaments starting today in the viewer timezone', () => {
    const rows = [
        row('scheduled', '2026-11-23T08:00:00-05:00', 'scheduled'),
        row('open', '2026-11-23T12:00:00-05:00', 'registration_open'),
        row('active', '2026-11-23T18:00:00-05:00', 'active'),
        row('finishing', '2026-11-23T19:00:00-05:00', 'finishing'),
        row('tomorrow-open', '2026-11-24T08:00:00-05:00', 'registration_open'),
        row('cancelled', '2026-11-23T14:00:00-05:00', 'cancelled', { joined: true }),
        row('completed', '2026-11-23T15:00:00-05:00', 'completed', { organizedByMe: true })
    ];

    const classified = classifyTournamentDirectoryRows(rows, { now: NOW, timeZone: ZONE });

    assert.deepEqual(classified.current.map(item => item.id), ['scheduled', 'open', 'active', 'finishing']);
    assert.deepEqual(classified.schedule.map(item => item.id), ['tomorrow-open']);
    assert.deepEqual(classified.mine.map(item => item.id), ['cancelled', 'completed']);
});

test('Schedule starts tomorrow, remains chronological and includes planned materialization states', () => {
    const rows = [
        row('future-late', '2026-11-25T20:00:00-05:00', 'scheduled'),
        row('future-open', '2026-11-24T18:00:00-05:00', 'registration_open'),
        row('future-planned', '2026-11-24T17:00:00-05:00', 'planned', { planned: true }),
        row('today-planned', '2026-11-23T20:00:00-05:00', 'planned', { planned: true }),
        row('future-cancelled', '2026-11-24T19:00:00-05:00', 'cancelled')
    ];

    const { schedule } = classifyTournamentDirectoryRows(rows, { now: NOW, timeZone: ZONE });

    assert.deepEqual(schedule.sort(compareTournamentStarts).map(item => item.id), [
        'future-planned', 'future-open', 'future-late'
    ]);
});

test('planned occurrences disappear when the corresponding tournament materializes', () => {
    const materialized = [
        row('event-a', '2026-11-24T17:00:00-05:00', 'scheduled', { seriesOccurrenceKey: 'series-a:2026-11-24' }),
        row('event-b', '2026-11-24T18:00:00-05:00', 'registration_open')
    ];
    const planned = [
        row('planned-a', '2026-11-24T17:00:00-05:00', 'planned', { occurrenceKey: 'series-a:2026-11-24' }),
        row('planned-b', '2026-11-24T18:00:00-05:00', 'planned', { tournamentId: 'event-b' }),
        row('planned-c', '2026-11-24T19:00:00-05:00', 'planned', { occurrenceKey: 'series-c:2026-11-24' }),
        row('planned-c-copy', '2026-11-24T19:00:00-05:00', 'planned', { occurrenceKey: 'series-c:2026-11-24' })
    ];

    assert.deepEqual(
        dedupeTournamentDirectoryRows(materialized, planned).map(item => item.id),
        ['event-a', 'event-b', 'planned-c']
    );
});

test('classification follows the viewer calendar rather than UTC', () => {
    const instant = '2026-11-24T01:00:00.000Z';
    const event = row('late-evening', '2026-11-24T00:30:00.000Z', 'registration_open');

    assert.equal(localCalendarDayKey(instant, ZONE), '2026-11-23');
    assert.equal(localCalendarDayKey(instant, 'UTC'), '2026-11-24');
    assert.equal(classifyTournamentDirectoryRows([event], { now: instant, timeZone: ZONE }).current.length, 1);
    assert.equal(classifyTournamentDirectoryRows([event], { now: instant, timeZone: 'UTC' }).current.length, 1);
});

test('local day keys remain stable across the New York DST fallback', () => {
    assert.equal(localCalendarDayKey('2026-11-01T05:30:00.000Z', ZONE), '2026-11-01');
    assert.equal(localCalendarDayKey('2026-11-01T06:30:00.000Z', ZONE), '2026-11-01');
    assert.equal(localCalendarDayKey('invalid', ZONE), null);
});
