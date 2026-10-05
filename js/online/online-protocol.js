export const ONLINE_PROTOCOL_VERSION = '1.0.0';

export const ONLINE_EVENTS = Object.freeze({
    client: Object.freeze([
        'presence.join', 'queue.join', 'queue.leave', 'challenge.create',
        'challenge.accept', 'challenge.decline', 'game.move', 'game.resign',
        'game.drawOffer', 'game.drawAccept', 'game.drawDecline', 'game.sync',
        'game.rematch', 'spectate.join', 'spectate.leave', 'tournament.join'
    ]),
    server: Object.freeze([
        'presence.snapshot', 'queue.status', 'match.found', 'game.snapshot',
        'game.moveAccepted', 'game.moveRejected', 'game.clock', 'game.result',
        'game.reconnect', 'challenge.received', 'challenge.updated',
        'spectate.snapshot', 'tournament.snapshot', 'error'
    ])
});

export const TIME_CONTROLS = Object.freeze([
    Object.freeze({ id: 'bullet-1-0', label: '1+0', pool: 'bullet', baseMs: 60_000, incrementMs: 0 }),
    Object.freeze({ id: 'blitz-3-2', label: '3+2', pool: 'blitz', baseMs: 180_000, incrementMs: 2_000 }),
    Object.freeze({ id: 'blitz-5-0', label: '5+0', pool: 'blitz', baseMs: 300_000, incrementMs: 0 }),
    Object.freeze({ id: 'rapid-10-0', label: '10+0', pool: 'rapid', baseMs: 600_000, incrementMs: 0 }),
    Object.freeze({ id: 'rapid-15-10', label: '15+10', pool: 'rapid', baseMs: 900_000, incrementMs: 10_000 })
]);

const TIME_CONTROL_BY_ID = new Map(TIME_CONTROLS.map(control => [control.id, control]));
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SQUARE = /^[a-h][1-8]$/;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9:_-]{12,120}$/;

export function normalizeTimeControl(value) {
    const control = TIME_CONTROL_BY_ID.get(String(value || ''));
    return control ? Object.freeze({ ...control }) : null;
}

export function validateEnvelope(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return failure('INVALID_ENVELOPE');
    if (input.protocolVersion !== ONLINE_PROTOCOL_VERSION) return failure('UNSUPPORTED_PROTOCOL');
    if (!ONLINE_EVENTS.client.includes(input.eventType)) return failure('UNKNOWN_EVENT');
    if (!IDEMPOTENCY_KEY.test(String(input.eventId || ''))) return failure('INVALID_EVENT_ID');
    if (input.gameId != null && !UUID.test(String(input.gameId))) return failure('INVALID_GAME_ID');
    const clientSentAt = Number(input.clientSentAt);
    if (!Number.isFinite(clientSentAt) || clientSentAt <= 0) return failure('INVALID_TIMESTAMP');
    const payload = input.payload && typeof input.payload === 'object' && !Array.isArray(input.payload)
        ? input.payload : {};
    return Object.freeze({
        ok: true,
        value: Object.freeze({
            protocolVersion: ONLINE_PROTOCOL_VERSION,
            eventType: input.eventType,
            eventId: input.eventId,
            gameId: input.gameId || null,
            clientSentAt,
            payload: Object.freeze({ ...payload })
        })
    });
}

export function validateQueueJoin(payload) {
    const control = payload?.timeControlId === 'custom' ? normalizeCustomTimeControl(payload) : normalizeTimeControl(payload?.timeControlId);
    if (!control) return failure('INVALID_TIME_CONTROL');
    const rated = payload?.rated === true;
    return Object.freeze({ ok: true, value: Object.freeze({ control, rated }) });
}

function normalizeCustomTimeControl(payload) {
    const baseMinutes = Number(payload?.baseMinutes);
    const incrementSeconds = Number(payload?.incrementSeconds);
    if (!Number.isSafeInteger(baseMinutes) || baseMinutes < 1 || baseMinutes > 180
        || !Number.isSafeInteger(incrementSeconds) || incrementSeconds < 0 || incrementSeconds > 60) return null;
    const baseMs = baseMinutes * 60_000;
    const incrementMs = incrementSeconds * 1_000;
    const estimatedMs = baseMs + (40 * incrementMs);
    const pool = estimatedMs < 180_000 ? 'bullet' : estimatedMs < 600_000 ? 'blitz' : 'rapid';
    return Object.freeze({ id: 'custom', label: `${baseMinutes}+${incrementSeconds}`, pool, baseMs, incrementMs });
}

export function validateMove(payload) {
    const from = String(payload?.from || '').toLowerCase();
    const to = String(payload?.to || '').toLowerCase();
    const promotion = payload?.promotion == null ? null : String(payload.promotion).toLowerCase();
    const expectedVersion = Number(payload?.expectedVersion);
    if (!SQUARE.test(from) || !SQUARE.test(to) || from === to) return failure('INVALID_MOVE');
    if (promotion !== null && !/^[qrbn]$/.test(promotion)) return failure('INVALID_PROMOTION');
    if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1) return failure('INVALID_VERSION');
    return Object.freeze({ ok: true, value: Object.freeze({ from, to, promotion, expectedVersion }) });
}

export function validateChallengeCreate(payload) {
    const queue = validateQueueJoin(payload);
    if (!queue.ok) return queue;
    const targetClerkId = String(payload?.targetClerkId || '');
    if (!/^[A-Za-z0-9_-]{6,80}$/.test(targetClerkId)) return failure('INVALID_CHALLENGE_TARGET');
    return Object.freeze({ ok: true, value: Object.freeze({ ...queue.value, targetClerkId }) });
}

export function validateChallengeResponse(payload) {
    const challengeId = String(payload?.challengeId || '');
    if (!UUID.test(challengeId)) return failure('INVALID_CHALLENGE_ID');
    return Object.freeze({ ok: true, value: Object.freeze({ challengeId }) });
}

export function createServerEnvelope(eventType, data = {}, context = {}) {
    if (!ONLINE_EVENTS.server.includes(eventType)) throw new TypeError('Unknown server event');
    return Object.freeze({
        protocolVersion: ONLINE_PROTOCOL_VERSION,
        eventType,
        correlationId: context.correlationId || null,
        serverTimestamp: context.serverTimestamp || new Date().toISOString(),
        gameId: context.gameId || null,
        version: Number.isSafeInteger(context.version) ? context.version : null,
        data: Object.freeze({ ...data })
    });
}

function failure(code) {
    return Object.freeze({ ok: false, code });
}
