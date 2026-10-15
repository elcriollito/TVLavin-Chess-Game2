import assert from 'node:assert/strict';
import test from 'node:test';

import { createOnlineGuestSession } from '../../js/online/online-guest-session.js';

const CONFIG = Object.freeze({ url: 'https://example.supabase.co', publishableKey: 'publishable-test-key' });
const USER_ID = '22222222-2222-4222-8222-222222222222';

function guestSession(token = 'guest-access-token') {
    return { access_token: token, user: { id: USER_ID, is_anonymous: true } };
}

function harness(initialSession = null) {
    let session = initialSession;
    let signIns = 0;
    let signOuts = 0;
    let options;
    const client = { auth: {
        async getSession() { return { data: { session }, error: null }; },
        async signInAnonymously(input) {
            signIns += 1;
            assert.deepEqual(input, { options: { data: { source: 'caissa-online' } } });
            session = guestSession();
            return { data: { session }, error: null };
        },
        async signOut(input) {
            signOuts += 1;
            assert.deepEqual(input, { scope: 'local' });
            session = null;
            return { error: null };
        }
    } };
    return {
        createClient(url, key, received) {
            assert.equal(url, CONFIG.url);
            assert.equal(key, CONFIG.publishableKey);
            options = received;
            return client;
        },
        get signIns() { return signIns; },
        get signOuts() { return signOuts; },
        get options() { return options; }
    };
}

test('restores an anonymous identity from session storage without creating another user', async () => {
    const h = harness(guestSession('restored-token'));
    const manager = await createOnlineGuestSession(CONFIG, { createClient: h.createClient, storage: {} });
    const identity = await manager.restore();

    assert.equal(identity.isGuest, true);
    assert.equal(identity.fullName, 'Guest-222222');
    assert.equal(await manager.getToken(), 'restored-token');
    assert.equal(h.signIns, 0);
    assert.equal(h.options.auth.persistSession, true);
    assert.equal(h.options.auth.storageKey, 'caissa-online-guest-session-v1');
});

test('creates at most one anonymous session and keeps the identity temporary', async () => {
    const h = harness();
    const manager = await createOnlineGuestSession(CONFIG, { createClient: h.createClient, storage: {} });
    const first = await manager.start();
    const second = await manager.start();

    assert.equal(first.userId, USER_ID);
    assert.equal(second.userId, USER_ID);
    assert.equal(h.signIns, 1);
    await manager.end();
    assert.equal(h.signOuts, 1);
    assert.equal(await manager.restore(), null);
});

test('discards a persisted non-anonymous Supabase session instead of treating it as a guest', async () => {
    const h = harness({ access_token: 'member-token', user: { id: USER_ID, is_anonymous: false } });
    const manager = await createOnlineGuestSession(CONFIG, { createClient: h.createClient, storage: {} });
    assert.equal(await manager.restore(), null);
    assert.equal(h.signOuts, 1);
});
