import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../../api/online.js';

const userId = 'user_recurring_member';
const seriesId = '88888888-8888-4888-8888-888888888888';
const env = {
    CAISSA_ONLINE_ROLLOUT: 'preview',
    CAISSA_ONLINE_TOURNAMENTS: '1',
    CAISSA_ONLINE_ARENA: '1',
    CAISSA_ONLINE_RECURRING_TOURNAMENTS: '1',
    CAISSA_ONLINE_ARENA_100: '1'
};

function response() {
    return {
        statusCode: 200, headers: {}, body: null,
        setHeader(name, value) { this.headers[name] = value; },
        status(code) { this.statusCode = code; return this; },
        json(body) { this.body = body; return this; }, end() { return this; }
    };
}

function command(eventType, payload = {}) {
    return { method: 'POST', query: {}, headers: {}, body: {
        protocolVersion: '1.0.0', eventType,
        eventId: `${eventType.replaceAll('.', '-')}:123456789012`,
        gameId: null, clientSentAt: Date.now(), payload
    } };
}

function creation(overrides = {}) {
    return {
        name: 'Community Friday Arena', timeControlId: 'bullet-2-1',
        durationMinutes: 30, capacity: 16, lateJoin: true, rated: false,
        recurrence: {
            frequencyUnit: 'weekly', interval: 2, weekdays: [5],
            firstDate: new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10),
            localTime: '19:00', timeZone: 'America/New_York', leadDays: 2,
            endMode: 'after_count', endDate: null, occurrenceCount: 10, enabled: true
        },
        ...overrides
    };
}

const rateLimit = () => ({ allowed: true });
const baseService = {
    async getState() { return { game: null, recentGames: [] }; },
    async getArenaState() { return { tournaments: [], current: null }; },
    async checkRateLimit() { return { allowed: true }; }
};

test('recurrence capability fails closed outside isolated Preview', async () => {
    const result = response();
    await handler({ method: 'GET', query: { action: 'config' }, headers: {} }, result, {
        env: { ...env, CAISSA_ONLINE_ROLLOUT: 'production' }
    });
    assert.equal(result.body.capabilities.recurringTournaments, false);
});

test('an ordinary authenticated member can create only a validated unrated Arena series', async () => {
    let created;
    const result = response();
    await handler(command('series.create', creation()), result, {
        env, rateLimit,
        authenticate: async () => ({ authenticated: true, userId, guest: false }),
        service: {
            ...baseService,
            async createRecurringSeries(input) {
                created = input;
                return { series: [{ id: seriesId, title: input.name, upcoming: [] }] };
            }
        }
    });
    assert.equal(result.statusCode, 201);
    assert.equal(created.clerkId, userId);
    assert.equal(created.recurrence.interval, 2);
    assert.deepEqual(created.recurrence.weekdays, [5]);
    assert.equal(created.control.baseMs, 120_000);
    assert.equal(result.body.data.state.permissions.recurringTournamentCreator, true);
});

test('Daily fields and uncertified Rated settings never reach the series RPC', async () => {
    for (const candidate of [
        creation({ daysPerMove: 7 }),
        creation({ rated: true }),
        creation({ source: 'official' }),
        creation({ seriesKind: 'official' }),
        creation({ official: true })
    ]) {
        const result = response();
        await handler(command('series.create', candidate), result, {
            env, rateLimit,
            authenticate: async () => ({ authenticated: true, userId, guest: false }),
            service: { createRecurringSeries: async () => assert.fail('invalid payload reached storage') }
        });
        assert.equal(result.statusCode, 400);
    }
});

test('pause, resume, skip and update carry the verified Clerk subject to ownership RPCs', async () => {
    const managed = [];
    for (const [action, payload] of [
        ['pause', { seriesId }],
        ['resume', { seriesId }],
        ['skip', { seriesId, localDate: '2026-12-11', reason: 'Holiday event' }],
        ['update', { seriesId, recurrence: creation().recurrence }]
    ]) {
        const result = response();
        await handler(command(`series.${action}`, payload), result, {
            env, rateLimit,
            authenticate: async () => ({ authenticated: true, userId, guest: false }),
            service: {
                ...baseService,
                async manageRecurringSeries(input) { managed.push(input); return { series: [] }; }
            }
        });
        assert.equal(result.statusCode, 200);
    }
    assert.ok(managed.every(item => item.clerkId === userId));
    assert.deepEqual(managed.map(item => item.action), ['pause', 'resume', 'skip', 'update']);
});

test('guests and malformed ownership targets are rejected before storage', async () => {
    const guest = response();
    await handler(command('series.pause', { seriesId }), guest, {
        env, rateLimit,
        authenticate: async () => ({ authenticated: true, userId: 'guest_beta', guest: true }),
        trustedSourceKey: () => 'test-source',
        service: { ...baseService, manageRecurringSeries: async () => assert.fail('guest reached storage') }
    });
    assert.equal(guest.statusCode, 403);

    const malformed = response();
    await handler(command('series.pause', { seriesId: 'not-a-uuid' }), malformed, {
        env, rateLimit,
        authenticate: async () => ({ authenticated: true, userId, guest: false }),
        service: { manageRecurringSeries: async () => assert.fail('malformed target reached storage') }
    });
    assert.equal(malformed.statusCode, 400);
});

test('an asynchronous storage ownership rejection is mapped to a safe 403', async () => {
    const denied = response();
    await handler(command('series.pause', { seriesId }), denied, {
        env, rateLimit,
        authenticate: async () => ({ authenticated: true, userId: 'user_other', guest: false }),
        service: {
            ...baseService,
            async manageRecurringSeries() {
                const error = new Error('CAISSA_ONLINE_RECURRING_NOT_OWNER');
                error.code = 'CAISSA_ONLINE_RECURRING_NOT_OWNER';
                throw error;
            }
        }
    });
    assert.equal(denied.statusCode, 403);
    assert.equal(denied.body.code, 'RECURRING_NOT_OWNER');
});
