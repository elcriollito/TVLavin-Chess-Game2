import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';

const source = fs.readFileSync(new URL('../js/identity-recovery.js', import.meta.url), 'utf8');
const channelSource = fs.readFileSync(new URL('../js/identity-recovery-channel.js', import.meta.url), 'utf8');
const legacyOrigin = 'https://caissa-online-native-v1-validation-26a830.vercel.app';
const productionOrigin = 'https://www.caissa-chess.org';
const opaqueState = 'v1.canonical-iv.canonical-cipher.canonical-tag';
const proofReceipt = 'r1.canonical-iv.canonical-cipher.canonical-tag';

function clientHarness({
    origin = legacyOrigin,
    signedIn = true,
    responseStatus = 201,
    openerAvailable = true,
    handoffOrigins = { productionOrigin, legacyOrigin }
} = {}) {
    const storage = new Map();
    const nodes = new Map([
        ['identity-recovery-status', { textContent: '' }],
        ['identity-recovery-continue', {
            hidden: false, disabled: false, listeners: {},
            addEventListener(type, fn) { this.listeners[type] = fn; }
        }]
    ]);
    const calls = [];
    const navigations = [];
    const messages = [];
    const opener = openerAvailable ? {
        closed: false,
        postMessage(data, targetOrigin) { messages.push({ data, targetOrigin }); }
    } : null;
    const location = {
        origin,
        pathname: '/identity-recovery',
        search: '',
        hash: '#handoff=' + encodeURIComponent(opaqueState),
        replace(value) { navigations.push(value); }
    };
    const context = {
        URL,
        URLSearchParams,
        Promise,
        TextEncoder,
        Uint8Array,
        crypto: webcrypto,
        btoa: value => Buffer.from(value, 'binary').toString('base64'),
        sessionStorage: {
            getItem: key => storage.get(key) || null,
            setItem: (key, value) => storage.set(key, value),
            removeItem: key => storage.delete(key)
        },
        document: { getElementById: id => nodes.get(id) || null },
        fetch: async (url, options) => {
            calls.push({ url, options });
            return {
                ok: responseStatus >= 200 && responseStatus < 300,
                status: responseStatus,
                json: async () => responseStatus === 201 ? {
                    verified: true,
                    proofReceipt
                } : {}
            };
        },
        setTimeout(fn) { fn(); return 1; },
        clearTimeout() {},
        window: {
            location,
            opener,
            closedByScript: false,
            close() { this.closedByScript = true; },
            history: { replaceState() { location.hash = ''; } },
            addEventListener() {},
            removeEventListener() {},
            CAISSA_AUTH_CONFIG: { IDENTITY_OWNER_HANDOFF: handoffOrigins },
            CAISSA_AUTH_CONFIG_READY: Promise.resolve(),
            CAISSA_AUTH: {
                isLoaded: true,
                isSignedIn: signedIn,
                getToken: async () => 'synthetic-legacy-jwt',
                redirectToSignIn: value => navigations.push('signin:' + value)
            }
        }
    };
    vm.runInNewContext(channelSource, context);
    vm.runInNewContext(source, context);
    return {
        nodes,
        storage,
        calls,
        navigations,
        messages,
        opener,
        window: context.window,
        settle: () => new Promise(resolve => setImmediate(resolve))
    };
}

test('legacy client scrubs the fragment, proves once, and returns the receipt through a same-origin callback', async () => {
    const run = clientHarness();
    assert.equal(run.storage.size, 1);
    await run.settle();
    await run.nodes.get('identity-recovery-continue').listeners.click();
    await run.settle();
    assert.equal(run.storage.size, 0);
    assert.equal(run.calls.length, 1);
    assert.equal(run.calls[0].url, productionOrigin + '/api/user/identity-migration/owner/prove');
    assert.equal(run.calls[0].options.credentials, 'omit');
    assert.equal(JSON.parse(run.calls[0].options.body).handoffState, opaqueState);
    assert.equal(run.messages.length, 0);
    assert.equal(run.window.closedByScript, false);
    assert.equal(run.navigations.length, 1);
    const callback = new URL(run.navigations[0]);
    assert.equal(callback.origin, productionOrigin);
    assert.equal(callback.pathname, '/identity-recovery/return');
    assert.match(callback.hash, /^#channel=[A-Za-z0-9_-]{43}&proofReceipt=r1\./);
});

test('a severed WindowProxy does not block a cryptographically bound callback return', async () => {
    const run = clientHarness({ openerAvailable: false });
    await run.settle();
    assert.equal(run.nodes.get('identity-recovery-continue').hidden, false);
    await run.nodes.get('identity-recovery-continue').listeners.click();
    await run.settle();
    assert.equal(run.calls.length, 1);
    assert.equal(new URL(run.navigations[0]).pathname, '/identity-recovery/return');
    assert.equal(run.messages.length, 0);
});

test('legacy proof is unavailable from any unpinned deployment origin', async () => {
    const run = clientHarness({ origin: 'https://attacker.invalid' });
    await run.settle();
    assert.equal(run.nodes.get('identity-recovery-continue').hidden, true);
    assert.match(run.nodes.get('identity-recovery-status').textContent, /unavailable on this deployment/);
    assert.equal(run.calls.length, 0);
});

test('signed-out legacy session redirects only after the owner action and retains opaque state', async () => {
    const run = clientHarness({ signedIn: false });
    await run.settle();
    assert.deepEqual(run.navigations, []);
    await run.nodes.get('identity-recovery-continue').listeners.click();
    await run.settle();
    assert.deepEqual(run.navigations, ['signin:/identity-recovery']);
    assert.equal(run.calls.length, 0);
    assert.equal(run.storage.size, 1);
});

test('an ambiguous proof is single-attempt and removes the opaque state before reporting failure', async () => {
    const run = clientHarness({ responseStatus: 503 });
    await run.settle();
    await run.nodes.get('identity-recovery-continue').listeners.click();
    await run.settle();
    assert.equal(run.calls.length, 1);
    assert.equal(run.storage.size, 0);
    assert.equal(run.nodes.get('identity-recovery-continue').hidden, true);
    assert.match(run.nodes.get('identity-recovery-status').textContent, /do not retry/i);
    assert.equal(run.messages.length, 0);
});

test('a WindowProxy that reports closed does not create a false cancellation', async () => {
    const run = clientHarness();
    await run.settle();
    run.opener.closed = true;
    await run.nodes.get('identity-recovery-continue').listeners.click();
    await run.settle();
    assert.equal(run.calls.length, 1);
    assert.equal(run.messages.length, 0);
    assert.equal(new URL(run.navigations[0]).pathname, '/identity-recovery/return');
});

test('a certified replacement alias works only when supplied by public server metadata', async () => {
    const replacement = 'https://replacement-validation.example.test';
    const run = clientHarness({
        origin: replacement,
        handoffOrigins: { productionOrigin, legacyOrigin: replacement }
    });
    await run.settle();
    await run.nodes.get('identity-recovery-continue').listeners.click();
    await run.settle();
    assert.equal(run.calls[0].url, productionOrigin + '/api/user/identity-migration/owner/prove');
    assert.equal(new URL(run.navigations[0]).origin, productionOrigin);
});

test('mismatched or malformed public metadata fails closed without proof or authentication', async () => {
    for (const handoffOrigins of [
        { productionOrigin, legacyOrigin: 'https://wrong-validation.example.test' },
        null,
        { productionOrigin: 'http://www.caissa-chess.org', legacyOrigin }
    ]) {
        const run = clientHarness({ handoffOrigins });
        await run.settle();
        assert.equal(run.nodes.get('identity-recovery-continue').hidden, true);
        assert.equal(run.calls.length, 0);
        assert.equal(run.messages.length, 0);
    }
});

test('clients contain no pinned Production or validation deployment origins', () => {
    assert.doesNotMatch(source, /www\.caissa-chess\.org|caissa-online-native-v1-validation-26a830/);
    const productionClient = fs.readFileSync(new URL('../js/auth-complete.js', import.meta.url), 'utf8');
    assert.doesNotMatch(productionClient, /www\.caissa-chess\.org|caissa-online-native-v1-validation-26a830/);
});
