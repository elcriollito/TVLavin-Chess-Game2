import { getSupabase } from './supabase.js';
import { PLAY_BETA } from './play-beta-policy.js';

const clean = result => {
    if (result?.error) throw new Error(`PLAY_BETA_STORE_${result.error.code || 'ERROR'}`);
    return Array.isArray(result?.data) ? result.data[0] : result?.data;
};
const bounded = promise => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('PLAY_BETA_STORE_TIMEOUT')), PLAY_BETA.storeTimeoutMs);
    Promise.resolve(promise).then(resolve, reject).finally(() => clearTimeout(timer));
});

export function createPlayBetaStore(client = getSupabase()) {
    return Object.freeze({
        program: async () => clean(await bounded(client.rpc('get_play_beta_program'))),
        redeem: async input => clean(await bounded(client.rpc('redeem_play_beta_invite', input))),
        session: async input => clean(await bounded(client.rpc('touch_play_beta_session', input))),
        revokeSession: async hash => clean(await bounded(client.rpc('revoke_play_beta_session', { p_session_hash: hash }))),
        feedback: async input => clean(await bounded(client.rpc('submit_play_beta_feedback', input))),
        adminCreateInvite: async input => clean(await bounded(client.rpc('admin_create_play_beta_invite', input))),
        adminRevokeInvite: async hash => clean(await bounded(client.rpc('admin_revoke_play_beta_invite', { p_invite_hash: hash }))),
        adminRevokeInviteSessions: async hash => clean(await bounded(client.rpc('admin_revoke_play_beta_invite_sessions', { p_invite_hash: hash }))),
        adminRevokeSession: async id => clean(await bounded(client.rpc('admin_revoke_play_beta_session', { p_session_id: id }))),
        adminRevokeAllSessions: async () => clean(await bounded(client.rpc('admin_revoke_all_play_beta_sessions'))),
        adminPurgeFeedback: async now => clean(await bounded(client.rpc('admin_purge_play_beta_feedback', { p_now: now }))),
        adminSetProgram: async enabled => clean(await bounded(client.rpc('admin_set_play_beta_program', { p_enabled: enabled }))),
        adminStatus: async () => clean(await bounded(client.rpc('admin_get_play_beta_status')))
    });
}
