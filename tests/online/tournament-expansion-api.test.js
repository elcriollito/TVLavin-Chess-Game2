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

test('Daily creation and rated mode require independent organizer flags', async () => {
    const payload = {
        name: 'Daily Championship', startsAt: new Date(Date.now() + 172_800_000).toISOString(),
        description: 'Daily correspondence event', daysPerMove: 7, groupSize: 4,
        qualifiersPerGroup: 2, capacity: 16, rated: true
    };
    const denied = response();
    await handler(command('daily.create', payload), denied, {
        env: { ...baseEnv, CAISSA_ONLINE_DAILY_CREATE: '1', CAISSA_ONLINE_TOURNAMENT_ADMINS: adminId },
        rateLimit, authenticate: async () => ({ authenticated: true, userId: adminId, guest: false }),
        service: { createDaily: async () => assert.fail('rated store call must be blocked') }
    });
    assert.equal(denied.statusCode, 403);
    assert.equal(denied.body.code, 'RATED_NOT_ENABLED');
});

test('Daily creation derives registration closure and preserves the type-specific contract', async () => {
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
        rateLimit, authenticate: async () => ({ authenticated: true, userId: adminId, guest: false }),
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
