#!/usr/bin/env node
import fs from 'node:fs';
import { PLAY_BETA, hashSecret, randomSecret } from '../api/_lib/play-beta-policy.js';
import { createPlayBetaStore } from '../api/_lib/play-beta-store.js';

const [command, ...args] = process.argv.slice(2);
const option = name => { const at = args.indexOf(`--${name}`); return at >= 0 ? args[at + 1] : null; };
const flag = name => args.includes(`--${name}`);
const secretFromStdin = () => {
    if (!flag('token-stdin') || flag('token')) throw new Error('Read the invitation token from stdin with --token-stdin; command-line tokens are prohibited.');
    return fs.readFileSync(0, 'utf8').trim();
};
const destructive = new Set(['revoke-invite', 'revoke-sessions', 'revoke-session', 'revoke-all-sessions', 'purge-feedback', 'disable']);
const requireConfirmation = () => {
    if (destructive.has(command) && !flag('confirm'))
        throw new Error(`Refusing destructive command ${command}. Re-run with --confirm after verifying the target.`);
};
const requireConfig = () => {
    if (!(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL) || !process.env.SUPABASE_SERVICE_ROLE_KEY)
        throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in this process only.');
};
const output = value => process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);

async function main() {
    requireConfig(); requireConfirmation(); const store = createPlayBetaStore();
    if (command === 'create') {
        const token = randomSecret(); const cohort = option('cohort') || 'initial-five';
        const expiresAt = new Date(Date.now() + PLAY_BETA.inviteTtlMs).toISOString();
        const id = await store.adminCreateInvite({ p_invite_hash: hashSecret(token), p_cohort: cohort,
            p_coach_enabled: flag('coach'), p_expires_at: expiresAt, p_max_redemptions: PLAY_BETA.maxRedemptions });
        output({ id, cohort, coach: flag('coach'), expiresAt, maximumRedemptions: PLAY_BETA.maxRedemptions,
            inviteUrlFragment: `/play/beta/invite#${token}` });
        return;
    }
    const token = ['revoke-invite','revoke-sessions'].includes(command) ? secretFromStdin() : null;
    if (['revoke-invite','revoke-sessions'].includes(command) && !/^[A-Za-z0-9_-]{43}$/.test(String(token || '')))
        throw new Error('stdin did not contain a valid invitation token. It is hashed before transmission.');
    if (command === 'revoke-invite') return output({ revoked: await store.adminRevokeInvite(hashSecret(token)) });
    if (command === 'revoke-sessions') return output({ revokedSessions: await store.adminRevokeInviteSessions(hashSecret(token)) });
    if (command === 'revoke-session') {
        const id = option('id');
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(id || '')))
            throw new Error('Provide a session UUID with --id.');
        return output({ revoked: await store.adminRevokeSession(id) });
    }
    if (command === 'revoke-all-sessions') return output({ revokedSessions: await store.adminRevokeAllSessions() });
    if (command === 'purge-feedback') return output({ deletedFeedback: await store.adminPurgeFeedback(new Date().toISOString()) });
    if (command === 'enable') return output({ enabled: await store.adminSetProgram(true) });
    if (command === 'disable') return output({ enabled: await store.adminSetProgram(false) });
    if (command === 'status') return output(await store.adminStatus());
    throw new Error('Usage: create [--cohort name] [--coach] | revoke-invite --token-stdin --confirm | revoke-sessions --token-stdin --confirm | revoke-session --id UUID --confirm | revoke-all-sessions --confirm | purge-feedback --confirm | enable | disable --confirm | status');
}

main().catch(error => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
