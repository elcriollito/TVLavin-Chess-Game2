const CURRENT_STATUSES = new Set(['scheduled', 'registration_open', 'active', 'finishing']);
const SCHEDULE_STATUSES = new Set(['draft', 'scheduled', 'registration_open', 'planned', 'skipped']);

export function localCalendarDayKey(value = Date.now(), timeZone) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.valueOf())) return null;
    const options = { year: 'numeric', month: '2-digit', day: '2-digit' };
    if (timeZone) options.timeZone = timeZone;
    const parts = new Intl.DateTimeFormat('en-US', options).formatToParts(date);
    const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
}

export function classifyTournamentDirectoryRows(rows, { now = Date.now(), timeZone } = {}) {
    const today = localCalendarDayKey(now, timeZone);
    const current = [];
    const schedule = [];
    const mine = [];

    for (const row of rows) {
        const startsOn = localCalendarDayKey(row?.startsAt, timeZone);
        if (startsOn === today && CURRENT_STATUSES.has(row?.status)) current.push(row);
        if (startsOn && today && startsOn > today && SCHEDULE_STATUSES.has(row?.status)) schedule.push(row);
        if (row?.joined || row?.organizedByMe || (row?.myState && row.myState !== 'withdrawn')) mine.push(row);
    }
    return { current, schedule, mine, today };
}

export function dedupeTournamentDirectoryRows(materializedRows, plannedRows) {
    const rows = [];
    const materializedIds = new Set();
    const occurrenceKeys = new Set();

    for (const row of materializedRows) {
        const id = String(row?.id || '');
        if (id && materializedIds.has(id)) continue;
        if (id) materializedIds.add(id);
        const occurrenceKey = row?.seriesOccurrenceKey || row?.occurrenceKey;
        if (occurrenceKey) occurrenceKeys.add(String(occurrenceKey));
        rows.push(row);
    }

    const plannedKeys = new Set();
    for (const row of plannedRows) {
        const occurrenceKey = String(row?.occurrenceKey || row?.id || '');
        if (row?.tournamentId || materializedIds.has(String(row?.id || ''))
            || (occurrenceKey && (occurrenceKeys.has(occurrenceKey) || plannedKeys.has(occurrenceKey)))) {
            continue;
        }
        if (occurrenceKey) plannedKeys.add(occurrenceKey);
        rows.push(row);
    }
    return rows;
}

export function compareTournamentStarts(left, right) {
    const leftTime = Date.parse(left?.startsAt);
    const rightTime = Date.parse(right?.startsAt);
    const compared = (Number.isFinite(leftTime) ? leftTime : Number.MAX_SAFE_INTEGER)
        - (Number.isFinite(rightTime) ? rightTime : Number.MAX_SAFE_INTEGER);
    return compared || String(left?.name || '').localeCompare(String(right?.name || ''))
        || String(left?.id || '').localeCompare(String(right?.id || ''));
}
