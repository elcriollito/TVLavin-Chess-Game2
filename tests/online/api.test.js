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
    const secret = 'server-secret-must-never-cross-config-boundary';
    await handler({ method: 'GET', query: { action: 'config' }, headers: {} }, res, {
        env: { ...env, SUPABASE_SERVICE_ROLE_KEY: secret }
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.enabled, true);
    assert.equal(JSON.stringify(res.body).includes('SERVICE_ROLE'), false);
    assert.equal(JSON.stringify(res.body).includes(secret), false);
    assert.equal(res.body.capabilities.guestPlay, false);
});

test('public config advertises guest play only when the Staging prerequisites are explicit', async () => {
    const res = response();
    await handler({ method: 'GET', query: { action: 'config' }, headers: {} }, res, {
        env: {
            ...env,
            CAISSA_ONLINE_GUESTS: '1',
            SUPABASE_URL: 'https://staging.example.supabase.co',
            SUPABASE_PUBLISHABLE_KEY: 'publishable-browser-key'
        }
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.capabilities.guestPlay, true);
    assert.deepEqual(res.body.realtime, {
        url: 'https://staging.example.supabase.co',
        publishableKey: 'publishable-browser-key'
    });
});

test('guest matchmaking provisions a temporary identity and is server-forced unrated', async () => {
    const guestId = '11111111-1111-4111-8111-111111111111';
    const calls = [];
    const service = {
        async ensureGuestIdentity(subject) { calls.push(['ensure', subject]); },
        async joinQueue(input) { calls.push(['join', input]); return { ticket: { state: 'queued' } }; }
    };
    const req = command('queue.join', {
        displayName: 'Spoofed member name',
        payload: { timeControlId: 'blitz-3-2', rated: true }
    });
    const res = response();

    await handler(req, res, {
        env: { ...env, CAISSA_ONLINE_ROLLOUT: 'internal', CAISSA_ONLINE_GUESTS: '1' },
        authenticate: async () => ({ authenticated: true, userId: guestId, guest: true }),
        rateLimit,
        service
    });

    assert.equal(res.statusCode, 202);
    assert.deepEqual(calls[0], ['ensure', guestId]);
    assert.equal(calls[1][0], 'join');
    assert.equal(calls[1][1].rated, false);
    assert.equal(calls[1][1].displayName, 'Guest-111111');
});

test('repeated guest state polling never provisions or updates identity', async () => {
    let provisions = 0;
    let reads = 0;
    const service = {
        async ensureGuestIdentity() { provisions += 1; },
        async getState() { reads += 1; return { game: null, recentGames: [], players: [], challenges: [] }; }
    };
    for (let index = 0; index < 8; index += 1) {
        const res = response();
        await handler({ method: 'GET', query: { action: 'state' }, headers: {} }, res, {
            env,
            authenticate: async () => ({ authenticated: true, userId: gameId, guest: true }),
            rateLimit,
            service
        });
        assert.equal(res.statusCode, 200);
    }
    assert.equal(reads, 8);
    assert.equal(provisions, 0);
});

test('member matchmaking ignores client displayName and snapshots the server-owned public identity', async () => {
    let joined;
    const res = response();
    await handler(command('queue.join', {
        displayName: 'private@example.test',
        payload: { timeControlId: 'blitz-3-2', rated: false }
    }), res, {
        env,
        authenticate: allow,
        rateLimit,
        service: {
            resolvePublicIdentity: async subject => {
                assert.equal(subject, 'user_white');
                return { displayName: 'PublicKnight' };
            },
            joinQueue: async input => { joined = input; return { ticket: { state: 'queued' } }; }
        }
    });
    assert.equal(res.statusCode, 202);
    assert.equal(joined.displayName, 'PublicKnight');
    assert.equal(JSON.stringify(joined).includes('private@example.test'), false);
});

test('a member challenge targeting a guest subject is server-forced unrated', async () => {
    let challenged;
    const req = command('challenge.create', {
        payload: {
            targetClerkId: '22222222-2222-4222-8222-222222222222',
            timeControlId: 'rapid-10-0',
            rated: true
        }
    });
    const res = response();
    await handler(req, res, {
        env,
        authenticate: allow,
        rateLimit,
        service: { async createChallenge(input) { challenged = input; return { challenges: [] }; } }
    });
    assert.equal(res.statusCode, 201);
    assert.equal(challenged.rated, false);
});

test('move command validates locally then commits canonical projection through the service', async () => {
    let committed;
    let broadcast;
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
    await handler(req, res, {
        env, authenticate: allow, rateLimit, service,
        broadcastGameChange: async input => { broadcast = input; return { delivered: true }; }
    });
    assert.equal(res.statusCode, 200);
    assert.equal(committed.projection.move.san, 'e4');
    assert.equal(res.body.eventType, 'game.moveAccepted');
    assert.deepEqual(broadcast, {
        env,
        gameId: canonical.id,
        version: 2,
        eventType: 'game.moveAccepted',
        correlationId: 'move:123456789012'
    });
});

test('a rejected or timed-out Broadcast cannot turn an already committed move into a failed move', async () => {
    const canonical = {
        id: gameId, status: 'active',
        fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        initial_fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        moves: [], ply: 0, turn: 'white', version: 1,
        white_clerk_id: 'user_white', black_clerk_id: 'user_black',
        white_time_ms: 60_000, black_time_ms: 60_000, base_ms: 60_000, increment_ms: 0,
        clock_started_at: new Date(Date.now() + 5000).toISOString()
    };
    let commitCalls = 0;
    const service = {
        getGame: async () => canonical,
        commitMove: async input => {
            commitCalls += 1;
            return { game: { ...canonical, version: 2, fen: input.projection.fen } };
        }
    };
    const timeout = new Error('request aborted');
    timeout.name = 'AbortError';
    const failures = [new Error('ONLINE_REALTIME_BROADCAST_HTTP_503'), timeout];
    const originalWarn = console.warn;
    const warnings = [];
    console.warn = (...args) => warnings.push(args);

    try {
        for (const [index, failure] of failures.entries()) {
            const req = command('game.move', {
                eventId: `move:broadcast-failure-${index}`,
                payload: { from: 'e2', to: 'e4', expectedVersion: 1 }
            });
            const res = response();
            await handler(req, res, {
                env, authenticate: allow, rateLimit, service,
                broadcastGameChange: async () => { throw failure; }
            });

            assert.equal(res.statusCode, 200);
            assert.equal(res.body.eventType, 'game.moveAccepted');
            assert.equal(res.body.version, 2);
        }
    } finally {
        console.warn = originalWarn;
    }

    assert.equal(commitCalls, failures.length);
    assert.equal(warnings.length, failures.length);
    assert.equal(warnings.every(([event]) => event === 'caissa_online_realtime_broadcast_failed'), true);
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
