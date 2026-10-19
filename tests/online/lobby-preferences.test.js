import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { createOnlineLobbyPreferenceStore } from '../../js/online/online-lobby-preferences.js';

function memoryStorage() {
    const values = new Map();
    return {
        getItem: key => values.get(key) ?? null,
        setItem: (key, value) => values.set(key, String(value)),
        entries: () => [...values.entries()]
    };
}

test('invitation preference is isolated between signed-in identities', async () => {
    const storage = memoryStorage();
    const store = createOnlineLobbyPreferenceStore({ storage, crypto: webcrypto });
    const first = { isSignedIn: true, userId: 'user_first', isGuest: false };
    const second = { isSignedIn: true, userId: 'user_second', isGuest: false };

    assert.equal(await store.save(first, { muteInvitationPopups: true }), true);
    assert.deepEqual(await store.load(first), { muteInvitationPopups: true });
    assert.deepEqual(await store.load(second), { muteInvitationPopups: false });
    assert.equal(storage.entries().length, 1);
    assert.doesNotMatch(storage.entries()[0][0], /user_first|user_second/);
});

test('guest and member preferences never share a storage scope', async () => {
    const storage = memoryStorage();
    const store = createOnlineLobbyPreferenceStore({ storage, crypto: webcrypto });
    const member = { isSignedIn: true, userId: 'shared_subject', isGuest: false };
    const guest = { isSignedIn: true, userId: 'shared_subject', isGuest: true };

    await store.save(guest, { muteInvitationPopups: true });
    assert.deepEqual(await store.load(member), { muteInvitationPopups: false });
    assert.deepEqual(await store.load(guest), { muteInvitationPopups: true });
});

test('malformed or unavailable local storage fails closed to unmuted', async () => {
    const malformed = { getItem: () => '{not-json', setItem: () => { throw new Error('blocked'); } };
    const store = createOnlineLobbyPreferenceStore({ storage: malformed, crypto: webcrypto });
    const auth = { isSignedIn: true, userId: 'member', isGuest: false };

    assert.deepEqual(await store.load(auth), { muteInvitationPopups: false });
    assert.equal(await store.save(auth, { muteInvitationPopups: true }), false);
});

test('a browser that denies access to the localStorage capability cannot break Online boot', async () => {
    const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        get() { throw new Error('storage denied'); }
    });
    try {
        const store = createOnlineLobbyPreferenceStore({ crypto: webcrypto });
        const auth = { isSignedIn: true, userId: 'member', isGuest: false };
        assert.deepEqual(await store.load(auth), { muteInvitationPopups: false });
        assert.equal(await store.save(auth, { muteInvitationPopups: true }), false);
    } finally {
        if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
        else delete globalThis.localStorage;
    }
});
