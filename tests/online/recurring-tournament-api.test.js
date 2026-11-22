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

test('recurrence capability requires every explicit Production gate', async () => {
    const result = response();
    await handler({ method: 'GET', query: { action: 'config' }, headers: {} }, result, {
        env: { ...env, CAISSA_ONLINE_ROLLOUT: 'production' }
    });
    assert.equal(result.body.capabilities.recurringTournaments, true);

    const disabled = response();
    await handler({ method: 'GET', query: { action: 'config' }, headers: {} }, disabled, {
        env: { ...env, CAISSA_ONLINE_ROLLOUT: 'production', CAISSA_ONLINE_RECURRING_TOURNAMENTS: '0' }
    });
    assert.equal(disabled.body.capabilities.recurringTournaments, false);
});

test('ordinary authenticated members cannot create recurring tournament series', async () => {
    const result = response();
    await handler(command('series.create', creation()), result, {
        env, rateLimit,
        authenticate: async () => ({ authenticated: true, userId, guest: false }),
        service: {
            ...baseService,
            async createRecurringSeries() { assert.fail('public recurring create reached storage'); }
        }
    });
    assert.equal(result.statusCode, 403);
    assert.equal(result.body.code, 'RECURRING_OPERATOR_REQUIRED');
});

test('all public series creation variants are rejected before validation or storage', async () => {
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
        assert.equal(result.statusCode, 403);
        assert.equal(result.body.code, 'RECURRING_OPERATOR_REQUIRED');
    }
});

test('pause, resume, skip, unskip and update require the non-public operator workflow', async () => {
    for (const [action, payload] of [
        ['pause', { seriesId }],
        ['resume', { seriesId }],
        ['skip', { seriesId, localDate: '2026-12-11', reason: 'Holiday event' }],
        ['unskip', { seriesId, localDate: '2026-12-11', reason: 'Restore event' }],
        ['update', { seriesId, recurrence: creation().recurrence }]
    ]) {
        const result = response();
        await handler(command(`series.${action}`, payload), result, {
            env, rateLimit,
            authenticate: async () => ({ authenticated: true, userId, guest: false }),
            service: {
                ...baseService,
                async manageRecurringSeries() { assert.fail('public series mutation reached storage'); }
            }
        });
        assert.equal(result.statusCode, 403);
        assert.equal(result.body.code, 'RECURRING_OPERATOR_REQUIRED');
    }
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
    assert.equal(malformed.statusCode, 403);
    assert.equal(malformed.body.code, 'RECURRING_OPERATOR_REQUIRED');
});

test('series sync remains read-only and never grants creator permissions', async () => {
    const synced = response();
    await handler(command('series.sync'), synced, {
        env, rateLimit,
        authenticate: async () => ({ authenticated: true, userId, guest: false }),
        service: {
            ...baseService,
            async getRecurringSeries() { return { series: [], directory: [] }; }
        }
    });
    assert.equal(synced.statusCode, 200);
    assert.equal(synced.body.data.state.permissions.recurringTournamentCreator, false);
});
