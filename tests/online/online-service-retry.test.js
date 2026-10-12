import assert from 'node:assert/strict';
import test from 'node:test';

import { createOnlineService } from '../../api/_lib/online-service.js';

const request = Object.freeze({
    clerkId: 'user_a',
    displayName: 'User A',
    control: Object.freeze({ pool: 'blitz', baseMs: 30_000, incrementMs: 0 }),
    rated: false
});

test('queue join retries bounded lock contention and preserves arguments', async () => {
    const calls = [];
    const waits = [];
    const db = {
        async rpc(name, args) {
            calls.push({ name, args });
            if (calls.length < 3) return { data: null, error: { message: 'CAISSA_ONLINE_QUEUE_BUSY' } };
            return { data: { queued: true }, error: null };
        }
    };
    const service = createOnlineService({ db, sleep: async milliseconds => waits.push(milliseconds) });

    assert.deepEqual(await service.joinQueue(request), { queued: true });
    assert.equal(calls.length, 3);
    assert.deepEqual(waits, [5, 15]);
    assert.ok(calls.every(call => call.name === 'caissa_online_join_queue'));
    assert.ok(calls.every(call => call.args.p_clerk_id === 'user_a'));
});

test('queue join contention retry is finite and observable', async () => {
    let calls = 0;
    const db = {
        async rpc() {
            calls += 1;
            return { data: null, error: { message: 'CAISSA_ONLINE_QUEUE_BUSY' } };
        }
    };
    const service = createOnlineService({ db, sleep: async () => {} });

    await assert.rejects(() => service.joinQueue(request), error => error.code === 'CAISSA_ONLINE_QUEUE_BUSY');
    assert.equal(calls, 4);
});

test('queue join does not retry unrelated database failures', async () => {
    let calls = 0;
    const db = {
        async rpc() {
            calls += 1;
            return { data: null, error: { message: 'unrelated failure' } };
        }
    };
    const service = createOnlineService({ db, sleep: async () => {} });

    await assert.rejects(() => service.joinQueue(request), error => error.code === 'ONLINE_STORE_FAILED');
    assert.equal(calls, 1);
});
