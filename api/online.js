import { respondAuthFailure, setCorsHeaders } from './_lib/auth.js';
import { createOnlineAuthenticator, isOnlineGuestSubject } from './_lib/online-guest-auth.js';
import { checkRateLimit } from './_lib/rate-limit.js';
import { createOnlineService } from './_lib/online-service.js';
import {
    ONLINE_PROTOCOL_VERSION,
    createServerEnvelope,
    validateChallengeCreate,
    validateChallengeResponse,
    validateEnvelope,
    validateMove,
    validateQueueJoin
} from '../js/online/online-protocol.js';
import { applyAuthoritativeMove } from './_lib/online-game-engine.js';
import { sendOnlineGameBroadcast } from './_lib/online-realtime-broadcast.js';
import { trustedOnlineSourceKey } from './_lib/online-request-source.js';
import { getSupabasePublishableKey, getSupabaseUrl } from './_lib/supabase.js';

const ROLLOUTS = new Set(['off', 'internal', 'preview', 'production']);

export default async function handler(req, res, dependencies = {}) {
    if (!setCorsHeaders(req, res, ['GET', 'POST'])) return;
    if (req.method === 'OPTIONS') return res.status(200).end();
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    const contentLength = Number(req.headers?.['content-length'] || 0);
    if ((Number.isFinite(contentLength) && contentLength > 32 * 1024)
        || (req.method === 'POST' && serializedBodyBytes(req.body) > 32 * 1024)) {
        return res.status(413).json({ code: 'PAYLOAD_TOO_LARGE' });
    }

    const rollout = rolloutMode(dependencies.env || process.env);
    if (req.method === 'GET' && String(req.query?.action || 'config') === 'config') {
        return res.status(200).json(publicConfig(rollout, dependencies.env || process.env));
    }
    if (rollout === 'off') return res.status(404).json({ code: 'ONLINE_DISABLED' });

    const env = dependencies.env || process.env;
    const authenticate = dependencies.authenticate || createOnlineAuthenticator({ env });
    const auth = await authenticate(req);
    if (!auth.authenticated) return respondAuthFailure(res, auth);
    if (rollout === 'internal' && !internalUsers(env).has(auth.userId)) {
        return res.status(403).json({ code: 'ONLINE_INTERNAL_ONLY' });
    }

    const rate = (dependencies.rateLimit || checkRateLimit)(auth.userId, {
        windowMs: 60_000,
        max: req.method === 'POST' ? 90 : 120,
        prefix: 'caissa-online'
    });
    if (!rate.allowed) {
        res.setHeader('Retry-After', String(rate.retryAfter || 60));
        return res.status(429).json({ code: 'RATE_LIMITED' });
    }

    const service = dependencies.service || createOnlineService();
    try {
        let sourceKey = null;
        if (auth.guest) {
            if (typeof service.checkRateLimit !== 'function') {
                return res.status(503).json({ code: 'GUEST_OUTER_RATE_LIMIT_UNAVAILABLE' });
            }
            sourceKey = (dependencies.trustedSourceKey || trustedOnlineSourceKey)(req, env);
            if (!sourceKey) return res.status(503).json({ code: 'TRUSTED_SOURCE_UNAVAILABLE' });
            const outerPolicies = [
                { clerkId: 'online-global', bucket: 'guest-outer', limit: 1000, windowSeconds: 60 },
                { clerkId: sourceKey, bucket: 'guest-outer', limit: 300, windowSeconds: 60 }
            ];
            for (const policy of outerPolicies) {
                const outerRate = await service.checkRateLimit(policy);
                if (!outerRate?.allowed) return rateLimited(res, outerRate);
            }
        }

        let commandEvent = null;
        let validationFailure = null;
        if (req.method === 'GET') {
            if (String(req.query?.action || 'state') !== 'state') {
                validationFailure = { status: 404, code: 'UNKNOWN_ACTION' };
            }
        } else if (req.method === 'POST') {
            const checked = validateEnvelope(req.body);
            if (!checked.ok) validationFailure = { status: 400, code: checked.code };
            else commandEvent = checked.value;
        } else {
            validationFailure = { status: 405, code: 'METHOD_NOT_ALLOWED' };
        }

        const sharedPolicy = distributedRatePolicy(req, commandEvent);
        if (typeof service.checkRateLimit === 'function') {
            const sharedRate = await service.checkRateLimit({ clerkId: auth.userId, ...sharedPolicy });
            if (!sharedRate?.allowed) return rateLimited(res, sharedRate);
        } else if (rollout === 'production') {
            return res.status(503).json({ code: 'SHARED_RATE_LIMIT_UNAVAILABLE' });
        }
        if (validationFailure) {
            return res.status(validationFailure.status).json({ code: validationFailure.code });
        }
        if (auth.guest && requiresGuestProvision(commandEvent)) {
            if (typeof service.ensureGuestIdentity !== 'function') {
                return res.status(503).json({ code: 'GUEST_IDENTITY_UNAVAILABLE' });
            }
            const provisionRate = await service.checkRateLimit({
                clerkId: sourceKey,
                bucket: 'guest-provision',
                limit: 30,
                windowSeconds: 60
            });
            if (!provisionRate?.allowed) return rateLimited(res, provisionRate);
            await service.ensureGuestIdentity(auth.userId);
        }
        if (req.method === 'GET') return handleRead(req, res, auth, service);
        return handleCommand(req, res, auth, service, dependencies, commandEvent);
    } catch (error) {
        const mapped = mapError(error?.code || error?.message);
        console.warn('caissa_online_request_failed', {
            code: mapped.code,
            action: String(req.query?.action || 'command'),
            correlationId: requestId(req)
        });
        return res.status(mapped.status).json({ code: mapped.code, correlationId: requestId(req) });
    }
}

async function handleRead(req, res, auth, service) {
    if (String(req.query?.action || 'state') !== 'state') return res.status(404).json({ code: 'UNKNOWN_ACTION' });
    const state = await service.getState(auth.userId);
    return res.status(200).json(createServerEnvelope('game.snapshot', { state }, {
        correlationId: requestId(req),
        gameId: state?.game?.id || null,
        version: state?.game?.version || null
    }));
}

async function handleCommand(req, res, auth, service, dependencies, event) {
    if (event.eventType === 'presence.join') {
        const displayName = await resolveOnlineDisplayName(auth, service);
        const state = await service.heartbeat(auth.userId, displayName);
        return res.status(200).json(createServerEnvelope('presence.snapshot', { state }, { correlationId: event.eventId }));
    }
    if (event.eventType === 'queue.join') {
        const displayName = await resolveOnlineDisplayName(auth, service);
        const queue = validateQueueJoin(event.payload);
        if (!queue.ok) return res.status(400).json({ code: queue.code });
        const queueRated = auth.guest ? false : queue.value.rated;
        if (queueRated && (dependencies.env || process.env).CAISSA_ONLINE_RATED !== '1') {
            return res.status(403).json({ code: 'RATED_NOT_ENABLED' });
        }
        const state = await service.joinQueue({
            clerkId: auth.userId,
            displayName,
            ...queue.value,
            rated: queueRated
        });
        const type = state?.game ? 'match.found' : 'queue.status';
        audit(type, { gameId: state?.game?.id || null, pool: queue.value.control.pool, rated: queueRated });
        return res.status(state?.game ? 201 : 202).json(createServerEnvelope(type, { state }, {
            correlationId: event.eventId,
            gameId: state?.game?.id || null,
            version: state?.game?.version || null
        }));
    }
    if (event.eventType === 'queue.leave') {
        const state = await service.leaveQueue(auth.userId);
        return res.status(200).json(createServerEnvelope('queue.status', { state }, { correlationId: event.eventId }));
    }
    if (event.eventType === 'challenge.create') {
        const challenge = validateChallengeCreate(event.payload);
        if (!challenge.ok) return res.status(400).json({ code: challenge.code });
        const challengeRated = auth.guest || isOnlineGuestSubject(challenge.value.targetClerkId)
            ? false : challenge.value.rated;
        if (challengeRated && (dependencies.env || process.env).CAISSA_ONLINE_RATED !== '1') {
            return res.status(403).json({ code: 'RATED_NOT_ENABLED' });
        }
        const state = await service.createChallenge({
            clerkId: auth.userId,
            targetClerkId: challenge.value.targetClerkId,
            control: challenge.value.control,
            rated: challengeRated
        });
        return res.status(201).json(createServerEnvelope('challenge.updated', { state }, { correlationId: event.eventId }));
    }
    if (event.eventType === 'challenge.accept' || event.eventType === 'challenge.decline') {
        const challenge = validateChallengeResponse(event.payload);
        if (!challenge.ok) return res.status(400).json({ code: challenge.code });
        const state = await service.respondChallenge({
            clerkId: auth.userId,
            challengeId: challenge.value.challengeId,
            action: event.eventType === 'challenge.accept' ? 'accept' : 'decline'
        });
        return res.status(200).json(createServerEnvelope(
            state?.game ? 'match.found' : 'challenge.updated', { state }, {
                correlationId: event.eventId, gameId: state?.game?.id, version: state?.game?.version
            }
        ));
    }
    if (event.eventType === 'game.sync') {
        const state = await service.getState(auth.userId);
        return res.status(200).json(createServerEnvelope('game.snapshot', { state }, {
            correlationId: event.eventId, gameId: state?.game?.id, version: state?.game?.version
        }));
    }
    if (event.eventType === 'game.move') {
        const move = validateMove(event.payload);
        if (!move.ok || !event.gameId) return res.status(400).json({ code: move.code || 'GAME_ID_REQUIRED' });
        const game = await service.getGame(event.gameId);
        if (game && ![game.white_clerk_id, game.black_clerk_id].includes(auth.userId)) {
            return res.status(403).json(createServerEnvelope('game.moveRejected', { reasonCode: 'NOT_A_PARTICIPANT' }, {
                correlationId: event.eventId, gameId: event.gameId
            }));
        }
        const replayed = game && typeof service.getEvent === 'function'
            ? await service.getEvent(event.gameId, event.eventId) : null;
        if (replayed) {
            const rawState = await service.getState(auth.userId);
            const state = focusCompletedGame(rawState, event.gameId);
            const type = replayed.event_type === 'game.result' ? 'game.result' : 'game.moveAccepted';
            return res.status(200).json(createServerEnvelope(type, { state, replayed: true }, {
                correlationId: event.eventId, gameId: event.gameId, version: state?.game?.version
            }));
        }
        const projected = (dependencies.applyMove || applyAuthoritativeMove)(game, auth.userId, move.value);
        if (!projected.ok) {
            if (projected.timeout) {
                const rawState = await service.finishGame({
                    clerkId: auth.userId, gameId: event.gameId, eventId: event.eventId, reason: 'timeout'
                });
                const state = focusCompletedGame(rawState, event.gameId);
                return res.status(409).json(createServerEnvelope('game.result', { state, reasonCode: 'TIME_EXPIRED' }, {
                    correlationId: event.eventId, gameId: event.gameId, version: state?.game?.version
                }));
            }
            return res.status(409).json(createServerEnvelope('game.moveRejected', { reasonCode: projected.code }, {
                correlationId: event.eventId, gameId: event.gameId, version: game?.version
            }));
        }
        const rawState = await service.commitMove({
            clerkId: auth.userId,
            gameId: event.gameId,
            eventId: event.eventId,
            expectedVersion: move.value.expectedVersion,
            projection: projected.value
        });
        const state = rawState?.game ? rawState : focusCompletedGame(rawState, event.gameId);
        const acceptedType = state?.game?.status === 'completed' ? 'game.result' : 'game.moveAccepted';
        audit(acceptedType, {
            gameId: event.gameId,
            version: state?.game?.version || null,
            ply: state?.game?.ply || null,
            termination: projected.value.termination || null
        });
        await notifyGameChange(dependencies, dependencies.env || process.env, {
            gameId: event.gameId,
            version: state?.game?.version,
            eventType: acceptedType,
            correlationId: event.eventId
        });
        return res.status(200).json(createServerEnvelope(
            acceptedType,
            { state },
            { correlationId: event.eventId, gameId: event.gameId, version: state?.game?.version }
        ));
    }
    if (event.eventType === 'game.resign' || event.eventType === 'game.drawAccept') {
        if (!event.gameId) return res.status(400).json({ code: 'GAME_ID_REQUIRED' });
        const rawState = await service.finishGame({
            clerkId: auth.userId,
            gameId: event.gameId,
            eventId: event.eventId,
            reason: event.eventType === 'game.resign' ? 'resignation' : 'agreement'
        });
        const state = focusCompletedGame(rawState, event.gameId);
        return res.status(200).json(createServerEnvelope('game.result', { state }, {
            correlationId: event.eventId, gameId: event.gameId, version: state?.game?.version
        }));
    }
    if (event.eventType === 'game.rematch') {
        if (!event.gameId) return res.status(400).json({ code: 'GAME_ID_REQUIRED' });
        const game = await service.getGame(event.gameId);
        if (!game || game.status !== 'completed') return res.status(409).json({ code: 'GAME_NOT_COMPLETE' });
        const targetClerkId = auth.userId === game.white_clerk_id ? game.black_clerk_id
            : auth.userId === game.black_clerk_id ? game.white_clerk_id : null;
        if (!targetClerkId) return res.status(403).json({ code: 'NOT_A_PARTICIPANT' });
        const state = await service.createChallenge({
            clerkId: auth.userId,
            targetClerkId,
            control: { pool: game.pool, baseMs: game.base_ms, incrementMs: game.increment_ms },
            rated: game.rated === true
                && !auth.guest
                && !isOnlineGuestSubject(targetClerkId)
                && (dependencies.env || process.env).CAISSA_ONLINE_RATED === '1'
        });
        return res.status(201).json(createServerEnvelope('challenge.updated', { state }, {
            correlationId: event.eventId, gameId: event.gameId, version: game.version
        }));
    }
    if (event.eventType === 'game.drawOffer' || event.eventType === 'game.drawDecline') {
        if (!event.gameId) return res.status(400).json({ code: 'GAME_ID_REQUIRED' });
        const state = await service.drawOffer({
            clerkId: auth.userId,
            gameId: event.gameId,
            eventId: event.eventId,
            action: event.eventType === 'game.drawOffer' ? 'offer' : 'decline'
        });
        return res.status(200).json(createServerEnvelope('game.snapshot', { state }, {
            correlationId: event.eventId, gameId: event.gameId, version: state?.game?.version
        }));
    }
    return res.status(501).json({ code: 'EVENT_NOT_ENABLED' });
}

function publicConfig(rollout, env) {
    const enabled = rollout !== 'off';
    const realtimeUrl = getSupabaseUrl(env);
    const publishableKey = getSupabasePublishableKey(env);
    return {
        protocolVersion: ONLINE_PROTOCOL_VERSION,
        rollout,
        enabled,
        capabilities: {
            matchmaking: enabled,
            guestPlay: !!(enabled && rollout !== 'internal'
                && env.CAISSA_ONLINE_GUESTS === '1' && realtimeUrl && publishableKey),
            rated: enabled && env.CAISSA_ONLINE_RATED === '1',
            chat: false,
            tournaments: enabled && env.CAISSA_ONLINE_TOURNAMENTS === '1',
            tournamentCreation: false,
            arena24h: false,
            multiboard: enabled && env.CAISSA_ONLINE_MULTIBOARD === '1',
            spectators: enabled && env.CAISSA_ONLINE_SPECTATORS === '1'
        },
        realtime: enabled && realtimeUrl && publishableKey ? {
            url: realtimeUrl,
            publishableKey
        } : null
    };
}

function rolloutMode(env) {
    const value = String(env.CAISSA_ONLINE_ROLLOUT || 'off').toLowerCase();
    return ROLLOUTS.has(value) ? value : 'off';
}

function internalUsers(env) {
    return new Set(String(env.CAISSA_ONLINE_INTERNAL_USERS || '').split(',').map(value => value.trim()).filter(Boolean));
}

async function resolveOnlineDisplayName(auth, service) {
    if (auth?.guest) {
        const suffix = String(auth.userId || '').replace(/-/g, '').slice(-6).toUpperCase();
        return `Guest-${suffix || 'PLAYER'}`;
    }
    if (typeof service.resolvePublicIdentity !== 'function') {
        const error = new Error('PUBLIC_IDENTITY_UNAVAILABLE');
        error.code = 'PUBLIC_IDENTITY_UNAVAILABLE';
        throw error;
    }
    const identity = await service.resolvePublicIdentity(auth.userId);
    const displayName = String(identity?.displayName || '');
    if (!displayName || /[<>\u0000-\u001f\u007f]/u.test(displayName)) {
        const error = new Error('PUBLIC_IDENTITY_UNAVAILABLE');
        error.code = 'PUBLIC_IDENTITY_UNAVAILABLE';
        throw error;
    }
    return displayName;
}

function requestId(req) {
    return String(req.headers?.['x-vercel-id'] || req.headers?.['x-request-id'] || 'online-request').slice(0, 120);
}

function audit(event, fields = {}) {
    console.info(JSON.stringify({ scope: 'caissa-online', event, ...fields }));
}

async function notifyGameChange(dependencies, env, payload) {
    try {
        return await (dependencies.broadcastGameChange || sendOnlineGameBroadcast)({ ...payload, env });
    } catch (error) {
        console.warn('caissa_online_realtime_broadcast_failed', {
            code: String(error?.message || 'ONLINE_REALTIME_BROADCAST_FAILED').slice(0, 80),
            gameId: payload.gameId,
            version: payload.version
        });
        return { delivered: false, reason: 'send-failed' };
    }
}

function focusCompletedGame(state, gameId) {
    if (!state || state.game) return state;
    const completed = state.recentGames?.find?.(game => game.id === gameId) || null;
    return completed ? { ...state, game: completed } : state;
}

function mapError(code) {
    const value = String(code || 'ONLINE_SERVICE_UNAVAILABLE');
    if (value.includes('NOT_PARTICIPANT')) return { status: 403, code: 'NOT_A_PARTICIPANT' };
    if (value.includes('STALE_VERSION')) return { status: 409, code: 'STALE_VERSION' };
    if (value.includes('DUPLICATE')) return { status: 409, code: 'DUPLICATE_EVENT' };
    if (value.includes('DRAW_OFFER_REQUIRED')) return { status: 409, code: 'DRAW_OFFER_REQUIRED' };
    if (value.includes('NOT_FOUND')) return { status: 404, code: 'GAME_NOT_FOUND' };
    return { status: 503, code: 'ONLINE_SERVICE_UNAVAILABLE' };
}

function serializedBodyBytes(body) {
    if (body == null) return 0;
    try { return Buffer.byteLength(JSON.stringify(body), 'utf8'); }
    catch (_) { return Number.POSITIVE_INFINITY; }
}

function distributedRatePolicy(req, event) {
    if (req.method === 'GET') return { bucket: 'read', limit: 120, windowSeconds: 60 };
    if (event?.eventType === 'challenge.create' || event?.eventType === 'game.rematch') {
        return { bucket: 'challenge-create', limit: 20, windowSeconds: 60 };
    }
    return { bucket: 'write', limit: 90, windowSeconds: 60 };
}

function requiresGuestProvision(event) {
    return new Set(['presence.join', 'queue.join', 'challenge.create']).has(event?.eventType);
}

function rateLimited(res, rate) {
    res.setHeader('Retry-After', String(Math.max(1, Number(rate?.retryAfter || 60))));
    return res.status(429).json({ code: 'RATE_LIMITED' });
}
