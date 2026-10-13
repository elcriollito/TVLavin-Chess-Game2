import assert from 'node:assert/strict';
import test from 'node:test';

import {
    createOnlineAuthenticator,
    createSupabaseGuestAuthenticator,
    isOnlineGuestSubject
} from '../../api/_lib/online-guest-auth.js';

const URL = 'https://staging.example.supabase.co';
const GUEST_ID = '11111111-1111-4111-8111-111111111111';
const ENV = Object.freeze({
    CAISSA_ONLINE_GUESTS: '1',
    SUPABASE_URL: URL,
    SUPABASE_PUBLISHABLE_KEY: 'publishable-test-key'
});

function token(issuer = `${URL}/auth/v1`) {
    const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
    return `${encode({ alg: 'ES256', kid: 'test' })}.${encode({ iss: issuer })}.signature`;
}

function request(value = token()) {
    return { headers: { authorization: `Bearer ${value}` } };
}

test('online authentication routes only the configured Supabase issuer to guest verification', async () => {
    let memberCalls = 0;
    let guestCalls = 0;
    const authenticate = createOnlineAuthenticator({
        env: ENV,
        authenticateMember: async () => { memberCalls += 1; return { authenticated: false, status: 401 }; },
        authenticateGuest: async () => {
            guestCalls += 1;
            return { authenticated: true, userId: GUEST_ID, guest: true };
        }
    });

    assert.equal((await authenticate(request())).guest, true);
    assert.equal(memberCalls, 0);
    assert.equal(guestCalls, 1);

    await authenticate(request(token('https://clerk.example')));
    assert.equal(memberCalls, 1);
    assert.equal(guestCalls, 1);
});

test('verified Supabase anonymous claims produce a bounded guest identity', async () => {
    const client = { auth: { getClaims: async received => {
        assert.equal(received, 'guest-token');
        return { data: { claims: {
            iss: `${URL}/auth/v1`, aud: 'authenticated', role: 'authenticated',
            is_anonymous: true, sub: GUEST_ID
        } }, error: null };
    } } };
    const authenticate = createSupabaseGuestAuthenticator({ env: ENV, client });
    const auth = await authenticate(request('guest-token'));

    assert.deepEqual(auth, {
        authenticated: true,
        ok: true,
        userId: GUEST_ID,
        email: null,
        guest: true,
        identityType: 'guest'
    });
    assert.equal(isOnlineGuestSubject(auth.userId), true);
    assert.equal(isOnlineGuestSubject('user_clerk_member'), false);
});

test('a valid non-anonymous Supabase token is not accepted as an Online guest', async () => {
    const client = { auth: { getClaims: async () => ({ data: { claims: {
        iss: `${URL}/auth/v1`, aud: ['authenticated'], role: 'authenticated',
        is_anonymous: false, sub: GUEST_ID
    } }, error: null }) } };
    const auth = await createSupabaseGuestAuthenticator({ env: ENV, client })(request('member-token'));
    assert.equal(auth.authenticated, false);
    assert.equal(auth.code, 'INVALID_TOKEN');
});
