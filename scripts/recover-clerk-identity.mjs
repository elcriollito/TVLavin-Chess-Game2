import crypto from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseArgs(argv) {
    const flags = new Map();
    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        if (!arg.startsWith('--')) throw new Error('INVALID_ARGUMENTS');
        if (['--dry-run', '--execute', '--rollback'].includes(arg)) flags.set(arg, true);
        else {
            const value = argv[index + 1];
            if (!value || value.startsWith('--')) throw new Error('INVALID_ARGUMENTS');
            flags.set(arg, value); index += 1;
        }
    }
    const modes = ['--dry-run', '--execute', '--rollback'].filter((flag) => flags.has(flag));
    if (modes.length !== 1) throw new Error('EXACTLY_ONE_MODE_REQUIRED');
    const userId = flags.get('--user-id');
    const reason = flags.get('--reason');
    if (!UUID.test(userId || '') || typeof reason !== 'string' || reason.trim().length < 20) {
        throw new Error('UUID_AND_DETAILED_REASON_REQUIRED');
    }
    return { flags, mode: modes[0], userId, reason: reason.trim() };
}

function sha256(value) {
    return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

async function serviceRpc(client, sql, params) {
    await client.query('BEGIN');
    try {
        await client.query('SET LOCAL ROLE service_role');
        const result = await client.query(sql, params);
        await client.query('COMMIT');
        return result.rows[0];
    } catch {
        await client.query('ROLLBACK').catch(() => {});
        throw new Error('RECOVERY_OPERATION_FAILED');
    }
}

export async function runRecoveryCli({ argv = process.argv.slice(2), env = process.env, ClientClass } = {}) {
    const { flags, mode, userId, reason } = parseArgs(argv);
    if (env.CAISSA_IDENTITY_RECOVERY_ENVIRONMENT !== 'isolated-rehearsal') {
        throw new Error('RECOVERY_ENVIRONMENT_NOT_AUTHORIZED');
    }
    const connectionString = env.CAISSA_IDENTITY_MIGRATION_REHEARSAL_DATABASE_URL;
    if (!connectionString) throw new Error('RECOVERY_DATABASE_NOT_CONFIGURED');
    const PgClient = ClientClass || require('pg').Client;
    const db = new PgClient({ connectionString, application_name: 'caissa-manual-identity-recovery' });
    await db.connect();
    try {
        if (mode === '--dry-run') {
            const target = flags.get('--target-subject');
            if (typeof target !== 'string' || target.length < 3 || target.length > 512) throw new Error('TARGET_SUBJECT_REQUIRED');
            const confirmation = `RECOVER ${userId}`;
            const row = await serviceRpc(db,
                `select * from public.preview_manual_clerk_identity_recovery($1,$2,$3,$4,now()+interval '10 minutes')`,
                [userId, target, reason, sha256(confirmation)]);
            return {
                ok: row?.success === true,
                code: row?.code || 'RECOVERY_OPERATION_FAILED',
                previewId: row?.preview_id || null,
                userId,
                targetFingerprint: sha256(target).slice(0, 12),
                confirmationRequired: confirmation
            };
        }

        if (mode === '--execute') {
            const target = flags.get('--target-subject');
            const previewId = flags.get('--preview-id');
            const confirmation = flags.get('--confirm');
            if (typeof target !== 'string' || target.length < 3 || target.length > 512
                || !UUID.test(previewId || '') || confirmation !== `RECOVER ${userId}`) {
                throw new Error('EXPLICIT_CONFIRMATION_REQUIRED');
            }
            const row = await serviceRpc(db,
                `select * from public.execute_manual_clerk_identity_recovery($1,$2,$3,$4,$5)`,
                [previewId, userId, target, reason, sha256(confirmation)]);
            return { ok: row?.success === true, code: row?.code || 'RECOVERY_OPERATION_FAILED', userId };
        }

        const confirmation = flags.get('--confirm');
        if (confirmation !== `ROLLBACK ${userId}`) throw new Error('EXPLICIT_CONFIRMATION_REQUIRED');
        const row = await serviceRpc(db,
            `select * from public.rollback_clerk_identity_binding_confirmed($1,$2,$3)`,
            [userId, reason, confirmation]);
        return { ok: row?.success === true, code: row?.code || 'RECOVERY_OPERATION_FAILED', userId };
    } finally {
        await db.end();
    }
}

async function main() {
    try {
        const result = await runRecoveryCli();
        console.log(JSON.stringify(result, null, 2));
        if (!result.ok) process.exitCode = 1;
    } catch (error) {
        console.error(JSON.stringify({ ok: false, error: error.message }));
        process.exitCode = 1;
    }
}

if (process.argv[1] && import.meta.url === new URL(`file:///${process.argv[1].replaceAll('\\', '/')}`).href) main();

export const recoveryCliInternals = Object.freeze({ parseArgs, sha256 });
