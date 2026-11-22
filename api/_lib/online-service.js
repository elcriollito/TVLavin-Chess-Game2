import { getSupabase } from './supabase.js';
import { resolvePublicIdentity as resolveCanonicalPublicIdentity } from './public-identity.js';
import { projectOnlineArenaState, projectOnlineState } from './online-public-projection.js';

export function createOnlineService(options = {}) {
    const db = options.db || getSupabase();
    const sleep = options.sleep || (milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)));
    const safeState = state => projectOnlineState(state, clerkIds => resolveIdentityMap(db, clerkIds));
    const tournamentIdentities = state => {
        const ids = tournamentIdentityIds(state);
        return ids.length ? rpc(db, 'caissa_online_tournament_identity_projection', { p_ids: ids }) : [];
    };
    const safeArenaState = async state => {
        const projected = await projectOnlineArenaState(state, clerkIds => resolveIdentityMap(db, clerkIds));
        return decorateTournamentIdentities(projected, await tournamentIdentities(projected));
    };
    const safeDailyState = async state => {
        const projected = (await projectOnlineState(
            { daily: state }, clerkIds => resolveIdentityMap(db, clerkIds)
        )).daily;
        return decorateTournamentIdentities(projected, await tournamentIdentities(projected));
    };
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
        },
        async getArenaState(clerkId, tournamentId = null) {
            return safeArenaState(await rpc(db, 'caissa_online_arena_sync', {
                p_clerk_id: clerkId,
                p_tournament_id: tournamentId
            }));
        },
        async createArena({ clerkId, eventId, name, startsAt, durationMinutes, capacity, lateJoin, rated, control }) {
            const args = {
                p_clerk_id: clerkId,
                p_event_id: eventId,
                p_name: name,
                p_starts_at: startsAt,
                p_duration_minutes: durationMinutes,
                p_pool: control.pool,
                p_base_ms: control.baseMs,
                p_increment_ms: control.incrementMs,
                p_capacity: capacity,
                p_late_join: lateJoin
            };
            if (rated === true) args.p_rated = true;
            return safeArenaState(await rpc(db, 'caissa_online_arena_create', args));
        },
        async joinArena({ clerkId, tournamentId, eventId }) {
            return safeArenaState(await rpc(db, 'caissa_online_arena_join', {
                p_clerk_id: clerkId,
                p_tournament_id: tournamentId,
                p_event_id: eventId
            }));
        },
        async withdrawArena({ clerkId, tournamentId, eventId }) {
            return safeArenaState(await rpc(db, 'caissa_online_arena_withdraw', {
                p_clerk_id: clerkId,
                p_tournament_id: tournamentId,
                p_event_id: eventId
            }));
        },
        async manageArena({ clerkId, tournamentId, eventId, action }) {
            return safeArenaState(await rpc(db, 'caissa_online_arena_manage', {
                p_clerk_id: clerkId,
                p_tournament_id: tournamentId,
                p_event_id: eventId,
                p_action: action
            }));
        },
        async getDailyState(clerkId, tournamentId = null, gameId = null) {
            return safeDailyState(await rpc(db, 'caissa_online_daily_sync', {
                p_clerk_id: clerkId,
                p_tournament_id: tournamentId,
                p_game_id: gameId
            }));
        },
        async createDaily({ clerkId, eventId, name, description, startsAt,
            daysPerMove, groupSize, qualifiersPerGroup, capacity, rated }) {
            return safeDailyState(await rpc(db, 'caissa_online_daily_create', {
                p_clerk_id: clerkId,
                p_event_id: eventId,
                p_name: name,
                p_description: description,
                p_starts_at: startsAt,
                p_days_per_move: daysPerMove,
                p_group_size: groupSize,
                p_qualifiers_per_group: qualifiersPerGroup,
                p_capacity: capacity,
                p_rated: rated === true
            }));
        },
        async joinDaily({ clerkId, tournamentId, eventId }) {
            return safeDailyState(await rpc(db, 'caissa_online_daily_join', {
                p_clerk_id: clerkId,
                p_tournament_id: tournamentId,
                p_event_id: eventId
            }));
        },
        async withdrawDaily({ clerkId, tournamentId, eventId }) {
            return safeDailyState(await rpc(db, 'caissa_online_daily_withdraw', {
                p_clerk_id: clerkId,
                p_tournament_id: tournamentId,
                p_event_id: eventId
            }));
        },
        async commitDailyMove({ clerkId, gameId, eventId, expectedVersion, projection }) {
            return safeDailyState(await rpc(db, 'caissa_online_daily_commit_move', {
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
                p_black_can_mate: projection.blackCanMate,
                p_next_deadline_at: projection.nextDeadlineAt
            }));
        },
        async finishDailyGame({ clerkId, gameId, eventId, reason }) {
            return safeDailyState(await rpc(db, 'caissa_online_daily_finish_game', {
                p_clerk_id: clerkId,
                p_game_id: gameId,
                p_event_id: eventId,
                p_reason: reason
            }));
        },
        async manageWeeklySeries({ clerkId, eventId, action, payload = {} }) {
            return rpc(db, 'caissa_online_weekly_admin', {
                p_clerk_id: clerkId,
                p_event_id: eventId,
                p_action: action,
                p_payload: payload
            });
        },
        async getRecurringSeries(clerkId) {
            return rpc(db, 'caissa_online_recurring_series_sync', { p_clerk_id: clerkId });
        },
        async createRecurringSeries({ clerkId, eventId, name, control, durationMinutes,
            capacity, lateJoin, rated, recurrence }) {
            return rpc(db, 'caissa_online_recurring_series_create', {
                p_clerk_id: clerkId,
                p_event_id: eventId,
                p_name: name,
                p_time_zone: recurrence.timeZone,
                p_frequency_unit: recurrence.frequencyUnit,
                p_interval: recurrence.interval,
                p_weekdays: recurrence.weekdays,
                p_first_date: recurrence.firstDate,
                p_local_time: recurrence.localTime,
                p_generation_lead_days: recurrence.leadDays,
                p_end_mode: recurrence.endMode,
                p_end_date: recurrence.endDate,
                p_end_after_occurrences: recurrence.occurrenceCount,
                p_enabled: recurrence.enabled,
                p_pool: control.pool,
                p_base_ms: control.baseMs,
                p_increment_ms: control.incrementMs,
                p_duration_minutes: durationMinutes,
                p_capacity: capacity,
                p_late_join: lateJoin,
                p_rated: rated === true
            });
        },
        async manageRecurringSeries({ clerkId, eventId, action, payload = {} }) {
            return rpc(db, 'caissa_online_recurring_series_manage', {
                p_clerk_id: clerkId,
                p_event_id: eventId,
                p_action: action,
                p_payload: payload
            });
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

export function decorateTournamentIdentities(state, identities) {
    if (!state || typeof state !== 'object') return state;
    const byId = new Map((Array.isArray(identities) ? identities : [])
        .filter(item => item?.id)
        .map(item => [String(item.id), Object.freeze({
            source: item.source,
            seriesId: item.seriesId || null,
            seriesKind: item.seriesKind || null,
            seriesSlug: item.seriesSlug || null
        })]));
    const decorate = tournament => {
        if (!tournament || typeof tournament !== 'object') return tournament;
        const identity = byId.get(String(tournament.id || tournament.tournamentId || ''));
        return identity ? { ...tournament, ...identity } : tournament;
    };
    return {
        ...state,
        tournaments: Array.isArray(state.tournaments) ? state.tournaments.map(decorate) : state.tournaments,
        current: decorate(state.current)
    };
}

function tournamentIdentityIds(state) {
    return [...new Set([
        ...(Array.isArray(state?.tournaments) ? state.tournaments.map(tournament => tournament?.id) : []),
        state?.current?.id
    ].filter(Boolean).map(String))].slice(0, 500);
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
    if (error) {
        const publicCode = error.message?.match(/CAISSA_(?:ONLINE|RECURRING)_[A-Z_]+/)?.[0];
        throw serviceError(publicCode || 'ONLINE_STORE_FAILED', error);
    }
    return data;
}

function serviceError(code, cause) {
    const error = new Error(code);
    error.code = code;
    error.cause = cause;
    return error;
}
