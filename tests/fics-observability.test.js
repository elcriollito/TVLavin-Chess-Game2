import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import net from 'node:net';
import tls from 'node:tls';
import http from 'node:http';
import https from 'node:https';
import dns from 'node:dns';

let networkAttempts = 0;
const denied = () => { networkAttempts += 1; throw new Error('R0_NETWORK_DENIED'); };
const originals = { netConnect: net.connect, netCreate: net.createConnection, tlsConnect: tls.connect,
    httpRequest: http.request, httpsRequest: https.request, dnsLookup: dns.lookup, fetch: globalThis.fetch, WebSocket: globalThis.WebSocket };
net.connect = denied; net.createConnection = denied; tls.connect = denied; http.request = denied; https.request = denied;
dns.lookup = denied; globalThis.fetch = denied; globalThis.WebSocket = class { constructor() { denied(); } };
process.on('exit', () => {
    net.connect = originals.netConnect; net.createConnection = originals.netCreate; tls.connect = originals.tlsConnect;
    http.request = originals.httpRequest; https.request = originals.httpsRequest; dns.lookup = originals.dnsLookup;
    globalThis.fetch = originals.fetch; globalThis.WebSocket = originals.WebSocket;
});

const observerSource = fs.readFileSync(new URL('../js/fics-observability.js', import.meta.url), 'utf8');
const clientSource = fs.readFileSync(new URL('../js/fics-client.js', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

function load(options = {}) {
    const root = {};
    vm.runInNewContext(observerSource, { globalThis: root, window: root, Object, String, Number, Math, JSON,
        TextEncoder, performance: { now: () => 1 } });
    return { root, observer: root.createClassicFicsObservability(options) };
}

test('OFF is absolute default and explicit request arms only after confirmed auth', () => {
    const { observer } = load();
    for (const frame of ['login:', 'SyntheticUser', 'password:', 'FAKE_SECRET', 'Starting FICS session as SyntheticUser\nfics%']) {
        observer.observeRawInbound(frame);
    }
    assert.equal(observer.state, 'OFF'); assert.equal(observer.snapshot().recordCount, 0);
    observer.requestActivation();
    for (const frame of ['login:', 'password:', 'Starting FICS session as SyntheticUser\nfics%']) observer.observeRawInbound(frame);
    assert.equal(observer.snapshot().recordCount, 0);
    observer.onAuthenticated(); assert.equal(observer.state, 'ARMED'); assert.equal(observer.snapshot().recordCount, 0);
    observer.observeNormalizedEvent('authenticated', { username: 'SyntheticUser' });
    assert.equal(observer.snapshot().recordCount, 0);
    observer.observeRawInbound('post-auth frame\nfics%');
    assert.equal(observer.state, 'ACTIVE'); assert.equal(observer.snapshot().recordCount, 1);
});

test('raw capture is a side copy and normalized payload is copied without sensitive/raw keys', () => {
    const { observer } = load(); const original = '<12> fixed payload';
    const runtime = { rawBuffer: 'before', lineBuffer: 'partial', liveGame: { game: 7 }, seeks: [1], tables: [2] };
    const before = JSON.stringify(runtime); observer.requestActivation(); observer.onAuthenticated(); observer.observeRawInbound(original);
    const payload = { gameNumber: 7, raw: 'discard', nested: { password: 'discard', clock: 30 } };
    observer.observeNormalizedEvent('style12', payload);
    assert.equal(original, '<12> fixed payload'); assert.equal(JSON.stringify(runtime), before); assert.equal(payload.raw, 'discard');
    const exported = JSON.parse(observer.exportCapture().json);
    assert.equal(exported.records[0].sanitizedPayload, original);
    assert.deepEqual(JSON.parse(JSON.stringify(exported.records[1].normalizedPayload)), { gameNumber: 7, nested: { clock: 30 } });
});

test('equivalent synthetic parser flow is identical with observer OFF and ACTIVE', () => {
    const run = observer => {
        const runtime = { rawBuffer: '', lineBuffer: '', parsed: [], liveGame: { gameNumber: null }, seeks: [], tables: [], events: [] };
        for (const frame of ['alpha\nbe', 'ta\n<12> unchanged']) {
            observer.observeRawInbound(String(frame));
            runtime.rawBuffer = `${runtime.rawBuffer}${frame}`.slice(-16384);
            const lines = `${runtime.lineBuffer}${frame}`.split('\n'); runtime.lineBuffer = lines.pop() || '';
            for (const line of lines) { runtime.parsed.push(line); runtime.events.push({ type: 'line', line }); }
        }
        return runtime;
    };
    const off = load().observer;
    const active = load().observer; active.requestActivation(); active.onAuthenticated();
    assert.deepEqual(run(active), run(off));
});

test('sanitizer, queue, and export exceptions fail off without escaping', () => {
    const parserCalls = [];
    const brokenSanitizer = load({ sanitizer: () => { throw new Error('synthetic'); } }).observer;
    brokenSanitizer.requestActivation(); brokenSanitizer.onAuthenticated();
    assert.doesNotThrow(() => { brokenSanitizer.observeRawInbound('frame'); parserCalls.push('frame'); });
    assert.equal(brokenSanitizer.state, 'FAILED'); assert.deepEqual(parserCalls, ['frame']);

    const brokenQueue = load({ stringify: () => { throw new Error('synthetic'); } }).observer;
    brokenQueue.requestActivation(); brokenQueue.onAuthenticated(); brokenQueue.observeRawInbound('frame');
    assert.equal(brokenQueue.state, 'FAILED');

    let calls = 0;
    const brokenExport = load({ stringify: value => { calls += 1; if (calls > 1) throw new Error('synthetic'); return JSON.stringify(value); } }).observer;
    brokenExport.requestActivation(); brokenExport.onAuthenticated(); brokenExport.observeRawInbound('frame');
    assert.deepEqual({ ...brokenExport.exportCapture() }, { ok: false, code: 'EXPORT_REJECTED' });
    assert.equal(brokenExport.state, 'FAILED');
});

test('frame, record, byte, and duration limits stop capture with bounded output', () => {
    const frameBound = load({ maxFrames: 1 }).observer; frameBound.requestActivation(); frameBound.onAuthenticated();
    frameBound.observeRawInbound('one'); frameBound.observeRawInbound('two'); assert.equal(frameBound.state, 'STOPPED');
    assert.equal(frameBound.snapshot().recordCount, 1);

    const recordBound = load({ maxRecords: 1 }).observer; recordBound.requestActivation(); recordBound.onAuthenticated();
    recordBound.observeRawInbound('one'); recordBound.observeNormalizedEvent('style12', {}); assert.equal(recordBound.state, 'STOPPED');

    const byteBound = load({ maxBytes: 128 }).observer; byteBound.requestActivation(); byteBound.onAuthenticated();
    byteBound.observeRawInbound('x'.repeat(100)); assert.equal(byteBound.state, 'STOPPED'); assert.ok(byteBound.snapshot().bytes <= 128);

    let now = 0; const durationBound = load({ clock: () => now, maxDurationMs: 5 }).observer;
    durationBound.requestActivation(); durationBound.onAuthenticated(); durationBound.observeRawInbound('one'); now = 10;
    durationBound.observeRawInbound('two'); assert.equal(durationBound.state, 'STOPPED');
});

test('default capture duration is bounded at 90 seconds without changing other limits', () => {
    const { observer } = load(); observer.requestActivation(); observer.onAuthenticated(); observer.observeRawInbound('frame');
    const limits = JSON.parse(observer.exportCapture().json).limits;
    assert.deepEqual(JSON.parse(JSON.stringify(limits)), {
        maxFrames: 256, maxRecords: 512, maxBytes: 1024 * 1024, maxDurationMs: 90_000, maxPayloadChars: 16_384
    });
});

test('hostile remote text is inert, bounded, and preserves protocol titles and ids', () => {
    const { observer } = load({ maxPayloadChars: 100 }); observer.requestActivation(); observer.onAuthenticated();
    observer.observeRawInbound('<script>alert(1)</script> Player(C) Director(TD) play 42 rating 1900\nuser tells you secret words\n' + 'x'.repeat(200));
    const text = JSON.parse(observer.exportCapture().json).records[0].sanitizedPayload;
    assert.doesNotMatch(text, /<script>/); assert.match(text, /\(C\)/); assert.match(text, /\(TD\)/); assert.match(text, /42/);
    assert.match(text, /REMOTE_TEXT_REDACTED/); assert.match(text, /TRUNCATED/); assert.ok(text.length <= 111);
});

test('disconnect is captured then stops, and export rejects auth-like data', () => {
    const { observer } = load(); observer.requestActivation(); observer.onAuthenticated(); observer.observeRawInbound('frame');
    observer.observeNormalizedEvent('disconnected', { reasonCode: 'CLOSED' }); assert.equal(observer.state, 'STOPPED');
    assert.equal(JSON.parse(observer.exportCapture().json).records.at(-1).eventType, 'disconnected');
    const rejected = load().observer; rejected.requestActivation(); rejected.onAuthenticated(); rejected.observeRawInbound('password: leaked');
    assert.equal(rejected.state, 'FAILED'); assert.equal(rejected.snapshot().recordCount, 0);
});

test('architecture is one existing WebSocket owner and observer owns no socket, parser, command, or persistence API', () => {
    const connectBody = clientSource.slice(clientSource.indexOf('connect(mode ='), clientSource.indexOf('handleConnectionFailure(reason)'));
    const gatewayTestStart = clientSource.indexOf('async testGateway()');
    const gatewayTestBody = clientSource.slice(gatewayTestStart, clientSource.indexOf('\n    disconnect()', gatewayTestStart));
    assert.equal((connectBody.match(/new WebSocket\(this\.gatewayUrl\)/g) || []).length, 1);
    assert.equal((gatewayTestBody.match(/new WebSocket\(this\.gatewayUrl\)/g) || []).length, 1);
    assert.doesNotMatch(observerSource, /new\s+WebSocket|\.send\s*\(|fetch\s*\(|XMLHttpRequest|localStorage|sessionStorage|indexedDB|sendBeacon|parseStyle12|approved-fics-transport|run-b0-live/i);
    assert.doesNotMatch(observerSource, /pendingAccountPassword|accountPassword|loginMode|testGateway/);
    assert.match(clientSource, /observeRawInbound\(String\(text\)\)/);
    assert.match(clientSource, /onAuthenticated\(\)/);
    assert.match(clientSource, /observeNormalizedEvent\(event, payload\)/);
});

test('R0 adds no research command path and loads observer before existing client', () => {
    assert.doesNotMatch(observerSource, /\b(?:who|match|seekinfo|sought|unseek|play)\b/i);
    const observerAt = html.indexOf('js/fics-observability.js'); const clientAt = html.indexOf('js/fics-client.js');
    assert.ok(observerAt > 0 && observerAt < clientAt);
    assert.doesNotMatch(clientSource, /approved-fics-transport\.mjs|run-b0-live\.mjs/);
});

test('R0 offline suite attempts no DNS, TCP, TLS, HTTP, HTTPS, fetch, or WebSocket', () => {
    assert.equal(networkAttempts, 0);
});
