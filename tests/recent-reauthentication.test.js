import test from 'node:test';
import assert from 'node:assert/strict';
import { createRecentReauthenticationFlow } from '../js/identity/recent-reauthentication.js';

function fixture(overrides = {}) {
    const calls = [];
    const verification = {
        status: 'needs_first_factor',
        supportedFirstFactors: [{
            strategy: 'email_code', emailAddressId: 'email_1', safeIdentifier: 's***@example.test', primary: true
        }],
        async prepareFirstFactorVerification(options) {
            calls.push(['prepare', options]);
            return this;
        },
        async attemptFirstFactorVerification(options) {
            calls.push(['attempt', options]);
            return { ...this, status: 'complete' };
        },
        ...overrides.verification
    };
    const session = {
        id: 'session_a',
        async startVerification(options) {
            calls.push(['start', options]);
            return verification;
        },
        async getToken(options) {
            calls.push(['token', options]);
            return 'fresh-signed-token';
        },
        ...overrides.session
    };
    const auth = { isSignedIn: true, userId: 'user_a', clerk: { session } };
    const certified = [];
    const flow = createRecentReauthenticationFlow({
        authProvider: () => auth,
        certifyToken: async token => {
            certified.push(token);
            return overrides.summary || { backendReady: true, requiresReauthentication: false, summary: {} };
        }
    });
    return { auth, calls, certified, flow, session, verification };
}

test('email-code step-up verifies a real factor, forces a fresh token, then requires backend certification', async () => {
    const { flow, calls, certified } = fixture();
    const challenge = await flow.begin();
    assert.deepEqual(challenge, {
        status: 'needs_code', strategy: 'email_code', destination: 's***@example.test'
    });
    assert.deepEqual(calls.slice(0, 2), [
        ['start', { level: 'first_factor' }],
        ['prepare', { strategy: 'email_code', emailAddressId: 'email_1' }]
    ]);
    assert.deepEqual(certified, []);

    const result = await flow.complete('123456');
    assert.equal(result.status, 'complete');
    assert.deepEqual(calls.slice(2), [
        ['attempt', { strategy: 'email_code', code: '123456' }],
        ['token', { skipCache: true }]
    ]);
    assert.deepEqual(certified, ['fresh-signed-token']);
    assert.doesNotMatch(JSON.stringify(result), /fresh-signed-token/u);
});

test('password step-up does not prepare a code and never returns the password or token', async () => {
    const { flow, calls } = fixture({ verification: {
        supportedFirstFactors: [{ strategy: 'password' }]
    } });
    assert.equal((await flow.begin()).status, 'needs_password');
    const result = await flow.complete('synthetic-password');
    assert.equal(result.status, 'complete');
    assert.deepEqual(calls.map(call => call[0]), ['start', 'attempt', 'token']);
    assert.doesNotMatch(JSON.stringify(result), /synthetic-password|fresh-signed-token/u);
});

test('a refreshed token without completed factor verification is never certified', async () => {
    const { flow, certified, calls } = fixture({ verification: {
        async attemptFirstFactorVerification() {
            calls.push(['attempt-incomplete']);
            return { ...this, status: 'needs_first_factor' };
        }
    } });
    await flow.begin();
    await assert.rejects(flow.complete('000000'), error => error.code === 'REVERIFICATION_INCOMPLETE');
    assert.deepEqual(certified, []);
    assert.equal(calls.some(call => call[0] === 'token'), false);
});

test('backend refusal remains fail-closed even after Clerk completes the factor', async () => {
    const { flow } = fixture({ summary: { backendReady: true, requiresReauthentication: true } });
    await flow.begin();
    await assert.rejects(flow.complete('123456'), error => error.code === 'REVERIFICATION_NOT_CONFIRMED');
});

test('identity or session changes invalidate the in-memory challenge before certification', async () => {
    const { auth, flow, certified, verification } = fixture();
    await flow.begin();
    verification.attemptFirstFactorVerification = async () => {
        auth.clerk.session = { ...auth.clerk.session, id: 'session_b' };
        return { ...verification, status: 'complete' };
    };
    await assert.rejects(flow.complete('123456'), error => error.code === 'REVERIFICATION_IDENTITY_CHANGED');
    assert.deepEqual(certified, []);
});

test('a revoked session cannot reuse factor evidence or reach backend certification', async () => {
    const { auth, flow, certified, verification } = fixture();
    await flow.begin();
    verification.attemptFirstFactorVerification = async () => {
        auth.isSignedIn = false;
        auth.clerk.session = null;
        return { ...verification, status: 'complete' };
    };
    await assert.rejects(flow.complete('123456'), error => error.code === 'REVERIFICATION_SESSION_UNAVAILABLE');
    assert.deepEqual(certified, []);
});

test('cancel during an outstanding Clerk request invalidates late completion', async () => {
    let release;
    const waiting = new Promise(resolve => { release = resolve; });
    const { flow } = fixture({ session: {
        async startVerification() { return waiting; }
    } });
    const started = flow.begin();
    flow.cancel();
    release({ status: 'needs_first_factor', supportedFirstFactors: [] });
    await assert.rejects(started, error => error.code === 'REVERIFICATION_CANCELED');
});

test('duplicate clicks and unsupported factors fail closed without parallel attempts', async () => {
    let release;
    const waiting = new Promise(resolve => { release = resolve; });
    const pending = fixture({ session: { async startVerification() { return waiting; } } });
    const first = pending.flow.begin();
    await assert.rejects(pending.flow.begin(), error => error.code === 'REVERIFICATION_IN_PROGRESS');
    pending.flow.cancel();
    release({ status: 'needs_first_factor', supportedFirstFactors: [] });
    await assert.rejects(first, error => error.code === 'REVERIFICATION_CANCELED');

    const unsupported = fixture({ verification: {
        supportedFirstFactors: [{ strategy: 'passkey' }]
    } });
    await assert.rejects(unsupported.flow.begin(), error => error.code === 'REVERIFICATION_METHOD_UNAVAILABLE');
});
