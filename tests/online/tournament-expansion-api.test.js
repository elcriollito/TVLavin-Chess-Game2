import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../../api/online.js';

const tournamentId = '33333333-3333-4333-8333-333333333333';
const userId = 'user_daily_member';
const adminId = 'user_weekly_admin';
const baseEnv = {
    CAISSA_ONLINE_ROLLOUT: 'preview', CAISSA_ONLINE_TOURNAMENTS: '1',
    CAISSA_ONLINE_ARENA: '1', CAISSA_ONLINE_DAILY: '1'
};

function response() {
    return {
        statusCode: 200, headers: {}, body: null,
        setHeader(name, value) { this.headers[name] = value; },
        status(code) { this.statusCode = code; return this; },
        json(body) { this.body = body; return this; }, end() { return this; }
    };
}

function command(eventType, payload = {}, gameId = null) {
    return { method: 'POST', query: {}, headers: {}, body: {
        protocolVersion: '1.0.0', eventType,
        eventId: `${eventType.replaceAll('.', '-')}:123456789012`,
        gameId, clientSentAt: Date.now(), payload
    } };
}

const rateLimit = () => ({ allowed: true });

test('Daily requires explicit gates in Production and an ordinary member can join when enabled', async () => {
    const config = response();
    await handler({ method: 'GET', query: { action: 'config' }, headers: {} }, config, {
        env: { ...baseEnv, CAISSA_ONLINE_ROLLOUT: 'production' }
    });
    assert.equal(config.body.capabilities.dailyTournaments, true);

    const disabled = response();
    await handler({ method: 'GET', query: { action: 'config' }, headers: {} }, disabled, {
        env: { ...baseEnv, CAISSA_ONLINE_ROLLOUT: 'production', CAISSA_ONLINE_DAILY: '0' }
    });
    assert.equal(disabled.body.capabilities.dailyTournaments, false);

    let joined;
    const daily = { tournaments: [{ id: tournamentId }], current: { id: tournamentId }, games: [], recentGames: [] };
    const res = response();
    await handler(command('daily.join', { tournamentId }), res, {
        env: baseEnv, rateLimit,
        authenticate: async () => ({ authenticated: true, userId, guest: false }),
        service: {
            async joinDaily(input) { joined = input; return daily; },
            async getState() { return { game: null, recentGames: [] }; }
        }
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.data.state.daily.current.id, tournamentId);
    assert.equal(joined.clerkId, userId);
});

test('Daily creation and rated mode require independent feature flags', async () => {
    const payload = {
        name: 'Daily Championship', startsAt: new Date(Date.now() + 172_800_000).toISOString(),
        description: 'Daily correspondence event', daysPerMove: 7, groupSize: 4,
        qualifiersPerGroup: 2, capacity: 16, rated: true
    };
    const denied = response();
    await handler(command('daily.create', payload), denied, {
        env: { ...baseEnv, CAISSA_ONLINE_DAILY_CREATE: '1', CAISSA_ONLINE_TOURNAMENT_ADMINS: adminId },
        rateLimit, authenticate: async () => ({ authenticated: true, userId, guest: false }),
        service: { createDaily: async () => assert.fail('rated store call must be blocked') }
    });
    assert.equal(denied.statusCode, 403);
    assert.equal(denied.body.code, 'RATED_NOT_ENABLED');
});

test('an ordinary member can create Daily with server-managed closure and type-specific fields', async () => {
    const startsAt = new Date(Date.now() + 172_800_000).toISOString();
    let created;
    const accepted = response();
    await handler(command('daily.create', {
        name: 'Daily UX Contract', description: 'Seven days applies to each move.',
        startsAt, daysPerMove: 7, groupSize: 4, qualifiersPerGroup: 2,
        capacity: 16, rated: false
    }), accepted, {
        env: {
            ...baseEnv, CAISSA_ONLINE_DAILY_CREATE: '1',
            CAISSA_ONLINE_TOURNAMENT_ADMINS: adminId
        },
        rateLimit, authenticate: async () => ({ authenticated: true, userId, guest: false }),
        service: {
            async createDaily(input) { created = input; return { current: { id: tournamentId } }; },
            async getState() { return { game: null, recentGames: [] }; }
        }
    });
    assert.equal(accepted.statusCode, 201);
    assert.equal(created.description, 'Seven days applies to each move.');
    assert.equal(created.registrationClosesAt, startsAt);
    assert.equal(created.qualifiersPerGroup, 2);
    for (const forbidden of ['timeControlId', 'durationMinutes', 'lateJoin']) {
        assert.equal(Object.hasOwn(created, forbidden), false);
    }
    assert.equal(accepted.body.data.state.permissions.communityTournamentCreator, true);
    assert.equal(accepted.body.data.state.permissions.tournamentOrganizer, false);
});

test('Daily creation rejects guest, disabled, recurring and official requests before storage', async () => {
    const payload = {
        name: 'Daily Community Only', startsAt: new Date(Date.now() + 172_800_000).toISOString(),
        description: '', daysPerMove: 7, groupSize: 4,
        qualifiersPerGroup: 2, capacity: 16, rated: false
    };
    const service = {
        async createDaily() { assert.fail('rejected creation must not reach the store'); }
    };
    const disabled = response();
    await handler(command('daily.create', payload), disabled, {
        env: { ...baseEnv, CAISSA_ONLINE_DAILY_CREATE: '0' }, rateLimit,
        authenticate: async () => ({ authenticated: true, userId, guest: false }), service
    });
    assert.equal(disabled.statusCode, 403);
    assert.equal(disabled.body.code, 'TOURNAMENT_CREATION_DISABLED');

    const guest = response();
    await handler(command('daily.create', payload), guest, {
        env: { ...baseEnv, CAISSA_ONLINE_DAILY_CREATE: '1' }, rateLimit,
        authenticate: async () => ({ authenticated: true, userId, guest: true }),
        trustedSourceKey: () => 'online-source:test',
        service: { ...service, checkRateLimit: async () => ({ allowed: true }) }
    });
    assert.equal(guest.statusCode, 403);
    assert.equal(guest.body.code, 'ARENA_MEMBER_ACCOUNT_REQUIRED');

    for (const forged of [{ recurrence: {} }, { source: 'official' }, { seriesKind: 'official' }]) {
        const res = response();
        await handler(command('daily.create', { ...payload, ...forged }), res, {
            env: { ...baseEnv, CAISSA_ONLINE_DAILY_CREATE: '1' }, rateLimit,
            authenticate: async () => ({ authenticated: true, userId, guest: false }), service
        });
        assert.equal(res.statusCode, 400);
        assert.equal(res.body.code, 'INVALID_DAILY_FIELDS');
    }
});

test('Daily and Arena creation share the conservative distributed rate bucket', async () => {
    const policies = [];
    const startsAt = new Date(Date.now() + 172_800_000).toISOString();
    const res = response();
    await handler(command('daily.create', {
        name: 'Rate Limited Daily', description: '', startsAt,
        daysPerMove: 7, groupSize: 4, qualifiersPerGroup: 2, capacity: 16, rated: false
    }), res, {
        env: { ...baseEnv, CAISSA_ONLINE_DAILY_CREATE: '1' }, rateLimit,
        authenticate: async () => ({ authenticated: true, userId, guest: false }),
        service: {
            async checkRateLimit(policy) { policies.push(policy); return { allowed: false, retryAfter: 120 }; },
            async createDaily() { assert.fail('rate-limited creation must not reach storage'); }
        }
    });
    assert.equal(res.statusCode, 429);
    assert.equal(res.headers['Retry-After'], '120');
    assert.equal(policies[0].bucket, 'tournament-create');
    assert.equal(policies[0].limit, 6);
    assert.equal(policies[0].windowSeconds, 3600);
});

test('weekly administration is hidden from members and service-only for the organizer', async () => {
    const env = {
        ...baseEnv, CAISSA_ONLINE_WEEKLY_ARENAS: '1', CAISSA_ONLINE_WEEKLY_ADMIN: '1',
        CAISSA_ONLINE_TOURNAMENT_ADMINS: adminId
    };
    const denied = response();
    await handler(command('weekly.enable'), denied, {
        env, rateLimit, authenticate: async () => ({ authenticated: true, userId, guest: false }),
        service: { manageWeeklySeries: async () => assert.fail('member must not reach weekly RPC') }
    });
    assert.equal(denied.statusCode, 403);

    let managed;
    const accepted = response();
    await handler(command('weekly.sync'), accepted, {
        env, rateLimit, authenticate: async () => ({ authenticated: true, userId: adminId, guest: false }),
        service: { async manageWeeklySeries(input) { managed = input; return { series: { enabled: false } }; } }
    });
    assert.equal(accepted.statusCode, 200);
    assert.equal(managed.action, 'inspect');

    const updated = response();
    await handler(command('weekly.update', {
        capacity: 100, minimumPlayers: 4, registrationLeadDays: 7, rated: false
    }), updated, {
        env, rateLimit, authenticate: async () => ({ authenticated: true, userId: adminId, guest: false }),
        service: { async manageWeeklySeries(input) { managed = input; return { series: { enabled: false } }; } }
    });
    assert.equal(updated.statusCode, 200);
    assert.deepEqual(managed.payload, {
        capacity: 100, minimumPlayers: 4, registrationLeadDays: 7, rated: false
    });
});
