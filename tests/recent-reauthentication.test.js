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
        ...overrides.verification
    };
    const session = {
        id: 'session_a',
        async startVerification(options) {
            calls.push(['start', options]);
            return verification;
        },
        async prepareFirstFactorVerification(options) {
            calls.push(['prepare', options]);
            return verification;
        },
        async attemptFirstFactorVerification(options) {
            calls.push(['attempt', options]);
            return { ...verification, status: 'complete' };
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
    const { flow, calls, certified, verification } = fixture();
    assert.equal('prepareFirstFactorVerification' in verification, false);
    assert.equal('attemptFirstFactorVerification' in verification, false);
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

test('phone-code step-up prepares the exact phone identifier on Session', async () => {
    const { flow, calls } = fixture({ verification: {
        supportedFirstFactors: [{
            strategy: 'phone_code', phoneNumberId: 'phone_1', safeIdentifier: '+1 *** 0199', primary: true
        }]
    } });
    assert.deepEqual(await flow.begin(), {
        status: 'needs_code', strategy: 'phone_code', destination: '+1 *** 0199'
    });
    await flow.complete('654321');
    assert.deepEqual(calls.slice(0, 3), [
        ['start', { level: 'first_factor' }],
        ['prepare', { strategy: 'phone_code', phoneNumberId: 'phone_1' }],
        ['attempt', { strategy: 'phone_code', code: '654321' }]
    ]);
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
    const { flow, certified, calls } = fixture({ session: {
        async attemptFirstFactorVerification() {
            calls.push(['attempt-incomplete']);
            return { status: 'needs_first_factor' };
        }
    } });
    await flow.begin();
    await assert.rejects(flow.complete('000000'), error => error.code === 'REVERIFICATION_INCOMPLETE');
    assert.deepEqual(certified, []);
    assert.equal(calls.some(call => call[0] === 'token'), false);
});

test('an already-complete Session Verification skips factor methods but still requires certification', async () => {
    const { flow, calls, certified } = fixture({ verification: {
        status: 'complete', supportedFirstFactors: null
    }, session: {
        prepareFirstFactorVerification: undefined,
        attemptFirstFactorVerification: undefined
    } });
    assert.equal((await flow.begin()).status, 'complete');
    assert.deepEqual(calls, [
        ['start', { level: 'first_factor' }],
        ['token', { skipCache: true }]
    ]);
    assert.deepEqual(certified, ['fresh-signed-token']);
});

test('missing Session factor methods fail as unavailable and never fall back to Session Verification methods', async () => {
    let wrongObjectCalls = 0;
    const email = fixture({
        verification: {
            prepareFirstFactorVerification() { wrongObjectCalls += 1; },
            attemptFirstFactorVerification() { wrongObjectCalls += 1; }
        },
        session: { prepareFirstFactorVerification: undefined }
    });
    await assert.rejects(email.flow.begin(), error => error.code === 'REVERIFICATION_METHOD_UNAVAILABLE');
    assert.equal(wrongObjectCalls, 0);

    const password = fixture({
        verification: { supportedFirstFactors: [{ strategy: 'password' }] },
        session: { attemptFirstFactorVerification: undefined }
    });
    await assert.rejects(password.flow.begin(), error => error.code === 'REVERIFICATION_METHOD_UNAVAILABLE');
});

test('an invalid code can be retried without certifying the failed attempt', async () => {
    let attempts = 0;
    const setup = fixture({ session: {
        async attemptFirstFactorVerification(options) {
            setup.calls.push(['attempt', options]);
            attempts += 1;
            if (attempts === 1) throw Object.assign(new Error('invalid code'), { code: 'form_code_incorrect' });
            return { status: 'complete' };
        }
    } });
    await setup.flow.begin();
    await assert.rejects(setup.flow.complete('000000'), error => error.code === 'REVERIFICATION_FAILED');
    assert.deepEqual(setup.certified, []);
    assert.equal((await setup.flow.complete('123456')).status, 'complete');
    assert.equal(attempts, 2);
});

test('backend refusal remains fail-closed even after Clerk completes the factor', async () => {
    const { flow } = fixture({ summary: { backendReady: true, requiresReauthentication: true } });
    await flow.begin();
    await assert.rejects(flow.complete('123456'), error => (
        error.code === 'REVERIFICATION_NOT_CONFIRMED' && error.restartRequired === true
    ));
});

test('post-factor token failure requires an immediate clean restart', async () => {
    const { flow } = fixture({ session: { async getToken() { return null; } } });
    await flow.begin();
    await assert.rejects(flow.complete('123456'), error => (
        error.code === 'REVERIFICATION_TOKEN_UNAVAILABLE' && error.restartRequired === true
    ));
    await assert.rejects(flow.complete('123456'), error => error.code === 'REVERIFICATION_NOT_STARTED');
    assert.equal((await flow.begin()).status, 'needs_code');
});

test('identity or session changes invalidate the in-memory challenge before certification', async () => {
    const { auth, flow, certified, verification, session } = fixture();
    await flow.begin();
    session.attemptFirstFactorVerification = async () => {
        auth.clerk.session = { ...auth.clerk.session, id: 'session_b' };
        return { ...verification, status: 'complete' };
    };
    await assert.rejects(flow.complete('123456'), error => error.code === 'REVERIFICATION_IDENTITY_CHANGED');
    assert.deepEqual(certified, []);
});

test('a user change invalidates the challenge even when the Session ID is unchanged', async () => {
    const { auth, flow, certified, verification, session } = fixture();
    await flow.begin();
    session.attemptFirstFactorVerification = async () => {
        auth.userId = 'user_b';
        return { ...verification, status: 'complete' };
    };
    await assert.rejects(flow.complete('123456'), error => error.code === 'REVERIFICATION_IDENTITY_CHANGED');
    assert.deepEqual(certified, []);
});

test('a revoked session cannot reuse factor evidence or reach backend certification', async () => {
    const { auth, flow, certified, verification, session } = fixture();
    await flow.begin();
    session.attemptFirstFactorVerification = async () => {
        auth.isSignedIn = false;
        auth.clerk.session = null;
        return { ...verification, status: 'complete' };
    };
    await assert.rejects(flow.complete('123456'), error => error.code === 'REVERIFICATION_SESSION_UNAVAILABLE');
    assert.deepEqual(certified, []);
});

test('duplicate submissions produce only one factor attempt', async () => {
    let release;
    const waiting = new Promise(resolve => { release = resolve; });
    const setup = fixture({ session: {
        async attemptFirstFactorVerification(options) {
            setup.calls.push(['attempt', options]);
            return waiting;
        }
    } });
    await setup.flow.begin();
    const first = setup.flow.complete('123456');
    await assert.rejects(setup.flow.complete('123456'), error => error.code === 'REVERIFICATION_IN_PROGRESS');
    release({ status: 'complete' });
    assert.equal((await first).status, 'complete');
    assert.equal(setup.calls.filter(call => call[0] === 'attempt').length, 1);
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
