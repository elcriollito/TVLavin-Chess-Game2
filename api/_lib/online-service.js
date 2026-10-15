import { getSupabase } from './supabase.js';
import { resolvePublicIdentity as resolveCanonicalPublicIdentity } from './public-identity.js';
import { projectOnlineState } from './online-public-projection.js';

export function createOnlineService(options = {}) {
    const db = options.db || getSupabase();
    const sleep = options.sleep || (milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)));
    const safeState = state => projectOnlineState(state, clerkIds => resolveIdentityMap(db, clerkIds));
    return Object.freeze({
        async resolvePublicIdentity(clerkId) {
            return resolveCanonicalPublicIdentity(clerkId, {
                store: {
                    getOrCreate: subject => rpc(db, 'caissa_public_identity_get_or_create', { p_clerk_id: subject })
                }
            });
        },
        async ensureGuestIdentity(clerkId) {
            const existing = await readGuestIdentity(db, clerkId);
            if (existing) return existing;
            const { error } = await db.from('users').insert({
                clerk_id: clerkId,
                email: null,
                role: 'online_guest',
                is_premium: false,
                credits: 0
            });
            if (error && String(error.code) !== '23505') {
                throw serviceError('GUEST_IDENTITY_SYNC_FAILED', error);
            }
            const created = await readGuestIdentity(db, clerkId);
            if (!created) throw serviceError('GUEST_IDENTITY_SYNC_FAILED', error);
            return created;
        },
        async joinQueue({ clerkId, displayName, control, rated }) {
            return safeState(await retryQueueBusy(() => rpc(db, 'caissa_online_join_queue', {
                p_clerk_id: clerkId,
                p_display_name: displayName,
                p_pool: control.pool,
                p_base_ms: control.baseMs,
                p_increment_ms: control.incrementMs,
                p_rated: rated
            }), sleep));
        },
        async leaveQueue(clerkId) {
            return safeState(await rpc(db, 'caissa_online_leave_queue', { p_clerk_id: clerkId }));
        },
        async getState(clerkId) {
            return safeState(await rpc(db, 'caissa_online_state', { p_clerk_id: clerkId }));
        },
        async getGame(gameId) {
            const { data, error } = await db.from('caissa_online_games')
                .select('*').eq('id', gameId).maybeSingle();
            if (error) throw serviceError('GAME_READ_FAILED', error);
            return data;
        },
        async getEvent(gameId, eventId) {
            const { data, error } = await db.from('caissa_online_game_events')
                .select('event_id,event_type').eq('game_id', gameId).eq('event_id', eventId).maybeSingle();
            if (error) throw serviceError('EVENT_READ_FAILED', error);
            return data;
        },
        async checkRateLimit({ clerkId, bucket, limit, windowSeconds }) {
            return rpc(db, 'caissa_online_check_rate_limit', {
                p_clerk_id: clerkId,
                p_bucket: bucket,
                p_limit: limit,
                p_window_seconds: windowSeconds
            });
        },
        async commitMove({ clerkId, gameId, eventId, expectedVersion, projection }) {
            return safeState(await rpc(db, 'caissa_online_commit_move', {
                p_clerk_id: clerkId,
                p_game_id: gameId,
                p_event_id: eventId,
                p_expected_version: expectedVersion,
                p_from: projection.move.from,
                p_to: projection.move.to,
                p_promotion: projection.move.promotion,
                p_san: projection.move.san,
                p_uci: projection.move.uci,
                p_next_fen: projection.fen,
                p_next_turn: projection.turn,
                p_result: projection.result,
                p_termination: projection.termination,
                p_pgn: projection.pgn,
                p_white_can_mate: projection.whiteCanMate,
                p_black_can_mate: projection.blackCanMate
            }));
        },
        async finishGame({ clerkId, gameId, eventId, reason }) {
            return safeState(await rpc(db, 'caissa_online_finish_game', {
                p_clerk_id: clerkId,
                p_game_id: gameId,
                p_event_id: eventId,
                p_reason: reason
            }));
        },
        async drawOffer({ clerkId, gameId, eventId, action }) {
            return safeState(await rpc(db, 'caissa_online_draw_offer', {
                p_clerk_id: clerkId,
                p_game_id: gameId,
                p_event_id: eventId,
                p_action: action
            }));
        },
        async createChallenge({ clerkId, targetClerkId, control, rated }) {
            return safeState(await rpc(db, 'caissa_online_create_challenge', {
                p_clerk_id: clerkId,
                p_target_clerk_id: targetClerkId,
                p_pool: control.pool,
                p_base_ms: control.baseMs,
                p_increment_ms: control.incrementMs,
                p_rated: rated
            }));
        },
        async respondChallenge({ clerkId, challengeId, action }) {
            return safeState(await rpc(db, 'caissa_online_respond_challenge', {
                p_clerk_id: clerkId,
                p_challenge_id: challengeId,
                p_action: action
            }));
        },
        async heartbeat(clerkId, displayName) {
            return safeState(await rpc(db, 'caissa_online_heartbeat', {
                p_clerk_id: clerkId,
                p_display_name: displayName
            }));
        }
    });
}

async function resolveIdentityMap(db, clerkIds) {
    const identities = {};
    for (let offset = 0; offset < clerkIds.length; offset += 100) {
        const chunk = clerkIds.slice(offset, offset + 100);
        Object.assign(identities, await rpc(
            db,
            'caissa_public_identity_resolve_many',
            { p_clerk_ids: chunk }
        ));
    }
    return identities;
}

async function readGuestIdentity(db, clerkId) {
    const { data, error } = await db.from('users')
        .select('id,clerk_id,role')
        .eq('clerk_id', clerkId)
        .maybeSingle();
    if (error) throw serviceError('GUEST_IDENTITY_SYNC_FAILED', error);
    if (!data) return null;
    if (data.role !== 'online_guest') throw serviceError('GUEST_IDENTITY_ROLE_CONFLICT');
    return data;
}

async function retryQueueBusy(operation, sleep) {
    const delays = [5, 15, 35];
    for (let attempt = 0; ; attempt += 1) {
        try {
            return await operation();
        } catch (error) {
            if (error?.code !== 'CAISSA_ONLINE_QUEUE_BUSY' || attempt >= delays.length) throw error;
            await sleep(delays[attempt]);
        }
    }
}

async function rpc(db, name, args) {
    const { data, error } = await db.rpc(name, args);
    if (error) throw serviceError(error.message?.match(/CAISSA_ONLINE_[A-Z_]+/)?.[0] || 'ONLINE_STORE_FAILED', error);
    return data;
}

function serviceError(code, cause) {
    const error = new Error(code);
    error.code = code;
    error.cause = cause;
    return error;
}
