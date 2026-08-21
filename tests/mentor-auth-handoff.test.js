import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../llm-provider.js', import.meta.url), 'utf8');

function loadProvider({ token, status = 200, code = null }) {
    const calls = [];
    const auth = {
        isLoaded: true,
        isSignedIn: Boolean(token),
        whenReady: async () => auth,
        getToken: async () => token
    };
    const response = {
        ok: status >= 200 && status < 300,
        status,
        statusText: status === 401 ? 'Unauthorized' : 'OK',
        headers: { get: () => null },
        json: async () => status === 200
            ? ({ choices: [{ message: { content: 'bounded test response' } }], usage: null })
            : ({ code, error: 'Authentication required.' })
    };
    const context = {
        module: { exports: {} }, console,
        window: {
            location: { origin: 'https://caissa.test' },
            CAISSA_AUTH: auth,
            CaissaFeatureFlags: { isEnabled: () => false },
            crypto: { randomUUID: () => '00000000-0000-4000-8000-000000000001' },
            addEventListener() {}
        },
        fetch: async (...args) => { calls.push(args); return response; }
    };
    vm.runInNewContext(source, context);
    return { provider: context.module.exports, calls };
}

test('authenticated Shared Mentor request awaits auth and attaches a current bearer token', async () => {
    const { provider, calls } = loadProvider({ token: 'test-current-session-token' });
    await provider.chat([{ role: 'user', content: 'test' }]);
    assert.equal(calls.length, 1);
    assert.equal(calls[0][1].headers.Authorization, 'Bearer test-current-session-token');
});

test('anonymous Shared Mentor request fabricates no token and receives bounded sign-in UX', async () => {
    const { provider, calls } = loadProvider({ token: null, status: 401, code: 'AUTH_REQUIRED' });
    await assert.rejects(provider.chat([{ role: 'user', content: 'test' }]), /Sign in required/);
    assert.equal(calls.length, 1);
    assert.equal('Authorization' in calls[0][1].headers, false);
});

test('expired authenticated session receives bounded refresh UX without token disclosure', async () => {
    const { provider } = loadProvider({ token: 'expired-test-token', status: 401, code: 'INVALID_TOKEN' });
    await assert.rejects(provider.chat([{ role: 'user', content: 'test' }]), error => {
        assert.match(error.message, /session needs to be refreshed/i);
        assert.doesNotMatch(error.message, /expired-test-token|Bearer/);
        return true;
    });
});
