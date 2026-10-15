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

test('public identity resolver calls the server-only canonical RPC', async () => {
    const calls = [];
    const db = { async rpc(name, args) {
        calls.push({ name, args });
        return { data: { displayName: 'PublicKnight', nickname: 'PublicKnight', fallbackAlias: 'Player-ABCDEF0123456789', hasCustomNickname: true, policyVersion: 1, version: 1 }, error: null };
    } };
    const service = createOnlineService({ db });
    const result = await service.resolvePublicIdentity('user_a');
    assert.equal(result.displayName, 'PublicKnight');
    assert.deepEqual(calls, [{ name: 'caissa_public_identity_get_or_create', args: { p_clerk_id: 'user_a' } }]);
});

test('Online state is projected through the server-only identity resolver before return', async () => {
    const calls = [];
    const db = { async rpc(name, args) {
        calls.push({ name, args });
        if (name === 'caissa_online_state') return { data: {
            game: null,
            recentGames: [{
                identity_policy_version: 0,
                white_user_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
                black_user_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
                white_clerk_id: 'user_a', black_clerk_id: 'user_b',
                white_display_name: 'Private Person', black_display_name: 'private@example.test',
                pgn: '[White "Private Person"]\n[Black "private@example.test"]\n\n*'
            }],
            players: [], challenges: []
        }, error: null };
        if (name === 'caissa_public_identity_resolve_many') return { data: {
            user_a: { role: 'member', displayName: 'PublicKnight' },
            user_b: { role: 'member', displayName: 'Player-ABCDEF0123456789' }
        }, error: null };
        assert.fail(name);
    } };
    const service = createOnlineService({ db });
    const state = await service.getState('user_a');
    assert.equal(JSON.stringify(state).includes('Private Person'), false);
    assert.equal(JSON.stringify(state).includes('private@example.test'), false);
    assert.equal(state.recentGames[0].white_display_name, 'PublicKnight');
    assert.deepEqual(calls.map(call => call.name), [
        'caissa_online_state', 'caissa_public_identity_resolve_many'
    ]);
});

test('large presence snapshots resolve public identities in bounded batches', async () => {
    const resolverBatchSizes = [];
    const players = Array.from({ length: 205 }, (_value, index) => ({
        clerkId: `user_${index}`,
        userId: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
        displayName: `Private Person ${index}`
    }));
    const db = { async rpc(name, args) {
        if (name === 'caissa_online_state') {
            return { data: { game: null, recentGames: [], challenges: [], players }, error: null };
        }
        if (name === 'caissa_public_identity_resolve_many') {
            resolverBatchSizes.push(args.p_clerk_ids.length);
            return { data: Object.fromEntries(args.p_clerk_ids.map((clerkId, index) => [clerkId, {
                role: 'member',
                displayName: `Knight${resolverBatchSizes.length}_${index}`
            }])), error: null };
        }
        assert.fail(name);
    } };

    const state = await createOnlineService({ db }).getState('user_a');
    assert.deepEqual(resolverBatchSizes, [100, 100, 5]);
    assert.equal(state.players.length, 205);
    assert.equal(JSON.stringify(state.players).includes('Private Person'), false);
});

test('guest identity provisioning creates one isolated zero-credit row', async () => {
    let inserted;
    const selected = { id: 'internal-user-id', clerk_id: '11111111-1111-4111-8111-111111111111', role: 'online_guest' };
    const reads = [null, selected];
    const db = {
        from(name) {
            assert.equal(name, 'users');
            return {
                select: columns => ({ eq: (column, value) => ({ maybeSingle: async () => {
                    assert.equal(columns, 'id,clerk_id,role');
                    assert.equal(column, 'clerk_id');
                    assert.equal(value, selected.clerk_id);
                    return { data: reads.shift(), error: null };
                } }) }),
                insert: async value => { inserted = value; return { data: null, error: null }; }
            };
        }
    };
    const service = createOnlineService({ db });

    assert.deepEqual(await service.ensureGuestIdentity(selected.clerk_id), selected);
    assert.equal(inserted.clerk_id, selected.clerk_id);
    assert.equal(inserted.role, 'online_guest');
    assert.equal(inserted.credits, 0);
    assert.equal(inserted.is_premium, false);
    assert.equal(inserted.email, null);
    assert.equal(Object.hasOwn(inserted, 'updated_at'), false);
});

test('an already provisioned guest performs only a read and never refreshes updated_at', async () => {
    const selected = { id: 'internal-user-id', clerk_id: '11111111-1111-4111-8111-111111111111', role: 'online_guest' };
    let inserts = 0;
    const db = { from: () => ({
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: selected, error: null }) }) }),
        insert: async () => { inserts += 1; return { error: null }; }
    }) };
    const service = createOnlineService({ db });
    assert.deepEqual(await service.ensureGuestIdentity(selected.clerk_id), selected);
    assert.equal(inserts, 0);
});

test('concurrent first-use provisioning tolerates one unique conflict and verifies the winner', async () => {
    const selected = { id: 'internal-user-id', clerk_id: '11111111-1111-4111-8111-111111111111', role: 'online_guest' };
    const reads = [null, selected];
    const db = { from: () => ({
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: reads.shift(), error: null }) }) }),
        insert: async () => ({ error: { code: '23505', message: 'duplicate key' } })
    }) };
    const service = createOnlineService({ db });
    assert.deepEqual(await service.ensureGuestIdentity(selected.clerk_id), selected);
});
