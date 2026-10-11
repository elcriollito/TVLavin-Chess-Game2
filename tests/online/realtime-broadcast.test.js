import assert from 'node:assert/strict';
import test from 'node:test';
import { sendOnlineGameBroadcast } from '../../api/_lib/online-realtime-broadcast.js';

const gameId = '11111111-1111-4111-8111-111111111111';

test('server Broadcast uses a private game topic and correlated version', async () => {
    let request;
    const serviceKey = 'test-service-key-never-log';
    const result = await sendOnlineGameBroadcast({
        env: { SUPABASE_URL: 'https://example.supabase.co/', SUPABASE_SERVICE_ROLE_KEY: serviceKey },
        gameId,
        version: 7,
        eventType: 'game.moveAccepted',
        correlationId: 'move:test',
        fetchImpl: async (url, init) => {
            request = { url, init };
            return { status: 202 };
        }
    });

    assert.deepEqual(result, { delivered: true });
    assert.equal(request.url, 'https://example.supabase.co/realtime/v1/api/broadcast');
    assert.equal(request.init.headers.apikey, serviceKey);
    assert.equal(request.init.headers.Authorization, `Bearer ${serviceKey}`);
    assert.deepEqual(JSON.parse(request.init.body), {
        messages: [{
            topic: `online-game:${gameId}`,
            event: 'UPDATE',
            payload: { gameId, version: 7, eventType: 'game.moveAccepted', correlationId: 'move:test' },
            private: true
        }]
    });
});

test('server Broadcast fails closed for invalid correlation and does not call fetch', async () => {
    let calls = 0;
    await assert.rejects(sendOnlineGameBroadcast({
        env: { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'secret' },
        gameId: 'not-a-game',
        version: 0,
        fetchImpl: async () => { calls += 1; return { status: 202 }; }
    }), /ONLINE_REALTIME_BROADCAST_INVALID/);
    assert.equal(calls, 0);
});

test('server Broadcast is inert when hosted credentials are unavailable', async () => {
    assert.deepEqual(await sendOnlineGameBroadcast({ env: {}, gameId, version: 2 }), {
        delivered: false,
        reason: 'not-configured'
    });
});

test('server Broadcast aborts a stalled REST send within the configured bound', async () => {
    let observedSignal;
    const startedAt = Date.now();
    await assert.rejects(sendOnlineGameBroadcast({
        env: { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'secret' },
        gameId,
        version: 8,
        timeoutMs: 20,
        fetchImpl: async (_url, init) => {
            observedSignal = init.signal;
            return new Promise((_resolve, reject) => {
                init.signal.addEventListener('abort', () => {
                    const error = new Error('request aborted');
                    error.name = 'AbortError';
                    reject(error);
                }, { once: true });
            });
        }
    }), error => error?.name === 'AbortError');

    assert.equal(observedSignal.aborted, true);
    assert.ok(Date.now() - startedAt < 1_000);
});
