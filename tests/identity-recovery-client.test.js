import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../js/identity-recovery.js', import.meta.url), 'utf8');
const legacyOrigin = 'https://caissa-online-native-v1-validation-26a830.vercel.app';
const productionOrigin = 'https://www.caissa-chess.org';
const opaqueState = 'v1.canonical-iv.canonical-cipher.canonical-tag';
const proofReceipt = 'r1.canonical-iv.canonical-cipher.canonical-tag';

function clientHarness({
    origin = legacyOrigin,
    signedIn = true,
    responseStatus = 201,
    openerAvailable = true
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
        hash: '#handoff=' + encodeURIComponent(opaqueState)
    };
    const context = {
        URL,
        URLSearchParams,
        Promise,
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
            CAISSA_AUTH: {
                isLoaded: true,
                isSignedIn: signedIn,
                getToken: async () => 'synthetic-legacy-jwt',
                redirectToSignIn: value => navigations.push('signin:' + value)
            }
        }
    };
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

test('legacy client scrubs the fragment, proves once, and posts the receipt only to its Production opener', async () => {
    const run = clientHarness();
    assert.equal(run.storage.size, 1);
    await run.nodes.get('identity-recovery-continue').listeners.click();
    await run.settle();
    assert.equal(run.storage.size, 0);
    assert.equal(run.calls.length, 1);
    assert.equal(run.calls[0].url, productionOrigin + '/api/user/identity-migration/owner/prove');
    assert.equal(run.calls[0].options.credentials, 'omit');
    assert.equal(JSON.parse(run.calls[0].options.body).handoffState, opaqueState);
    assert.equal(JSON.stringify(run.messages), JSON.stringify([{
        data: { type: 'caissa:sec005-owner-proof:v1', proofReceipt },
        targetOrigin: productionOrigin
    }]));
    assert.equal(run.window.closedByScript, true);
    assert.deepEqual(run.navigations, []);
});

test('a transferred handoff opened without the Production opener fails closed before authentication or proof', async () => {
    const run = clientHarness({ openerAvailable: false });
    assert.equal(run.nodes.get('identity-recovery-continue').hidden, true);
    assert.match(run.nodes.get('identity-recovery-status').textContent, /not opened by CAISSA Production/);
    assert.equal(run.calls.length, 0);
    assert.equal(run.messages.length, 0);
});

test('legacy proof is unavailable from any unpinned deployment origin', async () => {
    const run = clientHarness({ origin: 'https://attacker.invalid' });
    assert.equal(run.nodes.get('identity-recovery-continue').hidden, true);
    assert.match(run.nodes.get('identity-recovery-status').textContent, /unavailable on this deployment/);
    assert.equal(run.calls.length, 0);
});

test('signed-out legacy session redirects only after the owner action and retains opaque state', async () => {
    const run = clientHarness({ signedIn: false });
    assert.deepEqual(run.navigations, []);
    await run.nodes.get('identity-recovery-continue').listeners.click();
    await run.settle();
    assert.deepEqual(run.navigations, ['signin:/identity-recovery']);
    assert.equal(run.calls.length, 0);
    assert.equal(run.storage.size, 1);
});

test('an ambiguous proof is single-attempt and removes the opaque state before reporting failure', async () => {
    const run = clientHarness({ responseStatus: 503 });
    await run.nodes.get('identity-recovery-continue').listeners.click();
    await run.settle();
    assert.equal(run.calls.length, 1);
    assert.equal(run.storage.size, 0);
    assert.equal(run.nodes.get('identity-recovery-continue').hidden, true);
    assert.match(run.nodes.get('identity-recovery-status').textContent, /do not retry/i);
    assert.equal(run.messages.length, 0);
});

test('closing the Production opener before proof delivery prevents the receipt from leaving the legacy window', async () => {
    const run = clientHarness();
    run.opener.closed = true;
    await run.nodes.get('identity-recovery-continue').listeners.click();
    await run.settle();
    assert.equal(run.calls.length, 0);
    assert.equal(run.messages.length, 0);
    assert.match(run.nodes.get('identity-recovery-status').textContent, /not opened by CAISSA Production/);
});
