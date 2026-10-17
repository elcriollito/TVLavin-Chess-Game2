import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../js/identity-recovery-return.js', import.meta.url), 'utf8');
const channelSource = fs.readFileSync(new URL('../js/identity-recovery-channel.js', import.meta.url), 'utf8');
const channelId = 'a'.repeat(43);
const proofReceipt = 'r1.iv.cipher.tag';
const NOW = Date.parse('2030-01-01T00:00:00.000Z');

function harness({
    now = NOW,
    expiresAt = new Date(NOW + 10 * 60 * 1000).toISOString(),
    hash = null
} = {}) {
    const messages = [];
    const channels = [];
    const timers = new Map();
    const listeners = new Map();
    let nextTimer = 1;
    let clock = now;
    const callbackHash = hash ?? `#channel=${channelId}&proofReceipt=${proofReceipt}&expiresAt=${encodeURIComponent(expiresAt)}`;
    class FakeDate extends Date {
        static now() { return clock; }
    }
    class FakeBroadcastChannel {
        constructor(name) { this.name = name; this.closed = false; channels.push(this); }
        postMessage(data) { messages.push(data); }
        close() { this.closed = true; }
        emit(data) { this.onmessage?.({ data }); }
    }
    const status = { textContent: '' };
    const location = { hash: callbackHash, pathname: '/identity-recovery/return' };
    const window = {
        location,
        closedByScript: false,
        history: { replaceState(_state, _title, value) { location.hash = ''; location.pathname = value; } },
        close() { this.closedByScript = true; },
        addEventListener(type, fn) { listeners.set(type, fn); }
    };
    const context = {
        window,
        document: { getElementById: () => status },
        URLSearchParams,
        Object,
        Array,
        BroadcastChannel: FakeBroadcastChannel,
        Date: FakeDate,
        Math,
        setInterval(fn, delay) { const id = nextTimer++; timers.set(id, { fn, due: clock + delay, interval: delay }); return id; },
        clearInterval(id) { timers.delete(id); },
        setTimeout(fn, delay) { const id = nextTimer++; timers.set(id, { fn, due: clock + delay, interval: 0 }); return id; },
        clearTimeout(id) { timers.delete(id); }
    };
    window.CAISSA_IDENTITY_RECOVERY_CHANNEL = {
        TYPES: {
            ready: 'caissa:sec005-owner-proof-ready:v2',
            request: 'caissa:sec005-owner-proof-request:v2',
            proof: 'caissa:sec005-owner-proof:v2',
            acknowledged: 'caissa:sec005-owner-proof-ack:v2'
        },
        channelName: value => `caissa:sec005-owner-proof:v2:${value}`,
        validChannelId: value => /^[A-Za-z0-9_-]{43}$/.test(value),
        validProofReceipt: value => /^r1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value)
    };
    vm.runInNewContext(source, context);
    return {
        channels, listeners, location, messages, status, timers, window,
        suspendFor(ms) { clock += ms; },
        runDueTimers() {
            for (const [id, timer] of [...timers]) {
                if (timer.due > clock) continue;
                if (timer.interval) timer.due = clock + timer.interval;
                else timers.delete(id);
                timer.fn();
            }
        }
    };
}

test('return callback scrubs its fragment before the one-use channel handshake', () => {
    const run = harness();
    assert.equal(run.location.hash, '');
    assert.equal(run.channels.length, 1);
    assert.equal(run.channels[0].name, `caissa:sec005-owner-proof:v2:${channelId}`);
    assert.deepEqual(JSON.parse(JSON.stringify(run.messages)), [{
        type: 'caissa:sec005-owner-proof-ready:v2', channelId
    }]);

    run.channels[0].emit({ type: 'caissa:sec005-owner-proof-request:v2', channelId });
    assert.deepEqual(JSON.parse(JSON.stringify(run.messages.at(-1))), {
        type: 'caissa:sec005-owner-proof:v2', channelId, proofReceipt
    });
    run.channels[0].emit({ type: 'caissa:sec005-owner-proof-ack:v2', channelId });
    assert.equal(run.channels[0].closed, true);
    assert.equal(run.window.closedByScript, true);
    assert.equal(run.timers.size, 0);
    const count = run.messages.length;
    run.channels[0].emit({ type: 'caissa:sec005-owner-proof-request:v2', channelId });
    assert.equal(run.messages.length, count);
});

test('return callback survives more than 15 seconds of Production suspension before handoff expiry', () => {
    const run = harness({ expiresAt: new Date(NOW + 2 * 60 * 1000).toISOString() });
    run.suspendFor(20_000);
    run.runDueTimers();
    assert.equal(run.channels[0].closed, false);
    run.channels[0].emit({ type: 'caissa:sec005-owner-proof-request:v2', channelId });
    assert.deepEqual(JSON.parse(JSON.stringify(run.messages.at(-1))), {
        type: 'caissa:sec005-owner-proof:v2', channelId, proofReceipt
    });
});

test('return callback fails closed when suspension passes the handoff expiry', () => {
    const run = harness({ expiresAt: new Date(NOW + 30_000).toISOString() });
    run.suspendFor(31_000);
    const count = run.messages.length;
    run.channels[0].emit({ type: 'caissa:sec005-owner-proof-request:v2', channelId });
    assert.equal(run.channels[0].closed, true);
    assert.equal(run.timers.size, 0);
    assert.match(run.status.textContent, /could not be returned/);
    assert.equal(run.messages.length, count);
    run.runDueTimers();
    run.channels[0].emit({ type: 'caissa:sec005-owner-proof-request:v2', channelId });
    assert.equal(run.messages.length, count);
});

test('page closure disposes the receipt channel, timers, and late messages', () => {
    const run = harness();
    run.listeners.get('pagehide')();
    assert.equal(run.channels[0].closed, true);
    assert.equal(run.timers.size, 0);
    const count = run.messages.length;
    run.channels[0].emit({ type: 'caissa:sec005-owner-proof-request:v2', channelId });
    assert.equal(run.messages.length, count);
});

test('return callback ignores foreign channel messages and fails closed for malformed fragments', () => {
    const run = harness();
    run.channels[0].emit({ type: 'caissa:sec005-owner-proof-request:v2', channelId: 'b'.repeat(43) });
    assert.equal(run.messages.length, 1);

    for (const hash of [
        '#channel=short&proofReceipt=r1.iv.cipher.tag',
        `#channel=${channelId}&proofReceipt=bad`,
        `#channel=${channelId}&channel=${channelId}&proofReceipt=${proofReceipt}&expiresAt=${encodeURIComponent(new Date(NOW + 60_000).toISOString())}`,
        `#channel=${channelId}&proofReceipt=${proofReceipt}&expiresAt=${encodeURIComponent(new Date(NOW - 1).toISOString())}`,
        `#channel=${channelId}&proofReceipt=${proofReceipt}&expiresAt=${encodeURIComponent(new Date(NOW + 11 * 60 * 1000).toISOString())}`
    ]) {
        const invalid = harness({ hash });
        assert.equal(invalid.location.hash, '');
        assert.equal(invalid.channels.length, 0);
        assert.match(invalid.status.textContent, /could not be returned/);
    }
});

test('shared channel helper remains strict about opaque state, receipts, and channel identifiers', () => {
    const window = {};
    vm.runInNewContext(channelSource, {
        window,
        crypto: { subtle: {} },
        TextEncoder,
        Uint8Array,
        btoa() {}
    });
    const api = window.CAISSA_IDENTITY_RECOVERY_CHANNEL;
    assert.equal(api.validOpaqueState('v1.iv.cipher.tag'), true);
    assert.equal(api.validOpaqueState('v1.iv.cipher.tag.extra'), false);
    assert.equal(api.validProofReceipt(proofReceipt), true);
    assert.equal(api.validProofReceipt('r1.bad'), false);
    assert.equal(api.validChannelId(channelId), true);
    assert.equal(api.validChannelId('short'), false);
});

test('published recovery surfaces load the isolated callback and do not depend on WindowProxy state', () => {
    const authClient = fs.readFileSync(new URL('../js/auth-complete.js', import.meta.url), 'utf8');
    const legacyClient = fs.readFileSync(new URL('../js/identity-recovery.js', import.meta.url), 'utf8');
    const authHtml = fs.readFileSync(new URL('../auth-complete.html', import.meta.url), 'utf8');
    const legacyHtml = fs.readFileSync(new URL('../identity-recovery.html', import.meta.url), 'utf8');
    const returnHtml = fs.readFileSync(new URL('../identity-recovery-return.html', import.meta.url), 'utf8');
    const routes = JSON.parse(fs.readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));

    assert.doesNotMatch(authClient, /popup\.closed|addEventListener\(['"]message/);
    assert.doesNotMatch(legacyClient, /window\.opener|postMessage/);
    for (const html of [authHtml, legacyHtml, returnHtml]) {
        assert.match(html, /identity-recovery-channel\.js/);
    }
    assert.ok(routes.rewrites.some(route => route.source === '/identity-recovery/return'
        && route.destination === '/identity-recovery-return.html'));
});
