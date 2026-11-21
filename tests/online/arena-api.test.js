import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../../api/online.js';

const tournamentId = '22222222-2222-4222-8222-222222222222';
const userId = 'user_founder_a';
const baseEnv = {
    CAISSA_ONLINE_ROLLOUT: 'preview',
    CAISSA_ONLINE_TOURNAMENTS: '1',
    CAISSA_ONLINE_ARENA: '1',
    CAISSA_ONLINE_TOURNAMENT_ADMINS: userId,
    CAISSA_ONLINE_ARENA_CREATE: '1'
};

function response() {
    return {
        statusCode: 200, headers: {}, body: null,
        setHeader(name, value) { this.headers[name] = value; },
        status(code) { this.statusCode = code; return this; },
        json(body) { this.body = body; return this; },
        end() { return this; }
    };
}

function command(eventType, payload = {}) {
    return {
        method: 'POST', query: {}, headers: {}, body: {
            protocolVersion: '1.0.0', eventType,
            eventId: `${eventType.replaceAll('.', '-')}:123456789012`,
            gameId: null, clientSentAt: Date.now(), payload
        }
    };
}

const authenticate = async () => ({ authenticated: true, userId, email: 'founder@example.test' });
const rateLimit = () => ({ allowed: true });
const arena = {
    tournaments: [{ id: tournamentId, name: 'CAISSA Arena S001 — Founders Beta', status: 'registration_open' }],
    current: { id: tournamentId, version: 3, status: 'registration_open', myState: 'registered' }
};

test('Arena remains disabled in production even when every flag is present', async () => {
    const res = response();
    await handler({ method: 'GET', query: { action: 'config' }, headers: {} }, res, {
        env: { ...baseEnv, CAISSA_ONLINE_ROLLOUT: 'production' }
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.capabilities.arenaS001, false);
    assert.equal(res.body.capabilities.tournaments, false);
    assert.equal(res.body.capabilities.publicTournamentDirectory, false);
});

test('ordinary authenticated Preview users can discover and join without an allowlist', async () => {
    let joined;
    const service = {
        async joinArena(input) { joined = input; return arena; },
        async getState() { return { game: null, recentGames: [] }; }
    };
    const res = response();
    await handler(command('tournament.join', { tournamentId }), res, {
        env: baseEnv,
        authenticate, rateLimit, service
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.data.state.arena.current.id, tournamentId);
    assert.equal(joined.clerkId, userId);
});

test('internal Arena mode retains its participant allowlist', async () => {
    const service = {
        joinArena: async () => assert.fail('join must not reach the store'),
        getState: async () => assert.fail('state must not be read')
    };
    const res = response();
    await handler(command('tournament.join', { tournamentId }), res, {
        env: {
            ...baseEnv,
            CAISSA_ONLINE_ROLLOUT: 'internal',
            CAISSA_ONLINE_INTERNAL_USERS: userId,
            CAISSA_ONLINE_ARENA_BETA_USERS: 'another_user'
        },
        authenticate, rateLimit, service
    });
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.code, 'ARENA_BETA_NOT_AUTHORIZED');
});

test('authorized registration returns a canonical snapshot and private invalidation', async () => {
    let joined;
    let broadcast;
    const service = {
        async joinArena(input) { joined = input; return arena; },
        async getState() { return { game: null, recentGames: [] }; }
    };
    const res = response();
    await handler(command('tournament.join', { tournamentId }), res, {
        env: baseEnv, authenticate, rateLimit, service,
        broadcastTournamentChange: async input => { broadcast = input; return { delivered: true }; }
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.eventType, 'tournament.snapshot');
    assert.equal(res.body.data.state.arena.current.id, tournamentId);
    assert.deepEqual(joined, {
        clerkId: userId, tournamentId, eventId: 'tournament-join:123456789012'
    });
    assert.equal(broadcast.tournamentId, tournamentId);
    assert.equal(broadcast.version, 3);
});

test('organizer creation is separately authorized and defaults to 3+2 for 15 minutes', async () => {
    let created;
    const service = {
        async createArena(input) { created = input; return arena; },
        async getState() { return { game: null, recentGames: [] }; }
    };
    const denied = response();
    await handler(command('tournament.create', {}), denied, {
        env: { ...baseEnv, CAISSA_ONLINE_TOURNAMENT_ADMINS: 'other_admin' },
        authenticate, rateLimit, service
    });
    assert.equal(denied.statusCode, 403);
    assert.equal(denied.body.code, 'ARENA_ORGANIZER_REQUIRED');

    const accepted = response();
    await handler(command('tournament.create', {
        startsAt: new Date(Date.now() + 60_000).toISOString()
    }), accepted, {
        env: baseEnv, authenticate, rateLimit, service,
        broadcastTournamentChange: async () => ({ delivered: true })
    });
    assert.equal(accepted.statusCode, 201);
    assert.equal(created.name, 'CAISSA Arena S001 — Founders Beta');
    assert.equal(created.durationMinutes, 15);
    assert.equal(created.control.label, '3+2');
});

test('guest and malformed tournament requests fail before the Arena store', async () => {
    const service = {
        checkRateLimit: async () => ({ allowed: true }),
        joinArena: async () => assert.fail('Arena store must not be called')
    };
    const guest = response();
    await handler(command('tournament.join', { tournamentId }), guest, {
        env: baseEnv,
        authenticate: async () => ({ authenticated: true, userId, guest: true }),
        rateLimit, service, trustedSourceKey: () => 'online-source:test'
    });
    assert.equal(guest.statusCode, 403);
    assert.equal(guest.body.code, 'ARENA_MEMBER_ACCOUNT_REQUIRED');

    const invalid = response();
    await handler(command('tournament.join', { tournamentId: 'bad' }), invalid, {
        env: baseEnv, authenticate, rateLimit, service
    });
    assert.equal(invalid.statusCode, 400);
    assert.equal(invalid.body.code, 'INVALID_TOURNAMENT_ID');
});

test('state recovery reconciles Arena before reading the canonical game', async () => {
    const calls = [];
    const res = response();
    await handler({ method: 'GET', query: { action: 'state' }, headers: {} }, res, {
        env: baseEnv, authenticate, rateLimit,
        service: {
            async getArenaState() { calls.push('arena'); return arena; },
            async getState() { calls.push('game'); return { game: { id: 'game-1', tournament_id: tournamentId } }; }
        }
    });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(calls, ['arena', 'game']);
    assert.equal(res.body.data.state.arena.current.id, tournamentId);
    assert.equal(res.body.data.state.game.tournament_id, tournamentId);
});
