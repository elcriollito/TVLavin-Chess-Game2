import { ARENA_TIME_CONTROLS } from './online-arena.js';
import { zonedDateTimeToUtc } from './online-weekly-scheduler.js';

const DAY_MS = 86_400_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/u;
const TIME = /^(\d{2}):(\d{2})$/u;
const SAFE_NAME = /^[^<>\u0000-\u001f\u007f]{3,80}$/u;
const CONTROL_BY_ID = new Map(ARENA_TIME_CONTROLS.map(control => [control.id, control]));

export function isRecurringTournamentsEnabled(rollout, env = {}) {
    return rollout === 'preview'
        && env.CAISSA_ONLINE_TOURNAMENTS === '1'
        && env.CAISSA_ONLINE_ARENA === '1'
        && env.CAISSA_ONLINE_RECURRING_TOURNAMENTS === '1';
}

export function validateRecurringSeriesCreate(payload, env = {}, now = Date.now()) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)
        || hasAny(payload, ['description', 'daysPerMove', 'groupSize', 'qualifiersPerGroup'])) {
        return failure('RECURRING_INVALID_FIELDS');
    }
    const name = String(payload.name || '').trim();
    const control = CONTROL_BY_ID.get(String(payload.timeControlId || ''));
    const durationMinutes = Number(payload.durationMinutes);
    const capacity = Number(payload.capacity);
    const lateJoin = payload.lateJoin === true;
    const rated = payload.rated === true;
    if (!SAFE_NAME.test(name)) return failure('RECURRING_INVALID_NAME');
    if (!control) return failure('RECURRING_INVALID_TIME_CONTROL');
    if (!Number.isSafeInteger(durationMinutes) || durationMinutes < 5 || durationMinutes > 180) {
        return failure('RECURRING_INVALID_DURATION');
    }
    if (!Number.isSafeInteger(capacity) || capacity < 4 || capacity > 100) {
        return failure('RECURRING_INVALID_CAPACITY');
    }
    if (rated && env.CAISSA_ONLINE_RECURRING_RATED !== '1') {
        return failure('RECURRING_RATED_NOT_CERTIFIED');
    }
    const recurrence = validateRecurrenceRule(payload.recurrence, now);
    if (!recurrence.ok) return recurrence;
    return Object.freeze({
        ok: true,
        value: Object.freeze({
            name,
            control: Object.freeze({ ...control }),
            durationMinutes,
            capacity,
            lateJoin,
            rated,
            recurrence: recurrence.value
        })
    });
}

export function validateRecurringSeriesAction(action, payload = {}, now = Date.now()) {
    if (action === 'sync') return Object.freeze({ ok: true, value: {} });
    const seriesId = String(payload.seriesId || '');
    if (!UUID.test(seriesId)) return failure('RECURRING_INVALID_SERIES');
    if (action === 'pause' || action === 'resume') {
        return Object.freeze({ ok: true, value: Object.freeze({ seriesId }) });
    }
    if (action === 'skip') {
        const localDate = validDateString(payload.localDate);
        const reason = String(payload.reason || 'Organizer skip').trim().slice(0, 240);
        if (!localDate || reason.length < 3) return failure('RECURRING_INVALID_SKIP');
        return Object.freeze({ ok: true, value: Object.freeze({ seriesId, localDate, reason }) });
    }
    if (action === 'cancel') {
        const tournamentId = String(payload.tournamentId || '');
        return UUID.test(tournamentId)
            ? Object.freeze({ ok: true, value: Object.freeze({ seriesId, tournamentId }) })
            : failure('RECURRING_INVALID_TOURNAMENT');
    }
    if (action === 'update') {
        const recurrence = validateRecurrenceRule(payload.recurrence, now, { allowPastAnchor: true });
        if (!recurrence.ok) return recurrence;
        return Object.freeze({ ok: true, value: Object.freeze({ seriesId, recurrence: recurrence.value }) });
    }
    return failure('RECURRING_INVALID_ACTION');
}

export function validateRecurrenceRule(input, now = Date.now(), options = {}) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
        return failure('RECURRING_INVALID_RULE');
    }
    const frequencyUnit = String(input.frequencyUnit || '');
    const interval = Number(input.interval);
    const timeZone = String(input.timeZone || '').trim();
    const localTime = validLocalTime(input.localTime);
    const firstDate = validDateString(input.firstDate);
    const leadDays = Number(input.leadDays ?? 2);
    const endMode = String(input.endMode || 'never');
    const endDate = endMode === 'on_date' ? validDateString(input.endDate) : null;
    const occurrenceCount = endMode === 'after_count' ? Number(input.occurrenceCount) : null;
    const enabled = input.enabled !== false;
    if (!['daily', 'weekly'].includes(frequencyUnit)
        || !Number.isSafeInteger(interval) || interval < 1
        || interval > (frequencyUnit === 'daily' ? 30 : 52)) {
        return failure('RECURRING_INVALID_FREQUENCY');
    }
    if (!validTimeZone(timeZone) || !localTime || !firstDate || ![1, 2].includes(leadDays)) {
        return failure('RECURRING_INVALID_CALENDAR');
    }
    if (!['never', 'on_date', 'after_count'].includes(endMode)
        || (endMode === 'on_date' && (!endDate || endDate < firstDate))
        || (endMode === 'after_count' && (!Number.isSafeInteger(occurrenceCount)
            || occurrenceCount < 1 || occurrenceCount > 100))) {
        return failure('RECURRING_INVALID_END');
    }
    const weekdays = frequencyUnit === 'weekly'
        ? [...new Set((Array.isArray(input.weekdays) ? input.weekdays : []).map(Number))].sort((a, b) => a - b)
        : [];
    if (frequencyUnit === 'weekly' && (!weekdays.length || weekdays.some(day => !Number.isSafeInteger(day) || day < 0 || day > 6))) {
        return failure('RECURRING_INVALID_WEEKDAYS');
    }
    const firstStart = firstEligibleStart({ frequencyUnit, interval, weekdays, firstDate, localTime, timeZone, leadDays });
    if (!options.allowPastAnchor && (!Number.isFinite(firstStart) || firstStart < Number(now) + 60_000
        || firstStart > Number(now) + (366 * DAY_MS))) {
        return failure('RECURRING_INVALID_FIRST_DATE');
    }
    return Object.freeze({
        ok: true,
        value: Object.freeze({
            frequencyUnit, interval, weekdays: Object.freeze(weekdays), firstDate,
            localTime, timeZone, leadDays, endMode, endDate, occurrenceCount, enabled
        })
    });
}

export function previewRecurrenceDates(rule, options = {}) {
    const limit = Math.min(Math.max(Number(options.limit) || 12, 1), 24);
    const from = Number(options.from ?? Date.now());
    const horizonDays = Math.min(Math.max(Number(options.horizonDays) || 740, 1), 3700);
    const first = parseDate(rule.firstDate);
    if (!first || !validTimeZone(rule.timeZone) || !validLocalTime(rule.localTime)) return Object.freeze([]);
    const [hour, minute] = rule.localTime.split(':').map(Number);
    const endDate = rule.endMode === 'on_date' ? rule.endDate : null;
    const afterCount = rule.endMode === 'after_count' ? Number(rule.occurrenceCount) : Number.POSITIVE_INFINITY;
    const rows = [];
    let ordinal = 0;
    for (let offset = 0; offset <= horizonDays && rows.length < limit && ordinal < afterCount; offset += 1) {
        const date = addDays(first, offset);
        const localDate = formatDate(date);
        if (endDate && localDate > endDate) break;
        if (!eligibleLocalDate(rule, first, date, offset)) continue;
        ordinal += 1;
        const startsAt = zonedDateTimeToUtc({ ...date, hour, minute }, rule.timeZone);
        if (startsAt < from) continue;
        rows.push(Object.freeze({
            localDate,
            startsAt: new Date(startsAt).toISOString(),
            ordinal,
            creationDueAt: new Date(startsAt - (Number(rule.leadDays) * DAY_MS)).toISOString()
        }));
    }
    return Object.freeze(rows);
}

export function recurrenceSummary(rule, locale = 'en-US') {
    const every = `Every ${rule.interval === 1 ? '' : `${rule.interval} `}${rule.frequencyUnit === 'daily'
        ? rule.interval === 1 ? 'day' : 'days'
        : rule.interval === 1 ? 'week' : 'weeks'}`;
    const days = rule.frequencyUnit === 'weekly'
        ? ` on ${rule.weekdays.map(day => new Intl.DateTimeFormat(locale, { weekday: 'long', timeZone: 'UTC' })
            .format(new Date(Date.UTC(2026, 10, 22 + day)))).join(', ')}` : '';
    const [hour, minute] = rule.localTime.split(':').map(Number);
    const time = new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' })
        .format(new Date(Date.UTC(2026, 0, 1, hour, minute)));
    const ending = rule.endMode === 'on_date' ? ` through ${rule.endDate}`
        : rule.endMode === 'after_count' ? ` for ${rule.occurrenceCount} occurrences` : ' until paused';
    return `${every}${days} at ${time} (${rule.timeZone}). Create each tournament ${rule.leadDays} ${rule.leadDays === 1 ? 'day' : 'days'} before. Repeats${ending}.`;
}

function firstEligibleStart(rule) {
    const first = previewRecurrenceDates(rule, { from: 0, limit: 1, horizonDays: 370 })[0];
    return first ? Date.parse(first.startsAt) : Number.NaN;
}

function eligibleLocalDate(rule, first, date, offset) {
    if (rule.frequencyUnit === 'daily') return offset % Number(rule.interval) === 0;
    const firstWeekStart = addDays(first, -first.weekday);
    const daysFromWeekStart = Math.round((Date.UTC(date.year, date.month - 1, date.day)
        - Date.UTC(firstWeekStart.year, firstWeekStart.month - 1, firstWeekStart.day)) / DAY_MS);
    const weekIndex = Math.floor(daysFromWeekStart / 7);
    return weekIndex % Number(rule.interval) === 0 && rule.weekdays.includes(date.weekday);
}

function validTimeZone(value) {
    try {
        new Intl.DateTimeFormat('en-US', { timeZone: value }).format(0);
        return value.includes('/');
    } catch (_) {
        return false;
    }
}

function validDateString(value) {
    const parsed = parseDate(value);
    return parsed && formatDate(parsed) === String(value) ? String(value) : null;
}

function validLocalTime(value) {
    const match = TIME.exec(String(value || ''));
    if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) return null;
    return `${match[1]}:${match[2]}`;
}

function parseDate(value) {
    const match = DATE.exec(String(value || ''));
    if (!match) return null;
    const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
    return Object.freeze({
        year: date.getUTCFullYear(), month: date.getUTCMonth() + 1,
        day: date.getUTCDate(), weekday: date.getUTCDay()
    });
}

function addDays(parts, amount) {
    const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + amount));
    return Object.freeze({
        year: date.getUTCFullYear(), month: date.getUTCMonth() + 1,
        day: date.getUTCDate(), weekday: date.getUTCDay()
    });
}

function formatDate(parts) {
    return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

function hasAny(payload, keys) {
    return keys.some(key => Object.hasOwn(payload, key));
}

function failure(code) {
    return Object.freeze({ ok: false, code });
}
