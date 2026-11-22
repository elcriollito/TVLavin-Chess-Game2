import { readFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';

const argv = process.argv.slice(2);
const execute = argv.includes('--execute');
const fileIndex = argv.indexOf('--file');
const file = fileIndex >= 0 ? argv[fileIndex + 1] : null;

if (!file) fail('Usage: node scripts/manage-official-tournament-series.mjs --file operation.json [--execute]');

const operation = JSON.parse(await readFile(file, 'utf8'));
validateOperation(operation);

if (!execute) {
    console.log(JSON.stringify({ valid: true, dryRun: true, eventId: operation.eventId, action: operation.action }, null, 2));
    process.exit(0);
}

const url = String(process.env.CAISSA_OPERATOR_SUPABASE_URL || '');
const serviceRoleKey = String(process.env.CAISSA_OPERATOR_SERVICE_ROLE_KEY || '');
const expectedProjectRef = String(process.env.CAISSA_OPERATOR_EXPECTED_PROJECT_REF || '');
const actualProjectRef = projectRef(url);
if (!url || !serviceRoleKey || !expectedProjectRef || actualProjectRef !== expectedProjectRef) {
    fail('Operator credentials and CAISSA_OPERATOR_EXPECTED_PROJECT_REF must identify the same reviewed Supabase project.');
}

const client = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false }
});
const { data, error } = await client.rpc('caissa_online_official_series_operator', {
    p_event_id: operation.eventId,
    p_action: operation.action,
    p_payload: operation.payload
});
if (error) fail(`Official series operation failed: ${error.message}`);
console.log(JSON.stringify({ ok: true, projectRef: actualProjectRef, result: data }, null, 2));

function validateOperation(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail('Operation must be a JSON object.');
    if (!/^[A-Za-z0-9:_-]{12,120}$/u.test(String(value.eventId || ''))) fail('eventId is invalid.');
    if (!['create', 'pause', 'resume', 'skip', 'unskip', 'update', 'cancel', 'inspect'].includes(value.action)) {
        fail('action is not supported.');
    }
    if (!value.payload || typeof value.payload !== 'object' || Array.isArray(value.payload)) fail('payload must be an object.');
    if (!/^.{6,160}$/u.test(String(value.payload.actor || ''))) fail('payload.actor is required for the audit trail.');
    const allowedByAction = {
        create: ['actor', 'slug', 'title', 'description', 'timeZone', 'frequencyUnit', 'interval',
            'firstDate', 'leadDays', 'pool', 'baseMs', 'incrementMs', 'durationMinutes', 'capacity',
            'minimumPlayers', 'slots', 'weekdays', 'endMode', 'endDate', 'occurrenceCount', 'rated',
            'lateJoin', 'enabled'],
        pause: ['actor', 'slug', 'seriesId'], resume: ['actor', 'slug', 'seriesId'],
        inspect: ['actor', 'slug', 'seriesId'],
        skip: ['actor', 'slug', 'seriesId', 'localDate', 'slotId', 'reason'],
        unskip: ['actor', 'slug', 'seriesId', 'localDate', 'slotId'],
        cancel: ['actor', 'slug', 'seriesId', 'tournamentId'],
        update: ['actor', 'slug', 'seriesId', 'capacity', 'minimumPlayers', 'durationMinutes', 'lateJoin', 'applyFuture']
    };
    if (Object.keys(value.payload).some((key) => !allowedByAction[value.action].includes(key))) {
        fail(`payload contains a field that is not allowed for ${value.action}.`);
    }
    if (value.action !== 'create') return;
    const required = ['slug', 'title', 'timeZone', 'frequencyUnit', 'interval', 'firstDate', 'leadDays',
        'pool', 'baseMs', 'incrementMs', 'durationMinutes', 'capacity', 'minimumPlayers', 'slots'];
    for (const key of required) if (value.payload[key] === undefined || value.payload[key] === null) fail(`payload.${key} is required.`);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(String(value.payload.slug))) fail('payload.slug is invalid.');
    if (value.payload.slug === 'saturdays-of-chess-s001') fail('The certified Saturdays of Chess series uses its dedicated operator path.');
    if (String(value.payload.title).trim().length < 3 || String(value.payload.title).trim().length > 120) fail('payload.title is invalid.');
    if (!['daily', 'weekly'].includes(value.payload.frequencyUnit)) fail('frequencyUnit must be daily or weekly.');
    const integerRules = {
        interval: [1, value.payload.frequencyUnit === 'daily' ? 30 : 52],
        leadDays: [1, 30], baseMs: [10000, 86400000], incrementMs: [0, 600000],
        durationMinutes: [5, 180], capacity: [4, 100], minimumPlayers: [2, Number(value.payload.capacity)]
    };
    for (const [key, [minimum, maximum]] of Object.entries(integerRules)) {
        if (!Number.isInteger(value.payload[key]) || value.payload[key] < minimum || value.payload[key] > maximum) {
            fail(`payload.${key} is outside its certified range.`);
        }
    }
    if (!['bullet', 'blitz', 'rapid'].includes(value.payload.pool)) fail('payload.pool is invalid.');
    if (!/^\d{4}-\d{2}-\d{2}$/u.test(String(value.payload.firstDate))) fail('payload.firstDate must be YYYY-MM-DD.');
    if (!Array.isArray(value.payload.slots) || value.payload.slots.length < 1 || value.payload.slots.length > 8) {
        fail('slots must contain one to eight local start times.');
    }
    const slotIds = new Set();
    for (const slot of value.payload.slots) {
        if (!slot || typeof slot !== 'object' || Array.isArray(slot)
            || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(String(slot.id || ''))
            || String(slot.label || '').length < 3 || String(slot.label || '').length > 80
            || !Number.isInteger(slot.hour) || slot.hour < 0 || slot.hour > 23
            || !Number.isInteger(slot.minute) || slot.minute < 0 || slot.minute > 59
            || slotIds.has(slot.id)) fail('Each slot requires a unique id, label, hour and minute.');
        slotIds.add(slot.id);
    }
    const weekdays = value.payload.weekdays ?? [];
    if (!Array.isArray(weekdays)
        || (value.payload.frequencyUnit === 'daily' && weekdays.length !== 0)
        || (value.payload.frequencyUnit === 'weekly' && (weekdays.length < 1 || weekdays.length > 7))
        || weekdays.some((day) => !Number.isInteger(day) || day < 0 || day > 6)
        || new Set(weekdays).size !== weekdays.length) fail('payload.weekdays is invalid for the recurrence frequency.');
    const endMode = value.payload.endMode ?? 'never';
    if (!['never', 'on_date', 'after_count'].includes(endMode)
        || (endMode === 'never' && (value.payload.endDate !== undefined || value.payload.occurrenceCount !== undefined))
        || (endMode === 'on_date' && (!/^\d{4}-\d{2}-\d{2}$/u.test(String(value.payload.endDate || ''))
            || value.payload.endDate < value.payload.firstDate || value.payload.occurrenceCount !== undefined))
        || (endMode === 'after_count' && (!Number.isInteger(value.payload.occurrenceCount)
            || value.payload.occurrenceCount < 1 || value.payload.occurrenceCount > 100
            || value.payload.endDate !== undefined))) fail('The recurrence end rule is invalid.');
    if (value.payload.rated === true) fail('Rated official recurrence is not certified.');
}

function projectRef(value) {
    try {
        const hostname = new URL(value).hostname;
        const match = hostname.match(/^([a-z0-9]{20})\.supabase\.co$/u);
        return match?.[1] || '';
    } catch (_) {
        return '';
    }
}

function fail(message) {
    console.error(message);
    process.exit(1);
}
