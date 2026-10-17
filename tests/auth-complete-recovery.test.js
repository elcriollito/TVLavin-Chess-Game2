import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';

const source = fs.readFileSync(new URL('../js/auth-complete.js', import.meta.url), 'utf8');
const channelSource = fs.readFileSync(new URL('../js/identity-recovery-channel.js', import.meta.url), 'utf8');
const legacyOrigin = 'https://caissa-online-native-v1-validation-26a830.vercel.app';
const productionOrigin = 'https://www.caissa-chess.org';
const handoffUrl = legacyOrigin + '/identity-recovery#handoff=v1.iv.cipher.tag';
const proofReceipt = 'r1.iv.cipher.tag';

function response(status, body) {
    return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function harness({
    search = '?redirect_url=%2Fpuzzles',
    responses = [],
    popupAvailable = true,
    popupNavigationFails = false,
    runtimeOrigin = productionOrigin,
    handoffOrigins = { productionOrigin, legacyOrigin }
} = {}) {
    const nodes = new Map(['account-setup-status', 'account-setup-retry', 'account-setup-recover', 'account-setup-recovery-note']
        .map(id => [id, {
            id, hidden: id !== 'account-setup-status', disabled: false, textContent: '', listeners: {},
            addEventListener(type, fn) { this.listeners[type] = fn; },
            focus() { this.focused = true; }
        }]));
    const calls = [];
    const navigations = [];
    const popupNavigations = [];
    const listeners = new Map();
    const channels = [];
    const channelMessages = [];
    class FakeBroadcastChannel {
        constructor(name) { this.name = name; this.closed = false; channels.push(this); }
        postMessage(data) { channelMessages.push(data); }
        close() { this.closed = true; }
        emit(data) { this.onmessage?.({ data }); }
    }
    const popup = {
        closed: false,
        location: { replace(value) {
            if (popupNavigationFails) throw new Error('synthetic navigation failure');
            popupNavigations.push(value);
        } },
        close() { this.closed = true; }
    };
    let nextTimer = 1;
    const context = {
        URL,
        URLSearchParams,
        Set,
        Error,
        Promise,
        Date,
        Object,
        Array,
        Number,
        TextEncoder,
        Uint8Array,
        crypto: webcrypto,
        btoa: value => Buffer.from(value, 'binary').toString('base64'),
        BroadcastChannel: FakeBroadcastChannel,
        document: { getElementById: id => nodes.get(id) || null },
        fetch: async (url, options) => {
            calls.push({ url, options });
            const next = responses.shift();
            if (next instanceof Error) throw next;
            return next || response(500, {});
        },
        setTimeout(fn, ms = 0) {
            const id = nextTimer++;
            if (ms <= 2000) queueMicrotask(fn);
            return id;
        },
        clearTimeout() {},
        setInterval() { return nextTimer++; },
        clearInterval() {},
        window: {
            location: {
                origin: runtimeOrigin,
                search,
                replace(value) { navigations.push({ type: 'replace', value }); },
                assign(value) { navigations.push({ type: 'assign', value }); }
            },
            CAISSA_AUTH_CONFIG: {
                IDENTITY_OWNER_HANDOFF: handoffOrigins
            },
            CAISSA_AUTH_CONFIG_READY: Promise.resolve(),
            open() { return popupAvailable ? popup : null; },
            addEventListener(type, fn) {
                const group = listeners.get(type) || new Set();
                group.add(fn);
                listeners.set(type, group);
            },
            removeEventListener(type, fn) { listeners.get(type)?.delete(fn); },
            CAISSA_REDIRECTS: { sanitizeInternalRedirect: value => value || '/play' },
            CAISSA_AUTH: { isLoaded: true, isSignedIn: true, getToken: async () => 'synthetic-token' }
        }
    };
    vm.runInNewContext(channelSource, context);
    vm.runInNewContext(source, context);
    return {
        nodes,
        calls,
        navigations,
        popup,
        window: context.window,
        popupNavigations,
        channels,
        channelMessages,
        emitMessage(origin, sourceWindow, data) {
            for (const listener of listeners.get('message') || []) {
                listener({ origin, source: sourceWindow, data });
            }
        },
        settle: () => new Promise(resolve => setImmediate(resolve)),
        async waitForChannel() {
            for (let index = 0; index < 50 && channels.length === 0; index += 1) {
                await new Promise(resolve => setImmediate(resolve));
            }
            return channels[0];
        }
    };
}

test('identity 409 is not retried and exposes explicit secure recovery', async () => {
    const run = harness({ responses: [response(409, { code: 'IDENTITY_RESOLUTION_REQUIRED' })] });
    await run.settle();
    assert.equal(run.calls.length, 1);
    assert.equal(run.calls[0].url, '/api/user/sync');
    assert.equal(run.nodes.get('account-setup-recover').hidden, false);
    assert.equal(run.nodes.get('account-setup-retry').hidden, true);
    assert.match(run.nodes.get('account-setup-status').textContent, /not yet linked/);
});

test('only transient failures receive bounded automatic retries', async () => {
    const run = harness({ responses: [response(503, {}), response(503, {}), response(503, {})] });
    await run.settle();
    await run.settle();
    assert.equal(run.calls.length, 3);
    assert.equal(run.nodes.get('account-setup-retry').hidden, false);
    assert.equal(run.nodes.get('account-setup-recover').hidden, true);
});

test('recovery uses one popup, ignores foreign channel traffic, completes with the exact receipt, and syncs once', async () => {
    const run = harness({ responses: [
        response(409, { code: 'IDENTITY_RESOLUTION_REQUIRED' }),
        response(201, { handoffUrl, expiresAt: new Date(Date.now() + 600_000).toISOString() }),
        response(200, { migrated: true }),
        response(200, { user: {} })
    ] });
    await run.settle();
    const recovery = run.nodes.get('account-setup-recover').listeners.click();
    const channel = await run.waitForChannel();
    assert.deepEqual(run.popupNavigations, [handoffUrl]);
    assert.equal(run.calls.length, 2);
    const channelId = channel.name.split(':').at(-1);
    run.popup.closed = true;
    channel.emit({ type: 'attacker-noise', channelId, proofReceipt });
    channel.emit({ type: 'caissa:sec005-owner-proof-ready:v2', channelId: 'x'.repeat(43) });
    await run.settle();
    assert.equal(run.calls.length, 2);
    channel.emit({ type: 'caissa:sec005-owner-proof-ready:v2', channelId });
    assert.ok(run.channelMessages.some(message => message.type === 'caissa:sec005-owner-proof-request:v2'));
    channel.emit({ type: 'caissa:sec005-owner-proof:v2', channelId, proofReceipt });
    await recovery;
    assert.deepEqual(run.calls.map(call => call.url), [
        '/api/user/sync',
        '/api/user/identity-migration/owner/start',
        '/api/user/identity-migration/owner/complete',
        '/api/user/sync'
    ]);
    assert.deepEqual(JSON.parse(run.calls[2].options.body), { proofReceipt });
    assert.equal(run.popup.closed, true);
    assert.ok(run.channelMessages.some(message => message.type === 'caissa:sec005-owner-proof-ack:v2'));
    assert.deepEqual(run.navigations, [{ type: 'replace', value: '/puzzles' }]);
});

test('a blocked popup prevents creation of any owner handoff', async () => {
    const run = harness({
        popupAvailable: false,
        responses: [response(409, { code: 'IDENTITY_RESOLUTION_REQUIRED' })]
    });
    await run.settle();
    await run.nodes.get('account-setup-recover').listeners.click();
    assert.equal(run.calls.length, 1);
    assert.match(run.nodes.get('account-setup-status').textContent, /Allow the secure verification window/);
});

test('a failed popup navigation disposes the ephemeral receiver without completing recovery', async () => {
    const run = harness({
        popupNavigationFails: true,
        responses: [
            response(409, { code: 'IDENTITY_RESOLUTION_REQUIRED' }),
            response(201, { handoffUrl, expiresAt: new Date(Date.now() + 600_000).toISOString() })
        ]
    });
    await run.settle();
    await run.nodes.get('account-setup-recover').listeners.click();
    await run.waitForChannel();
    assert.equal(run.channels[0].closed, true);
    assert.deepEqual(run.calls.map(call => call.url), [
        '/api/user/sync',
        '/api/user/identity-migration/owner/start'
    ]);
});

test('legacy navigation query cannot invoke completion without a channel-delivered receipt', async () => {
    const run = harness({
        search: '?identity_recovery=complete&redirect_url=%2Fpuzzles',
        responses: [response(409, { code: 'IDENTITY_MIGRATION_REQUIRED' })]
    });
    await run.settle();
    assert.deepEqual(run.calls.map(call => call.url), ['/api/user/sync']);
    assert.equal(run.nodes.get('account-setup-recover').hidden, false);
});

test('an ambiguous activation is submitted once and never shown as a retryable connection error', async () => {
    const run = harness({ responses: [
        response(409, { code: 'IDENTITY_RESOLUTION_REQUIRED' }),
        response(201, { handoffUrl, expiresAt: new Date(Date.now() + 600_000).toISOString() }),
        response(503, {})
    ] });
    await run.settle();
    const recovery = run.nodes.get('account-setup-recover').listeners.click();
    const channel = await run.waitForChannel();
    const channelId = channel.name.split(':').at(-1);
    channel.emit({ type: 'caissa:sec005-owner-proof-ready:v2', channelId });
    channel.emit({ type: 'caissa:sec005-owner-proof:v2', channelId, proofReceipt });
    await recovery;
    assert.deepEqual(run.calls.map(call => call.url), [
        '/api/user/sync',
        '/api/user/identity-migration/owner/start',
        '/api/user/identity-migration/owner/complete'
    ]);
    assert.equal(run.nodes.get('account-setup-retry').hidden, true);
    assert.match(run.nodes.get('account-setup-status').textContent, /Do not retry/);
});

test('configured origins replace deployment aliases without weakening channel isolation', async () => {
    const replacement = 'https://replacement-validation.example.test';
    const replacementUrl = replacement + '/identity-recovery#handoff=v1.iv.cipher.tag';
    const run = harness({
        handoffOrigins: { productionOrigin, legacyOrigin: replacement },
        responses: [
            response(409, { code: 'IDENTITY_RESOLUTION_REQUIRED' }),
            response(201, { handoffUrl: replacementUrl, expiresAt: new Date(Date.now() + 600_000).toISOString() }),
            response(200, { migrated: true }),
            response(200, { user: {} })
        ]
    });
    await run.settle();
    const recovery = run.nodes.get('account-setup-recover').listeners.click();
    const channel = await run.waitForChannel();
    assert.deepEqual(run.popupNavigations, [replacementUrl]);
    const channelId = channel.name.split(':').at(-1);
    channel.emit({ type: 'caissa:sec005-owner-proof-ready:v2', channelId });
    channel.emit({ type: 'caissa:sec005-owner-proof:v2', channelId: 'x'.repeat(43), proofReceipt });
    await run.settle();
    assert.equal(run.calls.length, 2);
    channel.emit({ type: 'caissa:sec005-owner-proof:v2', channelId, proofReceipt });
    await recovery;
    assert.deepEqual(run.calls.map(call => call.url), [
        '/api/user/sync',
        '/api/user/identity-migration/owner/start',
        '/api/user/identity-migration/owner/complete',
        '/api/user/sync'
    ]);
});

test('missing or mismatched public origin metadata fails closed before owner start', async () => {
    const run = harness({
        handoffOrigins: { productionOrigin: 'https://wrong-production.example.test', legacyOrigin },
        responses: [response(409, { code: 'IDENTITY_RESOLUTION_REQUIRED' })]
    });
    await run.settle();
    await run.nodes.get('account-setup-recover').listeners.click();
    assert.deepEqual(run.calls.map(call => call.url), ['/api/user/sync']);
    assert.equal(run.popup.closed, true);
    assert.equal(run.nodes.get('account-setup-recover').disabled, true);
});

test('a pending challenge without its state cookie reports expiry and offers no blind restart loop', async () => {
    const expiresAt = new Date(Date.now() + 300_000).toISOString();
    const run = harness({ responses: [
        response(409, { code: 'IDENTITY_MIGRATION_REQUIRED' }),
        response(409, { code: 'IDENTITY_RECOVERY_PENDING', expiresAt })
    ] });
    await run.settle();
    await run.nodes.get('account-setup-recover').listeners.click();
    assert.deepEqual(run.calls.map(call => call.url), [
        '/api/user/sync',
        '/api/user/identity-migration/owner/start'
    ]);
    assert.equal(run.nodes.get('account-setup-recover').hidden, true);
    assert.match(run.nodes.get('account-setup-status').textContent, /previous secure verification is still pending/i);
});
