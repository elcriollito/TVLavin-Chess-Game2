import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../js/auth-complete.js', import.meta.url), 'utf8');

function response(status, body) {
    return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function harness(responses = [], search = '?redirect_url=%2Fpuzzles') {
    const makeNode = id => ({
        id,
        hidden: id !== 'account-setup-status',
        disabled: false,
        value: '',
        textContent: '',
        dataset: {},
        listeners: {},
        addEventListener(type, listener) { this.listeners[type] = listener; },
        focus() { this.focused = true; }
    });
    const ids = [
        'account-setup-title', 'account-setup-status', 'account-setup-retry',
        'account-nickname-form', 'account-nickname', 'account-nickname-save',
        'account-nickname-status', 'account-nickname-skip'
    ];
    const nodes = new Map(ids.map(id => [id, makeNode(id)]));
    const spinner = makeNode('spinner');
    const calls = [];
    const navigations = [];
    let signOuts = 0;
    const listeners = new Map();
    let timer = 0;
    const context = {
        URLSearchParams,
        Promise,
        Error,
        Object,
        Array,
        Set,
        Number,
        String,
        encodeURIComponent,
        document: {
            getElementById: id => nodes.get(id) || null,
            querySelector: selector => selector === '.auth-setup-spinner' ? spinner : null,
            body: { contains: () => true }
        },
        fetch: async (url, options) => {
            calls.push({ url, options });
            const next = responses.shift();
            if (next instanceof Error) throw next;
            return next || response(500, {});
        },
        setTimeout(fn, delay = 0) {
            timer += 1;
            if (delay <= 2000) queueMicrotask(fn);
            return timer;
        },
        clearTimeout() {},
        queueMicrotask,
        window: {
            location: { search, replace(value) { navigations.push(value); } },
            CAISSA_REDIRECTS: { sanitizeInternalRedirect: value => value || '/play' },
            CAISSA_AUTH: {
                isLoaded: true,
                isSignedIn: true,
                getToken: async () => 'synthetic-token',
                signOut: async () => { signOuts += 1; }
            },
            addEventListener(type, listener) { listeners.set(type, listener); },
            removeEventListener(type) { listeners.delete(type); }
        }
    };
    vm.runInNewContext(source, context);
    return {
        nodes,
        spinner,
        calls,
        navigations,
        signOuts: () => signOuts,
        settle: async (turns = 4) => {
            for (let index = 0; index < turns; index += 1) await new Promise(resolve => setImmediate(resolve));
        }
    };
}

test('an established nickname completes without showing onboarding', async () => {
    const run = harness([
        response(200, { user: {} }),
        response(200, { identity: { hasCustomNickname: true, version: 2 } })
    ]);
    await run.settle();
    assert.deepEqual(run.calls.map(call => call.url), ['/api/user/sync', '/api/user/public-identity']);
    assert.deepEqual(run.navigations, ['/puzzles']);
    assert.equal(run.nodes.get('account-nickname-form').hidden, true);
});

test('a fresh account must choose a unique public nickname before redirect', async () => {
    const run = harness([
        response(200, { user: {} }),
        response(200, { identity: { hasCustomNickname: false, version: 1 } }),
        response(200, { available: true, normalizedNickname: 'Knight One' }),
        response(200, { identity: { hasCustomNickname: true, version: 2 } })
    ]);
    await run.settle();
    assert.equal(run.nodes.get('account-nickname-form').hidden, false);
    assert.equal(run.spinner.hidden, true);
    run.nodes.get('account-nickname').value = '  Knight   One  ';
    await run.nodes.get('account-nickname-form').listeners.submit({ preventDefault() {} });
    assert.deepEqual(run.calls.map(call => call.url), [
        '/api/user/sync',
        '/api/user/public-identity',
        '/api/user/public-identity',
        '/api/user/public-identity'
    ]);
    assert.deepEqual(JSON.parse(run.calls[2].options.body), { action: 'availability', nickname: 'Knight One' });
    assert.deepEqual(JSON.parse(run.calls[3].options.body), { nickname: 'Knight One', expectedVersion: 1 });
    assert.deepEqual(run.navigations, ['/puzzles']);
});

test('duplicate nickname remains on the form without issuing an update', async () => {
    const run = harness([
        response(200, { user: {} }),
        response(200, { identity: { hasCustomNickname: false, version: 1 } }),
        response(200, { available: false, normalizedNickname: 'Taken' })
    ]);
    await run.settle();
    run.nodes.get('account-nickname').value = 'Taken';
    await run.nodes.get('account-nickname-form').listeners.submit({ preventDefault() {} });
    assert.equal(run.calls.length, 3);
    assert.match(run.nodes.get('account-nickname-status').textContent, /unavailable/);
    assert.deepEqual(run.navigations, []);
});

test('a fresh account may keep its server-generated safe alias and choose a nickname later', async () => {
    const run = harness([
        response(200, { user: {} }),
        response(200, {
            identity: {
                displayName: 'Player-ABCDEF0123456789',
                fallbackAlias: 'Player-ABCDEF0123456789',
                hasCustomNickname: false,
                version: 1
            }
        })
    ]);
    await run.settle();
    assert.equal(run.nodes.get('account-nickname-form').hidden, false);
    await run.nodes.get('account-nickname-skip').listeners.click();
    assert.equal(run.calls.length, 2);
    assert.deepEqual(run.navigations, ['/puzzles']);
});

test('stale pre-reset sessions are signed out and returned to a fresh sign-in', async () => {
    const run = harness([response(401, { code: 'SESSION_RESET_REQUIRED' })]);
    await run.settle();
    assert.equal(run.calls.length, 1);
    assert.equal(run.signOuts(), 1);
    assert.deepEqual(run.navigations, ['/signin?redirect_url=%2Fpuzzles']);
});

test('maintenance is never retried and does not expose the nickname form', async () => {
    const run = harness([response(503, { code: 'ACCOUNT_SYSTEM_MAINTENANCE' })]);
    await run.settle();
    assert.equal(run.calls.length, 1);
    assert.match(run.nodes.get('account-setup-status').textContent, /temporarily paused/);
    assert.equal(run.nodes.get('account-nickname-form').hidden, true);
});

test('ordinary transient sync failures retain the existing bounded retry', async () => {
    const run = harness([response(503, {}), response(503, {}), response(503, {})]);
    await run.settle(8);
    assert.equal(run.calls.length, 3);
    assert.equal(run.nodes.get('account-setup-retry').hidden, false);
});
