import assert from 'node:assert/strict';
import test from 'node:test';

import { createOnlineRealtime, createOnlineResyncQueue } from '../../js/online/online-realtime.js';

const CONFIG = Object.freeze({
    url: 'https://example.supabase.co',
    publishableKey: 'test-publishable-key'
});

function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((onResolve, onReject) => {
        resolve = onResolve;
        reject = onReject;
    });
    return { promise, resolve, reject };
}

function createHarness() {
    const calls = [];
    const tokensSeen = [];
    let clientOptions;
    let subscribeCount = 0;
    let removeCount = 0;
    let disconnectCount = 0;
    let broadcastCallback = null;

    const channel = {
        on(type, filter, callback) {
            calls.push(['on', type, filter.event, typeof callback]);
            if (type === 'broadcast') broadcastCallback = callback;
            return this;
        },
        subscribe(callback) {
            subscribeCount += 1;
            calls.push(['subscribe']);
            callback('SUBSCRIBED');
            return this;
        }
    };

    const client = {
        realtime: {
            async setAuth(...args) {
                calls.push(['setAuth:start', args.length]);
                const token = await clientOptions.accessToken();
                tokensSeen.push(token);
                calls.push(['setAuth:end']);
            },
            disconnect() {
                disconnectCount += 1;
                calls.push(['disconnect']);
            }
        },
        channel(topic, options) {
            calls.push(['channel', topic, options.config.private]);
            return channel;
        },
        async removeChannel(value) {
            assert.equal(value, channel);
            removeCount += 1;
            calls.push(['removeChannel']);
        }
    };

    return {
        createClient(url, key, options) {
            assert.equal(url, CONFIG.url);
            assert.equal(key, CONFIG.publishableKey);
            clientOptions = options;
            calls.push(['createClient']);
            return client;
        },
        calls,
        tokensSeen,
        get subscribeCount() { return subscribeCount; },
        get removeCount() { return removeCount; },
        get disconnectCount() { return disconnectCount; },
        emitBroadcast(payload) { broadcastCallback?.(payload); }
    };
}

test('awaits asynchronous auth initialization before subscribing to the private channel', async () => {
    const token = deferred();
    const harness = createHarness();
    const statuses = [];

    const creation = createOnlineRealtime(CONFIG, {
        gameId: 'game-one',
        createClient: harness.createClient,
        getToken: () => token.promise,
        onStatus: status => statuses.push(status)
    });

    await new Promise(resolve => setImmediate(resolve));
    assert.equal(harness.calls.some(([name]) => name === 'channel'), false);
    assert.equal(harness.subscribeCount, 0);

    token.resolve('jwt-one');
    const session = await creation;

    assert.ok(session);
    assert.deepEqual(harness.tokensSeen, ['jwt-one']);
    assert.equal(harness.calls.find(([name]) => name === 'setAuth:start')[1], 0);
    assert.ok(harness.calls.findIndex(([name]) => name === 'setAuth:end') < harness.calls.findIndex(([name]) => name === 'channel'));
    assert.equal(harness.subscribeCount, 1);
    assert.deepEqual(statuses, ['SUBSCRIBED']);
});

test('refreshes rotating tokens in callback mode without duplicate subscriptions', async () => {
    const harness = createHarness();
    const tokens = ['jwt-one', 'jwt-two', 'jwt-three'];
    let activeTokenReads = 0;
    let maximumConcurrentReads = 0;

    const session = await createOnlineRealtime(CONFIG, {
        gameId: 'game-two',
        createClient: harness.createClient,
        getToken: async () => {
            activeTokenReads += 1;
            maximumConcurrentReads = Math.max(maximumConcurrentReads, activeTokenReads);
            await new Promise(resolve => setImmediate(resolve));
            activeTokenReads -= 1;
            return tokens.shift();
        }
    });

    await Promise.all([session.refreshAuth(), session.refreshAuth()]);

    assert.deepEqual(harness.tokensSeen, ['jwt-one', 'jwt-two', 'jwt-three']);
    assert.equal(maximumConcurrentReads, 1);
    assert.equal(harness.subscribeCount, 1);
    assert.equal(harness.calls.filter(([name]) => name === 'setAuth:start').every(([, argumentCount]) => argumentCount === 0), true);
});

test('cancels a stale initialization before subscribe when the signed-in identity changes', async () => {
    const token = deferred();
    const harness = createHarness();
    let isCurrent = true;

    const creation = createOnlineRealtime(CONFIG, {
        gameId: 'game-three',
        createClient: harness.createClient,
        getToken: () => token.promise,
        isCurrent: () => isCurrent
    });

    await new Promise(resolve => setImmediate(resolve));
    isCurrent = false;
    token.resolve('jwt-from-replaced-session');

    assert.equal(await creation, null);
    assert.equal(harness.subscribeCount, 0);
    assert.equal(harness.disconnectCount, 1);
});

test('close is idempotent and prevents stale token refresh after sign-out', async () => {
    const harness = createHarness();
    let tokenReads = 0;
    const session = await createOnlineRealtime(CONFIG, {
        gameId: 'game-four',
        createClient: harness.createClient,
        getToken: async () => `jwt-${++tokenReads}`
    });

    await Promise.all([session.close(), session.close()]);
    assert.equal(await session.refreshAuth(), false);
    assert.equal(harness.removeCount, 1);
    assert.equal(harness.disconnectCount, 1);
    assert.equal(tokenReads, 1);
});

test('coalesces duplicate, stale, and in-flight Broadcast versions to the newest resync', async () => {
    const harness = createHarness();
    const versions = [];
    const firstResync = deferred();
    await createOnlineRealtime(CONFIG, {
        gameId: 'game-five',
        createClient: harness.createClient,
        getToken: async () => 'jwt-one',
        onChange: async message => {
            const version = Number(message.payload?.version ?? message.payload?.record?.version);
            versions.push(version);
            if (version === 7) await firstResync.promise;
        }
    });

    harness.emitBroadcast({ payload: { record: { version: 7 } } });
    harness.emitBroadcast({ payload: { version: 7 } });
    harness.emitBroadcast({ payload: { version: 6 } });
    harness.emitBroadcast({ payload: { version: 8 } });
    harness.emitBroadcast({ payload: { version: 9 } });

    assert.deepEqual(versions, [7]);
    firstResync.resolve();
    await new Promise(resolve => setImmediate(resolve));

    assert.deepEqual(versions, [7, 9]);
    assert.equal(harness.subscribeCount, 1);
});

test('serial resync queue guarantees one trailing read for work requested in flight', async () => {
    const firstRead = deferred();
    const reasons = [];
    const queue = createOnlineResyncQueue(async reason => {
        reasons.push(reason);
        if (reasons.length === 1) await firstRead.promise;
    });

    const active = queue.request('poll');
    queue.request('visibility');
    queue.request('realtime-v8');
    queue.request('realtime-v9');
    assert.deepEqual(reasons, ['poll']);

    firstRead.resolve();
    await active;
    assert.deepEqual(reasons, ['poll', 'realtime-v9']);
});
