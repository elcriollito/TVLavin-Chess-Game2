import test from 'node:test';
import assert from 'node:assert/strict';
import {
    isRecurringTournamentsEnabled,
    previewRecurrenceDates,
    recurrenceSummary,
    validateRecurringSeriesAction,
    validateRecurringSeriesCreate
} from '../../api/_lib/online-recurring-scheduler.js';

const enabledEnv = {
    CAISSA_ONLINE_TOURNAMENTS: '1',
    CAISSA_ONLINE_ARENA: '1',
    CAISSA_ONLINE_RECURRING_TOURNAMENTS: '1'
};

function payload(recurrence = {}) {
    return {
        name: 'Friday Night Arena',
        timeControlId: 'bullet-2-1',
        durationMinutes: 30,
        capacity: 16,
        lateJoin: true,
        rated: false,
        recurrence: {
            frequencyUnit: 'weekly', interval: 2, weekdays: [5],
            firstDate: '2026-11-27', localTime: '19:00', timeZone: 'America/New_York',
            leadDays: 2, endMode: 'never', enabled: true,
            ...recurrence
        }
    };
}

test('recurrence is preview-only and requires the isolated feature flag', () => {
    assert.equal(isRecurringTournamentsEnabled('preview', enabledEnv), true);
    assert.equal(isRecurringTournamentsEnabled('internal', enabledEnv), false);
    assert.equal(isRecurringTournamentsEnabled('preview', { ...enabledEnv, CAISSA_ONLINE_RECURRING_TOURNAMENTS: '0' }), false);
});

test('weekly validation accepts multiple weekdays and rejects Daily or rated leakage', () => {
    const now = Date.parse('2026-11-21T12:00:00Z');
    const valid = validateRecurringSeriesCreate(payload({ interval: 1, weekdays: [1, 3, 5] }), enabledEnv, now);
    assert.equal(valid.ok, true);
    assert.deepEqual(valid.value.recurrence.weekdays, [1, 3, 5]);
    assert.equal(validateRecurringSeriesCreate({ ...payload(), daysPerMove: 7 }, enabledEnv, now).code, 'RECURRING_INVALID_FIELDS');
    assert.equal(validateRecurringSeriesCreate({ ...payload(), rated: true }, enabledEnv, now).code, 'RECURRING_RATED_NOT_CERTIFIED');
    for (const spoof of [{ source: 'official' }, { seriesKind: 'official' }, { official: true }]) {
        assert.equal(validateRecurringSeriesCreate({ ...payload(), ...spoof }, enabledEnv, now).code,
            'RECURRING_INVALID_FIELDS');
    }
    assert.equal(validateRecurringSeriesCreate(payload({ source: 'official' }), enabledEnv, now).code,
        'RECURRING_INVALID_RULE');
});

test('daily intervals preserve month, year and leap-day calendar boundaries', () => {
    const rows = previewRecurrenceDates({
        frequencyUnit: 'daily', interval: 2, weekdays: [], firstDate: '2028-02-27',
        localTime: '09:30', timeZone: 'America/New_York', leadDays: 1,
        endMode: 'after_count', occurrenceCount: 4
    }, { from: Date.parse('2028-02-01T00:00:00Z'), limit: 8 });
    assert.deepEqual(rows.map(row => row.localDate), ['2028-02-27', '2028-02-29', '2028-03-02', '2028-03-04']);
    assert.equal(Date.parse(rows[0].startsAt) - Date.parse(rows[0].creationDueAt), 86_400_000);
});

test('every two weeks stays anchored and multiple weekdays share the eligible week', () => {
    const rows = previewRecurrenceDates({
        frequencyUnit: 'weekly', interval: 2, weekdays: [1, 5], firstDate: '2026-11-23',
        localTime: '19:00', timeZone: 'America/New_York', leadDays: 2, endMode: 'never'
    }, { from: Date.parse('2026-11-20T00:00:00Z'), limit: 6 });
    assert.deepEqual(rows.map(row => row.localDate), [
        '2026-11-23', '2026-11-27', '2026-12-07', '2026-12-11', '2026-12-21', '2026-12-25'
    ]);
});

test('Eastern local time remains stable across both DST boundaries', () => {
    const spring = previewRecurrenceDates({
        frequencyUnit: 'weekly', interval: 1, weekdays: [0], firstDate: '2027-03-07',
        localTime: '19:00', timeZone: 'America/New_York', leadDays: 2, endMode: 'after_count', occurrenceCount: 3
    }, { from: Date.parse('2027-03-01T00:00:00Z'), limit: 3 });
    assert.deepEqual(spring.map(row => row.startsAt), [
        '2027-03-08T00:00:00.000Z', '2027-03-14T23:00:00.000Z', '2027-03-21T23:00:00.000Z'
    ]);
    const fall = previewRecurrenceDates({
        frequencyUnit: 'weekly', interval: 1, weekdays: [0], firstDate: '2027-10-31',
        localTime: '19:00', timeZone: 'America/New_York', leadDays: 2, endMode: 'after_count', occurrenceCount: 3
    }, { from: Date.parse('2027-10-01T00:00:00Z'), limit: 3 });
    assert.deepEqual(fall.map(row => row.startsAt), [
        '2027-10-31T23:00:00.000Z', '2027-11-08T00:00:00.000Z', '2027-11-15T00:00:00.000Z'
    ]);
});

test('end date, after-count and bounded management actions are independent', () => {
    const now = Date.parse('2026-11-21T12:00:00Z');
    const ended = validateRecurringSeriesCreate(payload({ endMode: 'on_date', endDate: '2026-12-31' }), enabledEnv, now);
    assert.equal(ended.ok, true);
    const id = '88888888-8888-4888-8888-888888888888';
    assert.equal(validateRecurringSeriesAction('pause', { seriesId: id }, now).ok, true);
    assert.equal(validateRecurringSeriesAction('skip', { seriesId: id, localDate: '2026-12-11', reason: 'Holiday event' }, now).ok, true);
    assert.equal(validateRecurringSeriesAction('unskip', { seriesId: id, localDate: '2026-12-11', reason: 'Restore event' }, now).ok, true);
    assert.equal(validateRecurringSeriesAction('cancel', { seriesId: id, tournamentId: 'bad' }, now).code, 'RECURRING_INVALID_TOURNAMENT');
    assert.match(recurrenceSummary(ended.value.recurrence), /Every 2 weeks on Friday at 7:00 PM/);
});
