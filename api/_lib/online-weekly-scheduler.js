const DAY_MS = 86_400_000;

export const SATURDAYS_OF_CHESS = Object.freeze({
    id: 'caissa-saturdays-s001',
    slug: 'saturdays-of-chess-s001',
    title: 'SATURDAYS OF CHESS — CAISSA WEEKLY ARENAS',
    description: 'Two official one-hour CAISSA Arena competitions every Saturday.',
    timeZone: 'America/New_York',
    weekday: 6,
    registrationLeadDays: 7,
    launchNotBefore: '2026-11-28',
    durationMinutes: 60,
    capacity: 100,
    minimumPlayers: 4,
    pool: 'blitz',
    baseMs: 300_000,
    incrementMs: 0,
    rated: false,
    lateJoin: true,
    slots: Object.freeze([
        Object.freeze({ id: 'morning', label: 'Morning Arena', hour: 11, minute: 0 }),
        Object.freeze({ id: 'evening', label: 'Evening Arena', hour: 19, minute: 0 })
    ])
});

export function isWeeklyArenaEnabled(rollout, env = {}) {
    return (rollout === 'preview' || rollout === 'production')
        && env.CAISSA_ONLINE_TOURNAMENTS === '1'
        && env.CAISSA_ONLINE_WEEKLY_ARENAS === '1';
}

export function validateWeeklyAdminAction(action, payload = {}, env = {}) {
    if (['sync', 'enable', 'pause'].includes(action)) return Object.freeze({ ok: true, value: {} });
    if (action === 'skip') {
        const localDate = String(payload.localDate || '');
        const slotId = String(payload.slotId || '');
        const reason = String(payload.reason || 'Organizer skip').trim().slice(0, 240);
        if (!/^\d{4}-\d{2}-\d{2}$/u.test(localDate)
            || Date.parse(`${localDate}T00:00:00Z`) < Date.parse(`${SATURDAYS_OF_CHESS.launchNotBefore}T00:00:00Z`)
            || !SATURDAYS_OF_CHESS.slots.some(slot => slot.id === slotId)) {
            return failure('WEEKLY_INVALID_SKIP');
        }
        return Object.freeze({ ok: true, value: { localDate, slotId, reason } });
    }
    if (action === 'cancel') {
        const tournamentId = String(payload.tournamentId || '');
        return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(tournamentId)
            ? Object.freeze({ ok: true, value: { tournamentId } })
            : failure('WEEKLY_INVALID_TOURNAMENT');
    }
    if (action === 'update') {
        const capacity = Number(payload.capacity);
        const minimumPlayers = Number(payload.minimumPlayers);
        const registrationLeadDays = Number(payload.registrationLeadDays);
        const rated = payload.rated === true;
        if (!Number.isSafeInteger(capacity) || capacity < 4 || capacity > 100
            || !Number.isSafeInteger(minimumPlayers) || minimumPlayers < 4 || minimumPlayers > capacity
            || !Number.isSafeInteger(registrationLeadDays) || registrationLeadDays < 1 || registrationLeadDays > 30
            || (rated && env.CAISSA_ONLINE_TOURNAMENT_RATED !== '1')) {
            return failure('WEEKLY_INVALID_CONFIGURATION');
        }
        return Object.freeze({
            ok: true,
            value: { capacity, minimumPlayers, registrationLeadDays, rated }
        });
    }
    return failure('WEEKLY_INVALID_ACTION');
}

export function generateWeeklyOccurrences(config = SATURDAYS_OF_CHESS, now = Date.now(), weeks = 4) {
    if (!Number.isSafeInteger(weeks) || weeks < 1 || weeks > 12) {
        throw new TypeError('The generation horizon must be between one and twelve weeks.');
    }
    const localNow = zonedParts(now, config.timeZone);
    const launch = parseLocalDate(config.launchNotBefore);
    const firstEligible = launch && calendarKey(launch) > calendarKey(localNow) ? launch : localNow;
    const firstSaturday = addCalendarDays(firstEligible, (config.weekday - firstEligible.weekday + 7) % 7);
    const rows = [];
    for (let week = 0; week < weeks; week += 1) {
        const date = addCalendarDays(firstSaturday, week * 7);
        for (const slot of config.slots) {
            const startMs = zonedDateTimeToUtc({ ...date, hour: slot.hour, minute: slot.minute }, config.timeZone);
            const endMs = startMs + (config.durationMinutes * 60_000);
            if (endMs <= Number(now)) continue;
            const localDate = `${date.year}-${pad(date.month)}-${pad(date.day)}`;
            rows.push(Object.freeze({
                occurrenceKey: `${config.slug}:${localDate}:${slot.id}`,
                seriesId: config.id,
                seriesSlug: config.slug,
                slotId: slot.id,
                title: `${slot.label} · ${localDate}`,
                localDate,
                timeZone: config.timeZone,
                startsAt: new Date(startMs).toISOString(),
                endsAt: new Date(endMs).toISOString(),
                registrationOpensAt: new Date(startMs - (config.registrationLeadDays * DAY_MS)).toISOString(),
                registrationClosesAt: new Date(endMs).toISOString(),
                capacity: config.capacity,
                minimumPlayers: config.minimumPlayers,
                pool: config.pool,
                baseMs: config.baseMs,
                incrementMs: config.incrementMs,
                rated: config.rated,
                lateJoin: config.lateJoin
            }));
        }
    }
    return Object.freeze(rows);
}

export function planWeeklyLifecycle(occurrence, participantCount, activeGames, now = Date.now()) {
    const timestamp = Number(now);
    const registration = Date.parse(occurrence.registrationOpensAt);
    const start = Date.parse(occurrence.startsAt);
    const end = Date.parse(occurrence.endsAt);
    if (timestamp < registration) return 'scheduled';
    if (timestamp < start) return 'registration_open';
    if (timestamp < end) {
        return Number(participantCount) < Number(occurrence.minimumPlayers) ? 'cancelled' : 'active';
    }
    return Number(activeGames) > 0 ? 'finishing' : 'completed';
}

export function zonedDateTimeToUtc(parts, timeZone) {
    const target = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour || 0, parts.minute || 0, 0, 0);
    let guess = target;
    for (let attempt = 0; attempt < 4; attempt += 1) {
        const actual = zonedParts(guess, timeZone);
        const represented = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute, 0, 0);
        const adjustment = target - represented;
        guess += adjustment;
        if (adjustment === 0) break;
    }
    return guess;
}

export function zonedParts(value, timeZone) {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone,
        calendar: 'iso8601',
        numberingSystem: 'latn',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
        weekday: 'short'
    }).formatToParts(new Date(Number(value)));
    const read = type => parts.find(part => part.type === type)?.value;
    return Object.freeze({
        year: Number(read('year')),
        month: Number(read('month')),
        day: Number(read('day')),
        hour: Number(read('hour')),
        minute: Number(read('minute')),
        weekday: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(read('weekday'))
    });
}

function addCalendarDays(parts, days) {
    const shifted = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
    return Object.freeze({
        year: shifted.getUTCFullYear(),
        month: shifted.getUTCMonth() + 1,
        day: shifted.getUTCDate(),
        weekday: shifted.getUTCDay()
    });
}

function parseLocalDate(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(String(value || ''));
    if (!match) return null;
    const shifted = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
    return Object.freeze({
        year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1,
        day: shifted.getUTCDate(), weekday: shifted.getUTCDay()
    });
}

function calendarKey(parts) {
    return (parts.year * 10_000) + (parts.month * 100) + parts.day;
}

function pad(value) {
    return String(value).padStart(2, '0');
}

function failure(code) {
    return Object.freeze({ ok: false, code });
}
