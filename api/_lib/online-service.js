import { getSupabase } from './supabase.js';

export function createOnlineService(options = {}) {
    const db = options.db || getSupabase();
    return Object.freeze({
        async joinQueue({ clerkId, displayName, control, rated }) {
            return rpc(db, 'caissa_online_join_queue', {
                p_clerk_id: clerkId,
                p_display_name: displayName,
                p_pool: control.pool,
                p_base_ms: control.baseMs,
                p_increment_ms: control.incrementMs,
                p_rated: rated
            });
        },
        async leaveQueue(clerkId) {
            return rpc(db, 'caissa_online_leave_queue', { p_clerk_id: clerkId });
        },
        async getState(clerkId) {
            return rpc(db, 'caissa_online_state', { p_clerk_id: clerkId });
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
            return rpc(db, 'caissa_online_commit_move', {
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
            });
        },
        async finishGame({ clerkId, gameId, eventId, reason }) {
            return rpc(db, 'caissa_online_finish_game', {
                p_clerk_id: clerkId,
                p_game_id: gameId,
                p_event_id: eventId,
                p_reason: reason
            });
        },
        async drawOffer({ clerkId, gameId, eventId, action }) {
            return rpc(db, 'caissa_online_draw_offer', {
                p_clerk_id: clerkId,
                p_game_id: gameId,
                p_event_id: eventId,
                p_action: action
            });
        },
        async createChallenge({ clerkId, targetClerkId, control, rated }) {
            return rpc(db, 'caissa_online_create_challenge', {
                p_clerk_id: clerkId,
                p_target_clerk_id: targetClerkId,
                p_pool: control.pool,
                p_base_ms: control.baseMs,
                p_increment_ms: control.incrementMs,
                p_rated: rated
            });
        },
        async respondChallenge({ clerkId, challengeId, action }) {
            return rpc(db, 'caissa_online_respond_challenge', {
                p_clerk_id: clerkId,
                p_challenge_id: challengeId,
                p_action: action
            });
        },
        async heartbeat(clerkId, displayName) {
            return rpc(db, 'caissa_online_heartbeat', {
                p_clerk_id: clerkId,
                p_display_name: displayName
            });
        }
    });
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
