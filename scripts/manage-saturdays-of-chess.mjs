import { readFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';

const argv = process.argv.slice(2);
const execute = argv.includes('--execute');
const fileIndex = argv.indexOf('--file');
const file = fileIndex >= 0 ? argv[fileIndex + 1] : null;

if (!file) fail('Usage: node scripts/manage-saturdays-of-chess.mjs --file operation.json [--execute]');

const operation = JSON.parse(await readFile(file, 'utf8'));
validateOperation(operation);

if (!execute) {
    console.log(JSON.stringify({
        valid: true,
        dryRun: true,
        eventId: operation.eventId,
        action: operation.action
    }, null, 2));
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
const { data, error } = await client.rpc('caissa_online_weekly_admin', {
    p_clerk_id: operation.actor,
    p_event_id: operation.eventId,
    p_action: operation.action,
    p_payload: operation.payload
});
if (error) fail(`Saturdays of Chess operation failed: ${error.message}`);
console.log(JSON.stringify({ ok: true, projectRef: actualProjectRef, result: data }, null, 2));

function validateOperation(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail('Operation must be a JSON object.');
    if (!/^[A-Za-z0-9:_-]{12,120}$/u.test(String(value.eventId || ''))) fail('eventId is invalid.');
    if (!/^.{6,160}$/u.test(String(value.actor || ''))) fail('actor is required for the audit trail.');
    if (!['pause', 'enable', 'skip', 'cancel', 'update', 'inspect'].includes(value.action)) {
        fail('action is not supported.');
    }
    if (!value.payload || typeof value.payload !== 'object' || Array.isArray(value.payload)) {
        fail('payload must be an object.');
    }
    const allowedByAction = {
        pause: [], enable: [], inspect: [],
        skip: ['localDate', 'slotId', 'reason'],
        cancel: ['tournamentId'],
        update: ['capacity', 'minimumPlayers', 'registrationLeadDays', 'rated']
    };
    if (Object.keys(value.payload).some(key => !allowedByAction[value.action].includes(key))) {
        fail(`payload contains a field that is not allowed for ${value.action}.`);
    }
    if (['pause', 'enable', 'inspect'].includes(value.action) && Object.keys(value.payload).length !== 0) {
        fail(`${value.action} requires an empty payload.`);
    }
    if (value.action === 'skip') {
        if (!/^\d{4}-\d{2}-\d{2}$/u.test(String(value.payload.localDate || ''))
            || !/^[A-Za-z0-9_-]{1,80}$/u.test(String(value.payload.slotId || ''))
            || (value.payload.reason !== undefined
                && (typeof value.payload.reason !== 'string' || value.payload.reason.length > 240))) {
            fail('skip requires a valid localDate, slotId and optional bounded reason.');
        }
    }
    if (value.action === 'cancel'
        && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu
            .test(String(value.payload.tournamentId || ''))) {
        fail('cancel requires a valid tournamentId.');
    }
    if (value.action === 'update') {
        const capacity = Number(value.payload.capacity);
        const minimumPlayers = Number(value.payload.minimumPlayers);
        const leadDays = Number(value.payload.registrationLeadDays);
        if (!Number.isInteger(capacity) || capacity < 4 || capacity > 100
            || !Number.isInteger(minimumPlayers) || minimumPlayers < 4 || minimumPlayers > capacity
            || !Number.isInteger(leadDays) || leadDays < 1 || leadDays > 30
            || typeof value.payload.rated !== 'boolean') {
            fail('update values are outside the certified Saturdays of Chess bounds.');
        }
    }
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
