import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../../api/online.js';

function response() {
    return { statusCode: 200, headers: {}, body: null,
        setHeader(name, value) { this.headers[name] = value; },
        status(code) { this.statusCode = code; return this; },
        json(body) { this.body = body; return this; },
        end() { return this; }
    };
}

const allow = async () => ({ authenticated: true, userId: 'user_white', email: 'white@example.com' });
const rateLimit = () => ({ allowed: true });
const env = { CAISSA_ONLINE_ROLLOUT: 'preview', CAISSA_ONLINE_RATED: '1' };
const gameId = '11111111-1111-4111-8111-111111111111';

function command(eventType, overrides = {}) {
    const eventId = `${eventType.replaceAll('.', '-')}:123456789012`;
    return {
        method: 'POST', query: {}, headers: {}, body: {
            protocolVersion: '1.0.0', eventType, eventId,
            gameId, clientSentAt: Date.now(), payload: {}, ...overrides
        }
    };
}

test('public config is available without authentication and exposes no secret', async () => {
    const res = response();
    await handler({ method: 'GET', query: { action: 'config' }, headers: {} }, res, { env });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.enabled, true);
    assert.equal(JSON.stringify(res.body).includes('SERVICE_ROLE'), false);
});

test('move command validates locally then commits canonical projection through the service', async () => {
    let committed;
    const canonical = {
        id: '11111111-1111-4111-8111-111111111111', status: 'active',
        fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', initial_fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        moves: [], ply: 0, turn: 'white', version: 1, white_clerk_id: 'user_white', black_clerk_id: 'user_black',
        white_time_ms: 60_000, black_time_ms: 60_000, base_ms: 60_000, increment_ms: 0,
        clock_started_at: new Date(Date.now() + 5000).toISOString()
    };
    const service = {
        getGame: async () => canonical,
        commitMove: async input => { committed = input; return { game: { ...canonical, version: 2, fen: input.projection.fen } }; }
    };
    const req = { method: 'POST', query: {}, headers: {}, body: {
        protocolVersion: '1.0.0', eventType: 'game.move', eventId: 'move:123456789012',
        gameId: canonical.id, clientSentAt: Date.now(), payload: { from: 'e2', to: 'e4', expectedVersion: 1 }
    } };
    const res = response();
    await handler(req, res, { env, authenticate: allow, rateLimit, service });
    assert.equal(res.statusCode, 200);
    assert.equal(committed.projection.move.san, 'e4');
    assert.equal(res.body.eventType, 'game.moveAccepted');
});

test('illegal moves never reach the persistence transaction', async () => {
    let called = false;
    const service = { getGame: async () => ({
        id: '11111111-1111-4111-8111-111111111111', status: 'active',
        fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', moves: [], ply: 0,
        turn: 'white', version: 1, white_clerk_id: 'user_white', black_clerk_id: 'user_black',
        white_time_ms: 60_000, black_time_ms: 60_000, base_ms: 60_000, increment_ms: 0,
        clock_started_at: new Date(Date.now() + 5000).toISOString()
    }), commitMove: async () => { called = true; } };
    const res = response();
    await handler({ method: 'POST', query: {}, headers: {}, body: {
        protocolVersion: '1.0.0', eventType: 'game.move', eventId: 'move:123456789012',
        gameId: '11111111-1111-4111-8111-111111111111', clientSentAt: Date.now(),
        payload: { from: 'e2', to: 'e5', expectedVersion: 1 }
    } }, res, { env, authenticate: allow, rateLimit, service });
    assert.equal(res.statusCode, 409);
    assert.equal(res.body.eventType, 'game.moveRejected');
    assert.equal(called, false);
});

test('actual parsed body size is enforced even without Content-Length', async () => {
    const res = response();
    await handler({ method: 'POST', query: {}, headers: {}, body: { payload: { padding: 'x'.repeat(33 * 1024) } } }, res, { env });
    assert.equal(res.statusCode, 413);
    assert.equal(res.body.code, 'PAYLOAD_TOO_LARGE');
});

test('non-participant move attempts fail without disclosing a game version', async () => {
    const res = response();
    const service = { getGame: async () => ({
        id: '11111111-1111-4111-8111-111111111111', status: 'active', version: 42,
        white_clerk_id: 'another_white', black_clerk_id: 'another_black'
    }) };
    await handler({ method: 'POST', query: {}, headers: {}, body: {
        protocolVersion: '1.0.0', eventType: 'game.move', eventId: 'move:123456789012',
        gameId: '11111111-1111-4111-8111-111111111111', clientSentAt: Date.now(),
        payload: { from: 'e2', to: 'e4', expectedVersion: 1 }
    } }, res, { env, authenticate: allow, rateLimit, service });
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.data.reasonCode, 'NOT_A_PARTICIPANT');
    assert.equal(res.body.version, null);
});

test('a retried committed move returns canonical state without applying it again', async () => {
    let committed = false;
    const canonical = {
        id: '11111111-1111-4111-8111-111111111111', status: 'active', version: 2,
        white_clerk_id: 'user_white', black_clerk_id: 'user_black'
    };
    const service = {
        getGame: async () => canonical,
        getEvent: async () => ({ event_id: 'move:123456789012', event_type: 'game.moveAccepted' }),
        getState: async () => ({ game: canonical }),
        commitMove: async () => { committed = true; }
    };
    const res = response();
    await handler({ method: 'POST', query: {}, headers: {}, body: {
        protocolVersion: '1.0.0', eventType: 'game.move', eventId: 'move:123456789012',
        gameId: canonical.id, clientSentAt: Date.now(), payload: { from: 'e2', to: 'e4', expectedVersion: 1 }
    } }, res, { env, authenticate: allow, rateLimit, service });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.eventType, 'game.moveAccepted');
    assert.equal(res.body.data.replayed, true);
    assert.equal(committed, false);
});

test('production rollout fails closed when a shared limiter is unavailable', async () => {
    const res = response();
    await handler({ method: 'GET', query: { action: 'state' }, headers: {} }, res, {
        env: { CAISSA_ONLINE_ROLLOUT: 'production' }, authenticate: allow, rateLimit,
        service: { getState: async () => assert.fail('state must remain unavailable') }
    });
    assert.equal(res.statusCode, 503);
    assert.equal(res.body.code, 'SHARED_RATE_LIMIT_UNAVAILABLE');
});

test('shared limiter denial applies across authenticated API instances', async () => {
    const res = response();
    await handler({ method: 'GET', query: { action: 'state' }, headers: {} }, res, {
        env, authenticate: allow, rateLimit,
        service: {
            checkRateLimit: async () => ({ allowed: false, retryAfter: 7 }),
            getState: async () => assert.fail('state must remain unavailable')
        }
    });
    assert.equal(res.statusCode, 429);
    assert.equal(res.headers['Retry-After'], '7');
});

test('resignation and draw acceptance delegate only canonical termination reasons', async () => {
    for (const [eventType, reason] of [['game.resign', 'resignation'], ['game.drawAccept', 'agreement']]) {
        let finished;
        const service = {
            finishGame: async input => {
                finished = input;
                return { recentGames: [{ id: gameId, status: 'completed', version: 8, result: '1/2-1/2' }] };
            }
        };
        const res = response();
        await handler(command(eventType), res, { env, authenticate: allow, rateLimit, service });
        assert.equal(res.statusCode, 200);
        assert.equal(res.body.eventType, 'game.result');
        assert.equal(res.body.data.state.game.status, 'completed');
        assert.deepEqual(finished, {
            clerkId: 'user_white', gameId,
            eventId: `${eventType.replaceAll('.', '-')}:123456789012`, reason
        });
    }
});

test('rematch derives the opponent and original control from a completed participant game', async () => {
    let challenge;
    const completed = {
        id: gameId, status: 'completed', version: 9,
        white_clerk_id: 'user_white', black_clerk_id: 'user_black',
        pool: 'blitz', base_ms: 180_000, increment_ms: 2_000, rated: true
    };
    const service = {
        getGame: async () => completed,
        createChallenge: async input => { challenge = input; return { challenges: [{ id: 'challenge-1' }] }; }
    };
    const res = response();
    await handler(command('game.rematch'), res, { env, authenticate: allow, rateLimit, service });
    assert.equal(res.statusCode, 201);
    assert.equal(res.body.eventType, 'challenge.updated');
    assert.deepEqual(challenge, {
        clerkId: 'user_white', targetClerkId: 'user_black',
        control: { pool: 'blitz', baseMs: 180_000, incrementMs: 2_000 }, rated: true
    });
});

test('a non-participant cannot use rematch to challenge either player', async () => {
    const res = response();
    const service = { getGame: async () => ({
        id: gameId, status: 'completed', version: 9,
        white_clerk_id: 'someone_else', black_clerk_id: 'another_player'
    }), createChallenge: async () => assert.fail('challenge must not be created') };
    await handler(command('game.rematch'), res, { env, authenticate: allow, rateLimit, service });
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.code, 'NOT_A_PARTICIPANT');
});
